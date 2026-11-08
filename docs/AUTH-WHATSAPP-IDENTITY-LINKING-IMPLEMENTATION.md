# WhatsApp identity linking — implementation status

**Branch:** `codex/auth-whatsapp-identity-linking-20261108`
**State:** `IMPLEMENTED` for additive persistence and the gated browser link lifecycle; `NOT_VERIFIED` pending generated Prisma client and runtime validation. The feature flag defaults to disabled.

## Implemented in this slice

- Added `ChannelIdentityLink` and `ChannelLinkChallenge` with additive MySQL DDL. The migration source was added but not applied to any database.
- Added a 256-bit random, ten-minute challenge. Only its SHA-256 token hash is persisted. JID subjects are restricted to canonical direct phone JIDs and stored as HMAC-SHA-256 using a dedicated key.
- Challenge issuance loads the receiving WhatsApp session and tenant on the server, requires a connected session and active tenant, revokes earlier pending challenges for the same subject, and records an opaque audit event.
- Link completion requires an Auth.js browser session, exact configured `BASE_URL`/`OAUTH_ISSUER_URL` origin match, active membership in the challenge tenant, a one-time compare-and-set consume, and a serializable transaction. GET never consumes a challenge.
- Added owner-only link listing and revocation by selected active tenant, plus a confirmation page with no third-party resources, noindex metadata, and `no-referrer` policy.
- `CHANNEL_IDENTITY_LINKING_ENABLED` defaults to `false`. Challenge issuance also requires separate `WA_AKG_CHANNEL_LINK_TOKEN` and `CHANNEL_IDENTITY_HMAC_KEY` configuration.

## Gates and limits

| Gate | State | Evidence / remaining work |
|---|---|---|
| G0 discovery | PARTIAL | Session-bound tenant and inbound receipt path inspected. Full connector-specific verification and identity canonicalization remain incomplete; unresolved LID senders are intentionally rejected. |
| G1 design | PARTIAL | Auth.js session + existing active tenant membership selected. Account ownership model, confirmation back through WhatsApp, expiry/retention policy, and cross-tenant policy still need product decisions. |
| G2 persistence | PARTIAL | `prisma validate` passed. Client generation failed with Windows `EPERM` replacing the query-engine DLL; migration SQL review is incomplete and it was not applied. |
| G3 linking lifecycle | IMPLEMENTED / NOT VERIFIED | Challenge, completion, list, and revoke handlers added. No HTTP/concurrency/security verification run. |
| G4 private-operation enforcement | BLOCKED | Existing bot commands, webhooks, workers, MCP, and private-resource operations do not yet receive this link as a principal/capability. No private action is authorized by a link in this slice. |
| G5 verification | NOT RUN | No tests or live WhatsApp flow run. |
| G6 activation | DEFERRED | Feature flag remains false; no rollout, migration, or user communication. |

## Required next steps before activation

1. Generate and validate Prisma Client; inspect the generated migration SQL and verify the unique/index/FK contract offline.
2. Add focused tests for canonicalization, token secrecy, tenant mismatch, GET non-consumption, replay/concurrency, revocation, and generic failures.
3. Wire a trusted inbound command/intent to challenge issuance and outbound delivery using a configured HTTPS origin; verify Baileys JID behavior on supported direct chats.
4. Decide whether channel-side confirmation is mandatory and define retention/expiry and account ownership policy.
5. Integrate a central principal/capability check into a specifically approved private read pilot before expanding to other tools or routes.
6. Reconcile the pre-existing MySQL schema drift before applying any migration. No database migration is authorized or performed by this work.
