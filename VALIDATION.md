# Local validation — 21 October 2026

Validated in `/workspace/wowmin` with Node.js 24.19.0, Java 21, Next.js 16.4.2, Firebase local emulators, and Chromium. No app or Firebase resources were deployed.

| Check                                                        | Result                              |
| ------------------------------------------------------------ | ----------------------------------- |
| Frozen dependency install (`npm ci`)                         | Passed                              |
| TypeScript (`npm run typecheck`)                             | Passed                              |
| Formatting (`npm run format:check`)                          | Passed                              |
| Production build (`npm run build`)                           | Passed                              |
| Workshop unit tests                                          | 3 passed, 0 skipped                 |
| Firestore / Storage rules                                    | 20 authorization assertions passed  |
| Browser / API integration suite against the production build | 5 passed in 28.2 seconds, 0 skipped |
| Runtime dependency audit (`npm audit --omit=dev`)            | 0 reported vulnerabilities          |

The final integration run verified:

- Anonymous participants joining by code, independent facilitator/participant/projector browser contexts, synchronized stages, and live attendance.
- Three caption collections and style selection; customized prompt text, actual clipboard copying, external-tool link destination, and draft persistence across reloads.
- Finished-image upload, facilitator rejection, participant replacement, approval, private image authorization, live gallery updates, and decoded images on the projector.
- One immutable vote per account, self-vote prevention, closed-stage rejection, moderation locking, concurrent duplicate-vote attempts, and tied winner reveals.
- Fifty simultaneous first joins followed by fifty repeat joins, with exactly fifty attendance records. The room then accepted twenty-five more participants and rejected the seventy-sixth.
- Responsive landing layout at 390 and 320 pixels and desktop rendering; authentication recovery after a server-rejected token.

The simultaneous-join test exposed and led to removal of a shared-counter transaction bottleneck. Admission now reserves one of 75 independent seats transactionally, and clients derive attendance from minimal, server-written attendance records. The final run passed without relaxing admission or voting assertions.

Screenshots from the final run are in the ignored `test-results/` directory. Test uploads are generated colored images, not real teachers’ photos. Test emulator data was cleared after validation and the local facilitator was re-seeded, so a new workshop starts with an empty room and an unused creation quota.

## Scope and remaining live-event work

These results validate this machine and the local Firebase workflow. They do not establish production performance, a published environment snapshot, real Google OAuth configuration, or access from participant phones. External AI image generation remains entirely in participants’ own accounts and was not automated.

Before a real event, connect a real Firebase project and approved HTTPS origin, publish restrictive rules only with explicit approval, authorize facilitators, configure retention cleanup and deployment-level abuse controls, then rehearse on real devices. Anonymous identities cannot prove one physical person across multiple browsers. See README.md for the deployment prerequisites and data-handling limits.

Reusable `install_script` and `start_skill` instructions and the emulator download domain were saved in the environment configuration draft. Saving that draft does not publish the environment or deploy the application.
