# WA-AKG — Recuperação de leases WhatsApp na inicialização

## Diagnóstico (07/11/2026)

O carregamento inicial das sessões Baileys tenta adquirir um lease distribuído com validade de 90 segundos. A linha é identificada pelo `sessionId` e protege contra múltiplas réplicas usando a mesma sessão. Quando o banco já contém lease de outra execução, o fluxo anterior tentava `create()`, capturava `P2002`, ignorava a sessão e não agendava nova tentativa. O Prisma emitia o erro de chave primária mesmo quando a exceção era tratada.

Leituras somente de diagnóstico: as sessões `001` e `nemsxv` tinham leases expirados e continuavam marcadas como `CONNECTED`. Nenhum registro de lease foi apagado ou alterado pelo diagnóstico.

## Ajuste

- Em caso de concorrência, usar `createMany({ skipDuplicates: true })` em vez de `create()`; a proteção de exclusividade permanece no banco.
- Se o lease continuar ocupado durante o carregamento inicial, agendar tentativa para a mesma sessão a cada 30 segundos, com temporizador desreferenciado para não impedir encerramento do processo.
- Antes de tentar novamente, verificar que a sessão ainda existe, pertence ao mesmo tenant/usuário e não está `STOPPED` ou `LOGGED_OUT`. `startSession` revalida as permissões e a aquisição atômica do lease.
- Cancelar tentativas pendentes em `stopSession`, `deleteSession` e `shutdownAll`.
- Se outra réplica continuar proprietária, manter exclusividade e agendar nova tentativa; nunca apagar ou assumir lease que não expirou.
- Não iniciar sessões reais durante os testes unitários.

## Operação e validação

A atualização exige reinício controlado do serviço em momento autorizado e verificação de que sessões válidas são recuperadas, mantendo a garantia de no máximo um worker Baileys por sessão. Não encerrar processos ou excluir leases manualmente. Para diagnóstico somente-leitura, consultar `WhatsAppSessionLease.leaseUntil`, `updatedAt` e os PIDs existentes sem revelar `leaseToken` ou segredos.

Testes focados: leasing existente não expira cedo; retomada de lease vencido; inserção de novo lease sem colisão; cancelamento do retry quando sessão é interrompida. Verificar também TypeScript, lint, execução real após autorização e documentação da alteração.

## Limitações

A tolerância de 30 segundos causa atraso esperado para reassumir sessões após expiração. A disponibilidade de sessão também depende da conectividade MySQL, da elegibilidade de tenant/usuário e da inicialização Baileys. Mesmo testes unitários aprovados não comprovam conexão WhatsApp em produção.
