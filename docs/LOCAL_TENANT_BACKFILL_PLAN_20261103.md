# Plano de backfill multi-tenant local — 2026-11-03

**Estado final:** `VERIFIED` (backup, restauração, ensaio e aplicação do backfill ao MySQL local); `NOT_VERIFIED` (autorização HTTP/E2E da aplicação). A operação de aplicação foi autorizada separadamente após o ensaio, com validação de integridade e preservação dos dados legados excluídos do plano.

## Ambiente e preservação

- Banco: `wa_akg` em `127.0.0.1:3306`, MySQL.
- Branch: `feature/multi-tenant-isolation-20261103`; alterações preexistentes em `src/lib/private-media.ts` e seu teste, documentação e migração corretiva não rastreadas preservadas.
- Prisma: 14 migrações, schema atualizado (`prisma migrate status`: código de saída 0).
- Script inspecionado: `scripts/tenant-backfill.mjs`; suporta planejamento somente leitura e aplicação condicionada a nome exato do banco, fingerprint SHA-256 do plano e operador.
- Planejamento executado: `node --env-file=.env scripts/tenant-backfill.mjs`; `READ_ONLY_PLAN`, código de saída 0.
- Fingerprint do planejamento inicial: `69f09023b352e1b991b11e659f1e85eb63d8d8cc3d8673120196d014184ef53a`. Revalidar imediatamente antes de qualquer aplicação, pois poderá mudar.
- O backup da etapa anterior retrata o banco **antes da migração**; o backup pós-migração foi criado e restaurado com sucesso neste gate (evidências abaixo).

## Resultado do planejamento

| Recursos | Atribuições propostas | Sem atribuição por segurança |
| --- | ---: | ---: |
| Session | 3 | 0 |
| Contact | 6.081 | 0 |
| Message | 11.548 | 0 |
| Group | 45 | 0 |
| BotConfig | 3 | 0 |
| AuthState | 14.435 | 0 |
| WhatsAppSessionLease | 3 | 0 |
| InboundEvent | 7.920 | 0 |
| OutboundMessageOperation | 1 | 0 |
| Notification | 1 | 0 |
| Webhook | 2 | 0 |
| WebhookLog | 518 | 0 |
| SessionAccess | 0 | 1 |
| **Total** | **40.560** | **1** |

Planejados ainda **6 tenants pessoais**. Outros recursos da matriz não possuem registros elegíveis no momento.

Os registros legados OAuth que permanecerão não atribuídos são: 5 clientes, 26 pedidos de autorização, 19 códigos, 141 access tokens, 141 refresh tokens, 5 grants e 5 concessões de capacidade de sessão. **Total: 342 registros.** Esta exclusão é deliberada: o script exige novo consentimento e definição explícita de escopo, sem ampliar permissões automaticamente.

A linha `SessionAccess` restante refere-se a um compartilhamento legado com usuário não proprietário; **não converter para concessão multi-tenant por aproximação**.

## Gates para aplicação segura

1. Confirmar novamente Git, banco e aplicação/processos; não interromper outros serviços.
2. Produzir um novo `mysqldump` completo com `--single-transaction`, checksum e evidência de conclusão, fora do Git, protegendo dados e credenciais.
3. Restaurar no MySQL 8.0 isolado com `lower_case_table_names=1`, reproduzindo o ambiente Windows, e verificar tabelas e dados.
4. Executar dry-run no banco restaurado; confirmar fingerprint e distribuição previstos; aplicar backfill **somente na cópia**, com o guard de fingerprint. Validar 6 tenants, 6 memberships OWNER ativos, 6 eventos de auditoria, plano posterior sem atribuições elegíveis e preservação de OAuth e compartilhamento legado.
5. Somente se o ensaio passar, executar o backfill no banco local autorizado, exigindo o mesmo fingerprint do ensaio em nova leitura no instante da aplicação; verificar contagens, auditorias, ausência de desvios, dados pré-existentes e funcionamento das consultas ORM.
6. Documentar falhas, não executar `db push`, `migrate reset`, envios WhatsApp, push, merge nem deploy. Depois, fazer E2E de isolamento por tenant/usuário como gate independente.

## Bloqueio observado na tentativa anterior (superado)

A ferramenta Remote Desktop Commander recusou a execução do procedimento de segurança local de backup/ensaio, mesmo com código preparado fora do repositório em `%LOCALAPPDATA%\WA-AKG\MigrationSafety\20261103-additive-tenant\backfill-guard.mjs`.

**Atualização histórica:** o script de automação foi validado sintaticamente e executado. O backup pós-migração, a restauração e o backfill em cópia isolada passaram. Naquela etapa, a aplicação ao banco local ainda estava adiada; posteriormente foi autorizada e concluída, conforme a seção final.

**Registro de evolução:** o gate de aplicação ao banco local foi autorizado e executado posteriormente; consultar a seção "Aplicação no banco local" ao final. O gate seguinte é a validação de isolamento HTTP/E2E.

## Evidências do gate: backup e ensaio isolado (VERIFIED)

**Ambiente:** Windows / PowerShell 5.1, Node.js v24.22.0, banco MySQL local `127.0.0.1:3306/wa_akg`, container MySQL 8.0 efêmero e `lower_case_table_names=1`.

**Backup pós-migração:** `%LOCALAPPDATA%\WA-AKG\MigrationSafety\20261103-additive-tenant\wa_akg-postmigration-before-backfill.sql` (27.205.629 bytes, SHA-256 `b60b6c20eb15d732818bc5ef6f05ac4db19c06ef198e783a70c2fc3f42020f92`). Dump com `--single-transaction`, concluído e validado. Nunca versionar o arquivo: contém dados reais.

**Comandos executados, resultados:**
- `git status --short --branch`, `git diff --cached --stat`, `git log -1 --oneline`: trabalho existente preservado, sem alterações staged.
- `node --check <guard>`: código de saída 0.
- `node --env-file=.env <guard> --inspect`: esquema 43 tabelas; fingerprint `69f09023b352e1b991b11e659f1e85eb63d8d8cc3d8673120196d014184ef53a`; 6 tenants pessoais e 40.560 atribuições previstas.
- `node --env-file=.env <guard> --backup`: primeira tentativa falhou (`mysqldump` rejeitou `--batch`), sem gerar dump. Após corrigir o argumento no guard, execução bem-sucedida, código de saída 0.
- `node --env-file=.env <guard> --rehearse`: restore do dump em container isolado (porta local efêmera), fingerprint idêntico, backfill aplicado somente no container, pós-verificações aprovadas, código de saída 0 em 79,17 s. Container encerrado e removido.
- `node --env-file=.env <guard> --inspect` após o ensaio: plano original e fingerprint inalterados no banco local.

**Resultado observado na cópia:**
- 6 registros `Tenant`, 6 `TenantMembership` ativos como `OWNER`, 6 registros `AuditEvent` com ação `LEGACY_TENANT_BACKFILL`;
- nenhuma atribuição elegível restante ao reexecutar o plano; nenhuma criação pessoal pendente;
- 1 `SessionAccess` legado e 342 registros de credenciais/grants OAuth antigos permaneceram sem atribuição, intencionalmente.

**Evidências estruturadas locais, fora do repositório:** `backfill-backup-evidence.json` e `backfill-rehearsal-evidence.json` no mesmo diretório protegido de MigrationSafety.

**Limites:** o ensaio valida banco e regras de atribuição, não comprova a autorização HTTP/E2E do aplicativo. Nenhuma alteração de dados ocorreu em `127.0.0.1:3306` nesta etapa. O script guard temporário está fora do Git, foi validado no fluxo realizado, mas não deve substituir nova revisão antes de aplicar em banco real.

**Gate concluído depois deste ensaio:** atualização de 40.560 registros aplicada ao MySQL local com o mesmo fingerprint; ver seção posterior. **Pendente:** validar segregação HTTP/E2E e reconciliação explícita das permissões legadas.

## Aplicação no banco local — 2026-11-03 21:12 BRT (VERIFIED)

**Autorização:** confirmação do usuário nesta conversa para atualizar os registros elegíveis do banco local `wa_akg` (`127.0.0.1:3306`), estritamente conforme plano ensaiado. Excluídos do escopo: conversão de 1 `SessionAccess` legado entre proprietários, 342 registros OAuth legados, alteração de credenciais, envio de mensagens, Git push, merge e deploy.

**Comando:** `node --env-file=.env %LOCALAPPDATA%\WA-AKG\MigrationSafety\20261103-additive-tenant\backfill-guard.mjs --apply-live` executado a partir do repositório. Resultado: `LIVE_BACKFILL_VERIFIED`, código de saída **0**, duração **21,73 s**.

**Proteções cumpridas antes de gravar:** alvo MySQL exato, estrutura de 43 tabelas e migração aplicada, dump com SHA-256 `b60b6c20eb15d732818bc5ef6f05ac4db19c06ef198e783a70c2fc3f42020f92`, ensaio restaurado aprovado, fingerprint do plano `69f09023b352e1b991b11e659f1e85eb63d8d8cc3d8673120196d014184ef53a` conferido novamente.

**Resultado direto no MySQL:** 6 tenants pessoais, 6 memberships `OWNER` ativos e 6 eventos de auditoria `LEGACY_TENANT_BACKFILL` vinculados à operação `48a97b34-692d-45bf-ba08-0fff32e5cbc3`; 40.560 registros atribuídos nas 12 classes descritas acima.

**Verificação pós-escrita:** `--inspect` retornou 0 tenants pessoais pendentes e 0 atribuições elegíveis. O plano passou ao fingerprint `fd9833a163fa095c170c44484e41498ca757876b898a6a5bbd1b8e839511d74a`. Mantidos 1 compartilhamento legado e 342 registros OAuth sem associação automática. `prisma migrate status` retornou 14 migrações, schema atualizado, exit 0. `scripts/tenant-inventory.mjs` retornou `queryIssues: []`, 6 usuários, 3 sessões, nenhuma sessão sem dono e nenhuma anomalia referencial adicional no inventário.

**Testes locais posteriores:** `npm test` = 225 aprovados, 0 falhas, exit 0; `tsc --noEmit` = exit 0. Estes testes não substituem validação HTTP E2E de segregação entre tenants.

**Evidências:** `%LOCALAPPDATA%\WA-AKG\MigrationSafety\20261103-additive-tenant\backfill-live-evidence.json` e os artefatos `backfill-backup-evidence.json`/`backfill-rehearsal-evidence.json`, protegidos fora do repositório. Dump é confidencial e deve ser preservado.

**Pendências distintas:** provar autorização HTTP real com pelo menos 2 tenants e usuários; reconciliar compartilhamento legado por política explícita; rediscutir credenciais OAuth por consentimento; revisar ownership de mídias; versionar a migração corretiva e a documentação antes de propagá-las a outros ambientes. Não aplicar o mesmo backfill novamente.

### Verificações adicionais depois da aplicação

- `npm test`: **225 PASS**, 0 FAIL, 0 SKIP, 10 suites, exit 0 (23,50 s).
- `npm run lint`: **exit 0**; 13 avisos não bloqueantes de ESLint já presentes, 0 erros (77,76 s).
- `node_modules/.bin/tsc.cmd --noEmit`: **exit 0** (17,53 s).
- `git diff --check`: **exit 0**, apenas avisos de conversão LF/CRLF nos dois arquivos de mídia anteriormente modificados.
- A aplicação da atualização não alterou os arquivos de código nem reordenou mudanças Git existentes. A documentação permanece local, ainda não commitada.
- **NOT_VERIFIED:** autenticação/autorização HTTP real e testes E2E da interface com tenants distintos. Não houve envio de mensagens WhatsApp, alteração de dados em outros bancos, reinicialização de serviços, deploy, push ou merge.
