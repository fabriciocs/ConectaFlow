# Segurança — implementação local e estado dos gates (2026-11-06)

## Escopo e rastreabilidade

- Plano de referência: `docs/SECURITY-REMEDIATION-PLAN-20261106.md`.
- Branch de integração local: `feature/security-remediation-20261106`; baseline preservado em `7d804ba`.
- Baseline publicado primeiro na branch original `feature/multi-tenant-isolation-20261103`; nenhuma alteração de produção, deploy, merge, migração ou liberação foi executada.
- Orquestração: três worktrees Codex independentes (`webhooks`, `egress`, `oauth`) foram criadas. Os três agentes terminaram com falha de quota Codex, sem alterações; a implementação segura foi continuada manualmente. Worktree adicional `deps` para atualização isolada, com histórico e evidências locais em `.remote-desktop/security-remediation-20261106` (ignorado pelo Git).
- Nenhuma credencial, arquivo `.env`, dado de sessão WhatsApp ou mídia privada foi incluído nos commits intencionalmente. Build isolado com ambiente mínimo sintético passou; varredura por sentinela sintética deu 0 ocorrências, mas a ausência de dados privados reais em builds operacionais ainda necessita prova independente.

## Tarefas e evidências

| Tarefa | Estado | Implementação e limitações |
| --- | --- | --- |
| R00 | VERIFIED | Estado Git, staged/unstaged/untracked, HEAD e upstream inspecionados; baseline versionado e publicado; worktrees isoladas |
| R01 | DEFERRED | Análise de exposição, rotação/contensão e revisão da superfície ativa dependem de operador e inventário confiável; não alterar produção sem decisão explícita |
| R02 | TESTED (parcial) | Fixtures sintéticas em `security-*.test.ts`; faltam testes de integração reais entre dois tenants, sessões e credenciais completas |
| R03 | TESTED (build isolado) | Manifesto e lock atualizados; Next.js 16.4.5, React 19.3.1, next-auth beta.32, sharp 0.35.5 e eslint-config-next 16.4.5; `npm ci --ignore-scripts`, Prisma generate, tsc, lint, 19 testes sintéticos e build Next 16.4.5 passaram no worktree com ambiente sintético; auditoria: **0 critical, 50 high, 23 moderate, 3 low**; runtime real ainda não liberado |
| R04 | TESTED (estático/unitário) | `getAuthorizedSession` e `webhookScopedWhere` em PUT/DELETE/logs/test; tenant e owner obrigatórios; `updateMany/deleteMany` conferem autorização na mutação; ainda sem simulação de banco multi-tenant integral |
| R05 | TESTED (unitário) | Serializador de webhook omite `secret` sempre e `requestHeaders` para API keys/OAuth; URL sem query; headers `Cache-Control: no-store` no PUT; acesso browser conserva contrato UI |
| R06 | TESTED (unitário) | `allowLocal` só solicita, nunca autoriza rede privada; concessão de operador server-only por tenant e URL exata; padrão fail-closed; revogação efetiva exige atualização da configuração do processo |
| R07 | TESTED (unitário) | Callback DNS pinado tratado por `all=true` (array) ou modo único (IP/família); testes IPv4/IPv6; falta teste de socket nativo integrado |
| R08 | TESTED (unitário) | OAuth com limite efetivo de **16 KiB**, leitura incremental, `Content-Length` antecipado, cancelamento do stream, timeout 15 s; quota distribuída antes do parse em token/revoke/introspect, 429 + Retry-After |
| R09 | TESTED (unitário) | Limites distribuídos antes de bcrypt, e-mail normalizado e HMAC sem email em claro na chave, limites por identidade e origem; falha do armazenamento compartilhado impede login |
| R10 | TESTED (unitário) | Multipart tem teto real de bytes do stream e limite antecipado por `Content-Length`; autorização antes da leitura. Mídia: até 64 MiB e tipos permitidos; imagem de grupo até 8 MiB, JPEG/PNG e no máximo 4096 px por dimensão; faltam testes com sessões WhatsApp |
| R11 | TESTED (estático) | Headers de proteção adicionados em Next.js (`nosniff`, Referrer-Policy, SAMEORIGIN, CSP restrita). HSTS e políticas de proxies não foram ativados sem verificar TLS, domínio e ingress real |
| R12 | BLOCKED | Procedência de binários, portas, serviços, firewall e execução em produção requerem inventário operacional controlado |
| R13 | BLOCKED (parcial) | Build isolado com fonte sem segredos reais passou; varredura completa de 2.652 arquivos e 245.805.936 bytes de `.next` encontrou **0** referências/conteúdos da sentinela sintética de mídia; isso não prova ausência de todos os dados privados reais. Testes multi-tenant, Prisma virgem, HMAC/HSTS/TLS e regressão HTTP seguem pendentes |
| R14 | DEFERRED | Backup/restore, rotação e rollback operacionais requerem ambiente de ensaio e credenciais autorizadas |
| R15 | BLOCKED — NO-GO | Segurança global não validada; proibido interpretar esta branch como liberação ou realizar merge/deploy |

## Operação do controle de egress

A variável **server-only** `WA_AKG_PRIVATE_WEBHOOK_EGRESS_ALLOWLIST_JSON` aceita uma lista JSON de concessões exatas. Exemplo **fictício, não executável sem configurar o operador**:

```json
[
  {
    "tenantId": "TENANT_ID_DE_EXEMPLO",
    "url": "http://127.0.0.1:5678/webhook/exemplo"
  }
]
```

- A URL precisa ter IP literal, protocolo HTTP/HTTPS, caminho e porta idênticos à concessão; não há wildcard, autorização por DNS dinâmico ou por query/identidade enviada pelo cliente.
- O operador define as concessões fora do frontend, depois da avaliação de risco; nunca usar `NEXT_PUBLIC_` ou expor a variável por API. Não registrar o JSON completo em logs.
- Sem concessão efetiva, webhooks persistidos com `allowLocal=true` continuam registrados, mas a entrega privada é negada. Desativar um webhook não exige apagar seu histórico. A URL e a permissão devem ser revalidadas antes de liberar o destino.
- Na mudança de configuração, revisar o estado real do processo e reiniciá-lo de forma controlada **somente com autorização operacional**. Nenhum restart foi feito nesta implementação.

## Verificação e gates

Verificações estáticas executadas no projeto original: `tsc --noEmit --incremental false`, ESLint dos arquivos e rotas afetados, `git diff --check`, testes sintéticos `tsx --test src/lib/__tests__/security-*.test.ts` e testes existentes específicos de webhook/CIMD. A atualização de dependências foi validada separadamente em worktree, sem modificar os pacotes do servidor ativo. Consulte os resultados locais em `.remote-desktop/security-remediation-20261106/agents`.

**Limitação relevante:** um teste existente de rota OAuth exercitou o limitador distribuído, que pode ter incrementado o bucket sintético de rate limit no MySQL local. Não repetir testes de rotas dependentes de banco sem sandbox/fixtures e verificação da base-alvo. Nenhuma sessão WhatsApp real foi utilizada intencionalmente.

Critérios para elevar G4/G5/G6:
1. Executar casos HTTP + banco de ensaio com usuários em dois tenants, sessão global/particular, OAuth, API key, usuário revogado e condição de corrida em mutações; confirmar ausência de leituras, writes e transporte indevidos.
2. Concluir build isolado da matriz atualizada; escanear bundle e tracing para sentinelas/mídia privada e conferir versões realmente instaladas. Revisar vulnerabilidades altas restantes e dependências transitivas.
3. Validar ingress/proxy/origem, TLS, headers e HSTS na topologia real; ensaiar DNS pinado com mock de socket antes de usar destinos reais.
4. Validar migração Prisma em banco virgem restaurável, OAuth/QR, login/MFA, integração WhatsApp e teste visual sem Playwright.
5. Exercitar backup, restauração e rollback com ensaio auditável, revisar exposição/segredos, submeter revisão independente e só então deliberar release. Nenhum gate operacional ou de produção foi aprovado.

**Resultado presente: implementação local parcial, testes estáticos e sintéticos; liberação = NO-GO.**
