# Plano: configuração MCP por usuário

* **Autor:** não identificado na configuração Git local
* **Estado:** PROPOSED
* **Data:** 2026-11-18

## Problema

O MCP stdio precisa receber a identidade de um usuário para acessar a API. Hoje essa identidade vem de `WA_AKG_API_KEY`; sem a variável, o processo inicia sem registrar ferramentas da API. A chave gerenciada já é emitida para um usuário e tenant, tem escopos de leitura e é validada pela API em cada chamada. O setup precisa tornar essa configuração repetível sem expor a chave em histórico de shell, logs, argumentos de processo ou Git.

O MCP HTTP atende outro cenário: autentica cada requisição com OAuth Bearer e vincula o token a usuário, cliente, grant, tenant, recurso e sessões. Esse fluxo existente permanece separado e não deve herdar uma chave global do processo.

## Decisões

1. **Manter uma credencial individual para cada processo stdio.** A chave deve vir da conta autenticada no Dashboard. Cada processo MCP usa uma conta e tenant; pessoas diferentes usam perfis de processo diferentes. A configuração local não pode conceder escopos que a API não concedeu.
2. **Manter OAuth por requisição para HTTP.** O transportador HTTP continua validando o Bearer antes de processar cada chamada e encaminha a mesma identidade para a API.
3. **Guardar configuração local em perfis separados.** O setup escreve `.mcp-profiles/<perfil>.env` dentro do pacote MCP. O perfil padrão é `default`; nomes adicionais permitem configurar mais de uma identidade sem compartilhar a chave.
4. **Fazer leitura primeiro.** A chave emitida pelo setup MCP tem `api:read` e `sessions:read`. Escritas locais permanecem indisponíveis até existir um fluxo explícito, auditado e autorizado para conceder `api:write` e capacidades por sessão.
5. **Não revogar nem rotacionar automaticamente.** Perder uma chave existente exige rotação explícita pelo Dashboard; o setup não invalida processos que já estão em uso.
6. **Remover somente estado local gerado.** Um comando de limpeza pode apagar o arquivo de perfil escolhido e remover `.mcp-profiles/` apenas quando estiver vazia. Nunca apaga `.env` da aplicação, código, testes, documentação, estado WhatsApp ou arquivos existentes do usuário.

## Objetivos e limites

### Objetivos

- Configurar `WA_AKG_API_KEY`, `WA_AKG_API_BASE_URL` e `WA_AKG_MCP_ALLOW_REMOTE_API` por perfil.
- Receber a API key sem eco no terminal, não exibi-la novamente e não colocá-la em parâmetros do processo.
- Restringir o arquivo do perfil ao usuário local: modo `0600` em POSIX e ACL privada equivalente no Windows quando disponível.
- Validar URL absoluta, protocolo, presença de `/api`, destino loopback ou HTTPS remoto com confirmação expressa.
- Permitir escolher o perfil no start, preservando suporte às variáveis já fornecidas pelo ambiente do processo.
- Manter a API como autoridade final para identidade, tenant, escopos, ownership e permissões de sessão.

### Fora do escopo

- Trocar stdio por OAuth interativo, criar fluxo device-code ou armazenar refresh tokens.
- Alterar os contratos de OAuth HTTP ou permitir chave estática em endpoint HTTP multiusuário.
- Habilitar escrita por variável local, wildcard ou opção do setup.
- Configurar ou reiniciar serviços externos automaticamente.
- Apagar arquivos MCP rastreados ou documentos de trabalho existentes.

## Jornadas principais

### Setup local de um perfil

* **Dado** que o usuário entrou no Dashboard e provisionou a chave MCP individual, o usuário executa `npm run mcp:setup`.
* **Quando** informa o nome do perfil, a URL da API e cola a chave no prompt oculto, o CLI valida as entradas e grava o perfil local.
* **Então** a saída contém apenas o caminho do perfil e instruções de start; o segredo não aparece no terminal. Um segundo setup do mesmo perfil pede confirmação antes de substituir o arquivo.

### Início do MCP stdio

* **Dado** um perfil existente, o usuário executa `npm run mcp:start -- --profile <perfil>`.
* **Quando** o launcher lê o perfil, ele combina os valores locais com as variáveis do processo sem imprimir a chave e inicia `src/server.mjs`.
* **Então** ferramentas e chamadas continuam limitadas aos escopos e permissões verificados pela API para a identidade daquela chave.

### Remoção de um perfil

* **Dado** um perfil local configurado, o usuário executa `npm run mcp:remove-config -- --profile <perfil>`.
* **Quando** confirma a remoção, o CLI apaga apenas o arquivo correspondente.
* **Então** o diretório de perfis é removido somente quando vazio. A chave continua válida no servidor até ser revogada ou rotacionada pelo usuário no Dashboard.

## Arquitetura proposta

```text
Dashboard autenticado
  └─ emite uma chave MCP vinculada a usuário + tenant, escopos de leitura
       └─ usuário cola a chave no setup CLI (entrada sem eco)
            └─ .mcp-profiles/<perfil>.env (fora do Git, acesso privado)
                 └─ launcher inicia MCP stdio para aquele perfil
                      └─ ferramenta → WA_AKG_API com X-API-Key
                           └─ API valida chave, usuário, tenant, escopo,
                              ownership e permissão da rota

Cliente remoto
  └─ OAuth Bearer por requisição → MCP HTTP
       └─ validação OAuth do usuário/grant/resource/sessões
            └─ mesma identidade Bearer → WA-AKG API
```

O MCP pode filtrar ferramentas incompatíveis com os escopos conhecidos, mas esse filtro é apenas UX. Cada chamada deve continuar passando pela autenticação e autorização da API. `WA_AKG_MCP_CREDENTIAL_CAPABILITIES` não pode elevar escopos da chave nem substituir as regras do servidor.

### Setup e arquivos locais

- O CLI valida nomes de perfil com um conjunto restrito de caracteres, impedindo separadores de caminho e traversal.
- A API key é pedida em modo oculto; não pode ser aceita por argumento de linha de comando.
- A gravação usa arquivo temporário no mesmo diretório, permissões privadas e rename atômico. O CLI não imprime conteúdo nem registra o segredo em erros.
- Um destino fora de loopback exige HTTPS e confirmação que grava `WA_AKG_MCP_ALLOW_REMOTE_API=true` apenas nesse perfil.
- A URL e a chave do ambiente pai têm precedência apenas quando o usuário escolhe o modo sem perfil. Ao selecionar perfil, os valores daquele perfil definem a identidade ativa para evitar mistura acidental de contas.
- A configuração não é carregada pelo processo HTTP; perfis stdio não alteram `/mcp`.

### Compatibilidade e migração

- Sem `--profile`, o start continua aceitando `WA_AKG_API_KEY` e `WA_AKG_API_BASE_URL` herdadas do ambiente, preservando clientes atuais.
- Com `--profile`, o launcher usa exclusivamente o perfil escolhido para as três variáveis MCP e não compartilha a key de outro perfil.
- Perfis locais não são migrados automaticamente de `.env` antigos. O setup avisa se encontrar uma fonte de configuração legada e oferece instruções sem imprimir seu valor.
- O arquivo `.env.example` contém somente nomes e valores ilustrativos sem credenciais.

## Alternativas consideradas

### OAuth interativo também para stdio

* **Vantagens:** tokens curtos, revogação central e fluxo de login uniforme.
* **Custos:** exige callback local, PKCE, gestão de refresh token, armazenamento seguro multiplataforma e compatibilidade adicional dos clientes MCP.
* **Decisão:** manter como evolução separada. O contrato do projeto já determina chave individual para stdio e OAuth por requisição para HTTP.

### Um `.env` único no pacote

* **Vantagens:** implementação simples.
* **Custos:** troca de conta sobrescreve a identidade anterior e facilita usar uma chave errada quando há mais de um usuário.
* **Decisão:** usar perfis nomeados em `.mcp-profiles/`.

### Guardar chave no comando ou no JSON de configuração do cliente

* **Vantagens:** dispensa arquivo próprio.
* **Custos:** a chave pode aparecer em histórico, logs, argumentos ou configurações exportadas pelo cliente.
* **Decisão:** entrada oculta no CLI e arquivo local privado.

## Limpeza e proteção Git

- Adicionar regras explícitas para `/mcp/wa-akg-mcp/.mcp-profiles/`, arquivos temporários do setup e estado local de autenticação MCP.
- Preservar o whitelist de `.env*.example`.
- `mcp:remove-config` é o mecanismo de limpeza. Não executar `rm`, `git clean` nem exclusões genéricas.
- Antes de qualquer remoção adicional, verificar `git status`, referências nos scripts/docs e confirmar que o alvo é artefato gerado e não dado do usuário.
- Os documentos OAuth/MCP existentes estão staged no workspace e contêm contratos ativos; não os apagar nem reformatar como parte desse plano.

## Arquivos previstos para implementação

| Caminho | Ação | Mudança planejada |
|---|---|---|
| `.gitignore` | Modificar | Ignorar perfis MCP locais, temporários e estado privado, mantendo exemplos versionáveis. |
| `package.json` | Modificar | Adicionar `mcp:setup` e `mcp:remove-config`; encaminhar `--profile` ao start. |
| `mcp/wa-akg-mcp/package.json` | Modificar | Adicionar `setup`, `remove-config` e usar launcher como `start`; incluir o launcher no `check`. |
| `mcp/wa-akg-mcp/scripts/setup.mjs` | Criar | Prompts ocultos, validação, gravação atômica e proteção de arquivo. |
| `mcp/wa-akg-mcp/scripts/start.mjs` | Criar | Resolver perfil, carregar ambiente sem imprimir valores e iniciar o servidor stdio. |
| `mcp/wa-akg-mcp/scripts/remove-config.mjs` | Criar | Remover apenas um perfil nomeado após confirmação. |
| `mcp/wa-akg-mcp/README.md` | Modificar | Documentar setup, perfis, segurança, rotação e remoção. |
| `mcp/wa-akg-mcp/.env.example` | Modificar | Manter placeholders sem credenciais e mostrar variáveis por processo. |
| `mcp/wa-akg-mcp/test/setup.test.mjs` | Criar | Verificar validação, atomicidade, não vazamento, seleção e limpeza restrita de perfis temporários. |

Não está prevista a exclusão de código MCP, endpoints de credenciais, testes ou documentação existente. O diretório `.mcp-profiles/` é runtime local e só pode ser removido quando vazio após o comando explícito de limpeza.

## Verificação planejada

- `npm run mcp:check`: sintaxe dos arquivos MCP e scripts de setup/launcher/remoção.
- `npm run mcp:test`: testes unitários do CLI e contratos MCP sem chamar serviços externos.
- `npm run mcp:smoke:live-readonly`: opcional, somente com credencial local fornecida privadamente; não enviar mensagens nem alterar sessões.
- `npm run build`: validar integração com o projeto Next.js se mudanças alcançarem código web/API.
- Inspecionar `git status --short` e `git diff --check`; confirmar que nenhum arquivo de perfil local foi rastreado.

## Riscos e reversão

- O perfil local contém uma credencial bearer em disco. Reduzir exposição com prompt oculto, permissões locais, ausência de logs e escopos de leitura; revogação no Dashboard é a resposta a vazamento.
- ACLs em Windows precisam de validação própria; `chmod` não é controle suficiente nesse sistema. O setup deve aplicar ACL restrita ou parar com instrução de correção.
- Se o launcher falhar, a reversão é iniciar o `src/server.mjs` diretamente com as variáveis já fornecidas pelo processo; os perfis não alteram schema, banco ou serviços.
- A remoção local de perfil não revoga a credencial no servidor. A interface deve dizer isso antes da confirmação.

## Estado EGM

**PROPOSED.** Este plano não altera código, variáveis do serviço, contas, chaves, banco ou arquivos já existentes. A implementação começa após aprovação do plano.
