// スマホの代わりに確かめる：オフラインで起動できるか（PWA）と、カードの長押し拡大・傾き。
// 起動済みのサーバーに接続する。PORT=8787 node server/server.js
// 実機でしか分からないこと（ホーム画面に追加する操作、iPhone の傾きの許可の確認、指の感触）は対象外。
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const base = new URL(process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/');
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
});
const errors = [];
const watch = (page, label) => {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  // オフラインでは、アカウントの通信（/api/...）が届かないのは想定内（ゲームはそのまま遊べる）
  page.on('console', message => { if (message.type() === 'error' && !message.location().url?.includes('/api/')) errors.push(`${label}: ${message.text()} ${message.location().url ?? ''}`.trim()); });
};

async function offline() {
  const context = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await context.newPage();
  watch(page, 'offline');
  await page.goto(base.href);
  await page.locator('#home:not([hidden])').waitFor();
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    return (await fetch(link.href)).json();
  });
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons?.length >= 1, 'ホーム画面のアイコンがある');
  // サービスワーカーが配るファイルを全部しまい、このページを受け持つまで待つ（受け持たないときは1回だけ読み直す）
  let cached = 0;
  for (let i = 0; i < 180; i++) {
    cached = await page.evaluate(async () => {
      let n = 0;
      for (const key of await caches.keys()) n += (await (await caches.open(key)).keys()).length;
      return n;
    });
    if (cached > 300 && await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) break;
    if (i === 30) await page.reload();
    await page.waitForTimeout(1000);
  }
  assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'サービスワーカーがページを受け持つ');
  await context.setOffline(true);
  await page.reload();
  // ホーム（入口）の「ひとりで」→「対戦開始」→ 強さ
  await page.locator('#home .home-mode[data-mode="solo"]').click();
  await page.locator('#home [data-act="start"]').click();
  await page.locator('#title-levels .level[data-level="normal"]').click();
  await page.waitForFunction(() => !document.querySelector('#board').hidden && !document.querySelector('#app').classList.contains('busy'), {}, { timeout: 60000 });
  const broken = await page.evaluate(() => [...document.querySelectorAll('img')]
    .filter(img => img.getClientRects().length && img.complete && img.naturalWidth === 0)
    .map(img => img.getAttribute('src')));
  assert.deepEqual(broken, [], 'オフラインでも絵が出る');
  await page.screenshot({ path: fileURLToPath(new URL('device-offline.png', output)) });
  await context.close();
  console.log(`オフライン：${cached}ファイルを保存し、通信なしでひとりで遊ぶを始められる OK`);
}

async function zoom(device) {
  // 傾きセンサー（実機では「傾きセンサーを使う」で許可を聞く）。テストでは許可しておく
  const context = await browser.newContext({ ...devices[device], serviceWorkers: 'block', permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });
  const page = await context.newPage();
  watch(page, device);
  await page.goto(base.href);
  // ホーム（入口）の「デッキ編成」から開く
  await page.locator('#home .home-tile[data-id=deck]').click();
  await page.locator('.deck-grid-item').first().waitFor();
  const before = await page.locator('.deck-summary').innerText();
  const box = await page.locator('.deck-grid [data-zoom]').first().boundingBox();
  const touch = await context.newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(650);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const card = page.locator('.zoom-card');
  await card.waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.deck-summary').innerText(), before, '長押しのあと指を離しても、カードは足されない');
  // iPhone のように許可を聞ける端末では、「傾きセンサーを使う」を押してから傾きが効く（勝手には聞かない）
  const sensor = page.locator('.zoom-sensor');
  if (await sensor.isVisible()) {
    await sensor.click();
    await sensor.waitFor({ state: 'hidden' });
  }
  const tilt = async (gamma, beta) => {
    await page.evaluate(([g, b]) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g })), [gamma, beta]);
    await page.waitForFunction(dir => {
      const x = parseFloat(document.querySelector('.zoom-card').style.getPropertyValue('--foil-x'));
      return dir < 0 ? x < 40 : x > 60;
    }, gamma);
    return card.evaluate(el => [parseFloat(el.style.getPropertyValue('--foil-x')), getComputedStyle(el).transform]);
  };
  const [leftX, leftTransform] = await tilt(-20, 30);
  const [rightX, rightTransform] = await tilt(25, 60);
  assert.ok(leftX < 40 && rightX > 60, `傾けると光が動く（${leftX}% → ${rightX}%）`);
  assert.notEqual(leftTransform, rightTransform, '傾けるとカードの角度が変わる');
  const rect = await card.boundingBox();
  const view = page.viewportSize();
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= view.width && rect.y + rect.height <= view.height, '拡大したカードが画面に収まる');
  await page.screenshot({ path: fileURLToPath(new URL(`device-zoom-${device.replace(/\s/g, '')}.png`, output)) });
  await page.touchscreen.tap(8, view.height / 2);
  await page.locator('dialog.card-zoom').waitFor({ state: 'hidden' });
  await context.close();
  console.log(`${device}：長押しで拡大・傾きで光と角度が動く OK`);
}

try {
  await offline();
  for (const device of ['iPhone SE', 'iPhone 13', 'Pixel 7']) await zoom(device);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
