import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adminAuth, store } from '../src/lib/admin';
import { verifyDeleted } from '../src/lib/cleanup';
if (
  process.env.FIREBASE_PROJECT_ID !== 'demo-wow' ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error('Activity tests require local demo-wow emulators.');
const origin = 'http://127.0.0.1:3000';
async function auth(endpoint: string, data: object) {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  assert.equal(response.status, 200);
  return response.json() as Promise<{ idToken: string; localId: string }>;
}
const host = await auth('signInWithPassword', {
  email: 'host@wow.local',
  password: 'Workshop-local-2026',
  returnSecureToken: true,
});
const other = await auth('signUp', { returnSecureToken: true });
await adminAuth.setCustomUserClaims(other.localId, { facilitator: true });
const otherAuth = await auth('signInWithCustomToken', {
  token: await adminAuth.createCustomToken(other.localId),
  returnSecureToken: true,
});
const guest = await auth('signUp', { returnSecureToken: true });
const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Origin: origin,
  'Content-Type': 'application/json',
});
async function request(
  path: string,
  token?: string,
  body?: object,
  extraHeaders: Record<string, string> = {},
) {
  return fetch(`${origin}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? headers(token) : {}), ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
}
async function ok(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
const fields = {
  title: `Aktiviti ${randomUUID()}`,
  description: 'Penerangan asal\nuntuk bengkel',
  durationMinutes: 25,
  prompts: ['Cipta ilustrasi bebas.', 'Gunakan idea anda sendiri.'],
};
const ids: string[] = [];
const sessions: string[] = [];
try {
  assert.equal((await request('/api/activities')).status, 401);
  assert.equal((await request('/api/activities', guest.idToken)).status, 403);
  assert.equal(
    (await request('/api/activities', guest.idToken, { action: 'save', ...fields })).status,
    403,
  );
  assert.equal(
    (
      await request(
        '/api/activities',
        host.idToken,
        { action: 'save', ...fields },
        { Origin: 'https://wrong.example' },
      )
    ).status,
    403,
  );
  for (const invalid of [
    { ownerId: other.localId },
    { createdAt: 1 },
    { prompts: [] },
    { prompts: Array(6).fill('x') },
    { prompts: [' '] },
    { durationMinutes: 0 },
    { durationMinutes: 1.5 },
    { id: '../outside' },
  ])
    assert.equal(
      (await request('/api/activities', host.idToken, { action: 'save', ...fields, ...invalid }))
        .status,
      400,
    );
  const { template: saved } = await ok(
    await request('/api/activities', host.idToken, { action: 'save', ...fields }),
  );
  ids.push(saved.id);
  assert.equal(saved.ownerId, host.localId);
  assert.ok(saved.createdAt > 0 && saved.updatedAt >= saved.createdAt);
  assert.ok(
    (await ok(await request('/api/activities', host.idToken))).templates.some(
      (t: { id: string }) => t.id === saved.id,
    ),
  );
  assert.ok(
    !(await ok(await request('/api/activities', otherAuth.idToken))).templates.some(
      (t: { id: string }) => t.id === saved.id,
    ),
  );
  for (const body of [
    { action: 'save', id: saved.id, ...fields },
    { action: 'delete', id: saved.id, confirmed: true },
  ])
    assert.equal((await request('/api/activities', otherAuth.idToken, body)).status, 403);
  assert.equal(
    (await request('/api/action', otherAuth.idToken, { action: 'create', templateId: saved.id }))
      .status,
    403,
  );
  assert.equal(
    (await request('/api/action', guest.idToken, { action: 'create', templateId: saved.id }))
      .status,
    403,
  );
  const { sessionId: first } = await ok(
    await request('/api/action', host.idToken, {
      action: 'create',
      templateId: saved.id,
      title: 'Client cannot override template title',
    }),
  );
  sessions.push(first);
  const firstData = (await store.doc(`sessions/${first}`).get()).data()!;
  assert.equal(firstData.title, fields.title);
  assert.deepEqual(firstData.activity, saved);
  assert.equal(firstData.hostId, host.localId);
  assert.equal(firstData.expiresAt - firstData.createdAt, 4 * 3600000);
  assert.equal((await store.doc(`codes/${firstData.code}`).get()).data()!.sessionId, first);
  const revised = {
    ...fields,
    title: 'Aktiviti disunting',
    durationMinutes: 40,
    prompts: ['Prompt baharu'],
  };
  const { template: updated } = await ok(
    await request('/api/activities', host.idToken, { action: 'save', id: saved.id, ...revised }),
  );
  assert.equal(updated.createdAt, saved.createdAt);
  assert.ok(updated.updatedAt > saved.updatedAt);
  assert.deepEqual((await store.doc(`sessions/${first}`).get()).data()!.activity, saved);
  const { sessionId: second } = await ok(
    await request('/api/action', host.idToken, { action: 'create', templateId: saved.id }),
  );
  sessions.push(second);
  const secondData = (await store.doc(`sessions/${second}`).get()).data()!;
  assert.deepEqual(secondData.activity, updated);
  assert.notEqual(secondData.code, firstData.code);
  const ended = await ok(
    await request('/api/cleanup', host.idToken, {
      sessionId: first,
      action: 'end',
      confirmed: true,
    }),
  );
  assert.equal(ended.state, 'complete');
  await verifyDeleted(first);
  assert.deepEqual((await store.doc(`activityTemplates/${saved.id}`).get()).data(), {
    ...revised,
    ownerId: host.localId,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
  assert.equal(
    (await request('/api/activities', host.idToken, { action: 'delete', id: saved.id })).status,
    400,
  );
  await ok(
    await request('/api/activities', host.idToken, {
      action: 'delete',
      id: saved.id,
      confirmed: true,
    }),
  );
  assert.equal((await store.doc(`activityTemplates/${saved.id}`).get()).exists, false);
  assert.deepEqual((await store.doc(`sessions/${second}`).get()).data()!.activity, updated);
  assert.equal(
    (await request('/api/action', host.idToken, { action: 'create', templateId: saved.id })).status,
    404,
  );
  const legacy = await ok(
    await request('/api/action', host.idToken, { action: 'create', title: 'Legacy compatibility' }),
  );
  sessions.push(legacy.sessionId);
  assert.equal((await store.doc(`sessions/${legacy.sessionId}`).get()).data()!.activity, undefined);
  console.log(
    'PASS template validation, server-owned metadata, CRUD, ownership/origin enforcement, immutable session snapshots, independent deletion and legacy session creation.',
  );
} finally {
  for (const id of sessions) {
    if (
      (await store.doc(`sessions/${id}`).get()).exists ||
      (await store.doc(`cleanupJobs/${id}`).get()).exists
    )
      await ok(
        await request('/api/cleanup', host.idToken, {
          sessionId: id,
          action: 'end',
          confirmed: true,
        }),
      );
    await verifyDeleted(id);
  }
  for (const id of ids) await store.doc(`activityTemplates/${id}`).delete();
  for (const uid of [other.localId, guest.localId]) {
    await adminAuth.deleteUser(uid);
    await store.doc(`identities/${uid}`).delete();
    const limits = await store.collection('limits').where('uid', '==', uid).get();
    for (const limit of limits.docs) await limit.ref.delete();
  }
}
