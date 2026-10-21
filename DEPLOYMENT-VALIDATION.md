# Deployment preparation validation

Local checks on 22 October 2026 (Asia/Singapore). No production resources were
created, changed or deployed. All Firebase test data used demo emulators.

- `npm run build`: passed; Next.js standalone server generated.
- `npm run typecheck`: passed.
- `npm run test`: all 5 unit tests passed.
- `npm run test:rules`: all 30 authorization checks passed; rules unchanged.
- Targeted Playwright security regression: passed against the standalone server,
  covering uploads, moderation, server-enforced voting, image authentication via
  the Hosting-compatible `__session` cookie, and sign-out denying image access.
- `npm run test:ephemeral`: passed, including two consecutive 60-person sessions,
  overflow rejection, reconnects, 60 uploads/approvals/votes per session, complete
  deletion, concurrent termination/cleaners, session isolation, shared identities,
  failure recovery, unknown writers, crash leases, immediate expiry denial and
  facilitator preservation.
- One-shot cleanup runner: successful emulator sweep exited 0; an isolated failed
  cleanup fixture exited 1. The fixture was removed afterward.
- Both Docker targets (`web` and `worker`): built successfully using synthetic
  public Firebase build values. These local test images were not published.
- Web container: homepage HTTP 200, unauthenticated image HTTP 401; no production
  Firebase calls or authenticated production smoke test. Production builds reject
  emulator settings as intended; full emulator regression used the standalone
  server built with local demo configuration.
- Worker container: production dependencies only; emulator cleanup exited 0.
- Both container runtimes: UID 1000, no `.env.local`, Git history or build CA file.
- Build environment required a proxy CA secret mount and a temporary build-only
  proxy DNS mapping. Neither was committed or retained in the runtime images;
  TLS verification remained enabled.
- Formatting and `git diff --check`: passed.

The application feature set and UI are unchanged. The cookie rename is required
because Firebase Hosting forwards only `__session` to dynamic backends. Node's
minimum version is now 24.12 to match installed Firebase package requirements.
The Admin SDK retains application-default credentials; no service-account keys
were added. Runtime configuration, secrets and production IAM are instructions
and templates only, not verified live settings.

Production release gates remain in [DEPLOYMENT.md](DEPLOYMENT.md): reviewed IAM
and sizing, retention/backups/logging, verified writer drain/recovery, quota and
image vulnerability review, and synthetic end-to-end Hosting/cleanup verification.
No local test demonstrates production Scheduler authentication or actual cloud
retention behavior. Those require the separately authorized deployment phase.
