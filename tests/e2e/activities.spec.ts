import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('facilitator saves, edits, reuses and deletes activities independently from live sessions', async ({
  page,
}) => {
  const uniqueTitle = `Idea Kreatif V2 ${Date.now()}`;
  await page.setViewportSize({ width: 390, height: 844 });
  let failList = true;
  await page.route('**/api/activities', async (route) => {
    if (route.request().method() === 'GET' && failList) {
      failList = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Cuba semula selepas sambungan pulih.' }),
      });
    } else await route.continue();
  });
  await page.goto('/facilitator');
  await page.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  const dashboard = page.getByRole('region', { name: 'Dashboard Aktiviti' });
  await dashboard.getByRole('button', { name: 'Cuba Muat Semula' }).click();
  await dashboard.getByRole('button', { name: 'Cipta Aktiviti' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Tajuk aktiviti', { exact: true }).fill(uniqueTitle);
  await form.getByLabel('Penerangan', { exact: true }).fill('Aktiviti bebas untuk guru.');
  await form.getByLabel('Tempoh dalam minit').fill('25');
  await form
    .getByLabel('Prompt 1', { exact: true })
    .fill('Cipta karya bertema alam.\nPilih gaya anda.');
  await form.getByRole('button', { name: 'Tambah Prompt' }).click();
  await form.getByLabel('Prompt 2', { exact: true }).fill('Gunakan warna kegemaran anda.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await form.getByRole('button', { name: 'Simpan Aktiviti' }).click();
  let card = dashboard.getByRole('article', { name: `Aktiviti: ${uniqueTitle}`, exact: true });
  await expect(card.getByText('25 minit · 2 prompt')).toBeVisible();
  await page.reload();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Edit Aktiviti' }).click();
  await expect(form.getByLabel('Prompt 1', { exact: true })).toHaveValue(
    'Cipta karya bertema alam.\nPilih gaya anda.',
  );
  await form.getByLabel('Tajuk aktiviti', { exact: true }).fill(`${uniqueTitle} Disunting`);
  await form.getByRole('button', { name: 'Buang Prompt 2' }).click();
  await form.getByRole('button', { name: 'Simpan Aktiviti' }).click();
  card = dashboard.getByRole('article', {
    name: `Aktiviti: ${uniqueTitle} Disunting`,
    exact: true,
  });
  await expect(card.getByText('25 minit · 1 prompt')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.getByRole('button', { name: 'Mula Sesi' }).click();
  await expect(page.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  const firstCode = await page.locator('.room-code b').innerText();
  await expect(page.locator('.qr svg').first()).toBeVisible();
  await page.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(page.getByRole('heading', { name: 'Cleanup Complete' })).toBeVisible();
  await page.getByRole('link', { name: 'Create a new workshop' }).click();
  await expect(card).toBeVisible(); // Session deletion preserves the template.
  await card.getByRole('button', { name: 'Mula Sesi' }).click();
  await expect(page.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  const liveUrl = page.url();
  expect(await page.locator('.room-code b').innerText()).not.toBe(firstCode);
  await page.goto('/facilitator');
  await card.getByRole('button', { name: 'Padam Templat', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Batal' })).toBeFocused();
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Padam Templat', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, Padam Templat' }).click();
  await expect(card).toHaveCount(0);
  await page.goto(liveUrl);
  await expect(page.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  await page.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await page.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(page.getByRole('heading', { name: 'Cleanup Complete' })).toBeVisible();
});
