import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { RANK_IDS, rankSkinFront, rankSkinBack, skinArt, skinRaised } from '../js/ui/skinArt.js';

const file = (path) => new URL(`../${path}`, import.meta.url);
const ranks = JSON.parse(readFileSync(file('data/ranks.json'), 'utf8')).tiers.map((t) => t.id);

test('ランク報酬の見た目は、ranks.json のランクと同じ並び', () => {
  assert.deepEqual(RANK_IDS, ranks);
});

test('どのランクも、カードの表・裏・凹凸・エンブレム・アイコンフレームの画像がある', () => {
  for (const rank of RANK_IDS) {
    const front = rankSkinFront(rank);
    assert.equal(front, `cards/frame-skin-${rank}.png`);
    const back = rankSkinBack(rank);
    const paths = [
      `assets/${front}`, `assets/cards/relief/frame-skin-${rank}-relief.png`, `assets/cards/relief/frame-skin-${rank}-raised.png`,
      back.art, back.raised, `assets/ranks/rank-${rank}.png`, `assets/frames/rank-frame-${rank}.png`,
    ];
    for (const path of paths) assert.ok(existsSync(file(path)), `${path} がありません`);
  }
});

test('知らないランクのスキンは出さない', () => {
  assert.equal(rankSkinFront('radiant'), null);
  assert.equal(rankSkinBack('radiant'), null);
});

test('ショップのカード裏（back_rank_*）は、絵と浮かせる地図につながる', () => {
  for (const rank of RANK_IDS) {
    assert.equal(skinArt(`back_rank_${rank}`), `assets/skins/back-rank-${rank}.png`);
    assert.equal(skinRaised(`back_rank_${rank}`), `assets/skins/back-rank-${rank}-raised.png`);
  }
  assert.equal(skinArt('back_gold'), 'assets/skins/back-gold.png');
});
