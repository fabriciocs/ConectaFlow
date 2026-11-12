# Prod V2 — registro de fontes, integração e decisão de promoção

Data da atualização: 2026-11-11. Repositório: `fabriciocs/ConectaFlow`. Baseline V1 atual: `release/prod-v1` (`dcc263e4b69ce4aadaa9e019393f459ae138be8d`), já sem a pasta sensível no HEAD. Branch candidata: `release/prod-v2`. **Integração técnica COMPLETA; aprovação funcional e deploy NO-GO.**

## Escopo da atualização atual

| Ação | Estado | Evidência / restrição |
| --- | --- | --- |
| Consulta remota de V1 (equivalente a fetch, não pull local) | VERIFIED | Commit V1, pacote 1.6.4 e diff por GitHub |
| Criação da branch V2 a partir do SHA exato da V1 | IMPLEMENTED | Sem force-push, sem mudar V1 ou main |
| Especificação de upgrade, preflight e rollback | IMPLEMENTED | `docs/release-v2/PROD-V1-TO-PROD-V2-UPGRADE-SPEC.md` |
| CLI cross-platform read-only | IMPLEMENTED / NOT TESTED | `scripts/release-v2/upgrade.mjs`, apenas doctor/plan/status/help |
| Merge `main` na V2 | VERIFIED (ancestralidade) | PR #3 MERGED, `7fb04e6a5bdc163bd1baaf02d21c906e21bea790`; resolução aditiva dos ignores, preservando V1 |
| Merge `auth` (incorpora `security` e `tenant`) | VERIFIED (ancestralidade) | PR #4 MERGED, `8a7cf444b7b68afafb7fa5b1f4c31958cc22b402`; gates funcionais continuam bloqueados |
| Merge `B2` na V2 | VERIFIED (ancestralidade) | PR #5 MERGED, `44227be6bef208fd25e9f10ac4f07a4170c49c3e`; documentação/Sync-Fork-B2 integrados |
| Captura de trabalhos locais não publicados | BLOCKED | GitHub não acessa staged/unstaged/untracked dos computadores |
| Testes HTTP, Prisma e restore | BLOCKED | Exigem sandbox/serviços reais e baseline de banco identificada |
| Tag/release/deploy em produção | DEFERRED | Não autorizados nem tecnicamente aprovados |

## Comparações de ancestralidade confirmadas

- `release/prod-v1...main`: 13 commits exclusivos da main e 2 da V1, bases divergentes.
- `main...release/b2-integration-20261109`: B2 está seis commits à frente de main, sem divergência.
- `main...feature/multi-tenant-isolation-20261103`: 12 commits adicionais.
- `feature/multi-tenant-isolation-20261103...feature/security-remediation-20261106`: security acrescenta um commit.
- `feature/security-remediation-20261106...codex/auth-whatsapp-identity-linking-20261108`: auth acrescenta seis commits.

Assim, a integração de `auth` contém, por ancestralidade Git, as alterações de tenant e security observadas nessa data. **Não** fazer cherry-pick duplicado desses commits.

## V1 exclusiva (12 caminhos no diff reverso, 2 commits)

- Backups: workspace/configuração, arquivo com nome de chave, estado, lock, log de auditoria e script de backup. **SEGURANÇA P0 CONFIRMADA:** foi observada chave privada age em commit público. Tratar como comprometida, rotacionar e recriptografar backups pertinentes em processo controlado; não reproduzir o valor. Excluir do HEAD não limpa o histórico. Examinar somente classificações/hashes em ambiente autorizado.
- Infraestrutura: `deploy/nginx/wa-evomenu.conf`, `ecosystem.config.js`, `start.sh`, `scripts/enable-remote-access.sh` e `scripts/expose-database-subdomains.sh` foram preservados na candidata. **Não foram executados nem homologados**; exigem revisão específica de permissões, exposição de portas, compatibilidade com Caddy e PM2. O `start.sh` da V2 agora aborta antes de `prisma db push`/PM2.
- A presença histórica de arquivos de backup e rede não constitui justificativa para manter acessos remotos ou publicar dados privados.

## Pendências graves herdadas dos documentos B2

1. Identidade inequívoca do artefato instalado e seu SHA (não confundir B1 histórica com tag de release publicada).
2. Três linhagens/checksums Prisma V1, drift de `ProcessingResult`, erro P3018 e migração incremental V2; preservar `_prisma_migrations` sem reparo automático.
3. Testes isolados em fonte anterior não substituem validação da V2: documentos B2 reportam falha histórica de TS/lint e ausência de teste final no commit congelado.
4. Autenticação, MFA/TOTP, API keys, OAuth/PKCE, superadmin e isolamento entre dois tenants; incluir chamadas MCP, processos não HTTP e fluxo de WhatsApp.
5. Segurança R15, mídia privada/Turbopack, URL base e proxy.
6. Captura e recuperação do trabalho local em worktrees e testes de rollback em cópia representativa.
7. Credenciais possivelmente rastreadas e distribuídas pelo histórico Git exigem ação específica antes de publicação.

## Consolidação realizada e próximas etapas

1. PR #3 foi integrado por commit Git de dois pais, após conflito de `.gitignore` e `.dockerignore`. Base de conteúdo `main`, 18 sobreposições V1/V2 com hashes verificados; preservados o código `src`/`prisma`/`package.json` da `main`, PM2 e startup da V1, e exclusões de backup.
2. PR #4 foi integrado por commit Git de dois pais. Árvore base do branch `auth` (já contém `tenant` e `security`), sobreposta com 18 arquivos V1/V2; preservados os novos `src`/`prisma`/`package.json` da branch funcional e as salvaguardas V2.
3. PR #5 foi integrado por commit Git de dois pais, sobrepondo exatamente 9 caminhos documentais/scripts B2 na candidata, sem alterar `src`/`prisma`/`package.json`. A advertência NO-GO do guia foi preservada e posteriormente reforçada.
4. PR #1 (tenant → main) e PR #2 (B2 → main) foram fechados como **SUPERSEDED** com comentários de rastreabilidade; seus commits permanecem alcançáveis em `release/prod-v2`. Não foram mesclados em `main`.
5. Ainda é obrigatório inventariar worktrees locais não publicadas, executar validações estáticas/reais, ensaiar MySQL e restauração em sandbox, resolver P0/R15 e provar rollback. A candidata continua **NO-GO**.
6. Somente com R00–R12 VERIFIED, manifesto revisado, tag/release aprovada e autorização separada considerar implantação em produção.

## Evidências que faltam nesta execução GitHub-only

Não se observaram status Git local, dados do banco efetivo, processos, build de Node, resultados HTTP ou restauração. A integração **alterou somente a branch candidata** `release/prod-v2` (código + docs), preservando `main`, V1 e serviços; nenhum teste operacional foi executado aqui. Não transportar resultados históricos para este SHA.

## Comando de preparação disponível na branch

```sh
node scripts/release-v2/upgrade.mjs doctor
node scripts/release-v2/upgrade.mjs plan
```

O comando **não realiza upgrade** nesta fase. `upgrade`/`resume`/`rollback` terminam com `BLOCKED_NOT_IMPLEMENTED` e exit 20. Isso impede uma atualização insegura enquanto faltam manifesto, backups restaurados, reconciliação Prisma e gates.

## PRs consolidados e encerrados

- [PR #3 — main → release/prod-v2](https://github.com/fabriciocs/ConectaFlow/pull/3), MERGED `7fb04e6a5bdc163bd1baaf02d21c906e21bea790`.
- [PR #4 — auth (inclui security/tenant) → release/prod-v2](https://github.com/fabriciocs/ConectaFlow/pull/4), MERGED `8a7cf444b7b68afafb7fa5b1f4c31958cc22b402`.
- [PR #5 — B2 → release/prod-v2](https://github.com/fabriciocs/ConectaFlow/pull/5), MERGED `44227be6bef208fd25e9f10ac4f07a4170c49c3e`.
- [PR #1 — tenant → main](https://github.com/fabriciocs/ConectaFlow/pull/1), CLOSED / SUPERSEDED (histórico incluído pelo PR #4).
- [PR #2 — B2 → main](https://github.com/fabriciocs/ConectaFlow/pull/2), CLOSED / SUPERSEDED (histórico incluído pelo PR #5).
- [PR #6 — contenção backups P0](https://github.com/fabriciocs/ConectaFlow/pull/6), MERGED anteriormente.

Comparações `GitHub compare` após integração confirmaram `behind_by=0` de todas as seis fontes em relação à V2; esse teste comprova **ancestralidade**, não compilação, compatibilidade de schema, segurança ou funcionamento.

## Verificação do CLI nesta rodada

- Conteúdo de `upgrade.mjs` e `upgrade.test.mjs` confirmado na branch por blob SHA do GitHub.
- Corpo JavaScript inspecionado por parser depois de remover as diretivas de importação ESM para avaliação estática: PASS. **Não** substitui `node --check` nem `node --test`.
- Testes versionados em `scripts/release-v2/upgrade.test.mjs` para fail-closed, status NO-GO e não exposição de valores de credenciais. Não executados em Node nesta rodada, pois o GitHub connector não oferece execução de comandos e a recuperação de arquivos pelo ambiente efêmero de testes não estava disponível.
- Release publicada, upgrade real e testes de banco/HTTP: NÃO EXECUTADOS. Merges de código feitos nesta rodada, sem teste de runtime do SHA final.

## Contenção P0 posterior ao inventário inicial — 2026-11-11

- VERIFIED por inspeção GitHub: `release/prod-v1` `dcc263e4` e `release/prod-v2` `9f955b26` não mantêm `backups/.age-backup-key` no HEAD. O diretório `backups/` inteiro foi excluído nesses commits concorrentes.
- IMPLEMENTED: `.gitignore` existente na V2 ignora identidades e backups; `.dockerignore` exclui esses arquivos do contexto de build.
- IMPLEMENTED: detector `scripts/security/check-tracked-secrets.mjs` e testes sintéticos `scripts/security/check-tracked-secrets.test.mjs` publicados; regras puras verificadas em ambiente V8 com 9/9 casos de caminhos e 3/3 casos de conteúdo sintético. Execução completa `node --test` ainda NOT VERIFIED.
- IMPLEMENTED: [runbook P0 de rotação e histórico](SECURITY-P0-AGE-ROTATION-AND-HISTORY.md).
- BLOCKED: utilização da chave em backups, rotação, recriptografia, prova de restauração e eventual revogação de PAT válido; não existe acesso demonstrado aos hosts/secret manager/armazenamento protegido.
- DEFERRED: reescrita de histórico Git e caches, que requer autorização separada, congelamento e coordenação de clones/forks.
- POSSIBLE REGRESSION: `backups/backup-system.sh` foi removido como parte da contenção; necessidade de restabelecer capacidade de backup por alternativa segura deve ser avaliada antes de upgrade.

**Decisão:** P0 HEAD-CONTAINED / ROTATION-BLOCKED / HISTORICAL-EXPOSURE-OPEN. Não transformar em `VERIFIED` ou GO para produção sem comprovação da revogação e do restabelecimento de backups.
