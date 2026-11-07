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

/** Taps the middle of a square of the field (sizes from SiegeScreen: squares of 40 from (4, 20), 328 by 526 in all). */
async function tapSquare(p: PWPage, row: number, col: number) {
  const box = (await p.locator('.siege-board').boundingBox())!;
  const s = box.width / 328;
  await p.mouse.click(box.x + (4 + col * 40 + 20) * s, box.y + (20 + row * 40 + 20) * s);
}

test('Garden Siege: plant hedges and defenders, upgrade and sell, and play a wave', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /Garden Siege/ }).first().click();
  await expect(p.getByRole('button', { name: /A new season/ })).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-01-title.png') });
  await p.getByRole('button', { name: /A new season/ }).click();
  await expect(p.locator('.siege-board')).toBeVisible();
  await expect(p.locator('.hud-round')).toContainText('Wave 1 of 20');
  await expect(p.locator('.sg-wavebar')).toContainText('Next');
  await noSmallButtons(p);

  // A hedge: coins go down, and the way bends round it.
  const coins = await G(p, '(g) => g.state().coins') as number;
  const before = await p.locator('.sg-route').getAttribute('d');
  await p.getByRole('button', { name: /^Hedge,/ }).click();
  await tapSquare(p, 3, 3);
  expect(await G(p, '(g) => g.state().coins')).toBe(coins - 1);
  expect(await p.locator('.sg-route').getAttribute('d')).not.toBe(before);
  // A frog beside the way, picked up: its reach shows, and it can be upgraded and sold.
  await p.getByRole('button', { name: /^Frog/ }).click();
  await tapSquare(p, 5, 4);
  await expect(p.locator('.sg-def')).toHaveCount(1);
  await tapSquare(p, 5, 4);
  await expect(p.locator('.sg-reach')).toBeVisible();
  await expect(p.locator('.status')).toContainText('Frog');
  await p.screenshot({ path: info.outputPath('siege-02-build.png') });
  await p.locator('.sg-sel-btns .pill-btn.buy').click();
  expect(await G(p, '(g) => g.state().placed.find((x) => x.kind === "frog").level')).toBe(1);
  await p.getByRole('button', { name: /^Sell/ }).click();
  await expect(p.locator('.sg-def')).toHaveCount(0);

  // A wall that would close the way is refused.
  await G(p, '(g) => { g.coins(99); for (let k = 0; k < 7; k++) g.act({ type: "build", kind: "hedge", cell: 7 * 8 + k }); }');
  await p.getByRole('button', { name: /^Hedge,/ }).click();
  await tapSquare(p, 7, 7);
  await expect(p.locator('.status')).toContainText('close the way');
  await noSmallButtons(p);

  // Frogs along the way, then the wave.
  await G(p, '(g) => { for (const c of [2 * 8 + 4, 5 * 8 + 6, 9 * 8 + 6, 6 * 8 + 1]) g.act({ type: "build", kind: "frog", cell: c }); }');
  await p.getByRole('button', { name: /Let them come/ }).click();
  await p.waitForTimeout(2500);
  await expect(p.locator('.sg-pest').first()).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-03-wave.png') });
  await p.getByRole('button', { name: '4×' }).click();
  await p.getByRole('button', { name: /Finish/ }).click();
  await expect(p.locator('.status')).toContainText('Wave 1:');
  await expect(p.locator('.hud-round')).toContainText('Wave 2 of 20');
});

test('Garden Siege: hybrids are picked every five waves, and the season ends', async ({ page: p }, info) => {
  await fresh(p);
  await G(p, '(g) => g.start("HYBRID")');
  await go(p, 'siege');
  // A strong garden through the hooks, then five waves.
  await G(p, `(g) => {
    g.coins(3000);
    for (let r = 1; r < 11; r++) { g.act({ type: "build", kind: r % 2 ? "hedgehog" : "thrush", cell: r * 8 + 2 }); g.act({ type: "build", kind: r % 3 ? "marigold" : "hedgehog", cell: r * 8 + 4 }); }
    for (const x of g.state().placed) { g.act({ type: "upgrade", id: x.id }); g.act({ type: "upgrade", id: x.id }); }
    for (let w = 0; w < 5; w++) g.act({ type: "wave" });
  }`);
  await expect(p.locator('.sg-pick h2')).toContainText('Pick a hybrid');
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-04-pick.png') });
  await p.locator('.sg-hybrid').first().click();
  await expect(p.locator('.sg-tools .btn.tool')).toHaveCount(6);
  await p.screenshot({ path: info.outputPath('siege-05-hybrid.png') });

  // The rest of the season.
  await G(p, '(g) => { for (let i = 0; i < 40; i++) { const s = g.state(); if (s.phase === "pick") g.act({ type: "pick", kind: s.offer[0] }); else if (s.phase === "build") g.act({ type: "wave" }); } }');
  await expect(p.locator('.summary-verdict h1')).toBeVisible();
  await expect(p.locator('.watch-total')).toContainText('Score');
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('siege-06-end.png') });
  await p.getByRole('button', { name: 'Back to the title' }).click();
  await p.getByRole('button', { name: /Garden Siege/ }).first().click();
  await expect(p.getByRole('button', { name: /A new season/ })).toBeVisible();
  await p.getByRole('button', { name: /How to play/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Plant hedges');
  await p.waitForTimeout(400);
  await p.screenshot({ path: info.outputPath('siege-07-help.png') });
});
