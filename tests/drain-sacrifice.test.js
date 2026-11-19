// 追加カード（仕様書4章。レア・合成しない）：魔力強奪・命の簒奪・決死の砲撃・火薬庫のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { buildData, loadJson, seededRng, recordEvents } from './helpers.js';

function make(rulesPatch = {}) {
  const { cards, rules } = buildData({ rules: { drawUntilHand: 0, defenseReaction: false, ...rulesPatch } });
  return new Game({ cards, rules, rng: seededRng(7), rarities: loadJson('rarities.json') });
}
const idOf = (g, pid, type) => g.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
function pass(g) {
  g.endTurn();
  if (g.phase === 'discard') {
    const hand = g.getState(g.currentPlayer).players[g.currentPlayer].hand;
    g.discard(hand.slice(0, g.discardCount).map((c) => c.cardId));
  }
}

test('cards.json：4枚はレアで、合成しない（fuseTo: null）。MP はレアのコスト（3）', () => {
  const c = loadJson('cards.json');
  const expect = { manaRaid: ['drainMp', 4], lifeSteal: ['drainCastle', 8], desperateShot: ['sacrificeAttack', 20], powderKeg: ['damageAllSoldiers', 8] };
  for (const [type, [effect, amount]] of Object.entries(expect)) {
    assert.equal(c[type].effect, effect, type);
    assert.equal(c[type].amount, amount, type);
    assert.equal(c[type].rarity, 'rare', type);
    assert.equal(c[type].fuseTo, null, type);
    assert.equal(c[type].mpCost, undefined, type);
  }
  assert.equal(c.desperateShot.selfDamage, 6);
});

test('合成しないカード（fuseTo: null）：同じカード2枚でも、適応とでも合成できない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['lifeSteal', 'lifeSteal', 'adapt']);
  g.start();
  const ids = g.getState('p1').players.p1.hand.filter((x) => x.type === 'lifeSteal').map((x) => x.cardId);
  assert.equal(g.canFuse(ids[0], ids[1]).reason, 'このカードは合成できません');
  assert.equal(g.canFuse(idOf(g, 'p1', 'adapt'), ids[0]).reason, 'このカードは合成できません');
});

test('剣の攻撃力：魔剣+4・聖剣+6・神剣+9', () => {
  const c = loadJson('cards.json');
  assert.deepEqual(['magicSword', 'holySword', 'godSword'].map((t) => c[t].attackBonus), [4, 6, 9]);
});

test('cards.json：fuseTo を書き忘れたレア（null でない）は例外', () => {
  const { cards, rules } = buildData();
  delete cards.lifeSteal.fuseTo;
  assert.throws(() => new Game({ cards, rules, rarities: loadJson('rarities.json') }), /fuseTo/);
});

test('MPドレイン：相手の MP を奪って自分の MP にする。MP は使わない。相手の MP が0なら出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaRaid', 'manaRaid']);
  g.start();
  g.players.p1.mp = 5;
  g.players.p2.mp = 3;
  const log = recordEvents(g, ['mpChanged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'manaRaid'), { playerId: 'p2' }).ok, true);
  // 4奪おうとしても、相手は3しか持っていない
  assert.deepEqual(log, [
    { event: 'mpChanged', playerId: 'p2', delta: -3, mp: 0, reason: 'drained' },
    { event: 'mpChanged', playerId: 'p1', delta: 3, mp: 8, reason: 'drain' },
  ]);
  pass(g);
  pass(g);
  const res = g.canPlayCard(idOf(g, 'p1', 'manaRaid'));
  assert.equal(res.ok, false);
  assert.equal(res.reason, '相手のMPがありません');
});

test('MPドレイン：自分の上限を超えたぶんは捨てる', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaRaid']);
  g.start();
  g.players.p1.mp = 18;
  g.players.p2.mp = 20;
  assert.equal(g.playCard(idOf(g, 'p1', 'manaRaid'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.mp, 16);
  assert.equal(g.players.p1.mp, 20);
});

test('生命吸収：相手の城に与えたぶん自分の城を回復。城壁が受けたぶんは回復しない。MP を使う', () => {
  const g = make({ initialMp: 10, maxMp: 20, armorMax: 40 });
  g.debugSetHand('p1', ['lifeSteal']);
  g.start();
  g.players.p1.castle.hp = 30;
  g.players.p2.armor = 3;
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['castleDamaged', 'castleHealed', 'mpChanged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'lifeSteal'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.castle.hp, hp2 - 5);
  assert.equal(g.players.p1.castle.hp, 35);
  assert.deepEqual(log.map((e) => e.event), ['mpChanged', 'castleDamaged', 'castleHealed']);
  assert.equal(log[0].delta, -3); // レア
  assert.equal(log[2].amount, 5);
});

test('生命吸収：自分の城が満タンなら回復は出ない（城HPの上限で止まる）', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['lifeSteal']);
  g.start();
  const log = recordEvents(g, ['castleHealed']);
  assert.equal(g.playCard(idOf(g, 'p1', 'lifeSteal'), { playerId: 'p2' }).ok, true);
  assert.equal(log.length, 0);
});

test('捨て身：自分の城HPを払って、相手の城に大ダメージ。払うのは城壁を通さない', () => {
  const g = make({ initialMp: 10, maxMp: 20, armorMax: 40 });
  g.debugSetHand('p1', ['desperateShot']);
  g.start();
  g.players.p1.armor = 10;
  const hp1 = g.players.p1.castle.hp;
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['castleDamaged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'desperateShot'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p1.castle.hp, hp1 - 6);
  assert.equal(g.players.p1.armor, 10);
  assert.equal(g.players.p2.castle.hp, hp2 - 20);
  assert.deepEqual(log[0], { event: 'castleDamaged', playerId: 'p1', amount: 6, blocked: 0, hp: hp1 - 6, source: { kind: 'sacrifice', type: 'desperateShot' } });
  assert.deepEqual(log[1].source, { kind: 'spell', type: 'desperateShot' });
});

test('捨て身：払うと自分の城が落ちるなら出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['desperateShot']);
  g.start();
  g.players.p1.castle.hp = 6;
  const res = g.canPlayCard(idOf(g, 'p1', 'desperateShot'));
  assert.equal(res.ok, false);
  assert.equal(res.reason, '城のHPが足りません（6より多く必要です）');
  g.players.p1.castle.hp = 7;
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'desperateShot')).ok, true);
});

test('捨て身：相手の城を落とせば勝ち', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['desperateShot']);
  g.debugSetCastleHp('p2', 20);
  g.start();
  assert.equal(g.playCard(idOf(g, 'p1', 'desperateShot'), { playerId: 'p2' }).ok, true);
  assert.equal(g.phase, 'gameOver');
  assert.equal(g.getState('p1').winner, 'p1');
});

test('爆発：自分の兵士も相手の兵士も、場の兵士全員にダメージ。場に兵士がいなければ出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['powderKeg', 'infantry']);
  g.start();
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'powderKeg')).reason, '場に兵士がいません');
  const targets = g.getTargets(idOf(g, 'p1', 'infantry'));
  assert.equal(g.playCard(idOf(g, 'p1', 'infantry'), targets[0]).ok, true);
  pass(g);
  g.debugSetHand('p2', ['infantry']);
  assert.equal(g.playCard(idOf(g, 'p2', 'infantry'), g.getTargets(idOf(g, 'p2', 'infantry'))[0]).ok, true);
  pass(g);
  g.debugSetHand('p1', ['powderKeg']);
  const mine = g.players.p1.soldiers[0];
  const theirs = g.players.p2.soldiers[0];
  const [hpMine, hpTheirs] = [mine.hp, theirs.hp];
  const log = recordEvents(g, ['soldierDamaged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'powderKeg')).ok, true); // 対象は選ばない
  assert.deepEqual(log.map((e) => [e.playerId, e.amount, e.cause]), [['p1', 8, 'spell'], ['p2', 8, 'spell']]);
  // 歩兵（HP5）は両方とも倒れる
  assert.equal(g.players.p1.soldiers.includes(mine), hpMine > 8);
  assert.equal(g.players.p2.soldiers.includes(theirs), hpTheirs > 8);
});

// ---------- 合成・高レアリティの機会を増やす調整（適応の排出率・排出率アップの強化の値段） ----------

test('適応の排出率は約2.5%。解毒薬・天候の呪文は約0.33%・0.16%', async () => {
  const { dropRates } = await import('../js/game/Setup.js');
  const all = dropRates(loadJson("cards.json"), loadJson("rarities.json")); const rates = all.cards ?? all;
  assert.ok(Math.abs(rates.adapt - 2.5) < 0.05, String(rates.adapt));
  assert.ok(Math.abs(rates.antidote - 0.328) < 0.01);
  assert.ok(Math.abs(rates.weatherCall - 0.164) < 0.01);
  const total = Object.values(loadJson('rarities.json')).reduce((a, r) => a + r.dropRate, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('幸運の加護は買うたびに値段が上がる（3 → 5 → 8 → 11、4回まで）。運命の祈りは3', () => {
  const { cards, rules } = buildData({ rules: { drawUntilHand: 0 } });
  const g = new Game({ cards, rules, rng: seededRng(3), rarities: loadJson('rarities.json'), upgrades: loadJson('upgrades.json') });
  g.start();
  const p1 = g.players.p1;
  p1.coins = 100;
  assert.equal(g.getState('p1').players.p1.upgradeCosts.luck, 3);
  const log = recordEvents(g, ['upgradeBought']);
  const paid = [];
  for (let i = 0; i < 4; i++) {
    assert.equal(g.getState('p2').players.p1.upgradeCosts.permLuck, [3, 5, 8, 11][i]); // 相手からも見える
    assert.equal(g.buyUpgrade('permLuck').ok, true);
    paid.push(log.at(-1).cost);
  }
  assert.deepEqual(paid, [3, 5, 8, 11]);
  assert.equal(p1.coins, 100 - 27);
  assert.equal(g.canBuyUpgrade('permLuck').reason, 'この強化は1試合に4回までです');
  p1.coins = 2;
  assert.equal(g.canBuyUpgrade('luck').reason, 'コインが足りません（あと1枚）');
});

test('upgrades.json：costs の最初が cost と違うと例外', () => {
  const { cards, rules } = buildData();
  const upgrades = loadJson('upgrades.json');
  upgrades.permLuck.costs = [4, 5];
  assert.throws(() => new Game({ cards, rules, rarities: loadJson('rarities.json'), upgrades }), /costs の最初は cost と同じ/);
});
