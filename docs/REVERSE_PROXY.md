# Reverse proxy under `/wa-akg`

WA-AKG can serve the same build at its root and behind a reverse proxy under `/wa-akg`. The application build must not set Next.js `basePath` or `NEXT_PUBLIC_BASE_PATH`.

Configure the proxy in front of port `43000` with this contract:

- Forward `/wa-akg` and `/wa-akg/*` to the WA-AKG server after removing the `/wa-akg` prefix.
- Set `X-Forwarded-Prefix: /wa-akg` on those requests. Preserve the public `Host` header and set `X-Forwarded-Host` and `X-Forwarded-Proto` to the external host and scheme.
- Forward `/_next/*`, `/favicon.ico`, and any other root-relative static asset paths emitted by Next.js to the same WA-AKG server. The build has no fixed asset prefix so the root-mounted instance can use the same assets.
- Forward `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` to the WA-AKG server as root aliases, while setting `X-Forwarded-Prefix: /wa-akg`; also keep the prefixed `/wa-akg/.well-known/*` variants available.
- Rewrite root-relative `Location` responses from the stripped `/wa-akg` upstream back to `/wa-akg/...` before returning them to the browser, so trailing-slash redirects do not escape the public mount.
- Forward `/wa-akg/api/socket/io` to `/api/socket/io` with WebSocket upgrade headers and keep-alive support.
- Set `BASE_URL` and `NEXTAUTH_URL` to the public origin used by the deployment (for example the HTTPS ngrok origin). Localhost origins remain accepted for the local URLs.
- When TLS terminates at ngrok before the local listener, set `X-Forwarded-Proto: https` for the configured public hostname. OAuth consent POSTs compare the browser `Origin` with this reconstructed public origin.
- For multiple application replicas, enable `SOCKET_IO_DISTRIBUTED=true` and configure the same `rediss://` Redis endpoint and `SOCKET_IO_REDIS_KEY` on every replica. The proxy must use sticky sessions for the Socket.IO polling handshake, or the clients must be configured to use WebSocket-only transport. Redis must be private, authenticated, TLS-protected and ACL-restricted; the adapter does not encrypt or authenticate pub/sub messages itself.
- The MCP Streamable HTTP transport is intentionally process-local. A proxy serving multiple MCP replicas must keep every request carrying the same `Mcp-Session-Id` on the replica that created it (header-based affinity), or expose a single MCP transport replica while scaling the REST/OAuth control plane. A restart requires MCP client re-initialization.
- For the checked-in Compose topology, use `docker compose -f docker-compose.yml -f docker-compose.replicas.yml up -d --scale app=2` only with a Redis URL configured and a reverse proxy attached to `wa-akg-network`; the replica overlay removes the single-host-port binding. Run the migration profile before starting replicas. The `WhatsAppSessionLease` table gives each Baileys worker an expiring ownership lease and fencing token; a replica that cannot renew its lease stops the local socket. Verify the migration and lease telemetry before scaling sessions.

The proxy must replace client-supplied `X-Forwarded-Prefix`, `X-Forwarded-Host` and `X-Forwarded-Proto` values with trusted values. These headers control generated navigation, API, authentication, media, OAuth and Socket.IO URLs, as well as redirect origins.

The proxy configuration is external to this repository. A successful application build does not verify that the proxy or ngrok tunnel implements this contract.
