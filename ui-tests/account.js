// アカウント画面のテスト：node ui-tests/account.js（Playwright は環境にあるものを使う）
// アカウント付きのサーバーを一時のデータベースで起動し、ゲスト作成・デッキ保存・再読み込み・連携ボタンの表示を確かめる。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = resolve(root, 'ui-tests/artifacts'); mkdirSync(artifacts, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'cf-ui-'));
const port = 8790 + Math.floor(Math.random() * 100);
const base = `http://127.0.0.1:${port}/`;
const server = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CF_DB_PATH: join(dir, 'ui.db') }, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; n < 50; n++) { try { if ((await fetch(base)).ok) break; } catch { /* 起動待ち */ } await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base);
  await page.locator('#title-account').waitFor({ state: 'visible', timeout: 8000 });
  await page.screenshot({ path: resolve(artifacts, 'account-title.png') });
  await page.click('#title-account');
  await page.locator('#account:not([hidden])').waitFor();
  assert.match(await page.locator('#account [data-part=name]').textContent(), /^ゲスト\d{4}$/);
  assert.match(await page.locator('#account [data-part=kind]').textContent(), /ゲスト/);
  assert.ok(await page.locator('#account .account-provider[data-provider=google]').isDisabled()); // 認証の設定がないサーバー
  await page.screenshot({ path: resolve(artifacts, 'account-panel.png') });
  // 名前を変えて、読み込み直しても同じゲストのまま
  await page.fill('#account [data-part=nameInput]', 'テストさん');
  await page.click('#account [data-act=rename]');
  await page.locator('#account [data-part=msg]', { hasText: '名前を変えました' }).waitFor();
  await page.reload();
  await page.locator('#title-account').waitFor({ state: 'visible' });
  await page.click('#title-account');
  assert.equal(await page.locator('#account [data-part=name]').textContent(), 'テストさん');
  // 端末に保存したデッキが、クラウドに上がっている
  await page.evaluate(() => localStorage.setItem('cf-mydecks-v2', JSON.stringify({ active: 0, slots: [{ name: '画面テスト', list: { infantry: 10, spearman: 5 } }, null, null, null] })));
  await page.evaluate(() => localStorage.removeItem('cf-deck-sync-v1'));
  await page.reload();
  await page.locator('#title-account').waitFor({ state: 'visible' });
  await page.waitForFunction(async () => (await (await fetch('/api/decks', { credentials: 'same-origin' })).json()).slots?.[0]?.name === '画面テスト', null, { timeout: 8000 });
  // 端末のデータを消しても（ゲストの Cookie が残っていれば）クラウドから戻る
  await page.evaluate(() => localStorage.removeItem('cf-mydecks-v2'));
  await page.evaluate(() => localStorage.removeItem('cf-deck-sync-v1'));
  await page.reload();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('cf-mydecks-v2') ?? 'null')?.slots?.[0]?.name === '画面テスト', null, { timeout: 8000 });
  // 削除は2回押す
  await page.click('#title-account');
  await page.click('#account [data-act=delete]');
  assert.match(await page.locator('#account [data-act=delete]').textContent(), /もう一度/);
  await page.screenshot({ path: resolve(artifacts, 'account-delete-confirm.png') });
  // 横にはみ出さない
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('アカウント画面のテスト：OK');
} finally {
  await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
}
