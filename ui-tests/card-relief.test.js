// カードの枠の凹凸マップ（assets/cards/relief/）の検査。node --test ui-tests/card-relief.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { decodePng } from '../js/ui/build-card-relief.js';

const CARDS = new URL('../assets/cards/', import.meta.url);
// 元の枠は、どの枠も最大のアルファが約253（完全な255はない）。「不透明」は 200 より大きいところとする
const OPAQUE = 200;
const RELIEF = new URL('../assets/cards/relief/', import.meta.url);
const NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special', 'soldier', 'spell', 'weapon', 'defense', 'beast'];

const load = (dir, file) => decodePng(readFileSync(new URL(file, dir)));

for (const name of NAMES) {
  test(`${name}: 凹凸マップと浮き上がりマップがある`, () => {
    assert.doesNotThrow(() => readFileSync(new URL(`frame-${name}-relief.png`, RELIEF)));
    assert.doesNotThrow(() => readFileSync(new URL(`frame-${name}-raised.png`, RELIEF)));
  });

  test(`${name}: 大きさが元の枠と合う`, () => {
    const frame = load(CARDS, `frame-${name}.png`);
    const relief = load(RELIEF, `frame-${name}-relief.png`);
    const raised = load(RELIEF, `frame-${name}-raised.png`);
    assert.equal(relief.width, frame.width);
    assert.equal(relief.height, frame.height * 2);
    assert.equal(raised.width, frame.width);
    assert.equal(raised.height, frame.height);
  });

  test(`${name}: 枠の外は平ら・下半分は0・浮き上がりは透明`, () => {
    const frame = load(CARDS, `frame-${name}.png`);
    const relief = load(RELIEF, `frame-${name}-relief.png`);
    const raised = load(RELIEF, `frame-${name}-raised.png`);
    const W = frame.width, H = frame.height;
    const fd = frame.data, rd = relief.data, sd = raised.data;
    const RW = relief.width;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (fd[i * 4 + 3] !== 0) continue;
        const top = i * 4;
        const topRow = (y * RW + x) * 4;
        assert.equal(rd[topRow + 2], 0, `top blue at (${x},${y}) of ${name}`);
        assert.ok(Math.abs(rd[topRow] - 128) <= 1, `top R at (${x},${y}) of ${name}: ${rd[topRow]}`);
        assert.ok(Math.abs(rd[topRow + 1] - 128) <= 1, `top G at (${x},${y}) of ${name}: ${rd[topRow + 1]}`);
        const bottomRow = ((y + H) * RW + x) * 4;
        assert.equal(rd[bottomRow], 0, `bottom R at (${x},${y}) of ${name}`);
        assert.equal(rd[bottomRow + 1], 0, `bottom G at (${x},${y}) of ${name}`);
        assert.equal(rd[bottomRow + 2], 0, `bottom B at (${x},${y}) of ${name}`);
        assert.equal(sd[top + 3], 0, `raised alpha at (${x},${y}) of ${name}`);
      }
    }
  });

  test(`${name}: 高さが明るさと相関しすぎない`, () => {
    const frame = load(CARDS, `frame-${name}.png`);
    const relief = load(RELIEF, `frame-${name}-relief.png`);
    const W = frame.width, H = frame.height, RW = relief.width;
    const fd = frame.data, rd = relief.data;
    let n = 0, sumL = 0, sumH = 0, sumLL = 0, sumHH = 0, sumLH = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (fd[i * 4 + 3] <= OPAQUE) continue;
        const L = 0.299 * fd[i * 4] + 0.587 * fd[i * 4 + 1] + 0.114 * fd[i * 4 + 2];
        const h = rd[(y * RW + x) * 4 + 2];
        n++; sumL += L; sumH += h; sumLL += L * L; sumHH += h * h; sumLH += L * h;
      }
    }
    assert.ok(n > 0, `${name} has opaque pixels`);
    const cov = sumLH / n - (sumL / n) * (sumH / n);
    const varL = sumLL / n - (sumL / n) ** 2;
    const varH = sumHH / n - (sumH / n) ** 2;
    const r = varL > 0 && varH > 0 ? cov / Math.sqrt(varL * varH) : 0;
    assert.ok(Math.abs(r) < 0.6, `${name}: |correlation(luminance, height)| = ${r.toFixed(3)}`);
  });

  test(`${name}: 凹凸がある・浮き上がり部品がある`, () => {
    const frame = load(CARDS, `frame-${name}.png`);
    const relief = load(RELIEF, `frame-${name}-relief.png`);
    const raised = load(RELIEF, `frame-${name}-raised.png`);
    const W = frame.width, H = frame.height, RW = relief.width;
    let withHeight = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (frame.data[i * 4 + 3] <= OPAQUE) continue;
        if (relief.data[(y * RW + x) * 4 + 2] > 0) withHeight++;
      }
    }
    assert.ok(withHeight > 0, `${name} has opaque pixels with height > 0`);
    if (name !== 'beast') {
      let raisedCount = 0;
      for (let i = 0; i < W * H; i++) if (raised.data[i * 4 + 3] > 200) raisedCount++;
      assert.ok(raisedCount > 0, `${name} has raised pixels (alpha > 200)`);
    }
  });
}

test('decodePng は壊れたPNGで例外を投げる', () => {
  assert.throws(() => decodePng(Buffer.from('not a png')));
});

test('relief の各ファイルには元の枠がある（余分なマップがない）', () => {
  const sources = new Set(readdirSync(CARDS).filter(file => /^frame-.*\.png$/.test(file)).map(file => file.replace(/\.png$/, '')));
  const reliefFiles = readdirSync(RELIEF).filter(file => /^frame-.*-(relief|raised)\.png$/.test(file));
  assert.ok(reliefFiles.length > 0);
  for (const file of reliefFiles) {
    const base = `frame-${file.replace(/^frame-/, '').replace(/-(relief|raised)\.png$/, '')}`;
    assert.ok(sources.has(base), `orphan relief map ${file} (no source ${base}.png)`);
  }
});
