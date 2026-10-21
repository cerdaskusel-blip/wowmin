# WOW #1 — The Teacher Sticker Lab

A live, mobile-first, 15-minute creativity workshop for approximately 50 teachers. Built with Next.js, React, TypeScript, Firebase Authentication, Firestore, and Firebase Storage. The app builds image prompts; teachers create images in their own external AI accounts. No image-generation API, selfie capture, or PowerPoint export is included.

## Local development (no deployment)

Requirements: Node.js 22.12+ (validated with Node 24), npm, Java 21, and Chromium for browser tests. Firebase downloads its emulator binaries from `storage.googleapis.com`; that hostname must be allowed by the development environment. Package downloads use `registry.npmjs.org`. Emulator binaries retain the Firebase CLI’s checksum verification.

```sh
cd /workspace/wowmin
npm ci
cp .env.example .env.local # only if .env.local does not already exist
npm run emulators         # leave running in terminal 1
npm run seed              # terminal 2, after emulators report ready
npm run dev               # leave running in terminal 2
```

Open the app on port 3000 on the development machine. Choose **Facilitator studio → Enter local facilitator studio**, then create a session. The seeded account is `host@wow.local` with password `Workshop-local-2026`, strictly for the `demo-wow` local emulator. Open participant views in separate browser profiles or private contexts. Tabs in the same browser profile intentionally share one participant identity.

Emulators bind to loopback, have no production credentials, and lose session data when stopped. Their download and CLI caches live under ignored `.firebase/`. The seeded account can be recreated safely. `npm run seed` never targets a live project. A local QR code only works on the machine serving the app: real participant phones require a reachable, approved hosting origin and real Firebase configuration. Do not expose emulator ports to a public network.

## Workshop run of show

| Stage       | Default time | Teacher experience                                                     | Facilitator action                  |
| ----------- | ------------ | ---------------------------------------------------------------------- | ----------------------------------- |
| Welcome     | 1 min        | Join by QR/code and nickname                                           | Welcome the room; open projector    |
| Your prompt | 2 min        | Choose one of three caption collections, customize, select a style     | Start the prompt stage              |
| Create      | 5 min        | Copy prompt, open ChatGPT/Gemini/Copilot, return with a finished image | Coach and approve incoming stickers |
| Submit      | 3 min        | Upload or replace pending/returned sticker                             | Finish moderation                   |
| Gallery     | 1 min        | View approved stickers                                                 | Review the showcase; open voting    |
| Vote        | 2 min        | Cast one final vote for another creator                                | Close voting and reveal results     |
| Celebrate   | 1 min        | See winners and tied ranks                                             | Celebrate everyone                  |

The facilitator advances stages explicitly, with a confirmation before closing submissions, opening voting, or revealing results. Timers synchronize from a server deadline. **Pause workshop** freezes the clock and server upload/vote acceptance; **Resume workshop** restores the remaining time. **+1 min** extends either a running or paused clock. Manual stage controls can reopen Create/Submit before voting starts; neither stage reopening nor moderation is permitted once voting begins. The facilitator sees live joined/submitted/approved/pending/votes-cast totals and a remaining-stage time budget including the one-minute celebration. At expiry, the server rejects uploads/votes until the facilitator extends or advances; stages do not advance unattended. Uploads are allowed during Create and Submit. Approved submissions cannot be replaced. Moderation locks when voting opens. No new votes are accepted once voting closes. Ties share a rank; zero-vote entries are not declared winners. If no votes are cast, the reveal celebrates the room without inventing a winner.

Participant prompt drafts survive reloads and trips to external AI tools. Resume workshop on the join page validates access to the saved session before offering a return link. Selected upload files stay in memory in the open tab, including across stage transitions and failed requests; after refreshing the page, the participant must choose the file again. No selected-file bytes are persisted in browser storage. Returned submissions remain visible and can be replaced after the host reopens Submit, or restored through the host’s Returned review queue before voting.

Approved stickers, progress, stages, and results synchronize through Firestore listeners. The responsive Live Sticker Wall uses a stable per-room order, nickname/caption search and keyboard-accessible enlarged previews. The projector displays 50 stickers simultaneously instead of cycling one at a time. Top-three competition ranks retain all ties: up to three winners fit on one projector screen; additional tied winners appear on subsequent pages rather than being discarded. Motion respects the operating system’s reduced-motion preference. All fonts are bundled locally.

## Authorization and data protection

- Facilitators sign in through Firebase Authentication and require a trusted `facilitator: true` custom claim to create rooms. Room ownership is checked for host actions. Participants use anonymous Firebase accounts; membership is created through the server after code validation.
- Browsers cannot write directly to Firestore or Storage. Firestore rules restrict reads to active room members, hide other participants’ pending/rejected stickers, and keep individual ballots private. The server uses Firebase Admin credentials and performs its own independent authorization.
- Same-origin checks protect mutation routes. ID tokens are verified, including revocation. An HttpOnly, same-site cookie allows authorized image requests; it is refreshed with the Firebase ID token and cleared on sign-out. Every image request checks current membership and approval state. There are no public image download tokens.
- Images are streamed with a request-size bound, capped at 5 MB / 20 megapixels, decoded as still PNG/JPEG/WebP, resized to at most 1200 × 1200, and re-encoded as WebP. Original bytes and metadata are not saved. Do not upload selfies or student photos: there is no selfie feature or automated face classifier, and the facilitator must reject inappropriate finished submissions.
- Votes use a Firestore transaction: a member may cast exactly one immutable vote, only for an approved sticker by another member, during the active voting window. Reveal aggregation and vote submission both read the session, so concurrent closing cannot admit a late vote. Individual sticker vote counts remain hidden until reveal. Minimal attendance flags expose submitted/voted participation totals, never ballot choices; direct client writes remain denied.
- Server limits include 60 unique anonymous participants per room, 10 join attempts/minute/account, 5 uploads/minute/account (also enforced per session) and 90 actions/minute/account/session. Reconnecting reuses a seat. Sequential workshops have no lifetime or hourly creation cap; request throttling remains. Independent join codes use a keyed configuration counter without retaining historical workshop records. Sessions expire four hours from creation by default (`WORKSHOP_RETENTION_HOURS`). Firebase anonymous-account throttling is an additional defense.
- Anonymous participation is intentionally low friction. “One person” is enforced per Firebase identity/browser profile; it does not establish real-world identity or prevent someone using multiple devices. For a higher-stakes event, add organizer-issued invitations or verified sign-in and deployment-level rate limiting/App Check.

## Validation

Start the emulators, seed the facilitator, and run the app before integration tests.

```sh
npm run typecheck
npm test
npm run build
npm run test:rules
npm run test:e2e
```

Browser tests use `/usr/bin/chromium`; set `CHROMIUM_PATH` for another installation. They exercise separate facilitator/participant/projector contexts, prompt persistence, rejection and replacement, approval, live gallery, voting and tied winners, mobile layout, API access controls, direct Firebase rules, duplicate vote races, and 50 simultaneous joins (with repeat-join deduplication) and the 60-seat capacity limit. Browser tests create emulator-only rooms. The extended UX suite also covers pause/resume/expiry, interrupted uploads and recovery, returned-sticker restoration, session resume, dialog focus, axe accessibility scans, and a full 50-submission/50-vote simulation with 1920×1080 and 1366×768 projector layout checks. Admission uses independent, transaction-protected seat reservations and a minimal attendance collection, avoiding a shared counter write when everyone scans the QR code together. The 50-participant check validates membership concurrency on local emulators, not a production network/load benchmark. Firebase’s Node Firestore transport is pinned via an npm override to patched `@grpc/grpc-js` 1.14.6; recheck that override when upgrading Firebase.

## Connecting a real Firebase project later

No project has been deployed or provisioned by this implementation. Deployment requires explicit approval.

1. Create/select a Firebase project, enable Anonymous and Google authentication, create Firestore and Storage, and authorize the chosen app domain. Storage may require a billing-enabled Firebase plan; no paid image-generation service is used.
2. Replace the public Firebase values in local/hosting configuration. Set `NEXT_PUBLIC_USE_EMULATORS=false`; remove **all** emulator host variables. Set `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, and `NEXT_PUBLIC_APP_URL` to the chosen project/origin. Never store service-account keys in the repository. The server needs trusted Application Default Credentials with minimum necessary Firestore, Auth verification, and bucket access.
3. A trusted administrator assigns an existing Firebase Auth UID with `FIREBASE_PROJECT_ID=... npm run grant:facilitator -- <uid>`. The user signs out and in to refresh the role. Do not expose this administrative script through a web route.
4. After explicit deployment approval, publish the included Firestore and Storage rules with the approved Firebase deployment workflow, then host the Next.js server on a runtime that supports Firebase Admin and Sharp. Set a request body limit of at least 6 MB (some serverless hosts have lower fixed limits; select a compatible runtime). Configure HTTPS, authentication domains, quotas, budget alerts, and edge rate limiting.
5. Follow [EPHEMERAL-SESSIONS.md](EPHEMERAL-SESSIONS.md) for trusted cleanup worker supervision, secret configuration, upload crash recovery, and privacy settings. Run `npm run cleanup` alongside the app locally. Manual confirmed deletion starts immediately; the worker retries failures and cleans abandoned sessions after the default four-hour lifetime. Review backups, PITR, logs, Storage soft delete/versioning/holds and hosting-specific writer drain procedures before setting the production privacy attestation. No cloud jobs or billing changes are installed by local setup.
6. Verify a live workshop across real participant devices, including QR reachability, Google sign-in, uploads, moderation, voting, and projector synchronization before running the event.

See `VALIDATION.md` for the checks actually executed in this workspace and any remaining environment limitations.

## Ephemeral session validation

Run `npm run test:ephemeral` against the local app and emulators for two consecutive 60-participant sessions, cleanup verification, concurrency, injected outages and worker-crash recovery. See [EPHEMERAL-SESSIONS.md](EPHEMERAL-SESSIONS.md) for the lifecycle and operational limits, and [EPHEMERAL-VALIDATION.md](EPHEMERAL-VALIDATION.md) for the implementation results.
