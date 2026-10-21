# Single-use workshops with manual deletion

Each session is independent, has a fresh join code and admits at most 60 anonymous
participant identities. Reconnection uses the same slot. All workshop functions
remain available. Data is single-use: there is no results archive.

**Padam Semua Data Bengkel** is the only normal deletion trigger. An authenticated
facilitator with the current `facilitator` claim must own the session and explicitly
confirm. Joining, uploading and voting close transactionally before deletion.
The Cloud Run web request performs cleanup synchronously, with no Scheduler,
background worker, public cleanup cron route or automatic retry loop. Status
polling never starts deletion. **Retry cleanup** is another authenticated manual
request and is idempotent. Keep the facilitator screen open until verified success.

The existing four-hour access expiry (from creation, configured by
`WORKSHOP_RETENTION_HOURS`) stays in force. It denies access immediately but does
NOT delete data. The facilitator home lists open and expired owned sessions for
manual deletion, as well as unfinished cleanup attempts. Closing the browser or
forgetting deletion leaves data in Firebase indefinitely. The organizer must
complete deletion after each event. No automated safeguard remains.

## Scope and protection

Only `sessions/<id>/` Storage objects and that session's Firestore tree, votes,
results, code mappings, session rate limits and membership references are removed.
Only anonymous Auth participants whose admission provenance was captured for this
session are eligible for account deletion. An identity needed by another session
survives until its final manual cleanup. Facilitator accounts (including the owner),
provider-linked/email/phone accounts, anonymous accounts that never joined and
unrelated Auth users, Firestore documents and Storage paths are preserved.
If a participant becomes a permanent account, the account survives while their
workshop membership, submission, image and votes are still deleted.

Client writes remain denied by Firestore and Storage rules. The API verifies
Firebase tokens with revocation, checks ownership and origin, validates explicit
confirmation, and uses owner-bound HMAC cleanup tickets. Preserve a random
`CLEANUP_TICKET_SECRET` of at least 32 characters in Secret Manager; no keys belong
in the repository. Cloud Run uses its service identity through ADC.

A temporary, backend-only `cleanupJobs/<id>` record stores deletion progress,
admitted temporary identity IDs and a renewable lease. It enables recovery when a
request fails or is killed. Concurrent manual retries cannot own the same active
lease. A process failure may require waiting for its two-minute lease to expire
before retry. The record is deleted last, after verifying no session descendants,
code mappings, identity references, session limits or Storage objects remain.
Auth deletion is also verified. **Cleanup Complete** never means merely that an
HTTP request returned successfully. Failure retains the minimum state required to
retry, and the session stays closed. The owner can find it again after signing in
on another device; no permanent completion/history record is kept.

Pending jobs from older releases that already captured members without admission
evidence fail closed. A trusted operator must verify surviving original membership
and identity records before repairing that legacy job. Never invent admission
provenance to force deletion or report success.

## Upload recovery and infrastructure privacy

Uploads register an operation before the single non-resumable Storage write,
using unique paths and disabled SDK retries. Cleanup reconciles a landed object.
An unknown writer with no object blocks completion. Time elapsed is not proof
that its write settled. For exceptional recovery, stop and drain all upload writers
and establish that every issued Storage request settled. Then use the trusted
operator CLI with the same project environment and ADC:

```sh
WORKSHOP_UPLOAD_WRITERS_QUIESCED=true node --env-file=.env.local --import tsx scripts/reconcile-uploads.ts SESSION_ID --writers-stopped-and-storage-settled
```

This is a manual operator attestation, never a browser action or scheduled task.
The CLI requires a closing session, a pending cleanup record and in-session paths.
Re-open the facilitator cleanup screen and verify the result. Do not discard
unknown upload operations to bypass verification.

Review Storage soft delete, versioning, retention policies and holds; Firestore
PITR, scheduled backups, exports; provider logs and copies. The backend refuses
successful cleanup if bucket retention remains enabled or the production privacy
review is unattested. Set `WORKSHOP_PRIVACY_REVIEWED=true` only after checking the
actual infrastructure. Active-store deletion does not certify erasure from retained
backups, provider media, external AI services, downloads, screenshots or clipboard.
Avoid logging nicknames, images, tokens or request bodies. An offline browser
cannot be remotely erased; drafts are cleared on return to the app.

Run only the emulators, seed and Next server locally. `npm run test:ephemeral`
checks complete workshops, isolation, failures, races and manual deletion after
expiry. `npm run test:e2e` includes the browser journey through winners and manual
deletion. No worker process is started. See [DEPLOYMENT.md](DEPLOYMENT.md) for
Cloud Run Web + Firebase instructions and remaining operator decisions.
