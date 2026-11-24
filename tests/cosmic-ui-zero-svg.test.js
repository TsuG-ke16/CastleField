import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeIcon } from '../js/ui/HomeIcons.js';
import { rankEmblem } from '../js/ui/RankEmblem.js';
import { impactArt } from '../js/ui/motion.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('zero inline SVG or data:image/svg remains across HTML, CSS, and UI JS', () => {
  const targets = [
    path.join(ROOT, 'index.html'),
    path.join(ROOT, 'manifest.webmanifest'),
    ...fs.readdirSync(path.join(ROOT, 'css')).filter((f) => f.endsWith('.css')).map((f) => path.join(ROOT, 'css', f)),
    ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'js', f)),
    ...fs.readdirSync(path.join(ROOT, 'js', 'ui')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'js', 'ui', f)),
  ];
  const forbidden = /<svg\b|data:image\/svg|2000\/svg|createElementNS\([^)]*svg/i;
  const hits = [];
  for (const file of targets) {
    const content = fs.readFileSync(file, 'utf8');
    if (forbidden.test(content)) hits.push(path.relative(ROOT, file));
  }
  assert.deepEqual(hits, [], `Unexpected SVG usage found in: ${hits.join(', ')}`);
});

test('homeIcon, rankEmblem(null), and impactArt output raster img tags backed by existing <=300KB WebP files', () => {
  const ids = [
    'profile', 'deck', 'rank', 'gacha', 'settings', 'catalog', 'help', 'more',
    'arrow', 'down', 'close', 'check', 'solo', 'online', 'local', 'ranking',
    'mission', 'friend', 'shop', 'skin', 'notice', 'edit', 'crown', 'rates',
    'return', 'surrender',
  ];
  for (const id of ids) {
    const html = homeIcon(id, 24);
    assert.match(html, /^<img\b/, `homeIcon(${id}) should render <img>`);
    assert.ok(!html.includes('<svg'), `homeIcon(${id}) must not contain <svg>`);
    const m = html.match(/src="(assets\/ui\/cosmic\/[^"]+\.webp)"/);
    assert.ok(m, `homeIcon(${id}) should reference assets/ui/cosmic/*.webp`);
    const abs = path.join(ROOT, m[1]);
    assert.ok(fs.existsSync(abs), `Missing asset: ${m[1]}`);
    assert.ok(fs.statSync(abs).size <= 300 * 1024, `Asset exceeds 300KB: ${m[1]}`);
  }

  const unranked = rankEmblem(null, 48);
  assert.ok(!unranked.includes('<svg'), 'rankEmblem(null) must not render <svg>');
  assert.match(unranked, /assets\/ui\/cosmic\/rank-unranked\.webp/);
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/ui/cosmic/rank-unranked.webp')));

  for (const style of ['slash', 'thrust', 'claw', 'star', 'cross']) {
    const html = impactArt(style);
    assert.match(html, /^<img\b/);
    assert.ok(!html.includes('<svg'));
    const m = html.match(/src="(assets\/ui\/cosmic\/[^"]+\.webp)"/);
    assert.ok(m && fs.existsSync(path.join(ROOT, m[1])), `Missing impact asset for ${style}`);
  }
});
