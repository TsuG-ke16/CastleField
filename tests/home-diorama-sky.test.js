import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_SKY_MODES, HOME_SKY_LABELS, resolveSkyPhase, cosmicImagePath } from '../js/ui/HomeDioramaGL.js';

test('HOME_SKY_MODES に自動と4時間帯がすべて揃っている', () => {
  assert.deepEqual(HOME_SKY_MODES, ['auto', 'dawn', 'day', 'dusk', 'night']);
  for (const mode of HOME_SKY_MODES) {
    assert.ok(typeof HOME_SKY_LABELS[mode] === 'string' && HOME_SKY_LABELS[mode].length > 0);
  }
});

test('手動プリセット指定時は時刻に関係なく該当フェーズを返す', () => {
  const midnight = new Date(2026, 10, 23, 0, 0, 0);
  const noon = new Date(2026, 10, 23, 12, 0, 0);
  for (const mode of ['dawn', 'day', 'dusk', 'night']) {
    const a = resolveSkyPhase(mode, midnight);
    const b = resolveSkyPhase(mode, noon);
    assert.equal(a.key, mode);
    assert.equal(b.key, mode);
    assert.equal(a.zenith, b.zenith);
    assert.equal(a.emissiveScale, b.emissiveScale);
  }
});

test('auto モードは現在時刻に応じて4時間帯へ滑らかに切り替わる', () => {
  const dawn = resolveSkyPhase('auto', new Date(2026, 10, 23, 7, 30, 0));
  const day = resolveSkyPhase('auto', new Date(2026, 10, 23, 13, 0, 0));
  const dusk = resolveSkyPhase('auto', new Date(2026, 10, 23, 18, 0, 0));
  const night = resolveSkyPhase('auto', new Date(2026, 10, 23, 23, 0, 0));

  assert.equal(dawn.key, 'dawn');
  assert.equal(day.key, 'day');
  assert.equal(dusk.key, 'dusk');
  assert.equal(night.key, 'night');

  // 夜は昼より星が見えやすく、城の発光強度が強い
  assert.ok(night.starVisibility > day.starVisibility);
  assert.ok(night.emissiveScale > day.emissiveScale);
  assert.ok(dusk.emissiveScale > day.emissiveScale);

  // 境界時刻（16:30）は昼と黄昏の中間値へ連続補間される
  const transition = resolveSkyPhase('auto', new Date(2026, 10, 23, 16, 30, 0));
  assert.ok(transition.emissiveScale > day.emissiveScale && transition.emissiveScale < dusk.emissiveScale);
});

test('cosmicImagePath が時間帯・モード・陣営ごとのWebPパスを正しく返す', () => {
  assert.equal(cosmicImagePath('night', 'overview', 'kingdom'), 'assets/models/diorama/cosmic_home/night_overview.webp');
  assert.equal(cosmicImagePath('dusk', 'factions', 'dragon'), 'assets/models/diorama/cosmic_home/dusk_dragon.webp');
  assert.equal(cosmicImagePath('dawn', 'factions', 'forest'), 'assets/models/diorama/cosmic_home/dawn_forest.webp');
  assert.equal(cosmicImagePath('unknown', 'factions', 'unknown'), 'assets/models/diorama/cosmic_home/night_overview.webp');
});
