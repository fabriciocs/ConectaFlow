# Gate Prisma P3018 — bootstrap virgem (2026-11-04)

**Atualização:** a solução candidata que modificava a migração histórica foi substituída pelo [Bootstrap V2](PRISMA-BOOTSTRAP-V2.md). O arquivo histórico foi restaurado byte a byte ao `HEAD`; os resultados abaixo permanecem como registro do ensaio anterior, não como procedimento atual de implantação. Os três checksums do banco V1 local foram posteriormente reconciliados após backup e ensaio restaurável, conforme [relatório V1](PRISMA-V1-CHECKSUM-RECONCILIATION-20261104.md). O texto histórico abaixo descreve o estado anterior à reconciliação.

**Estado:** `VERIFIED` para bootstrap limpo em sandbox MySQL 8.0; `PARTIAL / NO-GO` para integração na `main` e propagação a bancos existentes.

## Diagnóstico reproduzido

O histórico contém operações redundantes:
- `20261031000000_inbound_event_receipts` cria `InboundEvent.messageId`, índice `inbound_event_message_idx` e FK `InboundEvent_messageId_fkey`.
- `20261031100000_add_inbound_event_message_id` tentava recriar os mesmos objetos. Em banco virgem, `prisma migrate deploy` retornou **P3018 / MySQL 1060** (coluna duplicada), exit 1.

Evidências da reprodução, fora do código versionado:
`C:\repos\WA-AKG\.remote-desktop\sessions\prisma-virgin-ExpectP3018-20261104-184831`.

## Correção candidata para bootstrap (IMPLEMENTED / TESTED)

A migração `20261031100000_add_inbound_event_message_id/migration.sql` foi alterada para consultar `information_schema` e criar coluna, índice e FK somente quando ausentes. O comportamento esperado no banco recém-criado é não executar DDL redundante. Não houve `reset`, `db push`, `resolve` nem reconciliação em banco existente.

O teste automático reutilizável é `scripts/Validate-Prisma-Virgin.ps1` (PowerShell 5.1), invocado com:

```powershell
.\scripts\Validate-Prisma-Virgin.ps1
```

O script usa a imagem local `mysql:8.0` (`--pull never`), cria um contêiner exclusivo com dados em `tmpfs` e porta aleatória ligada somente a `127.0.0.1`, gera uma credencial temporária sem registrá-la nos logs, executa o `prisma migrate deploy` e repete o deploy para confirmar idempotência. Verifica 14 migrações concluídas e os objetos `messageId`, índice, FK, `ProcessingResult`, `Tenant` e `TenantMembership`. Somente o contêiner temporário criado pelo próprio script é encerrado.

Evidências de execução:
- `prisma-virgin-ExpectSuccess-20261104-184959`: 14/14 migrações, deploy/redeploy exit 0, coluna/índice/FK únicos e tabelas essenciais presentes.
- `prisma-virgin-ExpectSuccess-20261104-185349`: segunda validação, agora via script copiado para `scripts/`; mesmas verificações aprovadas.
- `prisma-virgin-ExpectSuccess-20261104-190000`: validação final do script após preservar variáveis do processo chamador; 14/14, redeploy OK, coluna/índice/FK únicos, `DATABASE_URL_RESTORED=True` e `PRISMA_HIDE_UPDATE_MESSAGE_RESTORED=True`.

Verificações estáticas adicionais em 2026-11-04: `prisma validate` exit 0; `npm test` 225 testes aprovados em 10 suites, 0 falhas; `tsc --noEmit` exit 0; `npm run lint` exit 0 (13 warnings, 0 erros); `git diff --check` exit 0. Logs em `.remote-desktop/sessions/prisma-gate-20261104-{unit,types,lint}/`.

## Risco confirmado: checksum histórico (BLOCKED para integração)

**Não considerar a correção pronta para merge.** A migração editada já consta como concluída no MySQL local `wa_akg` (`127.0.0.1:3306`). Consulta **somente leitura** ao `_prisma_migrations` comprovou:

- `appliedRecordPresent=true`; `finished=true`; `rolledBack=false`.
- `storedMatchesCommitted=true` (checksum do arquivo original em `HEAD`).
- `storedMatchesUpdated=false` (checksum da versão corrigida).

Logo, propagar o arquivo editado produz divergência de histórico em bancos onde a versão original já foi aplicada. O Prisma alerta sobre histórico modificado no `migrate deploy`, e `migrate dev` pode exigir reconciliação de histórico. **Não executar migrações, `migrate resolve`, ajustes manuais de `_prisma_migrations` ou backfills em bases existentes sem um plano separado de inventário, backup, ensaio e autorização explícita.**

A migração corretiva não rastreada `20261103190400_reconcile_missing_processing_result` foi preservada. Ela trata ausência legada de `ProcessingResult`; não corrige o P3018 anterior e não deve ser aplicada automaticamente a bases existentes.

## Gates restantes

1. **BLOCKED / PROPOSED — compatibilidade de histórico:** selecionar e aprovar estratégia de preservação de checksums/implantação para ambientes já migrados. Alternativas a avaliar: manter o histórico original e criar bootstrap exclusivo para bancos comprovadamente vazios, ou aceitar formalmente a alteração histórica após inventário completo dos bancos (com aviso persistente e impacto em `migrate dev`).
2. **DEFERRED — OAuth/QR:** verificar fluxos e permissões em runtime, sem ampliar escopos herdados automaticamente. Inspeção estática confirmou a rota QR em `src/app/api/sessions/[sessionId]/qr/route.ts` com conferência de proprietário; o painel usa Socket.IO para atualizações de QR. Os fluxos OAuth/QR reais não foram testados nesta sessão. `npm run mcp:check` terminou com exit 0 e `npm run mcp:test` com 8 PASS, 0 FAIL, sem substituir validação OAuth/QR integrada.
3. **BLOCKED — MFA visual / TOTP real:** o backend exige `x-wa-akg-admin-totp` e `x-wa-akg-admin-reason` em `src/lib/tenancy/privileged.ts`; não foram encontradas referências desses campos em `src/app` ou `src/components` rastreados. `WA_AKG_ADMIN_TOTP_KEYS` não constava no `.env` inspecionado nem no ambiente do diagnóstico (valores não lidos). Porta local 43000 sem listener. Validar formulário visual sem Playwright após ambiente e interface disponíveis; provisionar TOTP de contas reais somente por fluxo autenticado, consentido e auditável.
4. **NO-GO — main/release:** não executar merge, push, publicação, deploy ou migração em bancos com dados.

Os dados e as alterações Git anteriores (`private-media`, documentação multi-tenant/OAuth e a migração de reparo não rastreada) foram preservados.
