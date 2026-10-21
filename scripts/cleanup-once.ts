import { sweep } from '../src/lib/cleanup';
import { store } from '../src/lib/admin';

// Cloud Run Job: no HTTP listener, public route, key file, or participant payload.
// Scheduler gets permission to execute this job only; the job uses its own identity.
try {
  await sweep();
  const failed = await store
    .collection('cleanupJobs')
    .where('state', '==', 'failed')
    .limit(1)
    .get();
  if (!failed.empty) throw new Error('Cleanup requires retry or operator recovery.');
} catch {
  console.error(
    'Cleanup sweep failed or deletion remains unverified. Review pending cleanup jobs.',
  );
  process.exitCode = 1;
}
