// カードの拡大表示（長押し）の立体表示を確かめる。起動済みのサーバーに接続する。PORT=8787 node server/server.js
// 実行：node ui-tests/card-zoom-3d.js（require('playwright') が見つからないときは NODE_PATH=$(npm root -g)）
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { UI_CONFIG } from '../js/ui/config.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const artifacts = new URL('./artifacts/', import.meta.url);
mkdirSync(artifacts, { recursive: true });
const artifactPath = name => fileURLToPath(new URL(name, artifacts));
const IGNORED = /Service Worker|GL Driver Message/;

const browser = await chromium.launch({
  ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const errors = [];
const results = [];

async function newPage({ viewport = { width: 390, height: 797 }, reducedMotion = 'no-preference', label }) {
  const context = await browser.newContext({ viewport, reducedMotion, serviceWorkers: 'block' });
  // アカウント機能を切る（クラウドとのデッキの同期などで、テストの状態が変わらないように。アカウントは account.js で確かめる）
  await context.route('**/api/me', route => route.fulfill({ json: { ok: false } }));
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', error => errors.push(`[${label}] ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !IGNORED.test(message.text())) errors.push(`[${label}] ${message.text()}`);
  });
  return { context, page };
}

// デッキ編成を開く。rarity を指定すると、そのレアリティで絞り込む
async function openDeck(page, fx) {
  await page.goto(new URL(`?fx=${fx}`, base).href);
  await page.locator('#home .home-tile[data-id="deck"]').click();
  await page.locator('.deck-summary').waitFor();
}

async function selectRarity(page, rarity) {
  await page.locator('.deck-filter-rarity').selectOption(rarity);
  await page.locator('.deck-grid-item [data-zoom]').first().waitFor();
}

// 長押しでカードを拡大する（deck-editor と同じ操作：押したまま 600ms）
async function longPress(page) {
  // 横向きでは一覧が短く、カードが下のボタンの陰に隠れることがあるので、一覧の中で見える所まで送る
  await page.locator('.deck-grid-item [data-zoom]').first().evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(150);
  const box = await page.locator('.deck-grid-item [data-zoom]').first().boundingBox();
  assert.ok(box, 'zoom target has a bounding box');
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForSelector('dialog.card-zoom[open]');
}

async function closeZoom(page) {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.card-zoom')?.open);
}

async function scenario(name, fn) {
  try {
    await fn();
    results.push([name, 'PASS']);
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push([name, `FAIL: ${error.message.split('\n')[0]}`]);
    console.log(`FAIL ${name}\n  ${error.message.split('\n').slice(0, 4).join('\n  ')}`);
  }
}

// A. 390×797・?fx=full・レアリティごとに立体表示
for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special']) {
  await scenario(`A ${rarity}: 立体表示`, async () => {
    const { context, page } = await newPage({ label: `A-${rarity}` });
    try {
      await openDeck(page, 'full');
      await selectRarity(page, rarity);
      const summary = page.locator('.deck-summary');
      const countBefore = await summary.innerText();
      await longPress(page);
      await page.locator('.zoom-card.zoom-gl').waitFor({ timeout: 8000 });
      const card = page.locator('.zoom-card.zoom-3d');
      assert.equal(await card.locator('.zoom-edge').count(), 4, '連続した側面が四辺にある');
      const geometry = await card.evaluate(el => {
        const edge = el.querySelector('.zoom-edge-right');
        return {
          depth: parseFloat(getComputedStyle(edge).width),
          cardWidth: el.clientWidth,
          backZ: new DOMMatrix(getComputedStyle(el.querySelector('.zoom-back')).transform).m43,
          color: el.style.getPropertyValue('--card-edge-color'),
          edgePaint: getComputedStyle(edge).backgroundImage,
        };
      });
      const rarityData = await (await page.request.get(new URL('data/rarities.json', base).href)).json();
      assert.equal(geometry.color, rarityData[rarity].color);
      assert.ok(Math.abs(geometry.depth - geometry.cardWidth * UI_CONFIG.card3D.depth) < 0.1);
      assert.ok(Math.abs(geometry.depth + geometry.backZ) < 0.1, '側面と裏面の深さがそろう');
      if (rarity === 'special') assert.match(geometry.edgePaint, /rgb\(246, 139, 164\)/, '虹色の側面');
      assert.equal(await card.locator('.zoom-wall').count(), UI_CONFIG.card3D.wallLayers, 'zoom-wall count');
      assert.equal(await card.locator('.zoom-floor').count(), 1, 'zoom-floor count');
      assert.equal(await card.locator('.zoom-raised').count(), 1, 'zoom-raised count');
      assert.equal(await page.locator('.zoom-card canvas.zoom-gl-base').count(), 1, 'canvas.zoom-gl-base');
      assert.equal(await page.locator('.zoom-card canvas.zoom-gl-raised').count(), 1, 'canvas.zoom-gl-raised');
      const style = await card.evaluate(el => getComputedStyle(el).transformStyle);
      assert.equal(style, 'preserve-3d', 'transform-style');
      const dims = await page.locator('canvas.zoom-gl-base').evaluate(el => [el.width, el.height]);
      assert.ok(dims[0] > 0 && dims[1] > 0, `canvas size attrs ${dims}`);

      const stage = await page.locator('.zoom-stage').boundingBox();
      await page.mouse.move(stage.x + 2, stage.y + stage.height / 2);
      await page.waitForTimeout(500);
      const transform = await card.evaluate(el => el.style.transform);
      assert.ok(transform.includes('rotateY(-'), `inline transform after left-edge hover: ${transform}`);
      await page.locator('.zoom-stage').screenshot({ path: artifactPath(`card3d-${rarity}.png`) });

      assert.equal(await summary.innerText(), countBefore, 'deck summary changed by long press');
      await closeZoom(page);
      assert.equal(await page.locator('dialog.card-zoom').evaluate(el => el.open), false);
      assert.equal(await summary.innerText(), countBefore, 'deck summary changed after close');

      // 閉じたあと、同じカードをもう一度開ける
      await longPress(page);
      await page.locator('.zoom-card.zoom-gl').waitFor({ timeout: 8000 });
      await closeZoom(page);
    } finally {
      await context.close();
    }
  });
}

// B. ?fx=lite：WebGL を使わず、CSS の層だけで立体にする
await scenario('B legendary: fx=lite は CSS だけ', async () => {
  const { context, page } = await newPage({ label: 'B' });
  try {
    await openDeck(page, 'lite');
    await selectRarity(page, 'legendary');
    await longPress(page);
    await page.locator('.zoom-card.zoom-lite').waitFor();
    assert.equal(await page.locator('canvas.zoom-gl-base').count(), 0, 'canvas.zoom-gl-base should not exist');
    assert.ok(await page.locator('.zoom-raised').isVisible(), '.zoom-raised visible');
    await closeZoom(page);
  } finally {
    await context.close();
  }
});

// C. 動きを減らす設定：傾けない
await scenario('C legendary: reduced motion では傾かない', async () => {
  const { context, page } = await newPage({ reducedMotion: 'reduce', label: 'C' });
  try {
    await openDeck(page, 'full');
    await selectRarity(page, 'legendary');
    await longPress(page);
    await page.locator('.zoom-card').waitFor();
    const stage = await page.locator('.zoom-stage').boundingBox();
    await page.mouse.move(stage.x + 2, stage.y + stage.height / 2);
    await page.waitForTimeout(500);
    const transform = await page.locator('.zoom-card').evaluate(el => el.style.transform);
    assert.equal(await page.locator('.zoom-wall:visible').count(), UI_CONFIG.card3D.reducedWallLayers);
    assert.equal(await page.locator('.zoom-edge').count(), 4);
    assert.equal(await page.locator('canvas.zoom-gl-base').count(), 0);
    assert.ok(!transform.includes('rotate'), `transform should not rotate under reduced motion: "${transform}"`);
    await closeZoom(page);
  } finally {
    await context.close();
  }
});

// D. 画面の大きさごとに、閉じるボタンが見えて押せる
const VIEWPORTS = [[390, 797], [375, 667], [360, 640], [390, 664], [320, 568], [844, 390]];
for (const [width, height] of VIEWPORTS) {
  await scenario(`D legendary ${width}x${height}: 閉じるボタンが押せる`, async () => {
    const { context, page } = await newPage({ viewport: { width, height }, label: `D-${width}x${height}` });
    try {
      await openDeck(page, 'full');
      await selectRarity(page, 'legendary');
      await longPress(page);
      await page.locator('.zoom-card').waitFor();
      const assertFits = async () => {
        const layout = await page.locator('dialog.card-zoom').evaluate(dialog => {
          const card = dialog.querySelector('.zoom-card');
          const visible = [...card.children].filter(el => !el.hidden && getComputedStyle(el).visibility === 'visible');
          return {
            fits: dialog.scrollHeight <= dialog.clientHeight && dialog.scrollWidth <= dialog.clientWidth,
            boxes: visible.map(el => el.getBoundingClientRect().toJSON()),
          };
        });
        assert.ok(layout.fits, 'ダイアログにスクロールが不要');
        assert.ok(layout.boxes.every(({ top, left, bottom, right }) => top >= 0 && left >= 0 && bottom <= height && right <= width),
          '描画領域がビューポート内に収まる');
      };
      await assertFits();
      await dragOnStage(page, 65, 0);
      await assertFits();
      const close = await page.locator('.zoom-close').boundingBox();
      assert.ok(close.x >= 0 && close.y >= 0 && close.x + close.width <= width && close.y + close.height <= height,
        `close button outside viewport: ${JSON.stringify(close)}`);
      await page.locator('.zoom-close').click();
      await page.waitForFunction(() => !document.querySelector('dialog.card-zoom')?.open);
    } finally {
      await context.close();
    }
  });
}

// E. 読み込み中に閉じて、すぐ別のカードを開く
await scenario('E 読み込み中に閉じて、epic を開く', async () => {
  const { context, page } = await newPage({ label: 'E' });
  try {
    await openDeck(page, 'full');
    await selectRarity(page, 'legendary');
    await longPress(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.card-zoom')?.open);
    await selectRarity(page, 'epic');
    await longPress(page);
    await page.locator('.zoom-card.zoom-gl').waitFor({ timeout: 8000 });
    assert.equal(await page.locator('.zoom-card').getAttribute('data-rarity'), 'epic', 'opened card is epic');
    await closeZoom(page);
  } finally {
    await context.close();
  }
});

// F. 押してなぞると、どの向きにも360度回る。裏返すと裏の絵が出る。「正面に戻す」・ダブルタップで正面へ
async function dragOnStage(page, dx, dy) {
  const stage = await page.locator('.zoom-stage').boundingBox();
  const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + dx * i / 10, cy + dy * i / 10);
  await page.waitForTimeout(150); // 止まってから離す（勢いをつけない）
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const zoomState = (page) => page.evaluate(() => {
  const card = document.querySelector('.zoom-card');
  return { flipped: card.classList.contains('zoom-flipped'), transform: card.style.transform, reset: !document.querySelector('.zoom-reset').hidden, open: document.querySelector('dialog.card-zoom').open,
    foilX: card.style.getPropertyValue('--foil-x'),
    shade: card.style.getPropertyValue('--face-shade'),
    shadowScale: document.querySelector('.zoom-shadow').style.transform,
    shadowOpacity: document.querySelector('.zoom-shadow').style.opacity,
    edgeVisible: getComputedStyle(card.querySelector('.zoom-edge-left')).visibility,
    backVisible: getComputedStyle(card.querySelector('.zoom-back')).visibility, frameVisible: getComputedStyle(card.querySelector('.mini-card-frame') ?? card).visibility };
});
for (const [label, fx, reducedMotion] of [['full', 'full', 'no-preference'], ['lite', 'lite', 'no-preference'], ['reduced', 'full', 'reduce']]) {
  await scenario(`F legendary ${label}: なぞって360度回し、裏を見て、正面に戻す`, async () => {
    const { context, page } = await newPage({ reducedMotion, label: `F-${label}` });
    try {
      await openDeck(page, fx);
      await selectRarity(page, 'legendary');
      await longPress(page);
      await page.locator('.zoom-card .zoom-back').waitFor({ state: 'attached' });
      let s = await zoomState(page);
      assert.equal(s.flipped, false); assert.equal(s.reset, false);
      const faceOn = s;
      await dragOnStage(page, 60, 0); // 少し右へ：表のまま右を向く
      s = await zoomState(page);
      assert.match(s.transform, /rotate3d\(0, 1, 0, [0-9.]+deg\)/, `右になぞると縦の軸で回る: ${s.transform}`);
      assert.equal(s.flipped, false); assert.equal(s.reset, true);
      assert.equal(s.open, true, 'なぞって外で離しても閉じない');
      assert.notEqual(s.foilX, faceOn.foilX, 'クォータニオンで偏光が動く');
      assert.notEqual(s.shadowScale, faceOn.shadowScale, '落ち影の形が変わる');
      assert.notEqual(s.shadowOpacity, faceOn.shadowOpacity, '落ち影の濃さが変わる');
      await dragOnStage(page, 160, 0); // さらに右へ：裏返る
      s = await zoomState(page);
      assert.equal(s.flipped, true, `裏返る: ${s.transform}`);
      assert.equal(s.backVisible, 'visible'); assert.equal(s.frameVisible, 'hidden');
      assert.equal(s.edgeVisible, 'visible');
      const backOn = s;
      await page.locator('.zoom-stage').screenshot({ path: artifactPath(`card360-back-${label}.png`) });
      await dragOnStage(page, 0, 140); // 縦にも回る
      s = await zoomState(page);
      assert.notEqual(s.shade, backOn.shade, '裏面の陰影が変わる');
      assert.notEqual(s.foilX, backOn.foilX, '裏面の偏光が動く');
      assert.ok(!/rotate3d\(0, 1, 0,/.test(s.transform), `縦になぞると別の軸でも回る: ${s.transform}`);
      await page.locator('.zoom-reset').click();
      await page.waitForFunction(() => !/rotate3d/.test(document.querySelector('.zoom-card').style.transform), null, { timeout: 4000 });
      s = await zoomState(page);
      assert.equal(s.flipped, false); assert.equal(s.reset, false);
      // ダブルタップでも正面へ
      await dragOnStage(page, -200, 0);
      assert.equal((await zoomState(page)).flipped, true);
      await page.locator('.zoom-stage').dblclick();
      await page.waitForFunction(() => !document.querySelector('.zoom-card').classList.contains('zoom-flipped') && !/rotate3d/.test(document.querySelector('.zoom-card').style.transform), null, { timeout: 4000 });
      await closeZoom(page);
    } finally {
      await context.close();
    }
  });
}

await browser.close();

console.log('\n--- summary ---');
for (const [name, status] of results) console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'} ${name}${status === 'PASS' ? '' : ' -- ' + status.slice(6)}`);
const failed = results.filter(([, status]) => status !== 'PASS').length;
console.log(`scenarios: ${results.length - failed} passed, ${failed} failed`);
if (errors.length) {
  console.log(`page errors (${errors.length}):`);
  for (const message of errors) console.log('  ' + message);
}
if (failed || errors.length) process.exitCode = 1;
