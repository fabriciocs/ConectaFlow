# ConectaFlow — Atualização segura da V1 para a candidata Prod V2

**Estado em 2026-11-11: INTEGRAÇÃO GIT CONCLUÍDA / DEPLOY NO-GO.** Este arquivo substitui instruções antigas que recomendavam executar `git pull`, `./start.sh` e `prisma db push` diretamente sobre um ambiente em produção.

A branch `release/prod-v2` contém os históricos da `release/prod-v1`, `main`, multi-tenancy, segurança, autenticação e B2. **Não é uma release publicada** e o campo `version` do `package.json` ainda reflete a versão do código-fonte, não uma versão homologada Prod V2.

## Comandos disponíveis (somente leitura)

No checkout da V2, com Node 22 ou superior:

```sh
node scripts/release-v2/upgrade.mjs doctor
node scripts/release-v2/upgrade.mjs plan
node scripts/release-v2/upgrade.mjs status
node scripts/security/check-tracked-secrets.mjs
```

Esses comandos não migrarão dados nem instalarão ou reiniciarão serviços. O resultado de `doctor` é um diagnóstico **estático e incompleto**, sem teste de HTTP, MySQL, autenticação, WhatsApp ou recuperação. Verifique também se o status Git está limpo e se existem worktrees ou patches locais antes de qualquer operação.

**Ainda não implementado:** `node scripts/release-v2/upgrade.mjs upgrade`, `resume` e `rollback`. Eles encerram de modo seguro com `BLOCKED_NOT_IMPLEMENTED` (exit 20). Não tratar isso como uma atualização executada.

## Procedimento proposto para futura implantação autorizada

1. Identificar o exato commit/artefato V1 **instalado**, inventariar alterações staged/unstaged/untracked, infraestrutura, versões e módulos. Nunca substituir diretamente o checkout com alterações.
2. Tratar o incidente [P0 da chave age](release-v2/INCIDENT-P0-AGE-KEY-20261111.md): rotação no ambiente autorizado, análise de backups afetados e teste de recriptografia/restauração. A chave antiga permanece no histórico Git.
3. Confirmar artefato/manifesto V2 assinado, checksums, compatibilidade de Node, Prisma, MySQL e fluxos. Validar que o build não contém mídia privada ou credenciais.
4. Fazer backup consistente e cifrado do banco, credenciais de sessão WhatsApp, mídia, configuração e agendamentos; comprovar restore em sandbox antes de migrar.
5. Ensaio em cópia restaurada da V1: classificar histórico Prisma, verificar P3018/drift e diferenças do esquema, testar migrações aditivas e seus estados intermediários.
6. Rodar TypeScript, lint, unit, MCP, build, segurança, OAuth/MFA/API keys, HTTP e isolamento entre dois tenants, OpenAPI, QR e leases.
7. Ensaiar falhas, checkpoints, retomada e rollback/forward-fix preservando dados. Aprovar janela, responsáveis e critérios RTO/RPO.
8. Somente após gates e autorização **separada** publicar manifesto/tag/release e executar upgrade controlado, observado e reversível.

Especificações: [V1 → V2](release-v2/PROD-V1-TO-PROD-V2-UPGRADE-SPEC.md), [integração](release-v2/INTEGRATION-REGISTER.md), [runbook B2](B2/03-UPGRADE-AND-SYNC-RUNBOOK.md), [gates B2](B2/05-GATE-TRACKER.md).

## Scripts históricos: V1 e risco de mutações

O `start.sh` original executava instalação de dependências, `prisma db push`, criação de conta administrativa e reinicialização de PM2. **Não é um comando de upgrade Prod V2.** Na candidata V2, há um bloqueio explícito `BLOCKED_LEGACY_UPGRADE_SCRIPT` antes de qualquer mutação. O arquivo histórico permanece na V1 e no histórico Git.

Não execute `npm run db:push`, `prisma migrate reset`, `git reset --hard`, `git clean`, rebase, restauração por cima de dados ativos, exclusão de volumes ou reinicialização de processos de terceiros para contornar os gates. Evite usar `npm install` em vez de `npm ci` durante a preparação, pois isso pode modificar o lockfile.

O configurador `npm run setup` também altera arquivos de configuração e **não** faz parte do diagnóstico read-only; utilize somente com backup, operador autorizado e plano de reversão.

## Segurança e configuração

- `.env` não deve ser publicado; somente nomes de variáveis podem integrar evidências públicas. Segredos nunca em `NEXT_PUBLIC_*`.
- Uso de `Caddy`/`ngrok` deve respeitar o host e o caminho base autorizados; callbacks OAuth precisam validar origem e redirect.
- O serviço PM2 legado `wa-evomenu`, suas rotas Nginx e scripts de exposição de portas dependem da instalação real; **não** habilitá-los por inferência.
- O banco real pode ter históricos Prisma V1 distintos. A reconciliação de checksums de um sandbox não autoriza corrigir outros bancos automaticamente.
- O scanner de credenciais cobre o HEAD verificado e **não** limpa segredos publicados em commits antigos.

## Critério de liberação

**RELEASE_GO** somente com as etapas R00–R12 e os gates de segurança, schema, tenant, OAuth, MCP, backups/restore e rollback **VERIFIED** no mesmo SHA do manifesto. Até lá: `release/prod-v2` = candidata integrada, não versão de produção pronta.
