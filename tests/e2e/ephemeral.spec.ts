import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('confirmed deletion clears participant drafts, reports verified cleanup and starts a fresh workshop', async ({
  browser,
  page: host,
}) => {
  await host.goto('/facilitator');
  await host.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
  await host.getByLabel('Tajuk bengkel').fill('Ephemeral workshop');
  await host.getByRole('button', { name: 'Cipta Sesi' }).click();
  await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
  const oldUrl = host.url();
  const code = await host.locator('.room-code b').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const participant = await context.newPage();
  await participant.goto('/');
  await participant.getByLabel('Kod Sesi').fill(code);
  await participant.getByLabel('Nama Paparan').fill('Temporary teacher');
  await participant.getByRole('button', { name: 'Masuk Bengkel' }).click();
  await expect(participant.getByText('ANDA SUDAH MASUK. JOM BERKARYA!')).toBeVisible();
  await host.getByRole('button', { name: 'Seterusnya: Cari idea anda' }).click();
  await participant.getByLabel('Ubah kapsyen anda').fill('Temporary caption');
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  const dialog = host.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Batal, Kekalkan Bengkel' })).toBeFocused();
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  await host.screenshot({ path: 'test-results/ephemeral-confirmation.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Batal, Kekalkan Bengkel' }).click();
  await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(host.getByRole('heading', { name: 'Pemadaman Selesai' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(participant.getByRole('heading', { name: 'Bengkel ini telah tamat' })).toBeVisible();
  expect(
    await participant.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) => key.startsWith('wow-draft-') || key === 'wow-last-session',
      ),
    ),
  ).toEqual([]);
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  expect((await new AxeBuilder({ page: participant }).analyze()).violations).toEqual([]);
  await host.screenshot({ path: 'test-results/ephemeral-complete.png', fullPage: true });
  await participant.screenshot({
    path: 'test-results/ephemeral-participant-closed.png',
    fullPage: true,
  });
  await host.getByRole('link', { name: 'Cipta Bengkel Baharu' }).click();
  await host.getByRole('button', { name: 'Cipta Sesi' }).click();
  await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
  expect(host.url()).not.toEqual(oldUrl);
  expect(await host.locator('.room-code b').innerText()).not.toEqual(code);
  await participant.getByRole('link', { name: 'Sertai Bengkel Lain' }).click();
  await participant.getByLabel('Kod Sesi').fill(await host.locator('.room-code b').innerText());
  await participant.getByLabel('Nama Paparan').fill('Fresh teacher');
  await participant.getByRole('button', { name: 'Masuk Bengkel' }).click();
  await expect(participant.getByText('ANDA SUDAH MASUK. JOM BERKARYA!')).toBeVisible();
  await context.close();
});

test('failed cleanup is discoverable on facilitator home and retry stays closed until verified', async ({
  page: host,
}) => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const admin = getFirestore(getApps()[0] || initializeApp({ projectId: 'demo-wow' }));
  await host.goto('/facilitator');
  await host.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
  await host.getByRole('button', { name: 'Cipta Sesi' }).click();
  await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
  const id = host.url().split('/').pop()!;
  const operation = admin.doc(`sessions/${id}/uploads/simulated-writer`);
  // Synthetic operation: no Storage request is issued. It models an unknown writer.
  await operation.set({ path: `sessions/${id}/unknown.webp`, startedAt: Date.now() });
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(host.getByRole('heading', { name: 'Pemadaman Gagal', exact: true })).toBeVisible();
  await host.getByRole('link', { name: 'Cipta Bengkel Baharu' }).click();
  const job = host
    .locator('.pending-cleanups .panel')
    .filter({ has: host.locator(`a[href="/session/${id}"]`) });
  await expect(job.getByRole('heading', { name: 'Pemadaman Gagal' })).toBeVisible();
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  await job.getByRole('link', { name: 'Semak Pemadaman' }).click();
  await host.getByRole('button', { name: 'Cuba Padam Semula' }).click();
  await expect(host.getByRole('button', { name: 'Cuba Padam Semula' })).toBeEnabled();
  await expect(host.getByRole('heading', { name: 'Pemadaman Selesai' })).not.toBeVisible();
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  await host.screenshot({ path: 'test-results/ephemeral-failed.png', fullPage: true });
  // The fixture never issued a write; releasing it represents proven settlement.
  await operation.delete();
  await host.getByRole('button', { name: 'Cuba Padam Semula' }).click();
  await expect(host.getByRole('heading', { name: 'Pemadaman Selesai' })).toBeVisible();
  await host.getByRole('link', { name: 'Cipta Bengkel Baharu' }).click();
  await expect(host.locator(`.pending-cleanups a[href="/session/${id}"]`)).toHaveCount(0);
});

test('expired workshop remains discoverable and requires manual deletion confirmation', async ({
  page: host,
}) => {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const admin = getFirestore(getApps()[0] || initializeApp({ projectId: 'demo-wow' }));
  await host.goto('/facilitator');
  await host.getByRole('button', { name: 'Masuk Fasilitator Tempatan' }).click();
  await host.getByLabel('Tajuk bengkel').fill('Manual expired workshop');
  await host.getByRole('button', { name: 'Cipta Sesi' }).click();
  await expect(host.getByText(/DASHBOARD FASILITATOR/)).toBeVisible();
  const id = host.url().split('/').pop()!;
  await admin.doc(`sessions/${id}`).update({ expiresAt: Date.now() - 1 });
  await expect(
    host.getByRole('heading', { name: 'Pengesahan Pemadaman Diperlukan' }),
  ).toBeVisible();
  expect((await admin.doc(`sessions/${id}`).get()).exists).toBe(true);
  await host.goto('/facilitator');
  const card = host
    .locator('.pending-cleanups .panel')
    .filter({ has: host.locator(`a[href="/session/${id}"]`) });
  await expect(card.getByText('Tamat tempoh · perlu pemadaman manual')).toBeVisible();
  await card.getByRole('link').click();
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Batal, Kekalkan Bengkel' }).click();
  expect((await admin.doc(`sessions/${id}`).get()).exists).toBe(true);
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(host.getByRole('heading', { name: 'Pemadaman Selesai' })).toBeVisible();
  expect((await admin.doc(`sessions/${id}`).get()).exists).toBe(false);
});
