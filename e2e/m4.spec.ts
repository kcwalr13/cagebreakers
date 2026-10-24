import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const R = (p: PWPage, fn: string, ...args: unknown[]) =>
  p.evaluate(({ fn, args }) => new Function('r', 'args', `return (${fn})(r, ...args)`)((window as Any).__run, args), { fn, args });

const LIFT = 56;

async function cellPoint(p: PWPage, cell: number) {
  const box = (await p.locator('.board-wrap svg.board').boundingBox())!;
  const scale = box.width / 362;
  return { x: box.x + (4 + (cell % 6) * 59 + 29.5) * scale, y: box.y + (4 + Math.floor(cell / 6) * 59 + 29.5) * scale };
}

/** A run on its first clash holding every cage, with all three Misprints and four items in hand. */
async function misprintRun(p: PWPage) {
  await p.goto('./?test&nosw&screen=title');
  await p.evaluate(() => localStorage.clear());
  await p.goto('./?test&nosw&screen=title');
  await p.waitForFunction(() => !!(window as Any).__run);
  return await R(p, `(r) => {
    r.startRun('MFQURA');
    r.dispatch({ type: 'first-claim', cage: r.page().cages.find((c) => c.cells.length === 2).id });
    r.dispatch({ type: 'pick', choice: 0 });
    const s = r.state(), page = r.page();
    // A pair of side-by-side open cells for the Domino, numbered from the hidden solution so it fits.
    const c = [...Array(30).keys()].find((k) => k % 6 < 5 && !page.stones[k] && !page.stones[k + 1]);
    const blankAt = [...Array(36).keys()].find((k) => k !== c && k !== c + 1 && !page.stones[k] && Math.abs(k - c) > 7);
    r.load({ ...s, gold: 30, claimed: page.cages.map((x) => x.id), nextUid: 10,
      units: [
        { uid: 'u1', species: 'domino', n: page.solution[c], n2: page.solution[c + 1], stars: 1, cell: -1 },
        { uid: 'u2', species: 'blank', n: 0, stars: 1, cell: -1 },
        { uid: 'u3', species: 'smudge', n: 3, stars: 1, cell: -1 },
        { uid: 'u4', species: 'shellguard', n: page.solution[blankAt], stars: 2, cell: -1 },
      ],
      satchel: ['blade', 'eraser', 'lens', 'chisel'] });
    return { c, blankAt, stone: page.stones.findIndex((v) => v) };
  }`) as { c: number; blankAt: number; stone: number };
}

test('Misprints, a Domino that turns, and every kind of item, played by touch', async ({ page: p }, info) => {
  const { c, blankAt, stone } = await misprintRun(p);
  await p.goto('./?test&nosw&screen=run');
  await p.waitForFunction(() => !!(window as Any).__run);
  await expect(p.locator('.bench-slot:not(.empty)')).toHaveCount(4);
  await p.screenshot({ path: info.outputPath('m4-01-misprints-on-bench.png') });

  // Drag the Domino from the bench onto its cell; the piece floats above the finger.
  const from = (await p.locator('.bench-slot').first().boundingBox())!;
  const to = await cellPoint(p, c);
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  await p.mouse.move(to.x, to.y + LIFT - 20, { steps: 6 });
  await p.mouse.move(to.x, to.y + LIFT, { steps: 4 });
  await p.screenshot({ path: info.outputPath('m4-02-domino-drag.png') });
  await p.mouse.up();
  const dom = await R(p, `(r) => r.state().units.find((u) => u.uid === 'u1')`) as { cell: number; cell2?: number };
  expect(dom.cell).toBe(c);
  expect(dom.cell2).toBeDefined();
  expect(await p.locator('.token.domino').count()).toBeGreaterThan(0);

  // Tap it, and the status row offers to turn it.
  const dp = await cellPoint(p, c);
  await p.mouse.click(dp.x, dp.y);
  await expect(p.getByRole('button', { name: 'Turn' })).toBeVisible();
  await p.getByRole('button', { name: 'Turn' }).click();
  const turned = await R(p, `(r) => r.state().units.find((u) => u.uid === 'u1')`) as { cell: number; cell2?: number };
  expect(turned.cell).toBe(c);
  await p.keyboard.press('Escape');

  // Tap the Blank, then a cell: it stands anywhere, having no number.
  await p.locator('.bench-slot').first().click();
  const bp = await cellPoint(p, blankAt);
  await p.mouse.click(bp.x, bp.y);
  expect(await R(p, `(r) => r.state().units.find((u) => u.uid === 'u2').cell`)).toBe(blankAt);

  // The satchel: give the Domino the Blade.
  await p.getByRole('button', { name: /Satchel, 4 items/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Satchel');
  // Measure once the sheet has finished sliding in.
  await p.locator('.sheet').evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const small = await p.evaluate(() => [...document.querySelectorAll('.sheet button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44)).map(({ label }) => label));
  expect(small).toEqual([]);
  await p.screenshot({ path: info.outputPath('m4-03-satchel.png') });
  await p.locator('.pick-card').filter({ hasText: 'Blade' }).getByRole('button', { name: 'Use' }).click();
  await expect(p.locator('.status')).toContainText('carry the Blade');
  await p.mouse.click(dp.x, dp.y);
  expect(await R(p, `(r) => r.state().units.find((u) => u.uid === 'u1').relic`)).toBe('blade');

  // The Eraser opens a stone.
  await p.getByRole('button', { name: /Satchel/ }).click();
  await p.locator('.pick-card').filter({ hasText: 'Eraser' }).getByRole('button', { name: 'Use' }).click();
  await expect(p.locator('.tool-target').first()).toBeVisible();
  const sp = await cellPoint(p, stone);
  await p.mouse.click(sp.x, sp.y);
  expect(await R(p, `(r) => r.page().stones[${stone}]`)).toBe(0);

  // The Lens shows a hidden number in an empty cell.
  await p.getByRole('button', { name: /Satchel/ }).click();
  await p.locator('.pick-card').filter({ hasText: 'Lens' }).getByRole('button', { name: 'Use' }).click();
  const empty = await R(p, `(r) => { const s = r.state(), page = r.page(); return [...Array(36).keys()].find((k) => !page.stones[k] && !s.units.some((u) => u.cell === k || u.cell2 === k)); }`) as number;
  const ep = await cellPoint(p, empty);
  await p.mouse.click(ep.x, ep.y);
  expect(await R(p, `(r) => r.state().revealed`)).toEqual([empty]);
  await expect(p.locator('text.revealed')).toHaveCount(1);

  // The Chisel asks which way.
  await p.getByRole('button', { name: /Satchel/ }).click();
  await p.locator('.pick-card').filter({ hasText: 'Chisel' }).getByRole('button', { name: 'Use' }).click();
  await p.locator('.bench-slot').filter({ has: p.locator('.mis-smudge') }).click();
  await expect(p.getByRole('dialog')).toContainText('Chisel The Smudge');
  await p.getByRole('button', { name: 'Make the 3 a 4' }).click();
  expect(await R(p, `(r) => r.state().units.find((u) => u.uid === 'u3').n`)).toBe(4);
  expect(await R(p, `(r) => r.state().satchel.length`)).toBe(0);
  await p.screenshot({ path: info.outputPath('m4-04-items-used.png') });

  // Fight with them.
  await p.getByRole('button', { name: /^Clash$/ }).click();
  await expect(p.locator('.clash-svg')).toBeVisible();
  await p.waitForTimeout(1600);
  await p.screenshot({ path: info.outputPath('m4-05-clash.png') });
  await p.getByRole('button', { name: 'Skip' }).click();
  await expect(p.getByRole('dialog')).toContainText(/Victory|Defeat|Draw/, { timeout: 5000 });
});

test('a new chapter opens with a pick, and a Keeper win earns a second', async ({ page: p }, info) => {
  await misprintRun(p);
  // Jump to just before the first Keeper and win: the next chapter owes two picks.
  await R(p, `(r) => {
    const s = r.state();
    r.load({ ...s, clash: 6, phase: 'plan', picksOwed: 1, pickCount: 1, satchel: [] });
    r.load({ ...r.state(), phase: 'pick', pick: ['quill', 'hourglass', 'flip'] });
  }`);
  await p.goto('./?test&nosw&screen=run');
  await expect(p.getByRole('dialog')).toContainText('two picks');
  await p.screenshot({ path: info.outputPath('m4-06-two-picks.png') });
  await p.locator('.pick-card').nth(1).click();
  await expect(p.getByRole('dialog')).toContainText('Chapter 2');
  await expect(p.locator('.pick-card')).toHaveCount(3);
  await p.locator('.pick-card').first().click();
  await expect(p.getByRole('dialog')).toHaveCount(0);
  expect(await R(p, `(r) => r.state().satchel.length`)).toBe(2);
});

test('the unit card of a Misprint explains its rule', async ({ page: p }, info) => {
  await misprintRun(p);
  await p.goto('./?test&nosw&screen=run');
  // Hold the Domino on the bench to open its card.
  const from = (await p.locator('.bench-slot').first().boundingBox())!;
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(600);
  await p.mouse.up();
  await expect(p.getByRole('dialog')).toContainText('The Domino');
  await expect(p.getByRole('dialog')).toContainText('Misprint');
  await p.screenshot({ path: info.outputPath('m4-07-domino-card.png') });
});
