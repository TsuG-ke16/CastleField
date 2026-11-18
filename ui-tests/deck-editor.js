// 起動済みの Castlefield サーバーに接続する。PORT=8787 node server/server.js
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const artifacts = new URL('./artifacts/', import.meta.url);
mkdirSync(artifacts, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
});
const errors = [];

async function verify(width, height, reducedMotion) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const press = selector => page.locator(selector).press('Enter');
  const save = () => press('.deck-save');
  const close = () => press('.deck-close');
  await page.goto(base);
  await page.locator('#title-deck').waitFor();
  // 旧版の保存データに廃止カードが残っていても、既存デッキを直せる。
  await page.evaluate(async () => {
    const presets = await fetch('data/decks.json').then(response => response.json());
    localStorage.setItem('cf-mydeck-v1', JSON.stringify({ ...presets.costBalance.cards, oldCard: 1 }));
  });
  await page.goto(new URL('?local=1&cpu=hard&debug=1&seed=8', base).href);
  await page.waitForFunction(() => Boolean(window.castlefield?.game()));
  await page.evaluate(async () => { (await import('./js/ui/config.js')).UI_CONFIG.speed = .03; });
  await press('#menu-open');
  await press('#menu-title-btn');
  await press('#title-deck');
  const summary = page.locator('.deck-summary');
  assert.match(await summary.innerText(), /92/);
  assert.match(await page.locator('.deck-status').innerText(), /oldCard/);
  assert.ok(await page.locator('.deck-add[aria-disabled="false"]').count() > 0);
  assert.equal(await page.locator('.deck-save').getAttribute('aria-disabled'), 'true');
  await press('.deck-current [data-type="oldCard"]');
  assert.equal(await page.locator('.deck-save').getAttribute('aria-disabled'), 'false');
  const blocked = page.locator('.deck-add[aria-disabled="true"]').first();
  const blockedReason = await blocked.getAttribute('aria-description');
  const before = await summary.innerText();
  await blocked.press('Enter');
  assert.equal(await page.locator('.deck-status').innerText(), blockedReason);
  assert.equal(await summary.innerText(), before);
  await page.locator('.deck-current button').first().press('ArrowDown');
  assert.ok(await page.locator('.deck-details').isVisible());
  await page.keyboard.press('Escape');

  await page.locator('.deck-filter-rarity').selectOption('legendary');
  assert.ok(await page.locator('.deck-grid-item').count() > 0);
  const card = page.locator('.deck-grid-art[data-rarity="legendary"]').first();
  const foil = card.locator('.foil-sheet');
  await card.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.deck-grid-art[data-rarity="legendary"]')?.classList.contains('foil-visible'));
  const animation = await foil.evaluate(element => getComputedStyle(element).animationName);
  assert.equal(animation, reducedMotion === 'reduce' ? 'none' : 'card-foil-sweep');
  if (reducedMotion !== 'reduce') {
    const bounds = await card.boundingBox();
    const point = (x, y) => page.mouse.move(bounds.x + bounds.width * x, bounds.y + bounds.height * y);
    await point(.29, .4);
    await page.waitForFunction(() => document.querySelector('.deck-grid-art[data-rarity="legendary"]')?.style.getPropertyValue('--foil-x'));
    await page.screenshot({ path: fileURLToPath(new URL('deck-foil-left.png', artifacts)) });
    await point(.72, .6);
    await page.screenshot({ path: fileURLToPath(new URL('deck-foil-right.png', artifacts)) });
  }
  await press('.deck-grid-item:first-child .deck-card-info');
  assert.ok(await page.locator('.deck-details').isVisible());
  await page.keyboard.press('Escape');
  await page.locator('.deck-filter-rarity').selectOption('common');
  await page.locator('.deck-filter-kind').selectOption('soldier');
  assert.ok(await page.locator('.deck-grid-item').count() > 0);
  await page.locator('.deck-sort').selectOption('cost');
  assert.equal(await page.locator('.deck-grid-art .foil-sheet').count(), 0);

  await press('.deck-manage');
  await page.locator('.deck-name-input').fill('確認用のデッキ');
  await press('.deck-manage-close');
  await save();
  assert.match(await page.locator('.deck-status').innerText(), /保存しました/);
  await press('.deck-manage');
  await press('.deck-duplicate');
  assert.equal(await page.locator('.deck-slots').inputValue(), '1');
  await press('.deck-manage');
  await press('.deck-clear');
  assert.match(await summary.innerText(), /コスト 0/);
  await press('.deck-recommend');
  assert.match(await summary.innerText(), /コスト 90/);
  assert.equal(await page.locator('.deck-save').getAttribute('aria-disabled'), 'false');
  await save();
  await press('.deck-manage');
  page.once('dialog', dialog => dialog.accept());
  await press('.deck-delete');
  assert.match(await page.locator('.deck-status').innerText(), /空にしました/);
  await page.locator('.deck-slots').selectOption('0');
  assert.match(await summary.innerText(), /92/);
  await page.locator('.deck-filter-rarity').selectOption('');
  await page.locator('.deck-filter-kind').selectOption('');
  await page.locator('.deck-sort').selectOption('rarity');
  const grid = page.locator('.deck-grid');
  assert.ok(await grid.evaluate(element => element.scrollHeight > element.clientHeight));
  assert.ok((await page.locator('.deck-grid-item:first-child').boundingBox()).height >= 140);
  await page.screenshot({ path: fileURLToPath(new URL(`deck-editor-${width}x${height}.png`, artifacts)) });
  await close();

  assert.match(await page.locator('#title-deck-preview').innerText(), /確認用のデッキ/);
  await press('#title-local');
  await press('.local-options summary');
  await press('.local-options .pill[data-value="cost"]');
  await press('.local-options .pill[data-value="custom:0"]');
  assert.match(await page.locator('.local-options .deck-preview').innerText(), /確認用のデッキ/);

  await press('#local-start');
  await page.waitForFunction(() => window.castlefield?.game()?.getState(null).players.p1.deckId === 'custom');
  await page.goto(base);
  await page.locator('#title-deck').waitFor();
  await press('#title-online');
  await page.locator('#title-name').fill('編成テスト');
  await page.locator('#title-pass').fill(`deck-${width}-${Date.now()}`);
  await press('#title-join');
  await page.locator('#room-screen').waitFor();
  await press('#room-screen .pill[data-value="cost"]');
  const pending = page.waitForRequest(request => request.url().endsWith('/api/action')
    && request.postDataJSON()?.method === 'setSeat');
  await press('.room-self .pill[data-value="custom:0"]');
  const request = await pending;
  assert.ok(Object.keys(request.postDataJSON().args[0].deckList).length > 0);
  const roomPreview = page.locator('.room-self .deck-preview').filter({ hasText: '確認用のデッキ' });
  await roomPreview.waitFor();
  await page.reload();
  await roomPreview.waitFor();
  await page.getByRole('button', { name: 'CPUを追加' }).click();
  await page.locator('.room-start').click();
  await page.waitForFunction(() => document.querySelector('#room-screen').hidden && !document.querySelector('#board').hidden);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`${width}×${height} デッキ編成・ローカル設定・オンライン選択 OK`);
}

// デッキ1は見本の中身が入った「まだ保存していない枠」。名前だけ変えても保存される
// （スマホのように入力欄から外れずに管理の画面を閉じたときも）
async function verifyFirstSlotName() {
  const context = await browser.newContext({ viewport: { width: 390, height: 797 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('#title-deck').press('Enter');
  await page.locator('.deck-manage').press('Enter');
  await page.locator('.deck-name-input').evaluate(input => {
    input.value = '最初のデッキ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('dialog').close();
  });
  assert.match(await page.locator('.deck-slots option[value="0"]').innerText(), /最初のデッキ/);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cf-mydecks-v2')));
  assert.equal(stored.slots[0].name, '最初のデッキ');
  await page.locator('.deck-close').press('Enter');
  assert.match(await page.locator('#title-deck-preview').innerText(), /最初のデッキ/);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('デッキ1の名前だけを変えて保存 OK');
}

try {
  await verifyFirstSlotName();
  await verify(390, 844, 'no-preference');
  await verify(360, 640, 'reduce');
} finally {
  await browser.close();
}
