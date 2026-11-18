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
  // アカウントのあるサーバーでは、ホーム画面が入口
  await page.locator('#home:not([hidden])').waitFor({ timeout: 8000 });
  assert.equal(await page.locator('#home .home-tile').count(), 12);
  assert.ok(await page.locator('#home .home-tile[data-id=mission]').isDisabled()); // 未実装は押せない（準備中）
  assert.ok(await page.locator('#home .home-tile[data-id=rank]').isEnabled()); // ランクマッチは使える（Phase 3）
  assert.ok(await page.locator('#home .home-tile[data-id=friend]').isEnabled()); // フレンドも（Phase 4）
  for (const id of ['shop', 'gacha', 'skin']) assert.ok(await page.locator(`#home .home-tile[data-id=${id}]`).isEnabled()); // ショップ・ガチャ・スキン（Phase 5）
  assert.match(await page.locator('#home [data-part=name]').textContent(), /^ゲスト\d{4}$/);
  assert.match(await page.locator('#home [data-part=lv]').textContent(), /Lv\.1/);
  await page.screenshot({ path: resolve(artifacts, 'home.png') });
  // プロフィール：アイコン変更と公開設定が保存される
  await page.click('#home .home-tile[data-id=profile]');
  await page.locator('#profile:not([hidden]) [data-part=body]:not([hidden])').waitFor();
  await page.click('#profile .profile-icon:nth-child(3)');
  await page.waitForFunction(() => document.querySelector('#profile .profile-icon:nth-child(3)')?.getAttribute('aria-checked') === 'true');
  await page.selectOption('#profile .profile-privacy select >> nth=1', 'public');
  await page.waitForFunction(() => document.querySelector('#profile .profile-privacy:nth-of-type(2) select')?.value === 'public');
  await page.screenshot({ path: resolve(artifacts, 'profile.png') });
  await page.click('#profile .profile-close');
  // 「ひとりで遊ぶ」で遊べる画面（既存のタイトル）に進める
  await page.click('#home [data-act=start]');
  await page.locator('#title-levels:not([hidden])').waitFor();
  await page.click('#levels-back');
  await page.click('#title-home');
  await page.locator('#home:not([hidden])').waitFor();
  await page.click('#home [data-act=settings]');
  await page.locator('#settings:not([hidden])').waitFor();
  await page.click('#settings .settings-close');
  await page.reload();
  await page.locator('#home:not([hidden])').waitFor();
  await page.screenshot({ path: resolve(artifacts, 'account-title.png') });
  await page.click('#home [data-act=start]');
  await page.click('#levels-back');
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
  await page.locator('#home:not([hidden])').waitFor();
  await page.click('#home [data-act=start]');
  await page.click('#levels-back');
  await page.click('#title-account');
  assert.equal(await page.locator('#account [data-part=name]').textContent(), 'テストさん');
  // 端末に保存したデッキが、クラウドに上がっている
  await page.evaluate(() => localStorage.setItem('cf-mydecks-v2', JSON.stringify({ active: 0, slots: [{ name: '画面テスト', list: { infantry: 10, spearman: 5 } }, null, null, null] })));
  await page.evaluate(() => localStorage.removeItem('cf-deck-sync-v1'));
  await page.reload();
  await page.locator('#home:not([hidden])').waitFor();
  await page.waitForFunction(async () => (await (await fetch('/api/decks', { credentials: 'same-origin' })).json()).slots?.[0]?.name === '画面テスト', null, { timeout: 8000 });
  // 端末のデータを消しても（ゲストの Cookie が残っていれば）クラウドから戻る
  await page.evaluate(() => localStorage.removeItem('cf-mydecks-v2'));
  await page.evaluate(() => localStorage.removeItem('cf-deck-sync-v1'));
  await page.reload();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('cf-mydecks-v2') ?? 'null')?.slots?.[0]?.name === '画面テスト', null, { timeout: 8000 });
  // 削除は2回押す
  await page.click('#home [data-act=start]');
  await page.click('#levels-back');
  await page.click('#title-account');
  await page.click('#account [data-act=delete]');
  assert.match(await page.locator('#account [data-act=delete]').textContent(), /もう一度/);
  await page.screenshot({ path: resolve(artifacts, 'account-delete-confirm.png') });
  // 試合のあとの経験値・レベルアップの表示（サーバーの返事を差し込んで確かめる）
  await page.evaluate(async () => {
    const { account } = await import('/js/ui/Account.js');
    const { showMatchProgress } = await import('/js/ui/Progression.js');
    account.api = async () => ({ json: { ok: true, last: { matchId: 'm-test', counted: true, xpGained: 35, levelBefore: 1, level: 2, xpIntoLevel: 10, xpForNext: 80, maxed: false } } });
    const root = document.createElement('div'); root.id = 'mp-test'; root.innerHTML = '<div class="result-actions"></div>';
    document.getElementById('app').append(root);
    await showMatchProgress(root);
  });
  assert.match(await page.locator('#mp-test .mp-gain').textContent(), /\+35 EXP/);
  assert.match(await page.locator('.levelup').textContent(), /レベルアップ！Lv\.2/);
  await page.screenshot({ path: resolve(artifacts, 'levelup.png') });
  // 横にはみ出さない
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('アカウント画面のテスト：OK');
} finally {
  await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
}
