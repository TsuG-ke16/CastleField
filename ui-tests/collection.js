// ショップ・ガチャ・スキンの画面のテスト：node ui-tests/collection.js（Playwright は環境にあるものを使う）
// コインを入れて、買う→装備→ひとりで遊ぶ盤面にスキンが出る、ガチャ（1回・10連）の演出と残高、までを通す。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = resolve(root, 'ui-tests/artifacts'); mkdirSync(artifacts, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'cf-co-'));
const dbFile = join(dir, 'c.db');
const port = 9000 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}/`;
const server = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CF_DB_PATH: dbFile }, stdio: 'ignore' });
let browser;
async function expectPaint(castle) {
  await castle.locator('.castle-pic .asset-image').first().evaluate((image) => image.decode());
  const content = await castle.locator('.castle-pic .asset-image').first().evaluate((image) => getComputedStyle(image).content);
  assert.match(content, /castle-crimson[.]png/);
}
try {
  for (let n = 0; n < 50; n++) { try { if ((await fetch(base)).ok) break; } catch { /* 起動待ち */ } await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({...(process.env.UI_TEST_CHROMIUM?{executablePath:process.env.UI_TEST_CHROMIUM}:{})});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 797 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const startUrl=new URL(base);if(process.env.UI_TEST_FIELD3D)startUrl.searchParams.set('field3d',process.env.UI_TEST_FIELD3D);
  await page.goto(startUrl.href);
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor({ timeout: 8000 });
  const id = await page.evaluate(async () => (await (await fetch('/api/me', { credentials: 'same-origin' })).json()).user.id);
  // コインを入れる（本物の入手は対戦の報酬。テストではデータベースに直接）
  const db = new DatabaseSync(dbFile);
  db.prepare('INSERT INTO wallets (user_id, free_coins) VALUES (?, 2500)').run(id);
  db.close();
  await page.reload();
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  assert.match(await page.locator('#home [data-part=coins] b').textContent(), /2500/);
  // ショップ：買う
  await page.click('#home .home-tab[data-tab=shop]');
  await page.locator('#collection:not([hidden]) .item-card').first().waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(artifacts, 'shop.png') });
  await page.locator('#collection .item-card', { hasText: '紅蓮の兵' }).locator('[data-act=buy]').click();
  await page.locator('#collection .item-card.owned', { hasText: '紅蓮の兵' }).waitFor();
  await page.click('#collection .collection-slot[data-slot=castle]');
  await page.locator('#collection .item-card', { hasText: '紅蓮の城' }).locator('[data-act=buy]').click();
  await page.locator('#collection .item-card.owned', { hasText: '紅蓮の城' }).waitFor();
  assert.match(await page.locator('#collection [data-part=wallet] b').textContent(), /1900/);
  // 買えないもの（ガチャ限定）は押せない
  await page.click('#collection .collection-slot[data-slot=unit]');
  assert.equal(await page.locator('#collection .item-card', { hasText: '黄金の兵' }).locator('[data-act]').count(), 0);
  // 所持品：装備
  await page.click('#home .home-tab[data-tab=menu]');await page.click('#home .home-tile[data-id=skin]');
  await page.click('#collection .collection-slot[data-slot=castle]');
  await page.locator('#collection .item-card', { hasText: '紅蓮の城' }).locator('[data-act=equip]').click();
  await page.locator('#collection .item-card', { hasText: '紅蓮の城' }).locator('[data-act=unequip]').waitFor();
  await page.screenshot({ path: resolve(artifacts, 'collection.png') });
  // ガチャ：1回と10連
  await page.click('#home .home-tab[data-tab=gacha]');
  await page.locator('#collection .gacha-pull').waitFor();
  await page.locator('#collection .gacha-pull [data-count="1"]').click();
  await page.locator('#collection .gacha-open').click();
  await page.locator('#collection .gacha-reveal .gacha-card').first().waitFor();
  assert.equal(await page.locator('#collection .gacha-reveal .gacha-card').count(), 1);
  await page.click('#collection .gacha-reveal .gacha-close');
  await page.locator('#collection .gacha-pull [data-count="10"]').click();
  await page.locator('#collection .gacha-open').click();
  await page.locator('#collection .gacha-reveal .gacha-card').nth(9).waitFor();
  await page.click('#collection .gacha-reveal'); // タップで全部見る
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(artifacts, 'gacha-result.png') });
  assert.equal(await page.locator('#collection .gacha-reveal .gacha-card').count(), 10);
  await page.click('#collection .gacha-reveal .gacha-close');
  assert.equal(Number(await page.locator('#collection [data-part=wallet] b').first().textContent()), 900); // 2500 - 600（買い物）- 1000（ガチャ）
  assert.deepEqual(errors, []);
  // 装備したスキンが、ひとりで遊ぶ盤面に出る（自分の城だけ。CPU の城は標準）
  await page.click('#home .home-tab[data-tab=battle]'); await page.click('#home [data-act=start]');
  await page.locator('.castle[data-player-id]').first().waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.castle[data-player-id]').length >= 2);
  const skinned = await page.evaluate(() => [...document.querySelectorAll('.castle[data-player-id]')].filter((c) => c.dataset.painted !== undefined && c.style.getPropertyValue('--castle-art')).length);
  assert.equal(skinned, 1);
  const castle = page.locator('.castle[data-painted]');
  await expectPaint(castle);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(artifacts, 'skin-in-game.png') });
  assert.deepEqual(errors, []);
  console.log('ショップ・ガチャ・スキンの画面のテスト：OK');
} finally {
  await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
}
