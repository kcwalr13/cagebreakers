import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const R = (p: PWPage, fn: string, ...args: unknown[]) =>
  p.evaluate(({ fn, args }) => new Function('r', 'args', `return (${fn})(r, ...args)`)((window as Any).__run, args), { fn, args });

async function fresh(p: PWPage, extra = '') {
  await p.goto(`./?test&nosw${extra}&screen=title`);
  await p.evaluate(() => localStorage.clear());
  await p.goto(`./?test&nosw${extra}&screen=title`);
  await p.waitForFunction(() => !!(window as Any).__run);
}

async function settled(p: PWPage) {
  await p.locator('.sheet').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
}

test('the Daily Page is the same page for everyone today, kept apart from your own run', async ({ page: p }, info) => {
  await fresh(p);
  await expect(p.getByRole('button', { name: /Daily Page/ })).toContainText('same page and shops');
  await p.screenshot({ path: info.outputPath('m5-01-title.png') });
  // Start your own run first, so the daily must not replace it.
  await p.getByRole('button', { name: /^New run/ }).click();
  const ownSeed = await R(p, '(r) => r.state().seed');
  await p.getByRole('button', { name: 'Back to title' }).click();
  await p.getByRole('button', { name: /Daily Page/ }).click();
  const daily = await R(p, '(r) => ({ seed: r.state().seed, daily: r.state().daily })') as { seed: string; daily: string };
  const expected = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  expect(daily.daily).toBe(expected);
  expect(daily.seed).not.toBe(ownSeed);
  // The same day gives the same seed on a fresh phone.
  await fresh(p);
  await p.getByRole('button', { name: /Daily Page/ }).click();
  expect(await R(p, '(r) => r.state().seed')).toBe(daily.seed);
  await p.getByRole('button', { name: 'Back to title' }).click();
  await expect(p.getByRole('button', { name: /Daily Page/ })).toContainText('In progress: clash 1');
  await expect(p.getByRole('button', { name: /^New run/ })).toBeVisible();
});

test('the Codex fills in as you meet species, items, seals and Keepers', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /^Codex/ }).click();
  await expect(p.locator('.title-sub')).toContainText('0 of 30 species');
  await p.getByRole('button', { name: 'Back to title' }).click();
  await R(p, `(r) => { r.startRun('CQDEXA'); r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id }); }`);
  await p.goto('./?test&nosw&screen=codex');
  const met = await p.locator('.codex-cell:not(.unmet)').count();
  expect(met).toBeGreaterThan(0);
  await expect(p.locator('.title-sub')).toContainText(`${met} of 30 species`);
  await p.screenshot({ path: info.outputPath('m5-02-codex.png') });
  await p.locator('.codex-cell:not(.unmet)').first().click();
  await expect(p.getByRole('dialog')).toContainText('per hit');
});

test('settings: sound, vibration, less motion and left-thumb controls', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, `(r) => { r.startRun('SETTNG'); r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id }); r.dispatch({ type: 'pick', choice: 0 }); }`);
  await p.goto('./?test&nosw&screen=run');
  await p.getByRole('button', { name: 'Menu' }).click();
  await settled(p);
  await p.getByRole('group', { name: 'Motion' }).getByRole('button', { name: 'Less' }).click();
  await p.getByRole('group', { name: 'Controls' }).getByRole('button', { name: 'Left thumb' }).click();
  await p.getByRole('group', { name: 'Sound' }).getByRole('button', { name: 'On' }).click();
  expect(await p.evaluate(() => [document.documentElement.dataset.motion, document.documentElement.dataset.hand])).toEqual(['reduced', 'left']);
  const small = await p.evaluate(() => [...document.querySelectorAll('.sheet button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44)).map(({ label }) => label));
  expect(small).toEqual([]);
  await p.screenshot({ path: info.outputPath('m5-03-settings.png'), fullPage: true });
  await p.keyboard.press('Escape');
  // The Clash button now sits at the left edge, under the left thumb.
  const clash = (await p.getByRole('button', { name: /^Clash$/ }).boundingBox())!;
  const reroll = (await p.getByRole('button', { name: /Reroll/ }).boundingBox())!;
  expect(clash.x).toBeLessThan(reroll.x);
  await p.screenshot({ path: info.outputPath('m5-04-left-thumb.png') });
  // Settings survive a reload.
  await p.reload();
  expect(await p.evaluate(() => document.documentElement.dataset.hand)).toBe('left');
});

test('a save code moves everything to another phone', async ({ page: p, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await fresh(p);
  await R(p, `(r) => { r.startRun('MQVEME'); r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id }); r.dispatch({ type: 'pick', choice: 1 }); }`);
  const before = await R(p, '(r) => r.state()') as { seed: string; satchel: string[] };
  await p.goto('./?test&nosw&screen=title');
  await p.getByRole('button', { name: 'Menu' }).click();
  await p.getByRole('button', { name: 'Move to another phone' }).click();
  await p.getByRole('button', { name: 'Copy my save code' }).click();
  const code = await p.getByRole('textbox', { name: 'Your save code' }).inputValue();
  expect(code.startsWith('CB1')).toBe(true);

  // A new phone: nothing saved.
  await p.evaluate(() => localStorage.clear());
  await p.goto('./?test&nosw&screen=title');
  await expect(p.getByRole('button', { name: /Continue run/ })).toHaveCount(0);
  await p.getByRole('button', { name: 'Menu' }).click();
  await p.getByRole('button', { name: 'Move to another phone' }).click();
  await p.getByRole('textbox', { name: 'Save code to load' }).fill('CB1Zgarbage');
  await p.getByRole('button', { name: /Load it/ }).click();
  await expect(p.getByRole('status')).toContainText(/incomplete|doesn't look/);
  await p.getByRole('textbox', { name: 'Save code to load' }).fill(code);
  await p.getByRole('button', { name: /Load it/ }).click();
  await p.waitForLoadState('load');
  await p.waitForFunction(() => !!(window as Any).__run);
  await expect(p.getByRole('button', { name: /Continue run/ })).toBeVisible();
  const after = await R(p, `(r) => r.state()`) as { seed: string; satchel: string[] } | null;
  expect(after?.seed ?? (await p.evaluate(() => JSON.parse(localStorage.getItem('cagebreakers.run')!).seed))).toBe(before.seed);
});

test('the first chapter teaches as you play, one tip at a time', async ({ page: p }, info) => {
  await fresh(p, '&coach');
  await p.getByRole('button', { name: /^New run/ }).click();
  // Claiming explains itself in the status row; the first tip waits for the shop.
  await expect(p.locator('.coach')).toHaveCount(0);
  await R(p, `(r) => { r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id }); r.dispatch({ type: 'pick', choice: 0 }); }`);
  await p.keyboard.press('Escape');
  await expect(p.locator('.coach')).toContainText('no number may repeat');
  await p.locator('.coach').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await p.screenshot({ path: info.outputPath('m5-05-first-tip.png') });
  // The tip never covers the controls.
  await expect(p.getByRole('button', { name: /^Clash$/ })).toBeInViewport({ ratio: 1 });
  await p.locator('.coach').getByRole('button', { name: 'Got it' }).click();
  await expect(p.locator('.coach')).toHaveCount(0);
});

test('the first visit downloads under 3 MB, and a clash simulates in under 10 ms here too', async ({ page: p }) => {
  let bytes = 0;
  p.on('response', async (r) => { try { bytes += (await r.body()).length; } catch { /* redirects have no body */ } });
  await p.goto('./');
  await p.waitForFunction(() => navigator.serviceWorker?.ready.then(() => true));
  await p.waitForTimeout(1500);
  expect(bytes).toBeLessThan(3 * 1024 * 1024);
  await p.goto('./?test&nosw&screen=title');
  await p.waitForFunction(() => !!(window as Any).__run);
  const ms = await R(p, `(r) => {
    r.startRun('SPEEDY'); r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id }); r.dispatch({ type: 'pick', choice: 0 });
    const t0 = performance.now(); let n = 0;
    while (performance.now() - t0 < 300) { r.benchFight(); n++; }
    return (performance.now() - t0) / n;
  }`) as number;
  expect(ms).toBeLessThan(10);
});
