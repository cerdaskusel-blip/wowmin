import assert from 'node:assert/strict';
import sharp from 'sharp';
import { adminAuth, store, bucket } from '../src/lib/admin';
import { verifyDeleted } from '../src/lib/cleanup';

if (
  process.env.FIREBASE_PROJECT_ID !== 'demo-wow' ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error('Release simulation requires local demo-wow emulators.');
const origin = 'http://127.0.0.1:3000';
const headers = (token: string) => ({ Origin: origin, Authorization: `Bearer ${token}` });
type Person = { idToken: string; localId: string };
async function auth(host = false): Promise<Person> {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${host ? 'signInWithPassword' : 'signUp'}?key=demo-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        returnSecureToken: true,
        ...(host ? { email: 'host@wow.local', password: 'Workshop-local-2026' } : {}),
      }),
    },
  );
  assert.equal(response.status, 200);
  return response.json();
}
async function post(path: string, token: string, data: object) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(60_000),
  });
}
async function ok(response: Response) {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
const host = await auth(true);
const people = await Promise.all(Array.from({ length: 60 }, () => auth()));
const overflow = await auth();
const templates: string[] = [];
const sessions: { id: string; code: string; ticket?: string }[] = [];
const action = (token: string, action: string, data: object) =>
  post('/api/action', token, { action, ...data });
const png = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#a4c777' } })
  .png()
  .toBuffer();
async function end(room: (typeof sessions)[number]) {
  const result = await ok(
    await post('/api/cleanup', host.idToken, {
      sessionId: room.id,
      action: 'end',
      confirmed: true,
      ...(room.ticket ? { ticket: room.ticket } : {}),
    }),
  );
  room.ticket = result.ticket;
  assert.equal(result.state, 'complete');
  await verifyDeleted(room.id);
  assert.equal((await store.doc(`cleanupJobs/${room.id}`).get()).exists, false);
}
try {
  for (const [index, title] of ['Sticker WhatsApp AI', 'Poster AI', 'Infografik AI'].entries()) {
    const started = Date.now();
    const prompts = Array.from(
      { length: index * 2 + 1 },
      (_, i) => `Arahan ${i + 1}: ${title}.\nGunakan idea anda sendiri.`,
    );
    const { template } = await ok(
      await post('/api/activities', host.idToken, {
        action: 'save',
        title,
        description: 'Aktiviti rekaan QA sahaja.',
        durationMinutes: 15,
        prompts,
      }),
    );
    templates.push(template.id);
    const { sessionId } = await ok(
      await action(host.idToken, 'create', { templateId: template.id }),
    );
    const session = (await store.doc(`sessions/${sessionId}`).get()).data()!;
    const room = { id: sessionId as string, code: session.code as string };
    assert.ok(!sessions.some((s) => s.code === room.code));
    sessions.push(room);
    assert.deepEqual(session.activity, template);
    assert.equal(session.stageEndsAt - session.createdAt, 15 * 60_000);
    assert.equal(session.expiresAt - session.createdAt, 4 * 3600_000);
    assert.equal((await store.doc(`codes/${room.code}`).get()).data()!.sessionId, room.id);
    const joined = Date.now();
    await Promise.all(
      people.map(async (person, i) => {
        await ok(
          await action(person.idToken, 'join', { code: room.code, nickname: `Cikgu QA ${i + 1}` }),
        );
      }),
    );
    const joinMs = Date.now() - joined;
    assert.equal(
      (await action(overflow.idToken, 'join', { code: room.code, nickname: 'Peserta 61' })).status,
      409,
    );
    // Same authenticated browser identity reconnects under the same display name.
    await Promise.all(
      people.map(async (person, i) => {
        await ok(
          await action(person.idToken, 'join', { code: room.code, nickname: `Cikgu QA ${i + 1}` }),
        );
      }),
    );
    assert.equal((await store.collection(`sessions/${room.id}/members`).get()).size, 60);
    assert.equal((await store.collection(`sessions/${room.id}/seats`).get()).size, 60);
    const uploads = Date.now();
    await Promise.all(
      people.map(async (person) => {
        const data = new FormData();
        data.set('sessionId', room.id);
        data.set('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'qa.png');
        await ok(
          await fetch(`${origin}/api/upload`, {
            method: 'POST',
            headers: headers(person.idToken),
            body: data,
            signal: AbortSignal.timeout(60_000),
          }),
        );
      }),
    );
    const uploadMs = Date.now() - uploads;
    assert.equal((await store.collection(`sessions/${room.id}/submissions`).get()).size, 60);
    assert.equal((await bucket.getFiles({ prefix: `sessions/${room.id}/` }))[0].length, 60);
    for (const person of people)
      await ok(
        await action(host.idToken, 'moderate', {
          sessionId: room.id,
          submissionId: person.localId,
          status: 'approved',
        }),
      );
    await ok(await action(host.idToken, 'transition', { sessionId: room.id, stage: 'gallery' }));
    const image = await fetch(
      `${origin}/api/image?sessionId=${room.id}&submissionId=${people[1].localId}&download=1`,
      { headers: headers(people[0].idToken) },
    );
    assert.equal(image.status, 200);
    assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format, 'webp');
    await ok(await action(host.idToken, 'advance', { sessionId: room.id }));
    assert.equal(
      (
        await action(people[0].idToken, 'vote', {
          sessionId: room.id,
          submissionId: people[0].localId,
        })
      ).status,
      409,
    );
    const votes = Date.now();
    const responses = await Promise.all(
      people.flatMap((person, i) =>
        Array.from({ length: 3 }, () =>
          action(person.idToken, 'vote', {
            sessionId: room.id,
            submissionId: people[(i + 1) % people.length].localId,
          }),
        ),
      ),
    );
    assert.equal(responses.filter((r) => r.status === 200).length, 60);
    assert.equal(responses.filter((r) => r.status === 409).length, 120);
    const voteMs = Date.now() - votes;
    assert.equal((await store.collection(`sessions/${room.id}/votes`).get()).size, 60);
    await ok(await action(host.idToken, 'advance', { sessionId: room.id }));
    const result = (await store.doc(`sessions/${room.id}`).get()).data()!;
    assert.equal(result.totalVotes, 60);
    assert.equal(result.winners.length, 60); // all tied at rank 1, preserved by existing result rules
    assert.ok(
      result.winners.every((w: { rank: number; votes: number }) => w.rank === 1 && w.votes === 1),
    );
    console.log(
      JSON.stringify({
        activity: title,
        participants: 60,
        reconnects: 60,
        uploads: 60,
        votesAccepted: 60,
        duplicateVotesDenied: 120,
        joinMs,
        uploadMs,
        voteMs,
        totalMs: Date.now() - started,
      }),
    );
  }
  // Retain B/C's completed data while deleting A, including shared Auth identities.
  await end(sessions[0]);
  for (const room of sessions.slice(1)) {
    assert.equal((await store.doc(`sessions/${room.id}`).get()).data()!.totalVotes, 60);
    assert.equal((await store.collection(`sessions/${room.id}/members`).get()).size, 60);
    assert.equal((await store.collection(`sessions/${room.id}/votes`).get()).size, 60);
    assert.equal((await bucket.getFiles({ prefix: `sessions/${room.id}/` }))[0].length, 60);
    const image = await fetch(
      `${origin}/api/image?sessionId=${room.id}&submissionId=${people[1].localId}`,
      { headers: headers(people[0].idToken) },
    );
    assert.equal(image.status, 200);
  }
  for (const person of people) await adminAuth.getUser(person.localId);
  for (const id of templates)
    assert.equal((await store.doc(`activityTemplates/${id}`).get()).exists, true);
  await end(sessions[1]);
  for (const person of people) await adminAuth.getUser(person.localId);
  await end(sessions[2]);
  for (const person of people) {
    await assert.rejects(
      adminAuth.getUser(person.localId),
      (e: unknown) => (e as { code: string }).code === 'auth/user-not-found',
    );
    assert.equal((await store.doc(`identities/${person.localId}`).get()).exists, false);
    assert.equal(
      (await store.collection('limits').where('uid', '==', person.localId).get()).empty,
      true,
    );
  }
  for (const id of templates)
    assert.equal((await store.doc(`activityTemplates/${id}`).get()).exists, true);
  await adminAuth.getUser(host.localId);
  console.log(
    'PASS three sequential 60-participant activities, 540 concurrent vote requests, A/B/C isolation, shared identity preservation, verified final deletion and retained templates/facilitator.',
  );
} catch (error) {
  console.error('Release simulation failed before fixture cleanup:', error);
  throw error;
} finally {
  host.idToken = (await auth(true)).idToken;
  for (const room of sessions) await end(room);
  for (const id of templates)
    await ok(
      await post('/api/activities', host.idToken, { action: 'delete', id, confirmed: true }),
    );
  // Remove only this test's anonymous fixtures, including the never-admitted overflow account.
  for (const person of [...people, overflow])
    await adminAuth.deleteUser(person.localId).catch((e: { code: string }) => {
      if (e.code !== 'auth/user-not-found') throw e;
    });
}
