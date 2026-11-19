# ConectaFlow B2 — Especificação mestra para conclusão integral
Data de referência: 2026-11-09. Estado: IMPLEMENTED para preparação documental; BLOCKED para release final.
Repositório: https://github.com/fabriciocs/ConectaFlow
Candidata: release/b2-integration-20261109; PR https://github.com/fabriciocs/ConectaFlow/pull/2 (draft).
Pasta de integração: C:/repos/WA-AKG-B2-integration; repositório principal: C:/repos/ConectaFlow.

## 0. Escopo, autoridade e definição de B2
O produto é um gateway e painel de WhatsApp: Next.js, React, TypeScript, Prisma/MySQL, Baileys, autenticação Auth.js, OAuth, API REST, MCP, Socket.IO, automações, webhooks e OpenAPI.
Objetivo de B2: integrar de modo preservador as alterações existentes nas branches e worktrees, sincronizar com o fork de origem sem perder a identidade do ConectaFlow, garantir upgrades reproduzíveis e comprovar segurança, interoperabilidade e recuperação de dados.
B2 não é sinônimo automático de 2.0.0, beta.2 ou da tag v1.7.0-beta.1. A referência B1 precisa ser determinada por commit/tag/digest antes de descrever diferenças ou estabelecer compatibilidade.
Não publicar release/tag, mesclar na main, implantar em produção, aplicar migração real, modificar credenciais ou executar ações WhatsApp externas sem gates e autorização operacional específicos.
Invariantes: preservar histórico Git, commits locais, staged, unstaged, untracked, arquivos de dados, mídias, dados de WhatsApp, configurações, credenciais e os serviços de terceiros.
Proibições: git reset --hard, git clean, rebase destrutivo, checkout que descarta trabalho, push forçado, migrações destrutivas, Playwright e workflows/Actions no GitHub. Scripts PowerShell devem funcionar em 5.1.
Estados: PROPOSED = especificado; IMPLEMENTED = escrito/alterado; TESTED = executado; VERIFIED = evidência suficiente; FAILED = execução ou critério reprovado; BLOCKED = impedimento explícito; DEFERRED = adiado com motivo. Conclusão integral só é VERIFIED mediante evidência para todos os gates obrigatórios.

## 1. Inventário observado (snapshot; repetir antes de qualquer alteração)
- origin/main: e7936598319fc6c07584b24dbf21814f45fc2e56.
- candidata B2 anterior a esta especificação: 9488d8144ea4be5cf50707463e5958256dd01f0d.
- origem upstream/main: 04d6c0f5e484df469840697e3573654691792958.
- autenticação/WhatsApp identity-linking: a6496f771347bab345e24b8f25a1a3392dfd2010.
- Branches security-remediation, multi-tenant-isolation, integration/wa-akg-main e tenant schema/policy/API/enforcement ainda não integradas na candidata.
- 931 arquivos rastreados no snapshot B2; 104 arquivos src/app/api/**/route.ts; swagger.json em OpenAPI 3.0.0 com 86 paths. A diferença de contagem NÃO prova ausência de documentação: verificar métodos e contratos.
- package.json na candidata: versão 1.7.0, gerenciador de projeto npm com package-lock.json, sem pnpm-lock.yaml; MCP package separado (@wa-akg/mcp-server, versão 0.1.0).
- Prisma na candidata: 12 diretórios prisma/migrations, sem prisma/bootstrap-v2/manifest.json e sem scripts/prisma-bootstrap-v2.mjs; ambos existem em outra branch (não instalados na B2).
- Worktrees com mudanças a preservar: integração geral 12 unstaged/19 untracked; OAuth 29/3; QR 23/4; replica-harness 0/1; dependências/segurança 24 entradas; interface comercial/mobile 8/7. Recontar no ato de integrar; trabalho pode mudar.
- Quatro referências de worktree apontavam para o nome antigo C:/repos/WA-AKG. Reparadas por git worktree repair para C:/repos/ConectaFlow, sem descartar conteúdo; a worktree de dependências continua com 24 entradas pendentes.
- Fetch --all --tags --no-prune e pull --ff-only da B2 verificaram que a candidata estava em dia com origin. Não é merge das branches funcionais.
- GitHub: PR #1 multi-tenancy draft e PR #2 B2 draft. Nenhuma release GitHub B1/B2 publicada na consulta. Não assumir prontidão de release.
- Execução anterior de testes na branch de autenticação (não B2 integrada): bootstrap offline e npm test passaram; TypeScript falhou em src/server/index.ts:90; ESLint registrou 32 erros e 10 warnings. Houve alteração concorrente do HEAD durante a bateria. Reexecutar em baseline imutável.

## 2. Arquitetura e limites de confiança
Cliente Next.js: src/app (páginas públicas e privadas) e src/components; nunca exibir secrets, access/refresh tokens, chaves de API ou configurações server-only no navegador.
HTTP/API: src/app/api (104 arquivos route.ts); identificar rota, métodos, entrada Zod/validação, sujeito, escopo, tenant, efeito colateral, código HTTP, cache, auditoria, OpenAPI e testes.
Autenticação: src/app/api/auth, src/lib, middleware.ts, Auth.js; login/logout, verificação de e-mail, recuperação de senha quando efetivamente implementada, MFA/TOTP, cookies, CSRF e sessões.
OAuth/OIDC: src/app/api/oauth, src/lib/oauth, descoberta em src/app/.well-known; Authorization Code+PKCE S256; redirect_uri estrito, state/nonce, refresh/revocation/introspection, grants, audiences/resource e consentimento.
Autorização: SUPERADMIN/STAFF/USER, grants, tenantId, resource ownership, SessionAccess. Revalidar sem assumir hierarquias históricas; política fail-closed.
API keys e MCP: src/app/api/user/api-key, src/app/api/user/mcp/setup, mcp/wa-akg-mcp; chaves são credenciais, devem herdar o alcance máximo permitido ao usuário e nunca ampliá-lo; limites por tenant, sessão, operação, recurso e ação.
WhatsApp: src/modules/whatsapp, src/modules/messaging, src/server, rotas de sessões/QR/mensagens; sessão, lease, recepção, envio, retry, processamento e deduplicação; não disparar mensagens reais nos testes.
Dados: prisma/schema.prisma, prisma/migrations, AuthState/Session/Message/InboundEvent/ProcessingResult/OAuth*/Tenant* (depois de integrar); MySQL com backup/restauração.
Webhooks: rotas e serviços de webhook; validar autenticidade, URL de destino (SSRF/DNS rebinding), assinatura, deduplicação, retry, limites de tamanho e segregação por tenant.
Documentação: docs, swagger.json, src/app/api/docs; Swagger/OpenAPI deve refletir endpoints reais e não carregar credenciais no browser.
Infraestrutura: Dockerfile, docker-compose*.yml, next.config.ts, .env.example, Caddy/ngrok; respeitar caminho de base solicitado e não presumir runtime, porta ou banco ativo.
Fluxos críticos: login → concessão de identidade → autorização → seleção de tenant/sessão → API/MCP → operação WhatsApp → persistência/auditoria → resposta. Negação deve prevalecer quando contexto ou privilégio não estiver comprovado.

## 3. DAG de trabalho e regras de paralelismo
Fluxo principal: F00 inventário → F01 preservação → F02 reconciliação B1/upstream → F03 integração isolada → {F04 segurança, F05 dados, F06 identidade/tenancy, F07 WhatsApp, F08 API/MCP, F09 UX/docs} → F10 validação integral → F11 upgrade ensaiado → F12 publicação aprovada → F13 monitoramento/encerramento.
Cada tarefa deve declarar ID, dependências, read_set, write_set, exclusive_set, dono, branch/worktree, entradas, saídas, teste, evidências, decisão e rollback.
Executar tarefas somente leitura em paralelo se houver benefício. Modificações em schema/lockfile/src/server/auth/routes compartilhadas exigem um integrador exclusivo ou worktrees disjuntos.
Não paralelizar migrações no mesmo DB, npm ci na mesma árvore, edições do mesmo arquivo, merges simultâneos, atualizações de branch remota ou deploy com validação.
O controlador único confirma status/exit code de cada worker; não interpretar stdout de sucesso; analisar somente falhas; reunir resultados antes de integrar (fan-in). RUNNING e timeout de transporte não justificam repetir efeitos externos.

## 4. Fases, etapas e passos atômicos

### F00 — Preflight e verdade operacional [BLOCKED até atualização contínua]
F00.01 Registrar host, shell PowerShell 5.1, Node, npm, Git, permissões, status do dispositivo e paths autorizados.
F00.02 Inspecionar AGENTS.md, package.json, lock, TypeScript, ESLint, Next config, Dockerfile/compose, .env.example (somente nomes), routes, swagger e docs.
F00.03 Inventariar remotos, branches, tags, HEADs, commits locais, PRs, staged/unstaged/untracked e worktrees, com hashes e carimbo temporal.
F00.04 Confirmar se MySQL, Redis, Docker, proxy/ngrok e WhatsApp estão ativos, apenas por sondagens read-only e sem expor credenciais.
F00.05 Registrar base de evidências e checksums dos manifestos não sensíveis. Gate G00: inventário reprodutível e sem perdas.

### F01 — Preservar TODO o trabalho existente [PROPOSED]
F01.01 Para cada worktree, inventariar diff --name-status, diff --cached, untracked e commits exclusivos; impedir checkout/reset/clean.
F01.02 Criar snapshots externos protegidos dos diffs e arquivos untracked com checksums e permissões; evitar zip de segredos em repositório e publicação.
F01.03 Classificar por dono: security, deps, tenancy, OAuth, QR, replica, UI, compatibilidade; arquivos conflitantes entram em fila de revisão.
F01.04 Registrar rastreamento origem → alvo → commit → arquivo → teste; não importar .env, node_modules, dados de usuário ou logs privados.
F01.05 Identificar jobs/processos/agentes ativos antes de escrever nos worktrees; nunca encerrar processos alheios por porta/CPU. Gate G01: snapshot restaurável e baseline congelado.

### F02 — Definição B1, sincronização do fork e estratégia B2 [PARTIAL]
F02.01 Descobrir referência exata de B1 (tag, commit, artefato, banco e deploy); se não existe, criar registro de baseline aprovado sem inventar release anterior.
F02.02 Atualizar referências read-only: git fetch --all --tags --no-prune; comparar origin/main, upstream/main, todas as branches e tags.
F02.03 Identificar commits upstream relevantes e revisar diff com identidade do fork, financiamento, assets e licenças; nunca usar pull/merge upstream irrestrito.
F02.04 Registrar histórico de sync: merge de ancestralidade upstream já feito só na B2, sem importar seu branding; novas diferenças exigem revisão individual.
F02.05 Definir versão semântica da candidata, nomenclatura B2, compatibilidade de schema e API, política de changelog e suporte de upgrade. Gate G02: B1 confirmada e delta integral rastreado.

### F03 — Integração de branches e mudanças não commitadas [PROPOSED]
F03.01 Criar novos worktrees de integração por domínio somente depois do snapshot F01, com base em commit imutável; um writer por conjunto de arquivos.
F03.02 Integrar primeiro dependências comuns e migrações aditivas, depois security/tenant schema/policy/api/enforcement, depois Auth/OAuth/MCP/WhatsApp/UI; usar merge/cherry-pick conscientemente, não empilhar tudo cegamente.
F03.03 Para cada commit, mapear arquivos, testes e conflitos; em colisões preservar ambos os lados, decidir contrato prioritário, revisar diff, criar testes de regressão.
F03.04 Aplicar alterações untracked/unstaged mediante comparação tripla: base, patch de origem e destino, com proveniência e sem descartar origem.
F03.05 Reconciliar PR #1 e branches especiais; revisar independências e evitar dupla integração de commits equivalentes. Gate G03: alterações relevantes contabilizadas, integrações revisadas, PR B2 atualizada, nenhuma perda.

### F04 — Segurança transversal [PROPOSED]
F04.01 Fechar R01–R15 em docs/SECURITY-REMEDIATION-IMPLEMENTATION-20261106.md; reexecutar auditoria de dependências/lockfile e classificar CVEs de forma contextual.
F04.02 Aplicar política fail-closed para auth, API keys, OAuth, webhooks, media/SSRF, Socket.IO, CORS, headers e rate limiting distribuído.
F04.03 Impedir exposição de cookies, URL com token, AUTH_SECRET, mídia privada, logs OAuth, hashes e configuração interna em bundles client-side, Swagger ou logs.
F04.04 Testar abuso: acesso cruzado, IDs trocados, tenant ausente, grants revogados, redirect_uri malicioso, payload oversized, host privado/DNS rebinding.
F04.05 Revisar código e testes independentemente do implementador. Gate G04: 0 vulnerabilidades impeditivas conhecidas sem mitigação e segurança avaliada com evidência.

### F05 — Prisma e migração segura [PROPOSED]
F05.01 Comparar três linhagens V1, baseline V2 e schema atual; listar checksum, tabela _prisma_migrations, alterações já executadas, divergências e P3018.
F05.02 Integrar e validar scripts/prisma-bootstrap-v2.mjs e prisma/bootstrap-v2/manifest.json da branch de autenticação, sem assumir que já existem na B2.
F05.03 Em base DESCARTÁVEL nova testar a instalação completa desde zero, sem P3018, e conferir modelos, constraints, índices e relações do schema.
F05.04 Em cópia restaurada de backup legada, ensaiar migração incremental e reconciliar histórico sem editar migrações aplicadas nem inventar status.
F05.05 Comparar pré/pós: usuários, sessões, mensagens, AuthState, leases, recebimentos, tenantId, FKs, contagens, checksums e integridade referencial.
F05.06 Produzir backup + restore real em sandbox compatível com MySQL e lower_case_table_names do Windows; guardar dump/segredos fora do Git.
F05.07 Gerar plano de rollback forward-fix e gate manual para qualquer alteração em produção. Gate G05: bootstrap virgem e upgrade legado VERIFIED em sandboxes.

### F06 — Tenancy, RBAC/ABAC e identidade [PROPOSED]
F06.01 Mapear entidades e vinculação tenantId, membership, grants, sessão, recurso e owner no Prisma e nos serviços.
F06.02 Estabelecer defaults deny; usuários comuns só veem tenants e sessões autorizados; SUPERADMIN com acesso excepcional explicitamente auditado.
F06.03 Impor isolamento em cada query Prisma, REST, WebSocket, background job, webhook, cache, MCP e mídia; sem autorização implícita por ID.
F06.04 As chaves de API devem respeitar permissões, autenticação, autorização, perfil, tenant, sessões e escopos do usuário emissor; revogação e expiração funcionais.
F06.05 Testar 2 tenants x 2 usuários x 2 chaves x diversas sessões e grants, incluindo cross-tenant reads/writes, revogações, import legado e superadmin auditado. Gate G06: zero vazamento intertenant comprovado.

### F07 — OAuth/OIDC, MFA e sessão [PROPOSED]
F07.01 Validar client types: público PKCE, confidencial client secret server-side, integrações MCP; redirect_uri exact match, state, nonce e resource/audience.
F07.02 Testar discovery, authorization, token, refresh, revoke, introspect, userinfo, consent e client registration (se suportado).
F07.03 Validar login/logout real, cookies, session invalidation, verificação/recuperação e-mail, MFA/TOTP enrolment, backup codes e expiração.
F07.04 Integrar fluxo identidade WhatsApp e QR sem atribuir acesso por número não verificado; tratar troca de aparelho, reconnect e session leasing.
F07.05 Simular atacantes: replay, code reuse, token theft, open redirect, refresh rotation quebrada, CSRF e credencial revogada. Gate G07: handshake cliente→API/MCP com permissões corretas.

### F08 — Sessões WhatsApp, mensageria e mídia [PROPOSED]
F08.01 Validar leasing, múltiplas réplicas, conexão/desconexão, QR, auth-state criptografado e ausência de ownership duplicado.
F08.02 Testar inbound dedup/receipts, processing result, fila/outbox, limites, idempotência, retry e ordem de eventos sem efeitos externos reais.
F08.03 Testar mensagens texto, mídia, contatos, localização, interativas, reações, etiquetas, grupos, mensagens agendadas e webhooks apenas com fixtures/mocks.
F08.04 Provar proteção contra SSRF, path traversal, symlinks, arquivos privados na build e vazamento de mídias via proxy/URL base.
F08.05 Executar testes controlados com sessão de teste só após autorização explícita de envios e destinatários. Gate G08: runtime e persistência estáveis, sem duplicidade.

### F09 — HTTP, MCP, OpenAPI, UX e branding [PROPOSED]
F09.01 Gerar matriz por rota: method, schema de entrada, autorização, tenant, status, OpenAPI, consumer front/MCP, testes e side-effects.
F09.02 Comparar matriz com swagger.json, docs/API_DOCUMENTATION.md, docs/OAUTH.md e contratos; corrigir diferenças reais sem inventar endpoints.
F09.03 Validar MCP tools/resources, rate limits, autenticação, transporte HTTP, erros, pagination, sessões e claims herdados da identidade do usuário.
F09.04 Validar URLs base em localhost sem contexto e em Caddy/ngrok com contexto, incluindo redirects OAuth, JS/CSS/assets/API/WebSocket e links absolutos.
F09.05 Revisar onboarding, dashboard, mobile, telas/listas/edição de sessões, usuários, tenants, MFA, API keys, integrações, logs e acessibilidade WCAG 2.2.
F09.06 Verificar identidade pública ConectaFlow e licenças, removendo exposição indevida ao nome antigo sem reescrever histórico/licença. Gate G09: UI/MCP/docs coerentes e testados.

### F10 — Testes, build, segurança e gates independentes [PROPOSED]
F10.01 Instalar em worktree isolado com package-lock via npm ci apenas após revisão e autorização; registrar versões e hashes, sem trocar ecossistema.
F10.02 Executar Prisma validate/generate e bootstrap offline quando scripts estiverem integrados; npm test, TypeScript, npm run lint, npm run mcp:check, npm run mcp:test.
F10.03 Corrigir regressão TypeScript em src/server/index.ts:90 e erros lint observados; exigir zero erros impeditivos no baseline final.
F10.04 Build Next em ambiente sintético, auditoria de pacotes e varredura de artefatos contra sentinelas/arquivos privados; inspecionar .next sem expor secrets.
F10.05 Rodar testes de integração com MySQL descartável e HTTP por cliente Node/curl/PowerShell; não usar Playwright; registrar rota/HTTP/schema/assertion.
F10.06 Executar testes de contrato OAuth/MCP/OpenAPI, tenancy adversarial, QR, session leases, upgrade e rollback; status por teste e logs locais em falha.
F10.07 Auditoria independente do diff/PR e resolução dos findings. Gate G10: pipeline local integral PASS, sem falhas obrigatórias abertas.

### F11 — Ensaio de upgrade B1 → B2 [PROPOSED]
F11.01 Verificar que origem B1 e candidata B2 possuem hashes/versionamento inequívocos e manifesto de compatibilidade.
F11.02 Fazer backup consistente de dados, mídia e configuração de teste; validar checksum, restore e RPO/RTO definidos.
F11.03 Executar upgrade em clone restaurado isolado: preflight, migração autorizada, build, restart e probes HTTP/DB/MCP/WhatsApp sem enviar mensagens.
F11.04 Repetir o ensaio de rollback da aplicação ou forward-fix conforme esquema; não reverter dados destrutivamente.
F11.05 Produzir relatório de impacto, tempo medido, diff de schema, contagem de dados, falhas e janela de mudança. Gate G11: instalação nova e upgrade existente comprovados.

### F12 — Candidate freeze, revisão e release B2 [BLOCKED até gates]
F12.01 Fixar SHA e freeze do código; anexar changelog completo, notas de migração, endpoints, features, breaking changes, CVEs, SBOM e hashes.
F12.02 Revisão independente da PR #2 e evidências G00–G11; converter draft somente com aprovação operacional.
F12.03 Integrar à main por merge autorizado e policy de proteção; verificar SHA remoto final e branches de origem, sem force push.
F12.04 Criar tag/release B2 em commit final aprovado, com título, corpo, assets e checksums, usando GitHub; nunca publicar sobre commit mutável.
F12.05 Revisar dados públicos e pacote de upgrade, confirmar documentação final. Gate G12: release remota VERIFIED; caso contrário NO-GO.

### F13 — Upgrade de ambiente real e observabilidade [DEFERRED até autorização]
F13.01 Com aprovação de janela, verificar backup íntegro, operador, endpoints, sessão WhatsApp e banco reais sem exposição de dados.
F13.02 Executar manualmente upgrade com registro das ações; nunca acionar GitHub Actions/Workflows nem migração automática por startup.
F13.03 Verificar health, autenticidade das sessões, throughput, leases, OAuth/MCP, UI, Caddy e logs sem dados sensíveis; monitorar regressões.
F13.04 Em falha, interromper progressão, executar procedimento autorizado de recuperação, preservar logs/backup e não mascarar incidentes.
F13.05 Assinar relatório pós-upgrade, operação e handover. Gate G13: produção comprovadamente saudável.

### F14 — Fechamento e manutenção [PROPOSED]
F14.01 Atualizar documentação de arquitetura, histórico V1/B1→B2, README, OpenAPI e exemplos .env sem valores reais.
F14.02 Manter scripts locais reexecutáveis, relatório e matriz de rastreabilidade tarefa→commit→teste→evidência.
F14.03 Registrar riscos residuais, dívida técnica, upgrades futuros, política de sincronização upstream e responsáveis.
F14.04 Revalidar nenhum dado perdido, branches preservadas, PRs reconciliadas e controles de acesso; declarar VERIFIED só após G00–G13 necessários.

## 5. Critérios obrigatórios de aceite
- AC01: todas as alterações existentes localizadas, classificadas e integradas, preservadas ou explicitamente DEFERRED com justificativa e aprovação.
- AC02: identidade e funcionalidade do fork preservadas; upstream reconciliado por commits analisados.
- AC03: schema compatível em banco novo e legado, backup restaurável e ausência de P3018 no caminho suportado.
- AC04: autenticação, OAuth, logout, MFA, RBAC/ABAC, API keys e acesso admin testados positivamente e negativamente.
- AC05: isolamento cross-tenant em REST, DB, jobs, WebSocket, arquivos, webhooks e MCP.
- AC06: sessão WhatsApp/QR/lease/recepção/envio simulado consistente; dados sensíveis não vazam.
- AC07: TypeScript/lint/unit/integration/MCP/build/HTTP e OpenAPI atendem critérios objetivos; não aprovar por exit code isolado.
- AC08: upgrade e recuperação ensaiados em sandbox; plano por ambiente assinado.
- AC09: PR revisada, SHA congelado, versão e release notes coerentes, tag remota aponta ao commit aprovado.
- AC10: observabilidade, runbooks, rollback, responsabilidades e documentação atualizados.
Qualquer AC impeditivo sem evidência mantém estado BLOCKED. Nenhum trabalho de produção está autorizado implicitamente por este documento.

## 6. Documentos associados
- docs/B2/02-FERRAMENTAS-PLUGINS-SKILLS.md: matriz RACI, skills e meios de execução.
- docs/B2/03-UPGRADE-AND-SYNC-RUNBOOK.md: procedimentos seguros, comandos PowerShell e rollback.
- docs/RELEASE-B2-PLAN-20261109.md: registro resumido original.
- docs/SECURITY-REMEDIATION-IMPLEMENTATION-20261106.md: checklist R01–R15 existente em branch de remediação; verificar existência ao integrar.
- docs/UPDATE_GUIDE.md e AGENTS.md: instruções existentes.
