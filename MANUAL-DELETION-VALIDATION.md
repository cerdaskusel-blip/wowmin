# Manual-only workshop validation

Validated locally on 22 October 2026 (Asia/Singapore). No production resources were
created, modified or deployed. All backend fixtures used `demo-wow` emulators;
no Scheduler, cleanup worker or automatic retry process was running.

## Implemented behavior

- Existing workshop features, 60-identity capacity, reconnection handling, timers,
  moderation, voting rules, gallery and winners remain available.
- The owner uses **Padam Semua Data Bengkel**, confirms a modal, and triggers an
  authenticated, origin-checked backend request. The close transaction denies new
  joins/uploads/votes immediately. The web request performs deletion directly.
- Success is shown only after Storage objects, Firestore descendants, ballots,
  results, code mappings, session limits, references and eligible temporary Auth
  participants have been removed and checked. There is no permanent results archive.
- Admission provenance is captured durably under a lease before deletion. An
  arbitrary UID in a member document alone cannot authorize an Auth deletion.
  Session owners, facilitator-claim users, permanent/provider-linked accounts,
  unrelated users and data outside the session are preserved. Shared temporary
  accounts survive until their final session is manually deleted.
- A partial failure keeps the session closed and its temporary cleanup record
  discoverable by the owner. Status polls only read. Explicit manual retries are
  idempotent and respect the current lease; they also work after browser recovery.
- Four-hour access expiry remains, but never starts deletion. Expired owned
  workshops appear on facilitator home and require the same explicit confirmation.
- Global orphan-account sweeps, worker scripts, npm worker command, worker Docker
  target and worker-specific IAM template were removed. Deployment instructions
  include Cloud Run Web + Firebase and the signing secret only.

## Checks completed

| Check                                    | Result                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Next.js standalone build                 | Passed                                                                                               |
| Web-only Docker build and smoke checks   | Passed; non-root runtime, homepage 200, unauthenticated image 401; no local secrets or worker source |
| TypeScript                               | Passed                                                                                               |
| Unit tests                               | 5 passed                                                                                             |
| Firestore / Storage authorization checks | 30 passed; rules unchanged                                                                           |
| Targeted browser tests                   | 5 passed                                                                                             |
| Manual deletion integration suite        | Passed                                                                                               |
| Formatting and whitespace checks         | Passed                                                                                               |

The browser tests covered the complete create → join → prompt → upload → moderate
→ vote → visible winners → manual delete journey, then directly checked Firestore
absence, Storage absence and deleted participant Auth accounts while the facilitator
survived. Additional scenarios checked cancellation, draft clearing, fresh sessions,
failed-cleanup discovery, safe retry, expiry recovery and protected image/vote APIs.

The backend simulation ran two consecutive 60-participant sessions, each rejecting
an overflow participant, preserving all 60 reconnections, and processing 60 images,
approvals and votes before verified manual deletion. It also checked wrong-owner
and participant denial, confirmation enforcement, repeated calls, isolation,
shared identities, concurrent deletion, upload/vote races, unknown/landed writes,
injected Storage/Firestore/Auth failures, remaining-object verification, process
crash recovery and lease exclusion. Expired data remained until manual confirmation;
unrelated Firestore/Storage data, orphan Auth identities, promoted facilitators and
permanent accounts survived. Legacy pending records without admission evidence failed
closed; retry succeeded only after the trusted test fixture verified and restored
the original admission evidence.

## Remaining operational limits

- Forgotten deletion or retry means indefinite retention. No automatic safeguard
  remains. Anonymous accounts that never joined are outside session cleanup and
  require a separately authorized operator review if removal is desired.
- Hosting's 60-second response limit may interrupt a long cleanup request. Refresh
  status and manually retry; a killed process can hold its lease for up to two
  minutes. Keep the session closed until verification succeeds.
- Unknown in-flight Storage writers require proven settlement and manual operator
  reconciliation. A fixed wait is not proof that an upload cannot land later.
- Production IAM, actual bucket policies, backups/PITR/exports, provider logs,
  Hosting cookie forwarding and production smoke tests remain unverified locally.
  The app refuses bucket-retention conflicts; an operator must review other copies.
  Active-store deletion cannot erase external AI data, downloaded files or backups.
- Provider-linked/permanent accounts are intentionally preserved; only their
  workshop content and session membership are deleted. Facilitator authorization
  and application configuration survive. There is no project-wide delete action.
- Older partially completed jobs without admission evidence fail closed and need
  trusted operator review before retry can complete.
- If an older automatic-cleanup deployment exists, disable its schedule/worker
  through a separately approved infrastructure change before using this version.

Exact deployment commands and review steps: [DEPLOYMENT.md](DEPLOYMENT.md).
