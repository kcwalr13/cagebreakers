import { expect, test } from '@playwright/test';

// The core promise: open the game once with a connection, then it works in airplane mode.
test('loads and plays with the network off after one visit', async ({ page, context }) => {
  await page.goto('./?seed=7KQ2X4&screen=toy');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  // Wait until the service worker controls the page and has precached everything.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);

  const requests: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('data:')) requests.push(r.url()); });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('svg.board')).toBeVisible();
  await expect(page.getByText('Page 7KQ2X4')).toBeVisible();
  await page.getByRole('button', { name: 'Number 3', exact: true }).click();
  await expect(page.locator('.status')).toContainText('Placing 3s');
  // Fonts must come from the cache too: the numerals are the game.
  const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('800 20px Alegreya'); });
  expect(fontsOk).toBe(true);
  await context.setOffline(false);
});

test('a run can be started and played with the network off', async ({ page, context }) => {
  await page.goto('./?screen=title');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: /New run/ }).click();
  await expect(page.locator('.commission')).toHaveCount(3);
  await expect(page.locator('.hand-slot')).toHaveCount(4);
  await page.locator('.hand-slot').first().click();
  await expect(page.locator('.status')).toContainText(/Bright cells take the \d/);
  await context.setOffline(false);
});
