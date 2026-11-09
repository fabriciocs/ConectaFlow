# B2 — Registro de gates, decisões e evidências
Baseline observada em 2026-11-09; revisto a cada alteração de SHA. Não usar como substituto de verificação ao vivo.

## Estado agregado
PREPARAÇÃO = IMPLEMENTED; FETCH/FF PULL = VERIFIED; WORKTREE REPAIR = VERIFIED; INTEGRAÇÃO = BLOCKED; RELEASE = NO-GO.
A PR #2 é draft, destinada a documentação e preparação; ainda não contém merge de todas as features.

| Gate | Requisito | Estado atual | Evidência / lacuna | Próximo ato |
| --- | --- | --- | --- | --- |
| G00 | Inventário de repo e fontes | VERIFIED (snapshot) | Git refs, worktrees, pacote, routes, schema | revalidar antes de escrever |
| G01 | Preservação de TODO trabalho | PARTIAL | estados locais identificados; patches não consolidados em snapshots restauráveis | salvar snapshots com checksum/ACL |
| G02 | B1 identificado; delta e upstream | PARTIAL / BLOCKED | fetch completo e upstream verificados; B1 sem tag/release inequívoca | identificar commit/artefato B1 |
| G03 | Integração e conflitos | BLOCKED | autenticação, segurança, tenant, OAuth, QR, deps, réplica, UI não integrados | integrar com worktrees isolados |
| G04 | Segurança R01–R15 | BLOCKED | documento da branch de remediação registra R15 NO-GO | revisão e testes adversariais |
| G05 | Prisma V1/V2 e P3018 | BLOCKED | B2 não contém arquivos V2; ensaio de banco virgem não feito nessa candidata | trazer implementação e testar backup/restore |
| G06 | Isolamento multi-tenant | BLOCKED | branch de tenant separada; cobertura integrada desconhecida | matriz de grants e 2 tenants/2 users |
| G07 | OAuth/MFA/logout/API keys | BLOCKED | código/worktrees concorrentes não integrados; fluxos reais não validados | contrato unificado + testes |
| G08 | Sessão/QR/replica/WhatsApp | BLOCKED | worktree QR e replica com alterações pendentes | testes idempotentes e leases |
| G09 | OpenAPI/UI/MCP/assets | PARTIAL | 104 route.ts e 86 paths Swagger observados, paridade não analisada | matriz método/rota e teste por URL base |
| G10 | TypeScript/lint/unit/build/MCP | FAILED em baseline histórico; NOT_VERIFIED em B2 final | testes auth separados: TS erro, lint 32 errors/10 warnings, unit+bootstrap offline PASS; branch mudou durante teste | fixar SHA, reinstalar deps isoladas e reexecutar |
| G11 | Ensaio upgrade B1→B2 | BLOCKED | backup/restore/B1 não comprovados para B2 | ensaio de instalação nova e de base restaurada |
| G12 | Merge/release assinada | BLOCKED | PR #2 draft e main preservada, nenhuma tag B2 | liberar só depois de G00–G11 |
| G13 | Upgrade/observabilidade produção | DEFERRED | nenhuma ação de produção autorizada/executada | aprovação e janela específicas |
| G14 | Handover e documentação | IMPLEMENTED (parcial) | docs/B2 e guia preparados, não representam aceite funcional | completar após integração e release |

## Discrepâncias que NÃO devem ser normalizadas automaticamente
D01: B1 é designação informal sem commit/tag/release oficialmente identificado no histórico consultado.
D02: a candidata B2 continua na família de package.json versão 1.7.0; definir versão somente depois da decisão do release owner.
D03: bootstrap V2 e esquema tenant existem em outras branches, não na candidata B2.
D04: worktrees com mudanças untracked/unstaged têm risco de perda em merge ou clean; preservar via snapshot externo antes de integrar.
D05: quatro worktrees sob .remote-desktop perderam caminhos ao renomear C:/repos/WA-AKG para C:/repos/ConectaFlow; repair verificado e patches deps mantidos.
D06: testes anteriores da branch auth tiveram HEAD concorrente alterado durante execução; não provam qualidade da candidata B2.
D07: upstream alterou funding e badge do projeto original; merge de ancestry B2 preservou conteúdo e identidade do fork.
D08: GitHub apresenta duas PRs draft e nenhuma release B1/B2 publicada no momento da inspeção.
D09: scripts npm na B2 ainda não incluem db:bootstrap:v2:test. O Check foi adaptado para distinguir ausência de gate de sucesso dos testes independentes.
D10: endpoints no swagger e arquivos route.ts usam granularidades diferentes; contagens isoladas não determinam mismatch.

## Registro de evidência por tarefa (schema obrigatório)
Campos mínimos em futuros reports locais protegidos:
task_id, gate_id, scope, worktree, base_sha, result_sha, command_or_tool, expected, observed, exit_code, status, started_at, completed_at, log_ref, reviewer, risk, conflicts, rollback, approval_ref.
Observação: NUNCA enviar segredo, DB dump, AuthState, cookies, chave privada ou mensagem de WhatsApp para docs GitHub, PR ou logs não protegidos.

## Condição de decisão
READY_FOR_REVIEW somente com todos G00–G11 completos e verificáveis. RELEASE_GO só após revisão, aprovação e tag vinculada ao SHA assinado. Um gate bloqueado resulta em NO-GO, não em bypass ou documento declarando sucesso.
