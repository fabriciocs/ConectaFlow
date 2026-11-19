# WA-AKG contracts v1

These schemas define the normalized boundary between WA-AKG, n8n, workers and
authorized search. They are additive to the current WhatsApp webhook payload;
the adapter that produces them is still pending.

- `event.schema.json` preserves source context while requiring stable identity,
  authorization and evidence status.
- `job.schema.json` defines durable processing state and idempotency inputs.
- `result.schema.json` requires source references, evidence and access scope.

The schemas do not authorize a workflow, publish a worker, apply migrations or
change the existing n8n workflows. Those remain separate gates.
