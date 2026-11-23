// 4陣営専用3Dカードフレーム（GLB・優先順位・フォールバック）の検証テスト
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FACTION_IDS, factionFromCard, factionFrameFront, factionFrameBack, frameAsset } from '../js/ui/cardFrame.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseGlbJson(filePath) {
  const buf = readFileSync(filePath);
  assert.equal(buf.toString('ascii', 0, 4), 'glTF', `${filePath} は有効な GLB ヘッダを持つ`);
  assert.equal(buf.readUInt32LE(4), 2, `${filePath} は glTF 2.0`);
  const chunkLen = buf.readUInt32LE(12);
  assert.equal(buf.toString('ascii', 16, 20), 'JSON', `${filePath} の先頭チャンクは JSON`);
  return JSON.parse(buf.toString('utf8', 20, 20 + chunkLen));
}

test('4陣営すべての専用3Dモデル（GLB）が存在し、固有マテリアルとUVパネルを持つ', () => {
  const expectedMaterials = {
    kingdom: ['face', 'cobalt_enamel', 'gold', 'silver', 'sapphire_gem'],
    forest: ['face', 'wood_bark', 'leaf_green', 'brass', 'amber_gem'],
    demon: ['face', 'dark_iron', 'obsidian', 'bone_ivory', 'amethyst_gem'],
    dragon: ['face', 'dragonsteel', 'bronze', 'crimson_enamel', 'ruby_gem'],
  };
  for (const faction of FACTION_IDS) {
    const glbPath = join(REPO, `assets/models/card-faction-${faction}.glb`);
    const gltf = parseGlbJson(glbPath);
    const matNames = new Set((gltf.materials ?? []).map((m) => m.name.replace(/\.\d+$/, '')));
    for (const req of expectedMaterials[faction]) {
      assert.ok(matNames.has(req), `${faction} の GLB にマテリアル ${req} が含まれる`);
    }
    assert.ok((gltf.meshes?.length ?? 0) >= 60, `${faction} の GLB は十分な立体造形パーツを持つ (${gltf.meshes?.length})`);
  }
});

test('フレーム優先順位：魔物 > 4陣営 > ランクスキン > レアリティ（既存機能を破壊しない）', () => {
  const rarities = {
    common: { name: 'コモン', color: '#9aa3ad' },
    rare: { name: 'レア', color: '#3b82f6' },
    legendary: { name: 'レジェンド', color: '#f59e0b' },
    special: { name: 'スペシャル', color: '#c084fc' },
  };
  // 1. 魔物は常に魔物枠（陣営IDやスキンがあっても魔物優先）
  assert.equal(frameAsset({ monster: 'dragon', faction: 'dragon' }, rarities, 'champion', 'fac_dragon_x'), 'cards/frame-beast.png');

  // 2. 4陣営カードは rarities=null（4陣営モード）やランクスキン装備中でも陣営専用枠を返す
  assert.equal(factionFromCard('fac_king_infantry', {}), 'kingdom');
  assert.equal(factionFromCard('fac_forest_archer', {}), 'forest');
  assert.equal(factionFromCard('fac_demon_skeleton', {}), 'demon');
  assert.equal(factionFromCard('fac_dragon_flame_breath', {}), 'dragon');
  assert.equal(frameAsset({ name: '骸骨兵' }, null, 'champion', 'fac_demon_skeleton'), 'cards/frame-faction-demon.png');
  assert.equal(frameAsset({ name: '王都歩兵', faction: 'kingdom' }, null, 'platinum'), 'cards/frame-faction-kingdom.png');

  // 3. 通常モードのカードはランクスキン・レアリティを従来通り返す
  assert.equal(frameAsset({ rarity: 'rare' }, rarities, 'diamond', 'infantry'), 'cards/frame-skin-diamond.png');
  assert.equal(frameAsset({ rarity: 'legendary' }, rarities, null, 'hero'), 'cards/frame-legendary.png');
  assert.equal(frameAsset({ rarity: 'special' }, rarities, null, 'adapt'), 'cards/frame-special.png');

  // 4. 裏面パス
  for (const faction of FACTION_IDS) {
    assert.equal(factionFrameFront(faction), `cards/frame-faction-${faction}.png`);
    assert.equal(factionFrameBack(faction), `assets/skins/back-faction-${faction}.png`);
  }
});

test('4陣営の3Dモデルの表の絵（face の UV）は上下が正しい（glTF の V は上が0：イラストは上半分・名前と説明は下）', () => {
  const vRange = (buf, gltf, binStart, index) => {
    const acc = gltf.accessors[index];
    const view = gltf.bufferViews[acc.bufferView];
    const stride = view.byteStride ?? 8;
    const base = binStart + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < acc.count; i++) { const v = buf.readFloatLE(base + i * stride + 4); min = Math.min(min, v); max = Math.max(max, v); }
    return (min + max) / 2;
  };
  for (const faction of FACTION_IDS) {
    const glbPath = join(REPO, `assets/models/card-faction-${faction}.glb`);
    const buf = readFileSync(glbPath);
    const gltf = parseGlbJson(glbPath);
    const binStart = 20 + buf.readUInt32LE(12) + 8;
    const center = {};
    for (const mesh of gltf.meshes) {
      for (const prim of mesh.primitives) {
        if (gltf.materials[prim.material]?.name !== 'face') continue;
        const part = mesh.name.split('-face-')[1];
        if (part) center[part] = vRange(buf, gltf, binStart, prim.attributes.TEXCOORD_0);
      }
    }
    assert.ok(center.illu < 0.5, `${faction}：イラストは上半分（V の中心 ${center.illu}）`);
    assert.ok(center.name > center.illu && center.desc > center.name, `${faction}：イラスト → 名前 → 説明の順に下へ`);
  }
});
