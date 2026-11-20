// ランク報酬を見る画面：8ランクの見本が出る → カードの表を長押しして3Dで拡大 → 裏の見本を長押しすると裏から見える → 閉じる
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
});
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const errors = [];
const RANKS = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'master', 'champion'];

const context = await browser.newContext({ viewport: { width: 390, height: 797 }, serviceWorkers: 'block' });
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
// 拡大表示の CSS の 3D（浮かせる層）を確かめるので、three.js の 3D は使わない（そちらは ui-tests/card-gl.js）
await page.goto(`${root}?local=1&cpu=easy&seed=3&card3d=css`);
await page.locator('#home:not([hidden]), #app').first().waitFor();
await page.waitForFunction(() => document.getElementById('rank-rewards'));
await page.evaluate(() => { document.getElementById('rank-rewards').hidden = false; });

const rows = await page.locator('#rank-rewards .rank-reward-row').count();
assert.equal(rows, RANKS.length, '8ランクぶん出る');
for (const rank of RANKS) {
  const row = page.locator(`#rank-rewards .rank-reward-row[data-rank="${rank}"]`);
  assert.equal(await row.locator('.mini-card[data-skin]').getAttribute('data-skin'), rank, `${rank}: カードの表の見本`);
  assert.ok(await row.locator('.mini-card-frame').getAttribute('src').then((s) => s.endsWith(`frame-skin-${rank}.png`)), `${rank}: 表の枠の絵`);
  assert.equal(await row.locator('.rank-reward-card.back img').count(), 1, `${rank}: 裏の見本`);
  assert.equal(await row.locator('[data-frame]').getAttribute('data-frame'), `frame_${rank}`, `${rank}: アイコンフレーム`);
}
// 絵がぜんぶ読めている
const broken = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('#rank-rewards img')];
  await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  return imgs.filter((i) => !i.naturalWidth).map((i) => i.src);
});
assert.deepEqual(broken, [], '読めない画像がある');

const dialog = page.locator('dialog.card-zoom');
// 長押し。表示の直後は反応しないことがあるので、開かなければもう1回押す
async function hold(locator) {
  await locator.scrollIntoViewIfNeeded();
  for (let i = 0; i < 3; i++) {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    if (await dialog.isVisible()) return;
    await page.waitForTimeout(400);
  }
}
await hold(page.locator('#rank-rewards .rank-reward-row[data-rank="champion"] .rank-reward-card:not(.back)'));
await dialog.waitFor({ state: 'visible' });
assert.equal(await dialog.locator('.zoom-card').getAttribute('data-skin'), 'champion', '表のスキンで拡大される');
assert.ok(await dialog.locator('.zoom-raised').count() >= 1, '飾りを浮かせる層がある（3D）');
assert.match(await dialog.locator('.zoom-name').textContent(), /チャンピオン/);
await page.screenshot({ path: new URL('rank-rewards-front.png', output).pathname });
await page.keyboard.press('Escape');
await dialog.waitFor({ state: 'hidden' });

await hold(page.locator('#rank-rewards .rank-reward-row[data-rank="gold"] .rank-reward-card.back'));
await dialog.waitFor({ state: 'visible' });
await page.waitForTimeout(600);
const back = await dialog.locator('.zoom-card').evaluate((card) => ({
  flipped: card.classList.contains('zoom-flipped'),
  painted: card.hasAttribute('data-painted-back') && card.hasAttribute('data-back-raised'),
  art: getComputedStyle(card).getPropertyValue('--back-art'),
}));
assert.ok(back.flipped, '裏から見える');
assert.ok(back.painted && back.art.includes('back-rank-gold.png'), '裏はゴールドのスキンの絵');
await page.screenshot({ path: new URL('rank-rewards-back.png', output).pathname });
await page.keyboard.press('Escape');
await dialog.waitFor({ state: 'hidden' });

// ランクカードを装備すると（裏表一体）、手札の表の枠もそのランクになる
const game = await context.newPage();
game.on('pageerror', (error) => errors.push(error.message));
await game.goto(`${root}?local=1&cpu=easy&seed=3&debug=1`);
await game.waitForFunction(() => Boolean(window.castlefield?.game()) && document.querySelectorAll('#hand .card').length > 0);
await game.evaluate(async () => { (await import('./js/ui/cardFrame.js')).setCardSkin('champion'); });
await game.waitForFunction(() => [...document.querySelectorAll('#hand .card')].every((c) => c.dataset.skin === 'champion'));
const frames = await game.evaluate(() => [...document.querySelectorAll('#hand .card .card-frame')].map((f) => f.getAttribute('src')));
assert.ok(frames.length && frames.every((src) => src.endsWith('frame-skin-champion.png')), '手札の表がランクの枠になる');
await game.evaluate(async () => { (await import('./js/ui/cardFrame.js')).setCardSkin(null); });
await game.waitForFunction(() => [...document.querySelectorAll('#hand .card')].every((c) => !c.dataset.skin));

assert.deepEqual(errors, [], 'コンソールにエラーが出た');
await browser.close();
console.log('ランク報酬の画面：8ランクの見本・表と裏の3D拡大・装備すると手札の表もランクの枠になることを確認');
