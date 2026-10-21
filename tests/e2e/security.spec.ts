import { test, expect, APIRequestContext } from '@playwright/test';
import sharp from 'sharp';
const origin = 'http://127.0.0.1:3000';
async function guest(request: APIRequestContext) {
  const r = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
    { data: { returnSecureToken: true } },
  );
  expect(r.ok()).toBeTruthy();
  return r.json();
}
async function hostToken(request: APIRequestContext) {
  const r = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
    { data: { email: 'host@wow.local', password: 'Workshop-local-2026', returnSecureToken: true } },
  );
  expect(r.ok()).toBeTruthy();
  return (await r.json()).idToken as string;
}
function act(
  request: APIRequestContext,
  token: string,
  action: string,
  data: Record<string, unknown> = {},
) {
  return request.post('/api/action', {
    timeout: 30000,
    headers: { Authorization: `Bearer ${token}`, Origin: origin },
    data: { action, ...data },
  });
}
test('authorization, protected uploads, moderation locks and atomic voting', async ({
  request,
}) => {
  const h = await hostToken(request);
  const a = await guest(request);
  const b = await guest(request);
  const outsider = await guest(request);
  expect((await act(request, a.idToken, 'create', { title: 'Forbidden' })).status()).toBe(403);
  expect(
    (
      await request.post('/api/action', {
        headers: { Authorization: `Bearer ${h}`, Origin: 'https://untrusted.example' },
        data: { action: 'create', title: 'Forbidden' },
      })
    ).status(),
  ).toBe(403);
  const r = await act(request, h, 'create', { title: 'Security checks' });
  expect(r.ok()).toBeTruthy();
  const { sessionId } = await r.json();
  const s = await request.get(
    `http://127.0.0.1:8080/v1/projects/demo-wow/databases/(default)/documents/sessions/${sessionId}`,
    { headers: { Authorization: `Bearer ${h}` } },
  );
  const code = (await s.json()).fields.code.stringValue;
  for (const u of [a, b])
    expect(
      (
        await act(request, u.idToken, 'join', {
          code,
          nickname: u === a ? 'Creator A' : 'Creator B',
        })
      ).ok(),
    ).toBeTruthy();
  expect((await act(request, a.idToken, 'advance', { sessionId })).status()).toBe(403);
  for (const action of ['pause', 'resume', 'extend', 'transition'])
    expect(
      (
        await act(request, a.idToken, action, {
          sessionId,
          ...(action === 'transition' ? { stage: 'submit' } : {}),
        })
      ).status(),
    ).toBe(403);
  expect(
    (await act(request, outsider.idToken, 'vote', { sessionId, submissionId: a.localId })).status(),
  ).toBe(403);
  expect(
    (await act(request, a.idToken, 'vote', { sessionId, submissionId: b.localId })).status(),
  ).toBe(409);
  const upload = (token: string, buffer: Buffer, mimeType = 'image/png') =>
    request.post('/api/upload', {
      headers: { Authorization: `Bearer ${token}`, Origin: origin },
      multipart: {
        sessionId,
        caption: 'A kind teacher',
        image: { name: 'sticker.png', mimeType, buffer },
      },
    });
  const image = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#aa99cc' },
  })
    .png()
    .toBuffer();
  expect((await upload(a.idToken, image)).status()).toBe(409);
  for (let i = 0; i < 2; i++)
    expect((await act(request, h, 'advance', { sessionId })).ok()).toBeTruthy();
  expect((await act(request, h, 'pause', { sessionId })).ok()).toBeTruthy();
  expect((await upload(a.idToken, image)).status()).toBe(409);
  expect((await act(request, h, 'resume', { sessionId })).ok()).toBeTruthy();
  expect((await upload(a.idToken, Buffer.from('<svg></svg>'), 'image/svg+xml')).status()).toBe(400);
  expect((await upload(a.idToken, image)).ok()).toBeTruthy();
  const imageUrl = `/api/image?sessionId=${sessionId}&submissionId=${a.localId}`;
  expect(
    (await request.get(imageUrl, { headers: { Authorization: `Bearer ${b.idToken}` } })).status(),
  ).toBe(404);
  expect(
    (await request.get(imageUrl, { headers: { Authorization: `Bearer ${a.idToken}` } })).status(),
  ).toBe(200);
  expect(
    (
      await act(request, h, 'moderate', { sessionId, submissionId: a.localId, status: 'approved' })
    ).ok(),
  ).toBeTruthy();
  expect(
    (await request.get(imageUrl, { headers: { Authorization: `Bearer ${b.idToken}` } })).status(),
  ).toBe(200);
  expect(
    (
      await request.get(imageUrl, { headers: { Authorization: `Bearer ${outsider.idToken}` } })
    ).status(),
  ).toBe(403);
  expect((await upload(a.idToken, image)).status()).toBe(409);
  for (let i = 0; i < 3; i++)
    expect((await act(request, h, 'advance', { sessionId })).ok()).toBeTruthy();
  expect(
    (await act(request, a.idToken, 'vote', { sessionId, submissionId: a.localId })).status(),
  ).toBe(409);
  expect(
    (
      await act(request, h, 'moderate', { sessionId, submissionId: a.localId, status: 'rejected' })
    ).status(),
  ).toBe(409);
  expect((await act(request, h, 'transition', { sessionId, stage: 'submit' })).status()).toBe(409);
  const votes = await Promise.all([
    act(request, b.idToken, 'vote', { sessionId, submissionId: a.localId }),
    act(request, b.idToken, 'vote', { sessionId, submissionId: a.localId }),
  ]);
  expect(votes.map((v) => v.status()).sort()).toEqual([200, 409]);
  expect((await act(request, h, 'advance', { sessionId })).ok()).toBeTruthy();
  expect(
    (await act(request, b.idToken, 'vote', { sessionId, submissionId: a.localId })).status(),
  ).toBe(409);
});
test('50 teachers can join one session, and joins are idempotent', async ({ request }) => {
  const token = await hostToken(request);
  const result = await act(request, token, 'create', { title: 'Fifty teacher readiness' });
  expect(result.ok()).toBeTruthy();
  const { sessionId } = await result.json();
  const url = `http://127.0.0.1:8080/v1/projects/demo-wow/databases/(default)/documents/sessions/${sessionId}`;
  const session = await (
    await request.get(url, { headers: { Authorization: `Bearer ${token}` } })
  ).json();
  const code = session.fields.code.stringValue;
  const teachers = await Promise.all(Array.from({ length: 50 }, () => guest(request)));
  await Promise.all(
    teachers.map(async (u, i) => {
      const response = await act(request, u.idToken, 'join', {
        code,
        nickname: `Teacher ${i + 1}`,
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }),
  );
  await Promise.all(
    teachers.map(async (u, i) => {
      expect(
        (await act(request, u.idToken, 'join', { code, nickname: `Teacher ${i + 1}` })).ok(),
      ).toBeTruthy();
    }),
  );
  const final = await (
    await request.get(`${url}/attendance?pageSize=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  expect(final.nextPageToken).toBeUndefined();
  expect(final.documents).toHaveLength(50);
  const remaining = await Promise.all(Array.from({ length: 10 }, () => guest(request)));
  await Promise.all(
    remaining.map(async (u, i) => {
      expect(
        (await act(request, u.idToken, 'join', { code, nickname: `Extra teacher ${i + 1}` })).ok(),
      ).toBeTruthy();
    }),
  );
  const overflow = await guest(request);
  const full = await act(request, overflow.idToken, 'join', { code, nickname: 'Over capacity' });
  expect(full.status()).toBe(409);
  expect((await full.json()).error).toBe('This workshop is full.');
});
