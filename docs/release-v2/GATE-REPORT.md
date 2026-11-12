# Prod V2 — Gate report de consolidação dos PRs

**Data:** 2026-11-11 (horário de Brasília).  
**Repositório:** `fabriciocs/ConectaFlow`.  
**Branch:** `release/prod-v2`.  
**Decisão:** **GIT_INTEGRATED / PRODUCTION_NO_GO**.

## 1. Operações remotas realizadas

| PR | Fonte | Destino/resultado | Integração |
|---|---|---|---|
| #6 | `release/prod-v1` (remoção do HEAD da pasta sensível) | MERGED em Prod V2 | `9f955b26c6e7faa7510eff392753f73516a4b519` |
| #3 | `main` | MERGED em Prod V2 | `7fb04e6a5bdc163bd1baaf02d21c906e21bea790` |
| #4 | `codex/auth-whatsapp-identity-linking-20261108` | MERGED em Prod V2 (contém tenant+security) | `8a7cf444b7b68afafb7fa5b1f4c31958cc22b402` |
| #5 | `release/b2-integration-20261109` | MERGED em Prod V2 | `44227be6bef208fd25e9f10ac4f07a4170c49c3e` |
| #1 | `feature/multi-tenant-isolation-20261103` → `main` | CLOSED / SUPERSEDED por #4 | Commits já alcançáveis em Prod V2 |
| #2 | `release/b2-integration-20261109` → `main` | CLOSED / SUPERSEDED por #5 | Commits já alcançáveis em Prod V2 |

Os merges #3, #4 e #5 foram materializados em commits **com dois pais**, sem rebase nem force-push; os HEADs originais e `main` não foram sobrescritos. `GitHub compare` confirmou `behind_by=0` para V1, main, tenant, security, auth e B2 em relação à candidata.

### Estratégias de resolução

1. **#3 / main:** árvore baseada na `main` com sobreposição de 18 caminhos específicos da V1/V2. Regras de `.gitignore` e `.dockerignore` unidas aditivamente. Mantidos arquivos de implantação `wa-evomenu`, `start.sh` e proteções P0. `src`, `prisma` e `package.json` eram equivalentes aos da main nesta etapa.
2. **#4 / auth:** árvore baseada na branch auth, com 18 sobreposições específicas da V1/V2 e união de regras de ignore. Validado que `src`, `prisma`, `package.json` eram os da auth; mantidas as configurações V1 de PM2 e scripts históricos e nenhum diretório `backups/` foi criado.
3. **#5 / B2:** base da candidata auth/V2, sobreposição restrita aos 9 arquivos B2 de `docs/` e `scripts/Sync-Fork-B2.ps1`; integridade de `src`, `prisma`, `package.json`, `.gitignore` e `.dockerignore` preservada.

O conector GitHub primeiro recusou merge automático do #3 por conflito real. A resolução não usou descarte de worktree ou force-push; foram criados objetos Git de árvores e commits com dupla parentalidade. Os PRs foram posteriormente reconhecidos como `merged` pelo GitHub.

## 2. Adaptações pós-merge

- `start.sh` na V2 agora aborta com `BLOCKED_LEGACY_UPGRADE_SCRIPT` e exit 20 quando detecta a especificação V2 relativa à própria localização, **antes** de instalar dependências, executar `prisma db push`, gerar build ou reiniciar PM2.
- `docs/UPDATE_GUIDE.md` não instrui mais a realizar `git pull && ./start.sh` para atualizar produção; documenta diagnóstico apenas de leitura e plano para backup/restauração.
- `scripts/release-v2/start-guard.test.mjs`: teste estático versionado para impedir regressão do bloqueio.
- `package.json`: script `test:release-v2` adicionado; invoca quatro suítes Node explicitamente para compatibilidade de shell Windows/Linux/macOS, sem alterar a versão `1.7.0` ou lockfile.
- `docs/release-v2/INTEGRATION-REGISTER.md` e a especificação V1→V2 atualizadas para o novo estado real.

## 3. Matriz de evidências e pendências

| Gate | Estado | Evidência / ação necessária |
|---|---|---|
| H01 — Nenhum PR aberto | VERIFIED | GitHub API `pulls?state=open` retornou `[]` após fechar #1/#2 e mesclar #3/#4/#5 |
| H02 — Ancestralidade completa | VERIFIED | `compare` GitHub, `behind_by=0` de seis refs |
| H03 — Preservação da V1/main | VERIFIED (remoto) | Sem mudança no SHA da `main` ou `release/prod-v1` no ciclo de consolidação |
| H04 — Conteúdo de código integrado | VERIFIED (árvores Git) | HEAD da candidata contém `src`, `prisma` e `package.json` da auth; docs B2 e arquivos V1 preservados |
| H05 — Remoção de backup sensível do HEAD | VERIFIED (HEAD) | Árvore integrada sem diretório `backups/`; ignores preservados |
| H06 — Incidente age P0 resolvido | BLOCKED | A chave segue em commits históricos; rotação, recriptografia e análise de acesso não verificadas |
| H07 — Segurança R15 / mídia privada | BLOCKED | Testes de segurança e prova de ausência de dados privados no build pendentes |
| H08 — TypeScript, ESLint, testes Node, MCP e Next build | NOT VERIFIED | Nenhum executor de Node com checkout completo foi utilizado neste ciclo |
| H09 — Prisma V1/V2, P3018 e upgrade de base restaurada | BLOCKED | Necessita clone restaurado e autorização operacional; zero migrações executadas |
| H10 — Isolamento por 2 tenants/HTTP/OAuth/MFA/API keys | BLOCKED | Testes integrados no SHA candidato não executados |
| H11 — WhatsApp, webhook, sessions, leases e proxy base | BLOCKED | Requer testes controlados, sem envio real não autorizado |
| H12 — CLI de upgrade e rollback real | BLOCKED | `upgrade`, `resume` e `rollback` ainda falham fechados com exit 20 |
| H13 — Release, tag e produção | DEFERRED / NO-GO | Não foram feitas publicação nem implantação |

### Validação local proposta no checkout isolado

Após inventariar worktrees e confirmar a limpeza/preservação do trabalho:

```sh
npm ci
npm run test:release-v2
npx prisma validate
npx tsc --noEmit
npm run lint
npm test
npm run mcp:check
npm run mcp:test
npm run build
```

Somente em sandbox autorizado: `npm run db:inspect`, `npm run db:bootstrap:v2:test`, testes HTTP com dois tenants, migração a partir de backup V1 restaurado e ensaios de falha/retomada/rollback. Nunca rodar `prisma db push` em banco de produção como mecanismo automático de upgrade.

O script `scripts/Sync-Fork-B2.ps1` é operacional de preparação e não substitui a etapa de validação. Scripts de exposição de rede herdados da V1 existem, mas não foram executados nem homologados.

## 4. Critério de aceite

Este relatório comprova **consolidação remota das branches**, não a prontidão de produção. A promoção exige testes estáticos e operacionais sobre SHA congelado, restauração verificável, classificação Prisma, resolução do P0 age, segurança R15 e decisão formal `RELEASE_GO` em janela autorizada.

**Estado final deste ciclo:** `INTEGRATION=VERIFIED`; `TESTS=NOT_VERIFIED`; `UPGRADE=BLOCKED`; `DEPLOY=DEFERRED`.
