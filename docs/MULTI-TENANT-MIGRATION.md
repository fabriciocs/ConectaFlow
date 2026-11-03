# Multi-tenant persistence foundation

Status: `IMPLEMENTED` for the additive Prisma schema and offline migration SQL; deployment remains `BLOCKED` pending database reconciliation, backup and operational approval.

## Phase 1 scope

This phase adds the persistence vocabulary for tenant isolation without assigning legacy records to a tenant:

- `Tenant`, `TenantMembership`, `TenantInvitation`, and `TenantSettings` support multiple memberships per user.
- `ResourceGrant` represents explicit per-resource grants inside a tenant.
- `ApiCredential` stores only a credential hash and non-secret prefix; the raw bearer value is not persisted here.
- `AuditEvent` records ordinary tenant activity. `AdminAccessEvent` is separate for privileged SUPERADMIN access and must be written by a separately authorized and audited flow.
- Existing tenant-bound models receive nullable `tenantId` fields, tenant relations, and tenant-first indexes. Existing identifiers, links, unique constraints, and the public WhatsApp `Session.sessionId` remain unchanged.

All legacy tenant foreign keys are nullable by design. A null value means “legacy scope not classified yet”; it is not permission to expose the record globally.

## Migration gate

`IMPLEMENTED`: migration SQL was generated offline as `prisma/migrations/20261103190500_additive_multi_tenancy/migration.sql` (8 CREATE TABLE, 71 ALTER TABLE, no DROP). Database deployment is BLOCKED pending reconciliation and recovery verification. Historical note:  The installed Prisma CLI could not be executed in the managed Windows sandbox: the direct offline command remained pending without output, and the remote process tool required approval that is unavailable in this session. The local integration runner subsequently generated the SQL using Prisma 5.22.0 from the baseline schema to this additive schema, without accessing the database.

Required offline command when a functioning local process runner is available:

```text
prisma migrate diff --from-schema-datamodel <baseline-schema-at-8f44b31> --to-schema-datamodel prisma/schema.prisma --script
```

Review the generated script for additive operations only, save it under a new timestamped directory in `prisma/migrations`, and run `prisma validate --schema prisma/schema.prisma` plus a SQL/diff review before any database operation. Do not use `db push`, `migrate deploy`, `migrate reset`, or a real database connection for this phase.

## Safe rollout sequence

1. Generate and review the offline migration without a `DATABASE_URL` value being read or printed.
2. Apply the migration only in an isolated, backed-up environment after an explicit operational approval.
3. Observe null counts for each tenant-bound table. Do not infer ownership from the current user, session name, WhatsApp JID, or SUPERADMIN role.
4. Build an evidence-backed classification report mapping each legacy record to a tenant, with ambiguous and missing ownership separated from safe assignments.
5. Backfill only reviewed rows in small, resumable batches. Record the source evidence, operator, timestamp, and resulting tenant ID in the audit trail.
6. Quarantine orphan or ambiguous records in an access-controlled reconciliation path. Quarantine must deny ordinary tenant enumeration and must not silently attach records to a default tenant.
7. After all consumers enforce tenant context and the reconciliation report is complete, add stricter constraints in a later phase. This phase must not make `tenantId` non-null.

## Current limitations and security boundaries

- Nullable tenant FKs are not hard isolation. Every read/write path must continue to authorize the tenant explicitly; a non-null `tenantId` alone is not an authorization decision.
- Cross-tenant consistency between related legacy rows is not enforced while the fields remain nullable. In particular, session, message, webhook, label, OAuth, broadcast, and lease rows may require coordinated backfill.
- SUPERADMIN global access is not granted by these models. It requires a separate privileged flow, reason, request correlation, outcome, and `AdminAccessEvent` record.
- The schema does not perform a backfill, change existing data, or remove existing relationships.
- No external service, real database, Docker environment, migration deployment, or runtime integration was exercised in this phase.
