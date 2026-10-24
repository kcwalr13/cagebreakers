import { type Page as PWPage, expect, test } from '@playwright/test';

interface FightHooks {
  roster: { uid: string; species: string; n: number }[];
  place(uid: string, cell: number): boolean;
  layout(): Record<string, number>;
  sealed(): number[];
  clear(): void;
}

// The layout from the encounter lab: four front seals, Wardens in front, the archers behind.
const THOUGHTFUL: [string, number][] = [
  ['p-shellguard', 2], ['p-warren-guard', 4], ['p-stag-reaper', 5], ['p-tusk-ram', 8],
  ['p-moss-tender', 9], ['p-boar-smasher', 11], ['p-owl-archivist', 16], ['p-hare-fletcher', 22],
];

async function open(p: PWPage) {
  await p.goto('./?screen=fight&test&nosw');
  await p.evaluate(() => localStorage.clear());
  await p.goto('./?screen=fight&test&nosw');
  await expect(p.locator('svg.board').first()).toBeVisible();
  await p.waitForFunction(() => !!(window as unknown as { __fight?: unknown }).__fight);
}
const fight = <T>(p: PWPage, fn: (f: FightHooks, arg: unknown) => T, arg?: unknown) =>
  p.evaluate(({ src, a }) => new Function('f', 'a', `return (${src})(f, a)`)((window as unknown as { __fight: FightHooks }).__fight, a), { src: fn.toString(), a: arg }) as Promise<T>;

async function cellPoint(p: PWPage, cell: number) {
  const box = (await p.locator('.board-wrap svg.board').boundingBox())!;
  const scale = box.width / 362;
  return { x: box.x + (4 + (cell % 6) * 59 + 29.5) * scale, y: box.y + (4 + Math.floor(cell / 6) * 59 + 29.5) * scale };
}

test('the title screen leads to the fight and the page toy', async ({ page: p }) => {
  await p.goto('./?test&nosw');
  await p.evaluate(() => localStorage.clear());
  await p.goto('./?test&nosw');
  await expect(p.getByRole('button', { name: /First Blood/ })).toBeVisible();
  await p.getByRole('button', { name: /Page toy/ }).click();
  await expect(p.getByText(/^Page /)).toBeVisible();
});

test('planning: bench, placement by tap and drag, cards, scouting, controls of 44 points', async ({ page: p }, info) => {
  await open(p);
  await expect(p.locator('.bench-slot:not(.empty)')).toHaveCount(8);
  await p.screenshot({ path: info.outputPath('m2-01-plan-empty.png') });

  // Tap a bench unit, then a cell.
  await p.getByRole('button', { name: /Shellguard, number 1/ }).click();
  const c2 = await cellPoint(p, 2);
  await p.mouse.click(c2.x, c2.y);
  expect((await fight(p, (f) => f.layout()))['p-shellguard']).toBe(2);

  // Drag a bench unit onto a cell (the unit floats 56px above the finger).
  const slot = (await p.getByRole('button', { name: /Warren Guard, number 3/ }).boundingBox())!;
  const c4 = await cellPoint(p, 4);
  await p.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2);
  await p.mouse.down();
  await p.mouse.move(c4.x, c4.y + 56, { steps: 14 });
  await p.mouse.up();
  expect((await fight(p, (f) => f.layout()))['p-warren-guard']).toBe(4);

  // A long press opens the unit card.
  const fl = (await p.getByRole('button', { name: /Hare Fletcher/ }).boundingBox())!;
  await p.mouse.move(fl.x + fl.width / 2, fl.y + fl.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(600);
  await p.mouse.up();
  await expect(p.getByRole('dialog')).toContainText('Hare Fletcher');
  await p.screenshot({ path: info.outputPath('m2-02-card.png') });
  await p.getByRole('button', { name: 'Close' }).click();

  // Scouting the enemy.
  await p.getByRole('button', { name: /Scout The Iron Warren/ }).click();
  await expect(p.getByRole('dialog')).toContainText('Coil Unmaker');
  await p.screenshot({ path: info.outputPath('m2-03-scout.png') });
  await p.getByRole('button', { name: 'Close' }).click();

  const small = await p.evaluate(() => [...document.querySelectorAll('button')]
    .map((el) => ({ label: el.getAttribute('aria-label') ?? el.textContent, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
    .map(({ label, r }) => `${label} ${Math.round(r.width)}×${Math.round(r.height)}`));
  expect(small).toEqual([]);
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: innerHeight }));
  expect(scroll).toBeLessThanOrEqual(client);
  await expect(p.getByRole('button', { name: /Clash/ })).toBeInViewport({ ratio: 1 });
});

test('a thoughtful layout seals four cages, fights, and the result explains why', async ({ page: p }, info) => {
  await open(p);
  for (const [uid, cell] of THOUGHTFUL) expect(await fight(p, (f, a) => f.place((a as [string, number])[0], (a as [string, number])[1]), [uid, cell])).toBe(true);
  expect((await fight(p, (f) => f.sealed())).length).toBe(4);
  await p.waitForTimeout(1300);
  await p.screenshot({ path: info.outputPath('m2-04-plan-sealed.png') });

  await p.getByRole('button', { name: /Clash/ }).click();
  await expect(p.locator('.clash-svg')).toBeVisible();
  await p.waitForTimeout(2600);
  await p.screenshot({ path: info.outputPath('m2-05-clash.png') });
  await p.getByRole('button', { name: 'Skip' }).click();
  await expect(p.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  await expect(p.getByRole('dialog')).toContainText(/Victory|Defeat|Draw/);
  await expect(p.getByRole('dialog')).toContainText('You sealed 4 cages');
  await expect(p.getByRole('dialog')).toContainText('Most damage');
  await p.screenshot({ path: info.outputPath('m2-06-result.png') });
  await p.getByRole('dialog').getByRole('button', { name: 'Rearrange' }).click();
  await expect(p.locator('.bench')).toBeVisible();
});

test('the clash plays at phone size without scrolling', async ({ page: p }, info) => {
  await open(p);
  for (const [uid, cell] of THOUGHTFUL.slice(0, 5)) await fight(p, (f, a) => f.place((a as [string, number])[0], (a as [string, number])[1]), [uid, cell]);
  await p.getByRole('button', { name: /Clash/ }).click();
  await p.waitForTimeout(5200);
  await p.screenshot({ path: info.outputPath('m2-07-clash-later.png') });
  const { scroll, client } = await p.evaluate(() => ({ scroll: document.documentElement.scrollHeight, client: innerHeight }));
  expect(scroll).toBeLessThanOrEqual(client);
  await expect(p.getByRole('button', { name: 'Skip' })).toBeInViewport();
});

test('night vellum fight', async ({ page: p }, info) => {
  await p.emulateMedia({ colorScheme: 'dark' });
  await open(p);
  for (const [uid, cell] of THOUGHTFUL) await fight(p, (f, a) => f.place((a as [string, number])[0], (a as [string, number])[1]), [uid, cell]);
  await p.waitForTimeout(1300);
  await p.screenshot({ path: info.outputPath('m2-08-dark-plan.png') });
  await p.getByRole('button', { name: /Clash/ }).click();
  await p.waitForTimeout(3000);
  await p.screenshot({ path: info.outputPath('m2-09-dark-clash.png') });
});
