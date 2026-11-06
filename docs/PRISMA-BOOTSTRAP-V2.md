# Bootstrap Prisma V2

**Versão do esquema:** 2.0.0 (a versão da aplicação continua 1.7.0).

A cadeia original em `prisma/migrations` permanece imutável para bancos existentes. Para novos bancos comprovadamente vazios, a cadeia V2 está em `prisma/bootstrap-v2/migrations`, com baseline consolidado de todos os modelos atuais e hashes no `manifest.json`.

O executor `scripts/prisma-bootstrap-v2.mjs` inspeciona a linhagem e rejeita bases desconhecidas, histórias misturadas, discrepâncias de checksum ou mudanças no esquema sem migração revisada.

## Verificações

```powershell
npm run db:inspect
npm run db:bootstrap:v2:test
.\scripts\Validate-Prisma-Virgin.ps1 -Mode ExpectSuccess
```

O ensaio descartável MySQL 8.0 confirmou 1/1 migrações, reexecução sem alterações e paridade com o datamodel Prisma (`migrate diff` exit 0).

## Operação manual

Para usar um banco comprovadamente vazio, depois de confirmar o destino e obter autorização, execute:

```powershell
npm run db:bootstrap:v2 -- --expect-db NOME_EXATO_DO_BANCO --confirm-empty-v2
```

Sem `--expect-db` e `--confirm-empty-v2`, ou quando o banco contém tabelas, o roteador interrompe a operação.

O setup de produção pede confirmação adicional antes do bootstrap vazio; a opção não interativa é `--allow-empty-v2`. O Docker Compose usa `WA_AKG_ALLOW_EMPTY_V2_BOOTSTRAP=false` por padrão.

## Banco existente — reconciliação local auditada

A inspeção inicial do banco `wa_akg` em 127.0.0.1:3306 confirmou 43 tabelas, 14 migrações e linhagem V1 com divergências nas três migrações: `20261024000000_baseline`, `20261024001000_oauth_and_worker_leases` e `20261031000000_inbound_event_receipts`.

**Atualização 2026-11-04 — VERIFIED para este banco local:** após inventário, backup consistente e restauração validada em clone descartável, os três checksums foram atualizados em transação condicional. `npm run db:inspect` agora informa `checksumErrors=[]`, e `prisma migrate status` confirmou 14 migrações com exit 0. O histórico anterior foi preservado no backup e nas evidências auditadas. Veja [Reconciliação V1](PRISMA-V1-CHECKSUM-RECONCILIATION-20261104.md).

A migração histórica `20261031100000_add_inbound_event_message_id` permaneceu idêntica ao `HEAD`, e o reparo não rastreado de `ProcessingResult` foi preservado.

**Restrição:** a reconciliação se aplica apenas ao banco local ensaiado, não representa autorização automática para alterar históricos de outros bancos. Não usar `migrate resolve`, `db push`, `reset`, backfill ou alterações em produção sem avaliação e autorização específicas.

## Evolução futura e evidências

O baseline V2 deve permanecer imutável. Alterações futuras exigem migrações incrementais revisadas para as duas linhas (V1/V2) quando aplicável, testes de compatibilidade e atualização do hash do esquema no manifesto com avanço de versão 2.x.y.

**VERIFIED:** bootstrap MySQL 8.0 novo, uma migração, dois deploys idempotentes, coluna/índice/FK únicos, tabelas críticas presentes e `prisma migrate diff --exit-code` = 0.

Evidências locais: `.remote-desktop/sessions/prisma-virgin-ExpectSuccess-20261104-192609/`.

**NO-GO:** push, merge, release e produção. **DEFERRED:** reconciliação OAuth/QR, testes visuais dos formulários MFA, provisionamento TOTP consentido e validações HTTP de isolamento entre tenants.

O snapshot V2 é uma versão de esquema, **não** uma atualização funcional automática de OAuth, QR, MFA ou dados históricos.

## Regressões verificadas

- 7 testes do bootstrap V2 e de inicialização do contêiner: PASS, incluindo replay após tentativa de migração revertida e rejeição de tentativa pendente.
- 10 testes do assistente de setup: PASS.
- 225 testes unitários do projeto: PASS.
- `tsc --noEmit`: exit 0.
- `npm run lint`: exit 0, 13 warnings, 0 erros.
- `npm run build`: exit 0, rotas geradas.
- `docker compose config --quiet`: exit 0, com avisos de configuração já existente.

Logs locais em `.remote-desktop/sessions/prisma-v2-regression-20261104/`. Não houve push, merge ou deploy.

## Verificação adicional — 2026-11-04

- O classificador V1 aceita a linha de uma tentativa explicitamente revertida apenas quando há um replay concluído do mesmo nome. A linha aplicada continua sujeita à validação de checksum; tentativas sem replay concluído continuam bloqueadas.
- `node --test scripts/__tests__/prisma-bootstrap-v2.test.mjs scripts/__tests__/container-start-v2.test.mjs`: 7/7 PASS.
- `node --env-file=.env scripts/prisma-bootstrap-v2.mjs`: inspeção read-only do banco local `wa_akg`, 43 tabelas, 14 migrações V1, zero divergências de checksum; nenhuma migração executada nesse banco.
- `scripts/Validate-Prisma-Virgin.ps1 -Mode ExpectSuccess`: `VERIFIED`, 1 baseline V2, reexecução idempotente, opt-in obrigatório, coluna/índice/FK únicos e contêiner `tmpfs` próprio encerrado. Evidências: `.remote-desktop/sessions/prisma-virgin-ExpectSuccess-20261104-221708/`.
- `prisma validate`, `docker compose config --quiet` e `git diff --check`: exit 0. Compose emitiu avisos porque `NEXT_PUBLIC_BASE_PATH` não estava definida no ambiente de validação.
- Regressão após correção de três chamadas de `mockDelegate` no teste `src/lib/__tests__/whatsapp-session-membership.test.ts`: teste direcionado 2/2 PASS, TypeScript sem erros, ESLint com 0 erros e 13 avisos, suíte completa `npm test` com 229/229 PASS em 10 suítes. A correção altera somente o teste não rastreado e não amplia permissões do runtime.
- `npm run build`: exit 0 com Next.js 16.1.1/Turbopack, rotas geradas. **Risco pendente:** aviso de análise estática em `src/lib/webhook.ts:603` identificou um padrão dinâmico que alcança 10.510 arquivos de `data/media`. Não se comprovou inclusão real desses arquivos no artefato, mas é obrigatório revisar o empacotamento e a proteção da mídia antes de publicação.
- Este ensaio não implica autorização para deploy, integração em `main` ou alterações automáticas de históricos V1 de outros bancos.
