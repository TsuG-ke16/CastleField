// node ui-tests/home-ruleset.js — UIのモード読込とURL移動。ゲームルールは変更しない。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadHomeRuleSet, rulesetUrl } from '../js/ui/HomeRuleSet.js';
const load=async(path)=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const normal=await loadHomeRuleSet('kingdom',load), factions=await loadHomeRuleSet('factions',load),classic=await loadHomeRuleSet('classic',load);
assert.ok(normal.cards.infantry);assert.equal(normal.entry,null);
assert.equal(Object.keys(factions.decks).length,4);assert.equal(factions.entry.useRarities,false);
for(const [id,deck] of Object.entries(factions.decks)){
  assert.ok(Object.keys(deck.cards).length>0);
  for(const [card,count] of Object.entries(deck.cards)) { assert.ok(card.startsWith('fac_'));assert.ok(factions.cards[card]);assert.ok(count>0); }
  assert.equal(deck.name,factions.factions[id].name);
}
assert.ok(factions.elements);assert.ok(factions.reactions);assert.equal(factions.rules.deckMode,'own');assert.equal(classic.entry.useRarities,false);
await assert.rejects(()=>loadHomeRuleSet('unknown',load));
const url=new URL(rulesetUrl('https://game.test/?debug=1&field3d=2d&seed=8&cpu=hard&local=1&pass=private','factions'));
assert.equal(url.searchParams.get('mode'),'factions');assert.equal(url.searchParams.get('home'),'1');assert.equal(url.searchParams.get('field3d'),'2d');assert.equal(url.searchParams.get('debug'),'1');
for(const key of ['seed','cpu','local','pass'])assert.equal(url.searchParams.has(key),false);
assert.equal(new URL(rulesetUrl(url.href,'kingdom')).searchParams.has('mode'),false);
assert.throws(()=>rulesetUrl(url.href,'unknown'));
console.log('通常・4陣営・旧クラシックの読込、固定デッキとURL切替 OK');
