// フレンド画面のテスト：node ui-tests/social.js（Playwright は環境にあるものを使う）
// 2人の会員で：検索→申請→承認→フレンド一覧→招待→招待を受けて同じ部屋に入る、パーティーを作る、までを通す。
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
const dir = mkdtempSync(join(tmpdir(), 'cf-sc-'));
const dbFile = join(dir, 's.db');
const port = 8950 + Math.floor(Math.random() * 40);
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
  // ゲストはフレンド機能を使えない
  await A.click('#home .home-tab[data-tab=menu]'); await A.click('#home .home-tile[data-id=friend]');
  await A.locator('#social:not([hidden]) .social-note').waitFor();
  assert.match(await A.locator('#social .social-note').textContent(), /アカウントを作成/);
  await A.click('#social .social-close');
  // 会員にして、名前をつける
  const db = new DatabaseSync(dbFile);
  for (const [page, name] of [[A, 'アリス'], [B, 'ボブ']]) {
    const id = await page.evaluate(async () => (await (await fetch('/api/me', { credentials: 'same-origin' })).json()).user.id);
    db.prepare("UPDATE users SET kind = 'member', display_name = ? WHERE id = ?").run(name, id);
    await page.reload();
    await page.locator('#home:not([hidden]):not(.home-local)').waitFor();
  }
  db.close();
  // A が B を検索して申請
  await A.click('#home .home-tab[data-tab=menu]'); await A.click('#home .home-tile[data-id=friend]');
  await A.locator('#social .social-tab[data-tab=search]').click();
  await A.fill('#social input[name=q]', 'ボブ');
  await A.click('#social .social-search button');
  await A.locator('#social [data-act=request]').click();
  await A.locator('#social-msg, #social [data-part=msg]', { hasText: '申請しました' }).waitFor();
  await A.screenshot({ path: resolve(artifacts, 'social-search.png') });
  await A.click('#social .social-close');
  // B：知らせの印が出て、申請を承認
  await B.waitForTimeout(300);
  await B.reload(); await B.locator('#home:not([hidden]):not(.home-local)').waitFor();
  await B.click('#home .home-tab[data-tab=menu]'); await B.locator('#home .home-tile[data-id=friend] .home-badge').waitFor({ timeout: 8000 });
  await B.click('#home .home-tab[data-tab=menu]'); await B.click('#home .home-tile[data-id=friend]');
  await B.locator('#social .social-tab[data-tab=requests]').click();
  await B.screenshot({ path: resolve(artifacts, 'social-requests.png') });
  await B.click('#social [data-act=accept]');
  await B.locator('#social .social-tab[data-tab=friends]').click();
  await B.locator('#social .social-row', { hasText: 'アリス' }).waitFor();
  await B.click('#social .social-close');
  // A：フレンド一覧に B がオンラインで出る → 招待
  await A.click('#home .home-tab[data-tab=menu]'); await A.click('#home .home-tile[data-id=friend]');
  await A.locator('#social .social-row .social-status', { hasText: 'ボブ' }).or(A.locator('#social .social-row', { hasText: 'ボブ' }).locator('.social-status')).waitFor({ timeout: 8000 });
  assert.match(await A.locator('#social .social-row', { hasText: 'ボブ' }).textContent(), /オンライン/);
  await A.waitForTimeout(600);
  await A.screenshot({ path: resolve(artifacts, 'social-friends.png') });
  await A.click('#social .social-row .social-main');
  await A.click('#social [data-act=invite]');
  // A は招待した部屋に入る。B にはバナーが出る → 参加
  await B.locator('#social-banner:not([hidden]) [data-act=inv-yes]').waitFor({ timeout: 20000 });
  await B.screenshot({ path: resolve(artifacts, 'social-invite.png') });
  await B.click('#social-banner [data-act=inv-yes]');
  for (const page of [A, B]) await page.locator('#room:not([hidden]), .room-seat').first().waitFor({ timeout: 10000 });
  await A.waitForFunction(() => document.querySelectorAll('.room-seat').length >= 2, null, { timeout: 10000 });
  await A.screenshot({ path: resolve(artifacts, 'social-room.png') });
  assert.deepEqual(errors, []);
  console.log('フレンド画面のテスト：OK');
} finally {
  await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
}
