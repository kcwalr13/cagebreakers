import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const G = (p: PWPage, fn: string) => p.evaluate((fn) => new Function('g', `return (${fn})(g)`)((window as Any).__siege), fn);

async function go(p: PWPage, screen: string) {
  await p.goto(`./?test&nosw&screen=${screen}`);
  await p.waitForFunction(() => !!(window as Any).__run && !!(window as Any).__siege);
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

// The drawing's sizes (SiegeScreen): squares of 40 from (4, 20); 11 across and 14 down, 448 by 606 in all.
const COLS = 11;
async function squareAt(p: PWPage, row: number, col: number) {
  const box = (await p.locator('.siege-board').boundingBox())!;
  const s = box.width / 448;
  return { x: box.x + (4 + col * 40 + 20) * s, y: box.y + (20 + row * 40 + 20) * s };
}
async function tapSquare(p: PWPage, row: number, col: number) {
  const at = await squareAt(p, row, col);
  await p.mouse.click(at.x, at.y);
}

test('Garden Siege: pick an element, plant and drag brambles, grow and upgrade, undo, and play a wave', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /Garden Siege/ }).first().click();
  await expect(p.getByRole('button', { name: /A new season/ })).toBeVisible();
  await p.getByRole('button', { name: /A new season/ }).click();
  await expect(p.locator('.siege-board')).toBeVisible();
  await expect(p.locator('.hud-round')).toContainText('Wave 1 of 20');
  // The first element is picked on the field, for free.
  await expect(p.locator('.sg-panel')).toContainText('Pick your first element');
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-01-start.png') });
  await p.getByRole('button', { name: /^Water/ }).click();
  expect(await G(p, '(g) => g.state().elements')).toEqual(['water']);

  // Tap a square: a bramble, and the way bends round it.
  const coins = await G(p, '(g) => g.state().coins') as number;
  const before = await p.locator('.sg-route').getAttribute('d');
  await tapSquare(p, 3, 5);
  expect(await G(p, '(g) => g.state().coins')).toBe(coins - 1);
  expect(await p.locator('.sg-route').getAttribute('d')).not.toBe(before);
  // Drag along row 6: a row of brambles in one stroke, and one undo takes it all back.
  const from = await squareAt(p, 6, 1), to = await squareAt(p, 6, 8);
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y);
  await p.mouse.up();
  await expect(p.locator('.sg-bramble')).toHaveCount(9);
  await p.screenshot({ path: info.outputPath('siege-02-brambles.png') });
  await p.getByRole('button', { name: 'Undo' }).click();
  await expect(p.locator('.sg-bramble')).toHaveCount(1);

  // Tap the bramble: grow it into a frog; earth's hedgehog is locked.
  await tapSquare(p, 3, 5);
  await expect(p.locator('.sg-panel')).toContainText('Grow it into');
  await expect(p.getByRole('button', { name: /Hedgehog: unlock earth first/ })).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-03-grow.png') });
  await p.getByRole('button', { name: /Grow into Frog/ }).click();
  await expect(p.locator('.sg-def')).toHaveCount(1);
  await expect(p.locator('.sg-reach')).toBeVisible();
  await p.getByRole('button', { name: /^Upgrade/ }).click();
  expect(await G(p, '(g) => g.state().placed[0].level')).toBe(1);

  // A bramble that would close the way is refused.
  await G(p, `(g) => { g.coins(99); for (let k = 0; k < ${COLS - 1}; k++) g.act({ type: "plant", cell: 9 * ${COLS} + k }); }`);
  // (The first tap puts the frog down; the next tries to plant.)
  await tapSquare(p, 9, COLS - 1);
  await expect(p.locator('.sg-reach')).toHaveCount(0);
  await tapSquare(p, 9, COLS - 1);
  await expect(p.locator('.sg-panel')).toContainText('close the way');

  // The seeds: unlock earth.
  await p.getByRole('button', { name: /^Seeds/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Hybrids');
  await p.waitForTimeout(400);
  await p.screenshot({ path: info.outputPath('siege-04-seeds.png') });
  await p.getByRole('dialog').getByRole('button', { name: /15/ }).first().click();
  expect(await G(p, '(g) => g.state().elements.length')).toBe(2);
  await p.getByRole('button', { name: 'Close' }).click();

  // The wave.
  await p.getByRole('button', { name: /Let them come/ }).click();
  await p.waitForTimeout(2500);
  await expect(p.locator('.sg-pest').first()).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-05-wave.png') });
  await p.getByRole('button', { name: '4×' }).click();
  await p.getByRole('button', { name: /Finish/ }).click();
  await expect(p.locator('.sg-panel')).toContainText('Wave 1:');
  await expect(p.locator('.hud-round')).toContainText('Wave 2 of 20');
});

test('Garden Siege: hybrids grow from defenders at their best, and the season ends', async ({ page: p }, info) => {
  await fresh(p);
  await G(p, '(g) => g.start("HYBRDS")');
  await go(p, 'siege');
  // A mazed garden through the hooks, with a frog at its best beside the way.
  await G(p, `(g) => {
    g.coins(3000);
    for (const e of ["water", "earth", "air", "sun"]) g.act({ type: "unlock", element: e });
    for (const [row, gap] of [[2, 10], [4, 0], [6, 10], [8, 0], [10, 10]]) for (let k = 0; k < 11; k++) if (k !== gap) g.act({ type: "plant", cell: row * 11 + k });
    const kinds = ["frog", "hedgehog", "thrush", "marigold"];
    g.state().placed.filter((x, i) => i % 2 === 0).forEach((x, i) => { g.act({ type: "grow", id: x.id, into: kinds[i % 4] }); g.act({ type: "upgrade", id: x.id }); g.act({ type: "upgrade", id: x.id }); });
  }`);
  const frog = await G(p, '(g) => g.state().placed.find((x) => x.kind === "frog").cell') as number;
  await tapSquare(p, Math.floor(frog / COLS), frog % COLS);
  await expect(p.getByRole('button', { name: /Grow into Toad/ })).toBeVisible();
  await expect(p.getByRole('button', { name: /Grow into Salamander/ })).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-06-hybrid.png') });
  await p.getByRole('button', { name: /Grow into Salamander/ }).click();
  await expect(p.locator('.sg-def.hybrid')).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('siege-07-maze.png') });

  // The rest of the season.
  await G(p, '(g) => { for (let i = 0; i < 25 && g.state().phase === "build"; i++) g.act({ type: "wave" }); }');
  await expect(p.locator('.summary-verdict h1')).toBeVisible();
  await expect(p.locator('.watch-total')).toContainText('Score');
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-08-end.png') });
  await p.getByRole('button', { name: 'Back to the title' }).click();
  await p.getByRole('button', { name: /Garden Siege/ }).first().click();
  await p.getByRole('button', { name: /How to play/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Plant brambles');
  await p.waitForTimeout(400);
  await p.screenshot({ path: info.outputPath('siege-09-help.png') });
});
