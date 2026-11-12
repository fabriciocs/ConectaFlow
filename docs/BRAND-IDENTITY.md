# Identidade ConectaFlow — versão 0.2

**Status:** identidade provisória de interface e plugin. Antes do lançamento público, verificar marca registrada e domínio. A licença do projeto e atribuições de terceiros permanecem intactas.

## Posicionamento

ConectaFlow oferece uma interface para conectar sessões de mensagens, automações e equipes com autenticação, APIs e recursos MCP. Não é um produto oficial do WhatsApp ou da Meta.

## Sistema visual

- **Marca:** um C aberto representa conexão; duas travessas paralelas simbolizam fluxo; o ponto final indica a entrega da mensagem.
- **Cores:** tinta profunda `#0D3033`, verde-fluxo `#087F76`, lima `#BBEB68`, água `#55D6C2` e fundo claro `#F6F7EF`.
- **Tipografia:** Geist para interface; SVGs usam família sans-serif de sistema para portabilidade. Jamais depender da tipografia para reconhecer o ícone.
- **Tom:** objetivo e claro; não prometer recursos não verificados; não inserir depoimentos ou resultados inventados.
- **Raio:** 12–16px em componentes; raio expandido somente em destaque de marca.
- **Acessibilidade:** marca sempre com texto alternativo; contraste mínimo WCAG AA; foco visível; efeitos opcionais respeitando movimento reduzido.

## Arquivos canônicos

| Asset | Uso |
| --- | --- |
| `public/brand/conectaflow-mark.svg` | Marca quadrada, aplicação e dashboard |
| `public/brand/conectaflow-wordmark.svg` | Assinatura horizontal |
| `public/brand/conectaflow-favicon.svg` | Favicon vetorial |
| `public/brand/conectaflow-icon-192.png` / `-512.png` | Ícones PWA |
| `public/brand/conectaflow-social.svg` / `.png` | Prévia social 1200 × 630 |

O manifesto do plugin declara `brandColor`, `composerIcon` e `logo`, usando caminhos relativos a `./assets/`.

Os SVGs são fonte primária. Regenerar PNGs com `node scripts/generate-brand-assets.mjs`. Regenerar o plugin com `powershell.exe -NoProfile -File scripts/build-conectaflow-plugin.ps1`.

## Entrega dos assets conforme o endereço da página

A origem e o prefixo vêm do **URL público efetivamente carregado**, sem `ASSET_CDN_URL`, `assetPrefix` ou configuração de origem de imagens. Os caminhos internos são root-relative e o navegador usa automaticamente a mesma origem da página.

| Página aberta | Caminho do logo |
| --- | --- |
| `http://localhost:43000/auth/login` | `/brand/conectaflow-mark.svg` |
| `http://localhost:8080/wa-akg/auth/login` | `/wa-akg/brand/conectaflow-mark.svg` |
| `https://seu-tunel.ngrok-free.dev/wa-akg/dashboard` | `/wa-akg/brand/conectaflow-mark.svg` |

- **Navegador:** usa o caminho da página (`document.location.pathname`) para descobrir o prefixo real, mesmo quando a informação passada pelo proxy está ausente ou desatualizada. O contexto dos logos e links de favicon/manifesto é reconciliado após a hidratação.
- **Renderização no servidor e crawlers:** se o proxy remove o prefixo público antes de encaminhar ao Next.js (como `handle_path` do Caddy), **deve** encaminhar `X-Forwarded-Prefix` com o prefixo que foi removido. Sem informação da rota original, o servidor não pode reconstruir o URL público para SSR, PWA e metadados Open Graph. Isso é contexto por requisição, não configuração da origem dos assets.
- **CDN/reverse proxy:** se a página for carregada através dele, os recursos são buscados na mesma origem e no prefixo da página. O CDN/proxy deve encaminhar as rotas correspondentes a `/brand/*`, `/manifest.webmanifest` e demais assets. URLs absolutas de imagens personalizadas permanecem intactas.
- **Favicon legado:** `public/favicon.ico` é um alias ICO da marca atual para configurações persistidas que ainda apontam para `/favicon.ico`; a URL também recebe o prefixo público no navegador.
- **Manifesto PWA:** `src/lib/webmanifest.ts` gera o conteúdo e `src/app/manifest.webmanifest/route.ts` publica o endpoint. A rota explícita evita a injeção automática de `href="/manifest.webmanifest"` pela convenção de arquivo do Next.js, permitindo ao layout fornecer o link com o prefixo real. O `src/proxy.ts` mantém essa rota pública.
- **Mídia privada:** continua em `/api/media/...` com autenticação/autorização; jamais expor `data/media` num CDN público.
- **Bundles Next.js:** `/_next/static/*` é gerado pelo Next.js sem `basePath` de build. O proxy precisa manter essa rota acessível na origem pública; não é possível reescrever com segurança os bundles já gerados apenas pelo resolvedor de logos.
- **Validação:** testar HTTP 200 e MIME correto de logo, favicon, manifesto PWA, metadados sociais e arquivos `/_next/static` no mesmo domínio do acesso, com e sem prefixo.

`SystemConfig.logoUrl` e `faviconUrl` conservam o valor original; nunca salvar prefixos derivados de um domínio específico no banco.

## Limites da migração

- Variáveis `WA_AKG_*`, nomes de tabelas, contratos de eventos, URLs persistidas e endpoint `/wa-akg/mcp` são identificadores técnicos de compatibilidade; não renomear sem uma migração validada.
- O pacote MCP mantém temporariamente a URL externa existente; substituir por URL com a nova marca somente depois que o proxy, OAuth issuer, audience e testes de descoberta funcionarem.
- O repositório remoto continua `fabriciocs/WA-AKG`; renomear ou republicar depende de decisão e autorização próprias.
- Não remover licença, histórico e atribuições de código original.
