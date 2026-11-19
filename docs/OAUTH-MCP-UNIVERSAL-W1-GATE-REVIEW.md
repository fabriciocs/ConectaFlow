# W1-GATE-REVIEW — reconciliação e parecer técnico

Projeto: ConectaFlow / WA-AKG
Data: 2026-11-04
Baseline: feature/multi-tenant-isolation-20261103, HEAD 86b3b0a, árvore de trabalho com modificações preexistentes.
Estado: PARTIAL — documento reconciliado e testes MCP aprovados; revisão independente BLOCKED (nenhum parecer utilizável foi produzido).
Escopo: REVISÃO DOCUMENTAL e verificações não destrutivas. Não há alterações de código funcional, banco, chaves reais ou serviços do WA-AKG.

## 1. Documento restaurado e reconciliado

Arquivo: docs/OAUTH-MCP-UNIVERSAL-W1-CONTRATOS.md
Origem da reconciliação: arquivo independente gerado no ChatGPT na etapa anterior.
Condição anterior: NOT_FOUND no Windows, verificada por get_file_info e Test-Path.
Operação: criação somente deste documento ausente com o conteúdo de origem.
Condição posterior: arquivo presente com 14.337 bytes; certutil SHA256 igual à origem.
SHA-256: 922268d7aeb5ae252c15f931528d6087399ecefefa4205d1dc5b6a6a59b3960a
Conclusão: VERIFIED, correspondência binária entre a origem disponibilizada e o arquivo Windows.
Preservação: duas alterações unstaged preexistentes em private-media e três caminhos locais de migração/backfill permaneceram presentes; nenhum staged; HEAD mantido.

## 2. Verificações realmente executadas

| ID | Comando/verificação | Resultado | Limitação |
| --- | --- | --- | --- |
| GIT-01 | git status --short, git diff --cached, git rev-parse, git worktree list | VERIFIED; checkout e arquivos existentes preservados | não equivale a teste funcional |
| W1-01 | get_file_info e Test-Path antes da escrita | CONFIRMED: W1 ausente | estado inicial |
| W1-02 | write_file da cópia disponibilizada e certutil -hashfile SHA256 | VERIFIED: 14.337 bytes e checksum idêntico | não valida requisitos funcionais |
| MCP-01 | npm run mcp:check | TESTED: exit 0, sintaxe MCP válida | somente verificação estática |
| MCP-02 | npm run mcp:test | TESTED: 8 pass, 0 fail | testes locais; não comprova HTTP OAuth externo nem vários tenants |
| REVIEW-01 | Codex CLI anterior | BLOCKED: usage limit confirmado na execução precedente | nenhum parecer Codex independente |
| REVIEW-02 | Ollama qwen:4b, documento e código | FAILED: timeout de 240s e timeout de 165s | nenhum parecer concluído |
| REVIEW-03 | Ollama deepcoder:1.5b, documento integral | NOT_VERIFIED: saída preparatória incompleta, apesar de exit 0 | sem avaliação S01-S08 nem conclusão |
| REVIEW-04 | Ollama qwen:4b, excertos curtos | NOT_VERIFIED: resposta de uma linha alheia aos critérios, apesar de exit 0 | sem parecer independente homologável |

## 3. Achados confirmados pela inspeção de código

### F-01 — ALTO: rotação de API key amplia escopos

- src/app/api/user/api-key/route.ts invoca provisionManagedApiKey(tenantId,userId,true) no POST.
- src/lib/tenant-api-keys.ts define DEFAULT_API_KEY_SCOPES com api:write e os seleciona quando rotate=true.
- Correção contratual para W2: preserve ou reduza scopes aprovados durante rotação; escrita nova requer autorização/grant separado, com testes de concorrência.
- Teste QA03 é obrigatório antes de considerar o fluxo pronto.

### F-02 — ALTO: bloqueio explícito de e-mail não verificado não demonstrado

- Cadastro inicial cria User com emailVerified=false.
- A função validateApiKeyValue em src/lib/tenant-api-keys.ts consulta id/email/name do usuário e membership/tenant ativos, mas não valida emailVerified.
- O endpoint de API key autentica a sessão e resolve tenant; não mostra verificação explícita do e-mail.
- Exigir no backend, independentemente da UI, que a credencial seja utilizável somente após ativação autorizada; teste QA01.
- A criação idempotente de perfil não deve criar um segredo irrecuperável antes da confirmação.

### F-03 — MÉDIO: compatibilidade MCP moderna não comprovada

- O SDK em mcp/wa-akg-mcp/package.json é ^1.25.2; a versão instalada não foi confirmada.
- mcp/wa-akg-mcp/src/http.mjs exige initialize, guarda sessões em memória e associa Mcp-Session-Id a contexto de OAuth.
- O contrato W1 identifica isso como legado; qualquer suporte MCP 2026-07-28 requer estratégia de versão/protocolo e testes.
- Testes existentes passaram, mas não comprovam compatibilidade moderna.

### F-04 — ALTO: migrações de tenant ainda requerem gate isolado

- docs/MULTI-TENANT-IMPLEMENTATION.md documentou drift envolvendo ProcessingResult e bloqueio de migrações.
- O drift não foi revalidado no banco nesta revisão; o diagnóstico histórico é informação documental, não estado real comprovado hoje.
- Antes de W2/schema ou qualquer migrate, executar inventário read-only, backup restaurável, teste em clone e autorização.

### F-05 — MÉDIO: contratos de execução precisam de congelamento

- W1 define AuthContext, PolicyDecision, grant, approval e CapabilityDefinition como interfaces conceituais, sem APIs e versões definitivas.
- Congelar assinatura, regras de precedência, canonização de argumentos, idempotência e transação de aprovação antes de múltiplos agentes escritores.
- Validar cruzamento de tenants também em mídia, jobs, webhooks, socket, caches, SQL aninhado e listas.

### F-06 — MÉDIO: risco de credencial global no ambiente de execução

- A API key do stdio deve ser do usuário/processo. O HTTP compartilhado deve usar bearer por requisição.
- Auditar docker-compose, entrypoints e loaders: a existência de variável global WA_AKG_API_KEY não pode conceder identidade a clientes HTTP distintos.
- Adicionar teste negativo para env local solicitando WRITE com chave READ e teste de isolamento por cliente/tenant.

## 4. Avaliação por frente W1

| Frente | Situação | Condição de avanço |
| --- | --- | --- |
| S01 Security | IMPLEMENTED em documento, revisão externa pendente | matriz TH x controle x testes + parecer |
| S02 Identidade | IMPLEMENTED em documento, riscos F01/F02 confirmados | contrato de rotação/ativação fechado |
| S03 Autorização | PROPOSED / REVIEW_REQUIRED | congelar PDP, privilégio admin e grants |
| S04 Prisma | PROPOSED / BLOCKED para execução real | reavaliar drift e recuperação |
| S05 MCP | TESTED no legado, NOT_VERIFIED no moderno | matrix de versão e cliente real |
| S06 Integrações | PROPOSED | definir capability catalog por API |
| S07 UX | PROPOSED | consentimento, segredo exibido uma vez e evidências CDP |
| S08 QA | TESTED parcialmente: 8 testes MCP | cobrir QA01-QA16 e cenários intertenant |

## 5. Decisão provisória de gate

- GO: preservar W1 como referência arquitetural e desenvolver, em worktrees isolados, propostas documentais e testes sintéticos de baixo risco.
- NO-GO: migrações em banco real, deploy, release, push/merge, exposição de novas credenciais e habilitação de privilégios de escrita.
- Para W2 com alteração de código: aprovar revisão independente, corrigir falhas críticas de contrato, congelar interfaces por owner e confirmar estado de cada worktree.
- O próprio W1 é uma proposta; não constitui aceite de segurança de produção nem prova de conformidade universal.

## 6. Evidências e limitações

Diretório operacional: .remote-desktop/sessions/20261104-w1-gate-review/
Tentativas em reports/: independent-deepcoder-review.md e independent-qwen-slim.md. Ambas são respostas insuficientes e NÃO homologadas como revisão independente. As duas tentativas anteriores de Qwen terminaram por timeout.
Comandos e resultados de ferramentas Remote Desktop Commander são evidência; relatórios de agentes não devem ser inventados.
As análises propostas para S01 a S08 abrangem OAuth, credenciais de usuário, PDP, Prisma, MCP, adaptadores, UX e QA, mas não foram todas implementadas ou exercitadas em runtime.

Status de conclusão: PARTIAL. W1 restaurado e validado; revisão independente BLOCKED. Não liberar implementação ampla, migrações reais ou produção. Próximo gate: revisão independente utilizável e congelamento dos contratos antes da integração W2.
