import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { adminAuth, store, bucket } from '../src/lib/admin';
import { cleanSession, closeSession, verifyDeleted } from '../src/lib/cleanup';
import { retentionMs } from '../src/lib/lifecycle';
if (
  process.env.FIREBASE_PROJECT_ID !== 'demo-wow' ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error('These tests require local demo-wow emulators.');
const origin = 'http://127.0.0.1:3000';
const headers = (token: string) => ({
  Origin: origin,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});
async function auth(endpoint: string, data: object) {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=demo-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
  assert.equal(response.status, 200);
  return response.json() as Promise<{ idToken: string; localId: string }>;
}
const guest = () => auth('signUp', { returnSecureToken: true });
const host = await auth('signInWithPassword', {
  email: 'host@wow.local',
  password: 'Workshop-local-2026',
  returnSecureToken: true,
});
async function action(token: string, action: string, data: object = {}) {
  return fetch(`${origin}/api/action`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ action, ...data }),
    signal: AbortSignal.timeout(60_000),
  });
}
async function ok(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
async function create(title: string) {
  const { sessionId } = await ok(await action(host.idToken, 'create', { title }));
  const ref = store.doc(`sessions/${sessionId}`);
  const data = (await ref.get()).data()!;
  assert.equal(data.expiresAt - data.createdAt, 4 * 3600_000);
  return { id: sessionId as string, ref, code: data.code as string };
}
async function cleanupRequest(
  id: string,
  action: string,
  token = host.idToken,
  extra: object = {},
) {
  return fetch(`${origin}/api/cleanup`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ sessionId: id, action, ...extra }),
    signal: AbortSignal.timeout(60_000),
  });
}
const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#95bca5' } })
  .png()
  .toBuffer();
async function upload(id: string, token: string) {
  const data = new FormData();
  data.set('sessionId', id);
  data.set('caption', 'Synthetic sticker');
  data.set('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'sample.png');
  return fetch(`${origin}/api/upload`, {
    method: 'POST',
    headers: { Origin: origin, Authorization: `Bearer ${token}` },
    body: data,
  });
}
async function absentUser(uid: string) {
  await assert.rejects(
    adminAuth.getUser(uid),
    (error: unknown) => (error as { code: string }).code === 'auth/user-not-found',
  );
}
async function waitDeleted(id: string, proof: string) {
  for (let i = 0; i < 100; i++) {
    const result = await ok(await cleanupRequest(id, 'status', host.idToken, { ticket: proof }));
    if (result.state === 'complete') {
      await verifyDeleted(id);
      assert.equal((await store.doc(`cleanupJobs/${id}`).get()).exists, false);
      return;
    }
    if (result.state === 'failed')
      await ok(await cleanupRequest(id, 'retry', host.idToken, { ticket: proof }));
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Cleanup did not finish');
}
assert.equal(retentionMs(), 4 * 3600_000);
const savedRetention = process.env.WORKSHOP_RETENTION_HOURS;
process.env.WORKSHOP_RETENTION_HOURS = '0.5';
assert.equal(retentionMs(), 1800_000);
process.env.WORKSHOP_RETENTION_HOURS = 'bad';
assert.throws(retentionMs);
if (savedRetention === undefined) delete process.env.WORKSHOP_RETENTION_HOURS;
else process.env.WORKSHOP_RETENTION_HOURS = savedRetention;
let previousCode = '';
for (let round = 1; round <= 2; round++) {
  const room = await create(`Sixty participant session ${round}`);
  assert.notEqual(room.code, previousCode);
  previousCode = room.code;
  assert.equal((await room.ref.collection('members').get()).size, 0);
  const guests = await Promise.all(Array.from({ length: 61 }, guest));
  const start = Date.now();
  const joins = await Promise.all(
    guests.map((u, i) =>
      action(u.idToken, 'join', { code: room.code, nickname: `Teacher ${i + 1}` }),
    ),
  );
  assert.equal(joins.filter((r) => r.status === 200).length, 60);
  assert.equal(joins.filter((r) => r.status === 409).length, 1);
  const admitted = guests.filter((_, i) => joins[i].status === 200);
  const overflow = guests.find((_, i) => joins[i].status === 409)!;
  for (const response of await Promise.all(
    admitted.map((u) => action(u.idToken, 'join', { code: room.code, nickname: 'Reconnect' })),
  ))
    await ok(response);
  assert.equal((await room.ref.collection('members').get()).size, 60);
  assert.equal((await room.ref.collection('seats').get()).size, 60);
  const joinMs = Date.now() - start;
  await ok(await action(host.idToken, 'transition', { sessionId: room.id, stage: 'submit' }));
  for (const response of await Promise.all(admitted.map((u) => upload(room.id, u.idToken))))
    await ok(response);
  assert.equal((await bucket.getFiles({ prefix: `sessions/${room.id}/` }))[0].length, 60);
  // One facilitator reviews submissions sequentially, as the dashboard does.
  for (const u of admitted)
    await ok(
      await action(host.idToken, 'moderate', {
        sessionId: room.id,
        submissionId: u.localId,
        status: 'approved',
      }),
    );
  await ok(await action(host.idToken, 'transition', { sessionId: room.id, stage: 'gallery' }));
  await ok(await action(host.idToken, 'advance', { sessionId: room.id }));
  for (const response of await Promise.all(
    admitted.map((u, i) =>
      action(u.idToken, 'vote', {
        sessionId: room.id,
        submissionId: admitted[(i + 1) % 60].localId,
      }),
    ),
  ))
    await ok(response);
  assert.equal(
    (
      await action(admitted[0].idToken, 'vote', {
        sessionId: room.id,
        submissionId: admitted[1].localId,
      })
    ).status,
    409,
  );
  await ok(await action(host.idToken, 'advance', { sessionId: room.id }));
  assert.equal((await room.ref.get()).data()!.totalVotes, 60);
  assert.equal(
    (await cleanupRequest(room.id, 'end', admitted[0].idToken, { confirmed: true })).status,
    403,
  );
  assert.equal((await cleanupRequest(room.id, 'end')).status, 400);
  const end = await ok(await cleanupRequest(room.id, 'end', host.idToken, { confirmed: true }));
  assert.ok(
    (await action(overflow.idToken, 'join', { code: room.code, nickname: 'Too late' })).status >=
      400,
  );
  assert.ok((await upload(room.id, admitted[0].idToken)).status >= 400);
  assert.ok(
    (
      await action(admitted[0].idToken, 'vote', {
        sessionId: room.id,
        submissionId: admitted[1].localId,
      })
    ).status >= 400,
  );
  await waitDeleted(room.id, end.ticket);
  for (const user of admitted) {
    await absentUser(user.localId);
    assert.equal((await store.doc(`identities/${user.localId}`).get()).exists, false);
    assert.equal((await store.collection('limits').where('uid', '==', user.localId).get()).size, 0);
  }
  await ok(await cleanupRequest(room.id, 'retry', host.idToken, { ticket: end.ticket }));
  assert.equal(
    (await cleanupRequest(room.id, 'status', host.idToken, { ticket: '0'.repeat(64) })).status,
    403,
  );
  console.log(
    `PASS session ${round}: 60 admitted, 1 rejected, 60 reconnects (${joinMs}ms), 60 uploads/approvals/votes; all session data and eligible identities deleted.`,
  );
}
// Session isolation, shared anonymous Auth identity, wrong facilitator.
const left = await create('Isolation A');
const right = await create('Isolation B');
const shared = await guest();
for (const room of [left, right])
  await ok(await action(shared.idToken, 'join', { code: room.code, nickname: 'Shared device' }));
const other = await guest();
await adminAuth.setCustomUserClaims(other.localId, { facilitator: true });
const custom = await adminAuth.createCustomToken(other.localId);
const otherToken = await auth('signInWithCustomToken', { token: custom, returnSecureToken: true });
assert.equal(
  (await cleanupRequest(left.id, 'end', otherToken.idToken, { confirmed: true })).status,
  403,
);
await Promise.all(Array.from({ length: 4 }, () => closeSession(left.id, host.localId)));
const ownerJobs = await ok(
  await fetch(`${origin}/api/cleanup`, { headers: headers(host.idToken) }),
);
assert.ok(ownerJobs.jobs.some((j: { id: string }) => j.id === left.id));
const unrelatedJobs = await ok(
  await fetch(`${origin}/api/cleanup`, { headers: headers(otherToken.idToken) }),
);
assert.ok(!unrelatedJobs.jobs.some((j: { id: string }) => j.id === left.id));
assert.equal(
  (await fetch(`${origin}/api/cleanup`, { headers: headers(shared.idToken) })).status,
  403,
);
assert.equal((await fetch(`${origin}/api/cleanup`)).status, 401);

await Promise.all(Array.from({ length: 4 }, () => cleanSession(left.id)));
await verifyDeleted(left.id);
await adminAuth.getUser(shared.localId);
assert.equal((await right.ref.collection('members').get()).size, 1);
await ok(await action(shared.idToken, 'join', { code: right.code, nickname: 'Reconnect' }));
await closeSession(right.id, host.localId);
await cleanSession(right.id);
await absentUser(shared.localId);
await verifyDeleted(right.id);
console.log(
  'PASS concurrent manual cleanup requests, session isolation, shared identity and ownership boundaries.',
);
// Deterministic partial failures and a delayed Storage writer.
const recovery = await create('Recovery');
const op = recovery.ref.collection('uploads').doc('delayed');
const path = `sessions/${recovery.id}/delayed/sticker.webp`;
await op.set({ path, startedAt: Date.now() - 3600_000 });
await closeSession(recovery.id, host.localId);
await cleanSession(recovery.id);
assert.equal((await store.doc(`cleanupJobs/${recovery.id}`).get()).data()!.state, 'failed');
assert.equal((await recovery.ref.get()).exists, true); // stale lease is never proof of completion
await bucket.file(path).save(png, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 } });
await cleanSession(recovery.id, {
  beforeStorage: async () => {
    throw new Error('Injected Storage outage');
  },
});
assert.equal((await store.doc(`cleanupJobs/${recovery.id}`).get()).data()!.state, 'failed');
assert.equal((await bucket.getFiles({ prefix: `sessions/${recovery.id}/` }))[0].length, 1);
await cleanSession(recovery.id, {
  afterStorage: async () => {
    throw new Error('Injected Firestore outage');
  },
});
assert.equal((await store.doc(`cleanupJobs/${recovery.id}`).get()).data()!.state, 'failed');
assert.equal((await bucket.getFiles({ prefix: `sessions/${recovery.id}/` }))[0].length, 0);
await cleanSession(recovery.id);
await verifyDeleted(recovery.id);
console.log(
  'PASS unknown writer blocks success; landed upload reconciliation; Storage/Firestore failure and secure retry.',
);
const verification = await create('Verification failure');
await closeSession(verification.id, host.localId);
await cleanSession(verification.id, {
  afterStorage: async () => {
    await bucket.file(`sessions/${verification.id}/orphan.webp`).save(png, { resumable: false });
  },
});
assert.equal((await store.doc(`cleanupJobs/${verification.id}`).get()).data()!.state, 'failed');
await cleanSession(verification.id);
await verifyDeleted(verification.id);
console.log('PASS remaining-object verification prevents premature completion.');
const racing = await create('Termination races');
const racers = await Promise.all(Array.from({ length: 8 }, guest));
for (const user of racers)
  await ok(await action(user.idToken, 'join', { code: racing.code, nickname: 'Racer' }));
await ok(await action(host.idToken, 'transition', { sessionId: racing.id, stage: 'submit' }));
await ok(await upload(racing.id, racers[0].idToken));
await ok(
  await action(host.idToken, 'moderate', {
    sessionId: racing.id,
    submissionId: racers[0].localId,
    status: 'approved',
  }),
);
await ok(await action(host.idToken, 'transition', { sessionId: racing.id, stage: 'gallery' }));
await ok(await action(host.idToken, 'advance', { sessionId: racing.id }));
const newcomer = await guest();
await Promise.all([
  ...racers
    .slice(1)
    .map((u) =>
      action(u.idToken, 'vote', { sessionId: racing.id, submissionId: racers[0].localId }),
    ),
  action(newcomer.idToken, 'join', { code: racing.code, nickname: 'Racing join' }),
  closeSession(racing.id, host.localId),
]);
assert.equal((await racing.ref.get()).data()!.lifecycle, 'closing');
assert.ok(
  (await action(newcomer.idToken, 'join', { code: racing.code, nickname: 'Late' })).status >= 400,
);
assert.ok(
  (
    await action(racers[1].idToken, 'vote', {
      sessionId: racing.id,
      submissionId: racers[0].localId,
    })
  ).status >= 400,
);
assert.ok((await action(host.idToken, 'advance', { sessionId: racing.id })).status >= 400);
assert.ok(
  (
    await fetch(`${origin}/api/image?sessionId=${racing.id}&submissionId=${racers[0].localId}`, {
      headers: headers(host.idToken),
    })
  ).status >= 400,
);
await cleanSession(racing.id);
await verifyDeleted(racing.id);
console.log('PASS joins/votes racing termination; no subsequent mutations or image access.');
const authFailure = await create('Auth deletion failure');
const retained = await guest();
await ok(await action(retained.idToken, 'join', { code: authFailure.code, nickname: 'Temporary' }));
await closeSession(authFailure.id, host.localId);
const originalDeleteUser = adminAuth.deleteUser.bind(adminAuth);
adminAuth.deleteUser = async () => {
  throw new Error('Injected Auth outage');
};
try {
  await cleanSession(authFailure.id);
} finally {
  adminAuth.deleteUser = originalDeleteUser;
}
assert.equal((await store.doc(`cleanupJobs/${authFailure.id}`).get()).data()!.state, 'failed');
await adminAuth.getUser(retained.localId);
await cleanSession(authFailure.id);
await absentUser(retained.localId);
await verifyDeleted(authFailure.id);
console.log('PASS anonymous Auth deletion failure remains retryable and cannot report completion.');
// A killed request leaves durable work; manual retry takes over only after lease expiry.
const crash = await create('Manual request crash');
const crashGuest = await guest();
await ok(
  await action(crashGuest.idToken, 'join', { code: crash.code, nickname: 'Crash recovery' }),
);
await closeSession(crash.id, host.localId);
const child = spawnSync(
  process.execPath,
  [
    '--env-file=.env.local',
    '--import',
    'tsx',
    '--input-type=module',
    '-e',
    `import { cleanSession } from './src/lib/cleanup.ts'; import { store } from './src/lib/admin.ts'; await cleanSession('${crash.id}', { afterStorage: async () => { await store.recursiveDelete(store.doc('sessions/${crash.id}')); process.exit(73); } });`,
  ],
  { cwd: process.cwd(), timeout: 30_000 },
);
assert.equal(child.status, 73, child.stderr.toString());
assert.equal((await store.doc(`cleanupJobs/${crash.id}`).get()).data()!.state, 'cleaning');
await cleanSession(crash.id);
assert.equal((await crash.ref.get()).exists, false);
await adminAuth.getUser(crashGuest.localId);
await store.doc(`cleanupJobs/${crash.id}`).update({ leaseUntil: 0 }); // advance lease clock without sleeping 2 minutes
await cleanSession(crash.id);
await verifyDeleted(crash.id);
await absentUser(crashGuest.localId);
console.log('PASS process-crash recovery and lease exclusion.');
const expired = await create('Manual deletion after expiry');
const expiredGuest = await guest();
await ok(await action(expiredGuest.idToken, 'join', { code: expired.code, nickname: 'Expiry' }));
await upload(expired.id, expiredGuest.idToken); // stage is closed; no image stored
await expired.ref.update({ expiresAt: Date.now() - 1 });
assert.equal((await action(host.idToken, 'advance', { sessionId: expired.id })).status, 410);
assert.ok((await upload(expired.id, expiredGuest.idToken)).status >= 400);
assert.ok(
  (await action(expiredGuest.idToken, 'join', { code: expired.code, nickname: 'Expired' }))
    .status >= 400,
);
assert.equal((await expired.ref.get()).exists, true);
await adminAuth.getUser(expiredGuest.localId);
assert.equal((await ok(await cleanupRequest(expired.id, 'status'))).state, 'awaiting-confirmation');
// Merely authorizing or polling never starts deletion, even with an issued ticket.
const authorization = await ok(await cleanupRequest(expired.id, 'authorize'));
assert.equal(
  (
    await ok(
      await cleanupRequest(expired.id, 'status', host.idToken, { ticket: authorization.ticket }),
    )
  ).state,
  'awaiting-confirmation',
);
const pending = await ok(await fetch(`${origin}/api/cleanup`, { headers: headers(host.idToken) }));
assert.ok(
  pending.workshops.some((w: { id: string; expired: boolean }) => w.id === expired.id && w.expired),
);
assert.equal((await expired.ref.get()).exists, true);
await ok(await cleanupRequest(expired.id, 'end', host.idToken, { confirmed: true }));
await verifyDeleted(expired.id);
await absentUser(expiredGuest.localId);
// Preserve unrelated project data, orphan anonymous accounts, facilitator accounts,
// permanent accounts and arbitrary member IDs without admission provenance.
const unrelated = await guest();
const protectedRoom = await create('Scope boundaries');
const promoted = await guest();
const linked = await guest();
for (const u of [promoted, linked])
  await ok(await action(u.idToken, 'join', { code: protectedRoom.code, nickname: 'Protected' }));
await adminAuth.setCustomUserClaims(promoted.localId, { facilitator: true });
await adminAuth.updateUser(linked.localId, { email: `linked-${linked.localId}@example.test` });
await protectedRoom.ref
  .collection('members')
  .doc(unrelated.localId)
  .set({ nickname: 'Unproven member' });
await protectedRoom.ref
  .collection('members')
  .doc(host.localId)
  .set({ nickname: 'Facilitator must survive' });
const outsideDoc = store.doc('unrelatedApp/preserve');
await outsideDoc.set({ marker: 'outside WOWMIN' });
const outsideFile = bucket.file('unrelated-app/preserve.txt');
await outsideFile.save('outside WOWMIN');
try {
  await ok(await cleanupRequest(protectedRoom.id, 'end', host.idToken, { confirmed: true }));
  await verifyDeleted(protectedRoom.id);
  for (const uid of [host.localId, promoted.localId, linked.localId, unrelated.localId])
    await adminAuth.getUser(uid);
  assert.equal((await outsideDoc.get()).data()!.marker, 'outside WOWMIN');
  assert.equal((await outsideFile.exists())[0], true);
} finally {
  // Remove only synthetic fixtures this test created, never a production sweep.
  await outsideDoc.delete();
  await outsideFile.delete();
  for (const uid of [promoted.localId, linked.localId, unrelated.localId]) {
    await adminAuth.deleteUser(uid);
    await store.doc(`identities/${uid}`).delete();
  }
}
assert.equal((await adminAuth.getUser(host.localId)).customClaims?.facilitator, true);
console.log(
  'PASS expiry retains data until manual confirmation; no automatic sweeps; unrelated data, facilitators and permanent accounts preserved.',
);
// Old pending records lack the new durable admission evidence: fail closed.
const legacy = await create('Legacy pending cleanup');
const legacyGuest = await guest();
await ok(await action(legacyGuest.idToken, 'join', { code: legacy.code, nickname: 'Legacy' }));
await closeSession(legacy.id, host.localId);
const legacyJob = store.doc(`cleanupJobs/${legacy.id}`);
await legacyJob.update({ membersCaptured: true, members: [legacyGuest.localId] });
await cleanSession(legacy.id);
assert.equal((await legacyJob.get()).data()!.state, 'failed');
await adminAuth.getUser(legacyGuest.localId);
// Trusted fixture recovery only after verifying original admission records exist.
assert.equal((await legacy.ref.collection('members').doc(legacyGuest.localId).get()).exists, true);
assert.equal(
  (await store.doc(`identities/${legacyGuest.localId}`).get()).data()!.sessions[legacy.id],
  true,
);
await legacyJob.update({ membersCaptured: false });
await ok(await cleanupRequest(legacy.id, 'retry'));
await verifyDeleted(legacy.id);
await absentUser(legacyGuest.localId);
console.log('PASS legacy pending jobs cannot claim success without admission evidence.');
console.log('ALL MANUAL DELETION INTEGRATION CHECKS PASSED');
