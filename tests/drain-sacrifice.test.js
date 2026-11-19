// 追加カード（仕様書4章）：MPドレイン・生命吸収・捨て身・爆発のテスト。
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

test('cards.json：4系統がコモン〜レジェンドで合成につながり、数値が仕様どおり', () => {
  const c = loadJson('cards.json');
  const chains = {
    drainMp: [['manaSip', 1], ['manaDrain', 2], ['manaRaid', 4], ['manaUsurp', 7], ['voidVortex', 12]],
    drainCastle: [['lifeFang', 3], ['lifeDrain', 5], ['lifeSteal', 8], ['soulEater', 12], ['deathEmbrace', 18]],
    sacrificeAttack: [['recklessStrike', 8], ['bloodPact', 13], ['desperateShot', 20], ['lifeFlame', 28], ['finalGlory', 38]],
    damageAllSoldiers: [['bomb', 3], ['bigBomb', 5], ['powderKeg', 8], ['greatExplosion', 12], ['cataclysm', 18]],
  };
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (const [effect, chain] of Object.entries(chains)) {
    chain.forEach(([type, amount], i) => {
      assert.equal(c[type].effect, effect, type);
      assert.equal(c[type].amount, amount, type);
      assert.equal(c[type].rarity, rarities[i], type);
      assert.equal(c[type].fuseTo, chain[i + 1]?.[0], type);
    });
  }
  assert.deepEqual(['recklessStrike', 'bloodPact', 'desperateShot', 'lifeFlame', 'finalGlory'].map((t) => c[t].selfDamage), [2, 4, 6, 8, 10]);
});

test('MPドレイン：相手の MP を奪って自分の MP にする。MP は使わない。相手の MP が0なら出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaRaid', 'manaSip']);
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
  const res = g.canPlayCard(idOf(g, 'p1', 'manaSip'));
  assert.equal(res.ok, false);
  assert.equal(res.reason, '相手のMPがありません');
});

test('MPドレイン：自分の上限を超えたぶんは捨てる', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['voidVortex']);
  g.start();
  g.players.p1.mp = 15;
  g.players.p2.mp = 20;
  assert.equal(g.playCard(idOf(g, 'p1', 'voidVortex'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.mp, 8);
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
  g.debugSetHand('p1', ['lifeFang']);
  g.start();
  const log = recordEvents(g, ['castleHealed']);
  assert.equal(g.playCard(idOf(g, 'p1', 'lifeFang'), { playerId: 'p2' }).ok, true);
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
  g.debugSetHand('p1', ['finalGlory']);
  g.start();
  g.players.p1.castle.hp = 10;
  const res = g.canPlayCard(idOf(g, 'p1', 'finalGlory'));
  assert.equal(res.ok, false);
  assert.equal(res.reason, '城のHPが足りません（10より多く必要です）');
  g.players.p1.castle.hp = 11;
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'finalGlory')).ok, true);
});

test('捨て身：相手の城を落とせば勝ち', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['recklessStrike']);
  g.debugSetCastleHp('p2', 8);
  g.start();
  assert.equal(g.playCard(idOf(g, 'p1', 'recklessStrike'), { playerId: 'p2' }).ok, true);
  assert.equal(g.phase, 'gameOver');
  assert.equal(g.getState('p1').winner, 'p1');
});

test('爆発：自分の兵士も相手の兵士も、場の兵士全員にダメージ。場に兵士がいなければ出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['bomb', 'infantry']);
  g.start();
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'bomb')).reason, '場に兵士がいません');
  const targets = g.getTargets(idOf(g, 'p1', 'infantry'));
  assert.equal(g.playCard(idOf(g, 'p1', 'infantry'), targets[0]).ok, true);
  pass(g);
  g.debugSetHand('p2', ['infantry']);
  assert.equal(g.playCard(idOf(g, 'p2', 'infantry'), g.getTargets(idOf(g, 'p2', 'infantry'))[0]).ok, true);
  pass(g);
  g.debugSetHand('p1', ['bomb']);
  const mine = g.players.p1.soldiers[0];
  const theirs = g.players.p2.soldiers[0];
  const [hpMine, hpTheirs] = [mine.hp, theirs.hp];
  const log = recordEvents(g, ['soldierDamaged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'bomb')).ok, true); // 対象は選ばない
  assert.deepEqual(log.map((e) => [e.playerId, e.amount, e.cause]), [['p1', 3, 'spell'], ['p2', 3, 'spell']]);
  assert.equal(mine.hp, hpMine - 3);
  assert.equal(theirs.hp, hpTheirs - 3);
});
