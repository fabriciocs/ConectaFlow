# Harness determinístico de duas réplicas MCP

Este diretório contém somente testes/scripts. O harness carrega o handler MCP existente e inicia dois processos Node independentes, cada um com seu próprio `Mcp-Session-Id` em memória.

Execute:

```text
node scripts/replica-harness/run.mjs --target C:\repos\WA-AKG
```

Para verificar pré-requisitos sem iniciar serviços:

```text
node scripts/replica-harness/real-preflight.mjs --target C:\repos\WA-AKG
```

O harness usa somente um backend OAuth/API sintético em loopback, tokens fixos de teste e bloqueia qualquer `fetch` externo. Ele prova bearer obrigatório, audience estrita, isolamento entre usuários, isolamento entre processos e ausência de criação implícita de sessões.

O resultado `TESTED` não prova duas réplicas completas de WA-AKG. Essa prova exige duas instâncias Next/Socket.IO, MySQL isolado com migrações, Redis autenticado/TLS, proxy com afinidade Socket.IO e `Mcp-Session-Id`, chave AuthState de teste e telemetria de lease. O preflight permanece somente leitura e retorna `NOT_VERIFIED` enquanto esses pré-requisitos não existirem.
