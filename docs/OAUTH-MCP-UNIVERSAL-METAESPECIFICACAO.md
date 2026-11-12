# Metaespecificacao de implementacao — OAuth/MCP Universal e orquestracao multiagente

> Projeto: ConectaFlow / WA-AKG | Emissao: 2026-11-04 | Estado: PROPOSED
> Fonte de verdade: codigo atual, AGENTS.md, CLAUDE.md, docs/OAUTH.md, docs/ONBOARDING-MCP.md, decisoes ARQ-AUTH-001 a 024 desta entrevista.
> Este documento e um contrato de trabalho e nao declara componentes propostos como implementados ou testados.

## 1. Missao e criterios de sucesso

Construir autenticacao e autorizacao universais para MCP, API REST/OpenAPI, agentes e integracoes, com cadastro de usuario, provisionamento individual de credenciais, consentimento OAuth, multi-tenancy seguro e interoperabilidade entre clientes. Utilizar o maior paralelismo SEGURO possivel com agentes e subagentes especializados, contratos congelados, escritor unico por arquivo, worktrees isolados, verificacoes auditaveis e integracao controlada.

Resultados finais exigidos:
- Conta criada com tenant pessoal; ativacao condicionada a verificacao e politicas administrativas.
- Perfil de integracao por usuario e tenant; API key gerada criptograficamente, revelada uma unica vez, com escopos minimos e rotacao sem ampliacao de privilegios.
- MCP stdio utiliza credenciais do ambiente do processo do usuario, nunca de outro usuario.
- MCP HTTP compartilhado usa Authorization Bearer por requisicao e concede somente acesso ao tenant, cliente, recurso e operacao autorizados; nunca uma API key global para alternar usuarios.
- CIMD, DCR e clientes manuais/empresariais regidos por trust policies, consentimento, quotas, revogacao e auditoria.
- Autorizacao aplicada na API/backend e no MCP; prompts, variaveis e argumentos do agente nunca concedem autoridade por si.
- Compatibilidade MCP moderna e legada comprovada por testes separados; clientes sem suporte nativo usam adaptadores.
- Admin global com MFA, justificativa e auditoria em sessao privilegiada; nunca token MCP com acesso global implicito.
- Provas de comportamento real, testes negativos e documentacao em sincronia.

Nao incluidos automaticamente: push, merge, deploy, migracoes no banco real, rotacao de credenciais reais, publicacao externa, alteracoes no Caddy/ngrok, instalacao de dependencias ou envio de mensagens WhatsApp. Cada efeito exige gate e autorizacao propria.

## 2. Baseline confirmado em 2026-11-04

- Checkout: C:\repos\WA-AKG; branch feature/multi-tenant-isolation-20261103; HEAD 86b3b0a no inicio do levantamento.
- Mudancas locais preexistentes: src/lib/private-media.ts, teste privado correspondente, dois documentos locais de migracao/backfill e uma migracao Prisma de reconciliacao nao rastreada. Preservar integralmente.
- Node 24.22.0; Codex CLI 0.166.0; pnpm nao encontrado nesta sessao; package.json define npm scripts.
- Componentes existentes: src/lib/oauth/, src/lib/tenant-api-keys.ts, src/lib/tenancy/, src/lib/tenant-policy.ts, src/app/api/oauth/, src/app/api/auth/, mcp/wa-akg-mcp/.
- O cadastro ja cria usuario e tenant pessoal. O POST /api/user/api-key gera/rotaciona chave; o MCP stdio le WA_AKG_API_KEY; HTTP consulta autorizacao OAuth.
- Lacuna conhecida para planejar: provisionamento nao esta incorporado diretamente ao registro; politica de rotacao da API key deve ser revista porque DEFAULT_API_KEY_SCOPES inclui api:write; declaracoes locais de capabilities nao podem elevar a permissao persistida.
- O CIMD atual registra o cliente no banco no primeiro uso; a meta proposta separa metadados remotos de politica de confianca e concessoes, preservando compatibilidade.
- A validacao real de banco, ambiente HTTP externo e clientes Claude/ChatGPT requer evidencias independentes; nao assumir funcionamento.

## 3. Decisoes vinculantes — ARQ-AUTH-001 a ARQ-AUTH-024

| ID | Contrato aprovado | Base |
| --- | --- | --- |
| 001 | Login obrigatorio por padrao, login sob demanda so para capacidades explicitamente publicas | C |
| 002 | Somente superadministrador habilita modalidades e limites superiores | D |
| 003 | Isolamento por tenant; compartilhamento interno e intertenant mediante politica e consentimento | D |
| 004 | RBAC + ABAC + ReBAC + scopes + grants + politicas contextuais + aprovacao | D |
| 005 | CIMD, DCR e clientes manuais/empresariais com trust policy e ciclo de vida | D |
| 006 | Cofre, rotacao, renovacao, reconexao, revogacao e auditoria | D |
| 007 | Identidade e perfil ao cadastrar; segredos utilizaveis so apos verificacao/ativacao | recomendada |
| 008 | Ambiente isolado por usuario para stdio, bearer por requisicao para HTTP | recomendada |
| 009 | Menor privilegio; somente leitura no provisionamento inicial | recomendada |
| 010 | Consentimento por cliente, tenant, recurso, capacidade, operacao e prazo | recomendada |
| 011 | OAuth, API key, identidade de servico e empresa conforme politica | recomendada |
| 012 | Identidade propria de agente ou delegacao verificavel | recomendada |
| 013 | Refresh rotativo com deteccao de replay e reautenticacao segura | recomendada |
| 014 | Segredos recuperaveis criptografados; API key apenas hash; exportacao unica | recomendada |
| 015 | Wizard com preflight e teste real, distinguindo configuracao de sucesso | recomendada |
| 016 | Classificacao e confianca verificavel de clientes | recomendada |
| 017 | Revogacao por usuario, tenant, cliente, agente, concessao e sessao | recomendada |
| 018 | MCP-first, nao MCP-only: REST/OpenAPI, A2A, webhooks/eventos, adaptadores | recomendada |
| 019 | Tasks persistentes, cancelamento, retry controlado e idempotencia | recomendada |
| 020 | OIDC/SSO e MFA configuravel; MFA administrativo obrigatorio | recomendada |
| 021 | Audit trail correlacionada e sem segredos | recomendada |
| 022 | Migracoes aditivas e compatibilidade sem perda de dados | recomendada |
| 023 | Quotas distribuidas e MCP stateless quando suportado | recomendada |
| 024 | Matriz de testes E2E, seguranca e interoperabilidade com provas | recomendada |

As decisoes especificam o destino; nao implicam que todo recurso seja obrigatorio no primeiro release. Priorizar fases por risco, dependencias e valor.

## 4. Referencias normativas e politica de compatibilidade

- MCP 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28 ; consultar changelog e implementacao efetiva do SDK.
- Compatibilidade anterior MCP 2025-11-25 e variantes utilizadas por clientes reais; isolamento de codec/transporte e suites separadas.
- OAuth 2.0 Security BCP RFC 9700; PKCE RFC 7636; Resource Indicators RFC 8707; OAuth AS metadata RFC 8414; protected-resource metadata RFC 9728; issuer identification RFC 9207.
- Client ID Metadata Document: draft-ietf-oauth-client-id-metadata-document-03, publicado em 2026-11-02; Internet-Draft, nao RFC.
- DCR RFC 7591 e gerenciamento RFC 7592 opcional; cliente pre-registrado como fallback.
- Revocation RFC 7009, token introspection RFC 7662, RAR RFC 9396, Token Exchange RFC 8693 (fase propria).
- OpenAPI para contratos HTTP, JSON Schema para tools, A2A/AsyncAPI/CloudEvents para adaptadores quando justificados.
- Cada afirmacao de compatibilidade deve ser provada para versao especifica do cliente/SDK, nao derivada de uso generico da sigla MCP.

## 5. Arquitetura logica: identidade + politicas + capacidades

Entrada: Auth.js (browser), OAuth Authorization Server, chave API validada (stdio via API), servico/autonomia se habilitado.
PEP: validacao por canal, sem confiar no frontend, tools list, nome de ferramenta, X-Tenant-Id ou variaveis locais.
PDP/PIP: usuario ativo, vinculo tenant, identidade de agente/cliente, trust policy, grant, resource, escopos, relacoes, aprovacoes, limite e classificacao de risco.
Execucao: servico de dominio e Prisma com predicado tenant explicito; servicos consumidores e workers reavaliam permissoes.
Auditoria: decisao + operacao + resultado + correlacao + versao da politica, sem tokens, cookies ou payload sensivel.
Regra: qualquer ausencia de contexto, falha de leitura de politica ou revogacao => DENY. Aprovacao pendente => nao executar.

Contrato abstrato de decisao: principalId, principalType, clientId, tenantId, grantId, resourceId, action, policyVersion, decision, reasonCode, obligations, auditId.
Decisoes internas: DENY, ALLOW, APPROVAL_REQUIRED; APPROVAL_REQUIRED nunca equivale a autorizacao definitiva.
Identidade tecnica independente usa grant proprio e nao herda automaticamente papeis humanos.
Compartilhamento intertenant exige delegacao explicita, aceite responsavel, escopo, prazo, dupla identidade de tenant e auditabilidade; nao remover filtros de tenant.

## 6. Fluxos obrigatorios

### F1 — Conta e provisionamento individual
1. Criar conta, tenant pessoal e membership transacional sem emitir segredo ativo no signup.
2. Confirmar e-mail, estado da conta e politicas da plataforma.
3. Provisionar perfil MCP idempotente por userId + tenantId; gerar chave read-only de alta entropia ou gerar sob demanda apos ativacao.
4. Persistir hash da API key, prefixo nao sensivel, scopes, criacao, expiracao, revogacao e referencia; expor valor uma unica vez no fluxo autenticado protegido.
5. Garantir que rotacao nao amplie escopos; escopos de escrita dependem de concessao administrativa explicita.
6. Habilitar download local protegido do template de ambiente, sem gravar segredo em arquivo versionado ou NEXT_PUBLIC_.
7. Se segredo for perdido, gerar novo e revogar anterior; nunca tentar reconstruir hash.

### F2 — MCP stdio local
- O processo individual recebe WA_AKG_API_BASE_URL e WA_AKG_API_KEY do proprio usuario, preferindo vault/secret store da maquina.
- WA_AKG_MCP_CREDENTIAL_CAPABILITIES e apenas filtro local adicional, validado contra policy/credencial no backend; nao fonte de scopes ou grants.
- Nao confiar em credenciais de processos ou usuarios diferentes. Sem token => erro autenticado; sem permissao => 403/erro seguro.
- Para API remota, HTTPS e allowlist explicita; credenciais nunca em URL.

### F3 — MCP remoto HTTP
- Discovery AS/resource, CIMD/DCR/manual, login, tenant, consentimento, Authorization Code+PKCE S256, resource audience, token e refresh.
- O token e validado por requisicao e vinculado a usuario, client, tenant, grant, resource, scopes e permissoes atuais.
- Nao colocar WA_AKG_API_KEY global no processo de HTTP multiusuario; usar bearer delegado individual.
- Expor 401 com WWW-Authenticate e metadata resource correta; nunca fornecer ferramentas privadas anonimamente.
- Revalidar permissionamento em cada tool call e antes de efeitos irreversiveis; suporte step-up quando implementado.

### F4 — Aprovacao humana
- Operacao recebe identificador e hash canonico de argumentos.
- PENDING com prazo, decisor autorizado e contexto; notificar via UI, independentemente de suporte do cliente a elicitation.
- APPROVED exige revalidacao atual de usuario/tenant/recurso/politica, single-use e idempotencia.
- NEGADO, expirado ou revogado => nao executar; auditar sem dados sensiveis.

### F5 — Revogacao e reparo
- Revogar cliente, grant, familia refresh, API key, membership, agente ou recurso bloqueia novas operacoes.
- Recuperar conexao sem redefinir privilegios; refresh replay cancela familia; long tasks reavaliam autorizacao.
- Evitar enviar mensagens externas como efeito de validacao.

## 7. Componentes e contratos a evoluir

| Area | Codigo atual principal | Dono sugerido |
| --- | --- | --- |
| Cadastro/ativacao | src/app/api/auth, src/lib/email-verification.ts | auth-identity |
| Credenciais | src/lib/tenant-api-keys.ts, src/app/api/user/api-key | credential-vault |
| OAuth e clientes | src/lib/oauth, src/app/api/oauth | oauth-clients |
| Politica tenant | src/lib/tenant-policy.ts, src/lib/tenancy | policy-engine |
| Banco/Prisma | prisma/schema.prisma, prisma/migrations | schema-owner unico |
| MCP HTTP/stdio | mcp/wa-akg-mcp/src | mcp-transport |
| Descoberta/OpenAPI | src/app/.well-known, swagger.json | contracts-adapters |
| UI/consentimento | src/app/auth/oauth, src/components/auth, src/app/dashboard | ux-onboarding |
| Testes/evidencias | src/lib/__tests__, mcp/wa-akg-mcp/test, scripts | qa-owner |
| Integracao | todos os modulos via revisao, nunca edicao concorrente no mesmo tree | integrator |

API atual confirmada (nao inventar rotas): POST/GET/DELETE /api/user/api-key, /api/oauth/authorize, /api/oauth/token, /api/oauth/register, /api/oauth/clients, /.well-known/oauth-authorization-server e /.well-known/oauth-protected-resource.
Novas rotas para approvals, provisionamento ou trust policies somente depois de design OpenAPI versionado e teste de autorizacao; nomes finais nao fixados neste plano.

## 8. Topologia multiagente e maximo paralelismo seguro

Perfil principal Codex: engenharia-plataforma. Metodologia: execucao-orquestrada. Apoios: design-produto, documentos-dados e auditoria de seguranca. A configuracao CLAUDE.md declara topologia hierarchical-mesh e limite de 15 agentes, mas o limite real depende de agentes registrados, CPU, memoria, provedores, custo e politicas.

Regra de capacidade: concurrency = min(agentes realmente disponiveis, slots de recursos, numero de tarefas prontas SEM conflito de ownership, teto autorizado). Nunca assumir 15 tarefas simultaneas por haver configuracao com 15.

Coordenador lider: mantem backlog/DAG, policy envelope, baseline Git, task leases, ownership de caminhos, status, evidencias, riscos, integracao.
Agentes especialistas: pesquisador de codigo; seguranca; identidade; credenciais; OAuth/CIMD/DCR; tenant/policy; schema; MCP transporte; capability catalog; API/adaptadores; onboarding/UI; qualidade/testes; observabilidade; documentacao. Agentes filhos so podem reduzir, nunca ampliar permissoes, ferramentas, acesso a segredos, custo ou efeito externo.

### W0: fan-out de diagnostico somente leitura (4 agentes em paralelo)
- A: Auth.js/OAuth/trust/grants.
- B: MCP HTTP/stdio/versioning/tools.
- C: cadastro/tenant/Prisma/API key.
- D: testes, worktrees, integracao e risco.
Barreira W0: reunir inventarios de arquivos, contratos existentes, gaps e perigos; sem duplicar interpretacoes nem confundir hipoteses com fatos.

### W1: fan-out de especificacao (ate 8 agentes)
- S1 threat model OAuth/CIMD/DCR e matrizes negativas.
- S2 conta/ativacao/provisionamento e politica de segredo.
- S3 modelo PDP, scopes, trust e intertenant.
- S4 modelo Prisma e migracoes aditivas.
- S5 MCP moderna e legado, adapter de versao.
- S6 catalogo capabilities, OpenAPI e A2A/webhooks.
- S7 UX consentimento/onboarding/admin.
- S8 plano de testes, observabilidade e rollback.
Barreira W1: revisar conflitos, congelar contratos de interface e schema, listar gates de autorizacao; policy de seguranca aprovada pelo integrador.

### W2: implementacao independente apos congelamento de contratos
Em worktrees isolados, com dono EXCLUSIVO por escopo e revisores separados:
- auth-identity: ativacao/conta; depende S2 e schema contrato.
- credential-vault: provisionamento/rotacao read-only; depende schema + S2.
- oauth-clients: trust/client lifecycle/tokens; depende S1/S3 + schema.
- policy-engine: PDP, recursos e cross-tenant; depende S3 + schema.
- mcp-transport: transportes modern/legacy e autenticao; depende contratos OAuth e PDP.
- contracts-adapters: capability catalog e contratos; depende S5/S6.
- ux-onboarding: interface e wizard; depende API/contratos versionados.
- qa-evidence: testes/fixtures independentes sem mudar implementacoes alheias.
Barreira W2: integrador revisa patches e conflitos, migra apenas em sandbox explicitamente autorizada; jamais merge sem autorizacao.

### W3: fan-out de validacao
Em worktrees ou bancos descartaveis isolados: unitario policy; OAuth negativos; MCP legado/moderno; tipos/lint; UX via Brave CDP (nunca Playwright); proxy HTTPS; isolamento de tenant; testes de concorrencia e quotas.
Barreira W3: nenhum gate VERIFIED sem log com comando, contexto e resultado. Dependencias indisponiveis => BLOCKED/NOT_VERIFIED.

### W4: revisao e entrega
Agentes de seguranca e arquitetura revisam sem mutacao, integrador corrige conflitos seguros, documentador atualiza contratos; publicar apenas com autorizacao especifica.

## 9. Contrato de tarefa/agente e controle de ownership

Cada tarefa no manifesto JSON possui: id, wave, type, ownerRole, dependsOn, paths (escrita exclusiva), parallelGroup, risk, evidence, acceptance e status.
Para cada agente: prompt inclui objetivo, baseline exato, caminhos permitidos, proibicoes, contrato de entrada, saida, criterios de aceite, teste e handoff ao coordenador.
Agentes de leitura podem operar no mesmo checkout simultaneamente. Agentes escritores somente em worktrees isolados; compartilhar manifests e locks apenas via dono integrador.
Proibir changes concorrentes ao mesmo arquivo, schema.prisma, migrations, package-lock, .env, proxy ou deployments. A independencia declarada nao supera conflitos reais.
Mensagens de handoff: TASK_ID, BRANCH, HEAD, INPUTS, FILES, DIFF, CHECKS, RISKS, BLOCKERS, NEXT, EVIDENCE. Nunca afirmar que subagentes foram executados se somente planejados.
A configuracao de modelos/perfis nao e autorizacao para criar contas, efetuar gastos, instalar pacotes ou acessar sistemas de terceiros.

## 10. Gates de seguranca e de dados

G0: git status staged/unstaged/untracked/local commits/worktrees; instrucoes de repositorio; nenhum segredo lido.
G1: inventario de rotas e chamadas, contrato de escopos/tenant e matriz de risco.
G2: schema Prisma incremental com reversibilidade documentada; banco de teste isolado; proibidos reset, db push em banco real ou exclusao.
G3: provisionamento pos-ativacao idempotente, read-only default e revogacao; teste sem chaves reais.
G4: OAuth/CIMD/DCR seguro, PKCE S256, resource, redirect exata, SSRF e quota.
G5: tenant owner/resource/agent delegation/approval/revocation negados por padrao.
G6: MCP stdio env usuario e HTTP Bearer por requisicao; sem chave global.
G7: tools catalog, API e MCP com enforcement equivalente.
G8: UX onboarding, consentimento e tela de gerenciamento sem vazamento.
G9: testes negativos, tipos, lint, build, testes API/MCP; backend real apenas quando dependencias comprovadas.
G10: interoperabilidade com versoes e clientes efetivos, HTTPS/proxy verificados, auditoria coerente e docs atualizadas.
G11: revisao de alteracoes, autorizacao explicita antes de push/merge/deploy/migracao externa.

## 11. Validacao e evidencias

Comandos atuais disponiveis (executar apenas em ambiente apropriado): npm run lint; npm test; npm run mcp:check; npm run mcp:test; npm run build; testes TypeScript via binario local se presente. Nao presumir pnpm nem Node modules.
Teste remoto nao e validado por HTTP 200 isolado: exigir descoberta correta, PKCE, login, token, initialize ou discover conforme era, tools/list, ferramenta read-only e negativa cross-tenant.
Capturar logs RAW separados, timestamps, exit code, PID, subprocessos e resultados, sob .remote-desktop/sessions/<id>, sem segredos. Rastrear RELATORIO => EVIDENCIA => COMANDO => LOG.
Estados de tarefas: PROPOSED, IMPLEMENTED, TESTED, VERIFIED, BLOCKED, DEFERRED, FAILED. Para comando: PLANNED, RUNNING, SUCCEEDED, FAILED, SKIPPED. Sucesso so com criterios demonstrados.

## 12. Riscos a tratar antes de implementar

- Credenciais geradas/rotacionadas podem herdar scopes de escrita; exigir novo contrato read-only e testes de nao escalacao.
- Segredo colocado em variavel global de processo HTTP compartilhado pode quebrar isolamento; nunca implementar por usuario dessa forma.
- Banco de dados pode nao ter migracoes tenant aplicadas; validar status sem alterar dados.
- Worktrees existentes podem ter branches divergentes e mudancas; inspecionar cada um antes de reutilizar.
- Codex CLI e hooks podem falhar, explorar contextos irrelevantes ou ficar sem acesso a modelos; limitar ferramentas/permissoes e ter fallback para analise direta.
- SDK MCP moderno pode exigir atualizar dependencias e reescrever transporte; primeiro provar interoperabilidade anterior e negociar versao.
- Reverse proxy com path base, public origin e ngrok pode quebrar discovery; nao editar servicos compartilhados durante a especificacao.
- Logs e testes de WhatsApp devem ser read-only sem acionamento externo involuntario.

## 13. Ordem de trabalho para proxima execucao autorizada

1. Auditar relatórios de W0 e completar lacunas; preparar contratos e matriz de teste em W1 paralelamente.
2. Validar ownership e estado Git em todos os worktrees candidatos, gerar plano de patches isolados.
3. Fixar contrato de APIs, politica de scopes e estrategia de schema antes de W2.
4. Implementar primeiro seguranca/ativacao/credenciais/tenant (G2-G6); evoluir OAuth e transportes conforme dependencias.
5. Executar testes segmentados e e2e nao destrutivos; integrar e revisar no checkout principal, respeitando alteracoes existentes.
6. Separar gates de release externo e publicacao: nao inclusos nesta metaespecificacao.

## 14. Referencias internas

- AGENTS.md; CLAUDE.md; package.json; prisma/schema.prisma
- docs/OAUTH.md; docs/ONBOARDING-MCP.md; docs/MULTI-TENANT-IMPLEMENTATION.md; docs/MULTI-TENANT-MIGRATION.md
- src/lib/oauth/service.ts; src/lib/oauth/cimd.ts; src/lib/oauth/dcr-registration.ts
- src/lib/tenant-api-keys.ts; src/lib/tenant-policy.ts; src/lib/tenancy/context.ts
- src/app/api/auth/register/route.ts; src/app/api/user/api-key/route.ts
- mcp/wa-akg-mcp/src/http.mjs; mcp/wa-akg-mcp/src/server.mjs
- Manifesto de agentes: docs/OAUTH-MCP-UNIVERSAL-AGENTS.json

A metaespecificacao esta IMPLEMENTED como documento, nao como funcionalidade da aplicacao. Testes/revisoes devem atualizar os estados conforme evidencias reais.
