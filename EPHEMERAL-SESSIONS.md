# Ephemeral workshop sessions

Manual **End Session & Delete Data** is the primary cleanup path. It closes the
workshop transactionally and starts trusted backend cleanup after the HTTP
response. A separate durable worker retries interrupted jobs and expires abandoned
workshops. Expiry defaults to **four hours from creation**; pause, extend, stage
changes and reconnection never move it. Configure `WORKSHOP_RETENTION_HOURS` (a
positive number, at most 168). Requests and Firestore reads deny expired sessions
without waiting for a sweep.

## Local operation

Use the existing `.env.local` demo emulator settings. Run emulators, seed the
facilitator, start Next, and also run `npm run cleanup`. The worker checks every
minute; `npm run cleanup -- --once` performs one sweep. There is no public scheduler
endpoint. A worker outage delays deletion but never reopens an ended/expired room.

Admission uses 60 independent transaction-protected seats. A Firebase anonymous
UID occupies one seat, including reconnections. A new browser/cleared storage is a
new identity, not proof of a different human. Only anonymous identities join as
participants. Facilitators retain their separate authorized accounts.

There is no lifetime or hourly workshop creation quota. Request throttles remain.
Each new workshop has a fresh document tree and code. A keyed permutation of an
application configuration counter avoids reusing deleted join codes without
archiving workshop records. The code space extends with an epoch prefix; ordinary
codes remain six characters. Preserve `configuration/joinCodes` as application
configuration. Resetting that configuration resets the code sequence.

## Deletion and verification

The close transaction invalidates the join mapping, marks the session closing,
and creates a backend-only cleanup job. Every admitted mutation checks lifecycle
inside its transaction. The owner must still hold the facilitator claim to start,
inspect or retry cleanup. Origin checks and explicit confirmation apply. Client
Firestore writes and all direct Storage access remain denied.

Cleanup deletes all session descendants (including seats, attendance, votes,
submissions and upload operations), embedded results, code mappings, session abuse
records and every object beneath `sessions/<id>/`. It deletes anonymous Auth
accounts and identity/rate-limit records when no other active membership needs
them. Linking a provider after anonymous admission does not exempt the temporary
participant identity from deletion; a facilitator claim does. Shared identities
survive until their final session is cleaned. Abandoned
anonymous sign-ups are swept after the configured lifetime. Facilitator accounts,
authorization and application configuration survive.

The job captures the member IDs before deleting the tree so a crash cannot lose
the information required to finish Auth cleanup. This list is temporary, never an
archive. Worker leases, idempotent deletes and backoff support safe repeated work.
Completion requires verification that the session, descendants, code mappings,
identity references, session limits and Storage prefix are empty. The job is
removed last. A signed, owner-bound cleanup ticket lets the browser verify after
that removal; the ticket uses tab-scoped session storage, not persistent local
storage. There is no permanent completion/history record. Failed jobs keep
only the state needed to finish and never claim success. The facilitator home
screen lists only that owner’s unfinished jobs, including automatic expiry
failures, so cleanup remains discoverable after closing the original tab.

## In-flight uploads and crash recovery

Uploads register an operation transactionally before touching Storage. Each uses
a unique path, a single non-resumable write, generation-zero preconditions and
**disabled SDK retries**. A completed object establishes that this sole write
landed, even if its HTTP response was lost. Closing prevents its later submission
transaction from committing. Cleanup can reconcile that landed operation and
remove its object.

An operation with **no object and an unknown writer outcome blocks completion**.
A lease timeout is not evidence that a write stopped. Normal requests release the
operation after their Storage work settles. A killed upload process or uncertain
Storage timeout can require operator recovery; ordinary secure retry does not
silently discard the evidence.

For that exceptional case:

1. Keep the session closed. Stop/drain **all** upload-serving processes and disable
   their restart/autoscaling. Stop the cleaner during reconciliation.
2. Establish through the hosting/storage runtime that all previously issued
   Storage writes have settled. Waiting a fixed time alone is not proof.
3. Only then run the trusted Admin CLI with the same environment:
   `WORKSHOP_UPLOAD_WRITERS_QUIESCED=true node --env-file=.env.local --import tsx scripts/reconcile-uploads.ts SESSION_ID --writers-stopped-and-storage-settled`
4. Inspect the verified result, restart the app/worker, and retry any remaining
   cleanup failure. The CLI refuses active sessions and unexpected object paths.

The flags are an operator attestation, not an automatic proof of infrastructure
quiescence. Production needs a hosting-specific drain procedure before this
exceptional recovery can be treated as operationally ready. Never expose this
CLI as a participant or facilitator HTTP action.

## Privacy and production configuration risks

No production project, scheduler, billing or paid service has been created or
connected. Before any separately approved deployment:

- Package the worker with its `tsx` runtime (or compile it before release); an
  install that omits development dependencies cannot run the source CLI unchanged.
- Run the worker continuously with a supervised restart policy and least-privilege
  Admin access to Firestore, Auth deletion and the designated Storage bucket.
- Configure a random `CLEANUP_TICKET_SECRET` of at least 32 characters. Rotating it
  invalidates already-issued browser tickets; existing jobs remain owner-readable.
- Review Firestore PITR, scheduled backups, exports, cross-project copies and
  log sinks. Disable retention that conflicts with ephemeral deletion. Firestore
  TTL cannot delete descendants or Storage objects. Existing retained backups
  cannot be proven erased by this application.
- Disable Storage soft delete and versioning, and remove incompatible retention
  policies/holds. Cleanup checks bucket metadata outside emulators and refuses to
  complete with soft delete, versioning or a retention policy. Review existing
  noncurrent/soft-deleted objects separately before enabling the platform.
- Set `WORKSHOP_PRIVACY_REVIEWED=true` **only after** the actual infrastructure
  review. This is an operator attestation for settings the app cannot verify,
  not a substitute for checking backups or provider retention policies.
- Verify Firebase Auth signup/IP quotas for consecutive 60-person workshops on
  shared venue Wi-Fi. Deleting participant accounts means the next workshop may
  need new anonymous sign-ups; emulators do not validate production quotas.
- Exclude bodies, image bytes, prompts, nicknames, tokens and cookie headers from
  application/proxy/error logs. App errors suppress raw backend messages, but
  provider access/audit logs may still contain identifiers/IP addresses. Review
  their access, retention, exports and contractual deletion limits.
- Use synthetic content in tests/screenshots/traces. Emulator debug logs and
  local test artifacts are not suitable storage for real workshop content.
- Browser drafts carry an expiry and are purged on return to the app; closed
  workshop views clear local pointers and data. Offline/closed browsers cannot be
  remotely erased. Images already downloaded, screenshots, clipboard contents and
  data sent to external AI services are outside platform deletion control.

“Cleanup Complete” means verified deletion from the application's active stores,
subject to the reviewed infrastructure configuration. It cannot certify physical
media erasure or deletion from external services/devices. No results archive or
permanent participant audit trail is implemented.

This implementation targets a fresh environment. A pre-existing installation
would require a separately reviewed migration of legacy memberships, retention
and historical backups before adopting these guarantees.

## Validation commands

- `npm run test`
- `npm run test:rules`
- `npm run test:e2e`
- `npm run test:ephemeral`
- `npm run typecheck`
- `npm run build`
- `npm run format:check`

Stop the independent cleanup worker while running the deterministic fault-injection
suite; that suite drives its own sweeps and worker leases. Restart the worker
afterward. The app and all three emulators must already be running.

The ephemeral integration test is restricted to demo emulators and uses real
backend requests plus Admin fault-injection fixtures. It exercises two successive
60-person workshops, capacity overflow, reconnections, complete uploads/votes,
cleanup, shared identities, concurrent cleaners, injected failures, process-crash
recovery, expiry and anonymous-account cleanup. Test-only hooks are never exposed
through API inputs. See the validation report for actual results and limitations.
