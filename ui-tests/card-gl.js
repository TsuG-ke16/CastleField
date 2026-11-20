// Blender 製の板（assets/models/card-slab.glb）と three.js で、拡大表示のカードが出ることを確かめる。PORT=8787 node server/server.js を起動しておく。
// 実行：node ui-tests/card-gl.js（require('playwright') が見つからないときは NODE_PATH=$(npm root -g)）
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const artifacts = new URL('./artifacts/', import.meta.url);
mkdirSync(artifacts, { recursive: true });
const IGNORED = /Service Worker|GL Driver Message/;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
let failed = 0;

async function scenario(name, { query = '?fx=full', glExpected = true }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 797 }, serviceWorkers: 'block' });
  await context.route('**/api/me', route => route.fulfill({ json: { ok: false } }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(`[${name}] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(`[${name}] ${m.text()}`); });
  try {
    await page.goto(new URL(query, base).href);
    await page.click('#home .home-tab[data-tab=deck]'); await page.locator('#home .home-tile[data-id="deck"]').click();
    await page.locator('.deck-summary').waitFor();
    await page.locator('.deck-filter-rarity').selectOption('legendary');
    const target = page.locator('.deck-grid-item [data-zoom]').first();
    await target.waitFor();
    const box = await target.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
    await page.waitForSelector('dialog.card-zoom[open]');
    if (glExpected) {
      await page.waitForSelector('canvas.zoom-gl-canvas');
      // なぞると向きが変わる（描かれる絵が変わる）
      const before = await page.locator('canvas.zoom-gl-canvas').screenshot();
      assert.ok(before.length > 20000, 'カードが描かれている（真っ透明の画像は小さい）');
      const s = await page.locator('.zoom-stage').boundingBox();
      await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2); await page.mouse.down();
      await page.mouse.move(s.x + s.width / 2 + 120, s.y + s.height / 2, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(300);
      assert.notDeepEqual(await page.locator('canvas.zoom-gl-canvas').screenshot(), before, 'なぞると向きが変わる');
    } else {
      await page.waitForTimeout(1500);
      assert.equal(await page.locator('canvas.zoom-gl-canvas').count(), 0, 'CSS の 3D のままで canvas は出ない');
      assert.ok(await page.locator('.zoom-card.card-3d').count(), 'CSS の 3D が出ている');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('canvas.zoom-gl-canvas').count(), 0, '閉じたら canvas は消える');
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name} -- ${error.message}`);
    await page.screenshot({ path: fileURLToPath(new URL(`card-gl-${failed}.png`, artifacts)) }).catch(() => {});
  }
  await context.close();
}

await scenario('Blender 製の板で出る・なぞって回る', {});
await scenario('?card3d=css では CSS の 3D', { query: '?fx=full&card3d=css', glExpected: false });
await browser.close();
for (const e of errors) { failed++; console.log(`ERROR ${e}`); }
console.log(failed ? `${failed} 件失敗` : 'すべて通りました');
process.exit(failed ? 1 : 0);
