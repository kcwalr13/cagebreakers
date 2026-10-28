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

test('the map: begin in the Kitchen Garden, finish it, save seeds and buy a path to the next garden', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /The Map/ }).click();
  await expect(p.locator('.station')).toHaveCount(34);
  // The Kitchen Garden and the Window Box are open from the start; five gardens are hidden.
  await expect(p.locator('.station.open')).toHaveCount(2);
  await expect(p.locator('.station.hidden')).toHaveCount(5);
  await expect(p.locator('.region')).toHaveCount(5);
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
  await expect(p.locator('.leaf-panel')).toContainText('New paths to open on the map: The Herb Spiral, The Rock Garden and The Fallow Field');
  await expect(p.locator('.leaf-panel')).toContainText('A packet of marigold seeds');
  await p.screenshot({ path: info.outputPath('m7-03-summary.png') });
  expect(await R(p, '(r) => r.profile().leaf')).toBeGreaterThan(0);
  // Enough seeds for the path, whatever the garden earned.
  await R(p, '(r) => r.setProfile({ ...r.profile(), leaf: r.profile().leaf + 20 })');
  const leaf = await R(p, '(r) => r.profile().leaf') as number;
  await p.getByRole('button', { name: /Back to the map/ }).click();
  await expect(p.locator('.station.buyable')).toHaveCount(3);
  await expect(p.locator('.station.filled')).toHaveCount(1);
  await p.getByRole('button', { name: /The Rock Garden, path for 12 seeds/ }).click();
  await p.getByRole('button', { name: /Open the path/ }).click();
  await expect(p.getByRole('button', { name: 'Begin' })).toBeVisible();
  await p.keyboard.press('Escape');
  await expect(p.locator('.station.open')).toHaveCount(3);
  expect(await R(p, '(r) => r.profile().leaf')).toBe(leaf - 12);
  // The run is counted once, even after a reload.
  await p.goto('./?test&nosw&screen=run');
  await p.waitForFunction(() => !!(window as Any).__run);
  await p.goto('./?test&nosw&screen=title');
  await p.waitForFunction(() => !!(window as Any).__run);
  expect(await R(p, '(r) => r.profile().leaf')).toBe(leaf - 12);
  await expect(p.locator('.leaf-count')).toContainText(String(leaf - 12));
});

test('the Potting Shed sells tools, upgrades and looks; the tool belt carries tools into a garden', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, `(r) => r.setProfile({ ...r.profile(), leaf: 200, filled: ['copy-desk', 'cloister', 'bare-vellum'], paths: ['cloister', 'bare-vellum'] })`);
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
  await p.getByRole('button', { name: /Daily Garden 6×6/ }).click();
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

test('gardens of other sizes: the Window Box from the start, the Allotment and the Walled Garden in the Estate', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /The Map/ }).click();
  await expect(p.locator('.station.open')).toContainText(['The Window Box', 'The Kitchen Garden']);
  await p.getByRole('button', { name: /The Window Box/ }).click();
  await p.getByRole('button', { name: 'Begin' }).click();
  await expect(p.locator('.hud-round')).toContainText('Week 1 of 4');
  expect(await p.locator('svg.board').getAttribute('data-size')).toBe('5');
  expect(await R(p, FINISH)).toBe('done');
  // Paths bought to the big gardens of the Estate.
  await R(p, `(r) => r.setProfile({ ...r.profile(), filled: ['copy-desk', 'cloister', 'bare-vellum', 'counting-house', 'long-night', 'grand-folio', 'allotment', 'vineyard'],
    paths: ['cloister', 'bare-vellum', 'counting-house', 'espalier', 'long-night', 'grand-folio', 'allotment', 'vineyard', 'walled-garden'] })`);
  await p.goto('./?test&nosw&screen=map');
  await p.waitForFunction(() => !!(window as Any).__run);
  await expect(p.locator('.station.open')).toHaveCount(11);
  await noSmallButtons(p);
  await p.locator('.map-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await p.screenshot({ path: info.outputPath('m7-07-map-sizes.png') });
  await p.getByRole('button', { name: /The Walled Garden/ }).click();
  await expect(p.getByRole('dialog')).toContainText('8×8');
  await p.getByRole('button', { name: 'Begin' }).click();
  await expect(p.locator('.hud-round')).toContainText('Week 1 of 8');
  expect(await p.locator('svg.board').getAttribute('data-size')).toBe('8');
  await noSmallButtons(p);
  // A tap on a square low in an 8×8 garden lands on that square.
  const target = await R(p, `(r) => { const s = r.state(), pg = r.page();
    for (const t of s.tokens.filter((t) => t.cell < 0)) {
      const c = [...pg.stones.keys()].reverse().find((c) => !pg.stones[c] && pg.solution[c] === t.n);
      if (c !== undefined) return { n: t.n, cell: c };
    } }`) as { n: number; cell: number };
  await p.getByRole('button', { name: new RegExp(`^Number ${target.n}(,|$)`) }).click();
  const box = (await p.locator('.board-wrap svg.board').boundingBox())!;
  const scale = box.width / (8 + 59 * 8);
  await p.mouse.click(box.x + (4 + (target.cell % 8) * 59 + 29.5) * scale, box.y + (4 + Math.floor(target.cell / 8) * 59 + 29.5) * scale);
  expect(await R(p, '(r, c) => r.state().tokens.find((t) => t.cell === c)?.n', target.cell)).toBe(target.n);
  await p.screenshot({ path: info.outputPath('m7-08-walled-garden.png') });
  expect(await R(p, FINISH)).toBe('done');
  await p.keyboard.press('Escape');
  await expect(p.locator('.summary-verdict')).toContainText('Harvest!');
});
