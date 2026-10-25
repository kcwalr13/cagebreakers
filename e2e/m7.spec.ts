import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const R = (p: PWPage, fn: string, ...args: unknown[]) =>
  p.evaluate(({ fn, args }) => new Function('r', 'args', `return (${fn})(r, ...args)`)((window as Any).__run, args), { fn, args });
/** How many numbers are in the hand, counting every stack. */
const handCount = (p: PWPage) => p.evaluate(() => [...document.querySelectorAll('.hand-slot')].reduce((n, el) => n + Number((el as HTMLElement).dataset.count ?? 1), 0));

async function fresh(p: PWPage, screen = 'title') {
  await p.goto(`./?test&nosw&screen=${screen}`);
  await p.evaluate(() => localStorage.clear());
  await p.goto(`./?test&nosw&screen=${screen}`);
  await p.waitForFunction(() => !!(window as Any).__run);
}

/** Plays the current run to its end by putting numbers on the solution, keeping the ink topped up. */
const FINISH = `(r) => { for (let i = 0; i < 12 && r.state().phase === 'arrange'; i++) {
  r.load({ ...r.state(), ink: r.state().setup.startInk }); r.solveHand(); r.dispatch({ type: 'ink' }); } return r.state().phase; }`;

async function noSmallButtons(p: PWPage) {
  const small = await p.evaluate(() => [...document.querySelectorAll('button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`));
  expect(small).toEqual([]);
}

test('the map: begin in the Kitchen Garden, finish it, save seeds and open the next gardens', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /The Map/ }).click();
  await expect(p.locator('.station')).toHaveCount(6);
  await expect(p.locator('.station.locked')).toHaveCount(5);
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('m7-01-map.png') });
  await p.getByRole('button', { name: /The Kitchen Garden/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Fill the garden');
  await expect(p.locator('.satchel-tool[aria-pressed="true"]')).toHaveCount(1);
  await p.waitForTimeout(250); // let the sheet finish rising
  await p.screenshot({ path: info.outputPath('m7-02-station.png') });
  await p.getByRole('button', { name: 'Begin' }).click();
  await expect(p.locator('.hud-round')).toContainText('Week 1 of 6');
  expect(await R(p, '(r) => r.state().setup.station')).toBe('copy-desk');
  expect(await R(p, FINISH)).toBe('done');
  await p.keyboard.press('Escape');
  await expect(p.locator('.leaf-panel')).toContainText(/\+\d+ seeds?/);
  await expect(p.locator('.leaf-panel')).toContainText('Opened on the map: The Rock Garden and The Fallow Field');
  await p.screenshot({ path: info.outputPath('m7-03-summary.png') });
  const leaf = await R(p, '(r) => r.profile().leaf') as number;
  expect(leaf).toBeGreaterThan(0);
  await p.getByRole('button', { name: /Back to the map/ }).click();
  await expect(p.locator('.station.locked')).toHaveCount(3);
  await expect(p.locator('.station.filled')).toHaveCount(1);
  // The run is counted once, even after a reload on the summary.
  await p.goto('./?test&nosw&screen=title');
  await p.waitForFunction(() => !!(window as Any).__run);
  expect(await R(p, '(r) => r.profile().leaf')).toBe(leaf);
  await expect(p.locator('.leaf-count')).toContainText(String(leaf));
});

test('the Potting Shed sells tools, upgrades and looks; the tool belt carries tools into a garden', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, `(r) => r.setProfile({ ...r.profile(), leaf: 200, filled: ['copy-desk', 'cloister', 'bare-vellum'] })`);
  await p.goto('./?test&nosw&screen=shop');
  await p.waitForFunction(() => !!(window as Any).__run);
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('m7-04-shop.png'), fullPage: true });
  await p.getByRole('button', { name: /Buy Extra/ }).click();
  await p.getByRole('button', { name: /Buy Seed Money for/ }).click();
  await p.getByRole('button', { name: /Buy Cottage Garden/ }).click();
  expect(await R(p, '(r) => r.profile().leaf')).toBe(200 - 20 - 20 - 30);
  await expect(p.locator('.shop-item.owned')).toHaveCount(3);
  // A style, once bought, can be worn.
  await p.locator('.shop-item', { hasText: 'Cottage Garden' }).getByRole('button', { name: 'Use' }).click();
  await expect.poll(() => p.evaluate(() => document.documentElement.className)).toContain('theme-newsprint');
  // Extra went straight into the satchel beside Hint; begin with both.
  await p.goto('./?test&nosw&screen=map');
  await p.waitForFunction(() => !!(window as Any).__run);
  await p.getByRole('button', { name: /The Rock Garden/ }).click();
  await expect(p.locator('.satchel-tool[aria-pressed="true"]')).toHaveCount(2);
  await expect(p.locator('.satchel-tool', { hasText: 'Extra' })).toHaveAttribute('aria-pressed', 'true');
  await p.getByRole('button', { name: 'Begin' }).click();
  expect(await R(p, '(r) => r.state().gold')).toBe(3);
  await expect(p.getByRole('button', { name: /^Extra/ })).toBeVisible();
  const before = await handCount(p);
  await p.getByRole('button', { name: /^Extra/ }).click();
  await p.getByRole('button', { name: /Draw a number for/ }).click();
  await expect.poll(() => handCount(p)).toBe(before + 1);
  await p.screenshot({ path: info.outputPath('m7-05-newsprint-quill.png') });
});

test('the Herbarium presses every finished garden', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, `(r) => r.startStation('copy-desk')`);
  await p.goto('./?test&nosw&screen=run');
  await p.waitForFunction(() => !!(window as Any).__run);
  await R(p, FINISH);
  await p.goto('./?test&nosw&screen=library');
  await p.waitForFunction(() => !!(window as Any).__run);
  await expect(p.locator('.book')).toHaveCount(1);
  await expect(p.locator('.book')).toContainText('The Kitchen Garden');
  await noSmallButtons(p);
  await p.locator('.book').click();
  await expect(p.getByRole('dialog')).toContainText('points');
  await p.screenshot({ path: info.outputPath('m7-06-library.png') });
});

test('the Daily Garden ignores upgrades and the tool belt', async ({ page: p }) => {
  await fresh(p);
  await R(p, `(r) => r.setProfile({ ...r.profile(), owned: ['purse-1', 'purse-2', 'quill', 'deeper-inkwell'], satchel: ['quill', 'lens'] })`);
  await p.goto('./?test&nosw&screen=title');
  await p.waitForFunction(() => !!(window as Any).__run);
  await p.getByRole('button', { name: /Daily Garden/ }).click();
  const s = await R(p, '(r) => ({ gold: r.state().gold, ink: r.state().ink, tools: r.state().setup.tools, station: r.state().setup.station })');
  expect(s).toEqual({ gold: 0, ink: 3, tools: ['lens'], station: null });
});

test('Dig turns a stone into one of your numbers', async ({ page: p }) => {
  await fresh(p);
  await R(p, `(r) => { r.setProfile({ ...r.profile(), owned: ['eraser'], satchel: ['eraser', 'lens'], filled: ['copy-desk', 'cloister'] }); r.startStation('cloister'); r.load({ ...r.state(), gold: 20 }); }`);
  await p.goto('./?test&nosw&screen=run');
  await p.waitForFunction(() => !!(window as Any).__run);
  await p.getByRole('button', { name: /^Dig/ }).click();
  await p.getByRole('button', { name: /Choose a stone for/ }).click();
  await expect(p.locator('svg.board .tool-target').first()).toBeVisible();
  // Try printed numbers until one may be lifted (a lift that would break a commission is refused).
  const lifted = await R(p, `(r) => { const p = r.page(); for (let c = 0; c < 36; c++) if (p.stones[c] && r.dispatch({ type: 'eraser', cell: c })) return c; return -1; }`) as number;
  expect(lifted).toBeGreaterThanOrEqual(0);
  expect(await R(p, '(r) => r.state().tokens.some((t) => t.round === 0)')).toBe(true);
});

test("the back gesture steps back like the back arrow, and leaves the app only from the title", async ({ page: p }) => {
  await fresh(p);
  await p.getByRole('button', { name: /The Map/ }).click();
  await expect(p.locator('.station').first()).toBeVisible();
  await p.goBack();
  await expect(p.getByRole('button', { name: /The Map/ })).toBeVisible();
  // A sheet closes first, then the screen goes back.
  await p.getByRole('button', { name: /The Map/ }).click();
  await p.getByRole('button', { name: /The Kitchen Garden/ }).click();
  await expect(p.getByRole('dialog')).toBeVisible();
  await p.goBack();
  await expect(p.getByRole('dialog')).toHaveCount(0);
  await expect(p.locator('.station').first()).toBeVisible();
  await p.goBack();
  await expect(p.getByRole('button', { name: /The Map/ })).toBeVisible();
  // The in-game back arrow also leaves nothing extra behind in history.
  await p.getByRole('button', { name: /The Map/ }).click();
  await p.getByRole('button', { name: 'Back to title' }).click();
  await expect(p.getByRole('button', { name: /The Map/ })).toBeVisible();
  await expect.poll(() => p.evaluate(() => history.state?.cagebreakers ?? null)).toBeNull();
});
