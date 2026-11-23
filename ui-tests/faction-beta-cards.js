// 4陣営モード（ホームの対戦形式で4陣営を選ぶのと同じ ?beta=factions で開き、カジュアル対戦から部屋に入る）で、陣営のカードが陣営のフレームで出ること・長押しの拡大が陣営の3Dフレーム（Blender 製の card-faction-*.glb）で出ることを確かめる。
// PORT=8787 node server/server.js を起動しておく。実行：node ui-tests/faction-beta-cards.js（require('playwright') が見つからないときは NODE_PATH=$(npm root -g)）
// UI_TEST_GL=0 にすると、拡大表示の3D（ソフトウェア描画で重い）は確かめずに、フレームだけを確かめる
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const checkGL = process.env.UI_TEST_GL !== '0';
const artifacts = new URL('./artifacts/', import.meta.url);
mkdirSync(artifacts, { recursive: true });
const IGNORED = /Service Worker|GL Driver Message|Failed to load resource/; // 読めなかったファイルは下の response で URL ごと記録する
const FACTIONS = ['kingdom', 'forest', 'demon', 'dragon'];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
let failed = 0;

const context = await browser.newContext({ viewport: { width: 390, height: 797 }, serviceWorkers: 'block' });
await context.route('**/api/me', route => route.fulfill({ json: { ok: false } }));
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(m.text()); });
page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/')) errors.push(`${r.status()} ${r.url()}`); });

async function step(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); } catch (error) {
    failed++;
    console.log(`FAIL ${name} -- ${error.message}`);
    await page.screenshot({ path: fileURLToPath(new URL(`faction-beta-cards-${failed}.png`, artifacts)) }).catch(() => {});
  }
}

const longPress = async (target) => {
  const dialog = page.locator('dialog.card-zoom');
  await target.scrollIntoViewIfNeeded();
  for (let i = 0; i < 5 && !(await dialog.isVisible()); i++) {
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('dialog.card-zoom[open]', { timeout: 30000 });
};

await step('ホームの4陣営モードから、カジュアル対戦の部屋に入る', async () => {
  // ?beta=factions は互換の入口で、ホームで4陣営を選んだのと同じ（ホームが開く）
  await page.goto(new URL(`?beta=factions&fx=full`, base).href);
  await page.locator('#home[data-ruleset=factions]:not([hidden])').waitFor();
  await page.locator('[data-act=chooseMode]').click();
  await page.locator('.home-mode[data-mode=online]').click();
  await page.locator('.home-start').click();
  await page.locator('#title-form:not([hidden])').waitFor();
  await page.fill('#title-name', 'テスト');
  await page.fill('#title-pass', `beta-cards-${Date.now()}`);
  await page.click('#title-join');
  await page.getByRole('button', { name: '陣営の説明' }).waitFor();
});

await step('陣営の説明のカードは、陣営ごとのフレームで出る', async () => {
  await page.getByRole('button', { name: '陣営の説明' }).click();
  await page.locator('.faction-info').waitFor();
  const tabs = page.locator('.faction-info .faction-tab');
  assert.equal(await tabs.count(), 4, '陣営のタブが4つ');
  for (let i = 0; i < 4; i++) {
    await tabs.nth(i).click();
    const cards = page.locator('.faction-info .faction-card-art');
    await cards.first().waitFor();
    const info = await cards.evaluateAll((els) => els.map((el) => ({
      faction: el.dataset.faction, zoom: el.dataset.zoom, mini: el.classList.contains('mini-card'),
      frame: el.querySelector('.mini-card-frame')?.getAttribute('src') ?? '',
    })));
    const faction = info[0].faction;
    assert.ok(FACTIONS.includes(faction), `陣営がわかる（${faction}）`);
    for (const c of info) {
      assert.equal(c.faction, faction, `${c.zoom} は同じ陣営`);
      assert.ok(c.mini, `${c.zoom} はフレームつきのカード`);
      assert.ok(c.frame.endsWith(`cards/frame-faction-${faction}.png`), `${c.zoom} は ${faction} のフレーム（${c.frame}）`);
      assert.ok(c.zoom?.startsWith('fac_'), '長押しで拡大できる');
    }
    // フレームの画像が読めている
    const loaded = await cards.first().locator('.mini-card-frame').evaluate((img) => img.complete && img.naturalWidth > 0);
    assert.ok(loaded, `${faction} のフレームの画像が読めている`);
  }
  await page.screenshot({ path: fileURLToPath(new URL('faction-beta-info.png', artifacts)) });
});

for (const [index, faction] of FACTIONS.entries()) {
  await step(`拡大表示（${faction}）は陣営のフレームと${checkGL ? ` Blender 製の card-faction-${faction}.glb` : 'CSS の3D'}で出る`, async () => {
    await page.locator('.faction-info .faction-tab').nth(index).click();
    const target = page.locator(`.faction-info .faction-card-art[data-faction="${faction}"]`).first();
    await target.waitFor();
    if (checkGL) await page.evaluate(() => performance.clearResourceTimings());
    await longPress(target);
    const zoomCard = page.locator('dialog.card-zoom .zoom-card');
    assert.equal(await zoomCard.getAttribute('data-faction'), faction, '拡大したカードも陣営のカード');
    assert.ok((await zoomCard.locator('.mini-card-frame').getAttribute('src')).endsWith(`frame-faction-${faction}.png`), '拡大したカードも陣営のフレーム');
    if (checkGL) {
      await page.waitForSelector('canvas.zoom-gl-canvas', { timeout: 40000 });
      assert.equal(await page.locator('canvas.zoom-gl-canvas').getAttribute('data-model'), `faction-${faction}`, '陣営の立体のモデルで描いている');
      const glb = await page.evaluate((file) => performance.getEntriesByType('resource').some((e) => e.name.endsWith(file)), `card-faction-${faction}.glb`);
      assert.ok(glb, `card-faction-${faction}.glb を読んでいる`);
      await page.locator('canvas.zoom-gl-canvas').screenshot({ path: fileURLToPath(new URL(`faction-beta-zoom-${faction}.png`, artifacts)), timeout: 40000 });
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('dialog.card-zoom[open]').count(), 0, '閉じた');
  });
}

await step('対戦の手札も陣営のフレームで出る', async () => {
  // 陣営の説明を閉じて、CPU を足して始める
  const closeBtn = page.locator('.faction-info').getByRole('button', { name: '閉じる' });
  if (await closeBtn.count()) await closeBtn.click();
  await page.getByRole('button', { name: 'CPUを追加' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /対戦をはじめる|開始/ }).first().click();
  // マリガンがあれば、そのまま始める
  const keep = page.getByRole('button', { name: 'このまま始める' });
  await Promise.race([keep.waitFor({ timeout: 20000 }).then(() => keep.click()).catch(() => {}), page.waitForSelector('#hand .card', { timeout: 20000 })]);
  await page.waitForSelector('#hand .card', { timeout: 20000 });
  const hand = await page.locator('#hand .card').evaluateAll((els) => els.map((el) => ({
    faction: el.dataset.faction ?? null, frame: el.querySelector('.card-frame')?.getAttribute('src') ?? '',
  })));
  assert.ok(hand.length > 0, '手札がある');
  for (const c of hand) {
    assert.ok(FACTIONS.includes(c.faction), `手札のカードに陣営がある（${c.faction}）`);
    assert.ok(c.frame.endsWith(`cards/frame-faction-${c.faction}.png`), `手札のカードは陣営のフレーム（${c.frame}）`);
  }
  await page.screenshot({ path: fileURLToPath(new URL('faction-beta-hand.png', artifacts)) });
});

await browser.close();
for (const e of errors) { failed++; console.log(`ERROR ${e}`); }
console.log(failed ? `${failed} 件失敗` : 'すべて通りました');
process.exit(failed ? 1 : 0);
