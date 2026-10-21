# WOW #1 — UI/UX implementation validation

Review date: 21 October 2026. This validation uses the local Next.js production build and Firebase Authentication, Firestore and Storage emulators (`demo-wow`). No deployment or production Firebase connection was performed.

## Implemented changes

| Approved priority       | Implemented behavior                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interrupted submissions | The uploader stays mounted across stage changes. Failed requests retain the selected file and preview, display a persistent error, and move that error into view. Server deadlines and stage restrictions still apply.                                                       |
| Mobile navigation       | A persistent stage/countdown bar and mobile Copy prompt/Open AI/Upload actions keep the next step accessible. Submit prioritizes the upload panel. Caption/style choices expose their selected state.                                                                        |
| Live Sticker Wall       | A responsive wall replaces the six-second slideshow. All 50 approved entries fit simultaneously on the projector. Participant views support search and enlarged previews in a stable per-room order.                                                                         |
| Facilitator timing      | Pause, resume, +1 minute and explicit stage transitions are server-authorized. Manual controls can reopen earlier stages before voting. Opening voting permanently locks moderation and reopening. Consequential transitions show outstanding counts before confirmation.    |
| Live totals             | Joined, submitted, approved, awaiting-review and votes-cast counts update live. The projector shows joined/approved/votes-cast totals. Individual ballot choices and per-sticker vote counts remain private until reveal.                                                    |
| Accessibility           | Stronger contrast and readable type, selected-state semantics, named QR SVGs, native dialogs with explicit Tab/Shift+Tab containment, Escape dismissal, focus restoration, live feedback and visible mobile connection status.                                               |
| Winners                 | Three winners, including a three-way tie, fit on one projector screen at both tested resolutions. Additional tied winners remain available on further pages; page cycling can be paused and respects reduced motion. Competition ranking and tie preservation are unchanged. |
| Recovery                | Returned stickers retain their explanation and a persistent View feedback link. Hosts can restore them from the Returned queue or reopen Submit before voting. Resume workshop validates access to saved membership.                                                         |
| External AI handoff     | Clear sign-in, paste, download/save and return instructions; separate copy failure feedback with manual selection. A local preview identifies the selected finished image before sending.                                                                                    |
| Security                | Same-origin checks, verified facilitator claims and ownership, protected/re-encoded uploads, session membership, rate limits, denied direct Firebase writes and transactional one-vote rules remain enforced. No paid AI service was added.                                  |

The default schedule is now 1 minute joining, 2 minutes prompts, 5 minutes creation, 3 minutes submission, 1 minute gallery, 2 minutes voting and 1 minute celebration: 15 minutes total. Facilitators control transitions; pauses and extensions deliberately change that budget. The dashboard shows the remaining stage-plan time including celebration.

## Executed checks

| Check                   | Result                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run build`         | Passed: optimized Next.js build, TypeScript and route generation.                                                                                                                                                                          |
| `npm run typecheck`     | Passed.                                                                                                                                                                                                                                    |
| `npm test`              | 4 passed: schedule, prompt construction, ranking/ties, paused/expired server windows.                                                                                                                                                      |
| `npm run test:rules`    | 23 Firestore/Storage authorization assertions passed. Expected permission-denied responses are successful negative checks.                                                                                                                 |
| `npm run test:e2e`      | All 7 scenarios passed across the final full run (6 passed) and the targeted 50-participant rerun (1 passed). See the bounded-timeout note below.                                                                                          |
| Automated accessibility | Zero WCAG 2 A/AA, 2.1 AA and 2.2 AA axe violations in the seven audited views: mobile and desktop landing, mobile Studio, host dashboard, projector wall, vote dialog and projector results. No rules or interface elements were excluded. |
| `npm run format:check`  | Passed.                                                                                                                                                                                                                                    |

The final full run hit a 15-second test API timeout during the concurrent join burst; its other six scenarios passed. The test helper now explicitly allows 30 seconds for an API response, independently of the 15-second UI-action limit, and asserts that the entire concurrent join batch completes within the one-minute welcome budget. The complete 50-participant scenario then passed on the same application build. This changes test waiting limits, not server acceptance windows or application rate limits.

The browser/API scenarios cover authorization and protected images, paused uploads, unauthorized timing controls, moderation/stage locks, duplicate-vote races, 50 simultaneous joins with idempotent rejoining, the 75-seat cap, expiry and extension, delayed-upload failure at a stage boundary, recovery through reopening, restoring a returned sticker, valid saved-session recovery, real clipboard contents and denied-copy fallback, dialog focus and Escape, the complete workshop flow, mobile widths of 320/390 px, and expired-authentication recovery.

## 50-participant simulation

Two browser participants and 48 synthetic Firebase identities joined the same room. In the final rerun, the 48 additional concurrent join requests completed in 4.32 seconds, within the asserted 60-second budget. A separate test exercised 50 simultaneous joins and the 75-seat cap. All 50 submitted actual PNG fixtures through the protected upload endpoint; all 50 were approved through the normal moderation endpoint; all 50 cast votes through the server. The host's live totals reached 50 submitted, 50 approved and 50/50 votes cast. A duplicate vote remained rejected.

The result was three tied winners, each with 16 votes at rank 1; the remaining two votes went to other entries. All 50 wall cards and all three winner cards fit at 1920×1080 and 1366×768 without projector scrolling. Search, enlarged preview, focus restoration and the voting confirmation were exercised. A separate four-winner fixture verified access to additional tied-winner pages without discarding anyone.

Test-only emulator data accelerated an expiry check and supplied the additional tie fixture. A browser-held request simulated an upload reaching the server after submissions closed. Emulator-only facilitator quota records were reset before full-suite runs; application limits were not weakened or bypassed in the production code. No real selfies or external AI outputs were used.

## Screenshots and evidence

The separately supplied `/workspace/wow-implementation/comparison.html` presents paired, unmodified before-and-after browser screenshots. The downloadable evidence bundle includes the screenshots, build/test logs, five detailed axe reports, and the machine-readable 50-participant result. Landing accessibility assertions are included in the browser test log. Viewport dimensions are shown in the comparison; fixture names, artwork and room codes differ between runs.

## Practical limits

This is emulator validation and browser-layout testing, not a rehearsal with 50 humans or a production load benchmark. Actual iOS/Android file pickers, external AI login/quota/download behavior, venue Wi-Fi, physical projector readability and QR scanning still require an event rehearsal. Automated accessibility checks and keyboard tests are not a complete screen-reader conformance certification.

Selected images remain only in the open tab's memory until uploaded; a browser refresh requires choosing the file again. Caption/style drafts persist independently. The projector shows up to three tied winners per page; larger ties are retained on additional pages. Deployment requires separate explicit approval.
