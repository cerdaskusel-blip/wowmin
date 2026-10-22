import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Review the official artwork and real navigation without creating workshop data.
test('official landing: responsive artwork, accessible text and working navigation', async ({
  page,
}) => {
  await page.goto('/');
  const artwork = page.getByRole('img', { name: 'Wow Mean!', exact: true });
  await expect(artwork).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wow Mean!', exact: true })).toBeVisible();
  await artwork.evaluate(async (image: HTMLImageElement) => image.decode());
  await expect(artwork).toHaveJSProperty('naturalWidth', 1536);
  const tagline = page.locator('.landing-tagline');
  await expect(tagline).toHaveText('Cipta | Kongsi | Undi');
  for (const viewport of [
    { width: 320, height: 780 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 1000 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      await document.fonts.ready;
      scrollTo(0, 0);
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(artwork).toBeInViewport();
    await expect(tagline).toBeInViewport();
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations, `accessibility at ${viewport.width}px`).toEqual([]);
    if (viewport.width === 390 || viewport.width === 1440) {
      await page.screenshot({
        path: `docs/screenshots/v2-step-5/landing-${viewport.width === 390 ? 'mobile' : 'desktop'}.png`,
        fullPage: true,
      });
    }
    const join = page.getByRole('link', { name: 'Masuk Sesi', exact: true });
    await join.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Kod Sesi')).toBeInViewport();
    await page.evaluate(() => scrollTo(0, 0));
  }
  const host = page.getByRole('link', { name: 'Ruang Fasilitator', exact: true });
  await host.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/facilitator$/);
  await expect(page.getByRole('heading', { name: 'Masuk ke Ruang Fasilitator' })).toBeVisible();
  await page.goto('/?code=ABC234');
  await expect(page.getByLabel('Kod Sesi')).toHaveValue('ABC234');
  await expect(page.getByLabel('Kod Sesi')).toBeInViewport();
});
