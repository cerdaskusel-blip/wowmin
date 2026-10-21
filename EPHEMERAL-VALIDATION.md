> Historical report for the previous automatic-cleanup design. Current behavior and results: [MANUAL-DELETION-VALIDATION.md](MANUAL-DELETION-VALIDATION.md). Do not use this report as current deployment instructions.

# WOW #1 ephemeral sessions — validation report

Implementation date: 21 October 2026. All execution used local `demo-wow` Firebase
emulators and a locally built Next.js application. No production project was
created or connected, no deployment occurred, and no paid services were enabled.

## Implemented behavior

- Maximum 60 authenticated anonymous participant identities per session; repeat
  joins reuse the reserved seat. A separate browser identity is a separate seat.
- Independent sequential workshops without an hourly/lifetime workshop quota.
  Fresh, non-reused join codes derive from application configuration, not an archive.
- Manual confirmed termination closes joining, uploads, voting and reads
  transactionally. Four-hour expiry from creation is the configurable fallback.
- Trusted, durable cleanup jobs delete Firestore descendants, code mappings,
  session rate limits, Storage objects and eligible temporary Auth identities.
- Cleanup verifies deletion before removing its final job record or reporting
  success. Partial failure retains retry information, never workshop history.
- Owner-protected failure/retry screens and unfinished-job discovery on the
  facilitator home page survive loss of the original workshop tab.
- Facilitator authorization and application configuration remain intact.

## Verification results

| Check                                    | Result                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Optimized Next.js build                  | Passed                                                                                                                |
| TypeScript and formatting                | Passed                                                                                                                |
| Unit tests                               | 5 passed                                                                                                              |
| Firestore / Storage rules                | 30 authorization checks passed                                                                                        |
| Two consecutive 60-participant workshops | Passed; 120 submissions and 120 votes in total                                                                        |
| Capacity and reconnects                  | Each round admitted 60 of 61 simultaneous entrants; all 60 reconnects reused their seats                              |
| Deletion verification                    | Both session trees, images, votes/results, related records and eligible Auth accounts absent                          |
| Concurrent termination and cleaners      | Passed; closed sessions cannot accept later joins, uploads, votes or image reads                                      |
| Session isolation                        | Passed; a shared identity remains valid for another active workshop                                                   |
| Failure recovery                         | Storage/Firestore phase failures, Auth deletion failure, orphan-object verification and killed-worker recovery passed |
| Expiry safeguard                         | Immediate access denial and unattended sweep passed; default four hours and configurable retention validated          |
| Cleanup authorization                    | Participants and unrelated facilitators cannot end, inspect, list or retry another owner’s cleanup                    |
| Trusted reconciliation CLI               | Refuses missing attestation; verified deletion succeeds for a proven quiesced synthetic operation                     |
| Browser regression                       | All 9 scenarios covered by passing full/targeted checks                                                               |
| Accessibility                            | Zero axe violations in 12 audited views; keyboard focus checks passed                                                 |

The last full browser run passed seven scenarios. Its capacity fixture encountered
an Auth emulator socket reset during account provisioning, and its live workshop
scenario exposed the delayed-moderation dialog race. After correction, targeted
capacity and submission-recovery checks passed, followed by the deterministic
live-workshop regression. The fixture retries only reset Auth signup sockets;
workshop mutation requests and votes are not automatically retried by the tests.
This is passing coverage across full and targeted runs, not a claim that the last
full-suite invocation exited successfully.

The two admission-plus-reconnection batches took **6.178 seconds** and **6.416
seconds** locally. Each workshop used 60 concurrent real API uploads, sequential
facilitator approvals, 60 concurrent votes and a winner reveal before deletion.
Images were synthetic 64×64 PNG fixtures processed by the real upload pipeline.
The browser suite separately exercises a 50-sticker gallery and projector layouts
at 1920×1080 and 1366×768. These are functional concurrency checks, not a production
load benchmark.

Additional checks cover a delayed Storage writer, a leftover image preventing
completion, repeated cleanup calls, expired worker-lease takeover, deletion after
the session document tree has already disappeared, provider linking after
anonymous admission, preservation of facilitator authorization, and abandoned
anonymous-account cleanup. Backend fault hooks are not exposed through API inputs.

The UI review covers explicit destructive confirmation, keyboard focus,
participant draft removal, fresh-session entry, pending cleanup discovery,
failure/retry behavior and the absence of completed-workshop history. During
regression testing, the shared home link’s accessible name was corrected and a
stale moderation response was prevented from reopening a dismissed dialog.

Final synthetic-fixture cleanup verified **zero sessions, code mappings, cleanup
jobs, identity reference records and session Storage objects**. Facilitator
authorization and the join-code configuration remained intact.

## Important limits and outstanding production work

1. **Unknown upload outcomes:** a crashed upload with no completed object blocks
   cleanup. It is never resolved by a lease timeout alone. Normal landed writes
   reconcile automatically; the exceptional absent-object case requires trusted
   operator confirmation that all writers have stopped and Storage requests have
   settled. The local recovery CLI was tested with a quiesced synthetic operation.
   A real hosting-specific drain procedure still needs to be established.
2. **Infrastructure retention:** actual production Firestore backups, PITR,
   exports, Storage soft delete/versioning/holds and log sinks were not inspected
   because no production project was authorized. Cleanup checks bucket metadata
   and requires the documented privacy-review attestation outside emulators.
   Neither that attestation nor emulator tests establish deletion from historical
   backups or physical media.
3. **Worker operations:** production packaging must include the worker runtime,
   supervision, least-privilege credentials, a signing secret, and monitoring of
   failed/stale jobs. Configure alerts for unverified cleanup; retries alone do
   not resolve permanent permission failures or unknown writers.
4. **Device and third-party copies:** an offline browser, downloaded sticker,
   screenshot, clipboard or external AI account cannot be remotely erased by this
   platform. Browser drafts are cleared on observed closure and expiry/return.
5. **Load and accessibility:** synthetic API users and Chromium tests do not
   replace a rehearsal with 60 real devices, venue Wi-Fi, external AI sign-ins,
   physical projector/QR scanning or assistive-technology users. Verify anonymous
   signup/IP quotas for consecutive 60-person workshops sharing venue Wi-Fi.
6. **Migration:** this implementation is for a fresh environment. A legacy live
   installation would need an explicitly reviewed migration for old identities,
   memberships, retained objects and backups.

See [EPHEMERAL-SESSIONS.md](EPHEMERAL-SESSIONS.md) for configuration, lifecycle,
privacy review and the exceptional upload recovery procedure. Deployment remains
subject to separate explicit approval.
