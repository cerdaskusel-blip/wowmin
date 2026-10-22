# Cloud Run Web + Firebase — manual deletion only

Preparation only; no production deployment has been performed. Existing project
`wowmin-workshop`, Cloud Run region `asia-southeast1`, Hosting URL
https://wowmin-workshop.web.app. Do not create another project or change billing.
No Cloud Scheduler, Cloud Run cleanup Job, worker container or scheduled task is
needed or included. If an earlier deployment has automated jobs, an operator must
review and disable those before adopting this version; no production resources
have been inspected or modified here.

Use Windows PowerShell 7.4+, Node 24.12+, Google Cloud CLI, Firebase CLI and Docker
Desktop with Linux containers. Commands below are for a separately approved release.
Stop on command failure. Run from the repository root.

## Review before release

- Approve web sizing: proposed 1 CPU / 1 GiB, concurrency 40, min 0 / max 3. Review
  cost and cold-start behavior for the event. Hosting requires a publicly invokable
  web service; direct `run.app` access remains possible with application auth and
  origin checks in force.
- Review the actual Firestore backups/PITR/exports, Storage soft delete/versioning/
  holds/retention and log retention/sinks. Backend cleanup refuses incompatible
  Storage retention. `WORKSHOP_PRIVACY_REVIEWED` is an operator attestation, not a
  bypass. Do not promise physical erasure or deletion of retained backups.
- Manual deletion is mandatory after each workshop. Four-hour expiry blocks access
  but never removes data. If nobody confirms deletion or retries a failed attempt,
  data remains indefinitely. No automated cleanup or orphan-account sweep exists.
- Firebase Hosting imposes a 60-second dynamic-request timeout. Manual cleanup runs
  inside the web request. On timeout, refresh the owner screen, check the status and
  explicitly retry; a killed request's two-minute lease must expire before takeover.
  Do not reopen joining or report success to bypass this condition.
- Establish an operator upload-drain/reconciliation procedure as described in
  [EPHEMERAL-SESSIONS.md](EPHEMERAL-SESSIONS.md). Unknown in-flight writes must block
  success until settled. Preserve pending cleanup state on rollback.
- Review the single web identity's IAM scope: Firestore data-user access, Auth user
  lookup/deletion, bucket-scoped object access and bucket metadata lookup, access to
  one signing secret. It cannot set facilitator claims or change bucket policies.
  IAM is broader than app session ownership: server checks enforce per-session
  scope. Use the workshop bucket; preserve unrelated objects.
- Verify Anonymous and Google sign-in, the Hosting authorized domain, shared-Wi-Fi
  signup quotas, upload limits (5 MiB files / 6 MiB request budget), dependency/image
  vulnerabilities and facilitator authorization before admitting real teachers.

## 1. Authenticate and retrieve existing Web App configuration

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$Project = 'wowmin-workshop'
$Region = 'asia-southeast1'
$Web = 'wowmin-web'
$WebSA = "wowmin-web@$Project.iam.gserviceaccount.com"
gcloud auth login
firebase login
gcloud projects describe $Project
firebase apps:list WEB --project $Project
$AppId = Read-Host 'Existing Firebase Web App ID'
$SdkResult = firebase apps:sdkconfig WEB $AppId --project $Project --json | ConvertFrom-Json
$Sdk = $SdkResult.result.sdkConfig
if (!$Sdk.apiKey -or !$Sdk.storageBucket -or $Sdk.projectId -ne $Project) { throw 'Verify SDK configuration' }
$Bucket = $Sdk.storageBucket
gcloud services list --enabled --project $Project
gcloud run services list --region $Region --project $Project
gcloud projects get-iam-policy $Project
gcloud storage buckets describe "gs://$Bucket" --format=json
gcloud firestore databases describe --database='(default)' --project $Project
gcloud firestore backups schedules list --database='(default)' --project $Project
$FirestoreLocation = Read-Host 'Existing Firestore database location ID'
gcloud firestore backups list --location $FirestoreLocation --project $Project
gcloud logging sinks list --project $Project
gcloud logging buckets list --location=global --project $Project
# Also inspect every log location and external export referenced by sinks.
```

Do not guess the bucket suffix. Public SDK values are baked into the image and
require a rebuild when changed. Never provide service-account JSON files; Admin
already uses `applicationDefault()` and Cloud Run's attached service identity.
The operator assigning `facilitator` claims uses separate trusted admin credentials;
the runtime role below cannot grant claims.

## 2. Approved infrastructure and secret setup

Only create missing named resources after review; reuse compatible existing ones.
These commands do not enable Scheduler or a worker service. The deploying human
needs deployment/policy permissions and `iam.serviceAccounts.actAs` for `$WebSA`.

```powershell
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com --project $Project
gcloud artifacts repositories create wowmin --repository-format=docker --location $Region --project $Project
gcloud iam service-accounts create wowmin-web --project $Project
gcloud iam roles create wowminTemporaryAuth --file deploy/auth-role.yaml --project $Project
gcloud iam roles create wowminWorkshopStorage --file deploy/storage-role.yaml --project $Project
gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$WebSA" --role=roles/datastore.user
gcloud projects add-iam-policy-binding $Project --member="serviceAccount:$WebSA" --role="projects/$Project/roles/wowminTemporaryAuth"
gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member="serviceAccount:$WebSA" --role="projects/$Project/roles/wowminWorkshopStorage"
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
notepad deploy/runtime.local.yaml
```

Replace the bucket placeholder; set the privacy attestation true only after the
actual review. The local YAML is ignored. No emulator host variables or
`GOOGLE_APPLICATION_CREDENTIALS` belong in production. Secret version `1` is pinned
below: a later rotation requires a reviewed update and invalidates browser tickets;
unfinished cleanup records remain owner-accessible without those tickets.

## 3. Build and deploy only the web image and Firebase

```powershell
npm ci
npm test
npm run typecheck
# With demo emulators + seeded facilitator + Next running locally:
# npm run test:rules
# npm run test:ephemeral
# npm run test:e2e
$Tag = git rev-parse --short=12 HEAD
$Registry = "$Region-docker.pkg.dev"
$WebImage = "$Registry/$Project/wowmin/web:$Tag"
gcloud auth configure-docker $Registry
docker build --platform linux/amd64 --target web --build-arg "NEXT_PUBLIC_FIREBASE_API_KEY=$($Sdk.apiKey)" --build-arg "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$($Sdk.authDomain)" --build-arg "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$Bucket" -t $WebImage .
# Review vulnerability findings before publishing the release.
docker push $WebImage
gcloud run deploy $Web --image $WebImage --region $Region --project $Project --service-account $WebSA --port 8080 --cpu 1 --memory 1Gi --concurrency 40 --min-instances 0 --max-instances 3 --timeout 60s --env-vars-file deploy/runtime.local.yaml --set-secrets=CLEANUP_TICKET_SECRET=wowmin-cleanup-ticket:1 --allow-unauthenticated
firebase deploy --only 'firestore:rules,firestore:indexes,storage,hosting' --project $Project
```

The Dockerfile has a single web runtime target, uses standalone output, runs as UID
1000 and excludes `.env.local`, credentials, caches and Git history. Corporate CAs
may be supplied with `--secret id=npm_ca,src=PATH_TO_CA_PEM` and standard proxy build
arguments; TLS verification stays enabled and the CA mount is not in the image.
Firebase Hosting rewrites all paths to Singapore's `wowmin-web`. The HttpOnly
`__session` cookie is compatible with Hosting forwarding; verify secure behavior
over HTTPS. Firestore and Storage rules continue denying all client writes.

## 4. Synthetic production verification after separate deployment approval

Test create → join two participants → prompt → upload → approve → vote → reveal
winners → **Padam Semua Data Bengkel** → confirm. Verify **Cleanup Complete**, no
session descendants, votes, join codes, Storage images or eligible temporary Auth
users, and the facilitator still able to sign in. Confirm cancellation does not
delete, and failed cleanup can be found on facilitator home and retried. Check that
unrelated users and objects survive. Test 60-participant load on emulators first.

A synthetic expired session must stay stored until manual confirmation, appear on
its owner's home screen, deny participant access and then delete through the same
action. Do not change the global expiry to test it. No scheduler verification is
needed. Log only operational status; avoid participant content, tokens and bodies.
Record image digest, rules revision, manual cleanup result and privacy limitations.

## V2 release gate and rollback (approval required; do not run during QA)

Use [V2-STEP-6.md](V2-STEP-6.md) for the current release decision; the older
validation reports are historical. The approved V2 design stays on
`feature/wow-mean-v2` until release approval. Record the approved commit, image
**digest**, current Cloud Run traffic/revisions, Hosting release and security-rule
versions before changing anything. Do not print environment/secret values in QA
reports. Confirm Firestore TTL policies as well as backups/PITR: a document TTL
must not silently replace the verified manual deletion flow.

After the separate production review and approval:

1. Verify the existing SDK configuration, facilitator custom claims, Google and
   Anonymous Auth, authorized domains, actual bucket/database locations and
   region compatibility. Check shared-Wi-Fi anonymous signup quotas. Confirm no
   Scheduler/cleanup worker or TTL conflicts with manual deletion.
2. Review runtime IAM, pinned secret version, Storage versioning/soft delete/
   retention/holds, Firestore backup/PITR/exports and all log sinks/retention.
   Review upload memory/load under the chosen Cloud Run limits. The proposed
   concurrency 40 with 1 GiB has not been validated with 60 large uploads; do not
   treat the small emulator fixtures as capacity proof.
3. Build the approved image with the **existing project's public SDK values**,
   scan application/OS dependencies and push only after approval. The synthetic
   local QA image must never be released. Keep emulator variables, credentials
   files and local YAML out of the image. Confirm `public/brand` exists in runtime.
4. Deploy a candidate without traffic first (`--no-traffic --tag v2-candidate` on
   the reviewed deploy command above). Check startup, official assets and denied
   unauthenticated requests. A tagged `run.app` preview is not a full browser
   rehearsal: writes deliberately require the configured Hosting origin. Do not
   broaden the allowed origin to work around this.
   If the service has never existed, there is no previous revision to restore;
   stop and agree an initial-release/abort plan with the operator before deploying.
   Do not assume `--no-traffic` provides a rehearsal for a first-ever service.
5. Apply only reviewed rules/indexes/Hosting settings, then explicitly route
   traffic to the approved candidate. Existing rules are unchanged in V2; retain
   their known-good versions. Run the synthetic Hosting smoke test below and the
   physical iPhone checklist in `V2-STEP-6.md` before admitting teachers.

PowerShell 7 rollback preparation and traffic commands (use operator-reviewed
revision names, never guess them):

```powershell
# Read/save revision names and traffic before deployment; no secrets are printed.
gcloud run services describe $Web --region $Region --project $Project --format='json(status.traffic,status.latestReadyRevisionName)'
$PreviousRevision = Read-Host 'Previously validated revision to restore'
$CandidateRevision = Read-Host 'Approved V2 candidate revision'
# After explicit release approval and candidate validation:
gcloud run services update-traffic $Web --to-revisions "$CandidateRevision=100" --region $Region --project $Project
# If smoke tests fail, stop new admissions and restore the recorded stable revision:
gcloud run services update-traffic $Web --to-revisions "$PreviousRevision=100" --region $Region --project $Project
```

Prefer a previously validated **V2-compatible** revision. Before reverting to V1,
close admissions and finish verified manual deletion of active V2 sessions using
the compatible release; otherwise prompts/template routes may disappear while
cleanup remains unfinished. Preserve cleanup records, saved templates, Auth
facilitators and signing-secret versions. Do not restore deleted participant data
or clear a failed cleanup job to make rollback look successful. If Hosting/rules
were also changed, restore their recorded, compatible release via Firebase
Hosting release history and the reviewed rules source; never loosen rules.

After traffic changes, check the official URL, Google facilitator login, one
activity with two synthetic participants (code + QR invitation), prompts/copy,
upload/approve, image/download, projector, single/self-vote enforcement, tied
results and verified manual deletion. Confirm the template and facilitator remain
and session images/records/eligible anonymous users are gone. Confirm closed
joining and denied download after deletion. Record timings/status only, not
participant content or tokens. Stop admissions and roll back on security,
cleanup or authentication failure. No command above has been run on production
as part of local V2 QA.
