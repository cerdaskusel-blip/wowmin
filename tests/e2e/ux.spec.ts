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
  await host.getByRole('button', { name: 'Enter local facilitator studio' }).click();
  await host.getByLabel('Workshop name').fill(title);
  await host.getByRole('button', { name: 'Create workshop' }).click();
  await expect(host.getByText('FACILITATOR DASHBOARD')).toBeVisible();
  return { id: host.url().split('/').pop()!, code: await host.locator('.room-code b').innerText() };
}
async function join(p: Page, code: string, name: string) {
  await p.goto('/?code=' + code);
  await p.getByLabel('Your nickname').fill(name);
  await p.getByRole('button', { name: 'Join the workshop' }).click();
  await expect(p.getByText('YOU’RE IN. LET’S GET CREATIVE.')).toBeVisible();
}
async function next(h: Page, name: string, confirm = false) {
  await h.getByRole('button', { name, exact: true }).click();
  if (confirm) await h.getByRole('button', { name: 'Confirm stage change' }).click();
}
async function reopen(h: Page) {
  await h.getByText('Manual stage controls / reopen submissions', { exact: true }).click();
  await h.getByLabel('Go to stage').selectOption('submit');
  await h.getByRole('button', { name: 'Go to selected stage' }).click();
  await h.getByRole('button', { name: 'Confirm stage change' }).click();
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
  await next(host, 'Next: Find your sticker voice');
  await expect(p.getByRole('button', { name: 'Copy prompt', exact: true })).toBeInViewport();
  await p.getByRole('button', { name: 'Little pep talks' }).click();
  await expect(p.getByRole('button', { name: 'Little pep talks' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await p.getByLabel('Make it yours').fill('Keep growing!');
  await p.getByRole('button', { name: 'Copy prompt', exact: true }).click();
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
  await p.getByRole('button', { name: 'Copy prompt', exact: true }).click();
  await p.getByRole('link', { name: 'Copy needs your help — select prompt' }).click();
  await expect(p.getByText('Could not copy automatically.', { exact: false })).toBeInViewport();
  await p.getByRole('button', { name: 'Select prompt' }).click();
  expect(
    await p
      .locator('#generated-prompt')
      .evaluate((e: HTMLTextAreaElement) => e.selectionEnd - e.selectionStart),
  ).toBeGreaterThan(100);
  await capture(p, 'copy-error-mobile');
  await next(host, 'Next: Make a little magic');
  const image = await sticker();
  await p
    .getByLabel('Finished sticker image')
    .setInputFiles({ name: 'sticker.png', mimeType: 'image/png', buffer: image });
  await expect(p.getByAltText('Preview of your selected finished sticker')).toBeVisible();
  await host.getByRole('button', { name: 'Pause workshop' }).click();
  await expect(
    p.getByText('Workshop paused. Uploads and voting will resume', { exact: false }),
  ).toBeVisible();
  await expect(p.getByRole('button', { name: 'Send to the showcase' })).toBeDisabled();
  const paused = (await admin.doc(`sessions/${room.id}`).get()).data()!.pausedRemainingMs;
  await host.getByRole('button', { name: '+ 1 min' }).click();
  await expect
    .poll(async () => (await admin.doc(`sessions/${room.id}`).get()).data()!.pausedRemainingMs)
    .toBe(paused + 60000);
  await host.getByRole('button', { name: 'Resume workshop' }).click();
  await expect(p.getByRole('button', { name: 'Send to the showcase' })).toBeEnabled();
  await admin.doc(`sessions/${room.id}`).update({ stageEndsAt: Date.now() + 500 });
  await expect(p.getByRole('button', { name: 'Send to the showcase' })).toBeDisabled();
  await host.getByRole('button', { name: '+ 1 min' }).click();
  await expect(p.getByRole('button', { name: 'Send to the showcase' })).toBeEnabled();
  let release!: () => void, arrived!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    hit = new Promise<void>((r) => (arrived = r));
  await p.route('**/api/upload', async (route) => {
    arrived();
    await gate;
    await route.continue();
  });
  await p.getByRole('button', { name: 'Send to the showcase' }).click();
  await hit;
  await next(host, 'Next: Send your sticker');
  await next(host, 'Next: The sticker showcase', true);
  release();
  await expect(p.locator('.upload-panel .error')).toContainText(
    'Your selected image is still here',
  );
  await expect(p.getByAltText('Preview of your selected finished sticker')).toBeVisible();
  await expect(p.locator('.upload-panel .error')).toBeInViewport();
  await capture(p, 'interrupted-upload-mobile');
  await p.unroute('**/api/upload');
  await reopen(host);
  await p.getByRole('button', { name: 'Send to the showcase' }).click();
  await expect(p.getByText('Sent! Your facilitator is taking a look.')).toBeVisible();
  await host
    .locator('.moderation-card')
    .getByRole('button', { name: 'Approve', exact: true })
    .click();
  await next(host, 'Next: The sticker showcase', true);
  await host.getByRole('button', { name: 'Return to creator' }).click();
  await expect(p.getByText('Let’s give it another try.')).toBeVisible();
  await expect(
    p.getByText('Submissions are closed. Ask your facilitator', { exact: false }),
  ).toBeVisible();
  await expect(p.getByRole('link', { name: 'Sticker returned · View feedback' })).toBeInViewport();
  await capture(p, 'returned-gallery-mobile');
  await host.getByLabel(/^Show/).selectOption('rejected');
  await host.getByRole('button', { name: 'Restore to wall' }).click();
  await expect(p.getByText('You’re in the showcase!')).toBeVisible();
  await p.getByRole('link', { name: 'WOW home' }).click();
  await expect(p.getByRole('link', { name: /Resume workshop/ })).toBeVisible();
  await capture(p, 'resume-mobile');
  await p.getByRole('link', { name: /Resume workshop/ }).click();
  await expect(p.getByText('You’re in the showcase!')).toBeVisible();
  const token = await hostToken(request);
  await next(host, 'Open voting', true);
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
  const room = await start(host, 'WOW #1 · The Teacher Sticker Lab');
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
    await p.getByLabel('Your nickname').fill(name);
    await capture(p, `join-${size}`);
    await p.getByRole('button', { name: 'Join the workshop' }).click();
    await expect(p.getByText('YOU’RE IN. LET’S GET CREATIVE.')).toBeVisible();
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
  await next(host, 'Next: Find your sticker voice');
  for (const [p, size] of [
    [m, 'mobile'],
    [d, 'desktop'],
  ] as const) {
    await p.getByRole('button', { name: 'Little pep talks' }).click();
    await p.getByLabel('Make it yours').fill('Keep growing, little thinkers!');
    await p.getByRole('button', { name: 'Kawaii', exact: false }).click();
    await p.evaluate(() => scrollTo(0, 0));
    await capture(p, `studio-${size}`);
    await p.getByRole('button', { name: 'Copy my prompt', exact: true }).click();
    await expect(
      p.getByRole('button', { name: 'Copied. Go make your WOW!', exact: true }),
    ).toBeVisible();
    await capture(p, `prompt-copied-${size}`);
  }
  const audits: Record<string, unknown> = {};
  audits.studio = await audit(m, 'studio-mobile');
  await next(host, 'Next: Make a little magic');
  for (const [p, size, i] of [
    [m, 'mobile', 0],
    [d, 'desktop', 1],
  ] as const) {
    await p.getByLabel('Finished sticker image').setInputFiles({
      name: 'finished-sticker.png',
      mimeType: 'image/png',
      buffer: await sticker(i),
    });
    await p.locator('.upload-panel').scrollIntoViewIfNeeded();
    await capture(p, `upload-ready-${size}`);
    await p.getByRole('button', { name: 'Send to the showcase' }).click();
    await expect(p.getByText('Sent! Your facilitator is taking a look.')).toBeVisible();
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
  await expect(host.getByLabel('Live workshop totals')).toContainText('50 submitted');
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
  await next(host, 'Next: Send your sticker');
  await next(host, 'Next: The sticker showcase', true);
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
  await m.getByLabel('Find a teacher or caption').fill('Daniel');
  await expect(m.locator('.gallery-card')).toHaveCount(1);
  await m.getByRole('button', { name: 'Enlarge sticker by Daniel' }).click();
  await expect(m.getByRole('dialog')).toBeVisible();
  await m.keyboard.press('Escape');
  await expect(m.getByRole('dialog')).not.toBeVisible();
  await expect(m.getByRole('button', { name: 'Enlarge sticker by Daniel' })).toBeFocused();
  await m.getByLabel('Find a teacher or caption').fill('');
  await next(host, 'Open voting', true);
  await expect(m.getByRole('heading', { name: 'Pick your favorite.' })).toBeVisible();
  for (const [p, size] of [
    [m, 'mobile'],
    [d, 'desktop'],
  ] as const) {
    await p.evaluate(() => scrollTo(0, 0));
    await capture(p, `voting-${size}`);
  }
  await m.getByLabel('Find a teacher or caption').fill('Daniel');
  await m.getByRole('button', { name: 'This is my favorite' }).click();
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
  await host.getByRole('button', { name: 'Pause workshop' }).click();
  await expect(m.getByRole('button', { name: 'This is my favorite' })).toBeDisabled();
  expect(
    (
      await act(request, crowd[0].idToken, 'vote', {
        sessionId: room.id,
        submissionId: crowd[1].localId,
      })
    ).status(),
  ).toBe(409);
  await host.getByRole('button', { name: 'Resume workshop' }).click();
  await m.getByRole('button', { name: 'This is my favorite' }).click();
  await m.getByRole('button', { name: 'Cast my vote' }).click();
  await expect(m.getByText('Your vote is counted', { exact: true })).toBeVisible();
  await d.getByLabel('Find a teacher or caption').fill('Maya');
  await d.getByRole('button', { name: 'This is my favorite' }).click();
  await d.getByRole('button', { name: 'Cast my vote' }).click();
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
  await expect(host.getByLabel('Live workshop totals')).toContainText('50 / 50 votes cast');
  expect((await admin.collection(`sessions/${room.id}/votes`).get()).size).toBe(50);
  expect(
    (
      await act(request, crowd[0].idToken, 'vote', {
        sessionId: room.id,
        submissionId: crowd[2].localId,
      })
    ).status(),
  ).toBe(409);
  await next(host, 'Close voting & reveal', true);
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
  await expect(projector.getByRole('button', { name: 'Next winners' })).toBeVisible();
  await projector.getByRole('button', { name: 'Next winners' }).click();
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
