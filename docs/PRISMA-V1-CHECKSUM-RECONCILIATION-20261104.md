# Reconciliação auditada dos checksums Prisma V1 — 2026-11-04

**Banco:** MySQL 8.0.40 local, `127.0.0.1:3306/wa_akg`.
**Branch:** `feature/multi-tenant-isolation-20261103`, HEAD `86b3b0a`.
**Status:** `VERIFIED` para os três checksums locais; integração em `main` e publicação continuam `NO-GO` por outros gates.

## Diagnóstico e limite de evidência

O inventário read-only identificou 43 tabelas e 14 migrações aplicadas, sem migrações interrompidas. Os três checksums de `20261024000000_baseline`, `20261024001000_oauth_and_worker_leases` e `20261031000000_inbound_event_receipts` divergiam dos arquivos SQL locais. Não foram localizados blobs correspondentes aos checksums antigos no histórico Git disponível. Portanto, **não se comprovou identidade binária do SQL executado originalmente**.

O esquema físico foi comparado ao datamodel Prisma atual, com `prisma migrate diff --exit-code` retornando 0. Isso verifica compatibilidade estrutural, não equivalência de todos os possíveis efeitos históricos sobre dados.

## Backup e prova de restauração

Foi produzido um dump consistente MySQL Shell 8.0 do schema `wa_akg`, com dados e `_prisma_migrations`, em `.remote-desktop/sessions/v1-reconcile-20261104/backup/v1-mysqlsh-dump/`. A pasta recebeu ACL local com herança desabilitada. O manifesto `evidence/backup-integrity.json` registra SHA-256 individual dos 179 arquivos e um digest agregado.

O dump foi restaurado em um MySQL 8.0 exclusivo, com dados em `tmpfs` e porta aleatória somente em loopback. As 43 tabelas, 14 migrações, contagens exatas de entidades selecionadas e todos os registros do ledger permaneceram iguais ao banco de origem. A comparação de esquema retornou exit 0. **A simulação de atualização dos três checksums ocorreu somente no clone**, não alterou contagens de dados e passou na inspeção do roteador V2. O clone foi encerrado e removido. Evidência: `evidence/restore-test.json`.

## Aplicação ao banco local

Antes da mutação foram revalidados o destino exato, branch/HEAD, hashes originais, ausência de outras divergências, 14 migrações completas, contagens de dados, paridade do esquema, integridade de todos os arquivos do backup e restauração comprovada.

Foram atualizados **somente os campos checksum de três registros exatos de `_prisma_migrations`**, por uma transação SQL com condições `WHERE migration_name = ? AND checksum = ?` e verificação de uma linha afetada por operação. Não houve reexecução de DDL, backfill, migração SQL em produção ou alteração de tabelas funcionais.

Os checksums anteriores e novos, identificadores, horários, digest do backup e gates permanecem em `evidence/reconciliation-before.json` e `evidence/reconciliation-after.json`. O dump foi concluído antes da mutação, preservando a situação anterior de forma restaurável.

## Validação posterior independente

`npm run db:inspect`: `lineage=v1`, 43 tabelas, 14 migrações, `checksumErrors=[]`.

`prisma migrate status --schema prisma/schema.prisma`: exit 0, `Database schema is up to date!`.

A operação confirmou 14 entradas preservadas e contagens iguais das tabelas de usuários, sessões, mensagens, tenants, eventos e histórico de migrações. O arquivo histórico V1 no Git permaneceu intocado, sem `reset`, `db push`, `migrate resolve` ou alterações em produção.

**Limites:** o backup é local, restrito por ACL e não representa redundância externa nem garantia de recuperação caso a máquina/disco falhe. Os arquivos contêm dados reais; não anexar, publicar nem transferir indiscriminadamente. O histórico original de checksums permanece somente no dump e nas evidências, não nos campos atualizados da tabela Prisma.

## Gates posteriores

- `VERIFIED`: divergências de checksum resolvidas **nesta base local** com evidência de restauração e validação.
- `DEFERRED`: reconciliar futuras bases V1 individualmente, com backup/ensaios próprios; nenhuma correção global ou automática de checksum foi adicionada.
- `DEFERRED`: testes HTTP de isolamento multi-tenant, reconciliação OAuth/QR, formulários MFA e provisionamento TOTP autorizado.
- `NO-GO`: merge em `main`, push, release e deploy permanecem sem autorização e sem evidências suficientes dos gates funcionais.

**Diretório operacional:** `C:\repos\WA-AKG\.remote-desktop\sessions\v1-reconcile-20261104`. Manter o backup e os registros de auditoria associados até que a política de retenção seja definida; não excluir dados ou volumes.
