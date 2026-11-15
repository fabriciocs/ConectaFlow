# Instruções do projeto ConectaFlow

## Objetivo e contexto

Manter, configurar e melhorar localmente o ConectaFlow neste repositório (`C:\repos\ConectaFlow`). Use ConectaFlow em nomes, documentação e interfaces voltados ao produto. Antes de alterar identificadores técnicos, avalie compatibilidade, integrações e efeitos de migração.

O código atual inclui Next.js/React, TypeScript, Prisma, MySQL, Baileys, APIs HTTP, Socket.IO e documentação OpenAPI/Swagger. Há `package-lock.json`; confirme o gerenciador, as versões, os scripts, o banco, os serviços, as rotas e a configuração nos arquivos atuais antes de planejar ou executar mudanças. Use `README.md` e os documentos em `docs/` como orientação, conferindo a implementação quando a precisão importar.

## Ambiente e ferramentas

- Trabalhe no Windows. Scripts PowerShell devem ser compatíveis com Windows PowerShell 5.1.
- Não use Playwright. Prefira ferramentas estruturadas ou MCP quando forem suficientes; não substitua uma validação MCP por uma execução de shell equivalente.
- Se processos falharem ao iniciar com `-1073741502` (`0xC0000142`), registre a falha de inicialização, não repita caminhos equivalentes e não contorne o sandbox. Use uma alternativa autorizada apropriada ou marque a verificação como bloqueada.
- Antes de qualquer uso do Remote Desktop Commander, leia o protocolo operacional vigente indicado pelo usuário. Se não puder ler, não use essa ferramenta nem improvise procedimentos.
- Não instale dependências durante diagnóstico. Instalações só cabem no escopo autorizado e após avaliar seus efeitos.

## Proteção do trabalho e limites de ação

- Antes de editar, registre branch, HEAD e `git status`; examine alterações staged, unstaged, arquivos não rastreados e commits locais relevantes. Preserve todo trabalho preexistente.
- Nunca use `reset`, `clean`, checkout que descarte alterações, rebase destrutivo ou operação equivalente para remover trabalho.
- Não faça push, merge, release, deploy, commit, migração destrutiva, exclusão de dados, alteração em produção ou mutação de serviços externos sem autorização explícita.
- Não apague volumes, bancos, arquivos de dados ou backups. Não pare processos de outras aplicações para liberar portas; identifique o processo e peça autorização antes de interrompê-lo.
- Não eleve privilégios nem contorne controles de segurança. Se uma operação exigir autorização adicional, prossiga com o trabalho independente e seguro e registre o bloqueio.

## Segredos, dados e integrações

- Nunca leia, imprima, capture, registre ou copie valores de segredos de `.env` ou de outros arquivos. Ao inspecionar ambiente, mostre somente nomes de variáveis e resultados sanitizados.
- Não inclua credenciais reais em código, exemplos, testes, commits, logs ou relatórios. Nunca exponha segredos em variáveis `NEXT_PUBLIC_*` ou código executado no navegador.
- Trate API keys como credenciais bearer: gere-as com fonte criptograficamente segura, não as registre e evite cache de respostas sensíveis.
- Antes de mudar autenticação, autorização, usuários, sessões WhatsApp, API keys, webhooks, banco, Docker ou transporte, avalie compatibilidade, limites do provedor e efeitos operacionais.
- Verifique autenticação e autorização em cada rota afetada; não confie apenas em middleware ou na interface. Para webhooks, avalie assinatura/autenticação, timeout, retentativas, deduplicação e SSRF. Não amplie CORS nem exponha portas administrativas sem necessidade demonstrada.
- Alterações de schema e migrações devem ser incrementais e compatíveis com dados existentes. Não use reset de banco nem execute testes contra dados reais sem autorização específica.
- Não presuma que serviços, containers, portas, credenciais ou dependências estejam disponíveis. Confira o estado real antes de executar ações dependentes deles e não declare funcionamento integral se uma dependência essencial não foi verificada.

## Processo de trabalho

1. Delimite objetivo, escopo, restrições e critérios de aceite; registre o estado Git.
2. Leia instruções e documentação pertinentes e inspecione a implementação real, contratos, dependências e consumidores afetados.
3. Defina hipótese, menor plano suficiente, riscos, dependências, permissões, verificações e evidências esperadas.
4. Faça mudanças pequenas, rastreáveis e reversíveis, preservando alterações do usuário.
5. Execute validações proporcionais ao risco usando scripts e versões já definidos no projeto. Considere tipos TypeScript, lint, testes unitários/de integração, build, Compose, migrações não destrutivas e verificações HTTP apenas quando aplicáveis e autorizadas.
6. Diferencie verificações estáticas, testes locais e testes que dependem de serviços externos. Não invente endpoints, capacidades ou resultados; não declare aprovação para verificações não executadas ou que não cubram a afirmação.
7. Revise o diff, segurança, compatibilidade, documentação e regressões relacionadas. Corrija falhas relacionadas quando for seguro e autorizado; não amplie o escopo para problemas não relacionados.
8. Reavalie critérios, gates, riscos e próximos passos. Continue o trabalho seguro e autorizado que ainda for necessário; registre bloqueios reais sem mascará-los.

Para mudanças relevantes — comportamento, arquitetura, dependências, dados, segurança, integrações, deploy, múltiplos componentes ou risco de regressão — aplique o fluxo personalizado de 12 etapas em `C:\repos\codex-personalizacao\workflows\12-etapas.md`, com artefatos proporcionais à complexidade. Para tarefas triviais, use fluxo leve e registre por que as etapas completas não se aplicam. Esse fluxo é uma política local, não um recurso nativo do Codex. Não paralelize tarefas que compartilham arquivos ou estado; delegue somente trabalho independente, isolado e autorizado.

## Validação e conclusão

- Mantenha rastreabilidade entre requisito, alteração, validação e evidência. Registre comandos e resultados reais, incluindo limitações relevantes.
- Classifique cada gate como `PASS`, `FAIL`, `BLOCKED` ou `NOT RUN`. Não use exit code isolado como prova de funcionamento.
- Comunique o estado da tarefa usando `PROPOSED`, `IMPLEMENTED`, `TESTED`, `VERIFIED`, `BLOCKED`, `DEFERRED` ou `FAILED`. Use `VERIFIED` somente com evidência adequada; para verificações impossíveis, registre `NOT_VERIFIED` e o motivo.
- Considere a tarefa concluída apenas quando os critérios relevantes tiverem evidência, a documentação afetada estiver atualizada e não restarem etapas seguras e necessárias por executar. Caso contrário, informe claramente o estado parcial ou bloqueado.

## Relatório final

Informe de forma concisa:

- objetivo e resumo do resultado;
- arquivos alterados;
- comandos e verificações realmente executados, com resultado e critério coberto;
- estado dos gates, evidências e limitações;
- riscos, pendências, bloqueios e próximo passo recomendado.

Não faça commit, push, merge ou deploy como parte implícita da tarefa.
