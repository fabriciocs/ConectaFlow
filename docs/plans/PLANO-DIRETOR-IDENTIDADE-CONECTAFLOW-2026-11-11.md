# PLANO DIRETOR — Consolidação integral da identidade ConectaFlow
**Data:** 2026-11-11  
**Estado:** PROPOSED (planejamento); inventário remoto e sincronização local: VERIFIED  
**Repositório:** https://github.com/fabriciocs/ConectaFlow  
**Documento:** `docs/plans/PLANO-DIRETOR-IDENTIDADE-CONECTAFLOW-2026-11-11.md`  
**Escopo:** substituir, sempre que tecnicamente viável e seguro, a identidade antiga WA-AKG e todas as suas variações nas superfícies sob controle do projeto. **Não é autorização para implementar toda a migração, integrar, publicar, alterar produção ou modificar dados reais.**

## 1. Objetivo, princípios e critérios de aceite

1. Tornar **ConectaFlow** o nome público e técnico canônico da aplicação, serviços, interface, APIs documentadas, plugins, MCP, documentação, scripts, empacotamento e infraestrutura **nova**.
2. Eliminar referências antigas **ativas e desnecessárias**, incluindo conteúdo textual, metadados, nomes de arquivos/pastas, identificadores, paths, recursos de infraestrutura, URLs, imagens, favicon, marca, manifestos, documentação, exemplos, testes, CLI e nomes de pacotes gerenciados pelo projeto.
3. Preservar integralmente autenticação, autorização, OAuth, PKCE, sessões, chaves de API, isolamento multitenant, MFA, dados Prisma/MySQL, estados Baileys, integrações WhatsApp, webhooks, Socket.IO, MCP, backups e upgrade V1→V2.
4. Permitir referências antigas **somente** quando forem identificadores históricos, atribuições de terceiros, contratos externos em uso, mecanismos de compatibilidade controlados e evidenciados ou artefatos imutáveis.
5. Ser **reversível e testável** em uma cópia restaurável, nunca executar renomeação global cega.

**Definição de pronto:** zero referências antigas ativas não justificadas; 100% das ocorrências remanescentes classificadas em allowlist com motivo, proprietário e prazo; identidade pública ConectaFlow validada nas superfícies suportadas; contratos existentes preservados ou migrados de modo versionado; testes e rollback aprovados; autorização de publicação separada.

## 2. Baseline verificada (não alterar este histórico)

- O GitHub redireciona `fabriciocs/WA-AKG` para `fabriciocs/ConectaFlow`. Branch padrão: `main`; HEAD remoto observado: `e7936598319fc6c07584b24dbf21814f45fc2e56`.
- Branches remotas de origin: `main`, `release/prod-v1`, `release/b2-integration-20261109`, `feature/multi-tenant-isolation-20261103`, `feature/security-remediation-20261106` e `codex/auth-whatsapp-identity-linking-20261108`.
- O repositório local está em `C:\repos\ConectaFlow`, branch ativa `codex/auth-whatsapp-identity-linking-20261108`, HEAD `a6496f771347bab345e24b8f25a1a3392dfd2010`.
- `git fetch --all --tags --no-recurse-submodules`: exit 0. `git pull --ff-only --no-rebase origin codex/auth-whatsapp-identity-linking-20261108`: exit 0, HEAD inalterado.
- Árvore local observada: **110 modificações unstaged, 0 staged, 0 untracked** antes de criar este documento. São exclusões de registros/artefatos históricos. **Preservar; não restaurar, descartar, commitar ou manipular sem reconciliação própria.**
- Há commits locais não representados nas refs remotas para branches de integração/release. Em especial, a branch local `release/b2-integration-20261109` aponta para `ec0ea27`, diferente da remota `8e93961`. Não substituir ou fast-forward indiscriminadamente.
- `upstream` é `https://github.com/mrifqidaffaaditya/WA-AKG.git`: referência externa histórica que não deve ser falsificada ou reescrita.
- Inventário inicial de `origin/main`: **157 arquivos com 956 linhas correspondentes** a padrões legados pesquisados, dos quais **121 arquivos** após excluir sessões históricas `.remote-desktop/`. Há **124 caminhos** na árvore contendo o nome pesquisado, muitos históricos. Números são baseline **parcial**, não auditoria exaustiva de formatos e variações.
- `BRANDING-NAMING.md`, `src/lib/branding.ts` e testes confirmam que a identidade visual padrão já é ConectaFlow, com tradução de defaults antigos. O restante da infraestrutura permanece heterogêneo.

## 3. Padrão canônico e normalização

| Contexto | Forma antiga | Forma canônica proposta | Observação |
|---|---|---|---|
| Marca pública / título / produto | WA-AKG, Wa-Akg, WA AKG | ConectaFlow | Não alterar créditos de terceiros |
| Nome de repositório | WA-AKG | ConectaFlow | GitHub já renomeado |
| slug / pasta / imagem / serviço | wa-akg | conectaflow | Nomes DNS e recursos existentes requerem transição |
| snake_case / banco / canal novo | wa_akg | conectaflow | Não renomear chaves persistidas sem migração |
| MAIÚSCULAS / prefixo env | WA_AKG | CONECTAFLOW | Alias por depreciação; nunca duplicar segredo no log |
| camelCase | waAkg | conectaFlow | Revisar semântica antes de mudar |
| PascalCase | WaAkg | ConectaFlow | Revisar nomes públicos/imports/exportações |
| prefixo de tool MCP | wa_akg_* | conectaflow_* | Alias/versionamento para clientes existentes |
| bot implicitamente nomeado | WA-AKG Bot | ConectaFlow Bot | Preservar nomes definidos por usuários |
| pacote da aplicação | wa-akg | conectaflow | Sincronizar lockfile e distribuição |
| pacote MCP gerido pelo projeto | @wa-akg/mcp-server | @conectaflow/mcp-server (se escopo disponível) | Confirmar registro/consumidores antes |
| path público | /wa-akg | /conectaflow (novo), /wa-akg (alias legado temporário) | Só após análise de OAuth, proxy, callbacks e links |

**Padrões de descoberta:** grafias com hífen, underscore, espaços, pontos, caixa mista, acrônimos, JSON keys, URLs escapadas/encoded, nomes de variáveis, nomes de arquivos, schemas, conteúdo de imagens/SVG, HTML/meta, textos traduzidos, logs, arquivos ZIP, scripts e manifests. Examinar também grafias que não casam com regex simplificada. A equivalência semântica e o papel do identificador são mais importantes que a correspondência lexical.

**Não substituir por correspondência** nomes de bibliotecas de terceiros, URLs de projeto upstream, copyright, commits/tags históricos, nomes externos e identificadores persistidos em registros reais.

## 4. Política formal de classificação por ocorrência

Cada ocorrência produz linha em `docs/plans/conectaflow-inventory.csv`: `id;ref;branch;path;line;symbol;kind;owner;old;proposed;class;priority;consumer;dependency;risk;gate;decision;validation;status`. Não exportar valores de segredos.

- **A — AUTO_SAFE:** prose, branding estático, título, comentários de código e documentação sem contrato externo; mudanças direcionadas e revisadas.
- **B — CODE_REFACTOR:** nomes de módulos, funções, classes, arquivos/pastas, imports, testes e scripts. Usar refactor semântico, preservar aliases necessários e tratar colisões de caixa no NTFS.
- **C — VERSIONED_CONTRACT:** nomes de tools MCP, npm package, URLs, headers, API schemas e integrações externas. Requer consumidores inventariados, contrato novo e janela de depreciação.
- **D — PERSISTENT_INFRA:** banco de dados, volumes Docker, nomes de projetos e redes, Redis channels, chaves de criptografia, serviços Windows/PM2/systemd. Exigir backup validado, mapeamento de recursos e rollback.
- **E — IMMUTABLE_HISTORICAL:** migrations já aplicadas, hashes, documentos de evidência, URLs/citações de origem, tags/releases/commit history e backups. **Preservar**; adicionar documentação nova, não editar o passado.
- **F — EXTERNAL_OWNER:** `n8n-nodes-wa-akg`, upstream, monitor externo, clientes de terceiros, registros OAuth de outros provedores, domínios e plugins publicados. **Não renomear** sem titularidade, autorização, compatibilidade e recursos específicos.
- **G — SECURITY_SENSITIVE:** OAuth issuer/resource/audience, grant, API key scope, nomes usados em assinatura/AAD, tenant IDs, sessão e URLs de callback. Qualquer alteração condicionada a testes de isolamento, criptografia e revogação.

## 5. Inventário de artefatos e mudanças propostas

### 5.1 Aplicação, identidade e interface
- `src/lib/branding.ts`, `branding-server.ts`, `src/components/branding-provider.tsx`, `auth/brand-mark.tsx`: manter ponto único de verdade, precedência entre configurações persistidas e defaults e customizações por tenant, traduzir somente defaults legados. Não sobrescrever nome configurado intencionalmente.
- `src/app/layout.tsx`, `icon.tsx`, `page.tsx`, dashboard, login, cadastro, onboarding, SEO, robots, sitemap, termos, privacidade, documentação e mensagens de erro: revisar marca, logo, favicon, alt text, metadata, Open Graph e strings exibidas.
- `src/i18n/messages/{pt-BR,en,id}.json`: concordância, textos de produto, consistência de tradução e fallbacks.
- `src/server/index.ts`: título de log/banner e telemetria; identificação externa de monitor é dependência separada. Não enviar dados a endpoint legado sem auditoria da integração.
- `src/lib/base-path.ts` contém `https://wa-akg.invalid` como origem sintética de validação; substituir por origem sintética neutra e ajustar testes sem enfraquecer validação.
- `src/app/api/system/check-updates/route.ts` e `src/lib/github.ts`: apontar para repo canônico quando apropriado; manter versionamento e compatibilidade de update check.

### 5.2 Identidade de build, dependências, scripts e CLI
- `package.json`: `name: wa-akg` → `conectaflow`; alterar metadados estritamente controlados pelo projeto. Atualizar `package-lock.json` de forma reproduzível; não editar lockfile por substituição cega; não trocar nomes de dependências de terceiros.
- `mcp/wa-akg-mcp/package.json`: avaliar nova identidade de pacote com novo diretório; testar import paths, binários, instalação e lockfile.
- `Start-WA-AKG.ps1` → novo `Start-ConectaFlow.ps1`; se necessário manter wrapper de entrada antigo, exibindo depreciação, até consumidores migrarem. PowerShell 5.1.
- `scripts/codex-wa-akg-env.mjs` → `scripts/codex-conectaflow-env.mjs`: renomeação somente depois de mapear referências e possíveis jobs existentes.
- `scripts/setup.mjs`, `start-production.mjs`, `migrate.js`, `container-start.js`, testes e scripts de documentação/swagger: revisar mensagem, caminhos, nomes de artefatos e resolução de env; manter semântica operacional.
- `ecosystem.config.js`: novo processo PM2 apenas após identificar instâncias e estratégia de coexistência; não parar `wa-akg` por renomeação nominal.

### 5.3 MCP, OAuth e plugins
- `mcp/wa-akg-mcp/` → candidato `mcp/conectaflow-mcp/`; atualizar **todas** as referências dos imports dinâmicos, testes, CLI, workflows locais, empacotamento e documentação na mesma etapa coerente.
- `mcp/wa-akg-mcp/src/server.mjs` registra `name: wa-akg-mcp` e tools com prefixo `wa_akg_`. Propor namespace novo `conectaflow_` com aliases legados administrados, medidos e descontinuados em versão maior ou janela definida. Não duplicar chamadas reais nem ampliar permissões.
- `.plugin-build/wa-akg-chatgpt/{mcp.json,plugin.json,skills/...}`: novo nome, descrição, identidade do desenvolvedor legitimamente responsável, skills e pacote. Revisar URLs de conexão e permissões OAuth; publicação é gate externo.
- Preservar `mcp:read`, `mcp:write`, `api:read`, `api:write`, `sessions:read` e checagens de ownership/tenant. Nome novo NÃO autoriza aumento de scopes ou de superfície.
- OAuth/OIDC: revisar `issuer`, `resource`, `audience`, discovery `.well-known`, redirect URIs, PKCE, state, consentimento, tokens, DCR, revogação e grants. Mudança de issuer/resource é **mudança de identidade de segurança**, requer migração/novo consentimento, não `string replace`.
- OpenAPI/Swagger: título/versionamento e URLs canônicas; endpoints e operationIds só mudam com contrato versionado e testes de clientes.

### 5.4 Configuração e segredos
- Variáveis atuais observadas: `WA_AKG_MCP_ENABLED`, `WA_AKG_MCP_HTTP_PATH`, `WA_AKG_API_BASE_URL`, `WA_AKG_API_KEY`, `WA_AKG_MCP_CREDENTIAL_CAPABILITIES`, `WA_AKG_MCP_ALLOW_REMOTE_API`, `WA_AKG_TIMEOUT_MS`, `WA_AKG_MAX_RESPONSE_BYTES`, `WA_AKG_AUTH_STATE_KEY`, `WA_AKG_TRUSTED_PROXY_HEADERS`, `WA_AKG_IMAGE` e outras encontradas no inventário.
- Introduzir `CONECTAFLOW_*` somente via resolvedor central SERVER-SIDE: novo nome tem prioridade; antigo é fallback temporário; conflito entre ambos retorna erro/alerta protegido, sem revelar valores. Mapear nomes de `.env.example`, Docker, código e documentação com testes de paridade.
- Chaves de autenticação e criptografia não mudam de conteúdo por mudar rótulo: desenhar leitura dupla de nome sem dupla geração do segredo; testar descriptografia dos dados anteriores.
- Nunca introduzir `NEXT_PUBLIC_` para segredos. Valores de `.env` devem continuar não exibidos e não commitados.
- Retirar aliases somente em release maior com inventário de consumidores, telemetria segura e prazo publicado.

### 5.5 Docker, MySQL, Redis e processos
- `docker-compose.yml`, `docker-compose-local.yml`, `docker-compose.validation.yml`, `docker-compose.replicas.yml` e `Dockerfile`: nome de projeto, serviços, containers, imagens e tags novos em instalações **novas**, sem apagar/ocultar volumes existentes.
- Atualmente foram observados `name: wa-akg`, `container_name: wa-akg-db`, `wa-akg-network`, volumes `wa-akg-mysql-data` / `wa-akg-app-data` / `wa-akg-uploads-data` e defaults `MYSQL_DATABASE=wa_akg` / `MYSQL_APP_USER=wa_akg_app`. Alterar nomes de volumes/projetos muda isolamento e identidade de armazenamento e pode parecer perda de dados. Migrar por backup/restore testado e volumes explicitamente mapeados.
- `SOCKET_IO_REDIS_KEY` usa prefixo legado; nunca mudar enquanto réplicas antigas participarem dos mesmos eventos, para evitar quebra de broadcasts. Transição coordenada ou namespace versionado.
- Bancos existentes não precisam ser renomeados fisicamente para que o produto passe a ser ConectaFlow. Opcional: novo schema/usuário após provas de permissões, conexões, integrações e restauração.
- Serviços Windows, Caddy, PM2, Docker, ngrok, firewalls, supervisores e agendadores: levantar nomes existentes e dependências, criar novos descritores somente em ambiente de ensaio. Não encerrar serviço em uso para renomeá-lo.

### 5.6 Proxy, URLs, assets e transporte
- `docs/REVERSE_PROXY.md`, `docs/CADDY-WA-AKG.md`, `Caddyfile.validation`, `src/lib/base-path.ts` e `src/lib/oauth/discovery.mjs`: preservar acesso raiz `http://localhost:43000/` sem contexto e acesso proxied com prefixo derivado da requisição confiável, não de um `basePath` de build.
- Novo prefixo externo candidato `/conectaflow`, mantendo `/wa-akg` como alias legado enquanto consumidores dependem dele. Não fazer redirect cego para endpoints OAuth/MCP POST ou WebSocket; preservar método, body, upgrade, sessão e origens verificadas.
- Testar links relativos, `/_next`, CSS/JS, favicon, uploads, mídia, SSE, Socket.IO, MCP e `.well-known` via localhost, Caddy, ngrok/CDN e qualquer host publicado autorizado.
- O novo OAuth issuer e resource precisam ser validados no domínio e prefixo canônicos com clientes; não assumir que redirecionamentos HTTP bastam. Substituir valores antigos somente após análise dos registros persistidos e clientes externos.
- Os domínios `wa.evomenu.com.br` e `api-wa-akg.aikeigroup.net` são recursos externos/legados: não inventar novo domínio nem alterar DNS sem verificação de titularidade, certificados e autorização.

### 5.7 Prisma, dados e contratos históricos
- `prisma/schema.prisma`: revisar apenas atributos e defaults de nomenclatura sob controle do projeto. Não alterar identificadores persistidos sem migrações aditivas e teste de compatibilidade.
- `prisma/migrations/*`: **NÃO reescrever migrações aplicadas**, seus nomes ou SQL histórico. A reconciliação Prisma V1 e o erro histórico P3018 permanecem gates independentes e prévios ao upgrade de bancos reais.
- `docs/contracts/wa-akg/v1/*`: versão V1 é contrato histórico, não reescrever silently. Criar contrato canônico V2 sob caminho `docs/contracts/conectaflow/v2/` somente quando payloads, event types, consumers, gateways e adapters estiverem especificados e validados.
- `.remote-desktop/sessions/*`, snapshots, arquivos ZIP históricos, backups, checkpoints, provas e referências para releases passadas: preservar intactos. Se documentação ativa aponta para arquivo antigo, criar ponte de leitura ou nota de histórico em vez de apagar.
- Todos os fluxos OAuth, API token, WhatsApp session lease, tenant ID, webhook idempotency, criptografia, logs e audit trail devem continuar semanticamente estáveis.

### 5.8 Documentação e integradores
- Atualizar `README.md`, `AGENTS.md`, `CLAUDE.md`, `BRANDING-NAMING.md`, `CHANGELOG.md`, `docs/*`, templates `.github/*`, prompts/codex, exemplos, instruções e referências de instalação.
- Preservar créditos/licenças upstream e dependências de terceiros. `n8n-nodes-wa-akg` é pacote externo: documentar compatibilidade, não renomear o pacote de terceiros; avaliar publicação independente de integração ConectaFlow somente com direitos e contrato verificados.
- Scripts de análise e arquivos de erro históricos não são fonte de verdade; não falsificar registros retroativamente.
- Sem GitHub Actions/workflows novos; criar comandos de verificação executáveis localmente conforme convenção do projeto.

## 6. DAG de execução, fases e gates

Cada fase gera: (1) diff/catálogo dos alvos, (2) decisão por ocorrência, (3) verificador binário com evidência, (4) risco e rollback, (5) status PROPOSED/IMPLEMENTED/TESTED/VERIFIED/BLOCKED/DEFERRED/FAILED.

| Gate | Fase/ação mínima | Dependência | Evidência e saída para avançar |
|---|---|---|---|
| G00 | Preservar baseline, estado Git completo, remotes, commits locais e 110 exclusões | nenhuma | Snapshot dos metadados e mudanças, sem descarte |
| G01 | Reconciliar branch-alvo e releases B2/V1 sem integrar automaticamente | G00 | SHA canônico, proveniência e árvore de trabalho isolada |
| G02 | Inventariar conteúdo, caminhos e binários de todas branches relevantes | G01 | `conectaflow-inventory.csv`, contagens por branch/classe |
| G03 | Criar matriz de decisão/allowlist de legado e contratos consumidos | G02 | 100% dos alvos classificados por risco |
| G04 | Contratos de compatibilidade para env, URL, MCP, dados e services | G03 | ADR/contratos e testes planejados |
| G05 | Branding visual, i18n, metadados, textos e SEO | G04 | testes unitários + inspeção visual nas rotas-chave |
| G06 | Renomear módulos, caminhos, scripts e imports internos | G04 | TypeScript, lint, testes, build sem paths quebrados |
| G07 | Atualizar npm packages, lockfiles, plugin e MCP com aliases | G04, G06 | test MCP, tool discovery, segurança e lockfile coerente |
| G08 | Implementar adapter de variáveis de ambiente server-side | G04 | testes novo/legado/conflito/segredos |
| G09 | Projetar topologia nova Docker/PM2/serviços, sem tocar dados antigos | G08 | Compose config validado, inventário de volumes |
| G10 | Proxy/root/prefix/asset/OAuth discovery e compatibilidade | G07, G08 | HTTP/OAuth/MCP/Socket.IO nos acessos previstos |
| G11 | Provar migrações e restauração em cópia representativa V1 | G09, G10 | hash de backup, restore e validação P3018 resolvida |
| G12 | Testar funcionalidades, tenant isolation, segurança, MFA e APIs | G05–G11 | suíte global e testes de regressão completos |
| G13 | Auditar inventário residual e documentação | G12 | zero legado ativo injustificado; allowlist aprovada |
| G14 | Planejar implantação/canário/rollback, pedir autorização separada | G13 | critérios objetivos GO/NO-GO e reversão ensaiada |
| G15 | Publicação, alteração DNS, push, merge e produção | aprovação explícita | **DEFERRED** até autorização e gates aprovados |

**Paralelismo seguro:** após G04, G05 (UI), parte documental de G06, revisão de G08 e inventário de G09 podem ocorrer em worktrees/branches isoladas. Somente um integrador altera o índice/branch final; testes integrados rodam após join. Workers independentes nunca executam migração no mesmo banco, instalação concorrente ou alterações em arquivos compartilhados.

## 7. Pacotes de trabalho atômicos

- **WP-01 | Inventory:** encontrar variante → resolver referência/caminho → registrar sem segredos → classificar. Aceite: cada ocorrência tem destino ou exceção.
- **WP-02 | UX Copy:** localizar texto visível → substituir fallback → atualizar tradução → testar snapshot/comportamento. Aceite: UI não exibe marca antiga por padrão.
- **WP-03 | Code Symbol:** identificar símbolo/exports/consumidores → renomear com imports → alias quando exigido → typecheck. Aceite: zero referência quebrada.
- **WP-04 | Build Identity:** mudar package name → regenerar lockfile com scripts do projeto → validar instalação isolada → testar build. Aceite: metadados consistentes.
- **WP-05 | MCP Tools:** listar names atuais → registrar names novos e compatibilidade → comparar schemas/autorização → testar ambos sem efeito real. Aceite: mesmo escopo/ownership.
- **WP-06 | Plugin:** criar manifesto/skill/pasta de novo produto → validar JSON e configuração → testar OAuth via sandbox → publicação apenas autorizada. Aceite: sem links ou credenciais errados.
- **WP-07 | Config:** mapear nome antigo → adicionar resolvedor único → teste de precedência/conflito → atualizar Compose e exemplos. Aceite: instalações antigas continuam funcionando durante transição.
- **WP-08 | Deploy:** inventariar serviços/rede/volumes/DB → provisionar sandbox novo → testar data restore/rollback → planejar migração real. Aceite: sem alteração em dados originais.
- **WP-09 | Proxy/OAuth:** mapear issuer/resource/callbacks → implementar rota nova e alias → testar root/prefix/websocket/MCP → medir compatibilidade. Aceite: identidade e acessos válidos.
- **WP-10 | Data:** proteger histórico Prisma → introduzir somente migração aditiva necessária → testar banco virgem e restaurado → hash e rollback. Aceite: integridade referencial e dados.
- **WP-11 | Docs:** atualizar guias atuais → conservar arquivos históricos → escrever matriz de compatibilidade → revisão cruzada com comportamento real. Aceite: exemplos executáveis.
- **WP-12 | Final Audit:** rodar scanner de referências → conferir todas exceções → testar regressão completa → assinar GO/NO-GO. Aceite: todas ocorrências classificadas e gates evidenciados.

## 8. Matriz de validação obrigatória

| Camada | Cenários mínimos | Sinal de aprovação |
|---|---|---|
| Git | staged, unstaged, untracked, commits, divergência e diff | alterações anteriores preservadas; diff restrito |
| TypeScript/ESLint | `tsc --noEmit`, lint focado e global conforme scripts | exit 0 sem erros introduzidos |
| Testes unitários | branding, aliases de env, OAuth, MCP, base path, redirects, API auth | matriz novo+legado+inválido passa |
| Build | Next.js, npm package e lockfile, MCP check | build passa sem import quebrado |
| HTTP/REST | login/logout, API key, webhooks, sessões, Swagger, headers | status, schema e autenticação corretos |
| OAuth/MCP | discovery, DCR, PKCE, issuer, resource, consent, token, grants, tool names | clientes atuais e novos conforme contrato; fail closed |
| Autorização | usuário comum/admin/superadmin, 2 tenants, chaves API e perfis | isolamento horizontal e limites preservados |
| WhatsApp | QR, reconnect, leases, webhooks, mensagens e mídia (sem envios reais não autorizados) | nenhuma duplicação/perda de sessão |
| UI/Assets | localhost sem prefixo e Caddy/ngrok/CDN com prefixo, CSS/JS, ícones, imagens, links | nenhum 404/redirect indevido |
| Docker/PM2 | Compose config, nomes e volumes mapeados, logs e recursos | não cria banco/volume vazio no lugar dos dados |
| MySQL/Prisma | banco virgem, backup V1 restaurável, migrate deploy, idempotência | P3018 ausente; dados preservados |
| Resiliência | rollback de alias/env/prefixo, restart e compatibilidade de clientes | restaurabilidade verificada |

**Proibido** usar Playwright; para teste visual utilizar CDP do navegador existente ou método autorizado. Testes externos com envio de WhatsApp, mudança de conta, revogação de token ou atualização de DNS exigem autorização específica e alvos de teste.

## 9. Estratégia de transição/compatibilidade

- **Etapa 1 — Coexistência:** identidade pública ConectaFlow, aliases antigos operacionais, config aceita ambos com precedência determinística, paths legados documentados, nenhum dado movido; logs de depreciação **sem** tokens/PII.
- **Etapa 2 — Migração assistida:** adaptar consumidores MCP/API, links, OAuth client registrations, operadores e configuração. Usar nova identidade somente após prova de integração. Monitorar erros e taxa de uso de aliases.
- **Etapa 3 — Corte controlado:** ambiente staging com dados restaurados; troca de nomes de serviços/volumes/DB **somente se necessária e autorizada**. Fazer backup imediato e plano de reversão.
- **Etapa 4 — Remoção do legado ativo:** desativar aliases apenas após anúncio, compatibilidade comprovada e versionamento maior quando houver quebra contratual. Manter registros históricos intactos.

**Rollback:** registrar estado e SHA anterior, guardar cópia verificável de arquivos/dados/manifestos/serviços, restaurar os recursos antigos sem apagar volumes novos, repor aliases e endpoint prefix/issuer anteriores conforme evidências. Não executar `git reset --hard`, `git clean`, `prisma migrate reset`, `docker compose down -v`, troca in-place destrutiva de tabelas ou reescrita de migrations.

## 10. Sequência recomendada para a próxima execução

1. Tratar **G00–G01** primeiro: reconciliar 110 exclusões e branches/commits locais, escolher baseline sem modificar trabalho existente. Preferir worktree separado derivado de commit explicitamente escolhido.
2. Completar **G02–G04**: scanner automatizado de texto + paths + binários e ADR de compatibilidade. Considerar 956 linhas/157 arquivos uma linha de base, não o inventário completo.
3. Implementar **G05–G08** por pacotes pequenos, em branches isoladas, sem deploy/push/merge, começando por branding/documentação e testes para variáveis e APIs.
4. Preparar **G09–G11** em sandbox restaurável, condicionado à reconciliação histórica Prisma V1 e ao gate P3018.
5. Executar **G12–G13** integralmente uma vez após integração local, incluindo testes HTTP reais, segurança multitenant, OAuth e MCP.
6. Apresentar **G14** como GO/NO-GO e solicitar autorização separada para qualquer ação **G15**.

## 11. Evidências e artefatos previstos

`docs/plans/conectaflow-inventory.csv` — cada ocorrência e decisão.  
`docs/architecture/ADR-CONNECTAFLOW-IDENTITY.md` — nomenclatura, compatibilidade e exceções.  
`docs/contracts/conectaflow/v2/` — contratos novos versionados, se necessários.  
`docs/plans/CONECTAFLOW-COMPATIBILITY-MATRIX.md` — old→new para SDK, MCP, env, URL, OAuth e integrações.  
`docs/plans/CONECTAFLOW-ROLLOUT-ROLLBACK.md` — roteiro e restauração comprovada.  
`scripts/validation/check-conectaflow-branding.ps1` — inspeção automatizada compatível com PowerShell 5.1; sem varredura de segredos em log.  
`docs/validation/CONECTAFLOW-REBRAND-REPORT.md` — comandos, resultados, falhas, gates, evidências e exceções.

**Métricas:** total de ocorrências antes/depois por classe/branch; caminhos renomeados; contratos testados; aliases restantes e datas-alvo; testes executados/aprovados; regressões; compatibilidade clientes V1/V2; gates bloqueados. Não prometer 100% textual quando restarem elementos históricos legitimamente imutáveis.

## 12. Registros de risco, bloqueio e decisão

- **R01 HIGH:** 110 exclusões locais preexistentes; preservadas e não reconciliadas neste planejamento.
- **R02 HIGH:** branch local B2 com commits exclusivos; nunca sobrescrever ou sincronizar forçadamente.
- **R03 HIGH:** Prisma histórico V1 / P3018 sem verificação neste ciclo; bloqueia upgrade de dados reais.
- **R04 HIGH:** mudar issuer/resource de OAuth pode invalidar consentimentos e tokens existentes.
- **R05 HIGH:** mudar Docker project/volumes/DB/Redis pode aparentar perda de dados e romper réplicas.
- **R06 HIGH:** alterar nomes de tools MCP e plugin publicado pode quebrar clientes.
- **R07 MEDIUM:** mudanças de prefixo e asset path podem causar 404, loops e redirecionamentos inseguros.
- **R08 MEDIUM:** nomes externos (upstream, npm n8n, domínios/monitoramento) não pertencem automaticamente ao projeto.
- **R09 MEDIUM:** renomeações de caminho só por mudança de case em Windows/NTFS exigem operação intermediária segura.
- **R10 MEDIUM:** documentação está parcialmente divergente do branding atual; validar contra código e execução.

## 13. Estado deste ciclo

- **VERIFIED:** repositório canônico ConectaFlow, leitura de estrutura remota, `fetch` completo, `pull` fast-forward-only na branch ativa sem alteração de HEAD, inventário inicial de texto e paths, estado Git local e divergência de branches.
- **IMPLEMENTED:** somente este documento de planejamento local (sem mudança de código, serviço ou dado).
- **PROPOSED:** renomeação abrangente e compatibilidade controlada por gates.
- **BLOCKED:** execução irrestrita da renomeação, upgrade real e integração sem resolver baseline, divergências, validação de contratos e pré-condições.
- **DEFERRED:** commits, push, merge, deploy, DNS, registro de novo plugin e mudanças em produção, que exigem autorização explícita.
