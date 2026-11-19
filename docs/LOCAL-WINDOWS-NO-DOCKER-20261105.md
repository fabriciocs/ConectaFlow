# Operação local Windows — sem Docker (05/11/2026)

**Escopo:** WA-AKG em `C:\repos\WA-AKG`, PowerShell 5.1, Node 24.22, MySQL80 nativo em 127.0.0.1:3306. Não utilizar Docker, Playwright, nem migrar automaticamente o banco existente.

## Comandos

Execute no PowerShell 5.1 a partir da raiz do projeto:

```powershell
.\scripts\Inspect-Local-NoDocker.ps1
.\scripts\Invoke-LocalNoDockerGates.ps1
.\scripts\Start-WA-AKG-LocalSafe.ps1 -Port 43000
.\scripts\Test-WA-AKG-LocalSafe.ps1 -Port 43000
```

A aplicação responde em `http://127.0.0.1:43000`. O comando de inicialização exige porta livre e build existente, inicia somente o seu próprio processo Node e grava stdout/stderr separados em `.remote-desktop/sessions/wa-akg-local-safe-*/`. **Não** encerra o processo que já ocupa uma porta. O script de parada exige o PID exato e confirma que o processo é o WA-AKG local:

```powershell
.\scripts\Stop-WA-AKG-LocalOwned.ps1 -Port 43000 -ExpectedPid <PID_CONFIRMADO>
```

## Modo local seguro

`WA_AKG_SAFE_LOCAL_MODE=true`, aplicado só ao processo lançado pelo script: escuta em `127.0.0.1`; não restaura automaticamente sessões WhatsApp, não inicia worker de saída, scheduler, telemetria nem adaptador Redis distribuído. O MCP HTTP utiliza o backend local via `WA_AKG_API_BASE_URL` e mantém autenticação OAuth. Este modo protege a inicialização automática, **não** torna a interface somente leitura: usuários autenticados ainda podem executar ações explicitamente solicitadas na UI. Não publicar esta porta na internet.

As variáveis sensíveis e credenciais ficam no arquivo `.env` preexistente, sem ser copiadas para documentação. O processo só sobrescreve temporariamente a origem pública e as flags operacionais; não altera `.env`.

## Testes nativos em schema separado

```powershell
node --env-file=.env scripts/integration/run-native-isolation.mjs --create-isolated
```

A execução verifica que `DATABASE_URL` aponta para o banco local `wa_akg`, cria um **novo schema exclusivo** de nome `wa_akg_sandbox_native_*`, aplica somente nele Prisma V2 e executa a fixture sintética de tenant, API key, REST, mídia, OAuth Authorization Code + PKCE S256 e QR. Não executa `migrate` nem `db push` no banco real. Não apaga o schema de teste; ele permanece para auditoria. Em caso de ausência de privilégio de criar schema, o comando falha sem tentar elevar privilégios.

## Regressões e verificação

`Invoke-LocalNoDockerGates.ps1` executa TypeScript, lint, testes unitários, testes de bootstrap Prisma, MCP, `git diff --check` e a auditoria do build de produção que verifica que mídia privada não entra em `.next`. Armazena logs, resultados e SHA-256 separados por execução. `Test-WA-AKG-LocalSafe.ps1` e `scripts/integration/http-local-contract.mjs 43000` verificam rotas HTTP anônimas, OAuth Discovery, compatibilidade de `/authorize` e proteção do MCP/QR.

## Evidências e limites

- Original `wa_akg`: inspeção read-only identificou 43 tabelas, 14 migrações V1 e zero erros de checksum.
- Integração sem Docker: 39 cenários aprovados no schema `wa_akg_sandbox_native_mw2z38ql_3a78ab`. Evidências em `.remote-desktop/sessions/native-isolation-wa_akg_sandbox_native_mw2z38ql_3a78ab/`.
- Build e testes: VERIFIED em `.remote-desktop/sessions/local-nodocker-gates-20261105-003332/`: TypeScript, lint, testes, Prisma, MCP, Git diff e auditoria privada do Next.js. Contrato HTTP 8/8 VERIFIED; `/authorize` redireciona 307 após a correção.
- Servidor local seguro verificado em `127.0.0.1:43000`: launcher Node PID 17032, listener HTTP Node PID 39760 (filho do launcher), resultados em `.remote-desktop/sessions/wa-akg-local-safe-20261105-003953/` e `.remote-desktop/sessions/local-safe-http-20261105-004035/`. Verifique PIDs novamente antes de encerrar processos.
- Não foram verificadas conexões reais de WhatsApp, MFA/TOTP real, credenciais de terceiros, migração de bancos existentes ou duas réplicas Next completas. Tais gates permanecem separados de build e testes locais.
- Não executar push, merge, deploy ou exposição pública sem autorização explícita e sem finalizar os gates de segurança.

## OAuth em túnel preexistente

Quando houver autorização para usar um túnel já ativo, `Start-WA-AKG-LocalSafe.ps1 -PublicBaseUrl https://dominio.example/wa-akg` anuncia essa origem no OAuth. A opção não cria túnel, não abre portas, não altera `.env` e mantém o modo seguro e a escuta em loopback. Sem a opção, a descoberta continua local. O domínio deve corresponder ao túnel efetivamente ativo; ao mudar de domínio, reconecte o cliente OAuth.
