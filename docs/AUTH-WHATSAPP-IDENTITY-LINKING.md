# Autenticação progressiva e vinculação de identidade pelo WhatsApp

**Estado:** PROPOSED — especificação para implementação. Não implica que rotas, modelos ou fluxos descritos já existam.
**Escopo:** conversas de usuários finais recebidas por uma sessão WhatsApp de um tenant WA-AKG; vincular de modo seguro o remetente a uma conta interna para operações privadas.

## 1. Decisão e objetivos

O WhatsApp identifica um canal e um remetente, mas não prova a identidade civil nem concede acesso a uma conta. Conversas públicas começam sem login. Ao solicitar dados privados, o serviço exige uma vinculação autenticada. Cada operação subsequente revalida vínculo, associação ao tenant, estado da conta e política do recurso. Revogar vínculo deve impedir operações futuras.

Objetivos: evitar enumeração de contas; impedir associação por número conhecido; resistir a link vazado, encaminhado, expirado ou repetido; manter isolamento entre tenants; preservar atendimento público quando autenticação falha.

Não está incluído: login WhatsApp como provedor de identidade, MFA/passkeys completos, autorização de funcionários para sessões Baileys, compartilhamento entre usuários, migração automática de históricos, nem garantia de identidade fornecida pela plataforma.

## 2. Estado atual observado e integração

O projeto usa Next.js, Prisma 5, MySQL e Auth.js/NextAuth. `User` é global (email único); `TenantMembership` mantém papel e estado por tenant. O projeto tem políticas multi-tenant em progresso. A documentação de multi-tenant afirma que enforcement em todas as rotas, workers, MCP e transportes ainda é parcial; portanto, este recurso não pode presumir isolamento global completo.

Antes da implementação, inventariar o caminho real de entrada: sessão/conexão WhatsApp, normalização de JID/telefone, persistência de mensagem, determinação de tenant, bot/orquestrador e ferramentas acionáveis. Não derivar tenant do texto da mensagem, de um parâmetro controlado pelo usuário, nem do número remetente. A origem confiável é a sessão receptora e seu tenant validado no servidor.

## 3. Níveis de acesso e política

| Nível | Prova disponível | Permitido |
|---|---|---|
| 0 Público | Nenhuma identidade autenticada | FAQ e informações públicas; sem revelar existência de conta, pedidos ou histórico |
| 1 Canal reconhecido | JID remetente observado em sessão verificada | Continuidade e preferências de baixo risco; nunca presumir titularidade |
| 2 Conta vinculada | Link concluído por autenticação da conta no domínio confiável | Consultas privadas explicitamente autorizadas no tenant e recurso |
| 3 Ação confirmada | Vínculo ativo e confirmação vinculada a uma ação específica | Alteração de baixo/médio risco, conforme política do negócio |
| 4 Reautenticação forte | Login recente com fator forte/MFA/passkey | Credenciais, pagamentos e ações administrativas ou de alto impacto |

Uma mensagem “sim”, reação ou botão confirma apenas quando associada a um desafio pendente, não expirado, exibido para aquela ação e remetente. Uma confirmação nunca cria identidade, tenant ou permissão. Ações irreversíveis ou alto impacto devem usar página segura com reautenticação e eventual etapa humana.

## 4. Modelo de dados proposto

Criar entidade própria `ChannelIdentityLink` (nome provisório), sem reutilizar `User.phone`, `SessionAccess` ou um grant genérico. Campos mínimos:

| Campo | Tipo/constrangimento | Finalidade |
|---|---|---|
| `id` | CUID, PK | Identificador interno |
| `tenantId` | FK Tenant, obrigatório | Limite de segurança |
| `userId` | FK User, obrigatório | Conta autenticada vinculada |
| `channel` | enum/string limitada (`WHATSAPP`) | Extensão futura controlada |
| `channelAccountId` | identificador da sessão/conta receptora | Evitar misturar números comerciais |
| `subjectHash` | hash HMAC versionado do JID canônico | Localizar remetente sem índice de telefone reversível |
| `status` | `ACTIVE`, `REVOKED`, `EXPIRED`, `SUSPENDED` | Estado explícito |
| `linkedAt`, `expiresAt`, `revokedAt` | timestamps UTC | Vigência |
| `authTime`, `authMethod` | timestamp e enum/string controlada | Evidência da autenticação no site |
| `createdAt`, `updatedAt` | timestamps UTC | Auditoria operacional |

Índices/constraints: unique composto `(tenantId, channel, channelAccountId, subjectHash)` para impedir duplicatas ativas no mesmo escopo; índices de busca por `(tenantId,userId,status)` e `(tenantId,status,expiresAt)`. Se MySQL/Prisma impedir unique parcial para estados ativos, aplicar transação e lock/idempotência, sem sobrescrever silenciosamente vínculo existente. Considerar FK composta ou verificações transacionais que garantam membership ativa do `userId` no mesmo `tenantId`.

Tabela separada `ChannelLinkChallenge`: `id`, tenant, sessão receptora, `subjectHash`, `tokenHash` único, `purpose`, `createdAt`, `expiresAt`, `consumedAt`, `revokedAt`, `attemptCount`, `requestId`. Tokens em texto puro só existem na URL durante emissão; persistir somente hash criptográfico. TTL inicial recomendado: 10 minutos, configurável dentro de limites. Um desafio só pode ser consumido uma vez. Não guardar JID/telefone em logs; se requisitos operacionais exigirem recuperação do JID, definir criptografia em repouso e retenção separadamente.

Auditoria append-only (reutilizar `AuditEvent` se seu contrato suportar eventos de usuário final sem ampliar privilégios): emitir `LINK_REQUESTED`, `LINK_AUTHENTICATED`, `LINK_CREATED`, `LINK_REVOKED`, `LINK_EXPIRED`, `LINK_DENIED`; registrar tenant, actor quando autenticado, link/challenge ID opaco, request ID, resultado e motivo enumerado. Nunca registrar token, cookie, URL completa, telefone/JID, conteúdo da conversa ou credenciais.

## 5. Protocolo de vinculação

1. Receber evento de mensagem por integração verificada. Validar assinatura/origem conforme conector; identificar sessão receptora e tenant server-side; canonicalizar JID usando biblioteca/protocolo da integração. Rejeitar grupos, broadcast e remetentes sem identidade estável para este fluxo.
2. Criar desafio aleatório de alta entropia (mínimo 256 bits), guardar apenas hash, escopo de tenant/sessão/remetente, prazo e estado. Responder com URL HTTPS de domínio configurado, sem redirecionador aberto nem dados pessoais em query. Aplicar rate limit por remetente hash, tenant, IP e janela global.
3. Página web mostra marca/tenant e explica que a conta será conectada a este canal. Não mostrar email/conta encontrada antes de autenticação. Exigir login Auth.js. Se já houver sessão web, confirmar explicitamente a conta e o canal parcial (por exemplo últimos dígitos, apenas se privacidade aprovada). Usar CSRF protection e validação de `Origin`/`Host`; nunca confiar no domínio do cabeçalho `Host` encaminhado sem proxy confiável.
4. Após autenticação, validar novamente desafio, prazo, uso, tenant ativo e membership ativa do usuário no tenant. Não aceitar tenant ou userId do formulário como autorização. Se a conta não pertencer ao tenant, falhar sem criar membership nem revelar se a conta existe. O provisionamento de membership é um fluxo administrativo separado.
5. Consumir desafio e criar vínculo em uma única transação, com compare-and-set para `consumedAt IS NULL`, validando unicidade e estado. Não vincular um desafio cujo remetente/session/tenant não coincida com o evento inicial. Notificar o chat original com resultado genérico, apenas se desafio ainda for válido e o envio for permitido.
6. Responder no browser sem incluir dados privados. Redirecionar apenas para caminho local validado. Mensagem posterior pode confirmar conclusão; não revelar nome/email ou dados da conta no WhatsApp até a autorização de leitura.

Reenvio cria desafio novo e revoga desafios pendentes anteriores do mesmo propósito/sujeito. Cliques concorrentes resultam em no máximo um consumo. Respostas públicas e erros mantêm texto indistinguível para conta ausente, tenant incompatível, token inválido ou expirado.

## 6. Revogação e ciclo de vida

Disponibilizar revogação no painel autenticado e, se identidade do remetente puder ser resolvida com segurança, comando conversacional com confirmação apropriada. Revogação exige usuário autenticado e vínculo pertencente àquele usuário/tenant; registrar motivo categorizado. Rotacionar segredo HMAC com versão e plano de reindexação. Ao suspender/remover membership, suspender ou invalidar vínculos conforme decisão explícita de produto; nunca manter acesso por cache. Expiração é checada em toda decisão, além de eventual job de limpeza. Limpeza remove desafios expirados após janela curta de retenção, não necessariamente eventos de auditoria.

## 7. Autorização em cada operação

Criar serviço central `resolveChannelPrincipal`/`authorizeChannelAction` (nomes ilustrativos) que receba contexto server-side imutável: tenant validado, sessão receptora, JID canonicalizado/hash, ação, recurso e risco. Retorne principal tipado como `PUBLIC`, `LINKED_USER` ou `DENY`, com capabilities mínimas e motivo interno. Em cada acesso privado:

1. validar sessão receptora ativa e tenant ativo;
2. resolver vínculo ativo não expirado exato para tenant + canal + conta receptora + remetente;
3. verificar conta ativa e membership ACTIVE naquele tenant;
4. carregar recurso já filtrado por tenant; verificar dono/grant/capability e escopo;
5. avaliar nível de autenticação, frescor, confirmação e risco;
6. repetir a checagem imediatamente antes de executar efeito mutável, dentro do limite transacional possível.

Falha fecha por padrão. Não usar role global (`USER`, `STAFF`, `SUPERADMIN`), número WhatsApp, nome, prompt da IA, estado de conversa ou existência de vínculo como autorização suficiente. MCP, workers, Socket.IO e ferramentas recebem principal e capabilities limitadas; nunca credenciais globais nem tenant implícito. Revogação invalida caches; cache, se existente, deve ter chave incluindo tenant/link/version e TTL curto, com verificação de revogação para mutações.

## 8. Rotas e contratos propostos

Rotas ilustrativas, a ajustar ao padrão real do app:

- `POST /api/channel-links/challenges`: somente serviço interno confiável do inbound; criar desafio idempotente e devolver texto de resposta, não token para cliente arbitrário.
- `GET /auth/channel-link?token=...`: apresentar página sem consumir token em GET (scanners de link); aplicar `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, CSP e não carregar recursos de terceiros.
- `POST /api/channel-links/complete`: sessão Auth.js autenticada, CSRF/origin verificados; consumir desafio e criar vínculo. Respostas 400 inválido/expirado genéricas, 401 não autenticado, 403 conta sem membership/sem política, 409 desafio consumido/conflito.
- `GET /api/channel-links`: listar apenas vínculos do próprio usuário e tenant ativo; omitir identificadores completos do canal.
- `DELETE /api/channel-links/{id}`: revogar apenas vínculo próprio ou via administração tenant explicitamente autorizada e auditada; idempotência segura.

Nenhuma rota está implementada por esta especificação. Documentar schemas OpenAPI, limites de tamanho, rate limits e erros antes de marcar como implementada. Proteger criação do desafio contra chamada pública; proteger conclusão contra CSRF e replay. Não usar middleware como única autorização.

## 9. Segurança, privacidade e abuso

- Token: CSPRNG, pelo menos 256 bits, hash SHA-256/HMAC com segredo dedicado; comparação constante quando aplicável; nunca registrar token. TLS obrigatório, sem tokens em analytics, tracing, referer ou histórico de logs.
- Domínio: origem HTTPS allowlist configurada; não construir URL de callback a partir de mensagem, host não confiável ou parâmetro arbitrário.
- CSRF/session fixation: Auth.js, proteção CSRF, cookies Secure/HttpOnly/SameSite apropriados, reautenticar conta quando sessão antiga ou ação de risco elevado; regenerar sessão conforme capacidade do framework.
- Rate limits: por IP, tenant, subjectHash e token; respostas uniformes e atraso limitado; limites para emissão, tentativas e notificações. Monitorar abuso sem conteúdo pessoal.
- Privacidade: minimização de telefone/JID, finalidade explícita, retenção e exclusão documentadas; exportação/eliminação respeitam auditoria e obrigações legais; evitar enviar dados pessoais à IA quando não necessários.
- Link encaminhado: só pode ser concluído após login da conta elegível e confirmação explícita; idealmente confirmação adicional pelo canal original antes de ativar o vínculo. Definir essa confirmação como gate para contas de alto risco.
- Substituição de número: não transferir vínculos automaticamente; revogar o antigo após processo de recuperação autenticado.
- Contas compartilhadas/telefone reciclado: permitir múltiplos vínculos apenas por política explícita; impedir colisões não resolvidas e oferecer revogação/suporte.
- Logs/auditoria: IDs opacos e motivos enumerados; acesso restrito, retenção e alertas para volume anômalo.

## 10. Falhas e experiência

Se auth, banco, integração ou autorização falhar, interromper a ação privada sem revelar dados. Atendimento público continua. Responder que não foi possível concluir e oferecer nova tentativa/atendente. Não repetir automaticamente ações mutáveis. Outbound de conclusão usa deduplicação e retentativa limitada; falha no envio não desfaz vínculo criado, mas deve ser auditada e permitir consultar estado autenticado no site. Nunca alegar que o link foi enviado se o transporte falhou.

## 11. Migração e rollout

1. Inventário read-only de JIDs disponíveis, sessões/tenants, tabela User/Membership e políticas de retenção; sem inferir titularidade de números existentes.
2. Adicionar modelos/tabelas e índices de forma aditiva; gerar e revisar SQL offline. Nenhuma migração em produção nesta fase.
3. Implementar serviço de token, rotas e UI sem liberar autorização de dados privados.
4. Integrar resolver à entrada e a uma operação privada piloto; feature flag por tenant e capacidade do conector.
5. Rodar negativos com dois tenants e usuários, replay, expiração, revogação, concorrência e falhas de envio; auditar todas as rotas/ferramentas afetadas.
6. Ativar gradualmente após gates; rollback desativa criação/resolução do vínculo sem apagar registros. Migração reversa não deve destruir auditoria ou dados.

Não reutilizar vínculo ou histórico legado automaticamente. Dados ambíguos ficam sem vínculo até autenticação explícita.

## 12. Critérios de aceite e testes

- Usuário sem sessão acessa apenas conteúdo público e recebe fluxo de vinculação ao pedir dado privado.
- Saber/forjar o número WhatsApp não dá acesso a conta, pedidos ou histórico.
- Remetente, sessão receptora, tenant e conta precisam coincidir; tentativas cross-tenant falham sem vazamento.
- Token aleatório, não enumerável, hash-only no banco/logs; expirado, revogado, alterado e repetido falham.
- GET do link não consome token; scanners e prefetch não vinculam conta.
- Duas conclusões concorrentes criam no máximo um vínculo; idempotência evita notificações/efeitos duplicados.
- Usuário sem membership ativa não cria vínculo; membership revogada e vínculo expirado/revogado bloqueiam ação seguinte.
- Recurso privado exige autorização de recurso mesmo com vínculo válido; membro do tenant não herda dados de outro membro.
- Prompt injection, texto “sou admin”, tenant fornecido pelo usuário ou chamada MCP não ampliam capability.
- Confirmação está vinculada à ação/recurso, expira, é de uso único e não substitui reautenticação forte quando requerida.
- Logs e respostas não expõem token, telefone completo, existência de conta ou dados privados.
- Indisponibilidade falha fechada em operações privadas e preserva atendimento público; nenhuma ação mutável é repetida silenciosamente.

Testes unitários de canonicalização, token e política; integração de transação/concorrência com MySQL compatível; testes HTTP de CSRF, cookies e respostas; casos de isolamento A/B; verificação de logs sem PII; teste manual do fluxo em dispositivo/canal representativo. Não usar Playwright. Separar evidência local de teste real no WhatsApp.

## 13. Gates e definição de pronto

| Gate | Estado inicial | Saída exigida |
|---|---|---|
| G0 descoberta/compatibilidade | PROPOSED | fluxos reais de inbound/outbound, tenant e auth documentados |
| G1 desenho | PROPOSED | esquema, threat model, APIs e retenção aprovados tecnicamente |
| G2 persistência | PROPOSED | migração aditiva revisada; validação Prisma e SQL offline |
| G3 fluxo | PROPOSED | emissão, login, consumo único, revogação e auditoria implementados |
| G4 enforcement | PROPOSED | todas as operações privadas do escopo usam política central deny-by-default |
| G5 verificação | PROPOSED | critérios acima passam e evidências registradas |
| G6 ativação | DEFERRED | rollout por tenant autorizado; monitoramento e rollback prontos |

Só declarar VERIFIED com evidência de banco, HTTP, WhatsApp e isolamento conforme o gate. Uma unidade isolada aprovada não prova enforcement global. Mudanças de produção, migrações aplicadas, ativação externa ou comunicação a usuários exigem autorização operacional específica.

## 14. Decisões ainda necessárias antes do código

1. O WA-AKG está atuando como SaaS próprio ou como agente de um negócio cliente? Isso define quem é dono da conta interna e a base legítima de membership.
2. Qual provedor de login será aceito (Auth.js Credentials atual, OIDC externo, passkey/MFA futuro) e qual frescor de autenticação é exigido?
3. A ativação exige confirmação de volta no WhatsApp além do login HTTPS? Recomendado para risco alto e troca/recuperação de número.
4. Um mesmo remetente pode vincular mais de uma conta ou tenant? Padrão recomendado: não sem escolha explícita e contexto isolado.
5. Qual conector WhatsApp/capacidade de botão/Flows está disponível? Até comprovar, usar texto e página HTTPS.
6. Qual política de expiração, retenção e atendimento humano se aplica ao produto e às jurisdições atendidas?

## Referências internas

- `prisma/schema.prisma`: User, Tenant, TenantMembership, ResourceGrant e AuditEvent existentes.
- `src/auth.config.ts`, `src/lib/auth.ts`: integração Auth.js atual; confirmar estado no momento da implementação.
- `docs/MULTI-TENANT-IMPLEMENTATION.md`: limites e gates multi-tenant; registra enforcement ainda incompleto.
- `docs/API_ROUTE_AUTH_MATRIX.md`: revisar e atualizar para novas rotas e consumidores.
