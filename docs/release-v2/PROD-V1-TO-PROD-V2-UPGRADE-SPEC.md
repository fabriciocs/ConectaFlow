# ConectaFlow — especificação de upgrade seguro Prod V1 → Prod V2

**Data:** 2026-11-11. **Estado:** INTEGRATION IMPLEMENTED / UPGRADE PROPOSED / NO-GO para produção.  
**Branch candidata:** `release/prod-v2`. **Origem preservada:** `release/prod-v1` em `dcc263e4b69ce4aadaa9e019393f459ae138be8d` (contém o commit histórico `427a8c863`).  
**Repositório canônico:** `fabriciocs/ConectaFlow` (antigo `fabriciocs/WA-AKG`).  
**IMPORTANTE:** os merges de código em `release/prod-v2` foram executados e a ancestralidade verificada, mas isso **NÃO constitui** upgrade aprovado, testes funcionais, tag, release publicada ou deploy.

## 1. Objetivo e contrato

Criar um **único comando idêntico em Windows, Linux e macOS** que diagnostique a instalação local V1, prepare artefatos e backups, ensaie o upgrade em ambiente isolado, atualize para um commit V2 aprovado e permita retomada e recuperação sem eliminar dados. Exigir um manifesto de release imutável, preflight sem efeitos colaterais, trilha de auditoria, rollback parametrizado e confirmação explícita de operações reais.

Interface desejada, após implementação e gates:

```sh
node scripts/release-v2/upgrade.mjs doctor
node scripts/release-v2/upgrade.mjs plan
node scripts/release-v2/upgrade.mjs upgrade --manifest ./releases/prod-v2.manifest.json --approve <ID-APROVACAO>
node scripts/release-v2/upgrade.mjs status
node scripts/release-v2/upgrade.mjs resume --run <RUN_ID>
node scripts/release-v2/upgrade.mjs rollback --run <RUN_ID> --strategy binary
```

O ponto de entrada `node` deve ser suportado por Node >= 22 em todos os três sistemas; validar contra o Node especificado no manifesto, preferindo Node 24 LTS quando homologado. Não assumir PowerShell 7, Bash, Docker, PM2, systemd, LaunchAgent ou um banco local como obrigatórios. O wrapper `upgrade.mjs` inicialmente implementa apenas `doctor`, `plan`, `status` e `help` **sem efeitos colaterais**; `upgrade`, `resume` e `rollback` falham fechados até o executor ser testado e aprovado. **Não apresentar o comando upgrade como operacional antes disso.**

### Política de autorização

O diagnóstico não exige consentimento para mudanças porque não muda o sistema. O upgrade real exige operador autorizado, identificação do destino e da versão, confirmação de backup restaurável, autorização de janela e capacidade de interromper serviços próprios. Nunca realizar push, deploy remoto, upgrade do MySQL, rotação de credenciais, restauração destrutiva ou envio de WhatsApp automaticamente. O rollback não poderá sobrescrever dados novos sem plano de perda zero e aprovação específica.

## 2. Ancestralidade e composição obrigatória

| Fonte | Ref observado em 2026-11-11 | Conteúdo / ação |
| --- | --- | --- |
| Prod V1 | `release/prod-v1` / `dcc263e4` | Base histórica 1.6.4, com commit posterior removendo arquivos sensíveis do HEAD; histórico preservado |
| Main | `main` / `e793659` | Código 1.7.0; V1 diverge: 13 commits na main e 2 exclusivos V1 |
| B2 | `release/b2-integration-20261109` / `8e93961` | Seis commits documentais sobre main; incorporados pelo PR #5; PR #2 fechado como superseded |
| Tenant | `feature/multi-tenant-isolation-20261103` / `7d804ba` | Ancestral da security, incorporado no PR #4; PR #1 fechado como superseded |
| Security | `feature/security-remediation-20261106` / `5b9ddfe` | Descende da tenant; 1 commit adicional |
| Auth | `codex/auth-whatsapp-identity-linking-20261108` / `3e949a0` | Descende da security; 6 commits adicionais |

**Ordem executada de integração Git:** V1 preservada → main (PR #3 / `7fb04e6a`) → auth incluindo tenant/security (PR #4 / `8a7cf444`) → B2 (PR #5 / `44227be6`). **Ainda pendentes:** inventário de worktrees locais, correções funcionais, validações de banco e rollback, segurança P0 e revisão final da candidata. Revalidar SHAs antes de cada integração. Não importar logs, dados, arquivos privados, segredos, artefatos transitórios ou deleções massivas sem triagem individual. Preferir merges verdadeiros, com dois pais, preservando histórico; proibir sobrescrita por cópia integral de uma árvore, rebase e force-push. A presença do commit no histórico não prova adequação funcional: registrar divergências por caminho e decisões de resolução.

**Atualização de contenção (2026-11-11):** os HEADs de `release/prod-v1` (`dcc263e4`) e `release/prod-v2` (`9f955b26`) passaram a excluir todo o diretório `backups/`; `.gitignore` e `.dockerignore` da V2 também impedem nova inclusão e existe `scripts/security/check-tracked-secrets.mjs` para auditoria heurística de arquivos rastreados. A exclusão ocorreu em commits concorrentes observados na auditoria. **Persistem a exposição histórica, a rotação não verificada e o risco de perda do antigo script de backup.** Consulte `docs/release-v2/SECURITY-P0-AGE-ROTATION-AND-HISTORY.md` antes de qualquer promoção.

**Alerta de segurança P0 CONFIRMADO:** a V1 contém material com formato de **chave privada age** em um commit acessível no GitHub público, além de estado e logs operacionais sob `backups/`. Tratar a chave como comprometida; avaliar backups e segredos por ela protegidos, realizar rotação e recriptografia sob gestão do responsável e verificar histórico de acesso. Não repetir, copiar, publicar ou usar o valor dessa chave. Removê-la do HEAD isoladamente **não** a retira do histórico Git. **Não mostrar, copiar para documentação, incorporar a novos artefatos, nem usar esses arquivos como credenciais válidas.** Inspecionar classificação em ambiente controlado, invalidar/rotacionar qualquer credencial real por processo seguro, verificar possíveis acessos e estabelecer plano específico de remoção de conteúdo sensível do histórico sem destruir trabalho ou forçar refs sem autorização adicional. Nenhum merge pode promover estes materiais para artefatos de distribuição.

## 3. Gates atômicos de promoção

| Gate | Critério de aceite (evidência obrigatória) | Falha |
| --- | --- | --- |
| R00 | Ref, hash, identidade da V1 instalada, branch e status locais, worktrees, remotos e commits pendentes identificados | BLOCKED se baseline ambígua |
| R01 | Inventário de todas as diferenças e mudanças locais, incluindo staged, unstaged e untracked, com snapshots protegidos | BLOCKED se risco de perda |
| R02 | Segredos/arquivos sensíveis não incluídos em release; plano de rotação e incidente P0 resolvidos | BLOCKED se vazamento ativo |
| R03 | Integração de main, auth/tenant/security e B2 documentada, sem conflitos ocultos e sem exclusão não aprovada | BLOCKED se conflitos |
| R04 | Manifesto, lockfile, SBOM e checksums aprovados; Node/npm e dependências compatíveis | BLOCKED se cadeia não confiável |
| R05 | SQL Prisma: três históricos V1, checksums, drift, P3018, migrações V2 e classificador de linhagem comprovados em backups restaurados | BLOCKED se drift desconhecido |
| R06 | Backup consistente de MySQL, mídias, AuthState e configuração; hash, cifragem, ACL e restauração **comprovada** em clone | BLOCKED sem restore |
| R07 | Segurança R01–R15, autenticação/logout, RBAC/ABAC, MFA, OAuth/PKCE e API keys, com tentativas negativas | BLOCKED se falha |
| R08 | HTTP em dois tenants, SUPERADMIN, fronteiras de mídia, MCP, webhook, Socket.IO, scheduler e filas sem cruzamento de dados | BLOCKED se falha |
| R09 | WhatsApp/QR/reconexão, lease único, deduplicação de mensagens, retries e integração proxy/URL base testados com fixtures | BLOCKED se falha |
| R10 | TS, lint, unit, MCP, OpenAPI, build, verificação de assets privados, testes integrados e teste de falha injetada aprovados no SHA final | BLOCKED se falha |
| R11 | Ensaio V1→V2 completo: banco limpo e banco V1 representativo restaurado; falha/retry/rollback testados | BLOCKED sem repetição |
| R12 | Aprovação de release e de implantação separadas, janela, RTO/RPO medidos, responsável de recuperação e evidências assinadas | NO-GO sem aprovação |

Estados permitidos: `PROPOSED`, `IMPLEMENTED`, `TESTED`, `VERIFIED`, `BLOCKED`, `DEFERRED`, `FAILED`. Aprovação = todos R00–R12 VERIFIED na mesma revisão de SHA/manifesto. Evidências anteriores de outros commits não são transponíveis automaticamente.

## 4. Diagnóstico (sempre primeiro e read-only)

Coletar somente metadados não secretos: OS/arquitetura, versão Node e npm, espaço disponível, permissões, pasta alvo, SHA, status Git, PID/identidade do serviço, portas ocupadas, HTTP health e versão API, número de réplicas, modos de execução detectados, existência de config, nomes de variáveis exigidas, presença de CLI MySQL e ferramentas de backup, engine/charset/collation do banco **mediante credenciais autorizadas**, quantidade de sessões, timestamps e contagens agregadas. Não imprimir valores da `.env`, tokens, AuthState, QR, cookies, senhas ou mensagens.

Exigir matriz de compatibilidade: Node, Prisma, MySQL/MariaDB, sistema de arquivos, symlinks, Caddy/ngrok, `Forwarded`/`X-Forwarded-*` aceitos apenas de proxies confiáveis; base path derivado da URL requisitada e do proxy validado. Variáveis `NEXT_PUBLIC_*` apenas públicas. No Windows usar spawn sem shell, caminhos Unicode/longos e ACL; no Linux/macOS respeitar UID/GID, permissões de diretório e sinais. Se ferramenta faltar, marcar BLOCKED, sem instalação ou elevação automática.

## 5. Máquina de estados, checkpoints e reentrada

```text
DISCOVER → INVENTORY → PREFLIGHT → BACKUP → RESTORE_TEST → BUILD_STAGING
  → DB_CLASSIFY → UPGRADE_DRY_RUN → TEST_STAGING → APPROVAL
  → QUIESCE → SNAPSHOT_DELTA → MIGRATE → ACTIVATE → SMOKE → OBSERVE → COMMIT_SUCCESS
                                     ↘ FAILED_SAFE → RECOVERY_DECISION
```

Cada execução possui `run_id` único, manifesto vinculado a SHA, `phase`, `step`, `attempt`, timestamp UTC, entradas não secretas, pré-condições, códigos de saída, hash de artefatos, ID de backup e pós-condições. Gravar journal durável em diretório privado fora do checkout e do Git. Antes de cada mudança, persistir intenção (`INTENT`); depois, confirmar evidência (`DONE`), com escrita atômica e flush. Cada passo deve ser **idempotente** ou exigir inspeção do efeito externo antes de retentar. Nunca enviar novamente mensagens, webhooks ou jobs não idempotentes só porque houve timeout.

Lock exclusivo por instalação e banco, com identificação de host, PID, run_id, timestamp e verificação de proprietário. Lock órfão requer diagnóstico; não apagá-lo automaticamente. `resume` usa exatamente o mesmo manifesto, backup e alvo; valida pós-condições de etapas concluídas e reinicia do primeiro checkpoint seguro. Falha antes da troca ativa preserva V1; falha depois aciona contenção, não reversão cega.

Códigos previstos: `0` diagnóstico/ação concluído (não significa release autorizada); `10` parâmetros; `11` plataforma; `12` baseline; `20` gate/manifesto/implementação ausente; `21` permissão/dependência; `30` validação falha; `40` estado parcial recuperável; `50` recuperação bloqueada. Saída resumida: `STATUS`, `ACTION`, `RUN_ID`, `SOURCE_SHA`, `TARGET_SHA`, `GATE`, `EXIT_CODE`, `EVIDENCE_DIR`; saída sensível restrita fora do Git.

## 6. Backup e plano de contingência

Inventário do banco por linhagem e checksum antes da migração. Backup lógico consistente com transação e captura de rotinas, triggers e eventos se suportados, ou snapshot coordenado de engine/volume; registrar limitações de tabelas não transacionais. Incluir `_prisma_migrations`, grants pertinentes, configuração operacional, arquivo de mídia, sessions/creds WhatsApp, OAuth client metadata e manifestos, sem expor conteúdos. Encriptar com chave externa ao repositório, ACL mínima, hash SHA-256 e teste de restauração **em banco isolado**. Não fazer backup para pasta pública nem GitHub. Confirmar RTO/RPO realistas antes da janela.

No início da janela: drenar workers/scheduler, cessar novos efeitos externos, registrar fila/outbox/inflight e offsets, emitir checkpoint; não encerrar processos que pertencem a terceiros. Manter V1 **imutável** em slot A e V2 em slot B com artefatos fixados e configurações versionadas compatíveis; swap reversível de serviço/proxy apenas após smoke. Evitar migrar banco antes da última oportunidade de abortar.

**Rollback:** (a) falha pré-migração: descartar somente o slot V2 isolado e voltar ao slot A; (b) pós-migração expansiva e retrocompatível: rollback de binário somente se V1 suportar schema/fluxos novos e não causar perda; (c) migração incompatível: forward-fix testado ou recuperação coordenada a partir de backup + journal/outbox, com autorização expressa para qualquer perda de escritas. Nunca executar `prisma migrate reset`, `prisma db push`, `git reset --hard`, `git clean` ou restore em produção como fallback automático. Se a migração estiver em estado incerto, BLOCKED até classificar.

## 7. Falhas e defesa em profundidade

- **P3018, drift, migração incompleta, base mista:** abortar; classificar o histórico, comparar checksums e migrações aplicadas; não editar migrações já executadas nem `migrate resolve` automaticamente.
- **Falha de energia/disco/conexão:** journal durable + checkpoints, hash de arquivo e snapshot; `resume` consulta efeitos persistidos antes de continuar.
- **Timeout/duplicação de webhook/scheduler/mensagem:** dedupe por ID, idempotency key, outbox e ownership/lease atômicos; nunca replay incondicional.
- **Dois nós executando upgrade:** lock por deployment, database advisory lock quando aplicável, epoch/fencing; impedir múltiplos migradores e owners Baileys.
- **API e UI incompatíveis:** contrato versionado, expand-and-contract, compatibilidade em rolling upgrade, fallback HTTP e monitoramento de erro por rota.
- **Falha de pacote/asset:** manifestos assinados, hashes, verificações de mídia privada fora do bundle, `npm ci` do lockfile e builds isolados.
- **Vazamento de configuração:** segredos não são logados, não vão a `NEXT_PUBLIC_`, nem a artefatos ou Git; validação de permissão e rotação coordenada.
- **Proxy/URL base incorreta:** testes localhost sem contexto, Caddy/ngrok com contexto e callback OAuth absoluto derivado do host permitido.
- **Após ativação:** health supervisionado, error rate, latência, tentativas de login, falhas de filas, mensagens duplicadas, leases, conectividade DB, timers e taxa de rollback.

Injeção de falhas obrigatória em clone: desligar processo no meio da cópia, matar após checkpoint de migração, simular falta de espaço, recusar conexão MySQL, reexecutar o mesmo run_id, inverter disponibilidade do proxy, falha de validação de backup e falha dos testes de tenant. Documentar que não ocorreu perda, duplicação ou elevação de permissão.

## 8. Estrutura proposta

```text
scripts/release-v2/
  upgrade.mjs                 # entrada multiplataforma; inicia como doctor/plan/status
  lib/
    detect.mjs                # OS/runtime/dependências/config
    journal.mjs               # estado durable/idempotência/locks
    manifest.mjs              # assinatura/hash e compatibilidade
    backup.mjs                # snapshot cifrado + ensaio restore
    db-lineage.mjs            # classificador de históricos/checksums Prisma
    executor.mjs              # etapas/compensações/retry supervisionado
    adapters/
      windows.mjs             # processo/serviço/ACL no Windows
      linux.mjs               # systemd/PM2 quando comprovado
      macos.mjs               # launchd/PM2 quando comprovado
  __tests__/                  # testes de fail-safe, simulações e retomada
docs/release-v2/
  PROD-V1-TO-PROD-V2-UPGRADE-SPEC.md
  INTEGRATION-REGISTER.md
  GATE-REPORT.md              # evidências com links para dados não sensíveis
releases/prod-v2.manifest.json # somente após build/testes/aprovação
```

O script raiz não deve assumir scripts PowerShell para executar Linux/macOS. Módulos por OS atuam como adaptadores; orquestração e formato de journal devem ser independentes de plataforma. Android/iOS são clientes da aplicação e **não alvos locais** do upgrade de servidor Node/MySQL; validar compatibilidade de API e clientes separadamente.

## 9. Aceite e evidência

DoD: histórico reconciliado e revisado, commit V2 congelado, projeto compilado, suíte negativa de autorização/isolamento aprovada, backup-restauração auditados, duas repetições de upgrade ensaiadas com recuperações, monitoramento e RTO/RPO registrados, chaves comprometidas tratadas, manifesto assinado e decisão expressa de go/no-go. Publicação, tag, alterações na `main` e produção são fases distintas.

**Estado após integração:** ancestralidade da V1, main, tenant, security, auth e B2 integrada e confirmada pelo GitHub. `start.sh` legado bloqueado na candidata para impedir `db push`/PM2 involuntários; guia de atualização substituído por runbook seguro. **NÃO VERIFICADOS / BLOQUEADOS:** TypeScript, lint, testes Node/HTTP/MCP, banco representativo, backups/restauração, rotação P0, readiness R15, artefatos assinados, executor mutante e implantação. Consulte `docs/release-v2/INTEGRATION-REGISTER.md` e `docs/release-v2/GATE-REPORT.md`.
