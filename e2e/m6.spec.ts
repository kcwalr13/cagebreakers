import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const R = (p: PWPage, fn: string, ...args: unknown[]) =>
  p.evaluate(({ fn, args }) => new Function('r', 'args', `return (${fn})(r, ...args)`)((window as Any).__run, args), { fn, args });
/** How many numbers are in the hand, counting every stack. */
const handCount = (p: PWPage) => p.evaluate(() => [...document.querySelectorAll('.hand-slot')].reduce((n, el) => n + Number((el as HTMLElement).dataset.count ?? 1), 0));

async function fresh(p: PWPage, extra = '') {
  await p.goto(`./?test&nosw${extra}&screen=title`);
  await p.evaluate(() => localStorage.clear());
  await p.goto(`./?test&nosw${extra}&screen=title`);
  await p.waitForFunction(() => !!(window as Any).__run);
}

/** Starts a run on a known seed and opens it. */
async function runOn(p: PWPage, seed: string) {
  await fresh(p);
  await R(p, `(r, seed) => r.startRun(seed)`, seed);
  await p.goto('./?test&nosw&screen=run');
  await p.waitForFunction(() => !!(window as Any).__run);
}

async function cellPoint(p: PWPage, cell: number) {
  const box = (await p.locator('.board-wrap svg.board').boundingBox())!;
  const scale = box.width / 362;
  return { x: box.x + (4 + (cell % 6) * 59 + 29.5) * scale, y: box.y + (4 + Math.floor(cell / 6) * 59 + 29.5) * scale };
}

/** Drags with the mouse so the floating number (which rides 56 px above the finger) lands on `cell`. */
async function dragTo(p: PWPage, from: { x: number; y: number }, cell: number | { x: number; y: number }) {
  const to = typeof cell === 'number' ? await cellPoint(p, cell) : cell;
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y + 56 - from.y) * i) / 8);
  await p.mouse.up();
}

const center = async (p: PWPage, sel: string, nth = 0) => {
  const b = (await p.locator(sel).nth(nth).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** A legal cell for a token on the solution, so placements can always be completed. */
const SOLUTION_CELL = `(r, id) => { const s = r.state(); const p = r.page(); const t = s.tokens.find((x) => x.id === id);
  return [...Array(36).keys()].find((c) => !p.stones[c] && p.solution[c] === t.n && !s.tokens.some((o) => o.cell === c) && r.legalCells(id).includes(c)); }`;

test('a week: drag numbers in, read the requests, water it', async ({ page: p }, info) => {
  await runOn(p, 'RQUND6');
  await expect(p.locator('.hud-round')).toContainText('Week 1 of 6');
  await expect(p.locator('.commission')).toHaveCount(3);
  await expect(p.locator('.commission.required')).toHaveCount(1);
  await expect.poll(() => handCount(p)).toBe(4);
  await p.screenshot({ path: info.outputPath('m6-01-round-1.png') });

  // Drag the first dealt number onto a cell where it fits.
  const first = await R(p, '(r) => r.state().tokens.find((t) => t.cell < 0).id') as number;
  const target = await R(p, SOLUTION_CELL, first) as number;
  await dragTo(p, await center(p, '.hand-slot'), target);
  expect(await R(p, '(r, id) => r.state().tokens.find((t) => t.id === id).cell', first)).toBe(target);
  await expect(p.locator('.hand-slot')).toHaveCount(3);

  // Tap a number, then a cell in a line that already holds it: refused, and explained.
  const pick = await R(p, `(r) => { const s = r.state(); const p = r.page(); const hand = s.tokens.filter((t) => t.cell < 0);
    for (let i = 0; i < hand.length; i++) { const legal = r.legalCells(hand[i].id);
      const bad = [...Array(36).keys()].find((c) => !p.stones[c] && !s.tokens.some((o) => o.cell === c) && !legal.includes(c));
      if (bad !== undefined) return { i, id: hand[i].id, bad }; } return null; }`) as { i: number; id: number; bad: number };
  expect(pick).not.toBeNull();
  await p.locator('.hand-slot').nth(pick.i).click();
  await expect(p.locator('.status')).toContainText(/Bright squares take the \d/);
  // Holding a number lights the cells that can take it, shades the ones that can't, and rings what blocks them.
  expect(await p.locator('svg.board .hint-open, svg.board .hint-seals').count()).toBeGreaterThan(0);
  expect(await p.locator('svg.board .hint-blocked').count()).toBeGreaterThan(0);
  const sameOnPage = await R(p, `(r, id) => { const s = r.state(); const pg = r.page(); const n = s.tokens.find((t) => t.id === id).n;
    return pg.stones.filter((v) => v === n).length + s.tokens.filter((t) => t.cell >= 0 && t.n === n).length; }`, pick.id) as number;
  await expect(p.locator('svg.board .blocker')).toHaveCount(sameOnPage);
  await p.screenshot({ path: info.outputPath('m6-02-holding.png') });
  const bp = await cellPoint(p, pick.bad);
  await p.mouse.click(bp.x, bp.y);
  await expect(p.locator('.status.warn')).toContainText(/already a \d in (row|column) \d/);
  const good = await R(p, SOLUTION_CELL, pick.id) as number;
  const gp = await cellPoint(p, good);
  await p.mouse.click(gp.x, gp.y);
  expect(await R(p, '(r, id) => r.state().tokens.find((t) => t.id === id).cell', pick.id)).toBe(good);

  // Tapping a commission lights up what it means on the page.
  await p.locator('.commission').nth(0).click();
  await expect(p.locator('.commission').nth(0)).toHaveAttribute('aria-pressed', 'true');
  const marked = await p.locator('svg.board .marked').count();
  const kind = await R(p, '(r) => r.state().posted[0].c.kind') as string;
  if (!['seal-count', 'fill-page', 'seal-all'].includes(kind)) expect(marked).toBeGreaterThan(0);
  await p.screenshot({ path: info.outputPath('m6-03-commission-lit.png') });
  await p.locator('.commission').nth(0).click();

  // Every control is big enough, nothing scrolls, nothing is clipped.
  const small = await p.evaluate(() => [...document.querySelectorAll('button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`));
  expect(small).toEqual([]);
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: innerHeight }));
  expect(scroll).toBeLessThanOrEqual(client);
  await expect(p.getByRole('button', { name: /Water it/ })).toBeInViewport({ ratio: 1 });
  await expect(p.locator('.commission').last()).toBeInViewport({ ratio: 1 });
  const cell = await p.evaluate(() => { const b = document.querySelector('.board-wrap svg.board')!.getBoundingClientRect(); return (b.width / 362) * 59; });
  expect(cell).toBeGreaterThanOrEqual(44);

  // Inking waits until enough numbers are placed, then shows what the round earned.
  await p.getByRole('button', { name: /Water it/ }).click();
  await expect(p.locator('.status.warn')).toContainText('Plant 1 more number');
  await expect(p.locator('.status')).toContainText(/Plant 1 more number, or all 2 for \d bonus coins?\./);
  await R(p, '(r) => r.solveHand()');
  await expect(p.locator('.status')).toContainText(/Every number is planted: \d bonus coins? when you water\./);
  await p.getByRole('button', { name: /Water it/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Week 1 watered');
  await expect(p.getByRole('dialog')).toContainText('Every number planted');
  await expect(p.getByRole('dialog')).toContainText(/plots? in bloom|No blooms/);
  await p.screenshot({ path: info.outputPath('m6-04-inked.png') });
  await p.getByRole('button', { name: 'On to week 2' }).click();
  await expect(p.locator('.hud-round')).toContainText('Week 2 of 6');
  // Last round's numbers stay on the page; this round's are in hand. They all look the same.
  await expect(p.locator('svg.board .token')).toHaveCount(4);
  await expect.poll(() => handCount(p)).toBe(4);
});

test('anything in the garden can move, Pick up all clears it, and any one number may stay out', async ({ page: p }, info) => {
  await runOn(p, 'MQVERS');
  await R(p, `(r) => { r.solveHand(); r.dispatch({ type: 'ink' }); }`);
  await p.keyboard.press('Escape');
  const old = await R(p, '(r) => r.state().tokens.find((t) => t.round === 1 && t.cell >= 0)') as { id: number; cell: number };
  // Drag it off the page into the hand.
  const from = await cellPoint(p, old.cell);
  const hand = await center(p, '.hand');
  await dragTo(p, from, { x: hand.x, y: hand.y - 56 + 10 });
  expect(await R(p, '(r, id) => r.state().tokens.find((t) => t.id === id).cell', old.id)).toBe(-1);
  await expect(p.locator('.status')).toContainText(/Plant 4 more numbers, or all 5 for \d bonus coins?\./);
  // Everything off the page at once, and back again.
  await p.getByRole('button', { name: 'Pick up all' }).click();
  await expect(p.locator('svg.board .token')).toHaveCount(0);
  await expect.poll(() => handCount(p)).toBe(8);
  await p.screenshot({ path: info.outputPath('m6-05-all-to-hand.png') });
  await p.getByRole('button', { name: 'Put back' }).click();
  await expect(p.locator('svg.board .token')).toHaveCount(3);
  await expect(p.getByRole('button', { name: 'Pick up all' })).toBeEnabled();
  // Any one number may stay in hand, whenever it was dealt.
  await R(p, '(r) => r.solveHand()');
  await R(p, '(r, id) => r.dispatch({ type: "place", id, cell: -1 })', old.id);
  await expect(p.locator('.status')).toContainText(/Ready to water\. Keep the \d for later, or plant it for \d bonus coins?\./);
  await p.getByRole('button', { name: /Water it/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Week 2 watered');
  await expect(p.getByRole('dialog')).toContainText('Kept back');
});

test('coins buy a Hint', async ({ page: p }, info) => {
  await runOn(p, 'TQQKSA');
  await R(p, '(r) => r.load({ ...r.state(), gold: 20 })');
  await expect(p.locator('.run-controls .tool')).toHaveCount(1);
  await p.getByRole('button', { name: /^Hint/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Shows the right number for one empty square');
  await p.screenshot({ path: info.outputPath('m6-06-hint-sheet.png') });
  await p.getByRole('button', { name: 'Choose a square' }).click();
  await expect(p.locator('svg.board .tool-target').first()).toBeVisible();
  const empty = await R(p, '(r) => [...Array(36).keys()].find((c) => !r.page().stones[c] && !r.state().tokens.some((t) => t.cell === c))') as number;
  const ep = await cellPoint(p, empty);
  await p.mouse.click(ep.x, ep.y);
  await expect(p.locator('.status')).toContainText(/Hint: a \d belongs there/);
  await expect(p.locator('svg.board .revealed')).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('m6-07-lens.png') });
  expect(await R(p, '(r) => r.state().gold')).toBe(17);
});

test('a double tap picks a planted number back up', async ({ page: p }) => {
  await runOn(p, 'DQBTAP');
  await R(p, '(r) => r.solveHand()');
  const t = await R(p, '(r) => r.state().tokens.find((t) => t.cell >= 0)') as { id: number; cell: number };
  const at = await cellPoint(p, t.cell);
  await p.mouse.click(at.x, at.y);
  await p.mouse.click(at.x, at.y);
  await expect.poll(() => R(p, '(r, id) => r.state().tokens.find((t) => t.id === id).cell', t.id)).toBe(-1);
  // Two slow taps only pick it up and put it down.
  const u = await R(p, '(r) => r.state().tokens.find((t) => t.cell >= 0)') as { id: number; cell: number };
  const uat = await cellPoint(p, u.cell);
  await p.mouse.click(uat.x, uat.y);
  await p.waitForTimeout(500);
  await p.mouse.click(uat.x, uat.y);
  expect(await R(p, '(r, id) => r.state().tokens.find((t) => t.id === id).cell', u.id)).toBe(u.cell);
});

test('a garden resumes after the game is closed', async ({ page: p }) => {
  await runOn(p, 'RESUME');
  for (let i = 0; i < 2; i++) await R(p, `(r) => { r.load({ ...r.state(), ink: 3 }); r.solveHand(); r.dispatch({ type: 'ink' }); }`);
  await p.goto('./?test&nosw&screen=title');
  await expect(p.getByRole('button', { name: /Keep growing/ })).toContainText(/week 3 of 6/i);
  await p.getByRole('button', { name: /Keep growing/ }).click();
  await expect(p.locator('.hud-round')).toContainText('Week 3 of 6');
});

test('a new week is announced over the garden, lingers, and goes at the first tap', async ({ page: p }, info) => {
  await runOn(p, 'WKTRN4');
  await R(p, `(r) => { r.solveHand(); r.dispatch({ type: 'ink' }); }`);
  await p.getByRole('button', { name: 'On to week 2' }).click();
  const card = p.locator('.week-card');
  await expect(card).toContainText('Week 2');
  await expect(card).toContainText(/\d new numbers?, 3 new requests/);
  await p.waitForTimeout(1600);
  await p.screenshot({ path: info.outputPath('m6-12-new-week.png') });
  // It never blocks the garden, lingers while nothing happens, then leaves by itself.
  expect(await card.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await p.waitForTimeout(1500);
  await expect(card).toHaveCount(1);
  await expect(card).toHaveCount(0, { timeout: 4000 });
  await expect(p.locator('.hud-round')).toContainText('Week 2 of 6');
  // Closing the summary any other way announces the week too, and the first tap sends the card
  // away while still doing what it does: here, picking up a number.
  await R(p, `(r) => { r.solveHand(); r.dispatch({ type: 'ink' }); }`);
  await p.keyboard.press('Escape');
  await expect(card).toContainText('Week 3');
  await p.waitForTimeout(1600);
  await p.locator('.hand-slot').first().click();
  await expect(card).toHaveCount(0, { timeout: 1000 });
  await expect(p.locator('.hand-slot.selected')).toHaveCount(1);
});

test('a whole garden fills, then is harvested and scored', async ({ page: p }, info) => {
  test.setTimeout(90_000);
  await runOn(p, 'WHQKE6');
  for (let r = 1; r < 6; r++) {
    await R(p, `(r) => { r.load({ ...r.state(), ink: 3 }); r.solveHand(); r.dispatch({ type: 'ink' }); }`);
    await p.keyboard.press('Escape');
    if (r === 3) await p.screenshot({ path: info.outputPath('m6-08-midrun.png') });
  }
  await expect(p.locator('.hud-round')).toContainText('Harvest week');
  await expect(p.locator('.week-card')).toContainText('Harvest week');
  await expect(p.locator('.commission').first()).toContainText('Fill every square');
  await p.screenshot({ path: info.outputPath('m6-09-final-round.png') });
  await R(p, '(r) => r.solveHand()');
  await p.getByRole('button', { name: /Harvest/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Harvest!');
  await p.getByRole('button', { name: 'See the garden' }).click();
  await expect(p.locator('.summary-verdict')).toContainText('points');
  await expect(p.locator('.records tbody tr')).toHaveCount(6);
  await p.screenshot({ path: info.outputPath('m6-10-summary.png') });
  await expect(p.locator('.leaf-panel')).toContainText('seeds');
  await p.getByRole('button', { name: 'Again' }).click();
  await expect(p.locator('.hud-round')).toContainText('Week 1 of 6');
});

test('losing the last drop of water dries the garden out', async ({ page: p }, info) => {
  await runOn(p, 'RUXNED');
  for (let i = 0; i < 8; i++) {
    const missed = await R(p, `(r) => { r.load({ ...r.state(), ink: 1 }); const st = r.state(); const p = r.page();
      for (const t of st.tokens.filter((t) => t.cell < 0).slice(0, st.need)) { const c = r.legalCells(t.id).find((c) => !r.state().tokens.some((o) => o.cell === c)); if (c !== undefined) r.dispatch({ type: 'place', id: t.id, cell: c }); }
      r.dispatch({ type: 'ink' }); return r.state().phase === 'ruined'; }`);
    if (missed) break;
    await p.keyboard.press('Escape');
  }
  await expect(p.getByRole('dialog')).toContainText('The garden dried out');
  await expect(p.getByRole('dialog')).toContainText('a drop of water dried up');
  await p.screenshot({ path: info.outputPath('m6-11-ruined.png') });
  await p.getByRole('button', { name: 'See the garden' }).click();
  await expect(p.locator('.summary-verdict')).toContainText('Dried out in week');
});
