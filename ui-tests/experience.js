import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { toTitle } from './lib/title.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = new URL(process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/');
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
});
const errors = [];
async function makePage(viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion, serviceWorkers: 'block' });
  // アカウント機能を切る（サーバーにつながっていないときのホームとタイトルを確かめる。アカウントは account.js で確かめる）
  await context.route('**/api/me', route => route.fulfill({ json: { ok: false } }));
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || message.text().startsWith('[sync]')) errors.push(message.text());
  });
  return page;
}
function picture(page, name) {
  const { width, height } = page.viewportSize();
  return page.screenshot({
    path: new URL(`experience-${name}-${width}x${height}.png`, output).pathname,
    animations: name === 'arrival' ? 'allow' : 'disabled',
  });
}
async function expectFocus(page, selector) {
  assert.equal(await page.locator(selector).evaluate(el => el === document.activeElement), true, `${selector} にフォーカスがある`);
}

async function walkThrough() {
  const page = await makePage({ width: 390, height: 844 });
  await page.goto(base.href);
  // 入口はホーム。サーバーが要るメニューは押すと理由が出る
  await page.locator('#home.home-local:not([hidden])').waitFor();
  await picture(page, 'home');
  await page.click('#home .home-tab[data-tab=shop]'); await page.locator('#home .home-tile[data-id="shop"]').click();
  await page.getByText('オンライン対戦のサーバー（node server/server.js）で開くと使えます').first().waitFor();
  await toTitle(page);
  await picture(page, 'title');

  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home .home-mode[data-mode="local"]').click();
  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home [data-act="start"]').press('Enter');
  await expectFocus(page, '#local-start');
  await page.locator('.local-options summary').click();
  await page.locator('[aria-labelledby="local-cap-playerCount"] [data-value="4"]').click();
  await page.locator('#levels-back').click();
  await expectFocus(page, '#home [data-act="start"]');

  await page.click('#home .home-tab[data-tab=settings]'); await page.locator('#home .home-tile[data-id="settings"]').click();
  await page.locator('[data-for="text"] [data-value="large"]').click();
  const preview = page.locator('.settings-reading-preview');
  assert.equal(await preview.evaluate(el => getComputedStyle(el).fontSize), '18px');
  await picture(page, 'settings');
  await page.locator('[data-for="speed"] [data-value="skip"]').click();
  await page.keyboard.press('Escape');
  await expectFocus(page, '#home .home-tile[data-id="settings"]');
  await page.reload();
  await toTitle(page);
  assert.equal(await page.locator('html').getAttribute('data-text-size'), 'large');
  await page.click('#home .home-tab[data-tab=settings]'); await page.locator('#home .home-tile[data-id="settings"]').click();
  await page.locator('[data-for="text"] [data-value="normal"]').click();
  await page.locator('.settings-close').click();

  await page.click('#home .home-tab[data-tab=deck]'); await page.locator('#home .home-tile[data-id="catalog"]').click();
  const search = page.getByRole('searchbox', { name: 'カード名で探す' });
  await search.fill('どらごん');
  await page.getByLabel('種類', { exact: true }).selectOption('beast');
  assert.equal(await page.locator('.guide-card').count(), 1);
  await picture(page, 'catalogue');
  await page.locator('.guide-card').click();
  assert.match(await page.locator('.guide-card-detail h3').textContent(), /ドラゴン（魔物）/);
  await page.getByRole('button', { name: 'カード一覧へ' }).click();
  await expectFocus(page, '.guide-card');
  await search.fill('該当しない検索');
  await page.locator('.guide-reset').click();
  assert.equal(await search.inputValue(), '');
  await expectFocus(page, '.guide-query input');
  await page.locator('#guide-tab-monsters').click();
  await page.locator('.guide-beast-link').first().click();
  await page.getByRole('button', { name: '魔物一覧へ' }).click();
  await expectFocus(page, '.guide-monster:first-of-type .guide-beast-link');
  await page.locator('#guide-tab-monsters').press('ArrowRight');
  await expectFocus(page, '#guide-tab-rates');
  const meter = page.locator('.rate-summary meter').first();
  const value = await meter.evaluate(el => el.value);
  assert.ok(value > 0 && value <= 100);
  await meter.locator('..').click();
  await picture(page, 'rates');
  await page.keyboard.press('Escape');

  await page.click('#home .home-tab[data-tab=settings]'); await page.locator('#home .home-tile[data-id="help"]').click();
  await page.locator('.help-more summary').filter({ hasText: '魔物の駒' }).click();
  assert.match(await page.locator('.help-more[open]').innerText(), /手札に入ります/);
  await picture(page, 'help');
  await page.locator('#help-tutorial').click();
  await page.locator('#tutorial').waitFor();
  await page.waitForFunction(() => document.querySelector('#hud').dataset.turn === 'mine' && !document.querySelector('#app').classList.contains('busy'));
  assert.match(await page.locator('#tutorial strong').innerText(), /兵士を選ぶ/);
  await page.locator('#hand .card.soldier:not(.dim)').first().waitFor();
  await picture(page, 'tutorial');
  await page.locator('#hand .card.soldier:not(.dim)').first().press('Enter');
  assert.equal(await page.locator('#tutorial strong').innerText(), '出兵する');
  await page.locator('.detail-use').press('Enter');
  await page.locator('.targetable').first().press('Enter');
  await page.waitForFunction(() => document.querySelector('#end-turn').classList.contains('tutorial-end'));
  assert.equal(await page.locator('#tutorial strong').innerText(), '出兵できた！');
  await page.waitForFunction(() => !document.querySelector('#app').classList.contains('busy'));
  await page.locator('#upgrade-open').click();
  assert.equal(await page.locator('#upgrade-open').getAttribute('aria-expanded'), 'true');
  assert.match(await page.locator('.upgrade-reason').first().innerText(), /コインが足りません|城のHPが満タン/);
  await page.locator('.shop-tabs [data-category="ticket"]').click();
  await picture(page, 'shop');
  await page.keyboard.press('Escape');
  await expectFocus(page, '#upgrade-open');
  await page.context().close();
}

async function roomAndCompact() {
  const page = await makePage({ width: 360, height: 640 }, 'reduce');
  await page.goto(base.href);
  await toTitle(page);
  await picture(page, 'title');
  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home .home-mode[data-mode="online"]').click();
  await page.click('#home .home-tab[data-tab=battle]'); await page.locator('#home [data-act="start"]').click();
  await expectFocus(page, '#title-name');
  await page.locator('#title-name').fill('案内を確認');
  await page.locator('#title-pass').fill(`ui-room-${Date.now()}`);
  await page.locator('#title-join').click();
  const launch = page.locator('.room-start');
  await launch.waitFor();
  assert.equal(await launch.isDisabled(), true);
  assert.match(await page.locator('#room-start-reason').innerText(), /2人必要/);
  await picture(page, 'room');
  await page.getByRole('button', { name: 'CPUを追加' }).click();
  await page.waitForFunction(() => {
    const start = document.querySelector('.room-start');
    return start && !start.disabled;
  });
  assert.ok(await launch.evaluate(el => el.closest('.room-launch').nextElementSibling.classList.contains('room-seats')));
  await launch.click();
  await page.locator('#room-screen').waitFor({ state: 'hidden' });
  await page.locator('#hand .card').first().waitFor();
  await page.context().close();
}

async function buyFromShop() {
  const page = await makePage({ width: 360, height: 640 }, 'reduce');
  const url = new URL(base);
  url.search = new URLSearchParams({
    local: '1', cpu: 'hard', debug: '1', seed: '8',
    rules: JSON.stringify({ initialCoins: 5, defenseReaction: false }),
  });
  await page.goto(url.href);
  await page.waitForFunction(() => document.querySelector('#hud').dataset.turn === 'mine' && !document.querySelector('#app').classList.contains('busy'));
  const readCoins = () => page.evaluate(() => {
    const id = document.querySelector('#app').dataset.viewer;
    return castlefield.game().getState(id).players[id].coins;
  });
  const before = await readCoins();
  await page.locator('#upgrade-open').click();
  await page.locator('[data-category="draw"][role="tab"]').click();
  await page.locator('.upgrade-item[data-id="recruit"]').click();
  await page.locator('#upgrade-panel').waitFor({ state: 'hidden' });
  assert.equal(await readCoins(), before - 2);
  assert.equal(await page.locator('#upgrade-open').getAttribute('aria-expanded'), 'false');
  await page.context().close();
}

try {
  await walkThrough();
  await roomAndCompact();
  await buyFromShop();
  assert.deepEqual(errors, []);
  console.log('タイトル・設定・図鑑と排出率・遊び方・出兵案内・ショップ・部屋の導線を確認');
} finally {
  await browser.close();
}
