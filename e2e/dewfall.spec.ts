import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const D = (p: PWPage, fn: string) => p.evaluate((fn) => new Function('d', `return (${fn})(d)`)((window as Any).__dew), fn);

async function go(p: PWPage, screen: string) {
  await p.goto(`./?test&nosw&screen=${screen}`);
  await p.waitForFunction(() => !!(window as Any).__run && !!(window as Any).__dew);
}
async function fresh(p: PWPage, screen = 'title') {
  await go(p, screen);
  await p.evaluate(() => localStorage.clear());
  await go(p, screen);
}

async function noSmallButtons(p: PWPage) {
  const small = await p.evaluate(() => [...document.querySelectorAll('button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`));
  expect(small).toEqual([]);
}

/** Taps the middle of a square of the open puzzle's garden. */
async function tapSquare(p: PWPage, cell: number) {
  const box = await p.locator('.dew-board').boundingBox();
  const at = await D(p, `(d) => { const z = d.puzzle(); return { w: z.width, h: z.height }; }`) as { w: number; h: number };
  // The drawing's sizes (DewfallScreen): squares of 48 from (4, 48), 30 to the right, 22 and 4 below.
  const W = 4 * 2 + at.w * 48 + 30, H = 48 + at.h * 48 + 22 + 4;
  const s = box!.width / W;
  const x = box!.x + (4 + (cell % at.w) * 48 + 24) * s, y = box!.y + (48 + Math.floor(cell / at.w) * 48 + 24) * s;
  void H;
  await p.mouse.click(x, y);
}

test('Dewfall: the title offers the book and the daily puzzles; a first puzzle is solved by marking its trail', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /Dewfall/ }).first().click();
  await expect(p.getByRole('button', { name: /The book/ })).toBeVisible();
  await expect(p.getByRole('button', { name: /Daily Dewfall, small/ })).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('dew-01-title.png') });

  await p.getByRole('button', { name: /The book/ }).click();
  await expect(p.locator('.df-chapter')).toHaveCount(7);
  await expect(p.locator('.df-chapter.locked')).toHaveCount(6);
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('dew-02-book.png') });
  await p.getByRole('button', { name: 'First Light 1' }).click();
  await expect(p.locator('.dew-board')).toBeVisible();
  await expect(p.locator('.status')).toContainText('Only the counts');
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('dew-03-puzzle.png') });

  // Tap a square: trail. Tap again: back to nothing. With the other brush: not trail.
  const cell = await D(p, `(d) => { const z = d.puzzle(); return [...Array(z.width * z.height).keys()].find((c) => c !== z.entry && c !== z.exit); }`) as number;
  await tapSquare(p, cell);
  expect(await D(p, `(d) => d.attempt().marks[${cell}]`)).toBe(1);
  await tapSquare(p, cell);
  expect(await D(p, `(d) => d.attempt().marks[${cell}]`)).toBe(0);
  await p.getByRole('button', { name: 'Not trail' }).click();
  await tapSquare(p, cell);
  expect(await D(p, `(d) => d.attempt().marks[${cell}]`)).toBe(2);
  await p.getByRole('button', { name: 'Undo' }).click();
  expect(await D(p, `(d) => d.attempt().marks[${cell}]`)).toBe(0);
  await p.getByRole('button', { name: 'Trail' }).first().click();

  // Mark all but one trail square, then the last one by tapping it: solved, with two stars.
  const last = await D(p, '(d) => d.nearly()') as number;
  await p.screenshot({ path: info.outputPath('dew-04-nearly.png') });
  await tapSquare(p, last);
  expect(await D(p, '(d) => d.attempt().solved')).toBe(true);
  await p.locator('.dew-wrap').click();
  await expect(p.locator('.df-solved h2')).toContainText('Solved');
  await expect(p.locator('.df-solved .df-stars')).toHaveAttribute('aria-label', '2 of 2 stars');
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('dew-05-solved.png') });
  await p.getByRole('button', { name: /Next: First Light 2/ }).click();
  await expect(p.locator('.hud-round')).toContainText('First Light 2');
  // Back goes to the book, which shows the stars.
  await p.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(p.getByRole('button', { name: 'First Light 1, solved, 2 stars' })).toBeVisible();
});

test('Dewfall: the lantern costs a star, counts fill their lines, and the help shows every clue', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /Dewfall/ }).first().click();
  await p.getByRole('button', { name: /Daily Dewfall, medium/ }).click();
  await expect(p.locator('.dew-board')).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('dew-06-daily.png') });

  // The lantern asks first, then lights a square.
  await p.getByRole('button', { name: /^Lantern/ }).click();
  await expect(p.locator('.status')).toContainText('one star, not two');
  await p.getByRole('button', { name: 'Light' }).click();
  expect(await D(p, '(d) => d.attempt().lit.length')).toBe(1);
  await expect(p.locator('.df-sq.lit')).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('dew-07-lantern.png') });

  // Solve it through the hooks: one star, recorded for today.
  await D(p, '(d) => { d.nearly(); const z = d.puzzle(); d.act({ type: "paint", cells: z.trail, mark: 1 }); }');
  await p.locator('.dew-wrap').click();
  await expect(p.locator('.df-solved .df-stars')).toHaveAttribute('aria-label', '1 of 2 stars');
  await p.getByRole('button', { name: 'Back to the title' }).click();
  await expect(p.getByRole('button', { name: /Daily Dewfall, medium.*done, 1 star/ })).toBeVisible();
  await expect(p.locator('.streak-chip')).toContainText('1');

  await p.getByRole('button', { name: /How to play/ }).click();
  await expect(p.getByRole('dialog')).toContainText('A scarecrow');
  await expect(p.locator('.df-sample')).toHaveCount(6);
  await p.waitForTimeout(400);
  await p.screenshot({ path: info.outputPath('dew-08-help.png') });
});

test('Dewfall: the big chapters draw every clue, and fit the phone', async ({ page: p }, info) => {
  await fresh(p);
  // Open every chapter by recording solves straight into the profile.
  await p.evaluate(() => {
    const ids = ['first-light', 'dew', 'mist', 'leaves', 'pebbles', 'scarecrows'];
    const stars: Record<string, number> = {};
    for (const id of ids) for (let n = 1; n <= 3; n++) stars[`book:${id}:${n}`] = 2;
    localStorage.setItem('cagebreakers.dewfall', JSON.stringify({ v: 1, stars, daily: {} }));
  });
  await go(p, 'dewbook');
  await expect(p.locator('.df-chapter.locked')).toHaveCount(0);
  for (const [name, shot] of [['Scarecrows 5', 'dew-09-scarecrows.png'], ['Pebbles and Acorns 4', 'dew-10-pebbles.png'], ['The Big Garden 1', 'dew-11-big.png']] as const) {
    await go(p, 'dewbook');
    await p.getByRole('button', { name, exact: true }).click();
    await expect(p.locator('.dew-board')).toBeVisible();
    // The garden and the tools all fit on the screen.
    const tools = await p.locator('.df-tools').boundingBox();
    expect(tools!.y + tools!.height).toBeLessThanOrEqual(p.viewportSize()!.height);
    await noSmallButtons(p);
    await p.screenshot({ path: info.outputPath(shot) });
  }
});
