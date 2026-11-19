import test from 'node:test';
import assert from 'node:assert/strict';
import { frameAsset, kindIcon, rarityMark } from '../js/ui/cardFrame.js';
const rarities = Object.fromEntries(['common','uncommon','rare','epic','legendary'].map(x=>[x,{color:'#abc'}]));
test('rarity frames replace type frames for every kind', () => {
 for(const rarity of Object.keys(rarities)) for(const kind of ['soldier','spell','weapon','defense']) {
  assert.equal(frameAsset({kind,rarity},rarities),`cards/frame-${rarity}.png`);
 }
});
test('cards without a known rarity have no frame', () => {
 for(const kind of ['soldier','spell','weapon','defense']) assert.equal(frameAsset({kind},rarities),null);
 assert.equal(frameAsset({kind:'soldier',rarity:'future'},rarities),null);
});
test('kind and rarity identifiers resolve to symbols', () => {
 assert.equal(kindIcon('defense'),'shield');
 assert.equal(rarityMark('legendary'),'♛');
});

test('ランクカードを装備すると、表の枠もそのランクになる（魔物の駒は魔物の枠のまま）', async () => {
  const { setCardSkin } = await import('../js/ui/cardFrame.js');
  setCardSkin('gold');
  try {
    assert.equal(frameAsset({ kind: 'soldier', rarity: 'legendary' }, rarities), 'cards/frame-skin-gold.png');
    assert.equal(frameAsset({ kind: 'soldier', monster: 'slime', rarity: 'rare' }, rarities), 'cards/frame-beast.png');
    assert.equal(frameAsset({ kind: 'soldier', rarity: 'legendary' }, rarities, null), 'cards/frame-legendary.png');
    setCardSkin('radiant');
    assert.equal(frameAsset({ kind: 'soldier', rarity: 'rare' }, rarities), 'cards/frame-rare.png');
  } finally { setCardSkin(null); }
});
