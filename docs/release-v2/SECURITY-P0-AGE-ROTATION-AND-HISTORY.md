# P0 — Chave age publicada: contenção, rotação, recriptografia e tratamento do histórico

**Escopo:** `fabriciocs/ConectaFlow`; data 2026-11-11; status **CONTENÇÃO DO HEAD OBSERVADA / ROTAÇÃO NÃO VERIFICADA / HISTÓRICO AINDA EXPOSTO**.

## 1. Evidência e limites

Uma chave privada age em formato reconhecível foi confirmada em `backups/.age-backup-key` no commit histórico `427a8c8630024b85254c0536c7e19fba29213811`. Não reproduzir o valor, nem anexá-lo a issue, log, documentação ou mensagem. Há também um `backups/.env.example` com valor de aparência de token GitHub e `backups/backup-audit.log` com URLs/e-mails operacionais; **não** está comprovado que o token do exemplo era válido ou que o log continha senhas.

**Alteração concorrente observada durante a auditoria:** `release/prod-v1` recebeu commit `dcc263e4b69ce4aadaa9e019393f459ae138be8d` removendo a pasta `backups/` inteira; `release/prod-v2` recebeu merge `9f955b26c6e7faa7510eff392753f73516a4b519` dessa contenção e depois um `.gitignore` que impede rastreamento futuro de backups/chaves. Esses commits foram observados no GitHub; esta documentação não afirma autoria nem validação de runtime.

A remoção do HEAD não elimina a chave dos commits anteriores, tags, forks, clones, caches, pull requests e arquivos distribuídos. Contenção não significa rotação; rotação não significa eliminação completa do histórico público.

## 2. Quais recursos precisam de tratamento

| Item | Risco | Ação exigida | Estado |
| --- | --- | --- | --- |
| Identidade privada age publicada | Decriptação de backups cifrados para o recipient correspondente | Assumir comprometimento; identificar usos e backups afetados, gerar par de chaves novo fora do repositório | BLOCKED: sem acesso ao inventário privado |
| Backups cifrados para a identidade antiga | Conteúdo histórico possivelmente decifrável por terceiros que obtiveram os arquivos | Recriptografar objetos preservados para recipient novo; testar restauração e revogar acesso antigo | BLOCKED: sem evidência de rotacão |
| Possível token GitHub no exemplo | Potencial acesso não autorizado se o valor era real | Identificar credencial com segurança, revogar e emitir nova com permissões mínimas e expiração; verificar logs de acesso | BLOCKED: validade não comprovada |
| `backups/backup-system.sh` removido com pasta | Possível perda de automação de backup legada | Identificar serviço ativo, script instalado e substituição aprovada (por exemplo, repositório independente de backups) | BLOCKED: não inspecionado o host |
| Histórico público Git | Chave ainda acessível por SHA antigo | Aprovar estratégia separada de limpeza de histórico; considerar forks e clones; acionar GitHub Support para caches | DEFERRED: operação destrutiva não autorizada |
| `release/prod-v2` | Risco de republicar segredos | Excluir backup/identidades do build, ignorar arquivos operacionais, usar detector local | IMPLEMENTED; teste de runtime pendente |

## 3. Procedimento seguro de rotação (operador autorizado)

**R1 — Descoberta, sem exibir segredos.** Identificar todos os lugares que recebem backups cifrados (`age`, serviços de armazenamento, repositório `system-backups`, hosts, retenção e restores), IDs dos backups, destinatários `age` configurados e dependências reais da chave. Conferir permissões de cada armazenamento e logs de acesso. Comparar o recipient público derivado da identidade comprometida com os recipients usados para cifrar backups, sem registrar material privado. Se não houver relação comprovada, documentar a incerteza; não supor que todos os backups tenham sido comprometidos.

**R2 — Novas credenciais.** Gerar uma identidade `age` nova **no ambiente privado do operador**, com `age-keygen` instalado por canal confiável, armazenando a chave com ACL estrita ou secret manager. Publicar somente o recipient público necessário à cifra. Não criar chave em GitHub, em variável `NEXT_PUBLIC_*`, artefatos, `.env.example`, transcript ou chat. Se houver PAT real no exemplo histórico, revogar no GitHub a credencial antiga e substituí-la por token de vida curta e permissões mínimas no secret manager. Verificar outros segredos dentro dos arquivos eventualmente decifrados.

**R3 — Recriptografia sem plaintext persistente.** Para cada backup afetado, obter objeto cifrado íntegro, validar hash, decifrar com identidade antiga sob sessão controlada e encaminhar o fluxo de bytes diretamente ao cifrador que utiliza o recipient novo (sem salvar tar/SQL em disco). Verificar status de **todos** os processos no pipeline; PowerShell 5.1 requer tratamento explícito dos exit codes dos processos nativos. Comparar o SHA-256 do conteúdo decifrado antes/depois por streaming e tentar uma restauração isolada para comprovar integridade. Reenviar cópia cifrada em local privado e testar leitura. O ciphertext histórico que já tenha sido copiado por terceiros continua comprometido: recriptografia posterior não apaga essa exposição.

**R4 — Transição sem perda.** Configurar os produtores de backup para o novo recipient, realizar backup novo, ensaiar restore de amostra representativa, confirmar retenção e RTO/RPO, só então desativar o recipient antigo para novas gravações. Preservar temporariamente a chave antiga em cofre privado até que retenções e recuperações estejam cobertas, com acesso auditado, e eliminá-la conforme política formal. Nunca apagar o único backup restaurável.

**R5 — Verificação.** Evidências mínimas não secretas: inventário dos objetos afetados, recipient público/fingerprint novo, ID da revisão de configuração, data da revogação de token antigo (se aplicável), hashes dos arquivos cifrados, status de testes de recriptografia e restauração, responsáveis e decisão assinada. Não publicar hashes de dados brutos sensíveis nem logs que possam identificá-los; preferir hashes de objetos cifrados.

## 4. Proteção e verificação no repositório

Os arquivos operacionais de backup devem morar fora do checkout e nunca ser enviados ao GitHub. O backup system script removido não deve ser restaurado cegamente do commit exposto.

Comandos multiplataforma propostos para um **checkout Git limpo da V2**, sem efeito no banco:

```sh
node scripts/security/check-tracked-secrets.mjs
node --test scripts/security/check-tracked-secrets.test.mjs
node scripts/release-v2/upgrade.mjs doctor
```

O detector retorna somente nomes de arquivos e IDs de regras — **não** imprime conteúdo detectado. Ele é heurístico, inspeciona arquivos do checkout atual e NÃO escaneia o histórico, GitHub forks, binários ignorados ou versões em execução. A ausência de achados não é prova de erradicação do P0. A execução dos testes precisa ser comprovada num ambiente Node; commit do teste não equivale a PASS.

Checar também `.gitignore`, `.dockerignore`, contexto de build, código de instalação e imagens/arquivos publicados, incluindo assets privados.

## 5. Histórico Git: plano condicionado a autorização separada

Somente depois de **R1–R5** e de coordenar o congelamento dos colaboradores: preparar espelho de auditoria privado, relacionar todos os refs, determinar arquivos e commits contaminados, avaliar `git filter-repo` em clone de manutenção, gerar mapa antigo→novo de SHAs, revisar diff de todos os branches/tags, garantir restauração do repo e comunicar procedimento de reclone. A reescrita exige pushes forçados e pode quebrar PRs, refs, verificações, forks, releases e pipelines. **Nenhum desses comandos deve ser executado sem autorização explícita e janela de manutenção.** Solicitar ao GitHub revisão de caches/artefatos públicos; a remoção em forks e clones fora do controle do proprietário não é garantida.

## 6. Gate de saída do incidente

Marcar `P0_RESOLVED` somente quando: chave antiga substituída (ou comprovadamente sem uso), recipients de backup migrados, backups afetados protegidos e restauração comprovada, tokens ativos verificados/revogados, histórico tratado conforme decisão registrada e controles de prevenção demonstrados em teste no SHA final. Até lá, o estado correto é **PARTIAL / BLOCKED**, sem autorização automática para publicação da Prod V2.

**Proibição:** não inferir o valor de chaves, não realizar ações destrutivas em sistema de backup, não trocar recipient sem restore, não atribuir um status VERIFIED sem prova.
