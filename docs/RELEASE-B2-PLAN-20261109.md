# B2 — integração controlada e atualização segura (2026-11-09)

Estado: **IMPLEMENTED (preparação)**; integração funcional **BLOCKED**; release pública **NO-GO**.

## Identidade e referência

- Fork oficial nesta operação: `fabriciocs/ConectaFlow` (antigo `fabriciocs/WA-AKG`); branch padrão `main`.
- Upstream original: `mrifqidaffaaditya/WA-AKG`, branch `main`.
- Base local da candidata: `main` em `e7936598319fc6c07584b24dbf21814f45fc2e56`.
- Worktree separado: `C:\repos\WA-AKG-B2-integration`; branch `release/b2-integration-20261109`.
- Diretório principal foi renomeado externamente durante a auditoria: agora `C:\repos\ConectaFlow`. O vínculo administrativo do worktree B2 foi reparado e verificado.
- Não foi identificada release GitHub chamada `B1` nem tag literal `B1` no inventário inicial. Existe `v1.7.0-beta.1`, ancestral da `main`, mas **não** se presume que `B1` signifique esse tag.
- A versão declarada em `package.json` permanece `1.7.0`. Não alterar versão, tag ou changelog como se B2 já estivesse liberada.

## Baseline Git e alterações que devem ser preservadas

- `main`: `e793659` (protegida).
- `codex/auth-whatsapp-identity-linking-20261108`: `f25fcef` (17 commits à frente da main).
- `feature/security-remediation-20261106`: `5b9ddfe` (13 commits à frente).
- `feature/multi-tenant-isolation-20261103`: `7d804ba`.
- `integration/wa-akg-main-20261104`: `6700154` (3 commits exclusivos em comparação à branch de autenticação).
- Há branches/worktrees de tenant schema, policy, API e enforcement com histórico que precisa de reconciliação.
- Durante a inspeção havia trabalho não commitado no worktree principal (`.codex/config.toml`), de OAuth, QR, integração geral, dependências, réplica e interface comercial. **Não executar reset, clean, checkout destrutivo, rebase nem commit automático dessas alterações.**
- Conferir status staged, unstaged e untracked **de todos os worktrees novamente** antes de qualquer promoção: os estados podem mudar.

## Sincronização do fork

- `upstream` foi configurado para `https://github.com/mrifqidaffaaditya/WA-AKG.git`.
- Fetch local concluído e verificado: `upstream/main = 04d6c0f5e484df469840697e3573654691792958`.
- Comparação `main...upstream/main`: 13 commits exclusivos do fork, 2 exclusivos do upstream.
- Os 2 commits upstream modificam apenas `.github/FUNDING.yml` (financiamento do autor original) e `README.md` (badge de divulgação do repositório original).
- Não substituir links de financiamento, identidade pública, configurações de segurança ou alterações privadas do fork por valores do upstream. Revisar cada atualização upstream antes de integrá-la.
- O fetch **não é merge**: o histórico de `main` e a árvore de trabalho permaneceram intocados.
- O script `scripts/Sync-Fork-B2.ps1` implementa Audit/Fetch/Prepare/Check de forma explícita; **não** faz push, merge, release, deploy, backup real ou migração automaticamente.

## Execução recomendada — Windows PowerShell 5.1

A partir do worktree B2, sem trocar a branch de outros worktrees:

```powershell
powershell.exe -NoProfile -File .\scripts\Sync-Fork-B2.ps1 -Mode Audit
powershell.exe -NoProfile -File .\scripts\Sync-Fork-B2.ps1 -Mode Fetch
powershell.exe -NoProfile -File .\scripts\Sync-Fork-B2.ps1 -Mode Check
```

`Prepare` só deve ser usado quando a branch e o diretório de destino **não existirem**. Os comandos acima não instalam pacotes. Para `Check`, dependências devem estar instaladas previamente nesse worktree (`npm ci`, aprovado e executado separadamente). Este repositório utiliza `package-lock.json` e scripts npm; não substituir por pnpm durante a atualização.

## Plano de integração B1 → B2

| Gate | Condição necessária | Situação em 2026-11-09 |
| --- | --- | --- |
| G01 Referência | Confirmar qual tag/commit/release corresponde a B1 | **BLOCKED**: identificador B1 ambíguo |
| G02 Baseline | Inventariar branches, commits locais, staged/unstaged/untracked e worktrees | **VERIFIED** no inventário inicial; revalidar antes da integração |
| G03 Fork | Fetch e comparação upstream sem perda de customizações | **VERIFIED** para fetch; merge ainda não realizado |
| G04 Segurança | R01–R15 com aceitação e ausência de regressões | **BLOCKED**: R15 marcado NO-GO em documentação existente |
| G05 Prisma | Bootstrap em banco novo, trilhas V1, reconciliação de P3018, backup/restore testados | **BLOCKED** até ensaio restaurável e validação de histórico |
| G06 Tenancy | Autenticação/autorização, API keys, sessão, QR, OAuth, MFA e isolamento entre tenants | **NOT_VERIFIED** como integração global |
| G07 Código | Comparar branch de autenticação, segurança, tenant e patches não commitados; resolver conflitos com trilha auditável | **PROPOSED** |
| G08 Testes | Prisma offline, unit, TypeScript, lint, MCP, build e HTTP/integração isolada | **PROPOSED** para árvore B2 integrada |
| G09 Upgrade | Backup, ensaio restaurável, plano de rollback, credenciais e downtime | **PROPOSED**; dados reais intocados |
| G10 Publicação | Candidato aprovado, release notes completas, tag sem ambiguidade, autorização efetiva | **BLOCKED** |

A ordem é G01–G09 → revisão independente → G10. Falha em um gate mandatório impede publicação, mas não impede documentação e verificações independentes.

## Procedimento de upgrade seguro

1. Identificar a versão em execução, branch/HEAD, serviços, portas e banco reais. Não parar processos de terceiros.
2. Confirmar `git status` limpo e snapshot dos patches não commitados do *alvo escolhido*. Não sobrescrever worktrees.
3. Fazer backup consistente de banco, mídias privadas e configuração protegida; verificar checksum e **restauração em ambiente isolado**.
4. Comparar B1 com candidata B2 por commits, migrações, variáveis de ambiente, permissões, API OpenAPI e contratos MCP.
5. Executar `npm ci` somente no worktree/ambiente de ensaio autorizado; não modificar a instalação de produção inadvertidamente.
6. Executar os testes definidos em G08; `npm run db:bootstrap:v2:test` é offline. `db:inspect` é somente inspeção e requer ambiente configurado.
7. Em banco descartável restaurado de backup, validar bootstrap e reconciliação; não usar `prisma db push`, `migrate reset` ou `migrate deploy` na base real automaticamente.
8. Aprovar o plano de migração por ambiente, com evidência de restauração e compatibilidade regressiva; manter backups até a validação posterior.
9. Publicar tag/release B2 somente com gates satisfeitos e notas contendo SHA, alterações, compatibilidade, migrações, riscos, rollback e checksums.
10. Executar upgrade do serviço real **separadamente** e apenas quando autorizado; verificar HTTP, autenticação, permissões, sessões WhatsApp e endpoints essenciais.

## Limites e rollback

- Em caso de conflito Git, preservar ambos os lados no worktree de integração, registrar arquivos conflitantes e parar; não escolher automaticamente uma implementação de autenticação, schema ou autorização.
- Rollback da aplicação deve utilizar a versão anterior imutável e backup restaurável. Nunca desfazer migração com perda de dados sem procedimento aprovado.
- A integração upstream deve preservar conteúdos próprios do fork; `git pull` indiscriminado ou sincronização automática de branch protegida não é um mecanismo de upgrade aceitável.
- Não criar GitHub Actions/Workflows. Todos os comandos são locais, deliberados e auditáveis.
- Nenhuma release/tag B2, merge em `main`, push ou deploy foi executado ao criar este documento.

## Evidências de origem

Inventários locais em 2026-11-09: `git status`, `git branch -a -vv`, `git worktree list --porcelain`, `git rev-list --left-right --count`, `git tag -l`, `git merge-base`, `git fetch upstream main`, versão Node `v24.22.0`, npm `11.19.1`; pnpm não encontrado, mas este repositório utiliza npm. Gatilhos de segurança em `AGENTS.md`, `docs/SECURITY-REMEDIATION-IMPLEMENTATION-20261106.md`, `docs/MULTI-TENANT-MIGRATION.md` e `docs/UPDATE_GUIDE.md`.

**Critério de conclusão:** somente declarar VERIFIED para a release após comprovar todos os gates e a tag remota final apontando ao SHA aprovado. Caso contrário, usar PARTIAL/BLOCKED.
