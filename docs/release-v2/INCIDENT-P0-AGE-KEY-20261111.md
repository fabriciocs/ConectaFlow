# P0 — Incidente de exposição de identidade privada age no histórico do ConectaFlow

**Data do registro:** 2026-11-11. **Estado:** CONTAINED_AT_ACTIVE_HEAD / ROTATION_NOT_VERIFIED / HISTORY_EXPOSED. **Responsável:** operador autorizado das chaves e backups. **Não declarar RESOLVED até comprovar rotação e impacto.**

## 1. Fatos confirmados (sem reproduzir credencial)

- O repositório público `fabriciocs/ConectaFlow` continha material reconhecível como identidade privada `age` no histórico da V1, dentro de uma pasta `backups/`. Não reproduzir o valor em issue, arquivo, PR ou log.
- `release/prod-v1`: commit `dcc263e4b69ce4aadaa9e019393f459ae138be8d` removeu os seis arquivos de `backups/` do HEAD.
- `release/prod-v2`: PR #6 foi mesclado no commit `9f955b26c6e7faa7510eff392753f73516a4b519`, incorporando a mesma remoção sem reescrever histórico.
- Branch V2 ganhou regras de exclusão em `.gitignore` e `scripts/release-v2/check-sensitive-tracked-files.mjs`, ligado ao `upgrade.mjs doctor`.
- O repositório privado `fabriciocs/system-backups` possui CLI que usa `AGE_RECIPIENT` para criação de backups, e `AGE_IDENTITY`/`AGE_IDENTITY_FILE` na restauração. **Não foi comprovado que o destinatário corresponde à chave exposta**; isso deve ser verificado somente pelo operador, sem divulgar material confidencial.
- No script legado `backups/backup-system.sh`, a criptografia usava `AGE_RECIPIENT`; não há evidência de que a identidade privada publicada tenha sido usada em todos os backups.
- Remover um arquivo do HEAD não revoga uma chave age: quaisquer cópias anteriores de arquivos criptografados para a chave antiga podem continuar descriptografáveis por quem obteve a identidade privada.

## 2. Contenção executada no GitHub

| Controle | Estado | Evidência |
| --- | --- | --- |
| Remoção dos seis arquivos do HEAD de V1 | VERIFIED | `dcc263e4` |
| Mesma remoção incorporada ao HEAD da V2 | VERIFIED | PR #6 / `9f955b26` |
| Regra `/backups/` e padrões de identidade privada em `.gitignore` da V2 | IMPLEMENTED | Arquivo na branch V2 |
| Scanner local de arquivos rastreados (somente caminhos e detecção de marcadores, sem conteúdo) | IMPLEMENTED | `scripts/release-v2/check-sensitive-tracked-files.mjs` |
| Integração do scanner no CLI de diagnóstico V2 | IMPLEMENTED | `scripts/release-v2/upgrade.mjs` |
| Testes de scanner com fixtures sintéticas | IMPLEMENTED / PARTIAL_TESTED | Testes no repositório; verificações simuladas na implementação, sem execução local completa via Node |
| Troca da chave em produção / alteração de `AGE_RECIPIENT` | BLOCKED | Host e configuração operacional não acessados |
| Recriptografia e restore de cada backup afetado | BLOCKED | Arquivos e chaves não disponibilizados; requer ação do responsável |
| Limpeza de histórico por `git-filter-repo` / force-push | DEFERRED | Altíssimo impacto na ancestralidade, nas PRs e nos clones; requer autorização separada |

## 3. Verificação de uso e escopo — somente no ambiente autorizado

1. Identificar o conjunto de identidades privadas e destinatários age usados pelos serviços de backup e restauração, sem imprimir o conteúdo privado; capturar apenas fingerprint (hash local) ou identificador de chave auditável.
2. Enumerar todas as rotinas ativas e agendadas que leem `AGE_RECIPIENT`, `AGE_IDENTITY`, `AGE_IDENTITY_FILE` e seus arquivos de configuração; incluir `system-backups`, scripts legados, servidores Windows/Linux/macOS, GitHub Releases e armazenamento local/remoto.
3. Identificar quais arquivos `.age` foram criptografados ao destinatário correspondente à identidade comprometida, por configuração histórica + ensaio autorizado de descriptografia de amostras, **sem salvar o conteúdo em Git, logs ou diretórios compartilhados**. Arquivos com destinatários desconhecidos entram em quarentena.
4. Inventariar objetos publicados e retenções, preservar hashes/IDs e o acesso às cópias necessárias para recuperação. Não destruir arquivos de backup ou chaves antigas antes de validar a recuperação com nova identidade.
5. Verificar logs de acesso disponíveis, porém reconhecer que não é possível provar ausência de cópias feitas enquanto a chave esteve exposta. Classificar necessidade de notificação de incidente de dados conforme conteúdo efetivamente acessível, políticas e legislação aplicável.

## 4. Rotação segura — execução manual autorizada

- Gerar **nova identidade** localmente, fora de qualquer repositório, por ferramenta age oficial (exemplo: `age-keygen -o CAMINHO_PRIVADO_NOVO`). Armazenar com ACL/permissões mínimas, backup seguro da nova identidade e acesso apenas aos responsáveis.
- Extrair **somente a chave pública** por `age-keygen -y CAMINHO_PRIVADO_NOVO`; alterar o destinatário (`AGE_RECIPIENT` ou configuração equivalente) de cada produtor de backup para a nova chave. Não colocar a chave privada em `.env` versionado, PR, issue, arquivo público ou pipeline.
- Desativar novas gravações sob a chave antiga assim que o novo destinatário for validado; manter a identidade antiga somente no cofre de recuperação pelo tempo necessário à migração. Uma chave age privada exposta **não pode ser revogada tecnicamente**; a medida é deixar de usá-la.
- Para cada backup afetado: verificar checksum do original; usar fluxo binário de descriptografia com identidade antiga e nova criptografia em ambiente restrito, preferencialmente streaming, **sem pipe binário do PowerShell 5.1** (que pode alterar bytes). Gravar resultado em arquivo temporário novo, não sobrescrever origem, verificar hash e restaurar a cópia recriptografada em sandbox com a nova identidade.
- Publicar novas cópias criptografadas apenas no repositório/armazenamento privado autorizado. Depois da confirmação de restore, aplicar retenção e retirada controlada das cópias expostas com autorização explícita. Recriptografia **não apaga** cópias antigas que um terceiro eventualmente baixou.
- Testar novamente backup e restore completos; capturar apenas hashes, IDs, duração e códigos de saída. Atualizar políticas de rotação, agendamentos e plano de desastre.

**Atenção:** o projeto `system-backups` pode usar uma identidade SSH como `AGE_IDENTITY_FILE`; não presumir que tal chave coincide com a age exposta. Verificar por destinatário/configuração, não por nome de arquivo apenas.

## 5. Histórico público: decisão separada

Segundo a documentação oficial do GitHub, rotacionar a credencial é prioridade; reescrever o histórico com `git-filter-repo` tem impactos em commits, PRs, branches, tags, forks e clones e pode não remover cópias em cache ou clones. **Não executar `git filter-repo`, force push, exclusão de refs ou limpeza de clones sem plano e autorização específica.** Se necessário, agendar janela de congelamento, inventário de refs/forks, comunicação aos colaboradores, backup de metadados e suporte GitHub.

Fontes técnicas:
- https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
- https://github.com/FiloSottile/age/blob/main/doc/age.1.ronn

## 6. Comandos de verificação sem acessar segredos

Há dois verificadores complementares: o de release V2, integrado ao `doctor`, e o mais abrangente em `scripts/security/`, que detecta também padrões de token. Nenhum desses verificadores analisa o histórico Git.

No checkout V2 atualizado, com Node >=22 e Git disponíveis:

```sh
node scripts/release-v2/check-sensitive-tracked-files.mjs
node scripts/security/check-tracked-secrets.mjs
node scripts/release-v2/upgrade.mjs doctor
```

O scanner só verifica o *checkout atual*, não commits antigos, backups remotos ou valores em serviços externos. PASS do scanner **não significa** que o P0 foi resolvido. O `doctor` reporta `KEY_ROTATION=NOT_VERIFIED` até haver evidência de rotação operacional.

## 7. Critérios de encerramento do incidente

1. Regra de prevenção em todas as branches relevantes, com scanner em checkout congelado e evidência de ausência de identidade privada em artefatos novos.
2. Todos os destinatários operacionais que usaram a chave exposta identificados, com rotação documentada e revisada; qualquer ambiguidade é BLOCKED.
3. Backups afetados recriptografados, checksums e restore comprovados em clone isolado; política de retenção executada por operador autorizado.
4. Revisão de acessos e avaliação de impacto encerradas com decisão registrada.
5. Plano sobre histórico público (rotacionar e preservar versus reescrever com aprovação) registrado.
6. Somente depois disso, P0 pode ser rotulado VERIFIED/CLOSED; gates de release V2 seguem independentes.

**Situação atual:** CONTENÇÃO HEAD VERIFIED; ROTAÇÃO / RECRIPTOGRAFIA / INVESTIGAÇÃO DE IMPACTO BLOCKED; INCIDENTE P0 AINDA ABERTO.
