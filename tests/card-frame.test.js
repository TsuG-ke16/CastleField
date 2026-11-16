import test from 'node:test';
import assert from 'node:assert/strict';
import { frameAsset, kindIcon, rarityMark } from '../js/ui/cardFrame.js';
const rarities = Object.fromEntries(['common','uncommon','rare','epic','legendary'].map(x=>[x,{color:'#abc'}]));
test('rarity frames replace type frames for every kind', () => {
 for(const rarity of Object.keys(rarities)) for(const kind of ['soldier','spell','weapon','defense']) {
  assert.equal(frameAsset({kind,rarity},rarities),`cards/frame-${rarity}.png`);
 }
});
test('cards without a known rarity retain type-frame fallback', () => {
 for(const kind of ['soldier','spell','weapon','defense']) assert.equal(frameAsset({kind},rarities),`cards/frame-${kind}.png`);
 assert.equal(frameAsset({kind:'special'},rarities),null);
 assert.equal(frameAsset({kind:'soldier',rarity:'future'},rarities),'cards/frame-soldier.png');
});
test('kind and rarity identifiers resolve to symbols', () => {
 assert.equal(kindIcon('defense'),'shield');
 assert.equal(rarityMark('legendary'),'♛');
});
