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
  await host.getByRole('button', { name: 'End Session & Delete Data', exact: true }).click();
  const dialog = host.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Keep workshop open' })).toBeFocused();
  expect((await new AxeBuilder({ page: host }).analyze()).violations).toEqual([]);
  await host.screenshot({ path: 'test-results/ephemeral-confirmation.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Keep workshop open' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  await host.getByRole('button', { name: 'End Session & Delete Data', exact: true }).click();
  await host.getByRole('button', { name: 'Yes, end & delete all data' }).click();
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
