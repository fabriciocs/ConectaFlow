# B2 — Runbook de sincronização, preparação, upgrade, rollback e aceite
Versão do procedimento: 2026-11-09; aplicação em produção: BLOCKED / NO-GO.
Execução: Windows 11, PowerShell 5.1, Git, Node 24, npm; adaptar somente com evidência do ambiente real.
Origem: C:/repos/ConectaFlow. Trabalho isolado: C:/repos/WA-AKG-B2-integration.

## 0. O que foi efetivamente executado nesta preparação
- git fetch --all --tags --no-prune: VERIFIED, origin e upstream atualizados.
- git pull --ff-only origin release/b2-integration-20261109: VERIFIED, nenhuma atualização de conteúdo necessária no momento da execução.
- git worktree repair para quatro referências aninhadas em .remote-desktop/security-remediation-20261106/worktrees: VERIFIED; caminho antigo consertado, worktree deps continua com 24 entradas alteradas preservadas.
- A candidata B2 continua separada de main e de trabalho funcional não integrado.
- Os comandos abaixo incluem fases FUTURAS que não devem ser descritas como já executadas.

## 1. Fluxo de decisão
Preflight sem mutações → salvar patches e inventário → verificar B1, SHA e dependências → fetch → comparar → integrar em worktree isolado → executar testes → backup/restore em sandbox → ensaio upgrade → aprovação → tag/release → implantação controlada → monitoração.
Se um teste obrigatório falhar, PARAR a dependência e manter branch/PR como draft. Não ignorar falhas do tipo TypeScript, ESLint, P3018, autorização ou isolamento.
Diferenciar: estado do processo, pós-condição, validação funcional e aceitação comercial. Código 0 por si só não aprova nada.

## 2. Passo a passo de read-only e fetch seguro
Os exemplos são comandos separados; não configurar GitHub Actions. Usar terminal PowerShell 5.1 e revisar paths/refs.

    $repo = 'C:/repos/ConectaFlow'
    $b2 = 'C:/repos/WA-AKG-B2-integration'
    git -C $repo status --porcelain=v1 --untracked-files=normal
    git -C $repo worktree list --porcelain
    git -C $b2 status --porcelain=v1 --untracked-files=normal
    git -C $b2 remote
    git -C $b2 fetch --all --tags --no-prune
    git -C $b2 branch -a -vv
    git -C $b2 rev-list --left-right --count 'main...origin/main'
    git -C $b2 rev-list --left-right --count 'main...upstream/main'

Para cada comando nativo, capturar $LASTEXITCODE imediatamente em script, falhando no primeiro erro essencial. Não imprimir remote URLs contendo credenciais; use remotes por nome.
Apenas se a worktree B2 estiver limpa, em sua branch, e o remoto correspondente estiver confirmado:

    git -C $b2 pull --ff-only origin release/b2-integration-20261109

Esse pull não integra branches de funcionalidade nem patches untracked. Em outras worktrees sujas: somente fetch e inventário; nunca pull que provoque conflito, checkout forçado ou stash automático.

## 3. Captura das mudanças existentes
Antes de cada cherry-pick/merge/port, registrar por worktree:
- path canônico, branch, HEAD, upstream e commits ahead/behind;
- git status --porcelain (incluindo untracked);
- git diff --stat, git diff --name-status, git diff --cached --name-status;
- hash de cada patch e snapshots de arquivos untracked, com exclusão de dados sensíveis;
- conflito de propriedade por arquivo, lista de agentes ativos, hora e responsável.
Patches, backups e evidências com dados privados: fora do repositório, com ACL restrita; nunca colar em PR/chat.
A recuperação dos quatro worktrees movidos foi administrativa (git worktree repair); nenhum conteúdo foi descartado. Não executar git worktree prune, reset ou remoção até confirmar zero trabalho pendente e decisão explícita.

## 4. Preparação do ambiente isolado
A branch B2 deve estar em path exclusivo, com configurações sintéticas e banco descartável; nunca compartilhar output de build ou base de dados de produção.
Pré-condições: Node compatível, npm e package-lock, acesso a registry permitido, disco disponível, versões fixadas, nenhuma operação concorrente no mesmo node_modules.
A candidata ainda NÃO contém bootstrap Prisma V2 e não tinha node_modules no último teste. Isso é um gate, não uma justificativa para substituir script por instalação manual sem revisão.
Após aprovação da instalação em sandbox, executar e registrar códigos de saída:

    npm ci
    node ./node_modules/typescript/bin/tsc --noEmit
    npm run lint
    npm test
    npm run mcp:check
    npm run mcp:test
    npm run build

O projeto utiliza package-lock.json; não usar pnpm no upgrade. Conferir se todos os scripts existem no package.json do SHA que realmente será testado.
Prisma validate/generate/bootstrapping devem seguir exclusivamente o histórico canônico integrado, em banco descartável. Não usar prisma db push nem prisma migrate reset em bancos reais.

## 5. Estratégia da migração e prova P3018
M01 Identificar no banco restaurado se a trilha é vazia, V1, V2 ou mista; consultar nomes das migrações e schema sem copiar DATABASE_URL a log.
M02 Revisar migratórios existentes e seus checksums; não editar migração já aplicada.
M03 Criar banco descartável com mesma engine/charset/collation/lower_case_table_names da origem.
M04 Rodar bootstrap V2 isolado de instalação nova e observar status de migração; P3018 ou divergência bloqueiam o gate.
M05 Restaurar backup da B1, verificar contagens e checksums, ensaiar upgrade e comparar antes/depois.
M06 Verificar integridade de sessões, AuthState, InboundEvent, ProcessingResult, OAuth e tenant memberships e grants.
M07 Testar restart após migração, rollback de binário quando compatível ou forward fix, sem perder dados.
M08 Registrar plano de recuperação com identificador de backup e verificação de restauração. Sem comprovar restore, produção NO-GO.
Usar dados sintéticos onde possível; se precisar de cópia de base real, obter autorização específica, mascarar dados e manter a cópia fora do Git.

## 6. Matriz de testes funcionais mínimos
| Teste | Condição positiva | Condição negativa |
| --- | --- | --- |
| Login/logout | sessão inicia e encerra | token/cookie revogado falha |
| OAuth Code+PKCE | state/challenge válidos | PKCE fraco, code reused e redirect fora da allowlist falham |
| MFA/TOTP | enrolment e verificação | replay e segredo de outro usuário falham |
| Tenancy | usuário acessa tenant autorizado | usuário A acessando tenant B recebe negação |
| API keys | herda escopos do emissor | aumento de permissões e chave revogada são negados |
| MCP | chamada autorizada limitada | tool fora do grant, tenant ou sessão é negada |
| QR/sessão | token de conexão efêmero | sessão de outro usuário e QR expirado negados |
| Baileys leases | uma réplica é proprietária | duplicação e race não criam donos simultâneos |
| Webhook | URL permitida, assinatura válida | SSRF privado, replay, payload grande e URL alterada negados |
| Mídia | arquivo permitido e owner válido | path traversal, symlink e mídia privada são negados |
| OpenAPI | métodos reais, docs e schemas iguais | operação documentada inexistente é encontrada e corrigida |
| Proxies/assets | localhost sem contexto; Caddy/ngrok com contexto | assets e callbacks não apontam para host/caminho errado |
| Upgrade | base B1 restaurada migra para B2 | migração falha → rollback/forward-fix controlado |
| Compilação | TypeScript, lint, build e MCP passam | qualquer erro obrigatório impede promoção |
Testes de WhatsApp devem usar fixtures e stubs; contato, grupo ou mensagem real só com destinatário e execução explicitamente autorizados.

## 7. Gate de integração e publicação
Antes de marcar PR #2 como pronta: comprovar origem B1, delta de todos os commits e worktrees, resolução dos conflitos, gates R01–R15 e esquema, testes em commit imutável, backup/restore, plano de rollback.
A PR deve permanecer draft enquanto qualquer gate obrigatório estiver bloqueado. Atualizar descrição e comentários com STATUS, SHA, logs locais protegidos, instruções de reproduzir e links de documentação.
Publicação final, quando aprovada: merge autorizado na branch protegida, SHA remoto verificado, tag imutável B2 (nome definido após identificação B1), release notes completas, assets e checksums, pacote de upgrade e smoke tests pós-release.
Não criar release/tag no GitHub apenas para representar que a documentação foi escrita.

## 8. Upgrade no ambiente operacional — somente após autorização
U01 Escolher host, serviço, usuário administrador autorizado e janela; registrar estado antes (HEAD, versão, processo, portas e health). Não interromper processo de terceiro.
U02 Realizar backup consistente do banco, mídia e config; cifrar/restringir ACL; confirmar hash e restore em sandbox.
U03 Transferir apenas artefatos da tag verificada B2 e dependências fixadas; nunca copiar diretório .env em pacote público.
U04 Verificar configuração por NOMES de variáveis, separando server-only e NEXT_PUBLIC_; segredos permanecem server-only.
U05 Pausar operações externas no momento definido pela janela; não apagar mensagens nem leases sem plano explícito.
U06 Executar migrações somente após gate DB e comparação da origem; preservar log raw, códigos e checkpoints.
U07 Build e início controlado com serviço específico; validar health, login, tenant, OAuth, MCP, HTTP, websocket e sessões.
U08 Se falhar, declarar FAILED, interromper avanço, decidir revert binário vs forward fix e nunca restaurar base antiga sobre dados novos sem autorização e plano de perda zero.
U09 Registrar SHA/tag efetiva, instâncias, métricas, incidentes, decisão final, RTO/RPO e aceite assinado.

## 9. Matriz de evidências e códigos
Os scripts propostos em scripts/release-b2/ (ainda não implementados) devem usar:
- exit 0 = execução técnica concluída, nunca aprovação final automática;
- exit 10–19 = precondição/baseline inválida;
- exit 20–29 = dependência ausente (banco, node_modules, backup, autorização);
- exit 30–39 = teste/validação falhou;
- exit 40–49 = alteração parcial ou efeito externo inconclusivo; consultar estado antes de retry.
Saída de sucesso: STATUS, ACTION_ID, EXIT_CODE, SHA, VALIDATED e caminho protegido dos logs. Em falha: abrir somente stderr relevante e contexto mínimo.
Rastreabilidade: B2-AC → B2-TASK → branch/commit → teste → resultado/exit → evidência imutável → gate.
Checklist final: zero alterações de terceiros descartadas, zero segredos publicados, PR/release e runtime com SHA confirmado, restore comprovado, docs corretas e responsáveis cientes.
