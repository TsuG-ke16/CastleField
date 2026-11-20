// サイコロのカード（攻撃・ヒール・マナ・コイン・シールド・バフ・ランダム）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { buildData, loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';

/** rng を差しかえられる Game（サイコロの目を決めるため） */
function make(rulesPatch = {}) {
  const { cards, rules } = buildData({ rules: { ...PLAIN_START, drawUntilHand: 0, defenseReaction: false, initialMp: 10, maxMp: 20, armorMax: 40, coinCardsPerTurn: 1, monsterSpawnChance: 0, weatherChangeChance: 0, ...rulesPatch } });
  const g = new Game({ cards, rules, rng: seededRng(11), rarities: loadJson('rarities.json') });
  return g;
}
const idOf = (g, pid, type) => g.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
/** 次のサイコロの目を決める（1〜6）。そのあとの乱数は元に戻す */
function fixDie(g, ...faces) {
  const orig = g.rng;
  const queue = faces.map((f) => (f - 1) / 6 + 0.01);
  g.rng = () => (queue.length ? queue.shift() : orig());
}

test('cards.json：サイコロ7枚はスペシャル（合成しない）。倍率は 3.5 / 3 / 2 / 2 / 3 / 1', () => {
  const c = loadJson('cards.json');
  const want = { attackDice: ['attack', 3.5], healDice: ['heal', 3], manaDice: ['mana', 2], coinDice: ['coin', 2], shieldDice: ['shield', 3], buffDice: ['buff', 1], randomDice: ['random', undefined] };
  for (const [t, [dice, per]] of Object.entries(want)) {
    assert.equal(c[t].effect, 'dice', t);
    assert.equal(c[t].dice, dice, t);
    assert.equal(c[t].per, per, t);
    assert.equal(c[t].rarity, 'special', t);
    assert.equal(c[t].fuseTo, undefined, t);
  }
});

test('攻撃サイコロ：目×3.5（切り上げ）を相手の城に。MP を使う。diceRolled が先に出る', () => {
  const g = make();
  g.debugSetHand('p1', ['attackDice']);
  g.start();
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['diceRolled', 'spellCast', 'castleDamaged', 'mpChanged']);
  fixDie(g, 3);
  assert.equal(g.playCard(idOf(g, 'p1', 'attackDice'), { playerId: 'p2' }).ok, true);
  assert.deepEqual(log.map((e) => e.event), ['mpChanged', 'diceRolled', 'spellCast', 'castleDamaged']);
  assert.deepEqual(log[1], { event: 'diceRolled', playerId: 'p1', type: 'attackDice', dice: 'attack', value: 3, amount: 11, rolls: [3] });
  assert.equal(g.players.p2.castle.hp, hp2 - 11); // 3 × 3.5 = 10.5 → 11
  assert.equal(log[0].delta, -3);
});

test('ヒールサイコロ：目×3 回復（メイン）。マナサイコロ：目×2 の MP（何枚でも）', () => {
  const g = make();
  g.debugSetHand('p1', ['healDice', 'manaDice', 'manaDice']);
  g.start();
  g.players.p1.castle.hp = 10;
  g.players.p1.mp = 0;
  fixDie(g, 5, 2, 1);
  assert.equal(g.playCard(idOf(g, 'p1', 'healDice')).ok, true);
  assert.equal(g.players.p1.castle.hp, 25);
  assert.equal(g.playCard(idOf(g, 'p1', 'manaDice')).ok, true);
  assert.equal(g.playCard(idOf(g, 'p1', 'manaDice')).ok, true); // メインを使わない
  assert.equal(g.players.p1.mp, 6);
});

test('コインサイコロ：目×2 のコイン。コインのカードと同じく1ターン1枚まで', () => {
  const g = make();
  g.debugSetHand('p1', ['coinDice', 'coinDice']);
  g.start();
  const before = g.players.p1.coins;
  fixDie(g, 6);
  assert.equal(g.playCard(idOf(g, 'p1', 'coinDice')).ok, true);
  assert.equal(g.players.p1.coins, before + 12);
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'coinDice')).reason, 'コインのカードは1ターンに1枚までです');
});

test('シールドサイコロ：目×3 の城壁（上限まで）', () => {
  const g = make();
  g.debugSetHand('p1', ['shieldDice', 'shieldDice']);
  g.start();
  fixDie(g, 4, 6);
  assert.equal(g.playCard(idOf(g, 'p1', 'shieldDice')).ok, true);
  assert.equal(g.players.p1.armor, 12);
  assert.equal(g.playCard(idOf(g, 'p1', 'shieldDice')).ok, true);
  assert.equal(g.players.p1.armor, 30);
});

test('バフサイコロ：選んだ自分の兵士1体の攻撃力 +目。兵士がいなければ出せない', () => {
  const g = make();
  g.debugSetHand('p1', ['buffDice', 'infantry']);
  g.start();
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'buffDice')).reason, '道の上に自分の兵士がいません');
  assert.equal(g.playCard(idOf(g, 'p1', 'infantry'), g.getTargets(idOf(g, 'p1', 'infantry'))[0]).ok, true);
  const s = g.players.p1.soldiers[0];
  const atk = s.attack;
  fixDie(g, 4);
  assert.equal(g.playCard(idOf(g, 'p1', 'buffDice'), { soldierId: s.soldierId }).ok, true);
  assert.equal(s.attack, atk + 4);
});

test('ランダムサイコロ：1回目で種類（1=攻撃…）、2回目は4〜6。対象はランダム', () => {
  const g = make();
  g.debugSetHand('p1', ['randomDice']);
  g.start();
  g.players.p1.coins = 0; // コストは城HPしか払えない（乱数を使わない）
  g.players.p1.mp = 0;
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['diceRolled']);
  // 1回目：1 → 攻撃。2回目：4〜6 のうち 6（rng 0.99）
  const orig = g.rng;
  const queue = [0.01, 0.99];
  g.rng = () => (queue.length ? queue.shift() : orig());
  assert.equal(g.playCard(idOf(g, 'p1', 'randomDice')).ok, true);
  assert.equal(log[0].dice, 'attack');
  assert.equal(log[0].value, 6);
  assert.deepEqual(log[0].rolls, [1, 6]);
  assert.equal(g.players.p2.castle.hp, hp2 - 21);
  assert.deepEqual(log[0].cost, { kind: 'hp', amount: 4 });
});

test('ランダムサイコロ：今使えない種類にはならない（城が満タン・兵士なし・MP 満タンなど）。目はいつも4以上', () => {
  for (let seed = 1; seed <= 40; seed++) {
    // コストはコインだけにする（城HP・MP を払うと、ヒール・マナが使えるようになるので）。MP なしのルール
    const { cards, rules } = buildData({ rules: { ...PLAIN_START, drawUntilHand: 0, defenseReaction: false, initialMp: 0, maxMp: 0, monsterSpawnChance: 0, weatherChangeChance: 0 }, cards: { randomDice: { randomCost: { coins: 3 } } } });
    const g = new Game({ cards, rules, rng: seededRng(seed), rarities: loadJson('rarities.json') });
    g.debugSetHand('p1', ['randomDice']);
    g.start();
    g.players.p1.coins = 10;
    const log = recordEvents(g, ['diceRolled']);
    assert.equal(g.playCard(idOf(g, 'p1', 'randomDice')).ok, true);
    assert.ok(!['heal', 'mana', 'buff'].includes(log[0].dice), `seed ${seed}: ${log[0].dice}`);
    assert.ok(log[0].value >= 4 && log[0].value <= 6);
  }
});

test('ランダムサイコロは MP を使わない（攻撃になっても）', () => {
  const g = make();
  assert.equal(g.getState('p1').mpCosts.randomDice, undefined);
  assert.equal(g.getState('p1').mpCosts.attackDice, 3);
});

test('ランダムサイコロのコスト：城HP4・コイン3・MP3 のうち払えるものを1つ払う。どれも払えなければ出せない', () => {
  const g = make();
  g.debugSetHand('p1', ['randomDice', 'randomDice']);
  g.start();
  // 城HP4以下・コイン2・MP2 → どれも払えない
  g.players.p1.castle.hp = 4;
  g.players.p1.coins = 2;
  g.players.p1.mp = 2;
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'randomDice')).reason, '払えるコストがありません');
  // コインだけ払える → コインを3払う
  g.players.p1.coins = 5;
  const log = recordEvents(g, ['coinsChanged', 'diceRolled']);
  assert.equal(g.playCard(idOf(g, 'p1', 'randomDice')).ok, true);
  assert.deepEqual(log[0], { event: 'coinsChanged', playerId: 'p1', delta: -3, coins: 2, reason: 'cost' });
  assert.equal(log[1].event, 'diceRolled');
  assert.deepEqual(log[1].cost, { kind: 'coins', amount: 3 });
  assert.equal(g.players.p1.castle.hp, 4); // 城HPは払っていない
});

test('ランダムサイコロのコスト：払うものはランダム（城HP・コイン・MP がどれも出る）', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const { cards, rules } = buildData({ rules: { ...PLAIN_START, drawUntilHand: 0, defenseReaction: false, initialMp: 10, maxMp: 20, monsterSpawnChance: 0, weatherChangeChance: 0 } });
    const g = new Game({ cards, rules, rng: seededRng(seed), rarities: loadJson('rarities.json') });
    g.debugSetHand('p1', ['randomDice']);
    g.start();
    g.players.p1.coins = 10;
    const log = recordEvents(g, ['diceRolled']);
    assert.equal(g.playCard(idOf(g, 'p1', 'randomDice')).ok, true);
    seen.add(log[0].cost.kind);
  }
  assert.deepEqual([...seen].sort(), ['coins', 'hp', 'mp']);
});

// ---------- ゴッドサイコロ：1回振って、6つのサイコロの効果が全部起きる。コストなし。デッキではレジェンド枠 ----------

test('ゴッドサイコロ：目4 → 相手の城に14・城+12・MP+8・コイン+8・城壁12・兵士全員の攻撃+4。攻撃はいちばん最後', async () => {
  const g = make();
  g.debugSetHand('p1', ['infantry', 'infantry', 'godDice']);
  g.start();
  for (let i = 0; i < 2; i++) assert.equal(g.playCard(idOf(g, 'p1', 'infantry'), g.getTargets(idOf(g, 'p1', 'infantry'))[i]).ok, true);
  const atk = g.players.p1.soldiers.map((s) => s.attack);
  g.players.p1.castle.hp = 20;
  g.players.p1.mp = 0;
  const coins = g.players.p1.coins;
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['diceRolled', 'castleHealed', 'mpChanged', 'coinsChanged', 'castleArmored', 'soldierBuffed', 'castleDamaged']);
  fixDie(g, 4);
  assert.equal(g.playCard(idOf(g, 'p1', 'godDice'), { playerId: 'p2' }).ok, true);
  assert.deepEqual(log[0], { event: 'diceRolled', playerId: 'p1', type: 'godDice', dice: 'god', value: 4, amount: { attack: 14, heal: 12, mana: 8, coin: 8, shield: 12, buff: 4 }, rolls: [4] });
  assert.deepEqual(log.map((e) => e.event), ['diceRolled', 'castleHealed', 'mpChanged', 'coinsChanged', 'castleArmored', 'soldierBuffed', 'soldierBuffed', 'castleDamaged']);
  assert.equal(g.players.p1.castle.hp, 32);
  assert.equal(g.players.p1.mp, 8); // MP は使わない
  assert.equal(g.players.p1.coins, coins + 8);
  assert.equal(g.players.p1.armor, 12);
  assert.deepEqual(g.players.p1.soldiers.map((s) => s.attack), atk.map((a) => a + 4));
  assert.equal(g.players.p2.castle.hp, hp2 - 14);
});

test('ゴッドサイコロ：使えない効果は飛ばす（城・MP 満タン、兵士なし）', () => {
  const g = make();
  g.debugSetHand('p1', ['godDice']);
  g.start();
  g.players.p1.mp = 20;
  const log = recordEvents(g, ['castleHealed', 'mpChanged', 'soldierBuffed', 'coinsChanged', 'castleDamaged']);
  fixDie(g, 1);
  assert.equal(g.playCard(idOf(g, 'p1', 'godDice'), { playerId: 'p2' }).ok, true);
  assert.deepEqual(log.map((e) => e.event), ['coinsChanged', 'castleDamaged']);
});

test('ゴッドサイコロ：スペシャルだがデッキ編成ではレジェンド（コスト5・レジェンドの枚数に数える）。排出率はレジェンド1枚と同じくらい', async () => {
  const { deckRarityOf, deckCostOf, dropRates } = await import('../js/game/Setup.js');
  const c = loadJson('cards.json');
  const r = loadJson('rarities.json');
  assert.equal(c.godDice.rarity, 'special');
  assert.equal(deckRarityOf(c.godDice, r), 'legendary');
  assert.equal(deckCostOf(c.godDice, r), 5);
  assert.equal(deckRarityOf(c.attackDice, r), 'rare');
  const all = dropRates(c, r); const rates = all.cards ?? all;
  assert.ok(Math.abs(rates.godDice - rates.godSword) < 0.01, `${rates.godDice} / ${rates.godSword}`); // 神剣（レジェンド・weight 1）と同じくらい
  assert.equal(make().getState('p1').mpCosts.godDice, undefined);
});
