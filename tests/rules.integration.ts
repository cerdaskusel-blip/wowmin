import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
const env = await initializeTestEnvironment({
  projectId: 'demo-wow-rules',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  storage: { host: '127.0.0.1', port: 9199, rules: readFileSync('storage.rules', 'utf8') },
});
try {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sessions/room'), { hostId: 'host', expiresAt: Date.now() + 60000 });
    await setDoc(doc(db, 'sessions/room/members/alice'), { nickname: 'Alice' });
    await setDoc(doc(db, 'sessions/room/members/bob'), { nickname: 'Bob' });
    await setDoc(doc(db, 'sessions/room/submissions/alice'), { status: 'pending' });
    await setDoc(doc(db, 'sessions/room/submissions/bob'), { status: 'approved' });
    await setDoc(doc(db, 'sessions/room/votes/alice'), { submissionId: 'bob' });
    await setDoc(doc(db, 'activityTemplates/owned'), {
      ownerId: 'host',
      title: 'Private activity',
    });
    await setDoc(doc(db, 'codes/SECRET'), { sessionId: 'room' });
    await setDoc(doc(db, 'sessions/room/attendance/alice'), { joinedAt: Date.now() });
    await setDoc(doc(db, 'sessions/room/seats/0'), { memberId: 'alice' });
  });
  const a = env.authenticatedContext('alice').firestore();
  const b = env.authenticatedContext('bob').firestore();
  const host = env.authenticatedContext('host', { facilitator: true }).firestore();
  const outsider = env.authenticatedContext('outsider').firestore();
  // Templates use authenticated backend operations; direct client access stays denied.
  await assertFails(getDoc(doc(host, 'activityTemplates/owned')));
  await assertFails(getDoc(doc(outsider, 'activityTemplates/owned')));
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), 'activityTemplates/owned')),
  );
  await assertFails(
    getDocs(query(collection(host, 'activityTemplates'), where('ownerId', '==', 'host'))),
  );
  await assertFails(setDoc(doc(host, 'activityTemplates/new'), { ownerId: 'host' }));
  await assertFails(setDoc(doc(outsider, 'activityTemplates/forged'), { ownerId: 'host' }));
  await assertFails(updateDoc(doc(host, 'activityTemplates/owned'), { title: 'Bypass backend' }));
  await assertFails(deleteDoc(doc(host, 'activityTemplates/owned')));
  await assertSucceeds(getDoc(doc(a, 'sessions/room')));
  await assertFails(getDoc(doc(outsider, 'sessions/room')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'sessions/room')));
  await assertSucceeds(getDoc(doc(a, 'sessions/room/submissions/alice')));
  await assertFails(getDoc(doc(b, 'sessions/room/submissions/alice')));
  await assertSucceeds(
    getDocs(query(collection(a, 'sessions/room/submissions'), where('status', '==', 'approved'))),
  );
  await assertFails(getDocs(collection(a, 'sessions/room/submissions')));
  await assertSucceeds(getDocs(collection(host, 'sessions/room/submissions')));
  await assertFails(setDoc(doc(a, 'sessions/room/submissions/alice'), { status: 'approved' }));
  await assertFails(setDoc(doc(host, 'sessions/room'), { stage: 'results' }));
  await assertFails(setDoc(doc(a, 'sessions/room/votes/alice'), { submissionId: 'bob' }));
  await assertFails(getDoc(doc(b, 'sessions/room/votes/alice')));
  await assertFails(getDoc(doc(a, 'codes/SECRET')));
  await assertFails(getDocs(collection(a, 'sessions/room/members')));
  await assertFails(
    uploadBytes(
      ref(env.authenticatedContext('alice').storage(), 'sessions/room/alice/test.png'),
      new Uint8Array([1, 2, 3]),
    ),
  );
  await assertFails(
    getBytes(ref(env.authenticatedContext('alice').storage(), 'sessions/room/alice/test.png')),
  );
  await assertSucceeds(getDocs(collection(a, 'sessions/room/attendance')));
  await assertFails(getDocs(collection(outsider, 'sessions/room/attendance')));
  await assertFails(setDoc(doc(a, 'sessions/room/attendance/forged'), {}));
  await assertFails(getDoc(doc(a, 'sessions/room/seats/0')));
  await assertFails(
    setDoc(doc(a, 'sessions/room/attendance/alice'), { voted: true, submitted: true }),
  );
  await assertFails(getDocs(collection(host, 'sessions/room/votes')));
  await assertFails(setDoc(doc(host, 'sessions/room'), { pausedRemainingMs: 60000 }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'sessions/room'), {
      hostId: 'host',
      expiresAt: Date.now() + 60000,
      lifecycle: 'closing',
    });
    await setDoc(doc(ctx.firestore(), 'cleanupJobs/room'), { hostId: 'host' });
  });
  await assertFails(getDoc(doc(a, 'sessions/room')));
  await assertFails(getDocs(collection(host, 'sessions/room/submissions')));
  await assertFails(getDoc(doc(a, 'sessions/room/members/alice')));
  await assertFails(getDoc(doc(host, 'cleanupJobs/room')));
  await assertFails(setDoc(doc(host, 'cleanupJobs/room'), { state: 'complete' }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'sessions/room'), {
      hostId: 'host',
      expiresAt: 0,
      lifecycle: 'active',
    });
  });
  await assertFails(getDoc(doc(host, 'sessions/room')));
  await assertFails(getDoc(doc(a, 'sessions/room/votes/alice')));
  console.log('Firestore and Storage rules: 38 authorization checks passed.');
} finally {
  await env.cleanup();
}
