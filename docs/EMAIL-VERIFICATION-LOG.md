# Registro de verificação de e-mail

O servidor grava eventos JSONL em `logs/email-verification.jsonl`, ignorado pelo Git. Cada linha identifica e-mail, usuário, identificador da solicitação, estado e horário. Eventos: `rate_limited`, `created`, `sent`, `delivery_failed`. O evento `sent` indica aceitação pelo transporte SMTP, não entrega comprovada na caixa postal.

## Recuperação local opcional

Em desenvolvimento exclusivamente, configure `EMAIL_VERIFICATION_LOCAL_RECOVERY=true` no ambiente privado do servidor. Se o SMTP falhar, o log `delivery_failed` inclui `recoveryUrl` e o token permanece válido até expirar ou ser consumido. Abra o endereço registrado e confirme a verificação pela página. Em produção, o link nunca é registrado e a falha invalida o token; utilize reenvio ou recuperação administrativa autenticada. Nunca habilite essa opção em ambientes compartilhados ou expostos publicamente.

O arquivo contém dados pessoais e, no modo de recuperação local, credenciais temporárias. Restrinja acesso ao usuário do serviço, não compartilhe, não envie a agregadores de logs, mantenha fora de backups públicos e defina política de retenção/remoção segura. A criação usa permissões restritas quando suportadas pelo sistema operacional; no Windows, revise as ACLs da pasta `logs`.

**Diagnóstico no Windows em 07/11/2026:** a leitura com `icacls logs\\email-verification.jsonl` encontrou permissões herdadas que incluem controle total para o grupo de usuários locais e modificação para usuários autenticados. O arquivo existente não deve receber links ou tokens de recuperação enquanto essas permissões estiverem vigentes. Esta inspeção foi somente-leitura; nenhuma ACL foi alterada. A remediação exige identificar previamente a conta real do serviço e validar que ela manterá o acesso após o ajuste, com autorização específica para a mudança de permissões.

## Validação e isolamento dos testes

Os testes automatizados usam contas sintéticas (`user@example.test`) e um transporte SMTP simulado. Para evitar contaminação do log operacional, os testes injetam um coletor de eventos em memória: **não gravam** os eventos sintéticos em `logs/email-verification.jsonl`. Esse arquivo pode conter registros sintéticos de execuções antigas, que devem ser avaliados antes de qualquer limpeza manual; não excluí-los automaticamente.

Os testes verificam envio simulado, falha de SMTP, preservação do link na recuperação local opt-in, revogação do token e ausência de `recoveryUrl` em produção mesmo que a variável local esteja ativada, além de expiração e consumo único. Não utilizar contas ou SMTP reais em testes automatizados.

**Atenção:** `created` não comprova recebimento. O `verificationId` identifica um registro cujo token é armazenado apenas como hash; ele não permite reconstruir o link. Em produção, o evento `delivery_failed` é diagnóstico e exige reenvio após correção SMTP ou um fluxo administrativo independente com comprovação da titularidade do e-mail. Nunca considerar o simples acesso ao log prova suficiente da titularidade do endereço.
