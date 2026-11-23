// クラシックの「森の同盟」「竜族帝国」のカード表（data/classic/factions/*.json）のテスト：
//   (1) クラシックの山札（data/classic/cards.json）は80枚のままで、陣営のカードは混ざらない
//   (2) 陣営のカードは王国・魔族と同じ書き方（classic_<陣営>_ のキー・count と mpCost・レアリティなし）で、new Game() の検証を通る
//   (3) 1枚ずつ出して、効果のイベントが出る
//   (4) ほかのカードと、効果が完全に同じカードがない（名前・説明・枚数だけ違うカードを作らない）
//   (5) 陣営ごとの山札（deckMode "own"）で試合が最後まで動く
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { buildData, loadFactionCards, loadOptionalData, seededRng, recordEvents, PLAIN_START } from './helpers.js';
import { runMatch } from './sim/sim.js';

const FACTIONS = ['forest', 'dragon'];
// 決まった並びで動かすため、魔物・天候・夜は出さない（属性の表と反応だけ渡す）
const QUIET = { ...PLAIN_START, monsterSpawnChance: 0, weatherChangeChance: 0, nightChance: 0 };

test('クラシックの山札は80枚のまま。陣営のカードは buildData({ factions }) のときだけ入る', () => {
  const { cards } = buildData({ mode: 'classic' });
  assert.equal(Object.values(cards).reduce((n, c) => n + c.count, 0), 80);
  assert.equal(Object.keys(cards).filter((k) => /^classic_(forest|dragon)_/.test(k)).length, 0);
  const all = buildData({ mode: 'classic', factions: FACTIONS }).cards;
  for (const f of FACTIONS) for (const k of Object.keys(loadFactionCards('classic', f))) assert.ok(all[k], k);
  assert.throws(() => loadFactionCards('classic', 'nothing'), /factionCardSets/);
  assert.throws(() => loadFactionCards(null, 'forest'), /factionCardSets/);
});

test('陣営のカードは王国・魔族と同じ書き方で、1陣営40枚', () => {
  const { elements } = loadOptionalData('classic');
  for (const f of FACTIONS) {
    const cards = loadFactionCards('classic', f);
    assert.equal(Object.values(cards).reduce((n, c) => n + c.count, 0), 40, f);
    for (const [k, c] of Object.entries(cards)) {
      assert.ok(k.startsWith(`classic_${f}_`), k);
      for (const key of ['rarity', 'fuseTo', 'weight', 'faction']) assert.equal(c[key], undefined, `${k}.${key}`);
      assert.ok(Number.isInteger(c.count) && c.count > 0, `${k}.count`);
      assert.ok(Number.isInteger(c.mpCost) && c.mpCost >= 0, `${k}.mpCost`);
      assert.equal(typeof c.name, 'string');
      if (c.element) assert.ok(elements.elements[c.element], `${k}.element ${c.element}`);
    }
  }
});

test('陣営のカードを全部入れても new Game() の検証を通る', () => {
  const { cards, rules } = buildData({ mode: 'classic', factions: FACTIONS });
  const game = new Game({ cards, rules, ...loadOptionalData('classic'), rng: seededRng(3) });
  game.start();
  assert.notEqual(game.getState(null).phase, 'gameOver');
});

/** 効果を見るイベント（カードの種類ごと） */
function expectedEvent(def) {
  if (def.kind === 'soldier') return (e) => e.event === 'soldierDeployed';
  if (def.kind === 'weapon') return (e) => e.event === 'weaponEquipped';
  switch (def.effect) {
    case 'shieldSoldier': return (e) => e.event === 'shieldAdded';
    case 'armorCastle': return (e) => e.event === 'castleArmored';
    case 'summonSpirit': return (e) => e.event === 'spiritSummoned' && e.spirit === def.spirit;
    case 'pushBackEnemySoldiers': return (e) => e.event === 'soldierMoved' && e.cause === 'pushed';
    case 'damageEnemySoldiers': return (e) => e.event === 'soldierDamaged' && e.cause === 'spell';
    // 城への魔法は、選んだレーンに相手の兵士がいれば先頭の兵士に、いなければ城に当たる
    case 'damageEnemyCastle': return (e) => (e.event === 'soldierDamaged' && e.cause === 'spell') || (e.event === 'castleDamaged' && e.source?.kind === 'spell');
    default: throw new Error(`テストにない効果: ${def.effect}`);
  }
}

/** p1 の兵士が道の上に1体、p2 の兵士が城の前より前に1体いる、p1 の番 */
function boardGame() {
  const { cards, rules } = buildData({ mode: 'classic', factions: FACTIONS });
  const { elements, reactions } = loadOptionalData('classic');
  const game = new Game({ cards, rules: { ...rules, ...QUIET }, elements, reactions, rng: seededRng(5) });
  const handIds = (pid) => game.players[pid].hand.map((c) => c.cardId);
  game.start();
  game.players.p1.mp = 20;
  game.debugSetHand('p1', ['classic_king_heavy']);
  const p1Lane = game.getTargets(handIds('p1')[0])[0];
  assert.equal(game.playCard(handIds('p1')[0], p1Lane).ok, true);
  game.endTurn();
  game.players.p2.mp = 20;
  game.debugSetHand('p2', ['classic_demon_skeleton']);
  const p2Targets = game.getTargets(handIds('p2')[0]);
  assert.equal(game.playCard(handIds('p2')[0], p2Targets[p2Targets.length - 1]).ok, true); // p1 の兵士とは別のレーン
  game.debugSetHand('p2', []);
  game.endTurn(); // p1 の番
  game.debugSetHand('p1', []);
  game.endTurn(); // p2 の番：骸骨兵が進む
  game.debugSetHand('p2', []);
  game.endTurn(); // p1 の番
  const st = game.getState(null);
  assert.ok(st.players.p1.soldiers.length >= 1, 'p1 の兵士がいる');
  assert.ok(st.players.p2.soldiers.some((s) => s.position > 0), 'p2 の兵士が城の前より前にいる');
  return { game, cards, handIds };
}

for (const f of FACTIONS) {
  for (const [type, def] of Object.entries(loadFactionCards('classic', f))) {
    test(`${def.name}（${type}）を出すと効果が出る`, () => {
      const { game, handIds } = boardGame();
      const log = recordEvents(game, EVENT_TYPES);
      game.players.p1.mp = 20;
      game.debugSetHand('p1', [type]);
      const cardId = handIds('p1')[0];
      const targets = game.getTargets(cardId);
      assert.ok(targets.length > 0, `${type} の対象がある`);
      const res = game.playCard(cardId, targets[targets.length - 1]);
      assert.equal(res.ok, true, res.reason);
      if (game.getState(null).phase === 'defend') game.passDefense();
      assert.ok(log.some(expectedEvent(def)), `${type} の効果のイベント: ${log.map((e) => e.event).join(',')}`);
      assert.equal(game.players.p1.mp, 20 - def.mpCost, 'mpCost ぶん MP を使う');
    });
  }
}

test('森の獣兵・ウルフファイター（beast）は、夜に攻撃が上がる（ビースト覚醒）', () => {
  const { game, handIds } = boardGame();
  game.players.p1.mp = 20;
  game.debugSetHand('p1', ['classic_forest_beast']);
  assert.equal(game.playCard(handIds('p1')[0], game.getTargets(handIds('p1')[0])[0]).ok, true);
  const soldier = game.players.p1.soldiers.find((s) => s.type === 'classic_forest_beast');
  const day = game.attackOf(soldier);
  game.night = true;
  assert.equal(game.attackOf(soldier), day + game.rules.nightBeastAttack);
  assert.equal(loadFactionCards('classic', 'forest').classic_forest_wolf.beast, true);
});

// 王国の歩兵と魔族の骸骨兵は、もとから同じ数値（このPRより前から）。ここでは、森・竜のカードがほかのどれとも同じでないことを確かめる
test('森・竜のカードは、ほかのカード（王国・魔族・森・竜）と効果が完全に同じでない', () => {
  const { cards } = buildData({ mode: 'classic', factions: FACTIONS });
  const sig = (c) => {
    const { name, description, count, ...rest } = c;
    return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
  };
  const entries = Object.entries(cards);
  for (const [k, c] of entries) {
    if (!/^classic_(forest|dragon)_/.test(k)) continue;
    for (const [k2, c2] of entries) if (k2 !== k) assert.notEqual(sig(c), sig(c2), `${k} と ${k2} は効果が同じ`);
  }
});

test('陣営ごとの山札（森 vs 竜、deckMode "own"）で、smart 同士の試合が決着する', () => {
  const { cards, rules } = buildData({ mode: 'classic', factions: FACTIONS });
  const deckOf = (pre) => Object.fromEntries(Object.entries(cards).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [k, v.count]));
  const decks = { forest: { name: '森', cards: deckOf('classic_forest_') }, dragon: { name: '竜', cards: deckOf('classic_dragon_') } };
  for (let seed = 1; seed <= 3; seed++) {
    const s = runMatch({ cards, rules: { ...rules, deckMode: 'own' }, strategies: ['smart', 'smart'], seed, gameOptions: { ...loadOptionalData('classic'), decks, setup: { decks: ['forest', 'dragon'] } } });
    assert.ok(s.winner, `seed ${seed} で決着`);
    assert.equal(s.errors, 0);
  }
});
