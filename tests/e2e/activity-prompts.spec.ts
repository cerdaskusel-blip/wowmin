import { test, expect, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

const origin = 'http://127.0.0.1:3000';
async function signIn(request: APIRequestContext) {
  const response = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
    {
      data: { email: 'host@wow.local', password: 'Workshop-local-2026', returnSecureToken: true },
    },
  );
  expect(response.ok()).toBe(true);
  return (await response.json()).idToken as string;
}
function headers(token: string) {
  return { Authorization: `Bearer ${token}`, Origin: origin };
}
async function action(
  request: APIRequestContext,
  token: string,
  action: string,
  data: object = {},
) {
  const response = await request.post('/api/action', {
    headers: headers(token),
    data: { action, ...data },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
for (const count of [1, 2, 3, 4, 5]) {
  test(`template participants join, copy ${count} multiline prompts and upload without Sticker Studio`, async ({
    browser,
    request,
    page: host,
  }) => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    const { getApps, initializeApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(
      getApps().find((app) => app.name === 'step3-prompts') ||
        initializeApp({ projectId: 'demo-wow' }, 'step3-prompts'),
    );
    const token = await signIn(request);
    const prompts = Array.from(
      { length: count },
      (_, i) => `Prompt ${i + 1}: Cipta idea anda.\nBaris kedua kekal.\n\nAkhir prompt ${i + 1}.`,
    );
    const title = `Aktiviti ${count} prompt`;
    const description = 'Arahan fasilitator.\nHasilkan satu karya pilihan anda.';
    const saved = await request.post('/api/activities', {
      headers: headers(token),
      data: {
        action: 'save',
        title,
        description,
        durationMinutes: count === 1 ? 1 : count + 1,
        prompts,
      },
    });
    expect(saved.ok()).toBe(true);
    const { template } = await saved.json();
    let sessionId = '';
    const participantContext = await browser.newContext({
      viewport: count % 2 ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const participant = await participantContext.newPage();
    try {
      ({ sessionId } = await action(request, token, 'create', { templateId: template.id }));
      const session = (await db.doc(`sessions/${sessionId}`).get()).data()!;
      expect(session.stage).toBe('generate');
      expect(session.stageEndsAt - session.createdAt).toBe(template.durationMinutes * 60000);
      expect(session.expiresAt - session.createdAt).toBe(4 * 3600000);
      await host.goto('/facilitator');
      await host.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
      await expect(host.getByRole('button', { name: 'Cipta Sesi', exact: true })).toBeVisible();
      await host.goto(`/session/${sessionId}`);
      await expect(host.locator('.qr svg').first()).toBeVisible();
      // Follow the exact invitation URL shared with the QR, or enter its code manually.
      if (count % 2) {
        await host.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await host.bringToFront();
        await host.getByRole('button', { name: 'Salin Pautan Jemputan' }).click();
        const joinUrl = await host.evaluate(() => navigator.clipboard.readText());
        expect(new URL(joinUrl).searchParams.get('code')).toBe(session.code);
        await participant.goto(joinUrl);
        await expect(participant.getByLabel('Kod Sesi')).toHaveValue(session.code);
      } else {
        await participant.goto('/');
        await participant.getByLabel('Kod Sesi').fill(session.code);
      }
      await participant.getByLabel('Nama Paparan').fill(`Peserta ${count}`);
      await participant.getByRole('button', { name: 'Masuk Bengkel' }).click();
      await expect(participant.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(participant.getByText(description, { exact: true })).toBeVisible();
      const region = participant.getByRole('region', { name: 'Prompt Aktiviti' });
      await expect(region.getByRole('article')).toHaveCount(count);
      await expect(participant.getByLabel('Ubah kapsyen anda')).toHaveCount(0);
      await expect(participant.getByRole('group', { name: 'Koleksi kapsyen' })).toHaveCount(0);
      const headingTimer = participant.locator('.stage-heading .timer');
      const timerText = (await headingTimer.innerText()).replace(/\s/g, '');
      const [minutes, seconds] = timerText.split(':').map(Number);
      expect(minutes * 60 + seconds).toBeGreaterThan(template.durationMinutes * 60 - 45);
      expect(minutes * 60 + seconds).toBeLessThanOrEqual(template.durationMinutes * 60);
      for (let i = 0; i < count; i++) {
        const card = region.getByRole('article').nth(i);
        await expect(card.getByRole('textbox')).toHaveValue(prompts[i]);
        await participant.bringToFront();
        await card.getByRole('button', { name: 'Salin Prompt', exact: true }).click();
        await expect(card.getByRole('status')).toHaveText('Berjaya disalin!');
        expect(await participant.evaluate(() => navigator.clipboard.readText())).toBe(prompts[i]);
      }
      if (count === 5) {
        await participant.evaluate(() => {
          Object.defineProperty(navigator.clipboard, 'writeText', {
            configurable: true,
            value: () => Promise.reject(new Error('Clipboard blocked')),
          });
        });
        const card = region.getByRole('article').first();
        await card.getByRole('button', { name: 'Salin Prompt', exact: true }).click();
        await expect(card.getByRole('alert')).toContainText('Salinan automatik gagal');
        await card.getByRole('button', { name: 'Pilih Teks' }).click();
        expect(
          await card
            .getByRole('textbox')
            .evaluate((input: HTMLTextAreaElement) =>
              input.value.slice(input.selectionStart, input.selectionEnd),
            ),
        ).toBe(prompts[0]);
      }
      expect(
        await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect((await new AxeBuilder({ page: participant }).analyze()).violations).toEqual([]);
      await participant.screenshot({
        path: `test-results/activity-${count}-prompts.png`,
        fullPage: true,
      });
      const png = await sharp({
        create: { width: 128, height: 128, channels: 3, background: '#90a060' },
      })
        .png()
        .toBuffer();
      await participant
        .getByLabel('Gambar karya siap')
        .setInputFiles({ name: 'karya.png', mimeType: 'image/png', buffer: png });
      await participant.getByRole('button', { name: 'Hantar Karya' }).click();
      await expect(
        participant.getByText('Berjaya dihantar! Fasilitator sedang menyemak.'),
      ).toBeVisible();
      const submissions = await db.collection(`sessions/${sessionId}/submissions`).get();
      expect(submissions.size).toBe(1);
      expect(submissions.docs[0].data().nickname).toBe(`Peserta ${count}`);
      expect(submissions.docs[0].data().caption).toBe('');
      const image = await participant.request.get(
        `/api/image?sessionId=${sessionId}&submissionId=${submissions.docs[0].id}`,
      );
      expect(image.status()).toBe(200);
      expect(image.headers()['content-type']).toBe('image/webp');
      if (count === 5) {
        const submissionId = submissions.docs[0].id;
        await action(request, token, 'moderate', { sessionId, submissionId, status: 'approved' });
        await action(request, token, 'transition', { sessionId, stage: 'gallery' });
        await expect(participant.getByRole('region', { name: 'Galeri Karya' })).toBeVisible();
        await action(request, token, 'advance', { sessionId });
        const signup = await request.post(
          'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
          { data: { returnSecureToken: true } },
        );
        const voter = await signup.json();
        await action(request, voter.idToken, 'join', { code: session.code, nickname: 'Pengundi' });
        await action(request, voter.idToken, 'vote', { sessionId, submissionId });
        await action(request, token, 'advance', { sessionId });
        await expect(participant.locator('.winner h3')).toHaveText('Peserta 5');
      }
    } finally {
      if (sessionId) {
        const end = await request.post('/api/cleanup', {
          headers: headers(token),
          data: { sessionId, action: 'end', confirmed: true },
        });
        expect(end.ok(), await end.text()).toBe(true);
        expect((await end.json()).state).toBe('complete');
      }
      const deleted = await request.post('/api/activities', {
        headers: headers(token),
        data: { action: 'delete', id: template.id, confirmed: true },
      });
      expect(deleted.ok()).toBe(true);
      await participantContext.close();
    }
  });
}
