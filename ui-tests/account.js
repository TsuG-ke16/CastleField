// アカウント画面のテスト：node ui-tests/account.js（Playwright は環境にあるものを使う）
// アカウント付きのサーバーを一時のデータベースで起動し、ゲスト作成・デッキ保存・再読み込み・アカウント作成（メールアドレス）とログイン・設定画面の入口を確かめる。
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
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor({ timeout: 8000 });
  assert.equal(await page.locator('#home .home-tile').count(), 13);
  assert.equal(await page.locator('#home .home-tile:disabled').count(), 0); // どのメニューも使える（Phase 6 で最後の「準備中」がなくなった）
  assert.ok(await page.locator('#home .home-tile[data-id=rank]').isEnabled()); // ランクマッチは使える（Phase 3）
  assert.ok(await page.locator('#home .home-tile[data-id=friend]').isEnabled()); // フレンドも（Phase 4）
  for (const id of ['shop', 'gacha', 'skin']) assert.ok(await page.locator(`#home .home-tile[data-id=${id}]`).isEnabled()); // ショップ・ガチャ・スキン（Phase 5）
  assert.match(await page.locator('#home [data-part=name]').textContent(), /^ゲスト\d{4}$/);
  assert.match(await page.locator('#home [data-part=lv]').textContent(), /Lv\.1/);
  await page.screenshot({ path: resolve(artifacts, 'home.png') });
  // プロフィール：アイコン変更と公開設定が保存される
  await page.click('#home .home-tab[data-tab=account]'); await page.click('#home .home-tile[data-id=profile]');
  await page.locator('#profile:not([hidden]) [data-part=body]:not([hidden])').waitFor();
  await page.click('#profile .profile-icon:nth-child(3)');
  await page.waitForFunction(() => document.querySelector('#profile .profile-icon:nth-child(3)')?.getAttribute('aria-checked') === 'true');
  await page.selectOption('#profile .profile-privacy select >> nth=1', 'public');
  await page.waitForFunction(() => document.querySelector('#profile .profile-privacy:nth-of-type(2) select')?.value === 'public');
  await page.screenshot({ path: resolve(artifacts, 'profile.png') });
  // プロフィールから表示名を変えられる（名前はこれ1つだけ）
  await page.click('#profile [data-part=renameBtn]');
  await page.fill('#profile [data-part=nameInput]', 'プロフさん');
  await page.click('#profile [data-part=renameForm] button[type=submit]');
  await page.locator('#profile [data-part=name]', { hasText: 'プロフさん' }).waitFor();
  assert.equal(await page.evaluate(async () => (await (await fetch('/api/me', { credentials: 'same-origin' })).json()).user?.displayName), 'プロフさん');
  await page.click('#profile .profile-close');
  // 設定には別の名前の欄を出さない（アカウントの表示名だけ）
  await page.click('#home .home-tab[data-tab=settings]'); await page.click('#home .home-tile[data-id=settings]');
  assert.equal(await page.locator('#settings .set-name-group').isVisible(), false);
  await page.keyboard.press('Escape');
  // 「ひとりで遊ぶ」で遊べる画面（既存のタイトル）に進める
  await page.click('#home .home-tab[data-tab=battle]'); await page.click('#home [data-act=start]');
  await page.locator('#title-levels:not([hidden])').waitFor();
  await page.click('#levels-back');
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  await page.click('#home .home-tab[data-tab=settings]'); await page.click('#home .home-tile[data-id=settings]');
  await page.locator('#settings:not([hidden])').waitFor();
  await page.click('#settings .settings-close');
  await page.reload();
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  await page.screenshot({ path: resolve(artifacts, 'account-title.png') });
  await page.click('#home .home-tab[data-tab=settings]'); await page.click('#home .home-tile[data-id=settings]');
  await page.click('.set-account-btn');
  await page.locator('#account:not([hidden])').waitFor();
  assert.equal(await page.locator('#account [data-part=name]').textContent(), 'プロフさん'); // プロフィールで変えた表示名
  assert.match(await page.locator('#account [data-part=kind]').textContent(), /ゲスト/);
  assert.equal(await page.locator('#account [data-part=oauth]').isVisible(), false); // Google の設定がないサーバーでは、Google のボタンを出さない
  assert.match(await page.locator('#account [data-part=linkTitle]').textContent(), /アカウントを作成/);
  await page.screenshot({ path: resolve(artifacts, 'account-panel.png') });
  // 名前を変えて、読み込み直しても同じゲストのまま
  await page.fill('#account [data-part=nameInput]', 'テストさん');
  await page.click('#account [data-act=rename]');
  await page.locator('#account [data-part=msg]', { hasText: '名前を変えました' }).waitFor();
  await page.reload();
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  await page.click('#home .home-tab[data-tab=settings]'); await page.click('#home .home-tile[data-id=settings]');
  await page.click('.set-account-btn');
  assert.equal(await page.locator('#account [data-part=name]').textContent(), 'テストさん');
  // 端末に保存したデッキが、クラウドに上がっている
  await page.evaluate(() => localStorage.setItem('cf-mydecks-v2', JSON.stringify({ active: 0, slots: [{ name: '画面テスト', list: { infantry: 10, spearman: 5 } }, null, null, null] })));
  await page.evaluate(() => localStorage.removeItem('cf-deck-sync-v1'));
  await page.reload();
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  await page.waitForFunction(async () => (await (await fetch('/api/decks', { credentials: 'same-origin' })).json()).slots?.[0]?.name === '画面テスト', null, { timeout: 8000 });
  // 端末のデータを消しても（ゲストの Cookie が残っていれば）クラウドから戻る
  await page.evaluate(() => localStorage.removeItem('cf-mydecks-v2'));
  await page.evaluate(() => localStorage.removeItem('cf-deck-sync-v1'));
  await page.reload();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('cf-mydecks-v2') ?? 'null')?.slots?.[0]?.name === '画面テスト', null, { timeout: 8000 });
  // メールアドレスとパスワードを登録すると会員になり、別の端末（別のブラウザ）でログインすると同じアカウント
  // 設定画面にも入口がある（ゲストには「アカウントを作成」）
  await page.click('#home .home-tab[data-tab=settings]'); await page.click('#home .home-tile[data-id=settings]');
  await page.locator('#settings .set-account-btn', { hasText: 'アカウントを作成' }).click();
  await page.locator('#account:not([hidden])').waitFor();
  assert.ok(await page.locator('#settings').isHidden());
  await page.click('#account [data-act=close]');
  const openAccount = async (pg) => { await pg.click('#home .home-tab[data-tab=settings]'); await pg.click('#home .home-tile[data-id=settings]'); await pg.click('.set-account-btn'); await pg.locator('#account:not([hidden])').waitFor(); };
  await openAccount(page);
  assert.equal(await page.locator('#account .account-provider[data-provider=apple]').count(), 0); // Apple はなくした
  await page.fill('#account [data-part=emailInput]', 'ui-test@example.com');
  await page.fill('#account [data-part=passInput]', 'short');
  await page.click('#account [data-act=emailRegister]');
  await page.locator('#account [data-part=msg].bad', { hasText: '8文字以上' }).waitFor();
  await page.fill('#account [data-part=passInput]', 'ui-test-pass-1');
  await page.click('#account [data-act=emailRegister]');
  await page.locator('#account [data-part=msg]', { hasText: 'アカウントを作成しました' }).waitFor();
  assert.match(await page.locator('#account [data-part=kind]').textContent(), /アカウント作成済み（ログイン：メールアドレス）/);
  assert.ok(await page.locator('#account [data-part=passForm]').isVisible());
  assert.equal(await page.locator('#account [data-part=emailForm]').isVisible(), false);
  await page.screenshot({ path: resolve(artifacts, 'account-email.png') });
  await page.click('#account [data-act=close]');
  const other = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  other.on('pageerror', (e) => errors.push(e.message));
  await other.goto(base);
  await other.locator('#home:not([hidden]):not(.home-local)').waitFor({ timeout: 8000 });
  await openAccount(other);
  await other.fill('#account [data-part=emailInput]', 'UI-Test@example.com');
  await other.fill('#account [data-part=passInput]', 'wrong-password');
  await other.click('#account [data-act=emailLogin]');
  await other.locator('#account [data-part=msg].bad', { hasText: 'メールアドレスかパスワードが違います' }).waitFor();
  await other.fill('#account [data-part=passInput]', 'ui-test-pass-1');
  await other.click('#account [data-act=emailLogin]');
  await other.locator('#account [data-part=name]', { hasText: 'テストさん' }).waitFor({ timeout: 8000 });
  await other.waitForFunction(() => JSON.parse(localStorage.getItem('cf-mydecks-v2') ?? 'null')?.slots?.some((d) => d?.name === '画面テスト'), null, { timeout: 8000 });
  await other.context().close();
  await page.reload();
  await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  // 削除は2回押す
  await page.click('#home .home-tab[data-tab=settings]'); await page.click('#home .home-tile[data-id=settings]');
  await page.click('.set-account-btn');
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
