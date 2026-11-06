import { type Page as PWPage, expect, test } from '@playwright/test';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const Wt = (p: PWPage, fn: string) => p.evaluate((fn) => new Function('w', `return (${fn})(w)`)((window as Any).__watch), fn);

async function go(p: PWPage, screen: string) {
  await p.goto(`./?test&nosw&screen=${screen}`);
  await p.waitForFunction(() => !!(window as Any).__run && !!(window as Any).__watch);
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

test('Night Watch: the title offers a second game, and a season starts under mist', async ({ page: p }, info) => {
  await fresh(p);
  await p.getByRole('button', { name: /Night Watch/ }).first().click();
  await expect(p.getByRole('button', { name: /A new season/ })).toBeVisible();
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('watch-01-title.png') });
  await p.getByRole('button', { name: /A new season/ }).click();
  await expect(p.locator('.watch-board')).toBeVisible();
  await expect(p.locator('.hud-round')).toContainText('Night 1 of 6');
  // Seven column tallies and eight row tallies.
  await expect(p.locator('.wb-tally')).toHaveCount(15);
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('watch-02-night1.png') });

  // Tap a misty square: marked trail, then clear.
  const misty = p.locator('.wb-sq.misty').first();
  const cell = await Wt(p, `(w) => { const s = w.state(); return s.marks.findIndex((m, c) => !s.current.clues.dew.some((d) => d.cell === c) && c !== s.current.clues.entry && c !== s.current.clues.exit && !s.current.clues.glints.includes(c)); }`) as number;
  await Wt(p, `(w) => w.tap(${cell})`);
  expect(await Wt(p, `(w) => w.state().marks[${cell}]`)).toBe(1);
  await misty.isVisible();

  // Plant a frog: coins go down, and it shows.
  const coins = await Wt(p, '(w) => w.state().coins') as number;
  await p.getByRole('button', { name: /Frog, 2 coins/ }).click();
  await expect(p.locator('.status')).toContainText('Tap a square to plant one');
  const spot = await Wt(p, `(w) => { const s = w.state(); return s.current.trail.length && [...Array(56).keys()].find((c) => !s.current.trail.includes(c) && !s.current.clues.dew.some((d) => d.cell === c)); }`) as number;
  await Wt(p, `(w) => w.tap(${spot})`);
  await expect(p.locator('.wb-def')).toHaveCount(1);
  expect(await Wt(p, '(w) => w.state().coins')).toBe(coins - 2);
  // Tapping it picks it up and shows its reach; it can be taken back tonight.
  await Wt(p, `(w) => w.tap(${spot})`);
  await expect(p.locator('.wb-sq.reach').first()).toBeVisible();
  await expect(p.getByRole('button', { name: /Take back/ })).toBeVisible();
  await p.screenshot({ path: info.outputPath('watch-03-frog.png') });
  await p.getByRole('button', { name: /Take back/ }).click();
  await expect(p.locator('.wb-def')).toHaveCount(0);

  // Work out the trail and guard it: the readout says every pest is stopped.
  await Wt(p, '(w) => w.solve()');
  await expect(p.locator('.pest-row.stopped')).toHaveCount(await p.locator('.pest-row').count());
  await expect(p.locator('.tonight-note')).toHaveText('on the trail you marked');
  await p.screenshot({ path: info.outputPath('watch-04-planned.png') });

  await p.getByRole('button', { name: /Let them come/ }).click();
  await expect(p.locator('.wb-trail.real')).toBeVisible();
  await p.screenshot({ path: info.outputPath('watch-05-night.png') });
  await p.locator('.watch-wrap').click();
  await expect(p.locator('.morning')).toContainText('Every seedling safe');
  await p.screenshot({ path: info.outputPath('watch-06-morning.png') });
  await p.getByRole('button', { name: /On to night 2/ }).click();
  await expect(p.locator('.hud-round')).toContainText('Night 2 of 6');

  // The rest of the season, then its end.
  for (let night = 2; night <= 6; night++) {
    await Wt(p, '(w) => { w.solve(); w.dusk(); w.skip(); }');
  }
  await expect(p.locator('.summary-verdict')).toContainText('The season is over');
  await expect(p.locator('.watch-total')).toContainText('Score');
  await noSmallButtons(p);
  await p.screenshot({ path: info.outputPath('watch-07-end.png') });
  await p.getByRole('button', { name: 'Back to the title' }).click();
  await expect(p.getByRole('button', { name: /A new season/ })).toContainText('A new season');
});

test('Night Watch: a wrong trail lets pests through to the seedlings, and the help explains the clues', async ({ page: p }, info) => {
  await fresh(p);
  await Wt(p, '(w) => w.start("WRONGT")');
  await go(p, 'watch');
  // Plant a frog right on the real trail: it is trodden down, and the pests get through.
  const onTrail = await Wt(p, '(w) => { const s = w.state(); return s.current.trail.find((c) => c !== s.current.clues.entry && c !== s.current.clues.exit && !s.current.clues.glints.includes(c)); }') as number;
  await Wt(p, `(w) => w.act({ type: 'plant', kind: 'frog', cell: ${onTrail} })`);
  await p.getByRole('button', { name: /Let them come/ }).click();
  await p.locator('.watch-wrap').click();
  await expect(p.locator('.morning h2')).toContainText('eaten');
  await expect(p.locator('.morning')).toContainText('Trodden down on the trail: frog');
  await p.screenshot({ path: info.outputPath('watch-08-eaten.png') });
  await p.getByRole('button', { name: /On to night 2/ }).click();
  await p.getByRole('button', { name: 'How to play Night Watch' }).click();
  await expect(p.getByRole('dialog')).toContainText('Read the clues');
  await p.screenshot({ path: info.outputPath('watch-09-help.png') });
});
