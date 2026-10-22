import { test, expect, devices, webkit, Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import type { ActivityTemplate } from '../../src/lib/activities';

// Never run trusted fixtures against a production project.
process.loadEnvFile('.env.local');
if (
  process.env.FIREBASE_PROJECT_ID !== 'demo-wow' ||
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !process.env.FIREBASE_STORAGE_EMULATOR_HOST
)
  throw new Error('Download tests require local demo-wow emulators.');
const { getApps, initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');
const { getAuth } = await import('firebase-admin/auth');
// Other suites initialize Admin apps without Storage. Keep this fixture isolated.
const app =
  getApps().find((a) => a.name === 'step4-downloads') ||
  initializeApp(
    {
      projectId: 'demo-wow',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    },
    'step4-downloads',
  );
const store = getFirestore(app);
const bucket = getStorage(app).bucket();
const adminAuth = getAuth(app);
const origin = 'http://127.0.0.1:3000';
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Origin: origin });
type Person = { idToken: string; localId: string };
async function auth(request: APIRequestContext, host = false): Promise<Person> {
  const response = await request.post(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${host ? 'signInWithPassword' : 'signUp'}?key=demo-key`,
    {
      data: {
        returnSecureToken: true,
        ...(host ? { email: 'host@wow.local', password: 'Workshop-local-2026' } : {}),
      },
    },
  );
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function action(request: APIRequestContext, token: string, action: string, data: object) {
  return request.post('/api/action', {
    headers: headers(token),
    data: { action, ...data },
    timeout: 60000,
  });
}
async function ok<T = Record<string, unknown>>(
  response: Awaited<ReturnType<APIRequestContext['post']>>,
): Promise<T> {
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as T;
}
async function create(request: APIRequestContext, token: string, templateId?: string) {
  const { sessionId } = await ok<{ sessionId: string }>(
    await action(request, token, 'create', {
      title: 'Galeri muat turun',
      ...(templateId ? { templateId } : {}),
    }),
  );
  const session = (await store.doc(`sessions/${sessionId}`).get()).data()!;
  return { id: sessionId as string, code: session.code as string };
}
async function upload(request: APIRequestContext, room: string, person: Person, png: Buffer) {
  await ok(
    await request.post('/api/upload', {
      headers: headers(person.idToken),
      timeout: 60000,
      multipart: {
        sessionId: room,
        caption: '',
        image: { name: 'karya.png', mimeType: 'image/png', buffer: png },
      },
    }),
  );
}
async function end(request: APIRequestContext, token: string, id: string) {
  const result = await ok(
    await request.post('/api/cleanup', {
      headers: headers(token),
      timeout: 60000,
      data: { sessionId: id, action: 'end', confirmed: true },
    }),
  );
  expect(result.state).toBe('complete');
  expect((await store.doc(`sessions/${id}`).get()).exists).toBe(false);
  expect(await store.doc(`sessions/${id}`).listCollections()).toHaveLength(0);
  expect((await bucket.getFiles({ prefix: `sessions/${id}/` }))[0]).toHaveLength(0);
  expect((await store.doc(`cleanupJobs/${id}`).get()).exists).toBe(false);
}
async function join(page: Page, code: string, nickname: string): Promise<Person> {
  await page.goto('/?code=' + code);
  await page.getByLabel('Your nickname').fill(nickname);
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/action') && r.request().postDataJSON()?.action === 'join',
  );
  await page.getByRole('button', { name: 'Join the workshop' }).click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const token = result.request().headers().authorization.replace('Bearer ', '');
  const [member] = (
    await store
      .collection(`sessions/${(await result.json()).sessionId}/members`)
      .where('nickname', '==', nickname)
      .get()
  ).docs;
  return { idToken: token, localId: member.id };
}
const imageUrl = (sessionId: string, submissionId: string, download = true) =>
  `/api/image?sessionId=${sessionId}&submissionId=${submissionId}${download ? '&download=1' : ''}`;
async function savedWebp(page: Page, nickname: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: `Muat Turun karya ${nickname}`, exact: true }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/^wow-mean-karya-[a-z0-9-]+\.webp$/);
  expect(await file.failure()).toBeNull();
  const bytes = readFileSync((await file.path())!);
  expect((await sharp(bytes).metadata()).format).toBe('webp');
  return bytes;
}

test('60 participants: protected downloads, atomic votes, live gallery, ties and verified manual deletion', async ({
  browser,
  request,
  page: host,
  playwright,
}) => {
  test.setTimeout(360000);
  const facilitator = await auth(request, true);
  const { template } = await ok<{ template: ActivityTemplate }>(
    await request.post('/api/activities', {
      headers: headers(facilitator.idToken),
      data: {
        action: 'save',
        title: 'Karya bengkel',
        description: 'Cipta satu gambar.',
        durationMinutes: 30,
        prompts: ['Cipta karya anda.'],
      },
    }),
  );
  const sessions: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const participant = await context.newPage();
  const outsiderRequest = await playwright.request.newContext({ baseURL: origin });
  let downloaded: Buffer | undefined;
  try {
    const room = await create(request, facilitator.idToken, template.id);
    sessions.push(room.id);
    const first = await join(participant, room.code, 'Cikgu Áina');
    const crowd = [first, ...(await Promise.all(Array.from({ length: 59 }, () => auth(request))))];
    await Promise.all(
      crowd.slice(1).map(async (u, i) =>
        ok(
          await action(request, u.idToken, 'join', {
            code: room.code,
            nickname: `Peserta ${i + 2}`,
          }),
        ),
      ),
    );
    const outsider = await auth(outsiderRequest);
    expect(
      (
        await action(outsiderRequest, outsider.idToken, 'join', {
          code: room.code,
          nickname: 'Peserta 61',
        })
      ).status(),
    ).toBe(409);
    await ok(
      await action(request, first.idToken, 'join', { code: room.code, nickname: 'Cikgu Áina' }),
    );
    expect((await store.collection(`sessions/${room.id}/members`).get()).size).toBe(60);
    const otherRoom = await create(request, facilitator.idToken);
    sessions.push(otherRoom.id);
    await ok(
      await action(outsiderRequest, outsider.idToken, 'join', {
        code: otherRoom.code,
        nickname: 'Sesi lain',
      }),
    );
    await ok(
      await action(request, facilitator.idToken, 'transition', {
        sessionId: otherRoom.id,
        stage: 'submit',
      }),
    );
    const png = await sharp({
      create: { width: 128, height: 128, channels: 3, background: '#90a060' },
    })
      .png()
      .toBuffer();
    await upload(outsiderRequest, otherRoom.id, outsider, png);
    await ok(
      await action(request, facilitator.idToken, 'moderate', {
        sessionId: otherRoom.id,
        submissionId: outsider.localId,
        status: 'approved',
      }),
    );
    await expect(
      participant.getByText(
        'Karya yang dihantar akan dipaparkan dalam galeri dan boleh dimuat turun oleh peserta bengkel.',
      ),
    ).toBeVisible();
    await participant
      .getByLabel('Finished sticker image')
      .setInputFiles({ name: 'karya.png', mimeType: 'image/png', buffer: png });
    await participant.getByRole('button', { name: 'Send to the showcase' }).click();
    await expect(participant.getByText('Sent! Your facilitator is taking a look.')).toBeVisible();
    await Promise.all(crowd.slice(1).map((u) => upload(request, room.id, u, png)));
    const secondUrl = imageUrl(room.id, crowd[1].localId);
    expect((await outsiderRequest.get(secondUrl)).status()).toBe(401);
    expect(
      (await outsiderRequest.get(secondUrl, { headers: headers(outsider.idToken) })).status(),
    ).toBe(403);
    expect(
      (
        await request.get(imageUrl(otherRoom.id, outsider.localId), {
          headers: headers(first.idToken),
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.get(imageUrl(room.id, outsider.localId), { headers: headers(first.idToken) })
      ).status(),
    ).toBe(404);
    expect((await request.get(secondUrl, { headers: headers(first.idToken) })).status()).toBe(404); // pending moderation
    expect((await request.get(secondUrl, { headers: headers(facilitator.idToken) })).status()).toBe(
      200,
    );
    for (const u of crowd)
      await ok(
        await action(request, facilitator.idToken, 'moderate', {
          sessionId: room.id,
          submissionId: u.localId,
          status: 'approved',
        }),
      );
    const response = await request.get(secondUrl, { headers: headers(first.idToken) });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    expect(response.headers()['content-disposition']).toBe(
      'attachment; filename="wow-mean-karya-peserta-2.webp"',
    );
    expect(response.headers()['cache-control']).toBe('private, no-store');
    const subRef = store.doc(`sessions/${room.id}/submissions/${crowd[1].localId}`);
    const sub = (await subRef.get()).data()!;
    const [original] = await bucket.file(sub.storagePath).download();
    expect(await response.body()).toEqual(original);
    expect((await sharp(original).metadata()).format).toBe('webp');
    // A corrupted reference must never expose an object from a different session.
    const foreign = (
      await store.doc(`sessions/${otherRoom.id}/submissions/${outsider.localId}`).get()
    ).data()!;
    await subRef.update({ storagePath: foreign.storagePath });
    expect((await request.get(secondUrl, { headers: headers(first.idToken) })).status()).toBe(404);
    await subRef.update({ storagePath: sub.storagePath });
    await host.goto('/facilitator');
    await host.getByRole('button', { name: 'Enter local facilitator studio' }).click();
    await host.goto(`/session/${room.id}`);
    await ok(
      await action(request, facilitator.idToken, 'transition', {
        sessionId: room.id,
        stage: 'gallery',
      }),
    );
    await expect(participant.locator('.gallery-card')).toHaveCount(60);
    await expect(host.getByLabel('Live workshop totals')).toContainText('60 approved');
    downloaded = await savedWebp(participant, 'Peserta 2');
    expect(downloaded).toEqual(original);
    await savedWebp(host, 'Cikgu Áina');
    expect((await bucket.getFiles({ prefix: `sessions/${room.id}/` }))[0]).toHaveLength(60);
    const projector = await host.context().newPage();
    await projector.goto(`/projector/${room.id}`);
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
    ]) {
      await projector.setViewportSize(viewport);
      await expect(projector.locator('.gallery-card')).toHaveCount(60);
      await expect(projector.locator('.gallery-card').last()).toBeInViewport();
      expect(
        await projector
          .locator('.gallery-card')
          .evaluateAll((cards) =>
            cards.every((c) => c.getBoundingClientRect().bottom <= innerHeight),
          ),
      ).toBe(true);
      expect(
        (await projector.locator('.wall-image-button').first().boundingBox())!.height,
      ).toBeGreaterThan(25);
      await projector.screenshot({ path: `test-results/step4-wall-60-${viewport.width}.png` });
    }
    await savedWebp(projector, 'Peserta 2');
    await expect(projector.getByRole('dialog', { name: 'Muat turun karya' })).toBeVisible();
    await projector.keyboard.press('Escape');
    await expect(projector.getByRole('dialog')).toHaveCount(0);
    await expect(
      projector.getByRole('button', { name: 'Muat Turun karya Peserta 2', exact: true }),
    ).toBeFocused();
    await participant.setViewportSize({ width: 390, height: 844 });
    expect(
      await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page: participant })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await participant.screenshot({ path: 'test-results/step4-gallery-mobile.png' });
    await ok(await action(request, facilitator.idToken, 'advance', { sessionId: room.id }));
    expect(
      (
        await action(request, first.idToken, 'vote', {
          sessionId: room.id,
          submissionId: first.localId,
        })
      ).status(),
    ).toBe(409);
    // 24 + 24 + 12 votes, avoiding self votes; every voter sends three simultaneous requests.
    const targets: number[] = crowd.map((_, i) => (i < 24 ? 0 : i < 48 ? 1 : 2));
    [targets[0], targets[24]] = [targets[24], targets[0]];
    const results = await Promise.all(
      crowd.map(async (u, i) => {
        const responses = await Promise.all(
          Array.from({ length: 3 }, () =>
            action(request, u.idToken, 'vote', {
              sessionId: room.id,
              submissionId: crowd[targets[i]].localId,
            }),
          ),
        );
        expect(responses.map((r) => r.status()).sort()).toEqual([200, 409, 409]);
      }),
    );
    expect(results).toHaveLength(60);
    expect((await store.collection(`sessions/${room.id}/votes`).get()).size).toBe(60);
    expect(
      (
        await action(request, first.idToken, 'vote', {
          sessionId: room.id,
          submissionId: crowd[2].localId,
        })
      ).status(),
    ).toBe(409);
    await expect(host.getByLabel('Live workshop totals')).toContainText('60 / 60 votes cast');
    await expect(participant.getByText('Your vote is counted', { exact: true })).toBeVisible();
    await ok(await action(request, facilitator.idToken, 'advance', { sessionId: room.id }));
    const final = (await store.doc(`sessions/${room.id}`).get()).data()!;
    expect(final.totalVotes).toBe(60);
    expect(final.winners.map((w: { rank: number; votes: number }) => [w.rank, w.votes])).toEqual([
      [1, 24],
      [1, 24],
      [3, 12],
    ]);
    expect(new Set(final.winners.map((w: { id: string }) => w.id))).toEqual(
      new Set(crowd.slice(0, 3).map((u) => u.localId)),
    );
    await expect(participant.locator('.winner')).toHaveCount(3);
    await expect(projector.locator('.winner')).toHaveCount(3);
    // Wait for all three reveal animations, including the delayed rank-3 card.
    for (const winner of await projector.locator('.winner').all())
      await expect(winner).toHaveCSS('opacity', '1');
    await expect
      .poll(() =>
        projector
          .locator('.winner img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
    ]) {
      await projector.setViewportSize(viewport);
      expect(
        await projector.locator('.winner').evaluateAll((cards) =>
          cards.every((c) => {
            const rect = c.getBoundingClientRect();
            return (
              rect.top >= 0 &&
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.bottom <= innerHeight
            );
          }),
        ),
      ).toBe(true);
      await projector.screenshot({ path: `test-results/step4-top3-ties-${viewport.width}.png` });
    }
    await end(request, facilitator.idToken, room.id);
    expect((await request.get(secondUrl, { headers: headers(facilitator.idToken) })).status()).toBe(
      404,
    );
    expect((await bucket.getFiles({ prefix: `sessions/${room.id}/` }))[0]).toHaveLength(0);
    expect((await store.doc(`activityTemplates/${template.id}`).get()).exists).toBe(true);
    expect((await bucket.file(sub.storagePath).exists())[0]).toBe(false);
    expect((await store.doc(`sessions/${otherRoom.id}`).get()).exists).toBe(true);
    for (const u of crowd)
      await expect(adminAuth.getUser(u.localId)).rejects.toMatchObject({
        code: 'auth/user-not-found',
      });
    expect((await adminAuth.getUser(facilitator.localId)).customClaims?.facilitator).toBe(true);
    expect((await sharp(downloaded).metadata()).format).toBe('webp'); // saved files are unaffected
    console.log(
      'PASS 60 participants, 60 uploads, 180 concurrent vote requests -> 60 votes; protected identical WebP downloads, 24/24/12 ties, projector, verified deletion and preserved template.',
    );
    await projector.close();
  } finally {
    for (const id of sessions)
      if ((await store.doc(`sessions/${id}`).get()).exists)
        await end(request, facilitator.idToken, id);
    await ok(
      await request.post('/api/activities', {
        headers: headers(facilitator.idToken),
        data: { action: 'delete', id: template.id, confirmed: true },
      }),
    );
    await context.close();
    await outsiderRequest.dispose();
  }
});

for (const profile of ['Android Chrome', 'iPhone fallback', 'iPhone WebKit'] as const) {
  test(`${profile}: legacy gallery downloads, Malay failure, retry and manual open/save`, async ({
    browser,
    request,
  }) => {
    test.skip(
      profile === 'iPhone WebKit' && !existsSync(webkit.executablePath()),
      'WebKit is not installed; run on Safari/iPhone before release.',
    );
    const safari = profile === 'iPhone WebKit' ? await webkit.launch() : null;
    const { defaultBrowserType, ...device } =
      devices[profile === 'Android Chrome' ? 'Pixel 7' : 'iPhone 13'];
    const mobile = await (safari || browser).newContext(device);
    const participant = await mobile.newPage();
    const host = await auth(request, true);
    const room = await create(request, host.idToken);
    try {
      const a = await join(participant, room.code, 'Cikgu A');
      const b = await auth(request);
      await ok(await action(request, b.idToken, 'join', { code: room.code, nickname: 'Cikgu B' }));
      await ok(
        await action(request, host.idToken, 'transition', { sessionId: room.id, stage: 'submit' }),
      );
      const png = await sharp({
        create: { width: 64, height: 64, channels: 3, background: '#90a060' },
      })
        .png()
        .toBuffer();
      await upload(request, room.id, b, png);
      await ok(
        await action(request, host.idToken, 'moderate', {
          sessionId: room.id,
          submissionId: b.localId,
          status: 'approved',
        }),
      );
      await ok(
        await action(request, host.idToken, 'transition', { sessionId: room.id, stage: 'gallery' }),
      );
      await expect(participant.locator('.gallery-card')).toHaveCount(1);
      const button = participant.getByRole('button', {
        name: 'Muat Turun karya Cikgu B',
        exact: true,
      });
      await participant.route('**/api/image?**download=1', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      await button.click();
      await expect(participant.locator('.artwork-download').getByRole('alert')).toContainText(
        'Muat turun gagal. Semak sambungan dan cuba lagi.',
      );
      await participant.unroute('**/api/image?**download=1');
      await savedWebp(participant, 'Cikgu B');
      await expect(
        participant.getByRole('status').filter({ hasText: 'Muat turun dimulakan' }),
      ).toBeVisible();
      const popup = participant.waitForEvent('popup');
      await participant
        .getByRole('link', { name: 'Buka Gambar karya Cikgu B untuk simpan secara manual' })
        .click();
      const opened = await popup;
      await opened.waitForLoadState();
      expect(opened.url()).toContain(imageUrl(room.id, b.localId, false));
      expect(
        await opened
          .locator('img')
          .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      ).toBe(true);
      await opened.close();
      expect(
        await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await participant.screenshot({
        path: `test-results/step4-${profile.replaceAll(' ', '-')}.png`,
      });
      const downloadUrl = imageUrl(room.id, b.localId);
      expect((await participant.request.get(downloadUrl)).status()).toBe(200); // same-session HttpOnly cookie fallback
      await end(request, host.idToken, room.id);
      expect((await participant.request.get(downloadUrl)).status()).toBe(401);
      expect(a.localId).not.toBe(b.localId);
    } finally {
      if ((await store.doc(`sessions/${room.id}`).get()).exists)
        await end(request, host.idToken, room.id);
      await mobile.close();
      await safari?.close();
    }
  });
}
