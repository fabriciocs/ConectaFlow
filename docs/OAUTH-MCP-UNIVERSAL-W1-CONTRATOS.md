# ConectaFlow / WA-AKG — W1: Contratos de arquitetura OAuth/MCP Universal

Data: 2026-11-04  
Status: **IMPLEMENTED (especificação independente); BLOCKED (revisão multiagente e validação no Windows)**  
Base inspecionada: `feature/multi-tenant-isolation-20261103`, HEAD `86b3b0a` quando verificado.  
Documentos de referência no checkout: `docs/OAUTH-MCP-UNIVERSAL-METAESPECIFICACAO.md` e `docs/OAUTH-MCP-UNIVERSAL-AGENTS.json`.  

> Este arquivo documenta contratos e testes propostos. Nenhuma nova função, tabela, endpoint, migração ou integração externa é declarada operacional. A cópia foi gerada separadamente porque o Remote Desktop Commander parou de responder antes da confirmação da gravação no Windows.

## Invariantes vinculantes

- As decisões ARQ-AUTH-001 a ARQ-AUTH-024 orientam a solução; a implementação é faseada e exige evidências.
- O MCP **stdio** utiliza chave de API individual no ambiente protegido do processo de cada usuário. As variáveis locais não podem ampliar permissões do servidor.
- O MCP **HTTP** multiusuário utiliza um token OAuth Bearer **por requisição**, limitado ao usuário, cliente, grant, tenant, recurso e operação. Nenhuma variável global de API key pode atuar como identidade compartilhada.
- `SUPERADMIN` só opera entre tenants por fluxo privilegiado separado, com MFA, justificativa e auditoria; chaves comuns/OAuth/MCP nunca herdam essa globalidade.
- Falta de identidade, política, membership, audiência, concessão ou contexto consistente implica **DENY**. Aprovação pendente não autoriza efeito externo.
- Preservar arquivos staged, unstaged, untracked e worktrees. Não usar Playwright, reset, clean, push, merge, deploy, migrações reais, segredos ou envio WhatsApp sem autorização específica.

## S01 — Segurança OAuth/MCP

**Fronteiras:** login/Auth.js → Authorization Server → cliente OAuth → MCP HTTP → API; MCP local stdio → API; serviços/workers → recursos de tenant; proxy HTTPS → discovery. **Ativos:** API keys, hashes, tokens, authorization codes, refresh families, sessão WhatsApp, grants, metadados CIMD, dados privados e auditoria.

| Risco | Defesa exigida | Negativa a testar |
|---|---|---|
| SSRF/DNS rebinding em CIMD | HTTPS, DNS/IP público, tamanho e timeout limitados, sem redirects | URL interna, redirect, rebind, oversized |
| Troca de redirect/cliente/issuer | callback exata, state, PKCE S256, issuer consistente | verifier e redirect trocados |
| Token em recurso incorreto | Resource Indicators e audience estrita | token de MCP A para recurso B |
| Escalada entre tenants | tenant e grant derivados do token, predicados SQL | header x-tenant-id adulterado |
| Replay de refresh | rotação atômica, família revogada no replay | duas trocas concorrentes |
| Confiança por nome comercial | trust administrativo distinto da validação CIMD/DCR | cliente com nome conhecido |
| Rotação READ para WRITE | interseção de scopes com política persistida | chave read-only rotacionada |
| Prompt ou env concede privilégio | PDP no backend, capacidades locais só restritivas | ferramentas WRITE com key READ |
| Aprovação reproduzida | hash canônico, expiração, single-use e idempotência | mesmo approval executado duas vezes |
| Superadmin em MCP comum | fluxo elevado separado + MFA/razão/auditoria | bearer comum acessa outros tenants |
| Discovery falso sob proxy | JSON correto via issuer/resource URL pública | HTTP 200 de HTML/ngrok |
| Mudanças de metadados CIMD | fingerprint, histórico e revisão | callback adicionada após trust |

**Aceitação S01:** ameaça ↔ controle ↔ teste negativo ↔ responsável ↔ evidência, revisado independentemente.

## S02 — Conta, ativação e credenciais individuais

**Código inspecionado:** `src/app/api/auth/register/route.ts` cria usuário não verificado, tenant pessoal e membership. `src/lib/email-verification.ts` confirma o e-mail, mas não provisiona API key. `src/app/api/user/api-key/route.ts` roda `provisionManagedApiKey(..., true)` no POST. `src/lib/tenant-api-keys.ts` contém `DEFAULT_API_KEY_SCOPES` com `api:write` e `MCP_SETUP_API_KEY_SCOPES` somente leitura; `rotate=true` pode ampliar os scopes. A validação atual confere tenant e membership, mas não mostra teste explícito de `emailVerified`.

**Estados contratuais:** `REGISTERED_UNVERIFIED` → `VERIFIED` → `PROFILE_READY` → `CREDENTIAL_READY`; bloqueios `SUSPENDED`/`REVOKED`. A chave só é **utilizável** após verificação e política de autorização válida.

**Provisionamento:** idempotente por `(userId, tenantId, credentialType)`. Como o servidor guarda hash e não recupera uma API key original, preferir **emissão just-in-time** na sessão autenticada do wizard após ativação. A chave é revelada uma vez em resposta `Cache-Control: no-store`. GET de status informa prefixo e metadados, nunca segredo.

**Rotação:** manter ou reduzir escopos efetivos, nunca READ→WRITE sem autorização explícita. Chaves por integração têm titular, tenant, expiração, escopos e revogação independentes. Membership inválida/tenant suspenso/e-mail não verificado negam acesso. A variável `WA_AKG_MCP_CREDENTIAL_CAPABILITIES` nunca substitui o backend.

**Aceitação S02:** confirmação repetida, emissão concorrente, SMTP indisponível, chave perdida, rotação sem escalada, mudança de tenant, suspensão/revogação e exportação segura sem `.env` versionado.

## S03 — PDP, delegação e políticas

**Interfaces internas conceituais (não endpoints):**

- `AuthContext`: principalId, principalType, actorId?, userId?, tenantId, clientId?, grantId?, credentialId?, scopes[], resourceAudience?, sessionCapabilities, policyVersion, requestId.
- `PolicyRequest`: context, action, resourceType, resourceId, sourceTenantId, attributes, operationDigest?.
- `PolicyDecision`: effect (`DENY`, `ALLOW`, `APPROVAL_REQUIRED`), reasonCode, obligations[], decisionId, policyVersion, expiresAt?.

**Algoritmo:** autenticar identidade/cliente → validar token/audience/grant → validar tenant/membership/propriedade → aplicar bloqueios globais → intersectar scopes/RBAC/ABAC/ReBAC/grants → limites e risco → exigir aprovação quando necessário → revalidar antes do efeito → auditar. Em erro/falta de contexto: DENY.

**Compartilhamento entre tenants:** exigência de política global, aprovação pelas partes, sourceTenantId, targetTenantId, recurso, operação, expiração, auditoria e revogação; não retirar filtros SQL de tenant. O proprietário do recurso permanece o tenant de origem.

**Agentes/serviços:** identidade técnica própria ou delegação explícita com concedente, ações máximas, recurso, tempo e profundidade. Prompts e saída de ferramentas não mudam autoridade.

**Aceitação S03:** test matrix de dono/terceiro no mesmo tenant, tenant A→B, SUPERADMIN com bearer comum, service/agent, worker, mídia, operações em lote e refresh.

## S04 — Modelo Prisma, dados e migração

**Modelos presentes em `prisma/schema.prisma`:** User, Tenant, TenantMembership, ApiCredential, OAuthClient, OAuthAuthorizationRequest, OAuthAuthorizationCode, OAuthAccessToken, OAuthRefreshToken, OAuthRateLimitBucket, OAuthGrant e OAuthGrantSessionCapability.

**Candidatos condicionais:** ClientTrustPolicy, ClientMetadataRevision, AgentDelegation, ServiceIdentity, ResourceGrant, ApprovalRequest, PolicyRevision e AuthorizationAuditEvent. Reutilizar entidades existentes antes de adicionar qualquer tabela. Resguardar FKs, índices, hashing de segredos e integridade da migração.

**Bloqueio de banco:** a documentação multi-tenant registra drift com tabela `ProcessingResult` ausente apesar do histórico Prisma aparentemente atualizado. Antes de migrate/backfill: inspeção read-only, reconciliação de drift, backup restaurável, plano SQL **aditivo** offline, banco isolado e autorização. Não usar `prisma db push` no banco ativo.

**Aceitação S04:** schema validado, migration ensaiada em banco isolado, dados históricos preservados e rollback/restauração testados.

## S05 — Transporte MCP e compatibilidade

**Código atual:** `mcp/wa-akg-mcp/package.json` referencia SDK `@modelcontextprotocol/sdk` `^1.25.2` (versão efetivamente instalada não confirmada). `mcp/wa-akg-mcp/src/http.mjs` usa StreamableHTTPServerTransport, AsyncLocalStorage, sessões em memória por `Mcp-Session-Id`, TTL 30 minutos e limite 500; autentica Bearer via userinfo antes de processar qualquer método e exige `initialize` na nova sessão. `src/server.mjs` usa API key no ambiente do stdio.

**Contrato futuro:** versionar transporte/negociação, preservar testes legacy `initialize/tools/list`, avaliar suporte da versão MCP 2026-07-28 e capacidades do SDK **antes de migração**; não anunciar recursos que não foram implementados. HTTP deve devolver 401 com `WWW-Authenticate` e resource metadata quando não autenticado. Tokens não podem atravessar grant/tenant/client/resource; sessões legadas também não. URLs de discovery exigem issuer e prefixos corretos sob proxy. 200 HTML não é sucesso.

**Aceitação S05:** compatibilidade medida por versão/cliente, leitura real autorizada, negação sem bearer, token expirado/revogado, session resume cruzado bloqueado, discovery JSON público válido e nenhum efeito externo não solicitado.

## S06 — Capacidades, OpenAPI, A2A e eventos

**CapabilityDefinition proposta:** id, version, name, description, inputSchema, outputSchema, resourceType, action, requiredScopes, defaultRisk, readOnly, idempotent, timeout, requiresApproval, privacyClass. Exemplo abstrato: `sessions.list`, leitura paginada vinculada a `sessions:read`, não declaração de endpoint.

**MCP-first, não MCP-only:** Tools/resources/prompts e REST/OpenAPI compartilham PEP/PDP e serviços de domínio. A2A, n8n, webhooks, AsyncAPI/CloudEvents são adaptadores opcionais, não módulos existentes presumidos. Webhooks exigem assinatura, timeout, tenant, deduplicação, retry e proteção SSRF. Eventos exigem eventId, correlação, tenant, causalidade e controle de visibilidade.

**Aceitação S06:** esquemas válidos, autorização equivalente API↔MCP, erros padronizados, paginação, idempotência e testes de recursos privados.

## S07 — Onboarding e experiência de usuário

**Jornada:** cadastro → e-mail verificado → tenant selecionado → perfil individual → modo stdio/OAuth HTTP → cliente CIMD/DCR/manual → consentimento e sessão WhatsApp → preflight → execução READ pelo cliente → gerenciamento/revogação.

**Estados UI:** ACCOUNT_PENDING, VERIFIED, CREDENTIAL_READY, CLIENT_REGISTERED, AUTHORIZED, PRECHECK_OK, TOOL_READ_VERIFIED, BLOCKED, REVOKED. Nunca apresentar conectado apenas por sucesso no pré-flight ou clique no wizard.

**Requisitos:** segredo revelado uma vez para stdio, sem armazená-lo no navegador/URL/log; HTTP não pede chave; consentimento esclarece cliente, origem, tenant, sessões, escopos READ/WRITE, limites e validade. Administração global somente pelo SUPERADMIN. Aprovações humanas possuem UI independente das extensões específicas de Claude/ChatGPT. Interface Material Design 3, mobile-first, acessível, com estados loading/empty/error.

**Aceitação S07:** teste exploratório Brave/CDP sem Playwright, tenants e usuários sintéticos e provas de erro, revogação e read-only real.

## S08 — Testes, observabilidade e gates

| ID | Teste | Critério de aceite |
|---|---|---|
| QA01 | conta não verificada | chave inutilizável |
| QA02 | ativação repetida | sem duplicação |
| QA03 | rotação READ | não ganha WRITE |
| QA04 | cabeçalho tenant adulterado | DENY |
| QA05 | outro dono no mesmo tenant | DENY sem grant |
| QA06 | superadmin com bearer comum | sem bypass |
| QA07 | refresh token replay | família bloqueada |
| QA08 | CIMD malicioso | SSRF/redirect rejeitados |
| QA09 | cliente sem trust | acesso negado por política |
| QA10 | MCP sem bearer | 401 e metadata corretos |
| QA11 | grant revogado | chamada de ferramenta negada |
| QA12 | aprovação vencida/repetida | nenhum efeito |
| QA13 | discovery com prefixo | JSON correto, sem header especial |
| QA14 | cliente MCP real | leitura e auditoria verificadas |
| QA15 | regressão de WhatsApp | zero envios externos involuntários |
| QA16 | npm lint/test/MCP/build/tsc | comandos, falhas e cobertura registrados |

**Evidências:** comandos, stdout e stderr separados, exit codes, PID, timestamps, subprocessos, assertions, HEAD e dirty snapshot, riscos e blockers. Verificação estática não comprova runtime.

## Barreira W1 → W2

1. Reconciliar/assinar contratos de AuthContext, PDP, trust de clientes e API keys.
2. Decidir geração pós-ativação versus emissão just-in-time; ambas impedem utilização antes de verificação.
3. Resolver drift de banco e provar backup/restauração antes de migrações.
4. Auditar variáveis globais MCP/Compose e demonstrar isolamento multiusuário.
5. Validar SDK e versões MCP efetivamente suportadas.
6. Obter revisão independente dos documentos W1 após recuperação do limite do Codex ou por outro revisor autorizado.
7. Criar worktrees isolados e ownership exclusivo para agentes escritores; não alterar alterações existentes.
8. Exigir autorização separada para push/merge/deploy, banco real, proxy, credenciais reais e envios WhatsApp.

## Resultado da execução desta tentativa

- **VERIFIED:** protocolo operacional do Remote Desktop Commander lido; HEAD e dirty-worktree identificados; códigos de cadastro, API key, Prisma e transporte MCP inspecionados; erro de quota do Codex confirmado com exit code 1.
- **IMPLEMENTED:** versão independente desta especificação W1.
- **BLOCKED:** análise por subagentes Codex e validação remota final, porque o CLI atingiu limite de uso e o Desktop Commander deixou de responder durante a gravação.
- **NOT_VERIFIED:** gravação do documento W1 em `C:\repos\WA-AKG\docs\OAUTH-MCP-UNIVERSAL-W1-CONTRATOS.md` (chamada de gravação remota sem confirmação); execução de testes MCP e Git status finais.

Não repetir a gravação remota até confirmar o estado real do arquivo. Não iniciar novos agentes até resolver o limite de conta e recuperar a conexão com o computador.
