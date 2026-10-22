import { test, expect } from '@playwright/test';
import sharp from 'sharp';

process.loadEnvFile('.env.local');
if (process.env.FIREBASE_PROJECT_ID !== 'demo-wow' || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Upload boundary tests require demo-wow emulators.');
const origin = 'http://127.0.0.1:3000';
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Origin: origin });

test('upload boundaries: decoded formats, file/body/pixel limits and one approved submission', async ({
  request,
}) => {
  const auth = async (host = false) => {
    const response = await request.post(
      `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${host ? 'signInWithPassword' : 'signUp'}?key=demo-key`,
      {
        data: {
          returnSecureToken: true,
          ...(host ? { email: 'host@wow.local', password: 'Workshop-local-2026' } : {}),
        },
      },
    );
    expect(response.status()).toBe(200);
    return response.json() as Promise<{ idToken: string; localId: string }>;
  };
  const host = await auth(true);
  const action = (token: string, action: string, data: object) =>
    request.post('/api/action', { headers: headers(token), data: { action, ...data } });
  const created = await action(host.idToken, 'create', { title: 'QA upload boundaries' });
  expect(created.status()).toBe(200);
  const { sessionId } = await created.json();
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app =
    getApps().find((a) => a.name === 'step6-upload') ||
    initializeApp({ projectId: 'demo-wow' }, 'step6-upload');
  const store = getFirestore(app);
  const code = (await store.doc(`sessions/${sessionId}`).get()).data()!.code;
  try {
    expect(
      (await action(host.idToken, 'transition', { sessionId, stage: 'generate' })).status(),
    ).toBe(200);
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#a4c777' },
    })
      .png()
      .toBuffer();
    const cases: [string, Buffer, string, number][] = [
      ['PNG', png, 'image/png', 200],
      ['JPEG', await sharp(png).jpeg().toBuffer(), 'image/jpeg', 200],
      ['WebP', await sharp(png).webp().toBuffer(), 'image/webp', 200],
      [
        'SVG',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"/>'),
        'image/svg+xml',
        400,
      ],
      [
        'GIF',
        Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64'),
        'image/gif',
        400,
      ],
      ['corrupt PNG', Buffer.from('not a PNG'), 'image/png', 400],
      ['empty', Buffer.alloc(0), 'image/png', 400],
      [
        '5 MiB exact',
        Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024 - png.length)]),
        'image/png',
        200,
      ],
      ['5 MiB plus one', Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 400],
      ['body over 6 MiB', Buffer.alloc(6 * 1024 * 1024 + 1), 'image/png', 413],
      [
        'over 20 megapixels',
        await sharp({ create: { width: 4001, height: 5000, channels: 3, background: '#a4c777' } })
          .png()
          .toBuffer(),
        'image/png',
        400,
      ],
    ];
    for (const [name, buffer, mimeType, expected] of cases) {
      const person = await auth();
      expect((await action(person.idToken, 'join', { code, nickname: 'QA gambar' })).status()).toBe(
        200,
      );
      const upload = () =>
        request.post('/api/upload', {
          headers: headers(person.idToken),
          multipart: { sessionId, image: { name: 'qa-image', mimeType, buffer } },
        });
      const response = await upload();
      expect(response.status(), `${name}: ${await response.text()}`).toBe(expected);
      const submission = store.doc(`sessions/${sessionId}/submissions/${person.localId}`);
      expect((await submission.get()).exists, name).toBe(expected === 200);
      if (name === 'PNG') {
        expect((await upload()).status()).toBe(200); // replace pending, never append another record
        expect((await store.collection(`sessions/${sessionId}/submissions`).get()).size).toBe(1);
        expect(
          (
            await action(host.idToken, 'moderate', {
              sessionId,
              submissionId: person.localId,
              status: 'approved',
            })
          ).status(),
        ).toBe(200);
        expect((await upload()).status()).toBe(409);
      }
    }
  } finally {
    const result = await request.post('/api/cleanup', {
      headers: headers(host.idToken),
      data: { sessionId, action: 'end', confirmed: true },
    });
    expect(result.status()).toBe(200);
    expect((await result.json()).state).toBe('complete');
  }
});
