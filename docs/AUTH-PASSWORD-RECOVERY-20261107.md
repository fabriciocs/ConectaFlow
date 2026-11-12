# E-mail globalmente único e recuperação de senha — 2026-11-07

## Contratos funcionais

- E-mail identifica uma única conta global, independentemente de tenant ou perfil.
- O esquema Prisma já possui User.email com restrição única. O cadastro normaliza o e-mail com trim() e toLowerCase().
- POST /api/auth/register retorna HTTP 409 e código EMAIL_ALREADY_EXISTS se o e-mail já estiver cadastrado. A restrição única no banco protege também contra concorrência (erro P2002). Nenhum novo cadastro é criado no conflito.
- A tela de cadastro apresenta mensagem específica e link para recuperação. O login exibe "Esqueceu sua senha?".
- O endpoint administrativo de criação de usuários também informa conflito HTTP 409 em duplicidade/concorrência, e o script de bootstrap administrativo normaliza o e-mail.
- O proxy permite as páginas públicas /auth/forgot-password, /auth/reset-password e /auth/verify-email, sem exigir sessão antes do fluxo de recuperação ou confirmação.
- POST /api/auth/forgot-password recebe e-mail e retorna resposta pública genérica HTTP 200, para não revelar se existe conta. A operação usa o limitador distribuído existente, com limites por identidade e origem; falha fechada.
- POST /api/auth/reset-password recebe token e nova senha, retornando HTTP 200 no sucesso, 400 em entrada ou token inválido/expirado e 503 em indisponibilidade interna.
- Respostas de recuperação usam Cache-Control: no-store.

## Segurança e integração

O envio reutiliza a infraestrutura já disponível: Resend com RESEND_API_KEY e MAIL_FROM, ou SMTP. BASE_URL ou OAUTH_ISSUER_URL define o domínio público, preservando o subcaminho atrás de proxy. HTTPS é exigido em produção.

Links usam HMAC-SHA256 com AUTH_SECRET e o hash atual da senha, incluindo identificador, expiração e nonce aleatório. Expiram após 30 minutos. A alteração usa comparação e atualização atômica do hash, de modo que dois usos concorrentes não concluam ambos; links anteriores deixam de funcionar depois da troca. O fluxo não exige migração Prisma.

Nenhum link, senha, token ou e-mail é enviado para logs de erro. A mensagem pública de solicitação permanece genérica inclusive em falhas de entrega. Em caso de falha, o operador precisa verificar o transportador.

## Validação

Executar testes direcionados de assinatura/expiração/replay, cadastro duplicado e corrida, TypeScript e ESLint. Antes de publicar, realizar um ensaio de integração com e-mail de teste para cadastro, recuperação e login; conferir envio por Resend/SMTP e navegação por subcaminho.

A recuperação invalida o link após a mudança, mas **não revoga automaticamente sessões JWT, tokens OAuth ou chaves de API previamente emitidos**. A invalidação abrangente dessas credenciais exige uma alteração específica com análise de compatibilidade.

Não reiniciar serviços, modificar credenciais, aplicar mudanças em produção, enviar e-mails reais de teste ou fazer push implicitamente.
