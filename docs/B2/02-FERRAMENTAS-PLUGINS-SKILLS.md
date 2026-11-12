# B2 — Ferramentas, plugins, skills, agentes e estrutura de execução
Atualizado em 2026-11-09. Esta matriz descreve papéis e capacidades existentes na sessão; não equivale a execução de todo o plano.

## 1. Seleção por capacidade
| Recurso | Classe / disponibilidade | Utilização B2 | Restrições |
| --- | --- | --- | --- |
| GitHub (plugin conectado) | GitHub: repositório, branches, commits, PRs | descobrir releases, consultar histórico, atualizar PR #2, anexar evidências, revisar, eventualmente tag/release após gates | não fazer force push, merge, publicação ou alteração de proteção sem gate e autorização |
| Remote Desktop Commander (plugin conectado) | computador Windows autorizado | inspeção de C:/repos/ConectaFlow, PowerShell 5.1, Git, Node/npm, testes, scripts, worktrees, logs e backup de ensaio | ler integralmente ambos os protocolos obrigatórios antes de operar; nunca reset/clean nem destruir dados |
| Codex Profile Selector (skills instaladas) | escolha de estratégia de engenharia/orquestração | decomposição DAG, planejamento e comandos revisáveis | não afirmar ter criado agentes ou execuções paralelas quando não ocorrerem |
| System Delivery Orchestrator (skills instaladas) | governança e verificação | discovery, change control, qualidade, gates e evidências | skill é método, não bypass de permissões |
| System Atlas Analysis (skills disponíveis) | arquitetura, investigação e reconciliação de evidências | analisar conflitos de fontes, estrutura, divergência código/docs e qualidade | não altera código automaticamente |
| Mermaid Chart (plugin disponível) | diagramas | mapa de dependência, fluxo OAuth/QR, ERD, gates e sequências | usar apenas para diagramas; revisão textual é a fonte canônica |
| Impeccable/UI UX Designer/Figma (plugins/skills disponíveis) | UX e design | revisão de onboarding, console, mobile-first, tokens e acessibilidade | opcionais; não alteram lógica de autorização |
| GitBook (plugin disponível) | publicação documental | versionar/manter referência OpenAPI e documentação revisada | opcional e só publicar com autorização separada |
| WA-AKG MCP (plugin disponível) | interface com sessões e mensagens autorizadas | smoke tests de leitura e conferência de contratos quando integração estabilizar | sem envio real, reação, grupo, foto ou operação externa sem autorização específica |
| Plugin Creator (skills disponíveis) | plugin ChatGPT | revisar eventual distribuição/integração do plugin ConectaFlow depois da release B2 | não necessário à release do core nem substitui testes MCP |
| PowerShell 5.1 + git + Node.js + npm | ferramentas locais confirmadas | operações reproduzíveis e scripts de upgrade | npm e package-lock, não pnpm nesta baseline; sem Playwright |
| Prisma + MySQL 8 | projeto usa Prisma/MySQL; serviço real precisa verificação | esquema, migrações, testes e restauração isolada | não usar prisma db push para migração crítica ou bancos reais |
| ESLint, TypeScript, Next.js, node:test | dependências/scripts do projeto | lint, tipos, build, unitários e smoke tests | rodar somente no worktree com deps compatíveis; sem falso positivo |
| curl.exe / Invoke-WebRequest | opção local após validação de disponibilidade | sondas HTTP e OAuth, sem clientes externos | não enviar tokens reais ao log |
| Docker Compose | arquivos do projeto; Engine não verificado nesta rodada | testes de sandbox se já disponível e autorizado | alternativa MySQL isolado sem Docker é permitida; não apagar volumes |
| Npm audit e checksums SHA256 | ferramentas nativas | cadeia de suprimentos, hashes, reprodutibilidade | revisar severidade, falsos positivos e exploração real |

## 2. Skills concretas e quando carregá-las
| Skill / URI | Ativação | Saída esperada |
| --- | --- | --- |
| skills://plugins/codex-profile-selector/engenharia-plataforma/skill.md | arquitetura, código, worktrees, testes | plano de mudança mínima, evidências e riscos |
| skills://plugins/codex-profile-selector/execucao-orquestrada/skill.md | tarefa multietapa | DAG, controlador, locks, fan-in e matriz de aceite |
| skills://plugins/system-delivery-orchestrator/system-discovery/skill.md | inventário e baseline | registro do que existe e lacunas |
| skills://plugins/system-delivery-orchestrator/security-change-control/skill.md | qualquer alteração sensível | preflight de autorização, impacto, rollback |
| skills://plugins/system-delivery-orchestrator/verification-quality-gates/skill.md | provas de release | matriz critério→teste→evidência→veredito |
| skills://plugins/system-atlas-analysis-plugins-6ad571710c7c8191940bfed1e38a56cf/evidence-reconciliation/skill.md | documentação contraditória, worktree divergente | relatório de contradições e decisão rastreada |
| skills://plugins/system-atlas-analysis-plugins-6ad57e669a50819180332950755e76a2/architecture-audit/skill.md | revisão de arquitetura, confiança e isolamento | diagrama da arquitetura e fronteiras |
| skills://plugins/system-atlas-analysis-plugins-6ad571710c7c8191940bfed1e38a56cf/quality-security-gates/skill.md | segurança e prontidão | checklist de segurança e bloqueios |
| skills://plugins/impeccable/impeccable/skill.md | somente refino UI/UX da B2 | revisão visual, usabilidade e acessibilidade |
| skills://plugins/figma/figma-use/skill.md | somente quando houver ação em arquivo Figma | execução controlada com API/variáveis |
| skills://plugins/figma/figma-design-to-code/skill.md | ao implementar um arquivo Figma como código | código coerente com design existente |
| skills://plugins/app-6a576f075ec4819196c203b7049542be/write-openapi/skill.md | documentação OpenAPI no GitBook, se escolhido | publicação organizada por APIs |
| skills://plugins/wa-akg-connect/wa-akg-diagnostics/skill.md | diagnóstico do MCP conectado | evidência de disponibilidade/erros |
As URIs são nomes catalogados, não garantia de que a habilidade executa mudanças sozinha. Consultar a skill integral antes da sua aplicação e verificar se o plugin correspondente está efetivamente autorizado.

## 3. Responsabilidade por domínio (RACI operacional)
- Owner/operator: aprova B1, janela, acessos reais, migrações e publicação; não delegar assinatura de risco a um teste.
- Integrador Git: proprietário único da branch candidata, resolução de conflitos, reconciliação de worktrees, versionamento e PR.
- DBA/migration reviewer: análise V1/V2, P3018, backup, restore e integridade; único writer do banco de ensaio.
- Security reviewer: auth, OAuth, tenant, API keys, SSRF, webhook, mídia, CORS, CVEs, segredos, dados.
- Test engineer: test oracles, TypeScript, lint, npm tests, MCP e HTTP/DB sandbox; independente de quem altera código.
- UX reviewer: navegação, acessibilidade, assets, base-path, branding.
- Release operator: artefatos, hashes, changelog, tag/release após gates, execução da atualização só após autorização.
- Incident owner: stop conditions, rollback/forward-fix, monitoramento e comunicação.

## 4. Matriz fase → executor → evidência
| Fases | Ferramentas primárias | Evidência mínima |
| --- | --- | --- |
| F00–F01 | RDC + Git; system-discovery | baseline por SHA, status de cada worktree, cópias verificáveis de patches |
| F02 | GitHub + git fetch/compare; evidence-reconciliation | delta B1→B2, forks e decisão de sync |
| F03 | Git + RDC + engenharia-plataforma | commit por decisão, diff revisto, nenhuma alteração perdida |
| F04 | npm audit, ESLint, testes adversariais; quality-security-gates | checklist R01–R15, provas de bloqueio de acesso |
| F05 | Prisma, MySQL isolado, dump/restore; security-change-control | logs de migração e checksums de backup seguro |
| F06–F07 | node:test, contratos OAuth/MCP, Prisma, HTTP | matriz de permissão e ataques reprovados |
| F08 | fixtures de Baileys/WA, replica harness, testes de serviços | estabilidade/duplicidade, sem envios reais |
| F09 | Swagger, route matrix, Figma/Impeccable opcionais | paridade API/doc, visual e base-path |
| F10 | npm test, tsc, eslint, next build, mcp:test, HTTP | execução em SHA congelado, relatório PASS/FAIL |
| F11 | scripts de upgrade, MySQL sandbox, backup/restore | restore, upgrade e rollback ensaiados |
| F12–F13 | GitHub e RDC (publicação separada) | tag/release SHA verificada, operações aprovadas |
| F14 | docs Git, GitBook se escolhido | documentação coesa e handover |

## 5. Isolamento de agentes e paralelismo real
A orquestração só deve distribuir workers em recursos disjuntos. Grupos recomendados:
1. Agente A — segurança estática e inventário de rotas (read-only); agente B — documentação e OpenAPI (read-only). Rodam em paralelo.
2. Agente C — esquema Prisma e migrações em worktree próprio; agente D — UI em worktree próprio; sem tocar no mesmo arquivo ou banco.
3. Agente E — OAuth/Auth; agente F — mensageria; ambos com contratos congelados antes de execução, e integração serial.
4. Único integrador Git executa fan-in e commit por domínio; rodar testes independentes com outputs/logs isolados só após dependências comuns.
Não iniciar um segundo agente se concorrência, modelo, sessão, autorização ou logs não puderem ser comprovados. Preservar IDs de processo/call_id; nunca retentar efeito remoto por timeout sem reconciliação.

## 6. Diretórios recomendados (PROPOSED, não criados automaticamente)
docs/B2/: 01 especificação, 02 matriz de ferramentas, 03 runbook e futuros 04 tracking de gates, 05 relatório de testes, 06 notas de release.
scripts/release-b2/: Inventory-B2.ps1, Snapshot-Worktrees.ps1, Preflight-B2.ps1, Verify-Offline-B2.ps1, Backup-Sandbox-B2.ps1, Upgrade-Sandbox-B2.ps1, Verify-Release-B2.ps1, Restore-Sandbox-B2.ps1.
Cada script deve declarar parâmetros, precondições, modo read-only padrão, timeout, exit codes, logs stdout/stderr e rollback; preservar suporte PowerShell 5.1 e nunca armazenar segredos em scripts.
Prisma: migrations históricas imutáveis; novos diretórios apenas com alterações aditivas justificadas; V2 somente após integração e validação.
src/lib/__tests__ e scripts/__tests__: testes direcionados por falha/contrato; não criar testes que enviem WhatsApp real.
.remote-desktop/sessions/<id> (ignorado): plan, raw, evidence, checksums; dados sensíveis apenas em diretório local protegido fora do Git.

## 7. Protocolo obrigatório para Remote Desktop Commander
Antes de CADA operação RDC, consultar e seguir integralmente os dois protocolos:
- https://chatgpt.com/library/share/libfile_2315c2eaf0ac81919962b76be775cd50?account_id=personal
- https://www.dropbox.com/scl/fi/mz6iql80901hyadvskgjp/Remote-Desktop-Commander-Protocolo-Operacional.md?rlkey=pnp6ffkg9tpgt29yprnvis6su&st=ayqugn6s&dl=0
Fluxo: objetivo → autorização → plano estático → execução única → status/exit code → diagnóstico só quando falhar → validação independente → evidência → conclusão.
Toda mudança deve registrar BEFORE/ACTION/AFTER/VALIDATION. Nunca usar segredo em arguments, console, stdout ou arquivo versionado. Nunca declarar produção pronta a partir de teste sintético.
