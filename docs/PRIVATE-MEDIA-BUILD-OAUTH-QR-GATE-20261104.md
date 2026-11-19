# Gate local — mídia privada, isolamento MCP e reconciliação OAuth/QR
Data: 2026-11-04 (horário local). Repositório: C:\repos\WA-AKG.
Branch: feature/multi-tenant-isolation-20261103; baseline observado: 86b3b0a4c21955e41e311ed9c081665781f79f2b.
Estado: VERIFIED para artefatos de build examinados e verificações sintéticas; PARTIAL para integração completa; NO-GO para merge, push, release e produção.

## 1. Hipótese, diagnóstico e correção do build
O Next 16.1.1/Turbopack associava o caminho dinâmico `path.resolve(mediaDir, filename)` em `src/lib/webhook.ts` a arquivos de `data/media`, gerando aviso de 10.510 candidatos. A primeira tentativa de suprimir o rastreamento com a anotação `turbopackIgnore` eliminou o aviso, mas a auditoria independente constatou 278.568 referências (ocorrências repetidas em manifests) a mídia privada. Portanto, silêncio do compilador não equivale a segurança do artefato.

O arquivo `next.config.ts` passou a usar `outputFileTracingExcludes: { "/*": ["./data/media/**/*"] }`, sem mover, ler ou excluir mídias existentes. Foi mantida a validação de caminho/entrada do fluxo de gravação. A configuração impede incluir o diretório de mídia como dependência do pacote Next, enquanto o processo continua acessando o armazenamento em runtime pelo caminho existente. Implantação futura deve prover armazenamento privado persistente, segregado do pacote gerado, e não colocar mídia sob `public/`.

## 2. Verificação reproduzível do pacote
O script `scripts/verify-private-media-build.mjs` usa somente dependências já instaladas, cria um arquivo-canário sintético em `data/media`, compila com Next.js local, inspeciona a árvore `.next` (exceto caches de build e desenvolvimento), examina manifests `*.nft.json` e procura o conteúdo do canário nos arquivos emitidos. Não lê o conteúdo das mídias existentes, não executa comandos de rede nem altera o banco. Apaga apenas seu próprio canário após verificar o conteúdo original, inclusive em caso de falha. Registra stdout/stderr e resumo local em `.remote-desktop/sessions/private-build-*/`.

Execução: `node scripts/verify-private-media-build.mjs`.
Evidência final com a rota de compatibilidade OAuth incluída no build: `.remote-desktop/sessions/private-build-2026-11-05T02-05-20-062Z/`. Depois das correções, TypeScript (`tsc --noEmit --incremental false`) passou, o lint registrou 0 erros e 13 avisos, e a verificação `git diff --check` terminou com exit 0 (avisos LF/CRLF).

Resultado final: build exit 0; avisos excessivos 0; referências `data/media` 0; arquivos privados copiados/ligados 0; referências a outros caminhos privados de runtime 0; conteúdo-canário no pacote 0; 157 manifests inspecionados; 2.300 arquivos examinados. Uma rodada intermediária acusou cinco symlinks genéricos como possíveis cópias; o auditor foi refinado para verificar se os destinos realmente apontavam para dados privados, e a contagem final caiu a zero.

Limites: não é auditoria de conteúdo de todos os arquivos pessoais; o canário prova o caso sintético e os manifests sustentam a ausência de dependências privadas no build inspecionado. A verificação não inclui `.next/cache`, `.next/dev`, imagem Docker, backups, runtime de produção ou artefatos empacotados por terceiros. O build pode exigir fontes de mídia montadas em runtime para servir anexos existentes.

## 3. Reconciliar OAuth e QR
O proxy agora redireciona `/authorize` para `/api/oauth/authorize` (HTTP 307, no-store), mantendo parâmetros PKCE e prefixo de proxy. O handler canônico continua validando cliente e autorização; teste direcionado PASS.
Os metadados em `/.well-known/oauth-authorization-server` anunciam `/api/oauth/authorize`, não o legado `/authorize`. Atrás do prefixo `/wa-akg`, os testes verificam o endpoint público `https://<host>/wa-akg/api/oauth/authorize` e o recurso MCP `https://<host>/wa-akg/mcp`. Não foram alteradas URLs de clientes externos nem credenciais reais.

A rota `src/app/api/sessions/[sessionId]/qr/route.ts` passou a negar explicitamente `Authorization` e `x-api-key`, exigir `authMethod=session` e proprietário autorizado e aplicar `Cache-Control: no-store` a sucesso e erros. A entrada de autenticação OAuth/API continua sendo negada por `requiredOAuthScopes` para QR (defesa em profundidade). O teste novo `src/lib/__tests__/oauth-qr-route.test.ts` verifica bloqueio de bearer/API key, inclusive com cookie simultâneo; 2/2 PASS em execução direcionada.

## 4. Ensaios e evidências
- `npm test`: 232 testes, 10 suítes, 232 PASS, 0 falhas, inclusive OAuth, compatibilidade de `/authorize`, controle de tenant e Socket.IO.
- `npm run mcp:test`: 8 PASS, 0 falhas.
- `node scripts/replica-harness/run.mjs --target C:\repos\WA-AKG`: TESTED com duas réplicas MCP locais, tokens sintéticos para três usuários em dois tenants, isolamento de token, audiência, usuário e réplica, sem criação de sessão.
- `node scripts/replica-harness/real-preflight.mjs --target C:\repos\WA-AKG`: NOT_VERIFIED para duas réplicas completas. Docker, imagens MySQL/Redis e overlay de réplica estavam presentes; faltavam imagem WA-AKG pré-compilada, chave de estado de autenticação disponibilizada ao harness e banco isolado provisionado. Nenhuma migração nem conexão WhatsApp real foi iniciada.
- Auditoria de build: VERIFIED conforme seção 2, incluindo reexecução completa após configuração de tracing.

## 5. Bloqueios, riscos e próximos gates
- **PROPOSED / NOT_VERIFIED:** a fixture `scripts/integration/tenant-isolation.fixture.ts` foi escrita e passou na checagem TypeScript. O executor isolado de MySQL foi bloqueado pela ferramenta antes de ser criado; não houve execução dessa fixture, criação de contêiner para esse teste nem acesso ao banco existente.
- **BLOCKED / NOT_VERIFIED**: autenticação interativa de dois usuários em tenants distintos via REST, com MySQL de teste isolado, dados sintéticos e negação de IDOR em sessão, mensagens, mídia, jobs e compartilhamentos.
- **BLOCKED / NOT_VERIFIED**: teste real de pareamento QR e consentimento OAuth, exigindo ambiente, sessão e conta de teste autorizados; não utilizar sessões WhatsApp existentes para testes com efeitos externos.
- **DEFERRED**: inspeção da imagem Docker/standalone final e dos mounts operacionais para demonstrar que não inclui dados, segredos ou backups privados.
- **DEFERRED**: revisão independente do contrato W1 OAuth/MCP e das falhas críticas de rotação de chave e verificação de e-mail reportadas em `docs/OAUTH-MCP-UNIVERSAL-W1-GATE-REVIEW.md`.
- **NO-GO**: push, merge, deploy, publicação e mudanças em banco real, até fechamento dos testes completos de isolamento, autenticação e recuperação.

Preservação: alterações locais anteriores e não rastreadas permaneceram intactas; nenhuma operação Git destrutiva, envio de mensagem, migração no banco existente ou efeito externo de produção foi executado.
