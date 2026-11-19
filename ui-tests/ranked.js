// ランクマッチの画面のテスト：node ui-tests/ranked.js（Playwright は環境にあるものを使う）
// 2人の会員で相手探し → 成立 → 試合に入る → 片方が降参 → 結果画面にランクの変化が出る、までを通す。
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
const dir = mkdtempSync(join(tmpdir(), 'cf-rk-'));
const dbFile = join(dir, 'r.db');
const port = 8850 + Math.floor(Math.random() * 100);
const base = `http://127.0.0.1:${port}/`;
const server = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CF_DB_PATH: dbFile }, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; n < 50; n++) { try { if ((await fetch(base)).ok) break; } catch { /* 起動待ち */ } await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
  const errors = [];
  const open = async (name) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 797 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    await page.goto(base);
    await page.locator('#home:not([hidden]):not(.home-local)').waitFor({ timeout: 8000 });
    return page;
  };
  const A = await open('A'); const B = await open('B');
  // ゲストはランクマッチに参加できない
  await A.click('#home .home-tile[data-id=rank]');
  await A.locator('#ranked:not([hidden]) .ranked-action').waitFor();
  assert.match(await A.locator('#ranked .ranked-note').textContent(), /Googleかメールアドレス/);
  await A.screenshot({ path: resolve(artifacts, 'ranked-guest.png') });
  await A.click('#ranked .ranked-close');
  // 会員にする（本物の Google 連携・メールの登録の代わりに、データベースを直接更新）
  const db = new DatabaseSync(dbFile);
  for (const page of [A, B]) {
    const id = await page.evaluate(async () => (await (await fetch('/api/me', { credentials: 'same-origin' })).json()).user.id);
    db.prepare("UPDATE users SET kind = 'member' WHERE id = ?").run(id);
    await page.reload();
    await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  }
  db.close();
  await A.click('#home .home-tile[data-id=rank]');
  await A.locator('#ranked .ranked-find').waitFor();
  await A.screenshot({ path: resolve(artifacts, 'ranked-idle.png') });
  await A.click('#ranked .ranked-find');
  await A.locator('#ranked .ranked-wait').waitFor();
  await A.screenshot({ path: resolve(artifacts, 'ranked-searching.png') });
  await B.click('#home .home-tile[data-id=rank]');
  await B.click('#ranked .ranked-find');
  // 成立 → 自動で試合に入る（ホームもランク画面も閉じる）
  for (const page of [A, B]) await page.waitForFunction(() => document.querySelector('#ranked')?.hidden && document.querySelector('#home')?.hidden && document.querySelector('#hand'), null, { timeout: 15000 });
  await A.waitForFunction(() => document.querySelector('#hand .card'), null, { timeout: 10000 });
  await A.screenshot({ path: resolve(artifacts, 'ranked-ingame.png') });
  // ランク戦の途中で「タイトルへ」を押しても、すぐには抜けない（負けになるため警告）
  await B.click('#menu-open'); await B.click('#menu-title-btn');
  assert.ok(await B.locator('#home').isHidden());
  // B が降参 → A の勝ち。結果画面にランクの変化が出る
  const tokenB = await B.evaluate(() => JSON.parse(sessionStorage.getItem('cf-online')).token);
  const sr = await fetch(`${base}api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenB, method: 'surrender', args: [] }) }).then((r) => r.json());
  assert.equal(sr.ok, true);
  await A.locator('#result:not([hidden]) .match-progress .rank-change').waitFor({ timeout: 10000 });
  assert.match(await A.locator('#result .rank-change').textContent(), /認定戦/);
  assert.match(await A.locator('#rematch').textContent(), /ランクマッチ画面へ/);
  assert.ok(await A.locator('#back-to-room').isHidden());
  await A.screenshot({ path: resolve(artifacts, 'ranked-result.png') });
  // 結果から、ランク画面に戻れる。認定戦の進み具合が出る
  await A.click('#rematch');
  await A.locator('#ranked:not([hidden]) .ranked-find').waitFor();
  assert.match(await A.locator('#ranked .ranked-pips').textContent(), /あと4試合/);
  // ランキング（認定戦中の人はまだ載らない）
  await A.click('#ranked .ranked-close');
  await A.click('#home .home-tile[data-id=ranking]');
  await A.locator('#ranking:not([hidden]) [data-part=me]').waitFor();
  assert.match(await A.locator('#ranking [data-part=me]').textContent(), /認定戦中/);
  await A.screenshot({ path: resolve(artifacts, 'ranking.png') });
  assert.deepEqual(errors, []);
  console.log('ランクマッチ画面のテスト：OK');
} finally {
  await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
}
