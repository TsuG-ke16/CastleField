// クラシックモードの道具（PR2b）のテスト：
//   (1) mpAllCards：兵士・武器・防御などもカードの mpCost だけ MP を使う／mpPerTurn：ターンの始めに MP が増える
//   (2) secondPlayerMp：後攻の最初の MP が多い
//   (3) singleDamage：敵兵士1体にダメージ
//   (4) weakenAttack：呪い（敵兵士1体の攻撃力を下げる）
//   (5) クラシックのカード
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { buildData, loadFixture, loadOptionalData, seededRng, recordEvents } from './helpers.js';

const EXTRA = {
  bigKnight: { name: '重騎士', kind: 'soldier', hp: 4, attack: 5, speed: 3, mpCost: 3, count: 1 },
  ninja: { name: '下忍', kind: 'soldier', role: 'ninja', hp: 2, attack: 2, speed: 2, count: 1 },
  shield: { name: '盾', kind: 'defense', effect: 'shieldSoldier', amount: 3, mpCost: 2, count: 1 },
  wall: { name: '城壁', kind: 'defense', effect: 'armorCastle', amount: 5, mpCost: 2, count: 1 },
  ray: { name: '光線', kind: 'spell', effect: 'singleDamage', amount: 5, mpCost: 4, count: 1 },
  curse: { name: '呪い', kind: 'spell', effect: 'weakenAttack', amount: 2, turns: 3, mpCost: 2, count: 1 },
  smallCurse: { name: '小さな呪い', kind: 'spell', effect: 'weakenAttack', amount: 1, turns: 5, mpCost: 1, count: 1 },
};

function newGame(rules = {}, setup) {
  const game = new Game({
    cards: { ...loadFixture('cards.json'), ...EXTRA },
    rules: { ...loadFixture('rules.json'), soldiersPerTurn: 3, maxHand: 99, initialMp: 10, maxMp: 20, ...rules },
    rng: seededRng(1),
    ...(setup ? { setup } : {}),
  });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(80).fill('heal'));
  return { game, log };
}

const hand = (game, pid, type) => {
  game.debugSetHand(pid, [type]);
  return game.players[pid].hand[0].cardId;
};

/** p2 の兵士を出して、p1 の番に戻す。返り値は出した兵士 */
function enemySoldiers(game, types) {
  game.start();
  game.endTurn(); // p2 の番
  game.players.p2.mp = 20;
  const out = [];
  for (const type of types) {
    const r = game.playCard(hand(game, 'p2', type), { playerId: 'p1' });
    assert.equal(r.ok, true, r.reason);
    out.push(game.players.p2.soldiers.at(-1));
  }
  game.endTurn(); // p1 の番
  game.players.p1.mp = 20;
  return out;
}

// ================= (1) mpAllCards・mpPerTurn =================

test('mpAllCards なし：兵士は mpCost を書いても MP を使わない（今までどおり）', () => {
  const { game } = newGame();
  game.start();
  const before = game.players.p1.mp;
  assert.equal(game.playCard(hand(game, 'p1', 'bigKnight')).ok, true);
  assert.equal(game.players.p1.mp, before);
  assert.equal(game.getState(null).mpCosts.bigKnight, undefined);
});

test('mpAllCards：兵士・防御も mpCost だけ MP を使う。mpCost のないカードは0。mpCosts にも入る', () => {
  const { game, log } = newGame({ mpAllCards: true });
  game.start();
  assert.equal(game.players.p1.mp, 10);
  assert.equal(game.playCard(hand(game, 'p1', 'bigKnight')).ok, true);
  assert.equal(game.players.p1.mp, 7);
  assert.deepEqual(log.filter((e) => e.event === 'mpChanged').map((e) => [e.delta, e.reason]), [[-3, 'cast']]);
  assert.equal(game.playCard(hand(game, 'p1', 'infantry')).ok, true);
  assert.equal(game.players.p1.mp, 7);
  game.players.p1.castle.hp = 10;
  assert.equal(game.playCard(hand(game, 'p1', 'wall')).ok, true);
  assert.equal(game.players.p1.mp, 5);
  const costs = game.getState(null).mpCosts;
  assert.equal(costs.bigKnight, 3);
  assert.equal(costs.shield, 2);
  assert.equal(costs.infantry, undefined);
});

test('mpAllCards：MPが足りなければ出せない（理由）', () => {
  const { game } = newGame({ mpAllCards: true });
  game.start();
  game.players.p1.mp = 2;
  const id = hand(game, 'p1', 'bigKnight');
  assert.deepEqual(game.canPlayCard(id), { ok: false, reason: 'MPが足りません（3必要・あと1）' });
  assert.equal(game.playCard(id).ok, false);
  assert.equal(game.players.p1.soldiers.length, 0);
});

test('mpAllCards：攻撃を受けたときの防御カードも MP を使う。足りなければ防御を聞かない', () => {
  for (const [mp, asked] of [[1, false], [5, true]]) {
    const { game, log } = newGame({ mpAllCards: true, defenseReaction: true });
    game.start();
    game.players.p1.mp = 20;
    game.debugSetHand('p2', ['wall']);
    game.players.p2.mp = mp;
    assert.equal(game.playCard(hand(game, 'p1', 'fireball')).ok, true);
    assert.equal(log.some((e) => e.event === 'defenseRequested'), asked);
    if (asked) {
      assert.equal(game.getState(null).phase, 'defend');
      assert.equal(game.defend(game.players.p2.hand[0].cardId).ok, true);
      assert.equal(game.players.p2.mp, 3);
      assert.ok(log.some((e) => e.event === 'mpChanged' && e.playerId === 'p2' && e.delta === -2 && e.reason === 'cast'));
    } else {
      assert.ok(log.some((e) => e.event === 'castleDamaged' && e.playerId === 'p2'));
    }
  }
});

test('mpPerTurn：自分のターンの始めに MP が増える（reason "turn"）。上限は超えない。省略なら増えない', () => {
  const { game, log } = newGame({ mpPerTurn: 3 });
  game.start();
  assert.equal(game.players.p1.mp, 13);
  assert.deepEqual(log.filter((e) => e.event === 'mpChanged').map((e) => [e.playerId, e.delta, e.reason]), [['p1', 3, 'turn']]);
  game.endTurn();
  assert.equal(game.players.p2.mp, 13);
  game.players.p1.mp = 19;
  game.endTurn();
  assert.equal(game.players.p1.mp, 20);

  const plain = newGame().game;
  plain.start();
  plain.endTurn();
  plain.endTurn();
  assert.equal(plain.players.p1.mp, 10);
});

// ================= (2) secondPlayerMp =================

test('secondPlayerMp：後攻だけ最初の MP が多い（上限まで）。省略なら同じ', () => {
  const a = newGame({ secondPlayerMp: 3 }).game;
  assert.equal(a.players.p1.mp, 10);
  assert.equal(a.players.p2.mp, 13);
  const b = newGame({ secondPlayerMp: 3 }, { firstPlayer: 'p2' }).game;
  assert.equal(b.players.p1.mp, 13);
  assert.equal(b.players.p2.mp, 10);
  const c = newGame({ secondPlayerMp: 30 }).game;
  assert.equal(c.players.p2.mp, 20);
  const d = newGame().game;
  assert.equal(d.players.p1.mp, d.players.p2.mp);
  assert.throws(() => newGame({ secondPlayerMp: -1 }), /secondPlayerMp/);
  assert.throws(() => newGame({ mpAllCards: 'yes' }), /mpAllCards/);
});

// ================= (3) singleDamage =================

test('singleDamage：選んだ相手の兵士1体だけ。盾が先に受ける。イベントの順番', () => {
  const { game, log } = newGame();
  const [a, b] = enemySoldiers(game, ['infantry', 'infantry']);
  a.hp = 20;
  a.shield = 2;
  log.length = 0;
  const id = hand(game, 'p1', 'ray');
  assert.deepEqual(game.getTargets(id), [{ soldierId: a.soldierId }, { soldierId: b.soldierId }]);
  assert.equal(game.canPlayCard(id).needsTarget, true);
  assert.equal(game.playCard(id, { soldierId: a.soldierId }).ok, true);
  assert.equal(a.hp, 17);
  assert.equal(a.shield, 0);
  assert.equal(b.hp, 5);
  assert.deepEqual(log.map((e) => e.event), ['mpChanged', 'cardPlayed', 'spellCast', 'soldierDamaged']);
  const cast = log.find((e) => e.event === 'spellCast');
  assert.equal(cast.soldierId, a.soldierId);
  assert.equal(cast.target, 'p2');
  const dmg = log.find((e) => e.event === 'soldierDamaged');
  assert.deepEqual([dmg.amount, dmg.blocked, dmg.cause], [5, 2, 'spell']);
  assert.equal(game.players.p1.mp, 16); // 魔法なので mpAllCards がなくても MP を使う
});

test('singleDamage：倒せたら killed。兵士がいない・忍者だけなら出せない', () => {
  const { game, log } = newGame();
  const [n, s] = enemySoldiers(game, ['ninja', 'infantry']);
  const id = hand(game, 'p1', 'ray');
  assert.deepEqual(game.getTargets(id), [{ soldierId: s.soldierId }]);
  assert.equal(game.playCard(id).ok, true);
  assert.ok(log.some((e) => e.event === 'soldierDestroyed' && e.soldierId === s.soldierId && e.reason === 'killed'));
  assert.equal(n.hp, 2);
  game.players.p1.mp = 20;
  game.players.p1.playedThisTurn = false; // メインの1枚の決まりを外して確かめる
  assert.deepEqual(game.canPlayCard(hand(game, 'p1', 'ray')), { ok: false, reason: '道の上に相手の兵士がいません' });
});

test('singleDamage：霧で外れる', () => {
  const { game, log } = newGame();
  const [s] = enemySoldiers(game, ['infantry']);
  game.rollMiss = () => true;
  assert.equal(game.playCard(hand(game, 'p1', 'ray')).ok, true);
  assert.equal(s.hp, 5);
  assert.ok(log.some((e) => e.event === 'attackMissed' && e.kind === 'spell'));
  assert.ok(!log.some((e) => e.event === 'soldierDamaged'));
});

test('singleDamage：相手は盾で防御できる（kind "soldiers"）', () => {
  const { game, log } = newGame({ defenseReaction: true });
  const [s] = enemySoldiers(game, ['infantry']);
  game.debugSetHand('p2', ['shield']);
  assert.equal(game.playCard(hand(game, 'p1', 'ray')).ok, true);
  const req = log.find((e) => e.event === 'defenseRequested');
  assert.deepEqual([req.kind, req.defenderId, req.soldierIds], ['soldiers', 'p2', [s.soldierId]]);
  assert.equal(game.defend(game.players.p2.hand[0].cardId).ok, true);
  assert.equal(s.hp, 3); // 盾3が先に受けて、残り2
  assert.equal(game.getState(null).phase, 'main');
});

// ================= (4) weakenAttack =================

test('weakenAttack：状態 weakened がつく（getState の attack は変わらない）', () => {
  const { game, log } = newGame();
  const [s] = enemySoldiers(game, ['knight']);
  log.length = 0;
  assert.equal(game.playCard(hand(game, 'p1', 'curse')).ok, true);
  assert.deepEqual(log.map((e) => e.event), ['mpChanged', 'cardPlayed', 'spellCast', 'statusApplied']);
  const ap = log.find((e) => e.event === 'statusApplied');
  assert.deepEqual([ap.playerId, ap.soldierId, ap.status, ap.amount, ap.turns], ['p2', s.soldierId, 'weakened', 2, 3]);
  const st = game.getState(null).players.p2.soldiers[0];
  assert.deepEqual(st.statuses.weakened, { amount: 2, turns: 3 });
  assert.equal(st.attack, 5);
  assert.equal(game.attackOf(s), 3);
});

test('weakenAttack：城へのダメージが下がる', () => {
  const { game, log } = newGame({ soldierCastleDamageMultiplier: 2 });
  const [s] = enemySoldiers(game, ['knight']);
  s.position = 4;
  game.playCard(hand(game, 'p1', 'curse'));
  const hp = game.players.p1.castle.hp;
  game.endTurn(); // p2 の進軍で城に着く
  const hit = log.find((e) => e.event === 'castleDamaged' && e.playerId === 'p1');
  assert.equal(hit.amount, (5 - 2) * 2);
  assert.equal(game.players.p1.castle.hp, hp - 6);
});

test('weakenAttack：兵士同士の戦いのダメージも下がる', () => {
  const { game } = newGame();
  const [k] = enemySoldiers(game, ['knight']);
  k.position = 3;
  game.playCard(hand(game, 'p1', 'infantry'));
  const mine = game.players.p1.soldiers[0];
  game.playCard(hand(game, 'p1', 'curse'));
  game.endTurn(); // p2 の騎士が、1つ先の p1 の歩兵とぶつかる
  assert.equal(mine.hp, 5 - 3);
});

test('weakenAttack：攻撃力は最低1', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['infantry']);
  s.weakened = { amount: 10, turns: 2 };
  assert.equal(game.attackOf(s), 1);
});

test('weakenAttack：持ち主の進軍が終わるたびに1減り、0で治る（statusCleared）', () => {
  const { game, log } = newGame({ laneLength: 21 });
  const [s] = enemySoldiers(game, ['infantry']);
  game.playCard(hand(game, 'p1', 'curse')); // 3回
  const turnsLeft = () => game.getState(null).players.p2.soldiers[0]?.statuses.weakened?.turns ?? 0;
  game.endTurn(); // p2 の進軍 1
  assert.equal(turnsLeft(), 2);
  assert.equal(game.attackOf(s), 1);
  game.endTurn();
  game.endTurn(); // p2 の進軍 2
  assert.equal(turnsLeft(), 1);
  game.endTurn();
  game.endTurn(); // p2 の進軍 3
  assert.equal(turnsLeft(), 0);
  assert.equal(game.attackOf(s), 3);
  assert.ok(log.some((e) => e.event === 'statusCleared' && e.soldierId === s.soldierId && e.status === 'weakened'));
});

test('weakenAttack：重ねがけは大きい方にそろえる。同じか弱い呪いしかかけられない兵士は選べない', () => {
  const { game } = newGame();
  const [s] = enemySoldiers(game, ['knight']);
  game.playCard(hand(game, 'p1', 'curse')); // 2・3回
  game.players.p1.playedThisTurn = false; // メインの1枚の決まりを外して確かめる
  assert.deepEqual(game.canPlayCard(hand(game, 'p1', 'curse')), { ok: false, reason: 'もう同じ状態になっています' });
  assert.equal(game.playCard(hand(game, 'p1', 'smallCurse')).ok, true); // 1・5回
  assert.deepEqual(s.weakened, { amount: 2, turns: 5 });
});

test('weakenAttack：霧でも外れない。忍者は選べない', () => {
  const { game } = newGame();
  const [n, s] = enemySoldiers(game, ['ninja', 'knight']);
  game.rollMiss = () => true;
  const id = hand(game, 'p1', 'curse');
  assert.deepEqual(game.getTargets(id), [{ soldierId: s.soldierId }]);
  assert.equal(game.playCard(id).ok, true);
  assert.ok(s.weakened);
  assert.equal(n.weakened, null);
});

// ================= (5) クラシックのカード =================

test('クラシック：全カードに mpCost があり、new Game() が通る。兵士にも MP がかかる', () => {
  const { cards, rules } = buildData({ mode: 'classic' });
  for (const [k, c] of Object.entries(cards)) {
    assert.ok(Number.isInteger(c.mpCost) && c.mpCost >= 0, `${k} に mpCost がない`);
  }
  assert.equal(rules.mpAllCards, true);
  const game = new Game({ cards, rules, ...loadOptionalData('classic'), rng: seededRng(3), setup: { firstPlayer: 'p1' } });
  const st = game.getState(null);
  assert.equal(st.mpCosts.classic_king_infantry, cards.classic_king_infantry.mpCost);
  assert.equal(st.players.p2.mp, rules.initialMp + rules.secondPlayerMp);
  for (const k of ['classic_king_holy_ray', 'classic_king_holy_fireball', 'classic_demon_shadow', 'classic_demon_curse_mark', 'classic_demon_dark_fireball']) {
    assert.ok(cards[k], k);
  }
});
