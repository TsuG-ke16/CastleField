// 4陣営の入口がホームの対戦形式（モード）に一本化されていることを確かめる。
// (a) ホームで4陣営 → ひとりで遊ぶで4陣営の対戦 (b) ホームで4陣営 → カジュアル対戦（オンライン）で部屋に入り、陣営を選べる
// (c) 4陣営を覚えていても ?debug=1・?local=1&cpu=hard は通常モード (d) 4陣営を覚えていても、通常モードの部屋は通常モードでつなぎ直す
// 実行：CF_DB_PATH=<作業用フォルダ>/t.db PORT=8787 node server/server.js を起動しておき、node ui-tests/home-factions-entry.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const browser = await chromium.launch({ ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}) });
const errors = [];
let failed = 0;
const url = (search) => new URL(search, base).href;

/** 4陣営（竜）を覚えた端末 */
async function rememberedContext() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/api/me', (r) => r.fulfill({ json: { ok: false } }));
  await context.addInitScript(() => { localStorage.setItem('cf-home-ruleset', 'factions'); localStorage.setItem('cf-home-faction', 'dragon'); });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page };
}
async function step(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name} -- ${e.message}`); }
}
const pickMode = async (page, id) => { await page.locator('[data-act=chooseMode]').click(); await page.locator(`.home-mode[data-mode=${id}]`).click(); };
const viewerDeck = (page) => page.evaluate(() => { const g = castlefield.game(), id = document.querySelector('#app').dataset.viewer || 'p1'; return { deck: g.getState(id).players[id].deckId, deckMode: g.getState(null).deckMode }; });

try {
  await step('(a) 覚えた4陣営のホーム → ひとりで遊ぶで4陣営の対戦が始まる', async () => {
    const { context, page } = await rememberedContext();
    await page.goto(url('?field3d=2d'));
    await page.locator('#home[data-ruleset=factions]:not([hidden])').waitFor();
    await pickMode(page, 'solo');
    await page.locator('.home-start').click();
    await page.locator('#hand .card').first().waitFor();
    // ?debug がないので castlefield はない。手札のカードが4陣営（竜）のもの（陣営のフレーム data-faction）かを見る
    const factions = await page.locator('#hand .card').evaluateAll((cs) => cs.map((c) => c.dataset.faction ?? ''));
    assert.ok(factions.length > 0 && factions.every((f) => f === 'dragon'), `手札が竜族のカード：${factions.join(',')}`);
    await context.close();
  });

  await step('(b) 4陣営のホーム → カジュアル対戦で部屋に入り、ホームの陣営が席の陣営になり、部屋で変えられる', async () => {
    const { context, page } = await rememberedContext();
    await page.goto(url('?field3d=2d'));
    await page.locator('#home[data-ruleset=factions]:not([hidden])').waitFor();
    await page.locator('[data-act=chooseMode]').click();
    assert.equal(await page.locator('.home-mode[data-mode=online]').isDisabled(), false);
    await page.locator('.home-mode[data-mode=online]').click();
    await page.locator('.home-start').click();
    await page.locator('#title-form:not([hidden])').waitFor();
    await page.fill('#title-name', 'テスト');
    await page.fill('#title-pass', `entry-${Date.now()}`);
    await page.click('#home .home-start');
    await page.getByRole('button', { name: '陣営の説明' }).waitFor();
    const select = page.locator('.room-select', { hasText: '陣営' }).locator('select').first();
    await page.waitForFunction(() => [...document.querySelectorAll('.room-select select')].some((s) => s.value === 'dragon'));
    await select.selectOption('forest');
    await page.waitForFunction(() => [...document.querySelectorAll('.room-select select')].some((s) => s.value === 'forest'));
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cf-online')));
    assert.equal(saved.mode, 'factions', 'つなぎ直し用の鍵に部屋のモードを覚える');
    // 読み直しても、4陣営の部屋に4陣営でつなぎ直す
    await page.reload();
    await page.getByRole('button', { name: '陣営の説明' }).waitFor();
    await context.close();
  });

  await step('(c) 4陣営を覚えていても ?debug=1 は通常モード', async () => {
    const { context, page } = await rememberedContext();
    await page.goto(url('?debug=1&field3d=2d'));
    await page.waitForFunction(() => Boolean(window.castlefield?.game()));
    const s = await viewerDeck(page);
    assert.notEqual(s.deck, 'dragon'); assert.ok(!['kingdom', 'forest', 'demon', 'dragon'].includes(s.deck), `通常モードのデッキ：${s.deck}`);
    assert.equal(await page.evaluate(() => Object.keys(castlefield.game().getState(null).players.p1).includes('castleGuard')), false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('faction-beta')), false);
    await context.close();
  });

  await step('(c) 4陣営を覚えていても ?local=1&cpu=hard は通常モード', async () => {
    const { context, page } = await rememberedContext();
    await page.goto(url('?local=1&cpu=hard&field3d=2d'));
    await page.locator('#hand .card').first().waitFor();
    assert.equal(await page.locator('#hand .card[data-faction]').count(), 0, '手札に4陣営のカードがない');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('faction-beta')), false);
    await context.close();
  });

  await step('(d) 4陣営を覚えていても、通常モードの部屋には通常モードでつなぎ直す', async () => {
    const { context, page } = await rememberedContext();
    // 通常モードの部屋に入る（覚えたモードを消さずに、URL で通常を選ぶ）
    await page.goto(url('?mode=kingdom&field3d=2d'));
    await page.locator('#home[data-ruleset=kingdom]:not([hidden])').waitFor();
    await pickMode(page, 'online');
    await page.locator('.home-start').click();
    await page.fill('#title-name', 'テスト');
    await page.fill('#title-pass', `entry-k-${Date.now()}`);
    await page.click('#home .home-start');
    await page.locator('#room-screen:not([hidden])').first().waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('cf-online')).mode), 'kingdom');
    await page.evaluate(() => localStorage.setItem('cf-home-ruleset', 'factions'));
    // URL に mode がない読み直し：覚えたモード（4陣営）ではなく、部屋のモード（通常）で開く
    await page.goto(url('?field3d=2d'));
    await page.locator('#room-screen:not([hidden])').first().waitFor();
    assert.equal(await page.locator('#home').getAttribute('data-ruleset'), 'kingdom');
    assert.equal(await page.getByRole('button', { name: '陣営の説明' }).count(), 0);
    await context.close();
  });
} finally {
  await browser.close();
}
const real = errors.filter((e) => !/Service Worker/.test(e));
if (real.length) { failed++; console.log('ページエラー：', real); }
console.log(failed ? `失敗 ${failed}` : 'すべて OK');
process.exit(failed ? 1 : 0);
