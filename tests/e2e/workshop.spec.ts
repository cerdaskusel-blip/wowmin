import { test, expect, Page } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';
async function join(page: Page, code: string, name: string) {
  await page.goto('/');
  await page.getByLabel('Session code').fill(code);
  await page.getByLabel('Your nickname').fill(name);
  await page.getByRole('button', { name: 'Join the workshop' }).click();
  await expect(page.getByText('YOU’RE IN. LET’S GET CREATIVE.')).toBeVisible();
}
test('live workshop: join, craft, upload, moderate, vote, reveal across browsers', async ({
  browser,
  page: host,
}) => {
  await host.goto('/facilitator');
  await host.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  await host.getByLabel('Workshop name').fill('Teachers make WOW');
  await host.getByRole('button', { name: 'Create workshop' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
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
  await expect(projector.getByText('2 teachers in the room.')).toBeVisible();
  await host.getByRole('button', { name: 'Next: Find your sticker voice' }).click();
  await expect(alice.getByRole('heading', { name: 'Find your sticker voice.' })).toBeVisible();
  await alice.getByRole('button', { name: 'Little pep talks' }).click();
  await alice.getByLabel('Make it yours').fill('Keep exploring!');
  await alice.getByRole('button', { name: 'Pop comic' }).click();
  await expect(alice.getByLabel('Your AI image prompt')).toHaveValue(/Keep exploring!/);
  await alice.getByRole('button', { name: 'Copy my prompt' }).click();
  await expect(alice.getByRole('button', { name: 'Copied. Go make your WOW!' })).toBeVisible();
  expect(await alice.evaluate(() => navigator.clipboard.readText())).toContain('Keep exploring!');
  await expect(alice.getByRole('link', { name: 'ChatGPT' })).toHaveAttribute(
    'href',
    'https://chatgpt.com',
  );
  await alice.reload();
  await expect(alice.getByLabel('Make it yours')).toHaveValue('Keep exploring!');
  await host.getByRole('button', { name: 'Next: Make a little magic' }).click();
  const image = await sharp({
    create: { width: 400, height: 400, channels: 3, background: '#efd278' },
  })
    .png()
    .toBuffer();
  for (const p of [alice, bob]) {
    await p
      .getByLabel('Finished sticker image')
      .setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: image });
    await p.getByRole('button', { name: 'Send to the showcase' }).click();
    await expect(p.getByText('Sent! Your facilitator is taking a look.')).toBeVisible();
  }
  await expect(host.locator('.moderation-card')).toHaveCount(2);
  await host
    .locator('.moderation-card')
    .filter({ hasText: 'Alice' })
    .getByRole('button', { name: 'Return' })
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
  await host.getByRole('button', { name: 'Return and next' }).click();
  await hit;
  await host.getByRole('button', { name: 'Back to review desk' }).click();
  release();
  await host.unroute('**/api/action');
  await expect(alice.getByText('Let’s give it another try.')).toBeVisible();
  await expect(host.getByRole('dialog')).not.toBeVisible();
  await alice
    .getByLabel('Finished sticker image')
    .setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: image });
  await alice.getByRole('button', { name: 'Replace my submission' }).click();
  await expect(alice.getByText('Sent! Your facilitator is taking a look.')).toBeVisible();
  for (const name of ['Alice', 'Bob']) {
    const card = host.locator('.moderation-card').filter({ hasText: name });
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(card).toHaveCount(0);
  }
  await expect(alice.getByText('You’re in the showcase!')).toBeVisible();
  await expect(host.locator('.gallery-card')).toHaveCount(2);
  await expect(projector.locator('.wall-image-button img').first()).toBeVisible();
  await host.getByRole('button', { name: 'Next: Send your sticker' }).click();
  await host.getByRole('button', { name: 'Next: The sticker showcase' }).click();
  await host.getByRole('button', { name: 'Confirm stage change' }).click();
  await expect(alice.locator('.gallery-card')).toHaveCount(2);
  await host.getByRole('button', { name: 'Open voting', exact: true }).click();
  await host.getByRole('button', { name: 'Confirm stage change' }).click();
  await alice
    .locator('.gallery-card')
    .filter({ hasText: 'Bob' })
    .getByRole('button', { name: 'This is my favorite' })
    .click();
  await alice.getByRole('button', { name: 'Cast my vote' }).click();
  await expect(alice.getByText('Your vote is counted')).toBeVisible();
  await expect(
    alice
      .locator('.gallery-card')
      .filter({ hasText: 'Alice' })
      .getByRole('button', { name: 'Your creation' }),
  ).toBeDisabled();
  await bob
    .locator('.gallery-card')
    .filter({ hasText: 'Alice' })
    .getByRole('button', { name: 'This is my favorite' })
    .click();
  await bob.getByRole('button', { name: 'Cast my vote' }).click();
  await expect(bob.getByText('Your vote is counted')).toBeVisible();
  await host.getByRole('button', { name: 'Close voting & reveal' }).click();
  await host.getByRole('button', { name: 'Confirm stage change' }).click();
  await expect(alice.getByText('Huge applause.')).toBeVisible();
  await expect(projector.locator('.winner')).toHaveCount(2);
  await expect
    .poll(() =>
      projector
        .locator('.winner img')
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(alice.getByText('2 votes. 2 creative minds.')).toBeVisible();
  await alice.screenshot({ path: 'test-results/participant-results.png', fullPage: true });
  await projector.screenshot({ path: 'test-results/projector-results.png', fullPage: true });
  await a.close();
  await b.close();
});
test('landing fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Big ideas/ })).toBeVisible();
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
  await page.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  await expect.poll(() => rejectOnce).toBe(false);
  await expect(page.getByRole('button', { name: 'Enter local facilitator studio' })).toBeVisible();
  await page.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  await expect(page.getByLabel('Workshop name')).toBeVisible();
});
