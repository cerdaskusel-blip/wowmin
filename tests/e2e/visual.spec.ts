import { test, expect, Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

process.loadEnvFile('.env.local');
if (process.env.FIREBASE_PROJECT_ID !== 'demo-wow' || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error('Visual review requires local demo-wow emulators.');
const origin = 'http://127.0.0.1:3000';
const folder = 'docs/screenshots/v2-step-5';
const headers = (token: string) => ({ Authorization: `Bearer ${token}`, Origin: origin });
async function auth(request: APIRequestContext, host = false) {
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
}
async function action(request: APIRequestContext, token: string, action: string, data: object) {
  const response = await request.post('/api/action', {
    headers: headers(token),
    data: { action, ...data },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function capture(
  page: Page,
  name: string,
  viewport: { width: number; height: number },
  fullPage = true,
) {
  await page.setViewportSize(viewport);
  await page.evaluate(async () => {
    await document.fonts.ready;
    scrollTo(0, 0);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();
  expect(result.violations, name).toEqual([]);
  await page.screenshot({ path: `${folder}/${name}.png`, fullPage });
}
async function pair(page: Page, name: string, fullPage = true) {
  await capture(page, `${name}-mobile`, { width: 390, height: 844 }, fullPage);
  await capture(page, `${name}-desktop`, { width: 1440, height: 1000 }, fullPage);
  for (const width of [320, 768, 1920]) {
    await page.setViewportSize({ width, height: 1024 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${name} at ${width}px`,
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function artwork(index: number) {
  const palettes = [
    ['#f870aa', '#fff2c9'],
    ['#a8c67d', '#183c34'],
    ['#ffcf58', '#1a376c'],
    ['#86c8ef', '#7c2251'],
  ];
  const [background, foreground] = palettes[index];
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${background}"/><circle cx="300" cy="240" r="150" fill="${foreground}"/><path d="M190 240h220M300 130v220" stroke="${background}" stroke-width="32"/><text x="300" y="470" font-family="sans-serif" font-weight="bold" font-size="62" text-anchor="middle" fill="${foreground}">${['CIPTA', 'KONGSI', 'UNDI', 'INSPIRASI'][index]}</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
}

test.use({ reducedMotion: 'reduce' });
test('Malay visual review: responsive landing, dashboard, participant prompts, voting gallery and Top 3', async ({
  browser,
  page: host,
  request,
}) => {
  test.setTimeout(240000);
  mkdirSync(folder, { recursive: true });
  const facilitator = await auth(request, true);
  const templates: string[] = [];
  let sessionId = '';
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const participant = await context.newPage();
  try {
    await participant.goto('/');
    await expect(participant).toHaveTitle('Wow Mean! — Cipta | Kongsi | Undi');
    await expect(
      participant.getByRole('heading', { name: 'Wow Mean!', exact: true }),
    ).toBeVisible();
    await expect(participant.getByRole('link', { name: 'Masuk Sesi', exact: true })).toBeVisible();
    await expect(
      participant.getByRole('link', { name: 'Ruang Fasilitator', exact: true }),
    ).toHaveAttribute('href', '/facilitator');
    await pair(participant, 'landing');
    await participant.getByRole('link', { name: 'Masuk Sesi', exact: true }).click();
    await expect(participant.getByLabel('Kod Sesi')).toBeInViewport();
    await participant.getByRole('link', { name: 'Ruang Fasilitator', exact: true }).click();
    await expect(participant).toHaveURL('/facilitator');
    await expect(
      participant.getByRole('heading', { name: 'Masuk ke Ruang Fasilitator' }),
    ).toBeVisible();
    await participant.goto('/');
    for (const width of [320, 768, 1920]) {
      await participant.setViewportSize({ width, height: 1000 });
      expect(
        await participant.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    }
    const prompts = [
      'Cipta poster yang meraikan usaha seorang guru.\nGunakan warna pilihan anda.',
      'Create an original illustration about sharing ideas.\nKeep this facilitator prompt unchanged.',
      'Hasilkan satu gambar bertema inspirasi di bilik darjah.',
    ];
    for (const [index, title] of [
      'Idea Kecil, Impak Besar',
      'Guru Penuh Inspirasi',
      'Ruang Kreatif Kita',
    ].entries()) {
      const response = await request.post('/api/activities', {
        headers: headers(facilitator.idToken),
        data: {
          action: 'save',
          title,
          description:
            'Jadikan idea anda satu karya yang menginspirasikan. Pilih satu prompt, cipta dengan AI dan kongsi bersama.',
          durationMinutes: 15 + index * 5,
          prompts: index === 0 ? prompts : prompts.slice(0, index),
        },
      });
      expect(response.status()).toBe(200);
      templates.push((await response.json()).template.id);
    }
    await host.goto('/facilitator');
    await host.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
    await expect(
      host.getByRole('article', { name: 'Aktiviti: Idea Kecil, Impak Besar', exact: true }),
    ).toBeVisible();
    await pair(host, 'dashboard', false);
    await host
      .getByRole('article', { name: 'Aktiviti: Idea Kecil, Impak Besar', exact: true })
      .getByRole('button', { name: 'Mula Sesi', exact: true })
      .click();
    await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
    sessionId = host.url().split('/').pop()!;
    const code = await host.locator('.room-code b').innerText();
    await expect(host.locator('.qr svg').first()).toBeVisible();
    await pair(host, 'facilitator-session');
    await participant.goto('/?code=' + code);
    await participant.getByLabel('Nama Paparan').fill('Cikgu Aina');
    const joined = participant.waitForResponse(
      (r) => r.url().endsWith('/api/action') && r.request().postDataJSON()?.action === 'join',
    );
    await participant.getByRole('button', { name: 'Masuk Bengkel' }).click();
    const response = await joined;
    expect(response.ok()).toBe(true);
    const participantToken = response.request().headers().authorization.replace('Bearer ', '');
    await expect(
      participant.getByRole('heading', { level: 1, name: 'Idea Kecil, Impak Besar' }),
    ).toBeVisible();
    const region = participant.getByRole('region', { name: 'Prompt Aktiviti' });
    await expect(region.getByRole('article')).toHaveCount(3);
    await expect(region.getByRole('textbox').nth(1)).toHaveValue(prompts[1]);
    await region
      .getByRole('article')
      .first()
      .getByRole('button', { name: 'Salin Prompt', exact: true })
      .click();
    await expect(region.getByRole('status').first()).toHaveText('Berjaya disalin!');
    await pair(participant, 'participant');
    const png = await artwork(0);
    await participant
      .getByLabel('Gambar karya siap')
      .setInputFiles({ name: 'karya.png', mimeType: 'image/png', buffer: png });
    await participant.getByRole('button', { name: 'Hantar Karya', exact: true }).click();
    await expect(
      participant.getByText('Berjaya dihantar! Fasilitator sedang menyemak.'),
    ).toBeVisible();
    // UIDs are read from the token of the existing authenticated join, not a new participant.
    const payload = JSON.parse(Buffer.from(participantToken.split('.')[1], 'base64url').toString());
    const crowd = [{ idToken: participantToken, localId: payload.sub as string }];
    for (const [index, nickname] of ['Cikgu Budi', 'Cikgu Chitra', 'Cikgu Dania'].entries()) {
      const person = await auth(request);
      crowd.push(person);
      await action(request, person.idToken, 'join', { code, nickname });
      const uploaded = await request.post('/api/upload', {
        headers: headers(person.idToken),
        multipart: {
          sessionId,
          caption: '',
          image: { name: 'karya.png', mimeType: 'image/png', buffer: await artwork(index + 1) },
        },
      });
      expect(uploaded.status()).toBe(200);
    }
    for (const person of crowd)
      await action(request, facilitator.idToken, 'moderate', {
        sessionId,
        submissionId: person.localId,
        status: 'approved',
      });
    await action(request, facilitator.idToken, 'transition', { sessionId, stage: 'gallery' });
    await action(request, facilitator.idToken, 'advance', { sessionId });
    await expect(participant.locator('.gallery-card')).toHaveCount(4);
    await pair(participant, 'gallery');
    await participant
      .locator('.gallery-card')
      .filter({ has: participant.getByRole('heading', { name: 'Cikgu Budi', exact: true }) })
      .getByRole('button', { name: 'Undi Karya Ini', exact: true })
      .click();
    await expect(
      participant.getByRole('dialog').getByRole('button', { name: 'Lihat Karya Lain' }),
    ).toBeFocused();
    await participant.getByRole('button', { name: 'Sahkan Undian', exact: true }).click();
    await expect(participant.getByText('Undian anda dikira', { exact: true })).toBeVisible();
    for (const [index, person] of crowd.slice(1).entries())
      await action(request, person.idToken, 'vote', {
        sessionId,
        submissionId: crowd[index < 2 ? 0 : 2].localId,
      });
    await action(request, facilitator.idToken, 'advance', { sessionId });
    await expect(participant.locator('.winner')).toHaveCount(3);
    for (const winner of await participant.locator('.winner').all())
      await expect(winner).toHaveCSS('opacity', '1');
    await pair(participant, 'results');
    const projector = await host.context().newPage();
    await projector.goto(`/projector/${sessionId}`);
    await expect(projector.locator('.winner')).toHaveCount(3);
    for (const winner of await projector.locator('.winner').all())
      await expect(winner).toHaveCSS('opacity', '1');
    await capture(projector, 'projector-results', { width: 1366, height: 768 }, false);
    expect(
      await projector
        .locator('.winner')
        .evaluateAll((cards) =>
          cards.every((c) => c.getBoundingClientRect().bottom <= innerHeight),
        ),
    ).toBe(true);
    await projector.close();
  } finally {
    if (sessionId) {
      const ended = await request.post('/api/cleanup', {
        headers: headers(facilitator.idToken),
        data: { sessionId, action: 'end', confirmed: true },
      });
      expect(ended.status()).toBe(200);
      expect((await ended.json()).state).toBe('complete');
    }
    for (const id of templates) {
      const deleted = await request.post('/api/activities', {
        headers: headers(facilitator.idToken),
        data: { action: 'delete', id, confirmed: true },
      });
      expect(deleted.status()).toBe(200);
    }
    await context.close();
  }
});
