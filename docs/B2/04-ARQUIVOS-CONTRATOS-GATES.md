# B2 — Matriz de arquivos, contratos, testes e gates
Baseline observada: release/b2-integration-20261109 antes da integração funcional; 2026-11-09.
Convenção: EXISTE = path observado na candidata; A INTEGRAR = existe apenas em outra branch ou worktree; PROPOSTO = ainda não confirmado/criado.
Cada intervenção deve registrar responsável, diff, commit, teste, evidência e regressão; diretório não significa que a feature já esteja validada.

## 1. Arquitetura de pastas atual e contratos de propriedade
| Área | Arquivo/pasta | Responsabilidade exclusiva | Critério de aceite |
| --- | --- | --- | --- |
| Instruções | AGENTS.md (EXISTE) | regras e gates do repositório | não contradiz protocolo RDC e segurança |
| Pacotes | package.json, package-lock.json (EXISTE) | scripts, versões, dependências, override e package manager npm | lock reproduzível, sem dependências trocadas sem justificativa |
| Runtime | src/server/index.ts (EXISTE) | createServer, HTTP routing, Socket.IO, contexto e processo | URL válida para Next, sem erro TS, health observável |
| Next | next.config.ts, middleware.ts (EXISTE) | assets, base-path, redirects, filtros e proteção periférica | acesso direto seguro, proxy/nested path funcional |
| Tipos/lint | tsconfig.json, eslint.config.mjs (EXISTE) | compilação e política estática | tsc --noEmit e eslint sem erros impeditivos |
| Auth | src/lib/auth.ts, src/lib/api-auth.ts (EXISTE) | identidade, sessão, autenticação das APIs | nunca retornar usuário não verificado nem confiar no client |
| Session access | src/lib/session-access.ts, src/lib/server-action-auth.ts (EXISTE) | gates de sessão/ação | mesma política na rota, serviço e background |
| OAuth lib | src/lib/oauth/* (EXISTE) | RFC 6749/OIDC conforme suporte real, PKCE, scopes e grants | tokens, audiences e estados testados |
| Webhooks | src/lib/webhook*.ts (EXISTE) | filtros, entrega, assinatura, redaction e SSRF | teste de allowlist/deny, sem exposição de segredo |
| UI pública | src/app/page.tsx, src/app/auth e src/app/onboarding (EXISTE) | landing, login e onboarding | público mínimo, privacidade e UX |
| UI privada | src/app/dashboard, src/components/dashboard (EXISTE) | console protegido e responsivo | login/tenant/permissão e acessibilidade |
| Data | prisma/schema.prisma, prisma/migrations/* (EXISTE) | schema e migrações V1 | checksums e upgrade sem perda |
| Bootstrap | prisma/bootstrap-v2/*, scripts/prisma-bootstrap-v2.mjs (A INTEGRAR) | decisão de lineage V1/V2, deploy seguro | banco virgem e legado restaurado aprovados |
| API | src/app/api/* (EXISTE; 104 route.ts) | auth e autorização por request, validação e respostas | matriz rota/método/tenant/teste/OpenAPI |
| Messaging | src/modules/messaging/*, src/modules/whatsapp/* (EXISTE) | Baileys, recebimento, envio, retry, sessão e lease | no-duplicate e idempotência provados |
| MCP | mcp/wa-akg-mcp/* (EXISTE) | protocolos, segurança e tools MCP | tools sem elevação de permissões; transport check |
| Docs | swagger.json, docs/API_DOCUMENTATION.md, docs/OAUTH.md (EXISTE) | referência interoperável | APIs documentadas correspondem ao código |
| Infra | Dockerfile, docker-compose*.yml, ecosystem.config.js (EXISTE) | build, DB, réplica e processo | portas e mounts/segredos avaliados |
| Upgrade | scripts/Sync-Fork-B2.ps1 (IMPLEMENTED) | Audit/Fetch/Prepare/Check sem publicar/migrar | parse PS5.1, flags e erros propagados |
| Planejamento | docs/B2/*.md (IMPLEMENTED) | execução, gates, arquivo, tool/skill e upgrade | revisão de consistência com SHA |
| Propostas | scripts/release-b2/*.ps1 (PROPOSTO) | snapshot, preflight, rollback/forward-fix e verificação | implementar somente após gate e teste isolado |

## 2. Inventário completo dos domínios de rotas (arquivo route.ts)
Contagens obtidas de arquivos Git rastreados no snapshot; não representam cobertura real de testes ou docs:
- account (1), auth (4), autoreplies (2), chat (9), chats (1), contacts (3), docs (1), groups (12).
- internal (1), labels (4), media (2), messages (22), notifications (3), oauth (11).
- processing-jobs (1), processing-results (1), profile (4), scheduler (2), sessions (7), settings (1).
- swagger-auth (1), system (3), user (2), users (2), webhooks (4). Total 104 route.ts.
Para cada rota, inspecionar os métodos realmente exportados (GET/POST/PATCH/PUT/DELETE/OPTIONS); registrar schema de entrada, authn, authz, tenant, side effect, idempotência, rate limit, cache, segurança de payload, erros HTTP, teste positivo/negativo e path OpenAPI.
Uma contagem de 86 paths no swagger.json não equivale a 18 endpoints ausentes; paths e arquivos route.ts não têm correspondência 1:1. Verificação deve ocorrer por método/path/contrato.

## 3. Contratos por módulo crítico

### 3.1 Cadastro, auth, usuários e API keys
Paths base: src/app/api/auth/[...nextauth]/route.ts, auth/register, auth/verify-email, auth/resend-verification, users, users/[id], user/api-key, user/mcp/setup, account/profile, src/lib/auth.ts e api-auth.ts.
Expectativas: e-mail único confirmado na base; falhas de login genéricas; recuperação protegida quando implementada; expiração/uso único de verificação; logout invalida sessão server-side; userId/tenantId derivados do servidor; soft/hard delete só com política; API key gerada com CSPRNG, guardada em hash e mostrada uma única vez; chaves têm escopos efetivos menores ou iguais aos do usuário em TODOS os caminhos.
Testes: duplicidade de e-mail concorrente; IDOR, CSRF, brute-force, rate limit, sessão expirada, API key de terceiro, revogação, usuário suspenso e superadmin auditado.
Não afirmar que telas de recuperação/MFA estejam implementadas só porque fazem parte desta especificação.

### 3.2 OAuth/OIDC e integração externa
Paths: src/app/api/oauth/authorize/route.ts, authorize/decision, token, revoke, introspect, userinfo, register, clients, grants; src/lib/oauth/* e src/app/.well-known.
Expectativas: clientes público/confidencial/MCP por contrato; redirect_uri exata; PKCE S256 obrigatório para público; validação de state/nonce, resource/aud/scope, consentimento, grant revogado, limites de corpo, expiração/rotation de refresh, resposta no-store; segredo de cliente só no servidor e criptografia adequada.
Testes: invalid redirect, code replay, failed PKCE, token reuse, rate limit, acesso não autorizado, callback em base-path/ngrok e introspection sem privilege escalation.

### 3.3 Multi-tenancy
Pontos de integração: prisma/schema.prisma, serviços src/lib, Session/SessionAccess, OAuthGrant, todas as rotas com dados e mcp/wa-akg-mcp.
Expectativas: Tenant/TenantMembership/ResourceGrant e tenantId conforme migrações revisadas; grants deny-by-default; superadmin excepcional só com trilha separada; backfill de registros legados apenas com ownership baseado em evidência; nulos/orfãos não significam dados globais.
Testes: dupla identidade, duas empresas, duas sessões, páginas/API/mídia/cache/WebSocket/background, troca de tenant, IDOR e acesso superadmin auditado.
A candidata B2 ainda não tem schema tenant integrado; não presumir implementado até a verificação por branch/commit/arquivo.

### 3.4 Sessões e QR
Paths: src/app/api/sessions/* (7 route.ts); src/modules/whatsapp/*, AuthState, WhatsAppSessionLease e UI sessions.
Expectativas: vínculo identidade/sessão autorizado, QR efêmero, reconexões limitadas, owner do lease único, nenhuma duplicidade de conexão, higiene de chaves, logs sem QR/tokens.
Testes: múltiplos owners em corridas controladas, expirado/revogado, sessão sem ownership, dois processos e persistência após restart.

### 3.5 Mensagens, jobs, webhooks e mídia
Paths: src/app/api/messages/* (22), chat/* (9), groups/* (12), media/* (2), processing*, autoreplies, scheduler, webhooks/* (4), src/modules/messaging/*.
Expectativas: mensagem enviada uma vez por idempotency key, request auth por tenant/sessão, bot/webhook com assinatura e reentrega limitada, filtros {sessionId,senderJid,chatJid,messageType,fromMe,isGroup,chatType} preservados com null como não configurado quando contrato existente, upload size/mimetype e SSRF seguros, mídia privada não exposta.
Testes: duplicidade de request, race, queue retry, cron, arquivo grande, arquivo malicioso, symlink, DNS rebinding e webhook para host privado. Fixtures sintéticas antes de qualquer WhatsApp real.

### 3.6 UI, OpenAPI, assets, proxies
Paths: src/app/dashboard, src/app/auth, src/app/onboarding, src/app/api/docs/route.ts, src/app/api/swagger-auth/route.ts, swagger.json, next.config.ts, middleware.ts.
Expectativas: assets pelo URL base de carregamento; localhost sem contexto e proxy/ngrok com /wa-akg; ações privadas não acessíveis anonimamente; navegação responsiva, feedback de erro e teclado/foco; documentação com auth segura sem exposição de segredos client-side.
Testes: URLs diretamente e por proxy, refresh de página nested, links, WebSocket, login redirect, callback OAuth e OpenAPI parity. Browser E2E permitido via CDP/UIA ou testes HTTP, nunca Playwright.

## 4. Matriz de migração/upgrade
| Fonte | Estado em B2 | Obrigação |
| --- | --- | --- |
| prisma/migrations/20261024000000_baseline e sucessores | EXISTE | preservar checksums V1 |
| prisma/bootstrap-v2/manifest.json | A INTEGRAR | verificar lineage e base canônica |
| scripts/prisma-bootstrap-v2.mjs | A INTEGRAR | validar read-only default, ações explícitas |
| 20261103190400_reconcile_missing_processing_result | em histórico de integração a reconciliar | comparar existência real, não reproduzir em banco existente cegamente |
| 20261103190500_additive_multi_tenancy | em histórico de integração a reconciliar | confirmar aditividade, backfill separado |
| Banco virgem | TESTE A EXECUTAR | bootstrap sem P3018 |
| Banco B1 restaurado | TESTE A EXECUTAR | upgrade sem perda / checksums |
| Rollback/forward fix | TESTE A EXECUTAR | recuperação restaurável, sem reset |

## 5. Checkpoints da candidata antes de publicação
G1: referência B1 e política semver; G2: worktrees/snapshots; G3: upstream e personalizações; G4: conflitos resolvidos; G5: security R01–R15; G6: Prisma/restore; G7: tenancy; G8: OAuth/MFA; G9: WhatsApp/MCP; G10: docs/UI; G11: tests/CI local; G12: ensaio upgrade; G13: release remota; G14: observabilidade pós-deploy.
Para cada gate persistir: nome, dono, baseline SHA, comandos exatos, asserts, retorno, log local protegido, bugs encontrados, decisão, data, reviewer e status. NENHUM gate é satisfatoriamente testado por documento isolado.
