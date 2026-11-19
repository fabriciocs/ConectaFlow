# Migração multi-tenant local — evidência 2026-11-03

**Estado:** VERIFIED para migrações Prisma e integridade básica do esquema local. O isolamento E2E e o backfill permanecem **NOT_VERIFIED / DEFERRED**.

- Destino autorizado: MySQL `wa_akg`, `127.0.0.1:3306`.
- Branch: `feature/multi-tenant-isolation-20261103`; SHA base `86b3b0a4c21955e41e311ed9c081665781f79f2b`.
- Antes: 34 tabelas; modelo `Tenant` ausente; `20261103190500_additive_multi_tenancy` pendente.
- Desvio constatado: `ProcessingResult` ausente, apesar da migração histórica `20261031000000_inbound_event_receipts` constar no histórico.
- Correção adicionada: `prisma/migrations/20261103190400_reconcile_missing_processing_result/migration.sql`, com criação condicional e vínculo referencial condicional.
- Migração original mantida sem alteração: `20261103190500_additive_multi_tenancy`.
- Backup completo preservado em `%LOCALAPPDATA%\WA-AKG\MigrationSafety\20261103-additive-tenant\wa_akg-before-tenancy-v2.sql`. Contém dados sensíveis; não versionar nem compartilhar.
- Backup: 26.975.798 bytes; SHA-256 `d89d991685671ec8cf43bf207c20dca833745511910a617b386514f3382f6565`.
- Recuperação verificada em MySQL 8.0 descartável com `lower_case_table_names=1`: 34 tabelas restauradas, depois 43 com as duas migrações; container removido.
- Banco local após aplicação: 43 tabelas, `Tenant` e `TenantMembership` presentes; `prisma migrate status` confirma 14 migrações e schema atualizado.
- `node --env-file=.env scripts/tenant-inventory.mjs`: `READ_ONLY_INVENTORY`, nenhum erro de consulta. Foi identificada uma concessão legada de sessão a não proprietário, ainda sem conversão automática.

**Não executado:** `tenant-backfill.mjs --apply`, migrações destrutivas, envios WhatsApp, deploy da aplicação, push, merge ou reset Git.

**Próximo gate:** planejar separadamente o backfill auditável das relações legadas e validar 2 tenants/2 usuários com banco isolado antes de declarar o isolamento completo VERIFIED.

Evidências locais: `%LOCALAPPDATA%\WA-AKG\MigrationSafety\20261103-additive-tenant\backup-evidence.json`, `restore-verified.json` e `deploy-evidence.json`. 

## Falhas intermediárias e limites da validação

- O primeiro `mysqldump` falhou por argumento incorreto, gerando apenas um artefato vazio, preservado. O backup subsequente passou e foi restaurado.
- A primeira tentativa de teste consultava um banco ainda não restaurado; a checagem de prontidão foi corrigida.
- A cópia Linux precisou reproduzir `lower_case_table_names=1` do banco Windows.
- A aplicação da migração original falhou na cópia até a correção aditiva da tabela `ProcessingResult`. Ambas foram depois verificadas na cópia e no banco local.
- Nenhuma aplicação Next.js foi iniciada nesta operação. A porta local `43000` não estava em escuta na checagem final; portanto, verificações HTTP/E2E da aplicação são `NOT_VERIFIED`.
- O arquivo da nova migração está local e ainda não rastreado no Git. Versioná-lo antes de usar o mesmo histórico de migrações em outros ambientes.
