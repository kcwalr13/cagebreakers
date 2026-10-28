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

/** A profile with enough stars for the Botanic Garden and every path in it open. */
const BOTANIC = `(r) => r.setProfile({ ...r.profile(), leaf: 60,
  stars: { 'copy-desk': 3, cloister: 3, 'bare-vellum': 3, 'counting-house': 3, espalier: 3, 'lost-labels': 3, 'knot-garden': 3 },
  filled: ['copy-desk', 'cloister', 'bare-vellum', 'counting-house', 'espalier', 'lost-labels', 'knot-garden', 'shade-garden', 'strawberry-patch'],
  paths: ['cloister', 'bare-vellum', 'counting-house', 'espalier', 'lost-labels', 'knot-garden', 'shade-garden', 'strawberry-patch', 'parterre', 'bean-rows', 'topiary'] })`;

test('the Botanic Garden: shade, runners, bean poles, elbow room and tidy plots, drawn and kept', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, BOTANIC);
  await go(p, 'map');
  await expect(p.locator('.region').nth(2)).toContainText('The Botanic Garden');
  await expect(p.locator('.region').nth(2)).not.toHaveClass(/closed/);
  await p.locator('.region').nth(2).scrollIntoViewIfNeeded();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('botanic-01-map.png') });
  await p.getByRole('button', { name: /^The Shade Garden/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Shade');
  await p.screenshot({ path: info.outputPath('botanic-02-sheet.png') });
  await p.getByRole('button', { name: 'Begin' }).click();

  // Shade: hatched squares, and an odd number there is refused with the reason.
  const shade = await R(p, '(r) => r.page().shade.length') as number;
  await expect(p.locator('svg.board .shady')).toHaveCount(shade);
  const odd = await R(p, `(r) => { const s = r.state(), pg = r.page();
    const cell = pg.shade.find((c) => !pg.stones[c]);
    const t = s.tokens.find((x) => x.cell < 0 && x.n % 2 === 1);
    if (cell === undefined || !t) return 'none';
    return r.dispatch({ type: 'place', id: t.id, cell }) ? 'placed' : 'refused'; }`);
  if (odd !== 'none') {
    expect(odd).toBe('refused');
    await expect(p.locator('.status.warn')).toContainText('Shady squares take even numbers');
  }
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('botanic-03-shade.png') });

  await R(p, `(r) => r.startStation('strawberry-patch')`);
  await go(p, 'run');
  await expect(p.locator('svg.board .runner')).toHaveCount(await R(p, '(r) => r.page().runners.length') as number);
  await p.screenshot({ path: info.outputPath('botanic-04-runners.png') });

  await R(p, `(r) => r.startStation('bean-rows')`);
  await go(p, 'run');
  await expect(p.locator('svg.board .pole')).toHaveCount(await R(p, '(r) => r.page().poles.length') as number);
  await p.screenshot({ path: info.outputPath('botanic-05-poles.png') });

  await R(p, `(r) => r.startStation('topiary')`);
  await go(p, 'run');
  await expect(p.locator('svg.board .elbow-knots')).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('botanic-06-elbow.png') });

  await R(p, `(r) => r.startStation('parterre')`);
  await go(p, 'run');
  await expect(p.locator('svg.board.tidy')).toHaveCount(1);
  await p.screenshot({ path: info.outputPath('botanic-07-tidy.png') });
  expect(await R(p, FINISH)).toBe('done');
});

test('the garden diary: a finished garden keeps every week\'s requests in the Herbarium', async ({ page: p }, info) => {
  await fresh(p);
  await R(p, `(r) => r.startStation('copy-desk')`);
  await go(p, 'run');
  expect(await R(p, FINISH)).toBe('done');
  const weeks = await R(p, '(r) => r.state().records.length') as number;
  await go(p, 'library');
  await p.locator('button.book').first().click();
  await expect(p.locator('.diary')).toContainText('Garden diary');
  await expect(p.locator('.diary-week')).toHaveCount(weeks);
  await expect(p.locator('.diary-ask.required')).toHaveCount(weeks);
  await expect(p.locator('.diary-ask.required.met')).toHaveCount(weeks);
  await p.locator('.diary').scrollIntoViewIfNeeded();
  await p.screenshot({ path: info.outputPath('botanic-08-diary.png') });
});
