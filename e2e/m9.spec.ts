import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const R = (p: PWPage, fn: string, ...args: unknown[]) =>
  p.evaluate(({ fn, args }) => new Function('r', 'args', `return (${fn})(r, ...args)`)((window as Any).__run, args), { fn, args });

async function go(p: PWPage, screen: string) {
  await p.goto(`./?test&nosw&screen=${screen}`);
  await p.waitForFunction(() => !!(window as Any).__run);
}
async function fresh(p: PWPage, screen = 'title') {
  await go(p, screen);
  await p.evaluate(() => localStorage.clear());
  await go(p, screen);
}

/** Plays the current run to its end by putting numbers on the solution, keeping the water topped up. */
const FINISH = `(r) => { for (let i = 0; i < 12 && r.state().phase === 'arrange'; i++) {
  r.load({ ...r.state(), ink: r.state().setup.startInk }); r.solveHand(); r.dispatch({ type: 'ink' }); } return r.state().phase; }`;

async function noSmallButtons(p: PWPage) {
  const small = await p.evaluate(() => [...document.querySelectorAll('button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`));
  expect(small).toEqual([]);
}

const OPEN_ALL = `(r) => r.setProfile({ ...r.profile(), leaf: 60, filled: ['copy-desk', 'counting-house'], paths: ['espalier', 'lost-labels', 'knot-garden', 'herb-spiral', 'tea-garden'] })`;

test('twisted gardens: fences, lost labels and crossed paths, drawn and kept', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, OPEN_ALL);
  await R(p, `(r) => r.startStation('espalier')`);
  await go(p, 'run');
  const fences = await R(p, '(r) => r.page().fences.length') as number;
  await expect(p.locator('svg.board .fence')).toHaveCount(fences);
  // A number that breaks a fence is refused, and says why.
  const refused = await R(p, `(r) => { const s = r.state(), pg = r.page();
    for (const f of pg.fences) {
      if (pg.stones[f.a] || pg.stones[f.b]) continue;
      const big = s.tokens.find((t) => t.cell < 0 && t.n === pg.solution[f.b]);
      if (!big) continue;
      r.dispatch({ type: 'place', id: big.id, cell: f.b });
      const n = pg.size, row = Math.floor(f.a / n), col = f.a % n;
      const clear = (v) => !pg.stones.some((x, c) => x === v && (Math.floor(c / n) === row || c % n === col));
      const low = r.state().tokens.find((t) => t.cell < 0 && t.n < pg.solution[f.b] && clear(t.n));
      if (low) return r.dispatch({ type: 'place', id: low.id, cell: f.a }) ? 'placed' : 'refused';
      return 'none';
    } return 'none'; }`);
  if (refused !== 'none') {
    expect(refused).toBe('refused');
    await expect(p.locator('.status.warn')).toContainText('fence');
  }
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('m9-01-fences.png') });

  await R(p, `(r) => r.startStation('lost-labels')`);
  await go(p, 'run');
  const labels = await p.locator('svg.board .target').allTextContents();
  expect(labels.length).toBeGreaterThan(8);
  for (const l of labels) expect(l).toMatch(/^\d+$/);
  await p.screenshot({ path: info.outputPath('m9-02-lost-labels.png') });

  await R(p, `(r) => r.startStation('knot-garden')`);
  await go(p, 'run');
  await expect(p.locator('svg.board .diagonals')).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('m9-03-crossed-paths.png') });
  expect(await R(p, FINISH)).toBe('done');
});

test('a Zen garden: no requests, no water, and full bloom without a Hint finds the Secret Garden', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, OPEN_ALL);
  await go(p, 'map');
  await p.getByRole('button', { name: /^The Herb Spiral/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Every plot in bloom, with no Hint');
  await p.getByRole('button', { name: 'Begin' }).click();
  await expect(p.locator('.zen-note')).toBeVisible();
  await expect(p.locator('.commission')).toHaveCount(0);
  await expect(p.locator('.hud-ink')).toHaveCount(0);
  await expect(p.getByRole('button', { name: /Finish/ })).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('m9-04-zen.png') });
  expect(await R(p, FINISH)).toBe('done');
  await p.keyboard.press('Escape');
  await expect(p.locator('.summary-verdict')).toContainText('Finished!');
  await expect(p.locator('.leaf-panel')).toContainText('You found a hidden garden: The Secret Garden');
  expect(await R(p, `(r) => r.profile().stars['herb-spiral']`)).toBe(3);
  await p.screenshot({ path: info.outputPath('m9-05-zen-summary.png') });
});

test('the home garden: plant a seed packet in a bed, and build with seeds', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, `(r) => r.setProfile({ ...r.profile(), leaf: 60, home: { ...r.profile().home, tray: ['poppy', 'daisy'] }, stats: { ...r.profile().stats, weeks: 4 } })`);
  await go(p, 'home');
  await noSmallButtons(p);
  await p.getByRole('button', { name: /^Poppy seeds/ }).click();
  await expect(p.locator('.home-tile.target')).toHaveCount(3);
  await p.getByRole('button', { name: 'Raised bed' }).first().click();
  await expect(p.getByRole('button', { name: /^Poppy, just planted/ })).toHaveCount(1);
  expect(await R(p, '(r) => r.profile().home.tray')).toEqual(['daisy']);
  // Build a bench on the grass.
  await p.getByRole('button', { name: 'Grass' }).first().click();
  await expect(p.getByRole('dialog')).toContainText('Build here');
  await p.getByRole('button', { name: /Bench for 25 seeds/ }).click();
  await expect(p.getByRole('button', { name: 'Bench' })).toHaveCount(1);
  expect(await R(p, '(r) => r.profile().leaf')).toBe(35);
  // Watering anywhere grows it: twenty weeks on, it's in bloom.
  await R(p, `(r) => r.setProfile({ ...r.profile(), stats: { ...r.profile().stats, weeks: 30 } })`);
  await expect(p.getByRole('button', { name: /^Poppy, in bloom/ })).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('m9-06-home.png') });
});

test('the journal: a finished goal is claimed for seeds, and the title shows how many wait', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, `(r) => r.setProfile({ ...r.profile(), stats: { ...r.profile().stats, finished: 1 } })`);
  await go(p, 'title');
  await expect(p.locator('.badge')).toHaveText('1');
  await p.getByRole('button', { name: /Journal/ }).click();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('m9-07-journal.png') });
  await p.getByRole('button', { name: /Claim First harvest/ }).click();
  expect(await R(p, '(r) => r.profile().leaf')).toBe(5);
  await expect(p.locator('.goal.claimed')).toHaveCount(1);
});

test('the Daily Garden pays its bonus and starts a streak; the Weekly Garden brings a twist', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /Daily Garden 5×5/ }).click();
  expect(await R(p, FINISH)).toBe('done');
  await p.keyboard.press('Escape');
  await expect(p.locator('.leaf-panel')).toContainText('for the Daily Garden');
  await expect(p.locator('.leaf-panel')).toContainText('1-day streak');
  await go(p, 'title');
  await expect(p.locator('.streak-chip')).toContainText('1');
  await expect(p.locator('.daily-size.done')).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('m9-08-title.png') });
  await p.getByRole('button', { name: /Weekly Garden/ }).click();
  const page = await R(p, '(r) => r.state().setup.page') as string;
  expect(page).toMatch(/fences|hidden|diagonal/);
  expect(await R(p, '(r) => !!r.state().weekly')).toBe(true);
  await p.screenshot({ path: info.outputPath('m9-09-weekly.png') });
});

test('the map scrolls through its four regions; a closed region says how many stars it needs', async ({ page: p }, info) => {
  await fresh(p);
  await go(p, 'map');
  await expect(p.locator('.region.closed')).toHaveCount(3);
  await expect(p.locator('.region').nth(1)).toContainText('Opens with 8 stars');
  await p.getByRole('button', { name: 'A hidden garden' }).first().click();
  await expect(p.getByRole('dialog')).toContainText('Earn all 3 stars at The Rock Garden');
  await p.keyboard.press('Escape');
  await noSmallButtons(p);
  await p.locator('.map-scroll').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await p.screenshot({ path: info.outputPath('m9-10-wild-wood.png') });
});
