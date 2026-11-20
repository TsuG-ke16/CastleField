import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { dropRates, validateRarities } from '../js/game/Setup.js';
import { filterEventFor } from '../js/game/visibility.js';
import { buildData, loadJson, loadOptionalData, recordEvents, seededRng } from './helpers.js';

const rarities = loadJson('rarities.json');
const make = (extra = {}) => {
  const { cards, rules } = buildData();
  return new Game({ cards, rules, rng: seededRng(3), ...loadOptionalData(), ...extra });
};

test('レアリティ：data の全カードに rarity があり、合成先は1つ上のレアリティ（レジェンドは合成先なし）', () => {
  const cards = loadJson('cards.json');
  const order = Object.keys(rarities).filter((id) => !rarities[id].special); // スペシャルは合成・ラッキーの並びに入らない
  for (const [t, d] of Object.entries(cards)) {
    if (d.monster) { assert.equal(d.fuseTo, undefined, t); continue; } // 倒した魔物の兵士：合成しない
    if (d.effect === 'wild' || rarities[d.rarity].special) { assert.equal(d.fuseTo, undefined, t); continue; } // 適応：合成先は相手のカードで決まる
    const i = order.indexOf(d.rarity);
    assert.ok(i >= 0, t);
    if (i === order.length - 1) assert.equal(d.fuseTo, undefined, t);
    else assert.equal(cards[d.fuseTo].rarity, order[i + 1], t);
  }
  for (const r of Object.keys(rarities)) assert.ok(Object.values(cards).some((d) => d.rarity === r), `${r} のカードがある`);
});

test('排出率：カードごとの合計が100%、レアリティごとの合計が dropRate と一致する', () => {
  const cards = loadJson('cards.json');
  const rates = dropRates(cards, rarities);
  assert.ok(Math.abs(Object.values(rates).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  for (const [id, r] of Object.entries(rarities)) {
    const sum = Object.entries(cards).filter(([, d]) => d.rarity === id).reduce((n, [t]) => n + rates[t], 0);
    assert.ok(Math.abs(sum - r.dropRate) < 1e-9, id);
  }
});

test('排出率：dropRate の合計が100でないと例外', () => {
  assert.throws(() => validateRarities({ a: { name: 'A', dropRate: 60 }, b: { name: 'B', dropRate: 60 } }), /100/);
});

test('山札：rules.deckSize 枚を排出率で作る（rarities なしなら count どおり）', () => {
  const g = make();
  const pile = g.pileOf('p1');
  assert.equal(pile.deck.length + 10, 100); // 初期手札5枚ずつ
  const { cards, rules } = buildData();
  const old = new Game({ cards, rules, rng: seededRng(3) });
  assert.equal(old.pileOf('p1').deck.length + 10, Object.values(cards).reduce((n, d) => n + d.count, 0));
});

test('合成：手札の同じカード2枚が、1つ上のレアリティの1枚になる', () => {
  const g = make();
  g.debugSetHand('p1', ['infantry', 'infantry', 'fireball']);
  g.start();
  const log = recordEvents(g, ['cardsFused']);
  const [a, b] = g.getState('p1').players.p1.hand.filter((c) => c.type === 'infantry').map((c) => c.cardId);
  assert.deepEqual(g.canFuse(a, b).ok, true);
  assert.equal(g.fuse(a, b).ok, true);
  const hand = g.getState('p1').players.p1.hand;
  assert.equal(hand.filter((c) => c.type === 'infantry').length, 0);
  assert.equal(hand.filter((c) => c.type === 'spearman').length, 1);
  assert.equal(log[0].from, 'infantry');
  assert.equal(log[0].to, 'spearman');
  assert.equal(g.getState('p1').players.p1.playedThisTurn, false); // メインの1枚には数えない
});

test('合成：違う種類・レジェンド・手札にないカード・相手の番は合成できない', () => {
  const g = make();
  g.debugSetHand('p1', ['infantry', 'fireball', 'hero', 'hero']);
  g.start();
  const h = g.getState('p1').players.p1.hand;
  const id = (t, n = 0) => h.filter((c) => c.type === t)[n].cardId;
  assert.match(g.fuse(id('infantry'), id('fireball')).reason, /同じ種類/);
  assert.match(g.fuse(id('hero', 0), id('hero', 1)).reason, /レジェンド/);
  assert.match(g.fuse(id('infantry'), 'c999').reason, /手札にありません/);
  assert.equal(g.fuse(id('infantry'), id('infantry')).ok, false);
});

test('合成：本人以外にはカードの中身を送らない', () => {
  const p = { playerId: 'p1', cardIds: ['c01', 'c02'], cardId: 'c03', from: 'infantry', to: 'heavy' };
  assert.deepEqual(filterEventFor('cardsFused', p, 'p2'), { playerId: 'p1' });
  assert.deepEqual(filterEventFor('cardsFused', p, 'p1'), p);
});

test('運命の祈り：買うと、次の数枚は排出率を上げて引き当てる（レア以上が出やすい）', () => {
  const { cards, rules } = buildData();
  const upgrades = loadJson('upgrades.json');
  const base = dropRates(cards, rarities);
  const boosted = dropRates(cards, rarities, { from: 'rare', multiplier: 4 });
  const high = (r) => Object.entries(cards).filter(([, d]) => ['rare', 'epic', 'legendary'].includes(d.rarity)).reduce((n, [t]) => n + r[t], 0);
  assert.ok(high(boosted) > high(base) * 2);
  assert.ok(Math.abs(Object.values(boosted).reduce((a, b) => a + b, 0) - 100) < 1e-9);

  const g = make({ upgrades });
  g.start();
  g.players.p1.coins = 5; // 内部の状態を直接書く（魔物を倒さなくても買えるように）
  assert.equal(g.buyUpgrade('luck').ok, true);
  assert.equal(g.getState('p1').players.p1.luck.draws, upgrades.luck.amount);
  g.players.p1.coins = 5;
  assert.match(g.canBuyUpgrade('luck').reason, /もう効いています/);
  const deckBefore = g.pileOf('p1').deck.length;
  g.drawCards(g.players.p1, 3);
  assert.equal(g.pileOf('p1').deck.length, deckBefore); // 山札は減らない
  assert.equal(g.getState('p1').players.p1.luck.draws, upgrades.luck.amount - 3);
});

test('ドロー：drawPerPlayed なら、前のターンに出した枚数ぶん引く', () => {
  const { cards, rules } = buildData({ rules: { drawUntilHand: 0, drawPerTurn: 1, drawPerPlayed: true, maxHand: 20 } });
  const g = new Game({ cards, rules, rng: seededRng(5) });
  g.debugSetHand('p1', ['infantry', 'shield', 'shield']);
  g.debugSetHand('p2', ['infantry']);
  g.start();
  const p1 = () => g.getState('p1').players.p1.handCount;
  const hand = g.getState('p1').players.p1.hand;
  const sh = hand.filter((c) => c.type === 'shield');
  const inf = hand.find((c) => c.type === 'infantry').cardId;
  assert.equal(g.playCard(inf, g.getTargets(inf)[0]).ok, true);
  const before = p1();
  g.endTurn(); // p2
  g.endTurn(); // p1 に戻る：前のターンに1枚出した → 1枚引く
  assert.equal(p1(), before + 1);
});

test('コイン：最初に initialCoins、自分のターンの始めに coinPerTurn もらえる。コインのカードで増やせる', () => {
  const { cards, rules } = buildData({ rules: { initialCoins: 5, coinPerTurn: 1 } });
  const g = new Game({ cards, rules, rng: seededRng(7) });
  assert.equal(g.getState('p1').players.p1.coins, 5);
  assert.equal(g.getState('p1').players.p2.coins, 5);
  g.debugSetHand('p1', ['coinPouch']);
  const log = recordEvents(g, ['coinsChanged']);
  g.start();
  assert.equal(g.getState('p1').players.p1.coins, 6); // 最初のターンの始め
  assert.equal(log[0].reason, 'turn');
  const id = g.getState('p1').players.p1.hand.find((c) => c.type === 'coinPouch').cardId;
  assert.equal(g.playCard(id).ok, true);
  assert.equal(g.getState('p1').players.p1.coins, 6 + cards.coinPouch.amount);
  assert.equal(log.at(-1).reason, 'card');
  g.endTurn(); // p2 のターン
  assert.equal(g.getState('p1').players.p2.coins, 6);
});

test('入手券：コインで、指定したレアリティのカードを1枚手に入れる', () => {
  const upgrades = loadJson('upgrades.json');
  const g = make({ upgrades });
  g.start();
  g.players.p1.coins = 100;
  const before = g.getState('p1').players.p1.hand.length;
  const log = recordEvents(g, ['cardDrawn']);
  assert.equal(g.buyUpgrade('ticketRare').ok, true);
  const hand = g.getState('p1').players.p1.hand;
  assert.equal(hand.length, before + 1);
  assert.equal(loadJson('cards.json')[hand.at(-1).type].rarity, 'rare');
  assert.equal(log.length, 1);
  assert.equal(g.getState('p1').players.p1.coins, 100 - upgrades.ticketRare.cost);
});

test('コインのカードの値：コモン1・アンコモン3・レア8・エピック20・レジェンド50', () => {
  const c = loadJson('cards.json');
  assert.deepEqual(['coinPouch', 'goldCoin', 'treasure', 'goldVein', 'kingTreasure'].map((t) => c[t].amount), [1, 3, 8, 20, 50]);
});

test('魔物のごほうび：rewardRarity の魔物を倒すと、そのレアリティのカードが手札に入る（コインは増えない）', () => {
  const monsters = { bat: { name: 'コウモリ', hp: 1, attack: 1, rewardRarity: 'rare', castleAttack: 1, attackEvery: 2, weight: 1 } };
  const g = make({ monsters });
  g.start();
  const me = g.players.p1;
  const coins = me.coins;
  const hand = me.hand.length;
  const log = recordEvents(g, ['monsterDefeated', 'cardDrawn', 'coinsChanged']);
  // 魔物を1体置いて、とどめを刺したことにする（内部の関数を直接呼ぶ）
  const def = monsters.bat;
  const fake = { monsterId: 'mX', isDead: true, roadId: g.roads[0].roadId, def };
  g.monsters.push(fake);
  g.defeatMonsterIfDead(fake, 'p1');
  assert.equal(log.find((e) => e.event === 'monsterDefeated').rewardRarity, 'rare');
  // ごほうびのカード1枚（type のない仮の魔物なので、駒は出ない）
  assert.equal(me.hand.length, hand + 1);
  assert.equal(loadJson('cards.json')[me.hand.at(-1).type].rarity, 'rare');
  assert.equal(me.coins, coins);
  assert.equal(log.filter((e) => e.event === 'coinsChanged').length, 0);
});

test('放置：魔物が城を攻めるたびに、ダメージが monsterAttackGrowth ずつ重くなる', () => {
  const monsters = { rock: { name: 'いわ', hp: 99, attack: 1, rewardRarity: 'common', castleAttack: 2, attackEvery: 1, weight: 1 } };
  const { cards, rules } = buildData({ rules: { monsterFirstRound: 1, monsterSpawnChance: 1, monsterAttackGrowth: 3, drawUntilHand: 0, monsterEvolveEvery: 0, nightChance: 0 } });
  const g = new Game({ cards, rules, rng: seededRng(2), monsters });
  const log = recordEvents(g, ['monsterAttackedCastle']);
  g.start();
  for (let i = 0; i < 8; i++) g.endTurn();
  assert.deepEqual(log.slice(0, 3).map((e) => e.amount), [2, 5, 8]);
});

test('ラッキー：rewardLuckyChance が1なら必ず1つ上のレアリティ、0なら出ない', () => {
  const monsters = { bat: { name: 'コウモリ', hp: 1, attack: 1, rewardRarity: 'common', castleAttack: 1, attackEvery: 2, weight: 1 } };
  const cardsJson = loadJson('cards.json');
  for (const [chance, rarity, lucky] of [[1, 'uncommon', true], [0, 'common', false]]) {
    const g = make({ monsters });
    g.rules.rewardLuckyChance = chance;
    g.start();
    const log = recordEvents(g, ['monsterDefeated']);
    const fake = { monsterId: 'mX', isDead: true, roadId: g.roads[0].roadId, def: monsters.bat };
    g.monsters.push(fake);
    g.defeatMonsterIfDead(fake, 'p1');
    assert.equal(log[0].lucky, lucky);
    assert.equal(log[0].rewardRarity, rarity);
    assert.equal(cardsJson[g.players.p1.hand.at(-1).type].rarity, rarity);
  }
});

test('getDropRates：カードごとの合計が100%、魔物のごほうびの内訳が出る', () => {
  const g = make({ monsters: loadJson('monsters.json') });
  g.rules.rewardLuckyChance = 0.2;
  const info = g.getDropRates();
  assert.ok(Math.abs(Object.values(info.cards).reduce((n, c) => n + c.rate, 0) - 100) < 1e-9);
  assert.deepEqual(info.monsters.bat.odds.map((o) => [o.rarity, Math.round(o.rate)]), [['common', 80], ['uncommon', 20]]);
  assert.equal(info.monsters.demonKing.odds.length, 1); // レジェンドの上はない
});

test('訓練・鍛錬：買うと、いる兵士にも、これから出す兵士にも、攻撃力・HPがずっと増える', () => {
  const upgrades = loadJson('upgrades.json');
  const g = make({ upgrades });
  g.debugSetHand('p1', ['infantry', 'infantry']);
  g.start();
  g.players.p1.coins = 100;
  const cards = loadJson('cards.json');
  const ids = g.getState('p1').players.p1.hand.filter((c) => c.type === 'infantry').map((c) => c.cardId);
  assert.equal(g.playCard(ids[0], g.getTargets(ids[0])[0]).ok, true);
  assert.equal(g.buyUpgrade('hardTraining').ok, true); // 攻撃+3
  assert.equal(g.buyUpgrade('hardConditioning').ok, true); // HP+3
  const s = () => g.getState('p1').players.p1.soldiers;
  assert.equal(s()[0].attack, cards.infantry.attack + upgrades.hardTraining.amount);
  assert.equal(s()[0].hp, cards.infantry.hp + upgrades.hardConditioning.amount);
  g.endTurn(); g.endTurn(); // p1 に戻る。メインは1枚なので2枚目の歩兵は次のターン
  assert.equal(g.playCard(ids[1], g.getTargets(ids[1])[0]).ok, true);
  const added = s().at(-1); // 最初の1体は、もう城に着いて消えている
  assert.equal(added.attack, cards.infantry.attack + upgrades.hardTraining.amount);
  assert.equal(added.hp, cards.infantry.hp + upgrades.hardConditioning.amount);
});

test('適応：どのカードとでも合成できて、相手のカードの1つ上ができる。単体では出せない・適応どうしは合成できない', () => {
  const game = make();
  game.debugSetHand('p1', ['adapt', 'adapt', 'infantry', 'heal']);
  game.start();
  const hand = game.getState('p1').players.p1.hand;
  const id = (t, n = 0) => hand.filter((c) => c.type === t)[n].cardId;
  const cards = loadJson('cards.json');
  assert.equal(game.canPlayCard(id('adapt')).ok, false);
  assert.match(game.canPlayCard(id('adapt')).reason, /合成/);
  assert.equal(game.canFuse(id('adapt', 0), id('adapt', 1)).ok, false);
  assert.equal(game.canFuse(id('infantry'), id('heal')).ok, false);
  assert.equal(game.fuse(id('adapt', 0), id('infantry')).ok, true);
  const after = game.getState('p1').players.p1.hand.map((c) => c.type);
  assert.equal(after.includes('infantry'), false);
  assert.equal(after.includes(cards.infantry.fuseTo), true);
  assert.equal(after.filter((t) => t === 'adapt').length, 1);
});

test('適応：メインのカードを出したあとも、出せない理由は「合成に使うカード」のまま', () => {
  const game = make();
  game.debugSetHand('p1', ['adapt', 'fireball']);
  game.start();
  const hand = game.getState('p1').players.p1.hand;
  const id = (t) => hand.find((c) => c.type === t).cardId;
  assert.equal(game.playCard(id('fireball'), game.getTargets(id('fireball'))[0]).ok, true);
  const res = game.canPlayCard(id('adapt'));
  assert.equal(res.ok, false);
  assert.match(res.reason, /合成に使うカード/);
  assert.match(game.playCard(id('adapt')).reason, /合成に使うカード/);
});
