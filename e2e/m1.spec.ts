import { type Page as PWPage, expect, test } from '@playwright/test';

const SEED = '7KQ2X4';

interface Hooks {
  page(): { seed: string; solution: number[]; stones: number[]; cages: { id: number; cells: number[] }[] };
  placed(): number[];
  sealed(): number[];
}
const hooks = (p: PWPage) => ({
  page: () => p.evaluate(() => (window as unknown as { __cb: Hooks }).__cb.page()),
  placed: () => p.evaluate(() => (window as unknown as { __cb: Hooks }).__cb.placed()),
  sealed: () => p.evaluate(() => (window as unknown as { __cb: Hooks }).__cb.sealed()),
});

async function open(p: PWPage, extra = '') {
  await p.goto(`./?seed=${SEED}&test&nosw&screen=toy${extra}`);
  await p.evaluate(() => localStorage.clear());
  await p.goto(`./?seed=${SEED}&test&nosw&screen=toy${extra}`);
  await expect(p.locator('svg.board')).toBeVisible();
}

/** Centre of a cell in page coordinates. */
async function cellPoint(p: PWPage, cell: number) {
  const box = (await p.locator('svg.board').boundingBox())!;
  const scale = box.width / 362;
  return { x: box.x + (4 + (cell % 6) * 59 + 29.5) * scale, y: box.y + (4 + Math.floor(cell / 6) * 59 + 29.5) * scale };
}

async function tapCell(p: PWPage, cell: number) {
  const { x, y } = await cellPoint(p, cell);
  await p.mouse.click(x, y);
}

test('every control is at least 44 points', async ({ page: p }) => {
  await open(p);
  const small = await p.evaluate(() => [...document.querySelectorAll('button, input')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`));
  expect(small).toEqual([]);
  // Board cells are touch targets too.
  const box = (await p.locator('svg.board').boundingBox())!;
  expect((box.width / 362) * 59).toBeGreaterThanOrEqual(44);
});

test('the page fits the screen without scrolling', async ({ page: p }) => {
  await open(p);
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: innerHeight }));
  expect(scroll).toBeLessThanOrEqual(client);
  await expect(p.locator('.tray')).toBeInViewport();
});

test('tap a number, tap a cell: placing obeys the Latin rule and cages seal', async ({ page: p }, info) => {
  await open(p);
  const h = hooks(p);
  const pg = await h.page();
  await p.screenshot({ path: info.outputPath('01-start.png') });

  // Fill the first cage from the hidden solution using tap-then-tap.
  const cage = pg.cages[0]!;
  const openCells = cage.cells.filter((c) => !pg.stones[c]);
  for (const cell of openCells) {
    const n = pg.solution[cell]!;
    await p.getByRole('button', { name: `Number ${n}`, exact: true }).click();
    if (cell === openCells[openCells.length - 1]) await p.screenshot({ path: info.outputPath('02-holding.png') });
    await tapCell(p, cell);
    await p.getByRole('button', { name: `Number ${n}`, exact: true }).click(); // put it down
  }
  expect(await h.sealed()).toContain(cage.id);
  await p.waitForTimeout(1100);
  await p.screenshot({ path: info.outputPath('03-sealed.png') });

  // A repeat in the same row is refused with a reason.
  const target = openCells[0]!;
  const rowPeer = Array.from({ length: 6 }, (_, i) => Math.floor(target / 6) * 6 + i)
    .find((c) => c !== target && !pg.stones[c] && !(cage.cells.includes(c)))!;
  const n = pg.solution[target]!;
  await p.getByRole('button', { name: `Number ${n}`, exact: true }).click();
  await tapCell(p, rowPeer);
  await expect(p.locator('.status.warn')).toContainText(`already a ${n}`);
  expect((await h.placed())[rowPeer]).toBe(0);
  await p.screenshot({ path: info.outputPath('04-refused.png') });
});

test('drag a number onto the page, then drag it off to remove it', async ({ page: p }) => {
  await open(p);
  const h = hooks(p);
  const pg = await h.page();
  const cell = pg.stones.findIndex((v) => v === 0);
  const n = [1, 2, 3, 4, 5, 6].find((x) => x === pg.solution[cell])!;
  const slot = (await p.getByRole('button', { name: `Number ${n}`, exact: true }).boundingBox())!;
  const dest = await cellPoint(p, cell);
  await p.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
  await p.mouse.down();
  // The number floats 56px above the finger, so aim the finger 56px below the cell.
  await p.mouse.move(dest.x, dest.y + 56, { steps: 12 });
  await p.mouse.up();
  expect((await h.placed())[cell]).toBe(n);

  await p.mouse.move(dest.x, dest.y);
  await p.mouse.down();
  await p.mouse.move(dest.x, dest.y + 700, { steps: 12 });
  await p.mouse.up();
  expect((await h.placed())[cell]).toBe(0);
});

test('tapping an empty cell explains its cage', async ({ page: p }, info) => {
  await open(p);
  const pg = await hooks(p).page();
  const cell = pg.stones.findIndex((v) => v === 0);
  await tapCell(p, cell);
  await expect(p.getByRole('dialog')).toContainText('plot of');
  await expect(p.locator('.combo').first()).toBeVisible();
  await p.screenshot({ path: info.outputPath('05-cage-sheet.png') });
});

test('progress survives a reload', async ({ page: p }) => {
  await open(p);
  const h = hooks(p);
  const pg = await h.page();
  const cell = pg.stones.findIndex((v) => v === 0);
  const n = pg.solution[cell]!;
  await p.getByRole('button', { name: `Number ${n}`, exact: true }).click();
  await tapCell(p, cell);
  await p.goto('./?test&nosw');
  expect((await h.page()).seed).toBe(SEED);
  expect((await h.placed())[cell]).toBe(n);
});

test('a whole page can be sealed', async ({ page: p }, info) => {
  await open(p);
  const h = hooks(p);
  const pg = await h.page();
  await p.evaluate((sol) => {
    const cb = (window as unknown as { __cb: { page(): { stones: number[] }; place(c: number, n: number): boolean } }).__cb;
    const stones = cb.page().stones;
    sol.forEach((n, c) => { if (!stones[c]) cb.place(c, n); });
  }, pg.solution);
  expect((await h.sealed()).length).toBe(pg.cages.length);
  await expect(p.getByText('Every plot in bloom')).toBeVisible();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: info.outputPath('06-complete.png') });
});

test('night garden', async ({ page: p }, info) => {
  await p.emulateMedia({ colorScheme: 'dark' });
  await open(p);
  await expect(p.locator('html')).toHaveClass(/theme-dark/);
  const pg = await hooks(p).page();
  await p.evaluate((sol) => {
    const cb = (window as unknown as { __cb: { page(): { stones: number[]; cages: { cells: number[] }[] }; place(c: number, n: number): boolean } }).__cb;
    const pageNow = cb.page();
    for (const cage of pageNow.cages.slice(0, 4)) for (const c of cage.cells) if (!pageNow.stones[c]) cb.place(c, sol[c]!);
  }, pg.solution);
  await p.getByRole('button', { name: 'Number 4', exact: true }).click();
  await p.waitForTimeout(1200);
  await p.screenshot({ path: info.outputPath('07-dark.png') });
});
