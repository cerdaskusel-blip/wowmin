import { test, expect, Page } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';
async function join(page: Page, code: string, name: string) {
  await page.goto('/');
  await page.getByLabel('Kod Sesi').fill(code);
  await page.getByLabel('Nama Paparan').fill(name);
  await page.getByRole('button', { name: 'Masuk Bengkel' }).click();
  await expect(page.getByText('ANDA SUDAH MASUK. JOM BERKARYA!')).toBeVisible();
}
test('live workshop: join, craft, upload, moderate, vote, reveal across browsers', async ({
  browser,
  page: host,
}) => {
  await host.goto('/facilitator');
  await host.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
  await host.getByLabel('Tajuk bengkel').fill('Teachers make WOW');
  await host.getByRole('button', { name: 'Cipta Sesi' }).click();
  await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
  const code = (await host.locator('.room-code b').innerText()).trim();
  const a = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const b = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const alice = await a.newPage();
  const bob = await b.newPage();
  await join(alice, code, 'Alice');
  await join(bob, code, 'Bob');
  await expect(host.locator('.member-row')).toHaveCount(2);
  const projector = await host.context().newPage();
  await projector.goto(host.url().replace('/session/', '/projector/'));
  await expect(projector.getByText('2 peserta.')).toBeVisible();
  await host.getByRole('button', { name: 'Seterusnya: Cari idea anda' }).click();
  await expect(alice.getByRole('heading', { name: 'Cari idea anda.' })).toBeVisible();
  await alice.getByRole('button', { name: 'Kata semangat' }).click();
  await alice.getByLabel('Ubah kapsyen anda').fill('Keep exploring!');
  await alice.getByRole('button', { name: 'Komik pop' }).click();
  await expect(alice.getByLabel('Prompt gambar AI anda')).toHaveValue(/Keep exploring!/);
  await alice.getByRole('button', { name: 'Salin Prompt Saya' }).click();
  await expect(alice.getByRole('button', { name: 'Disalin! Jom cipta karya anda' })).toBeVisible();
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toContain('Keep exploring!');
  await expect(alice.getByRole('link', { name: 'ChatGPT' })).toHaveAttribute(
    'href',
    'https://chatgpt.com',
  );
  await alice.reload();
  await expect(alice.getByLabel('Ubah kapsyen anda')).toHaveValue('Keep exploring!');
  await host.getByRole('button', { name: 'Seterusnya: Masa untuk cipta' }).click();
  const image = await sharp({
    create: { width: 400, height: 400, channels: 3, background: '#efd278' },
  })
    .png()
    .toBuffer();
  for (const p of [alice, bob]) {
    await p
      .getByLabel('Gambar karya siap')
      .setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: image });
    await p.getByRole('button', { name: 'Hantar Karya' }).click();
    await expect(p.getByText('Berjaya dihantar! Fasilitator sedang menyemak.')).toBeVisible();
  }
  await expect(host.locator('.moderation-card')).toHaveCount(2);
  await host
    .locator('.moderation-card')
    .filter({ hasText: 'Alice' })
    .getByRole('button', { name: 'Pulangkan' })
    .click();
  // Keep the decision in flight while the facilitator dismisses the dialog.
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const hit = new Promise<void>((resolve) => (arrived = resolve));
  await host.route('**/api/action', async (route) => {
    const data = route.request().postDataJSON();
    if (data.action === 'moderate' && data.status === 'rejected') {
      arrived();
      await gate;
    }
    await route.continue();
  });
  await host.getByRole('button', { name: 'Pulangkan & Seterusnya' }).click();
  await hit;
  await host.getByRole('button', { name: 'Kembali ke Semakan' }).click();
  release();
  await expect(alice.getByText('Karya dipulangkan. Jom cuba semula.')).toBeVisible();
  await expect(
    host
      .locator('.moderation-card')
      .filter({ hasText: 'Bob' })
      .getByRole('button', { name: 'Luluskan', exact: true }),
  ).toBeEnabled();
  await expect(host.getByRole('dialog')).not.toBeVisible();
  await alice
    .getByLabel('Gambar karya siap')
    .setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: image });
  await alice.getByRole('button', { name: 'Gantikan Penghantaran' }).click();
  await expect(alice.getByText('Berjaya dihantar! Fasilitator sedang menyemak.')).toBeVisible();
  for (const name of ['Alice', 'Bob']) {
    const card = host.locator('.moderation-card').filter({ hasText: name });
    await card.getByRole('button', { name: 'Luluskan', exact: true }).click();
    await expect(card).toHaveCount(0);
  }
  await expect(alice.getByText('Karya anda ada di galeri!')).toBeVisible();
  await expect(host.locator('.gallery-card')).toHaveCount(2);
  await expect(projector.locator('.wall-image-button img').first()).toBeVisible();
  await host.getByRole('button', { name: 'Seterusnya: Hantar karya' }).click();
  await host.getByRole('button', { name: 'Seterusnya: Galeri Karya' }).click();
  await host.getByRole('button', { name: 'Sahkan Pertukaran' }).click();
  await expect(alice.locator('.gallery-card')).toHaveCount(2);
  await host.getByRole('button', { name: 'Buka Undian', exact: true }).click();
  await host.getByRole('button', { name: 'Sahkan Pertukaran' }).click();
  await alice
    .locator('.gallery-card')
    .filter({ hasText: 'Bob' })
    .getByRole('button', { name: 'Undi Karya Ini' })
    .click();
  await alice.getByRole('button', { name: 'Sahkan Undian' }).click();
  await expect(alice.getByText('Undian anda dikira')).toBeVisible();
  await expect(
    alice
      .locator('.gallery-card')
      .filter({ hasText: 'Alice' })
      .getByRole('button', { name: 'Karya anda' }),
  ).toBeDisabled();
  await bob
    .locator('.gallery-card')
    .filter({ hasText: 'Alice' })
    .getByRole('button', { name: 'Undi Karya Ini' })
    .click();
  await bob.getByRole('button', { name: 'Sahkan Undian' }).click();
  await expect(bob.getByText('Undian anda dikira')).toBeVisible();
  await host.getByRole('button', { name: 'Tutup Undian & Papar Keputusan' }).click();
  await host.getByRole('button', { name: 'Sahkan Pertukaran' }).click();
  await expect(alice.getByText('Tepukan untuk semua!', { exact: true })).toBeVisible();
  await expect(projector.locator('.winner')).toHaveCount(2);
  await expect
    .poll(() =>
      projector
        .locator('.winner img')
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(alice.getByText('2 undian. 2 peserta kreatif.', { exact: false })).toBeVisible();
  await alice.screenshot({ path: 'test-results/participant-results.png', fullPage: true });
  await projector.screenshot({ path: 'test-results/projector-results.png', fullPage: true });
  // Complete the actual workshop flow with manual deletion, without a worker.
  const sessionId = host.url().split('/').pop()!;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const { getStorage } = await import('firebase-admin/storage');
  const admin = initializeApp(
    { projectId: 'demo-wow', storageBucket: 'demo-wow.appspot.com' },
    `manual-${sessionId}`,
  );
  const db = getFirestore(admin);
  const members = await db.collection(`sessions/${sessionId}/members`).get();
  const hostId = (await db.doc(`sessions/${sessionId}`).get()).data()!.hostId;
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await expect(host.getByRole('dialog')).toBeVisible();
  await host.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(host.getByRole('heading', { name: 'Pemadaman Selesai' })).toBeVisible();
  expect((await db.doc(`sessions/${sessionId}`).get()).exists).toBe(false);
  expect(await db.doc(`sessions/${sessionId}`).listCollections()).toHaveLength(0);
  expect((await db.collection('codes').where('sessionId', '==', sessionId).get()).empty).toBe(true);
  expect(
    (
      await getStorage(admin)
        .bucket()
        .getFiles({ prefix: `sessions/${sessionId}/` })
    )[0],
  ).toHaveLength(0);
  for (const member of members.docs)
    await expect(getAuth(admin).getUser(member.id)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });
  expect((await getAuth(admin).getUser(hostId)).customClaims?.facilitator).toBe(true);
  await a.close();
  await b.close();
});
test('landing fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wow Mean!', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
});

test('expired authentication can be recovered without clearing browser storage', async ({
  page,
}) => {
  let rejectOnce = true;
  await page.route('**/api/auth', async (route) => {
    if (route.request().method() === 'POST' && rejectOnce) {
      rejectOnce = false;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Expired session' }),
      });
    } else await route.continue();
  });
  await page.goto('/facilitator');
  await page.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
  await expect.poll(() => rejectOnce).toBe(false);
  await expect(page.getByRole('button', { name: 'Masuk Fasilitator Tempatan' })).toBeVisible();
  await page.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
  await expect(page.getByLabel('Tajuk bengkel')).toBeVisible();
});
