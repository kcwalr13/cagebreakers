import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const R = (p: PWPage, fn: string, ...args: unknown[]) =>
  p.evaluate(({ fn, args }) => new Function('r', 'args', `return (${fn})(r, ...args)`)((window as Any).__run, args), { fn, args });

async function fresh(p: PWPage) {
  await p.goto('./?test&nosw&screen=title');
  await p.evaluate(() => localStorage.clear());
  await p.goto('./?test&nosw&screen=title');
  await p.waitForFunction(() => !!(window as Any).__run);
}

async function cellPoint(p: PWPage, cell: number) {
  const box = (await p.locator('.board-wrap svg.board').boundingBox())!;
  const scale = box.width / 362;
  return { x: box.x + (4 + (cell % 6) * 59 + 29.5) * scale, y: box.y + (4 + Math.floor(cell / 6) * 59 + 29.5) * scale };
}

/** Plays the current planning phase like a simple player, then clashes and returns to planning. */
const AUTOPLAY_ROUND = `(r) => {
  let s = r.state();
  for (let guard = 0; guard < 40; guard++) {
    s = r.state();
    if (s.phase === 'merge') { r.dispatch({ type: 'merge', keep: s.merge.uids[0] }); continue; }
    if (s.phase === 'pick') { r.dispatch({ type: 'pick', choice: 0 }); continue; }
    const bench = s.units.filter((u) => u.cell < 0);
    const onBoard = s.units.filter((u) => u.cell >= 0).length;
    let did = false;
    for (const u of bench) {
      if (onBoard >= r.reach()) break;
      const cells = r.legalCells(u.uid);
      if (cells.length) { r.dispatch({ type: 'place', uid: u.uid, cell: cells[0] }); did = true; break; }
    }
    if (did) continue;
    const page = r.page();
    if (bench.length && onBoard >= r.reach()) {
      const cage = page.cages.filter((c) => !s.claimed.includes(c.id)).map((c) => c.id).sort((a, b) => r.claimCost(a) - r.claimCost(b))[0];
      if (cage !== undefined && r.claimCost(cage) <= s.gold && r.dispatch({ type: 'claim', cage })) continue;
    }
    const i = s.offers.findIndex((o) => !o.sold);
    if (i >= 0 && bench.length < 6 && r.dispatch({ type: 'buy', offer: i })) continue;
    if (bench.length >= 6) { r.dispatch({ type: 'sell', uid: bench[0].uid }); continue; }
    break;
  }
  if (r.state().units.some((u) => u.cell >= 0)) r.dispatch({ type: 'clash' });
  r.finishClash();
  return r.state().phase;
}`;

test('a run begins with a free claim, then shopping, placing and a clash', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /New run/ }).click();
  await expect(p.locator('.hud-row')).toContainText('20');
  await p.screenshot({ path: info.outputPath('m3-01-first-claim.png') });

  // Claim a two-cell cage through its sheet.
  const cage = await R(p, `(r) => r.page().cages.find((c) => c.cells.length === 2)`) as { id: number; cells: number[] };
  const pt = await cellPoint(p, cage.cells[0]!);
  await p.mouse.click(pt.x, pt.y);
  await p.getByRole('button', { name: 'Claim it free' }).click();
  // The first chapter opens with a pick of three items.
  await expect(p.getByRole('dialog')).toContainText('Choose an item');
  await expect(p.locator('.pick-card')).toHaveCount(3);
  await p.screenshot({ path: info.outputPath('m3-01b-pick.png') });
  await p.locator('.pick-card').first().click();
  await expect(p.getByRole('dialog')).toHaveCount(0);
  await expect(p.locator('.offer:not(.sold)')).toHaveCount(4);

  // Buy an offer that fits, straight onto a legal cell: tap the offer, tap the cell.
  const plan = await R(p, `(r) => { const s = r.state(); const page = r.page();
    for (let i = 0; i < s.offers.length; i++) { const o = s.offers[i];
      for (const c of s.claimed.flatMap((id) => page.cages[id].cells)) { if (page.stones[c]) continue;
        if (o.n2 !== undefined || o.n === 0) continue;
        const vals = page.stones.map((v, k) => v || (s.units.find((u) => u.cell === k)?.n ?? 0));
        const clash = [0,1,2,3,4,5].some((k) => (vals[Math.floor(c / 6) * 6 + k] === o.n) || (vals[k * 6 + (c % 6)] === o.n));
        if (!clash) return { i, c }; } } return null; }`) as { i: number; c: number } | null;
  expect(plan).not.toBeNull();
  await p.locator('.offer').nth(plan!.i).click();
  await p.screenshot({ path: info.outputPath('m3-02-offer-selected.png') });
  const cp = await cellPoint(p, plan!.c);
  await p.mouse.click(cp.x, cp.y);
  expect((await R(p, `(r) => r.state().units.filter((u) => u.cell >= 0).length`))).toBe(1);
  await p.screenshot({ path: info.outputPath('m3-03-placed.png') });

  const small = await p.evaluate(() => [...document.querySelectorAll('button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`));
  expect(small).toEqual([]);
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: innerHeight }));
  expect(scroll).toBeLessThanOrEqual(client);
  // Nothing may be clipped: the bottom row and the shop must be fully on screen.
  await expect(p.getByRole('button', { name: /^Clash$/ })).toBeInViewport({ ratio: 1 });
  await expect(p.locator('.offer').last()).toBeInViewport({ ratio: 1 });
  const cell = await p.evaluate(() => { const b = document.querySelector('.board-wrap svg.board')!.getBoundingClientRect(); return (b.width / 362) * 59; });
  expect(cell).toBeGreaterThanOrEqual(44);

  await p.getByRole('button', { name: /^Clash$/ }).click();
  await expect(p.locator('.clash-svg')).toBeVisible();
  await p.getByRole('button', { name: 'Skip' }).click();
  await expect(p.getByRole('dialog')).toContainText(/Victory|Defeat|Draw/, { timeout: 5000 });
  await p.screenshot({ path: info.outputPath('m3-04-result.png') });
  await p.getByRole('button', { name: /On to clash 2|See the run/ }).click();
  await expect(p.locator('.hud-row')).toContainText('2/15');
  await p.screenshot({ path: info.outputPath('m3-05-clash-2.png') });
});

test('a run resumes after the game is closed', async ({ page: p }) => {
  await fresh(p);
  await R(p, `(r) => { r.startRun('RESUME'); const s = r.state(); r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id }); }`);
  await R(p, AUTOPLAY_ROUND);
  await R(p, AUTOPLAY_ROUND);
  const clash = await R(p, `(r) => r.state().clash`);
  await p.goto('./?test&nosw&screen=title');
  await expect(p.getByRole('button', { name: /Continue run/ })).toContainText(`Clash ${clash} of 15`);
  await p.getByRole('button', { name: /Continue run/ }).click();
  await expect(p.locator('.hud-row')).toContainText(`${clash}/15`);
});

test('a whole run can be played to its end', async ({ page: p }, info) => {
  test.setTimeout(120_000);
  await fresh(p);
  await R(p, `(r) => { r.startRun('WHXKE2'); r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id }); }`);
  await p.goto('./?test&nosw&screen=run');
  await p.waitForFunction(() => !!(window as Any).__run);
  for (let i = 0; i < 16; i++) {
    const phase = await R(p, AUTOPLAY_ROUND);
    if (phase === 'won' || phase === 'lost') break;
    if (i === 6) await p.screenshot({ path: info.outputPath('m3-06-midrun.png') });
  }
  await expect(p.locator('.summary-verdict')).toBeVisible();
  await p.screenshot({ path: info.outputPath('m3-07-summary.png') });
  const records = await R(p, `(r) => r.state().records.length`);
  expect(records).toBeGreaterThan(0);
});
