import { store, bucket } from '../src/lib/admin';
import { sessionRef } from '../src/lib/server';
import { cleanSession } from '../src/lib/cleanup';
// Trusted operator recovery only, never exposed via HTTP. This assertion is an
// operational prerequisite, not something elapsed time or a lease can establish.
const id = process.argv[2];
if (!id || !process.argv.includes('--writers-stopped-and-storage-settled'))
  throw new Error(
    'Stop ALL upload-serving processes and establish that their Storage requests have settled before supplying --writers-stopped-and-storage-settled.',
  );
if (process.env.WORKSHOP_UPLOAD_WRITERS_QUIESCED !== 'true')
  throw new Error(
    'Set WORKSHOP_UPLOAD_WRITERS_QUIESCED=true only after confirming the documented quiescence procedure.',
  );
const ref = sessionRef(id);
const session = (await ref.get()).data();
if (session?.lifecycle !== 'closing' || !(await store.doc(`cleanupJobs/${id}`).get()).exists)
  throw new Error('Only a closed session with an existing cleanup job can be reconciled.');
for (const operation of (await ref.collection('uploads').get()).docs) {
  const path = operation.data().path;
  if (typeof path !== 'string' || !path.startsWith(`sessions/${id}/`))
    throw new Error('Unexpected Storage path; refusing reconciliation.');
  await bucket.file(path).delete({ ignoreNotFound: true });
  await operation.ref.delete();
}
await cleanSession(id);
console.log(
  (await store.doc(`cleanupJobs/${id}`).get()).exists
    ? 'Cleanup remains pending or failed. Verification has not completed.'
    : 'Cleanup Complete: deletion verified.',
);
