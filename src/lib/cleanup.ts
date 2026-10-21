import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { adminAuth, store, bucket } from './admin';
import { ApiError, sessionRef } from './server';

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
export async function closeSession(id: string, hostId: string) {
  const ref = sessionRef(id);
  const job = store.doc(`cleanupJobs/${id}`);
  await store.runTransaction(async (tx) => {
    const [s, j] = await Promise.all([tx.get(ref), tx.get(job)]);
    const session = s.data();
    if ((session?.hostId ?? j.data()?.hostId) !== hostId)
      throw new ApiError(403, 'Only this workshop’s facilitator can end it.');
    if (!session) {
      if (!j.exists) throw new ApiError(404, 'Workshop not found.');
      return;
    }
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
  const eligible = await store.runTransaction(async (tx) => {
    const job = await tx.get(store.doc(`cleanupJobs/${sid}`));
    const jobData = job.data();
    if (jobData?.lease !== lease) throw new Error('Cleanup lease changed');
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    // Durable admission evidence is captured before removing membership records.
    // An arbitrary Auth UID or an unrelated identity record is never sufficient.
    const temporary = (jobData.temporaryMembers ?? []).includes(uid) && uid !== jobData.hostId;
    if (!temporary && !data?.sessions?.[sid]) return false;
    const sessions = { ...data?.sessions };
    delete sessions[sid];
    const unused = Object.keys(sessions).length === 0;
    if (temporary) tx.set(ref, { ...data, sessions, anonymous: true, deleting: unused });
    else if (snapshot.exists) tx.update(ref, { sessions });
    return temporary && unused;
  });
  if (!eligible) return;
  try {
    const user = await adminAuth.getUser(uid);
    // Preserve facilitators and identities that have become permanent accounts.
    if (
      !user.customClaims?.facilitator &&
      !user.providerData.length &&
      !user.email &&
      !user.phoneNumber
    ) {
      await adminAuth.deleteUser(uid);
      try {
        await adminAuth.getUser(uid);
        throw new Error('Anonymous identity deletion was not verified');
      } catch (error) {
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
      }
    }
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
  }
  // Entry throttles belong to the deleted temporary identity only. Preserve them
  // if Auth is retained (facilitator promotion or provider linking).
  let deleted = false;
  try {
    await adminAuth.getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    deleted = true;
  }
  if (deleted) {
    await removeQuery(store.collection('limits').where('uid', '==', uid));
    await ref.delete();
  } else await ref.update({ deleting: false, anonymous: false });
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
      const path = upload.data().path;
      if (typeof path !== 'string' || !path.startsWith(`sessions/${id}/`))
        throw new Error('Upload path is outside this workshop');
      const [exists] = await bucket.file(path).exists();
      if (exists) await upload.ref.delete();
      else
        throw new Error(
          'Uploads are still settling. Retry cleanup. If this persists, an administrator must reconcile the upload service.',
        );
    }
    await store.runTransaction(async (tx) => {
      const j = (await tx.get(job)).data();
      if (j?.lease !== lease) throw new Error('Cleanup lease changed');
      if (j.membersCaptured) {
        if (!Array.isArray(j.temporaryMembers))
          throw new Error('Legacy cleanup needs admission provenance review');
        return;
      }
      const members = await tx.get(ref.collection('members'));
      const identities = await Promise.all(
        members.docs.map((d) => tx.get(store.doc(`identities/${d.id}`))),
      );
      const temporaryMembers = identities
        .filter(
          (d) =>
            d.data()?.anonymous === true && d.data()?.sessions?.[id] === true && d.id !== j.hostId,
        )
        .map((d) => d.id);
      tx.update(job, {
        members: members.docs.map((d) => d.id),
        temporaryMembers,
        membersCaptured: true,
      });
    });
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
