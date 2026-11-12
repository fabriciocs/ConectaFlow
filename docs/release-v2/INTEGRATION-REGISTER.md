# Prod V2 — registro de fontes, integração e decisão de promoção

Data de inspeção: 2026-11-11. Repositório: `fabriciocs/ConectaFlow`. Baseline: `release/prod-v1` (`427a8c8630024b85254c0536c7e19fba29213811`). Branch de preparação: `release/prod-v2`.

## Escopo da atualização atual

| Ação | Estado | Evidência / restrição |
| --- | --- | --- |
| Consulta remota de V1 (equivalente a fetch, não pull local) | VERIFIED | Commit V1, pacote 1.6.4 e diff por GitHub |
| Criação da branch V2 a partir do SHA exato da V1 | IMPLEMENTED | Sem force-push, sem mudar V1 ou main |
| Especificação de upgrade, preflight e rollback | IMPLEMENTED | `docs/release-v2/PROD-V1-TO-PROD-V2-UPGRADE-SPEC.md` |
| CLI cross-platform read-only | IMPLEMENTED / NOT TESTED | `scripts/release-v2/upgrade.mjs`, apenas doctor/plan/status/help |
| Merge `main` na V2 | BLOCKED | Divergência de 2 commits exclusivos V1, incluindo arquivos com chave privada age confirmada no histórico público |
| Merge `auth` (incorpora `security` e `tenant`) | BLOCKED | Falhas/ausência de testes integrados no SHA atual e gate R15 |
| Merge `B2` na V2 | DEFERRED | PR #2 é draft; seis commits documentais e gate geral NO-GO |
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
- Infraestrutura: `deploy/nginx/wa-evomenu.conf`, `ecosystem.config.js`, `start.sh`, `scripts/enable-remote-access.sh` e `scripts/expose-database-subdomains.sh`. Requerem revisão individual de permissões, exposição de portas, compatibilidade com Caddy e serviço operacional antes de incorporar.
- A presença histórica de arquivos de backup e rede não constitui justificativa para manter acessos remotos ou publicar dados privados.

## Pendências graves herdadas dos documentos B2

1. Identidade inequívoca do artefato instalado e seu SHA (não confundir B1 histórica com tag de release publicada).
2. Três linhagens/checksums Prisma V1, drift de `ProcessingResult`, erro P3018 e migração incremental V2; preservar `_prisma_migrations` sem reparo automático.
3. Testes isolados em fonte anterior não substituem validação da V2: documentos B2 reportam falha histórica de TS/lint e ausência de teste final no commit congelado.
4. Autenticação, MFA/TOTP, API keys, OAuth/PKCE, superadmin e isolamento entre dois tenants; incluir chamadas MCP, processos não HTTP e fluxo de WhatsApp.
5. Segurança R15, mídia privada/Turbopack, URL base e proxy.
6. Captura e recuperação do trabalho local em worktrees e testes de rollback em cópia representativa.
7. Credenciais possivelmente rastreadas e distribuídas pelo histórico Git exigem ação específica antes de publicação.

## Como executar o trabalho de integração com segurança

1. Fora da produção, antes de cada merge: atualizar refs, congelar SHAs, listar worktrees e alterações não publicadas, inventariar delta por arquivo, salvar cópias/hashes fora do repositório.
2. Criar branch **temporária de integração** a partir de `release/prod-v2`, sem alterar a V1. Merge não destrutivo de `main`; resolver manualmente cada conflito. Verificar que nenhum arquivo sensível segue para bundle.
3. Merge de `codex/auth-whatsapp-identity-linking-20261108` (contém tenant/security) e B2, com PRs separadas e revisão de todos os arquivos alterados.
4. Rodar checks no SHA congelado usando scripts existentes do projeto; testar DB em MySQL de sandbox, migrar V1 restaurada e comprovar retomada/rollback.
5. Apenas com R00–R12 VERIFIED, integrar na branch de release, gerar manifesto assinado e tag. A marca `release/prod-v2` por si não é release publicada.
6. Produção deve ser atualizada somente após autorização separada para o destino, janela, backup e serviço.

## Evidências que faltam nesta execução GitHub-only

Não se observaram status Git local, dados do banco efetivo, processos, build de Node, resultados de HTTP ou a possibilidade de restauração. Não reproduzir a validação histórica como se tivesse sido executada hoje. As mudanças atuais são documentação e CLI read-only e não alteram V1, `main`, workloads ou bancos.

## Comando de preparação disponível na branch

```sh
node scripts/release-v2/upgrade.mjs doctor
node scripts/release-v2/upgrade.mjs plan
```

O comando **não realiza upgrade** nesta fase. `upgrade`/`resume`/`rollback` terminam com `BLOCKED_NOT_IMPLEMENTED` e exit 20. Isso impede uma atualização insegura enquanto faltam manifesto, backups restaurados, reconciliação Prisma e gates.

## PRs de integração registrados (não mesclados)

- [PR #3 — main → release/prod-v2](https://github.com/fabriciocs/ConectaFlow/pull/3), DRAFT / BLOCKED.
- [PR #4 — auth (inclui security/tenant) → release/prod-v2](https://github.com/fabriciocs/ConectaFlow/pull/4), DRAFT / BLOCKED.
- [PR #5 — B2 → release/prod-v2](https://github.com/fabriciocs/ConectaFlow/pull/5), DRAFT / DEFERRED.

GitHub reportou mergeability=true para os três PRs no snapshot desta inspeção, **apenas** como ausência de conflito Git detectado. Isso não aprova segurança, funcionalidade, privacidade ou rollout.

## Verificação do CLI nesta rodada

- Conteúdo de `upgrade.mjs` e `upgrade.test.mjs` confirmado na branch por blob SHA do GitHub.
- Corpo JavaScript inspecionado por parser depois de remover as diretivas de importação ESM para avaliação estática: PASS. **Não** substitui `node --check` nem `node --test`.
- Testes versionados em `scripts/release-v2/upgrade.test.mjs` para fail-closed, status NO-GO e não exposição de valores de credenciais. Não executados em Node nesta rodada, pois o GitHub connector não oferece execução de comandos e a recuperação de arquivos pelo ambiente efêmero de testes não estava disponível.
- Release publicada, code merge, upgrade real e testes de banco/HTTP: NÃO EXECUTADOS.

## Contenção P0 posterior ao inventário inicial — 2026-11-11

- VERIFIED por inspeção GitHub: `release/prod-v1` `dcc263e4` e `release/prod-v2` `9f955b26` não mantêm `backups/.age-backup-key` no HEAD. O diretório `backups/` inteiro foi excluído nesses commits concorrentes.
- IMPLEMENTED: `.gitignore` existente na V2 ignora identidades e backups; `.dockerignore` exclui esses arquivos do contexto de build.
- IMPLEMENTED: detector `scripts/security/check-tracked-secrets.mjs` e testes sintéticos `scripts/security/check-tracked-secrets.test.mjs` publicados; regras puras verificadas em ambiente V8 com 9/9 casos de caminhos e 3/3 casos de conteúdo sintético. Execução completa `node --test` ainda NOT VERIFIED.
- IMPLEMENTED: [runbook P0 de rotação e histórico](SECURITY-P0-AGE-ROTATION-AND-HISTORY.md).
- BLOCKED: utilização da chave em backups, rotação, recriptografia, prova de restauração e eventual revogação de PAT válido; não existe acesso demonstrado aos hosts/secret manager/armazenamento protegido.
- DEFERRED: reescrita de histórico Git e caches, que requer autorização separada, congelamento e coordenação de clones/forks.
- POSSIBLE REGRESSION: `backups/backup-system.sh` foi removido como parte da contenção; necessidade de restabelecer capacidade de backup por alternativa segura deve ser avaliada antes de upgrade.

**Decisão:** P0 HEAD-CONTAINED / ROTATION-BLOCKED / HISTORICAL-EXPOSURE-OPEN. Não transformar em `VERIFIED` ou GO para produção sem comprovação da revogação e do restabelecimento de backups.
