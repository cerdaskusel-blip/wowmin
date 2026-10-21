import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { adminAuth, store, bucket } from './admin';
import { ApiError, sessionRef } from './server';
import { retentionMs } from './lifecycle';

function secret() {
  const value = process.env.CLEANUP_TICKET_SECRET;
  if (value && value.length >= 32) return value;
  if (
    process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    process.env.FIREBASE_PROJECT_ID?.startsWith('demo-')
  )
    return 'local-emulator-only-cleanup-ticket-secret';
  throw new Error('Configure CLEANUP_TICKET_SECRET (at least 32 characters).');
}
export function ticket(id: string, hostId: string) {
  return createHmac('sha256', secret()).update(`${id}:${hostId}`).digest('hex');
}
export function checkTicket(id: string, hostId: string, value: string) {
  const expected = ticket(id, hostId);
  if (!/^[a-f0-9]{64}$/.test(value) || !timingSafeEqual(Buffer.from(value), Buffer.from(expected)))
    throw new ApiError(403, 'Cleanup authorization is invalid.');
}
export async function closeSession(id: string, hostId?: string) {
  const ref = sessionRef(id);
  const job = store.doc(`cleanupJobs/${id}`);
  await store.runTransaction(async (tx) => {
    const [s, j] = await Promise.all([tx.get(ref), tx.get(job)]);
    const session = s.data();
    if (hostId && (session?.hostId ?? j.data()?.hostId) !== hostId)
      throw new ApiError(403, 'Only this workshop’s facilitator can end it.');
    if (!session) {
      if (!j.exists) throw new ApiError(404, 'Workshop not found.');
      return;
    }
    if (!hostId && session.expiresAt > Date.now() && session.lifecycle !== 'closing')
      throw new ApiError(409, 'Workshop is still active.');
    tx.update(ref, { lifecycle: 'closing' });
    tx.delete(store.doc(`codes/${session.code}`));
    if (!j.exists)
      tx.create(job, {
        hostId: session.hostId,
        state: 'pending',
        createdAt: Date.now(),
        attempts: 0,
        retryAt: 0,
        leaseUntil: 0,
        membersCaptured: false,
      });
  });
}
async function removeQuery(query: FirebaseFirestore.Query) {
  // Bounded pages avoid Firestore's batch limit; repeat to include every page.
  for (;;) {
    const page = await query.limit(200).get();
    if (page.empty) return;
    const batch = store.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
async function removeIdentity(uid: string, sid: string, lease: string) {
  const ref = store.doc(`identities/${uid}`);
  const removeAuth = await store.runTransaction(async (tx) => {
    const job = await tx.get(store.doc(`cleanupJobs/${sid}`));
    if (job.data()?.lease !== lease) throw new Error('Cleanup lease changed');
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    const sessions = { ...data?.sessions };
    delete sessions[sid];
    const unused = Object.keys(sessions).length === 0;
    tx.set(ref, { sessions, anonymous: data?.anonymous ?? true, deleting: unused });
    return unused;
  });
  if (!removeAuth) return;
  try {
    const user = await adminAuth.getUser(uid);
    // Never delete facilitator or linked/non-anonymous accounts.
    if (
      !user.customClaims?.facilitator &&
      !user.providerData.length &&
      !user.email &&
      !user.phoneNumber
    )
      await adminAuth.deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
  await removeQuery(store.collection('limits').where('uid', '==', uid));
  await ref.delete();
}
export async function verifyDeleted(id: string) {
  const ref = sessionRef(id);
  const [session, collections, codes, identities, files, limits] = await Promise.all([
    ref.get(),
    ref.listCollections(),
    store.collection('codes').where('sessionId', '==', id).get(),
    store.collection('identities').where(`sessions.${id}`, '==', true).get(),
    bucket.getFiles({ prefix: `sessions/${id}/` }),
    store.collection('limits').where('sessionId', '==', id).get(),
  ]);
  if (
    session.exists ||
    collections.length ||
    !codes.empty ||
    !identities.empty ||
    files[0].length ||
    !limits.empty
  )
    throw new Error('Deletion verification failed');
}
// Hooks are dependency injection for emulator failure tests, never request-controlled.
export type CleanupHooks = {
  beforeStorage?: () => Promise<void>;
  afterStorage?: () => Promise<void>;
};
export async function cleanSession(id: string, hooks: CleanupHooks = {}) {
  const ref = sessionRef(id);
  const job = store.doc(`cleanupJobs/${id}`);
  const lease = randomUUID();
  const acquired = await store.runTransaction(async (tx) => {
    const snap = await tx.get(job);
    if (!snap.exists || snap.data()!.leaseUntil > Date.now()) return false;
    tx.update(job, {
      lease,
      leaseUntil: Date.now() + 120_000,
      state: 'cleaning',
      error: '',
      attempts: snap.data()!.attempts + 1,
    });
    return true;
  });
  if (!acquired) return;
  async function ownLease() {
    await store.runTransaction(async (tx) => {
      const j = await tx.get(job);
      if (j.data()?.lease !== lease) throw new Error('Cleanup lease changed');
      tx.update(job, { leaseUntil: Date.now() + 120_000 });
    });
  }
  try {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      if (process.env.WORKSHOP_PRIVACY_REVIEWED !== 'true')
        throw new Error('Production privacy review required');
      const [metadata] = await bucket.getMetadata();
      if (
        metadata.versioning?.enabled ||
        metadata.retentionPolicy ||
        Number(metadata.softDeletePolicy?.retentionDurationSeconds ?? 0) > 0
      )
        throw new Error('Bucket retains deleted data');
    }
    // Never infer a finished upload from elapsed time. Unknown writers block completion.
    const uploads = await ref.collection('uploads').get();
    for (const upload of uploads.docs) {
      // A complete object proves the sole non-resumable Storage write landed.
      // No SDK retries or second writes can run for this unique object path.
      const [exists] = await bucket.file(upload.data().path).exists();
      if (exists) await upload.ref.delete();
      else
        throw new Error(
          'Uploads are still settling. Retry cleanup. If this persists, an administrator must reconcile the upload service.',
        );
    }
    const j = (await job.get()).data()!;
    if (!j.membersCaptured) {
      const members = await ref.collection('members').get();
      await job.update({ members: members.docs.map((d) => d.id), membersCaptured: true });
    }
    await ownLease();
    await hooks.beforeStorage?.();
    const [files] = await bucket.getFiles({ prefix: `sessions/${id}/` });
    for (const file of files) await file.delete({ ignoreNotFound: true });
    await hooks.afterStorage?.();
    await ownLease();
    const captured = (await job.get()).data()!;
    for (const uid of (captured.members ?? []) as string[]) {
      await ownLease();
      await removeIdentity(uid, id, lease);
    }
    await removeQuery(store.collection('codes').where('sessionId', '==', id));
    await removeQuery(store.collection('limits').where('sessionId', '==', id));
    await store.recursiveDelete(ref);
    await ownLease();
    await verifyDeleted(id);
    // Last durable record. Missing job means all preceding verification succeeded.
    await store.runTransaction(async (tx) => {
      const current = await tx.get(job);
      if (current.data()?.lease !== lease) throw new Error('Cleanup lease changed');
      tx.delete(job);
    });
  } catch (error) {
    await store.runTransaction(async (tx) => {
      const current = await tx.get(job);
      if (current.data()?.lease !== lease) return;
      tx.update(job, {
        state: 'failed',
        leaseUntil: 0,
        error:
          error instanceof Error && error.message.startsWith('Uploads are still')
            ? error.message
            : 'Deletion could not be verified. Retry cleanup. The workshop remains closed.',
        retryAt: Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(current.data()!.attempts, 8)),
      });
    });
  }
}
export async function sweep() {
  const expired = await store.collection('sessions').where('expiresAt', '<=', Date.now()).get();
  for (const session of expired.docs) await closeSession(session.id);
  const jobs = await store.collection('cleanupJobs').get();
  for (const job of jobs.docs) if (job.data().retryAt <= Date.now()) await cleanSession(job.id);
  // Includes pre-migration hashed limits; never keep expired abuse records indefinitely.
  await removeQuery(store.collection('limits').where('resetAt', '<=', Date.now()));
  await sweepAnonymousAccounts(Date.now() - retentionMs());
}

// Auth sign-ups that never joined are also temporary. The identity lock and
// getUser check in admission prevent a concurrent join from reviving deletion.
export async function sweepAnonymousAccounts(cutoff: number) {
  let pageToken: string | undefined;
  do {
    const page = await adminAuth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (
        user.customClaims?.facilitator ||
        user.providerData.length ||
        user.email ||
        user.phoneNumber ||
        Date.parse(user.metadata.lastSignInTime || user.metadata.creationTime) > cutoff
      )
        continue;
      const ref = store.doc(`identities/${user.uid}`);
      const unused = await store.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (Object.keys(current.data()?.sessions ?? {}).length) return false;
        tx.set(ref, { sessions: {}, deleting: true, anonymous: true });
        return true;
      });
      if (!unused) continue;
      await adminAuth.deleteUser(user.uid);
      await removeQuery(store.collection('limits').where('uid', '==', user.uid));
      await ref.delete();
    }
    pageToken = page.pageToken;
  } while (pageToken);
}
