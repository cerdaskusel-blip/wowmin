import { test, expect, Page, APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp, getApps } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const admin = getFirestore(getApps()[0] || initializeApp({ projectId: 'demo-wow' }));
const origin = 'http://127.0.0.1:3000';
async function capture(p: Page, name: string, fullPage = false) {
  await p.waitForTimeout(900);
  await p.screenshot({ path: `test-results/after-${name}.png`, fullPage });
}
async function start(host: Page, title: string) {
  await host.goto('/facilitator');
  await host.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
  await host.getByLabel('Tajuk bengkel').fill(title);
  await host.getByRole('button', { name: 'Cipta Sesi' }).click();
  await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
  return { id: host.url().split('/').pop()!, code: await host.locator('.room-code b').innerText() };
}
async function join(p: Page, code: string, name: string) {
  await p.goto('/?code=' + code);
  await p.getByLabel('Nama Paparan').fill(name);
  await p.getByRole('button', { name: 'Masuk Bengkel' }).click();
  await expect(p.getByText('ANDA SUDAH MASUK. JOM BERKARYA!')).toBeVisible();
}
async function next(h: Page, name: string, confirm = false) {
  const committed = h.waitForResponse(
    (r) => r.url().endsWith('/api/action') && r.request().postDataJSON()?.action === 'advance',
  );
  await h.getByRole('button', { name, exact: true }).click();
  if (confirm) await h.getByRole('button', { name: 'Sahkan Pertukaran' }).click();
  expect((await committed).ok()).toBeTruthy();
  if (confirm) await expect(h.getByRole('dialog')).not.toBeVisible();
}
async function reopen(h: Page) {
  await h.getByText('Kawalan peringkat / buka semula penghantaran', { exact: true }).click();
  await h.getByLabel('Pilih peringkat').selectOption('submit');
  await h.getByRole('button', { name: 'Buka Peringkat Dipilih' }).click();
  await h.getByRole('button', { name: 'Sahkan Pertukaran' }).click();
}
async function sticker(i = 0) {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" rx="60" fill="${['#f6d66d', '#c9b5e0', '#b9d6c3', '#f0b49b'][i % 4]}"/><circle cx="200" cy="175" r="95" fill="#faf9f5"/><circle cx="170" cy="155" r="8" fill="#292c29"/><circle cx="230" cy="155" r="8" fill="#292c29"/><path d="M165 195 Q200 235 235 195" stroke="#292c29" stroke-width="8" fill="none"/><text x="200" y="325" font-size="25" text-anchor="middle" font-family="sans-serif" fill="#292c29">KEEP GROWING ${i + 1}!</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
}
async function act(
  r: APIRequestContext,
  token: string,
  action: string,
  data: Record<string, unknown> = {},
) {
  return r.post('/api/action', {
    timeout: 30000,
    headers: { Origin: origin, Authorization: `Bearer ${token}` },
    data: { action, ...data },
  });
}
async function hostToken(r: APIRequestContext) {
  return (
    await (
      await r.post(
        'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
        {
          data: {
            email: 'host@wow.local',
            password: 'Workshop-local-2026',
            returnSecureToken: true,
          },
        },
      )
    ).json()
  ).idToken as string;
}
async function guest(r: APIRequestContext) {
  return (
    await r.post(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',
      { data: { returnSecureToken: true } },
    )
  ).json();
}
async function audit(p: Page, name: string) {
  const result = await new AxeBuilder({ page: p })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/axe-${name}.json`, JSON.stringify(result.violations, null, 2));
  return result.violations;
}
test('submission recovery, pause, expiry, reopening and saved membership', async ({
  browser,
  page: host,
  request,
}) => {
  const room = await start(host, 'Recovery rehearsal');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const p = await context.newPage();
  await join(p, room.code, 'Maya');
  await next(host, 'Seterusnya: Cari idea anda');
  await expect(p.getByRole('button', { name: 'Salin Prompt', exact: true })).toBeInViewport();
  await p.getByRole('button', { name: 'Kata semangat' }).click();
  await expect(p.getByRole('button', { name: 'Kata semangat' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await p.getByLabel('Ubah kapsyen anda').fill('Keep growing!');
  await p.getByRole('button', { name: 'Salin Prompt', exact: true }).click();
  expect(await p.evaluate(() => navigator.clipboard.readText())).toContain('Keep growing!');
  await p.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async () => {
        throw new Error('Denied');
      },
      configurable: true,
    }),
  );
  await p.waitForTimeout(2600);
  await p.getByRole('button', { name: 'Salin Prompt', exact: true }).click();
  await p.getByRole('link', { name: 'Salinan gagal — pilih teks prompt' }).click();
  await expect(p.getByText('Salinan automatik gagal.', { exact: false })).toBeInViewport();
  await p.getByRole('button', { name: 'Pilih Prompt' }).click();
  expect(
    await p
      .locator('#generated-prompt')
      .evaluate((e: HTMLTextAreaElement) => e.selectionEnd - e.selectionStart),
  ).toBeGreaterThan(100);
  await capture(p, 'copy-error-mobile');
  await next(host, 'Seterusnya: Masa untuk cipta');
  const image = await sticker();
  await p
    .getByLabel('Gambar karya siap')
    .setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: image });
  await expect(p.getByAltText('Pratonton gambar karya pilihan anda')).toBeVisible();
  await host.getByRole('button', { name: 'Jeda Bengkel' }).click();
  await expect(
    p.getByText('Bengkel dijeda. Penghantaran dan undian akan disambung', { exact: false }),
  ).toBeVisible();
  await expect(p.getByRole('button', { name: 'Hantar Karya' })).toBeDisabled();
  const paused = (await admin.doc(`sessions/${room.id}`).get()).data()!.pausedRemainingMs;
  await host.getByRole('button', { name: '+ 1 minit' }).click();
  await expect
    .poll(async () => (await admin.doc(`sessions/${room.id}`).get()).data()!.pausedRemainingMs)
    .toBe(paused + 60000);
  await host.getByRole('button', { name: 'Sambung Bengkel' }).click();
  await expect(p.getByRole('button', { name: 'Hantar Karya' })).toBeEnabled();
  await admin.doc(`sessions/${room.id}`).update({ stageEndsAt: Date.now() + 500 });
  await expect(p.getByRole('button', { name: 'Hantar Karya' })).toBeDisabled();
  await host.getByRole('button', { name: '+ 1 minit' }).click();
  await expect(p.getByRole('button', { name: 'Hantar Karya' })).toBeEnabled();
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    hit = new Promise<void>((r) => (arrived = r));
  await p.route('**/api/upload', async (route) => {
    arrived();
    await gate;
    await route.continue();
  });
  await p.getByRole('button', { name: 'Hantar Karya' }).click();
  await hit;
  await next(host, 'Seterusnya: Hantar karya');
  await next(host, 'Seterusnya: Galeri Karya', true);
  release();
  await expect(p.locator('.upload-panel .error')).toContainText(
    'Gambar pilihan anda masih di sini',
  );
  await expect(p.getByAltText('Pratonton gambar karya pilihan anda')).toBeVisible();
  await expect(p.locator('.upload-panel .error')).toBeInViewport();
  await capture(p, 'interrupted-upload-mobile');
  await p.unroute('**/api/upload');
  await reopen(host);
  await p.getByRole('button', { name: 'Hantar Karya' }).click();
  await expect(p.getByText('Berjaya dihantar! Fasilitator sedang menyemak.')).toBeVisible();
  await host
    .locator('.moderation-card')
    .getByRole('button', { name: 'Luluskan', exact: true })
    .click();
  await next(host, 'Seterusnya: Galeri Karya', true);
  await host.getByRole('button', { name: 'Pulangkan kepada Peserta' }).click();
  await expect(p.getByText('Karya dipulangkan. Jom cuba semula.')).toBeVisible();
  await expect(
    p.getByText('Penghantaran ditutup. Minta fasilitator', { exact: false }),
  ).toBeVisible();
  await expect(
    p.getByRole('link', { name: 'Karya dipulangkan · Lihat maklum balas' }),
  ).toBeInViewport();
  await capture(p, 'returned-gallery-mobile');
  await host.getByLabel(/^Papar/).selectOption('rejected');
  await host.getByRole('button', { name: 'Pulihkan ke Galeri' }).click();
  await expect(p.getByText('Karya anda ada di galeri!')).toBeVisible();
  await p.getByRole('link', { name: /Wow Mean!.*Halaman Utama/ }).click();
  await expect(p.getByRole('link', { name: /Sambung bengkel/ })).toBeVisible();
  await capture(p, 'resume-mobile');
  await p.getByRole('link', { name: /Sambung bengkel/ }).click();
  await expect(p.getByText('Karya anda ada di galeri!')).toBeVisible();
  const token = await hostToken(request);
  await next(host, 'Buka Undian', true);
  expect(
    (await act(request, token, 'transition', { sessionId: room.id, stage: 'submit' })).status(),
  ).toBe(409);
  await context.close();
});

test('50 participants upload, moderate, vote and reveal on a responsive live wall', async ({
  browser,
  page: host,
  request,
}) => {
  test.setTimeout(300000);
  const room = await start(host, 'WOW #1 · Bengkel Kreatif Guru');
  const ht = await hostToken(request);
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const m = await mobile.newPage(),
    d = await desktop.newPage();
  for (const [p, name, size] of [
    [m, 'Maya', 'mobile'],
    [d, 'Daniel', 'desktop'],
  ] as const) {
    await p.goto('/?code=' + room.code);
    await p.getByLabel('Nama Paparan').fill(name);
    await capture(p, `join-${size}`);
    await p.getByRole('button', { name: 'Masuk Bengkel' }).click();
    await expect(p.getByText('ANDA SUDAH MASUK. JOM BERKARYA!')).toBeVisible();
  }
  const crowd = await Promise.all(Array.from({ length: 48 }, () => guest(request)));
  const joinsStarted = Date.now();
  await Promise.all(
    crowd.map(async (u, i) =>
      expect(
        (
          await act(request, u.idToken, 'join', {
            code: room.code,
            nickname: `Teacher ${String(i + 3).padStart(2, '0')}`,
          })
        ).ok(),
      ).toBeTruthy(),
    ),
  );
  const concurrentJoinMs = Date.now() - joinsStarted;
  expect(concurrentJoinMs).toBeLessThan(60000);
  await expect(host.locator('.member-row')).toHaveCount(50);
  const projector = await host.context().newPage();
  await projector.setViewportSize({ width: 1920, height: 1080 });
  await projector.goto(`/projector/${room.id}`);
  await capture(projector, 'projector-welcome-desktop');
  await next(host, 'Seterusnya: Cari idea anda');
  for (const [p, size] of [
    [m, 'mobile'],
    [d, 'desktop'],
  ] as const) {
    await p.getByRole('button', { name: 'Kata semangat' }).click();
    await p.getByLabel('Ubah kapsyen anda').fill('Keep growing, little thinkers!');
    await p.getByRole('button', { name: 'Kawaii', exact: false }).click();
    await p.evaluate(() => scrollTo(0, 0));
    await capture(p, `studio-${size}`);
    await p.getByRole('button', { name: 'Salin Prompt Saya', exact: true }).click();
    await expect(
      p.getByRole('button', { name: 'Disalin! Jom cipta karya anda', exact: true }),
    ).toBeVisible();
    await capture(p, `prompt-copied-${size}`);
  }
  const audits: Record<string, unknown> = {};
  audits.studio = await audit(m, 'studio-mobile');
  await next(host, 'Seterusnya: Masa untuk cipta');
  for (const [p, size, i] of [
    [m, 'mobile', 0],
    [d, 'desktop', 1],
  ] as const) {
    await p.getByLabel('Gambar karya siap').setInputFiles({
      name: 'finished-sticker.png',
      mimeType: 'image/png',
      buffer: await sticker(i),
    });
    await p.locator('.upload-panel').scrollIntoViewIfNeeded();
    await capture(p, `upload-ready-${size}`);
    await p.getByRole('button', { name: 'Hantar Karya' }).click();
    await expect(p.getByText('Berjaya dihantar! Fasilitator sedang menyemak.')).toBeVisible();
  }
  // Upload in short concurrent batches, as device downloads finish across a room.
  for (let i = 0; i < crowd.length; i += 8)
    await Promise.all(
      crowd.slice(i, i + 8).map(async (u, j) => {
        const response = await request.post('/api/upload', {
          headers: { Origin: origin, Authorization: `Bearer ${u.idToken}` },
          multipart: {
            sessionId: room.id,
            caption: `Keep growing ${i + j + 3}!`,
            image: { name: 'sticker.png', mimeType: 'image/png', buffer: await sticker(i + j + 2) },
          },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
      }),
    );
  await expect(host.locator('.moderation-card')).toHaveCount(50);
  await expect(host.getByLabel('Jumlah langsung bengkel')).toContainText('50 dihantar');
  await host.evaluate(() => scrollTo(0, 0));
  await capture(host, 'facilitator-desktop');
  await host.setViewportSize({ width: 390, height: 844 });
  await capture(host, 'facilitator-mobile');
  await host.setViewportSize({ width: 1440, height: 1000 });
  audits.host = await audit(host, 'host-desktop');
  const subs = (await admin.collection(`sessions/${room.id}/submissions`).get()).docs;
  for (let i = 0; i < subs.length; i += 5)
    await Promise.all(
      subs.slice(i, i + 5).map(async (s) =>
        expect(
          (
            await act(request, ht, 'moderate', {
              sessionId: room.id,
              submissionId: s.id,
              status: 'approved',
            })
          ).ok(),
        ).toBeTruthy(),
      ),
    );
  await next(host, 'Seterusnya: Hantar karya');
  await next(host, 'Seterusnya: Galeri Karya', true);
  await expect(m.locator('.gallery-card')).toHaveCount(50);
  await expect(projector.locator('.gallery-card')).toHaveCount(50);
  for (const [p, size] of [
    [m, 'mobile'],
    [d, 'desktop'],
  ] as const) {
    await p.evaluate(() => scrollTo(0, 0));
    await capture(p, `gallery-${size}`);
  }
  await capture(projector, 'projector-wall-desktop');
  audits.wall = await audit(projector, 'projector-wall');
  // All 50 projector cards, images and names must fit both common projector sizes.
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await projector.setViewportSize(viewport);
    expect(
      await projector.locator('.gallery-card').evaluateAll((nodes) =>
        nodes.every((n) => {
          const r = n.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
        }),
      ),
    ).toBe(true);
    expect(
      await projector
        .locator('.wall-image-button')
        .first()
        .evaluate((e) => e.getBoundingClientRect().height),
    ).toBeGreaterThan(25);
  }
  await projector.setViewportSize({ width: 1920, height: 1080 });
  await m.getByLabel('Cari peserta atau kapsyen').fill('Daniel');
  await expect(m.locator('.gallery-card')).toHaveCount(1);
  await m.getByRole('button', { name: 'Besarkan karya Daniel' }).click();
  await expect(m.getByRole('dialog')).toBeVisible();
  await m.keyboard.press('Escape');
  await expect(m.getByRole('dialog')).not.toBeVisible();
  await expect(m.getByRole('button', { name: 'Besarkan karya Daniel' })).toBeFocused();
  await m.getByLabel('Cari peserta atau kapsyen').fill('');
  await next(host, 'Buka Undian', true);
  await expect(m.getByRole('heading', { name: 'Pilih kegemaran.' })).toBeVisible();
  for (const [p, size] of [
    [m, 'mobile'],
    [d, 'desktop'],
  ] as const) {
    await p.evaluate(() => scrollTo(0, 0));
    await capture(p, `voting-${size}`);
  }
  await m.getByLabel('Cari peserta atau kapsyen').fill('Daniel');
  await m.getByRole('button', { name: 'Undi Karya Ini' }).click();
  await expect(
    m.getByRole('dialog').getByRole('heading', { name: 'Daniel', exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await m.keyboard.press('Tab');
    expect(await m.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  }
  await capture(m, 'vote-confirmation-mobile');
  audits.vote = await audit(m, 'vote-dialog');
  await m.keyboard.press('Escape');
  await expect(m.getByRole('dialog')).not.toBeVisible();
  await host.getByRole('button', { name: 'Jeda Bengkel' }).click();
  await expect(m.getByRole('button', { name: 'Undi Karya Ini' })).toBeDisabled();
  expect(
    (
      await act(request, crowd[0].idToken, 'vote', {
        sessionId: room.id,
        submissionId: crowd[1].localId,
      })
    ).status(),
  ).toBe(409);
  await host.getByRole('button', { name: 'Sambung Bengkel' }).click();
  await m.getByRole('button', { name: 'Undi Karya Ini' }).click();
  await m.getByRole('button', { name: 'Sahkan Undian' }).click();
  await expect(m.getByText('Undian anda dikira', { exact: true })).toBeVisible();
  await d.getByLabel('Cari peserta atau kapsyen').fill('Maya');
  await d.getByRole('button', { name: 'Undi Karya Ini' }).click();
  await d.getByRole('button', { name: 'Sahkan Undian' }).click();
  await Promise.all(
    crowd.map(async (u, i) => {
      const target = crowd[((i % 3) + 1) % crowd.length];
      const selected = target.localId === u.localId ? crowd[4] : target;
      const r = await act(request, u.idToken, 'vote', {
        sessionId: room.id,
        submissionId: selected.localId,
      });
      expect(r.ok(), await r.text()).toBeTruthy();
    }),
  );
  await expect(host.getByLabel('Jumlah langsung bengkel')).toContainText('50 / 50 undian');
  expect((await admin.collection(`sessions/${room.id}/votes`).get()).size).toBe(50);
  expect(
    (
      await act(request, crowd[0].idToken, 'vote', {
        sessionId: room.id,
        submissionId: crowd[2].localId,
      })
    ).status(),
  ).toBe(409);
  await next(host, 'Tutup Undian & Papar Keputusan', true);
  await expect(projector.locator('.winner')).toHaveCount(3);
  for (const [p, size] of [
    [m, 'mobile'],
    [d, 'desktop'],
  ] as const) {
    await p.evaluate(() => scrollTo(0, 0));
    await capture(p, `winners-${size}`);
  }
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await projector.setViewportSize(viewport);
    await projector.waitForTimeout(1000);
    expect(
      await projector
        .locator('.winner')
        .evaluateAll((nodes) =>
          nodes.every((n) => n.getBoundingClientRect().bottom <= innerHeight),
        ),
    ).toBe(true);
    expect(
      await projector.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    ).toBe(true);
    await capture(projector, `projector-winners-${viewport.width}`);
  }
  audits.results = await audit(projector, 'projector-results');
  const final = (await admin.doc(`sessions/${room.id}`).get()).data()!;
  expect(final.totalVotes).toBe(50);
  expect(final.winners).toHaveLength(3);
  expect(
    final.winners.every((w: { rank: number; votes: number }) => w.rank === 1 && w.votes === 16),
  ).toBe(true);
  // Larger ties stay reachable; never silently drop a tied creator.
  await admin.doc(`sessions/${room.id}`).update({
    winners: [
      ...final.winners,
      {
        ...final.winners[0],
        id: subs.find((s) => !final.winners.some((w: { id: string }) => w.id === s.id))!.id,
        nickname: 'Extra tied creator',
      },
    ],
  });
  await expect(projector.getByRole('button', { name: 'Pemenang Seterusnya' })).toBeVisible();
  await projector.getByRole('button', { name: 'Pemenang Seterusnya' }).click();
  await expect(projector.getByText('Extra tied creator')).toBeVisible();
  await admin.doc(`sessions/${room.id}`).update({ winners: final.winners });
  writeFileSync(
    'test-results/50-participant-validation.json',
    JSON.stringify(
      {
        participants: 50,
        concurrentJoinMs,
        submissions: subs.length,
        votes: final.totalVotes,
        winners: final.winners.map((w: { rank: number; votes: number }) => ({
          rank: w.rank,
          votes: w.votes,
        })),
        audits,
      },
      null,
      2,
    ),
  );
  // Assert WCAG-tagged checks without excluding rules or interface elements.
  for (const [name, violations] of Object.entries(audits)) expect(violations, name).toEqual([]);
  await mobile.close();
  await desktop.close();
});
