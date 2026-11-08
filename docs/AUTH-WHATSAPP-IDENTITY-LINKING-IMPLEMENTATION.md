# WhatsApp identity linking — implementation status

**Branch:** `codex/auth-whatsapp-identity-linking-20261108`
**State:** `IMPLEMENTED` for additive persistence and the gated browser link lifecycle; `NOT_VERIFIED` pending generated Prisma client and runtime validation. The feature flag defaults to disabled.

## Implemented in this slice

- Added `ChannelIdentityLink` and `ChannelLinkChallenge` with additive MySQL DDL. The migration source was added but not applied to any database.
- Added a 256-bit random, ten-minute challenge. Only its SHA-256 token hash is persisted. JID subjects are restricted to canonical direct phone JIDs and stored as HMAC-SHA-256 using a dedicated key.
- The challenge token travels in the URL fragment, is removed from browser history after page load, and is submitted only after explicit confirmation; the fragment is not sent in HTTP requests or referrers.
- Challenge issuance loads the receiving WhatsApp session and tenant on the server, requires a connected session and active tenant, revokes earlier pending challenges for the same subject, and records an opaque audit event.
- A new exact command (`vincular` / `link account`) in a direct chat emits the challenge and sends the configured HTTPS link over that receiving Baileys session. Group, broadcast, status, and self-authored messages are excluded. This path is still gated by `CHANNEL_IDENTITY_LINKING_ENABLED=false` by default.
- Link completion requires an Auth.js browser session, exact configured `BASE_URL`/`OAUTH_ISSUER_URL` origin match, active membership in the challenge tenant, a one-time compare-and-set consume, and a serializable transaction. GET never consumes a challenge.
- Added owner-only link listing and revocation by selected active tenant, plus a confirmation page with no third-party resources, noindex metadata, and `no-referrer` policy.
- `CHANNEL_IDENTITY_LINKING_ENABLED` defaults to `false`, and the embedded inbound path requires `CHANNEL_IDENTITY_HMAC_KEY` plus the configured public HTTPS URL. The optional internal HTTP challenge endpoint additionally requires `WA_AKG_CHANNEL_LINK_TOKEN`.

## Gates and limits

| Gate | State | Evidence / remaining work |
|---|---|---|
| G0 discovery | PARTIAL | Session-bound tenant, inbound receipt, and direct-chat command path inspected. Real connector/JID variants remain unverified; unresolved LID senders are intentionally rejected. |
| G1 design | PARTIAL | Auth.js session + existing active tenant membership selected. Account ownership model, confirmation back through WhatsApp, expiry/retention policy, and cross-tenant policy still need product decisions. |
| G2 persistence | PARTIAL | `prisma validate` passed. Client generation failed with Windows `EPERM` replacing the query-engine DLL. Six Node processes associated with this checkout were present, but the DLL lock owner was not identified; none were stopped. Migration SQL review is incomplete and it was not applied. |
| G3 linking lifecycle | IMPLEMENTED / NOT VERIFIED | Challenge issue and outbound DM, completion, list, and revoke handlers added. No HTTP/concurrency/security or real WhatsApp verification run. |
| G4 private-operation enforcement | BLOCKED | Resolver and resource owner/grant helper exist, but no private operation in the bot, webhook, worker, MCP, or API consumes them yet. A link still authorizes no private action. |
| G5 verification | PARTIAL | TypeScript transpile syntax check passed for 12 touched TS/TSX files with no diagnostics. Full typecheck and ESLint did not complete; tests and live WhatsApp flow were not run. |
| G6 activation | DEFERRED | Feature flag remains false; no rollout, migration, or user communication. |

## Required next steps before activation

1. Generate and validate Prisma Client; inspect the generated migration SQL and verify the unique/index/FK contract offline.
2. Add focused tests for canonicalization, token secrecy, tenant mismatch, GET non-consumption, replay/concurrency, revocation, and generic failures.
3. Verify the wired inbound command/outbound path and Baileys JID behavior on supported direct chats in an authorized representative environment.
4. Decide whether channel-side confirmation is mandatory and define retention/expiry and account ownership policy.
5. Integrate a central principal/capability check into a specifically approved private read pilot before expanding to other tools or routes.
6. Reconcile the pre-existing MySQL schema drift before applying any migration. No database migration is authorized or performed by this work.
