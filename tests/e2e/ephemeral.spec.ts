import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('confirmed deletion clears participant drafts, reports verified cleanup and starts a fresh workshop', async ({
  browser,
  page: host,
}) => {
  await host.goto('/facilitator');
  await host.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  await host.getByLabel('Workshop name').fill('Ephemeral workshop');
  await host.getByRole('button', { name: 'Create workshop' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  const oldUrl = host.url();
  const code = await host.locator('.room-code b').innerText();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const participant = await context.newPage();
  await participant.goto('/');
  await participant.getByLabel('Session code').fill(code);
  await participant.getByLabel('Your nickname').fill('Temporary teacher');
  await participant.getByRole('button', { name: 'Join the workshop' }).click();
  await expect(participant.getByText('YOU’RE IN. LET’S GET CREATIVE.')).toBeVisible();
  await host.getByRole('button', { name: 'Next: Find your sticker voice' }).click();
  await participant.getByLabel('Make it yours').fill('Temporary caption');
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  const dialog = host.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep workshop open' })).toBeFocused();
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  await host.screenshot({ path: 'test-results/ephemeral-confirmation.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Keep workshop open' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(host.getByRole('heading', { name: 'Cleanup Complete' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(participant.getByRole('heading', { name: 'This workshop has ended' })).toBeVisible();
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
  await host.getByRole('link', { name: 'Create a new workshop' }).click();
  await host.getByRole('button', { name: 'Create workshop' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  expect(host.url()).not.toEqual(oldUrl);
  expect(await host.locator('.room-code b').innerText()).not.toEqual(code);
  await participant.getByRole('link', { name: 'Join another workshop' }).click();
  await participant.getByLabel('Session code').fill(await host.locator('.room-code b').innerText());
  await participant.getByLabel('Your nickname').fill('Fresh teacher');
  await participant.getByRole('button', { name: 'Join the workshop' }).click();
  await expect(participant.getByText('YOU’RE IN. LET’S GET CREATIVE.')).toBeVisible();
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
  await host.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  await host.getByRole('button', { name: 'Create workshop' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  const id = host.url().split('/').pop()!;
  const operation = admin.doc(`sessions/${id}/uploads/simulated-writer`);
  // Synthetic operation: no Storage request is issued. It models an unknown writer.
  await operation.set({ path: `sessions/${id}/unknown.webp`, startedAt: Date.now() });
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(host.getByRole('heading', { name: 'Cleanup failed', exact: true })).toBeVisible();
  await host.getByRole('link', { name: 'Create a new workshop' }).click();
  const job = host
    .locator('.pending-cleanups .panel')
    .filter({ has: host.locator(`a[href="/session/${id}"]`) });
  await expect(job.getByRole('heading', { name: 'Cleanup failed' })).toBeVisible();
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  await job.getByRole('link', { name: 'Review cleanup' }).click();
  await host.getByRole('button', { name: 'Retry cleanup' }).click();
  await expect(host.getByRole('button', { name: 'Retry cleanup' })).toBeEnabled();
  await expect(host.getByRole('heading', { name: 'Cleanup Complete' })).not.toBeVisible();
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  await host.screenshot({ path: 'test-results/ephemeral-failed.png', fullPage: true });
  // The fixture never issued a write; releasing it represents proven settlement.
  await operation.delete();
  await host.getByRole('button', { name: 'Retry cleanup' }).click();
  await expect(host.getByRole('heading', { name: 'Cleanup Complete' })).toBeVisible();
  await host.getByRole('link', { name: 'Create a new workshop' }).click();
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
  await host.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  await host.getByLabel('Workshop name').fill('Manual expired workshop');
  await host.getByRole('button', { name: 'Create workshop' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  const id = host.url().split('/').pop()!;
  await admin.doc(`sessions/${id}`).update({ expiresAt: Date.now() - 1 });
  await expect(host.getByRole('heading', { name: 'Manual deletion required' })).toBeVisible();
  expect((await admin.doc(`sessions/${id}`).get()).exists).toBe(true);
  await host.goto('/facilitator');
  const card = host
    .locator('.pending-cleanups .panel')
    .filter({ has: host.locator(`a[href="/session/${id}"]`) });
  await expect(card.getByText('Expired · manual deletion required')).toBeVisible();
  await card.getByRole('link').click();
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Keep workshop open' }).click();
  expect((await admin.doc(`sessions/${id}`).get()).exists).toBe(true);
  await host.getByRole('button', { name: 'Padam Semua Data Bengkel', exact: true }).click();
  await host.getByRole('button', { name: 'Ya, padam semua data' }).click();
  await expect(host.getByRole('heading', { name: 'Cleanup Complete' })).toBeVisible();
  expect((await admin.doc(`sessions/${id}`).get()).exists).toBe(false);
});
