// 通常対戦の3D盤面テスト。実行: node ui-tests/field-3d.js（環境にある Playwright を使う。smoke.js と同じ）
// 確かめること：6ステージが3Dで読める／踏み石15マスの当たり判定が3Dの絵と一致（カメラ回転後も）／
//   3D→2Dに戻したとき兵士・魔物・踏み石のインラインスタイルが消える／コンソールエラーなし
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8000/';
const STAGES = ['meadow', 'lava', 'ice', 'ruins', 'darkForest', 'desert'];
let server;
const up = async () => { try { return (await fetch(base, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; } };
if (!(await up())) {
  server = spawn('python3', ['-m', 'http.server', '8000', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const stage of STAGES) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    page.on('pageerror', (e) => errors.push(`${stage}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|api\//.test(m.text())) errors.push(`${stage}: ${m.text()}`); });
    await page.goto(`${base}?local=1&cpu=easy&debug=1&stage=${stage}`);
    await page.waitForFunction(() => document.querySelector('#app')?.dataset.stage3d === '1', null, { timeout: 30000 });
    const result = await page.evaluate(async () => {
      const rr = window.castlefield.renderer();
      const fg = rr.fieldGL;
      const worst = () => {
        rr.update3DOverlay();
        let max = 0;
        for (const c of document.querySelectorAll('#road .cell')) {
          const w = fg.cellWorldPos(+c.dataset.lane, +c.dataset.row);
          const p = fg.projectWorldToScreen({ x: w.x, y: 0.05, z: w.z });
          const b = c.getBoundingClientRect();
          max = Math.max(max, Math.hypot(b.left + b.width / 2 - p.screenX, b.top + b.height / 2 - p.screenY));
        }
        return max;
      };
      const front = worst();
      fg.orbitBy(0.6, 0.1);
      for (let i = 0; i < 30; i++) fg.renderFrame(performance.now() + i * 16);
      const rotated = worst();
      fg.setHidden(true);
      const styled = [...document.querySelectorAll('#road .cell')].filter((c) => c.getAttribute('style') || c.dataset.proj3d).length;
      const units = [...rr.soldiers.values(), ...rr.monsters.values()].filter((u) => u.el.dataset.proj3d || /px/.test(u.el.style.top)).length;
      fg.setHidden(false);
      return { front, rotated, styled, units, cells: document.querySelectorAll('#road .cell').length };
    });
    assert.equal(result.cells, 15, `${stage}: 踏み石は3レーン×5マス`);
    assert.ok(result.front < 1.5 && result.rotated < 1.5, `${stage}: 踏み石のずれ ${JSON.stringify(result)}`);
    assert.equal(result.styled, 0, `${stage}: 2D復帰で踏み石のスタイルが残っている`);
    assert.equal(result.units, 0, `${stage}: 2D復帰で兵士・魔物の3D配置が残っている`);
    await page.context().close();
  }
  // ?field3d=2d では 3D を使わない
  const page2d = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page2d.goto(`${base}?local=1&cpu=easy&debug=1&field3d=2d`);
  await page2d.waitForTimeout(2500);
  assert.equal(await page2d.evaluate(() => document.querySelector('#app').dataset.stage3d ?? null), null, '2D指定で3Dが出ている');
  assert.deepEqual(errors, [], `コンソールエラー: ${errors.join('\n')}`);
  console.log('field-3d: OK（6ステージ・踏み石の一致・2D復帰・2D指定）');
} finally {
  await browser.close();
  server?.kill();
}
