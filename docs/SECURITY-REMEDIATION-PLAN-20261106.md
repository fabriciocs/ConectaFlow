# Plano de correção de segurança — WA-AKG

Data: 06/11/2026. Estado: **PROPOSED**. Gate de segurança inicial: **FAIL**.

## 1. Objetivo, evidências e limites

Eliminar os achados impeditivos da auditoria, preservar compatibilidade com Claude/ChatGPT, manter isolamento de tenant e entregar uma versão verificável antes de qualquer liberação. Este documento é um plano; não autoriza nem comprova implementação, atualização, desligamento de túnel, migração, rotação de credenciais ou publicação.

Baseline confirmado ao escrever: branch `feature/multi-tenant-isolation-20261103`, HEAD `11095b9dc08110918b49ae404fdf16ea73f3187e`. Há alterações preexistentes em `src/lib/oauth/cimd.ts` e `src/lib/__tests__/oauth-cimd.test.ts`; devem ser preservadas e avaliadas como parte da compatibilidade atual. Reconfirmar estado antes de executar.

Entradas rastreáveis:

- Auditoria: `C:/Users/fabri/.codex/visualizations/2026/11/06/01a1b2df-04b3-7510-96d7-02c65fadb35f/auditoria-seguranca-wa-akg.md`.
- Evidências: `.remote-desktop/security-audit-20261106/`: findings, inventário de 110 arquivos de rotas, dependências, versões instaladas, probes HTTP e hashes.
- Gates: `.remote-desktop/sessions/local-nodocker-gates-20261106-212805/`: TypeScript/lint PASS; 235 testes aplicação, 7 bootstrap, 8 MCP aprovados. Esses testes não cobrem as falhas demonstradas pelos casos sintéticos.
- Reprodução de tenant e de limite OAuth e relatório da superfície: mesmo diretório de visualização da auditoria.
- Build com auditoria de mídia aprovado anteriormente nesta conversa, mas sem prova de correspondência com o processo ativo observado posteriormente. Um build novo isolado é obrigatório antes da liberação.

O scanner retornou 76 pacotes afetados, incluindo transitivos: 3 críticos, 52 altos, 17 moderados e 4 baixos. Não são 76 explorações comprovadas. Next.js instalado 16.1.1 corresponde à faixa afetada por RCE em Windows; o aviso específico foi corrigido em 16.3.3, mas essa versão não deve ser escolhida automaticamente porque há outros avisos posteriores. Referência: https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36.

Não há evidência de comprometimento neste trabalho. As duas falhas de webhook foram reproduzidas com handlers reais e dependências simuladas, sem banco ou dados de terceiros. `allowLocal` é uma função deliberada, cujo risco depende de tenants não confiáveis; não foi demonstrado acesso a metadata cloud. Bind `::` não prova alcance por LAN sem verificar firewall e topologia.

## 2. Permissões e condições de execução

- Este pedido autoriza escrever o plano. Implementação e validação futura devem seguir o escopo então autorizado.
- Leitura local, testes sintéticos, geração de artefatos e mudanças locais reversíveis podem integrar uma execução autorizada. Não inferir autorização para efeitos externos a partir deste plano.
- Contenção do endpoint público, mudanças no Caddy/ngrok/firewall, reinício com efeitos operacionais, rotação de credenciais, banco existente, push, merge, deploy e release precisam de autorização específica aplicável à ação. Nenhum desses efeitos é executado aqui.
- Não ler/imprimir valores de `.env`; inventariar apenas nomes. Não copiar segredos para fixtures, logs, relatórios ou snapshots de configuração. Backups sensíveis exigem armazenamento restrito, criptografia e política de retenção.
- Windows nativo, ferramentas instaladas; scripts auditados compatíveis com PowerShell 5.1. Sem Playwright, sem elevar permissões ou desabilitar proteções para concluir um gate.
- Não realizar envios, testes de webhook contra serviços privados reais, ações de sessão WhatsApp ou restauração automática de sessões durante testes.

## 3. Sequência, dependências e responsáveis

Responsáveis abaixo são papéis propostos, não pessoas designadas: **ENG** implementador; **SEC** revisor independente; **OPS** operador do ambiente; **QA** validação. Usuário/operador autorizado decide efeitos restritos e aceita riscos residuais de acordo com a política.

```text
R00 baseline → R01 contenção/triagem operacional
R00 → R02 fixtures/regressões → R04 isolamento → R05 segredo
R00 → R03 dependências ───────────────────────────┐
R02 → R06 política rede → R07 transporte DNS       │
R02 → R08 formulário OAuth → R09 login             ├→ R13 integração
R02 → R10 uploads                                 │   → R14 operação/restore
R00 → R11 headers e R12 proveniência runtime ──────┘   → R15 revisão/liberação
```

R03 e R04/R05 podem ser desenvolvidos em checkouts separados a partir do baseline, com proprietários de arquivos definidos. Não instalar dependências ou alterar lock em checkout compartilhado com testes ativos. Integrar sequencialmente e repetir os testes afetados. R01 não deve esperar todas as correções quando a exposição crítica estiver confirmada e houver autorização para contê-la.

Estimativa inicial: 6–12 dias úteis de engenharia/QA, mais espera por decisões e janela operacional. Incerteza alta em dependências, migrações eventualmente necessárias e integração real OAuth. Os intervalos por tarefa não incluem espera nem retrabalho de regressões. Não há prazo garantido sem concluir G0/G2.

## 4. Backlog executável

Cada tarefa abaixo tem estado inicial PROPOSED. Evidências por execução em diretório exclusivo `security-remediation-<data>-<id>/`, fora de build/runtime descartável. Registrar entrada, versão, diff/hash, testes, falhas anteriores e resultado final. Nenhum critério é satisfeito apenas por exit code.

### R00 — Baseline e isolamento de trabalho — P0, G0

**Responsável:** ENG/OPS. **Estimativa:** 1–3 h. **Dependências:** nenhuma. **Permissão:** leitura local; cópias de dados sensíveis somente conforme autorização.

1. Registrar branch, HEAD, status staged/unstaged/untracked, versões Node/npm, versões efetivamente instaladas e hashes dos arquivos a alterar.
2. Inventariar PIDs/PPIDs, bind, comando de inicialização com argumentos sensíveis redigidos, serviço/tarefa que inicia o processo, versão de build e proxy de entrada. Não encerrar PID apenas porque ocupa a porta.
3. Criar checkout/diretório de execução isolado preservando as duas alterações CIMD. Não usar reset/clean. Definir um único escritor por pacote de trabalho.
4. Criar manifesto de evidências e confirmar que scanner/fixtures não registram valores secretos. Separar esquema sintético e portas de teste das reais.

**Saída/aceite:** baseline reproduzível, runtime identificado ou marcado NOT_VERIFIED, alterações anteriores preservadas, ambiente de teste sem transporte real WhatsApp. **Teste:** comparar hashes e status antes/depois; fixture de inicialização deve negar restauração automática e workers externos. **Rollback:** remover apenas artefatos próprios identificados; nunca descartar arquivos existentes. **Risco:** perda de trabalho ou executar testes no ambiente errado.

### R01 — Contenção e avaliação de exposição — P0, G0/G5

**Responsável:** OPS/SEC. **Estimativa:** 1–4 h. **Dependências:** R00. **Permissão:** alterações de exposição e credenciais exigem autorização específica.

1. Confirmar acessibilidade pública, Windows/versão efetiva, recursos Next usados e ausência/presença de mitigação aplicável. Não explorar RCE para provar risco já sustentado por versão/plataforma.
2. Preparar mudança restrita a WA-AKG: manutenção, allowlist ou suspensão de sua rota pública conforme topologia. Não interromper outros sistemas do Caddy/ngrok compartilhado. Registrar impacto OAuth e rollback da rota exata.
3. Após autorização, aplicar contenção e verificar do lado externo que somente o acesso pretendido foi restringido. Preservar administração segura e evidência anterior.
4. Revisar logs já existentes por sinais de uso indevido, com redaction. Caso haja indicadores, abrir fluxo de incidente: preservar evidência, delimitar intervalo/identidades afetadas e planejar rotação/revogação autorizada. Não concluir comprometimento apenas pelo advisory.

**Saída/aceite:** decisão de exposição registrada; se contenção aprovada, prova externa da restrição sem afetar outros serviços. **Teste:** probes de WA-AKG e de rotas sentinela dos demais sistemas, sem ações de escrita. **Rollback:** restaurar somente configuração validada, sem reabrir uma versão vulnerável ao público; manter manutenção se necessário. **Risco:** indisponibilidade e perda de conectividade OAuth.

### R02 — Casos de regressão e fixtures — P1, G1/G2/G4

**Responsável:** QA/SEC. **Estimativa:** 3–6 h. **Dependências:** R00. **Permissão:** testes sintéticos locais; criação de schema/identidades persistentes separada e explicitamente autorizada.

1. Converter as reproduções da auditoria em testes versionados com contratos observáveis, inicialmente demonstrando as falhas.
2. Modelar tenants A/B, mesmo usuário em ambos, usuário diferente, membro removido, duas sessões, webhooks globais legados e vinculados. Credenciais: sessão browser, API key e OAuth com escopos/capacidades distintos.
3. Injetar banco/transporte/relógio/DNS. Tests devem falhar se a rota fizer mutação ou chamada de rede quando acesso é negado.
4. Adicionar matriz requisito → tarefa → teste → gate → evidência, incluindo cenários positivos legítimos. Evitar testes que apenas repetem expressões da implementação.

**Saída/aceite:** casos negativos demonstram o risco; positivos preservam o fluxo legítimo. **Teste:** execução determinística sem dados ou rede reais; teste de teardown das próprias fixtures. **Rollback:** reverter apenas novos testes isolados se sua infraestrutura for incorreta, mantendo evidência da falha. **Arquivos:** `src/lib/__tests__/`, testes MCP e harness de integração. **Risco:** mocks esconderem consultas incorretas; complementar em R13.

### R03 — Atualizar dependências por grupos compatíveis — P0, G2/G3/G4

**Responsável:** ENG/SEC. **Estimativa:** 1–3 dias. **Dependências:** R00; R02 antes da integração. **Permissão:** mudanças/instalação local necessárias em execução autorizada; sem auto-upgrade do serviço ativo.

1. Renovar os avisos no momento da execução. Classificar dependência direta/transitiva, produção/desenvolvimento, função exposta, plataforma e pré-condições. Manter cada aviso com evidência; avisos não analisados permanecem bloqueadores de triagem.
2. Selecionar conjunto suportado de Next.js/React/React DOM/eslint-config-next, revisando release notes e compatibilidade de App Router, custom server, Turbopack/build, tracing e Windows. Não usar 16.3.3 como alvo final sem cobrir avisos posteriores.
3. Atualizar Auth.js/next-auth e transitivos coerentemente. Retestar Credentials, cookies, `auth()`, checks por usuário e configuração inválida. Manter validação explícita de identidade em cada rota, não apenas objeto auth truthy.
4. Tratar grupos independentes: transporte Socket.IO/ws/SDK MCP; mídia sharp/libvips/Jimp; Baileys/sticker formatter; mail/validação/Swagger/tooling. Não aceitar downgrades sugeridos pelo scanner sem análise funcional e de suporte.
5. Atualizar lock de forma controlada; revisar lifecycle scripts e dependências novas antes de permiti-los. Registrar diffs e repetir resolução limpa no ambiente isolado.

**Saída/aceite:** sem advisory crítico aplicável aberto e sem alto alcançável sem correção; toda exceção tem prova de não alcance, prazo, responsável e aceite formal. Ausência de aviso no scanner não prova segurança. **Teste:** install reproduzível com lock, tipos/lint/suítes, build privado, OAuth/MCP e smoke sem efeitos externos. **Rollback:** conjunto anterior de manifests/lock/artefatos em ambiente contido; não reexpor pacote vulnerável. **Arquivos:** `package.json`, lock principal e lock MCP quando aplicável. **Risco:** breaking changes, scripts de instalação, alteração de protocolos/serialização. Mudança de schema decorrente da atualização bloqueia integração até plano específico aprovado.

### R04 — Confinar todas as rotas individuais de webhook — P1, G3/G4

**Responsável:** ENG; SEC revisa. **Estimativa:** 4–8 h. **Dependências:** R02. **Permissão:** código e testes locais; não editar registros reais.

1. Resolver sessão no tenant efetivo da credencial, usando o guard/contexto central; nunca tomar tenant de corpo/query para ampliar acesso.
2. Incluir tenant efetivo na consulta do webhook, inclusive alternativa global legada `sessionId=null`. Definir explicitamente quais globais do tenant podem ser acessados a partir da sessão e qual usuário os possui.
3. Aplicar a mesma fronteira em PUT, DELETE, GET logs e POST test; preservar distinção leitura/escrita/propriedade. Usar mutações com predicado de autorização ou transação/revalidação adequada contra troca de contexto entre leitura e escrita.
4. Retornar negação indistinguível para ID externo/inexistente; não executar transporte, alteração ou consulta de logs após negação. Inventariar registros legados sem tenant apenas com consulta autorizada; não atribuir tenant automaticamente por userId.

**Saída/aceite:** credencial A não lê, altera, exclui ou testa webhook B, mesmo com mesmo userId, ID conhecido e sessão A válida. Fluxos autorizados do próprio tenant continuam válidos. **Teste:** matriz A/B × global/vinculado × quatro rotas × browser/API key/OAuth; membro removido e ID inválido; tentativa de troca de tenant. **Evidência:** testes inicialmente falhos e reteste PASS, revisão de predicados SQL/mocks e integração R13. **Rollback:** manter rotas afetadas restritas, não reintroduzir o bypass. **Arquivos:** `src/app/api/webhooks/[sessionId]/[id]/route.ts`, `logs/route.ts`, `test/route.ts` e helpers de contexto.

### R05 — Impedir divulgação de segredo de webhook — P1, G3/G4

**Responsável:** ENG/SEC. **Estimativa:** 2–5 h. **Dependências:** R02/R04. **Permissão:** mudanças locais; rotação real separada.

1. Centralizar serialização segura para coleção, criação, atualização e logs. API key/OAuth não recebem plaintext de headers existentes, secret HMAC ou ciphertext recuperável.
2. Preservar contrato de browser apenas para identidade e operação efetivamente autorizadas; revisar CSRF/origin e política de sessão antes de liberar plaintext. Preferir metadados `configured`/mascarados para consumidores automáticos.
3. `PUT {}` não deve revelar credenciais. Atualização parcial deve preservar headers sem retorná-los; logs/erros também precisam de redaction e respostas sensíveis `no-store`.
4. Avaliar exposição anterior por evidência, não pressupor vazamento real. Se necessário, listar integrações afetadas por identificadores e preparar rotação de headers/HMAC após autorização, com janela de coexistência quando suportada.

**Saída/aceite:** nenhuma resposta bearer contém o marker de segredo, inclusive em erros; browser autorizado mantém comportamento aprovado; armazenamento continua protegido. **Teste:** resposta HTTP serializada completa, logs e atualização parcial; compatibilidade da UI. **Rollback:** manter segredo indisponível no retorno e fornecer fluxo seguro alternativo, sem restaurar disclosure. **Arquivos:** rotas webhook, `webhook-headers.ts`, serializadores/testes.

### R06 — Política de egress e rede privada — P1, G1/G2/G3/G4

**Responsável:** SEC/ENG; OPS aprova destinos. **Estimativa:** 4–10 h. **Dependências:** R02. **Permissão:** política local; liberar destino real altera acesso e exige aprovação.

1. Negar acesso privado por padrão a tenants não confiáveis. `allowLocal=true` não pode ser autorização autossuficiente do tenant.
2. Definir allowlist administrada pelo operador por tenant, esquema, host/IP, porta e finalidade. Avaliar caminho permitido quando o serviço interno compartilha a mesma autoridade. Autorizar o destino, não qualquer IP da rede inteira.
3. Revalidar a política em cada entrega/teste, inclusive para webhooks já salvos; definir como ficam desativados/quarentenados destinos existentes sem política, sem apagá-los.
4. Preservar validação de todos os endereços DNS, pinning, bloqueios especiais/metadata e proteção em redirects. Recusar credenciais em URL, IPv4 mapped/IPv6 e notações alternativas indevidas; não permitir que cabeçalhos sobrescrevam Host.
5. Para n8n local legítimo, criar concessão específica e auditável; não ampliar globalmente `allowLocal`. URL externa que volta a resolver para IP privado deve ser negada.

**Saída/aceite:** tenant comum não obtém acesso a loopback/RFC1918; concessão específica funciona apenas no destino aprovado; revogação passa a valer na próxima entrega. **Teste:** DNS fake/rebinding, IPv4/IPv6, redirects, portas, host/caminho, policy revocation e POST test sem rede real. **Rollback:** negar egress privado, preservando configurações para reativação controlada. **Arquivos:** `security.ts`, `webhook.ts`, rotas/configuração operador e testes. **Risco:** interromper integrações locais; mapear consumidores antes de ativar. Se persistência nova for necessária, criar pacote de schema incremental separado, sem migração implícita.

### R07 — Corrigir DNS do transporte compartilhado — P2, G3/G4

**Responsável:** ENG/QA. **Estimativa:** 2–4 h. **Dependências:** R02; revisar junto a R06. **Permissão:** código/testes locais.

1. Fazer callback de DNS respeitar `options.all` no Node 24: lista de endereços quando solicitado, endereço/família no modo simples.
2. Preservar IP previamente validado, hostname/SNI, validação TLS, timeouts e negação de redirects. Evitar segunda resolução não validada.
3. Compartilhar helper com CIMD apenas se as políticas e tipos forem compatíveis; não misturar regras de permissão CIMD/webhook.

**Saída/aceite:** não ocorre ERR_INVALID_IP_ADDRESS por formato do callback; apenas endereços validados podem ser usados. **Teste:** ambos formatos, famílias4/6 e transporte nativo com DNS controlado; sucesso HTTP em fixture local isolada explicitamente permitida, além dos casos negados. A prova deve parar antes do socket quando não houver fixture. **Rollback:** desabilitar entregas afetadas em vez de trocar por fetch não protegido. **Arquivos:** `src/lib/security.ts`, helper/testes de transporte. **Risco:** restaurar conectividade de webhook também torna efetiva a concessão privada insegura; não liberar antes de R06.

### R08 — Limites de entrada OAuth e proteção de recursos — P2, G3/G4

**Responsável:** ENG/QA. **Estimativa:** 3–6 h. **Dependências:** R02. **Permissão:** código/testes locais.

1. Trocar `request.text()` por leitura incremental limitada a16KiB de bytes efetivos; rejeitar Content-Length excessivo antecipadamente, sem confiar nele como única validação.
2. Cancelar reader no excesso/erro/desconexão, liberar recursos e limitar espera de corpo lento. Medir limite em bytes, incluindo UTF-8 multibyte.
3. Aplicar limiter antes do parsing em token/revoke/introspect e outros endpoints que compartilhem parser; preservar contrato de status OAuth, no-store e Retry-After aplicável.
4. Revisar limites de JSON/DCR/consentimento e política de tamanho/timeouts na borda. Alterar Caddy apenas em mudança operacional aprovada e por rotas necessárias.

**Saída/aceite:** não consumir stream integral excessivo; no máximo limite mais um chunk previamente limitado; conexões lentas encerram no orçamento definido; payloads legítimos continuam válidos. **Teste:** chunked, ausência/mentira Content-Length, limite exato e +1, multibyte, cancelamento e limiter antes de parser; form inválido/duplicado e tokens nunca logados. **Rollback:** manter teto da borda/negação controlada; não restaurar leitura ilimitada. **Arquivos:** `oauth/http.ts`, rotas token/revoke/introspect e testes.

### R09 — Limitar tentativas de login — P2, G2/G3/G4

**Responsável:** ENG/SEC. **Estimativa:** 4–8 h. **Dependências:** R02; revisar após R03 Auth.js. **Permissão:** implementação local; infraestrutura persistente aprovada separadamente.

1. Definir quotas documentadas por conta normalizada e origem efetiva, janela/burst/expiração e orçamento global. O desenho não pode permitir bloqueio permanente de uma vítima por terceiro.
2. Aplicar antes de bcrypt, com armazenamento compartilhado em múltiplas réplicas. Reutilizar primitiva central instalada quando adequada; não usar apenas Map de processo em produção.
3. Confiar em forwarded headers somente de ingress validado; impedir spoofing para escapar da quota. Não revelar existência da conta por mensagem/código de erro; avaliar diferenças de tempo com orçamento limitado.
4. Documentar comportamento na falha do limiter: impedir bypass silencioso e manter recuperação operacional limitada/auditada, sem fallback ilimitado.

**Saída/aceite:** quota funciona entre duas instâncias e permanece válida com mudança de IP/variação de email normalizado dentro da política; spoofing não amplia tentativas; respostas não enumeram contas; login legítimo após expiração funciona. **Teste:** relógio fake, concorrência, duas instâncias sintéticas, falha do store, headers forjados, expiração e reset conforme política. **Rollback:** proteção de borda temporária autorizada e suspensão controlada do login, sem retorno a tentativas ilimitadas. **Arquivos:** `auth.ts`, rate limiter/contexto de proxy, rotas Auth.js e testes.

### R10 — Uploads e processamento de mídia — P2, G2/G3/G4

**Responsável:** ENG/QA. **Estimativa:** 4–10 h. **Dependências:** R02; revisar bibliotecas após R03. **Permissão:** fixtures sintéticas; sem enviar arquivos a WhatsApp.

1. Autorizar tenant, sessão e capacidade antes de ler multipart sempre que os identificadores estiverem na URL. Rejeitar request não autorizado sem consumir corpo.
2. Definir e documentar tabela de limites por operação: mídia, foto de grupo e foto de perfil; limites por arquivo, total, número de campos/arquivos, timeout e concorrência. Escolher valores compatíveis com consumidores e provedor; não inventar um único teto genérico.
3. Aplicar limites antes de bufferização na borda e no parser/stream da aplicação. `file.size` após `formData()` não basta para proteger a leitura inicial.
4. Validar File, nome, conteúdo/tipo efetivo, dimensões e expansão de imagens; limitar recursos de processamento. Não confiar apenas em MIME/extensão. Temporários devem permanecer privados e ter cleanup restrito aos próprios arquivos.

**Saída/aceite:** não autorizado não lê corpo; exceder limites retorna413 sem gravação/envio; inválidos são rejeitados sem vazar caminhos; arquivos sintéticos válidos funcionam no transporte fake. **Teste:** chunked, MIME divergente, arquivo vazio, múltiplos arquivos, limite+1, imagem pequena comprimida com dimensões excessivas, concorrência moderada em ambiente isolado e cancelamento. **Rollback:** suspender operação de upload, não remover teto. **Arquivos:** rotas mídia/fotos, parser/helpers e testes. **Risco:** regressão de formatos/tamanhos legítimos e uso excessivo de memória nos testes; impor orçamento também no harness.

### R11 — Headers e fronteira proxy/origem — P2, G2/G3/G4

**Responsável:** ENG/OPS/SEC. **Estimativa:** 3–8 h. **Dependências:** R00; reteste após R03. **Permissão:** código local; alteração de ingress exige autorização.

1. Definir uma política de headers consistente na aplicação/borda: nosniff, Referrer-Policy e proteção contra framing com frame-ancestors e/ou X-Frame-Options compatíveis.
2. Inventariar scripts/fonts/imagens/conexões necessários e fluxos OAuth/Swagger; validar CSP em modo de relatório isolado antes de enforcement. Não resolver regressão com wildcard ou unsafe-eval generalizado.
3. HSTS somente em origem HTTPS controlada, com política de subdomínios aprovada; não habilitar includeSubDomains/preload cegamente em domínio compartilhado ngrok.
4. Verificar no-store em respostas sensíveis. Estabelecer origem/issuer canônicos e trusted proxy; evitar redirects a partir de X-Forwarded-Host/Proto/Prefix não confiáveis. Preservar base path `/wa-akg` uma vez.

**Saída/aceite:** headers observados no HTTPS real e respostas200/3xx/4xx pertinentes; nenhum redirect a host atacante; UI/login/consentimento/Swagger/socket funcionam. **Teste:** probes locais e públicos, headers forjados, prefix duplicado, navegação manual via ferramentas permitidas sem Playwright e fluxos OAuth. **Rollback:** política CSP anterior validada em modo report-only, mantendo demais proteções; documentar prazo da exceção. **Arquivos:** `next.config.ts`, `base-path.ts`, configuração Caddy fonte e testes.

### R12 — Proveniência e inicialização operacional — P1 operacional, G0/G5

**Responsável:** OPS/ENG. **Estimativa:** 3–6 h. **Dependências:** R00. **Permissão:** leitura; mudança/reinício específico após autorização.

1. Identificar por que o processo ativo passou a bind `::`: launcher, serviço/tarefa, env override por nomes/política e proprietário. Confirmar firewall e topologia; não atribuir causa pelo PID antigo.
2. Se o proxy local é a única entrada desejada, tornar bind loopback explícito na configuração de produção apropriada. Separar flags de teste que desabilitam workers de flags de segurança de bind: produção funcional pode precisar dos workers, teste não.
3. Revisar headers das rotas Caddy e aliases de descoberta alterados via API nesta conversa; localizar e atualizar fonte persistente sob autorização. Não depender apenas do estado em memória ou de autosave sem provar como Caddy reinicia.
4. Registrar versão/hash do artefato ativo, PID/PPID, listener e logs sem segredos. Provar reinício controlado sem processos duplicados, mantendo OAuth issuer e políticas de tenant. Definir supervisão/restart backoff e ownership de porta.

**Saída/aceite:** operador consegue identificar e reproduzir exatamente o processo/configuração, sem expor bind administrativo; reinício preserva aliases/HTTPS e não ativa efeitos WhatsApp no ambiente de teste. **Teste:** cold start isolado, parada do PID exato, port-busy fail-safe, recarga de proxy em fixture ou janela autorizada, probe LAN apenas quando permitido. **Rollback:** restaurar fonte/artefato compatível validado e manter contenção se versão anterior vulnerável. **Arquivos:** scripts Start/Stop/Inspect, servidor/custom start, configuração operacional fonte; não editar `.env` como efeito implícito.

### R13 — Integração e regressão independente — P1, G4

**Responsável:** QA/SEC. **Estimativa:** 1–2 dias. **Dependências:** R03–R12 integradas. **Permissão:** ambiente isolado; schema e credenciais sintéticas conforme autorização.

1. Executar tipos, lint, testes de aplicação/bootstrap/MCP e sintaxe MCP. A baseline é250 testes, mas contagem não é critério suficiente: exigir os novos casos de segurança aprovados.
2. Executar integração real dos handlers contra schema sintético A/B, sem mocks de predicados de banco. Verificar ownership, membro removido, credenciais revogadas, log/test webhook, leitura e escrita negativas, sem dados reais.
3. OAuth local: PKCE incorreto/ausente, redirect divergente, code reuse, expiração, refresh reuse/família, revogação, scope/capability/tenant/resource errado. Testar consentimento e troca de tokens usando contas sintéticas; tokens nunca em artefatos.
4. Claude/ChatGPT: validar documentos públicos atuais, CIMD, `none` explicitamente oferecido, rejeição JWT-only/segredo compartilhado, JWKS não buscado no fluxo público, grant unsupported não habilitado; verificar descoberta RFC, HTTPS, `/wa-akg` e challenge MCP. Autenticação real nos clientes depende do usuário/credenciais de teste autorizadas, não ser substituída por307 de login.
5. Validar Socket.IO com duas identidades, remoção de acesso e revalidação por evento; mídia privada com tenant incorreto, traversal/symlink e build sem dados privados.
6. Construir artefato de produção isolado, sem sobrescrever `.next` do processo ativo; executar auditoria de mídia/canary e tracing. Se o script atual escreve na raiz, usá-lo no checkout isolado.

**Saída/aceite:** todos os casos obrigatórios PASS, sem artefatos/segredos privados no build; revisão independente não encontra bypass equivalente nas rotas similares. **Evidência:** relatório requisito/teste, manifests/hashes, comandos e ambiente, status403/404 consistentes, ausência de mutação após negação. **Rollback:** voltar o pacote ao implementador e manter gateFAIL; não mascarar falha com teste alternativo. **Risco:** contaminar banco ou acionar transporte real; network policy/fakes e identidade do schema devem ser conferidas antes.

### R14 — Preparação operacional e recuperação — P1, G5

**Responsável:** OPS/QA. **Estimativa:** 4–10 h, mais janela. **Dependências:** R13. **Permissão:** backups/restore/reinício conforme escopo específico.

1. Validar backup dos componentes necessários: banco, mídia privada e estado criptografado de sessões, com credenciais/chaves protegidas por mecanismo próprio. Registrar integridade, retenção, acesso e recuperação de chaves sem revelá-las.
2. Ensaiar restauração somente em ambiente isolado, sem reconectar WhatsApp nem repetir envios; provar leitura autorizada e consistência de referências. Definir RPO/RTO e responsáveis antes do ensaio; medir resultado contra metas, não inventar aprovação.
3. Se alguma correção demandar schema, apresentar migração incremental, dry run/backup e compatibilidade antes/depois; nenhum reset/db push destrutivo. Preferir adiar liberação a executar migração não ensaiada.
4. Preparar runbook: artefato/configuração, origem OAuth, sequência de start, health checks, alertas e métricas. Logs não podem incluir Authorization, códigos OAuth, state, tokens, payloads privados ou secrets de webhook.
5. Definir detecção de 5xx, latência, memória, falha DNS, negações OAuth, login throttle, entregas webhook e drift de PID/bind/issuer. Usar IDs de correlação e dimensões de baixa cardinalidade; não criar notificações externas automaticamente.

**Saída/aceite:** restore provado, metas registradas e atendidas ou blocker explícito; cold start reproduzível; rollback operacional ensaiado. **Teste:** falha/retorno do processo e dependências em staging, backoff, backup corrompido detectado, revogação não desfeita por restauração indevida. **Rollback:** versão segura compatível ou manutenção; restore real nunca automático. **Risco:** restore reativar credenciais/filas antigas; exigir revalidação/revogação antes de uso.

### R15 — Revisão final e liberação separada — P1, G6

**Responsável:** SEC/OPS; autorização do responsável. **Estimativa:** 2–5 h, mais janela. **Dependências:** R13/R14 PASS.

1. Rever diff final, baseline preservada, matriz de cobertura e cada advisory atualizado. Não aceitar o total antigo de76 como estado futuro.
2. Elaborar pacote de liberação concreto: artefatos/hash, configurações e migrações eventualmente aprovadas, janela, operadores, impacto aos conectores, teste externo e rollback.
3. Solicitar autorização específica para a liberação/push/merge/deploy aplicável, com pacote pronto para revisão. Enquanto não concedida, G6 fica NOT RUN; o plano/documentação não é autorização.
4. Após liberação autorizada, verificar versão realmente ativa, bind/issuer/headers, rotas negadas e fluxos legítimos de teste. Observar pelo menos30 minutos e um ciclo agendado representativo previamente definido, ampliando a janela se o ciclo ou risco exigir. Efeitos WhatsApp reais continuam condicionados à autorização própria.
5. Falha de proteção tenant, segredo em resposta/log, drift de origem, degradação relevante contra a baseline ou repetição de5xx impede liberação/conduz à contenção e rollback aprovado.

**Saída/aceite:** matriz final preenchida e vinculada às evidências; nenhum bloqueador obrigatório aberto; riscos residuais limitados, com dono/prazo/aceite. **Rollback:** artefato seguro conhecido ou manutenção, sem reabrir versão vulnerável. Estado VERIFIED só depois da prova no ambiente-alvo.

## 5. Matriz de gates obrigatórios

| Gate | Critério para PASS | Impedimento |
|---|---|---|
| G0 — baseline | Git preservado, ambiente/identidades/runtime identificados | Ambiente errado, drift sem dono ou teste com transporte real habilitado |
| G1 — contratos | política tenant, divulgação de segredo, egress e quotas explícitas | Decisão de autorização ainda ambígua |
| G2 — desenho | dependências compatíveis, limites mensuráveis, rollback e fixtures revisados | Versão escolhida sem advisory review; migração não planejada |
| G3 — implementação | diffs pequenos rastreados a R03–R12 e testes de regressão | Bypass equivalente, segredo exposto ou guard apenas na UI/proxy |
| G4 — validação | novos casos + suítes + integração A/B + build privado PASS | Reproduções não corrigidas, teste obrigatório NOT RUN ou falha inexplicada |
| G5 — operação | configuração persistente, proveniência, restore/cold start e runbook verificados | Restore não provado, rollback vulnerável sem contenção ou segredos em logs |
| G6 — liberação | autorização específica e verificação pós-liberação com evidências | Sem autorização; blocker crítico/alto alcançável; erro de proteção tenant |

Estados de tarefa: PROPOSED → IMPLEMENTED → TESTED → VERIFIED; usar FAILED/BLOCKED/DEFERRED com motivo. Resultados de verificação: PASS/FAIL/BLOCKED/NOT RUN. Uma tarefa DEFERRED não satisfaz gate obrigatório. Exceções exigem critério de não alcance/mitigação, prazo e pessoa autorizada; não usar aceite de risco para esconder falha tenant ou vulnerabilidade crítica alcançável.

## 6. Critérios finais de conclusão

- TEN-01 e SEC-01 corrigidos em todas as rotas equivalentes, com provas negativa/positiva em identidade e tenant reais do ambiente sintético.
- Nenhuma concessão de rede privada depende apenas de `allowLocal` enviado pelo tenant; credenciais e sessões revogadas perdem acesso conforme política.
- Versões efetivas e avisos aplicáveis revisados, sem crítico aplicável aberto ou alto alcançável não corrigido; cadeia de instalação/lock reproduzível.
- Limites aplicados antes de leitura/alocação onerosa, quotas compartilhadas verificadas, callback DNS nativo compatível e TLS/pinning preservados.
- OAuth/CIMD/MCP e UI continuam funcionando sem relaxar PKCE, redirect, grant, scope, tenant, resource ou validação de bearer.
- Build auditado, origem/proxy/bind persistentes, recuperação ensaiada, riscos e testes não aplicáveis justificados. Todo requisito obrigatório tem método, resultado e evidência.
- Nenhum efeito restrito foi executado implicitamente. Liberação real somente em G6 autorizado.

## 7. Aplicação do fluxo de 12 etapas

1. Plan: escopo e baseline R00. 2. Validation Architecture: contratos R02 e R06/R08–R12. 3. Simulation Review: cenários negativos/rollback por tarefa. 4. Master Orchestration: dependências e integração da seção3. 5. Plan Audit: revisão independente antes de executar. 6. Goal Compile: critérios finais mensuráveis. 7. Traceability: IDs da auditoria para tarefas e testes. 8. Execution Backlog: R00–R15 com permissões/papéis. 9. Preflight: G0 e ambiente isolado. 10. Goal Activation: ativar apenas escopo autorizado; não cria automaticamente meta na ferramenta. 11. Goal Execution: pequenos diffs, correção/reteste e checkpoints. 12. Final Validation: G4–G6 e relatório final de estados/evidências.

## 8. Rastreabilidade de achados

| Achado | Tarefas | Prova de encerramento |
|---|---|---|
| DEP-01 e demais advisories | R01/R03/R13/R15 | versões instaladas + avisos atualizados + build/regressão |
| TEN-01 | R02/R04/R13 | A não lê/muta/testa B; quatro rotas; mesmo usuário e legado |
| SEC-01 | R02/R05/R13 | marker ausente de toda resposta/log bearer |
| NET-01 | R06/R07/R13 | egress privado negado sem política; concessão/revogação restritas |
| DOS-01 | R08/R13 | stream cancelado e limiter antes do parsing |
| AUTH-01 | R09/R13 | quota antes bcrypt, concorrência/réplicas e falha do store |
| NET-02 | R07/R13 | callback nativo4/6, all true/false, IP validado preservado |
| DOS-02 | R10/R13 | autorização antes de corpo; limites e processamento medidos |
| HDR-01 | R11/R13 | headers HTTPS e compatibilidade manual comprovados |
| OPS-01 | R00/R12/R14/R15 | processo/configuração persistente e restart/restore reproduzíveis |

## 9. Validação deste plano

- Revisão independente de coerência/cobertura: PASS; dez achados rastreados, permissões e rollback revisados, sem lacuna impeditiva identificada.
- Verificação documental: 16 tarefas R00–R15 presentes, gates G0–G6 definidos e ausência de whitespace final indevido. Alterações CIMD preexistentes preservadas.
- Este PASS aprova somente a estrutura do plano. Implementação, versões futuras, recuperação e encerramento dos achados não foram verificados. Todas as tarefas continuam PROPOSED; o gate de segurança do produto permanece FAIL.
