# Production deployment — Windows PowerShell

Prepared only: these commands have NOT been run against production. Project
`wowmin-workshop`, region `asia-southeast1`, URL https://wowmin-workshop.web.app.
Run from the repository root with PowerShell 7.4 or newer, Git, Node 24.12 or newer, Docker Desktop
(Linux containers), Google Cloud CLI and Firebase CLI installed. Stop on any
failed command. Do not deploy until the gates below are reviewed and approved.

## Decisions and release gates

- Proposed names: `wowmin-web` service, `wowmin-cleanup` job, `wowmin-cleanup-minute`
  schedule, `wowmin` Artifact Registry repository. Check for existing resources;
  reuse them only after checking configuration. Do not overwrite unrelated resources.
- Proposed sizing for approval: web 1 CPU / 1 GiB, concurrency 40, min 0 / max 3;
  worker 1 CPU / 512 MiB, one task, 10-minute timeout, one retry, every minute.
  This schedule may overlap executions; the existing transactional cleanup leases
  handle overlap. Review actual usage, execution duration and costs before release.
- Hosting must invoke a publicly invokable Cloud Run web service. This allows direct
  `run.app` access too; application authentication, origin enforcement and Firebase
  rules still apply. Review this exposure before granting `allUsers` invoker.
  The worker is a private Job, never an HTTP endpoint. Scheduler gets invoker only
  on that job, not data access or service-account impersonation grants.
- Use the existing registered Web App configuration and actual bucket name. Do not
  infer `.appspot.com` versus `.firebasestorage.app`. All `NEXT_PUBLIC_*` values are
  public and baked into the image; changing them requires rebuilding. The API key
  is a public Firebase client identifier, not an Admin credential; review its API
  restrictions and authorized domains. Add the Hosting domain in Auth settings.
- Confirm the 5 MiB file / 6 MiB multipart request budget through Hosting and Cloud
  Run. Hosting has a 60-second dynamic request timeout: long manual cleanup can
  outlive the browser request; scheduled retries remain authoritative. An uncertain
  upload outcome blocks completion, never silently reports success.
- Review Storage soft delete, versioning, retention policies, holds, old object
  versions; Firestore PITR, backup schedules, exports; log buckets/sinks and retained
  copies. Disable incompatible retention only with explicit operator approval.
  Do not set the privacy attestation just to bypass a failure. See
  [EPHEMERAL-SESSIONS.md](EPHEMERAL-SESSIONS.md) for deletion limits and recovery.
- Establish a Cloud Run writer-drain procedure before launch. Scaling to zero or
  waiting a fixed duration does not prove prior Storage requests settled. Unknown
  upload operations require verified quiescence and operator reconciliation; do
  not discard them. This operational decision remains a production release gate.
- Check Firebase anonymous signup quotas for 60 teachers sharing one Wi-Fi and
  consecutive sessions, facilitator claims, dependencies/image vulnerability scans,
  and alerting for failed Job executions and unfinished `cleanupJobs`. A Job API
  invocation success is not proof of deletion. Failed jobs exit nonzero; individual
  cleanup failures remain retryable in Firestore and the facilitator interface.
- IAM below uses separate runtime identities. Firestore's predefined data-user role
  grants database data access, not Security Rules-limited access. Both web and job
  require Auth deletion because manual cleanup runs in the web backend too. Neither
  can grant facilitator claims. Storage access is bucket-scoped; use a dedicated
  workshop bucket with no unrelated objects. Review these scopes before applying.

No project creation, billing changes, backups policy changes, or deployment occur
as part of checking this file into GitHub.

## 1. Authenticate and inspect the existing project

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$Project = 'wowmin-workshop'
$Region = 'asia-southeast1'
$Web = 'wowmin-web'
$Job = 'wowmin-cleanup'
$WebSA = "wowmin-web@$Project.iam.gserviceaccount.com"
$JobSA = "wowmin-cleanup@$Project.iam.gserviceaccount.com"
$SchedulerSA = "wowmin-scheduler@$Project.iam.gserviceaccount.com"
gcloud auth login
firebase login
gcloud projects describe $Project
firebase apps:list WEB --project $Project
$AppId = Read-Host 'Existing Firebase Web App ID from that list'
$SdkResult = firebase apps:sdkconfig WEB $AppId --project $Project --json | ConvertFrom-Json
$Sdk = $SdkResult.result.sdkConfig
if (!$Sdk.apiKey -or !$Sdk.storageBucket -or $Sdk.projectId -ne $Project) { throw 'Verify SDK configuration response before continuing' }
$Bucket = $Sdk.storageBucket
gcloud services list --enabled --project $Project
gcloud run services list --region $Region --project $Project
gcloud run jobs list --region $Region --project $Project
gcloud artifacts repositories list --location $Region --project $Project
gcloud projects get-iam-policy $Project
gcloud storage buckets describe "gs://$Bucket" --format=json
gcloud firestore databases describe --database='(default)' --project $Project
# Obtain the actual Firestore location from the preceding output, not the Run region.
$FirestoreLocation = Read-Host 'Existing Firestore database location ID'
gcloud firestore backups schedules list --database='(default)' --project $Project
gcloud firestore backups list --location $FirestoreLocation --project $Project
gcloud logging sinks list --project $Project
gcloud logging buckets list --location=global --project $Project
# Also inspect log buckets in every location referenced by sinks, and external exports.
```

Confirm backups/exports and Auth settings in the console as well. CLI listings do
not prove absence of cross-project copies or provider-retained logs. Budget alerts
are not spending caps. Never paste access tokens or private keys into the repo.

## 2. Provision only after approval

These are the services needed for the proposed architecture; enable missing ones
only after approval. No Cloud Build is required: Docker builds locally.

```powershell
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com --project $Project
gcloud artifacts repositories create wowmin --repository-format=docker --location $Region --project $Project
gcloud iam service-accounts create wowmin-web --project $Project
gcloud iam service-accounts create wowmin-cleanup --project $Project
gcloud iam service-accounts create wowmin-scheduler --project $Project
gcloud iam roles create wowminTemporaryAuth --file deploy/auth-role.yaml --project $Project
gcloud iam roles create wowminWorkshopStorage --file deploy/storage-role.yaml --project $Project
gcloud iam roles create wowminCleanupStorage --file deploy/cleanup-storage-role.yaml --project $Project
foreach ($SA in @($WebSA, $JobSA)) {
  gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$SA" --role=roles/datastore.user
  gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$SA" --role="projects/$Project/roles/wowminTemporaryAuth"
}
gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member="serviceAccount:$WebSA" --role="projects/$Project/roles/wowminWorkshopStorage"
gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member="serviceAccount:$JobSA" --role="projects/$Project/roles/wowminCleanupStorage"
```

The deploying human needs resource deployment and policy-management privileges,
plus `iam.serviceAccounts.actAs` on these identities; do not grant Owner to runtime
identities. Cloud Scheduler's Google-managed service agent must retain
`roles/cloudscheduler.serviceAgent`. Do not grant that role to `$SchedulerSA`.
Cross-project image pulls are not part of this design.

Create the signing secret without putting it in command history or source files:

```powershell
$SecretFile = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
try {
  $Bytes = [byte[]]::new(48)
  [Security.Cryptography.RandomNumberGenerator]::Fill($Bytes)
  [IO.File]::WriteAllText($SecretFile, [Convert]::ToBase64String($Bytes), [Text.UTF8Encoding]::new($false))
  gcloud secrets create wowmin-cleanup-ticket --replication-policy=automatic --data-file=$SecretFile --project $Project
} finally {
  Remove-Item $SecretFile -ErrorAction SilentlyContinue
  $Bytes = $null
}
gcloud secrets add-iam-policy-binding wowmin-cleanup-ticket --member="serviceAccount:$WebSA" --role=roles/secretmanager.secretAccessor --project $Project
Copy-Item deploy/runtime.example.yaml deploy/runtime.local.yaml
# Replace the bucket placeholder with $Bucket. Only after the completed privacy
# review, change WORKSHOP_PRIVACY_REVIEWED to "true". This local file is ignored.
notepad deploy/runtime.local.yaml
```

The job does not sign browser cleanup tickets and does not need secret access.
Secret version `1` is pinned below; subsequent rotations require a reviewed revision
update and invalidate browser tickets. Pending jobs remain owner-accessible.
Firebase Admin already calls `applicationDefault()`: Cloud Run obtains short-lived
credentials from its attached service identity. Never set
`GOOGLE_APPLICATION_CREDENTIALS` or any emulator host variable in production.

## 3. Validate, build and push images

```powershell
npm ci
npm run test
npm run typecheck
# For rules/ephemeral regression, use demo emulators only in a separate terminal:
# npm run emulators; follow EPHEMERAL-SESSIONS.md for the local fixture/server setup.
# npm run test:rules; npm run test:ephemeral
$Tag = git rev-parse --short=12 HEAD
$Registry = "$Region-docker.pkg.dev"
$WebImage = "$Registry/$Project/wowmin/web:$Tag"
$JobImage = "$Registry/$Project/wowmin/cleanup:$Tag"
gcloud auth configure-docker $Registry
docker build --platform linux/amd64 --target web --build-arg "NEXT_PUBLIC_FIREBASE_API_KEY=$($Sdk.apiKey)" --build-arg "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$($Sdk.authDomain)" --build-arg "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$Bucket" -t $WebImage .
docker build --platform linux/amd64 --target worker -t $JobImage .
# Review vulnerability findings before publishing/releasing these images.
docker push $WebImage
docker push $JobImage
```

The Docker allowlist excludes `.env.local`, credentials, Git history, local caches
and test artifacts. The web runtime uses Next standalone output and runs as a
non-root user; the worker contains production dependencies including `tsx`.
No credentials are needed at build time. If your corporate network requires a
custom CA, use Docker BuildKit `--secret id=npm_ca,src=PATH_TO_CA_PEM` and
standard proxy build arguments; the CA mount is not copied into the image. Never
disable TLS verification. There is currently no `public/` directory;
if static public assets are added later, update Docker copy/ignore rules explicitly.

## 4. Deploy the job, scheduler, server and Hosting after all gates pass

```powershell
gcloud run jobs deploy $Job --image $JobImage --region $Region --project $Project --service-account $JobSA --tasks 1 --parallelism 1 --cpu 1 --memory 512Mi --task-timeout 600s --max-retries 1 --env-vars-file deploy/runtime.local.yaml
gcloud run jobs add-iam-policy-binding $Job --region $Region --project $Project --member="serviceAccount:$SchedulerSA" --role=roles/run.invoker
$JobUri = "https://run.googleapis.com/v1/namespaces/$Project/jobs/${Job}:run"
gcloud scheduler jobs create http wowmin-cleanup-minute --location $Region --project $Project --schedule='* * * * *' --time-zone=Asia/Singapore --uri=$JobUri --http-method=POST --oauth-service-account-email=$SchedulerSA --oauth-token-scope=https://www.googleapis.com/auth/cloud-platform --message-body='{}' --headers=Content-Type=application/json --attempt-deadline=60s
gcloud run jobs execute $Job --region $Region --project $Project --wait
gcloud run deploy $Web --image $WebImage --region $Region --project $Project --service-account $WebSA --port 8080 --cpu 1 --memory 1Gi --concurrency 40 --min-instances 0 --max-instances 3 --timeout 60s --env-vars-file deploy/runtime.local.yaml --set-secrets=CLEANUP_TICKET_SECRET=wowmin-cleanup-ticket:1 --allow-unauthenticated
firebase deploy --only firestore:rules,firestore:indexes,storage,hosting --project $Project
```

Use `gcloud scheduler jobs update http` instead of `create` on subsequent releases;
reuse service accounts, repository, custom roles and secret rather than recreating
or silently replacing them. Firebase Hosting rewrites all paths to `wowmin-web` in
Singapore. No static export: API routes require the live Node server. The internal
Auth cookie is `__session`, which Firebase Hosting forwards; it remains HttpOnly
and same-site. Existing browsers refresh authentication to receive the renamed
cookie. No rules were weakened. Review browser secure-cookie behavior over HTTPS.
Do not put workshop content in build output, logs, CDN caches or deployment assets.

## 5. Production verification and cleanup

Use synthetic data only. Check home, facilitator sign-in and authorization; create
a session, join two anonymous participants, copy prompts, upload PNG/JPEG/WebP,
moderate, load sticker images through the Hosting URL, vote, and reveal results.
Check rejected types, files over 5 MiB and unauthorized requests. Confirm reconnect
preserves the same slot and `expiresAt - createdAt` equals four hours. The 60-seat
concurrency stress test belongs in emulators, not the initial production smoke test.

End Session & Delete Data and verify `Cleanup Complete`, no descendants, join code,
Storage objects, temporary identities, votes or results. Verify both Scheduler
execution and actual Cloud Run Job completion, including failed-job visibility.
For automatic expiry, a controlled synthetic fixture may set its own expiry in
the past through a trusted admin tool; do not change retention globally. Do not
release to teachers until the fallback expiry/cleanup path is verified.

```powershell
gcloud scheduler jobs describe wowmin-cleanup-minute --location $Region --project $Project
gcloud scheduler jobs run wowmin-cleanup-minute --location $Region --project $Project
gcloud run jobs executions list --job $Job --region $Region --project $Project
gcloud run services describe $Web --region $Region --project $Project
Invoke-WebRequest 'https://wowmin-workshop.web.app' -Method Head
```

If deployment fails, leave the previous known-good revision serving, inspect logs
without copying participant data, and do not claim the release succeeded. Stop new
workshops if cleanup is unhealthy; preserve the worker and pending jobs so deletion
can recover. Rolling back the web image must not remove cleanup infrastructure or
restore participant backups. Record the released image digests, rules revision,
smoke-test result and outstanding privacy limits in the release report.
