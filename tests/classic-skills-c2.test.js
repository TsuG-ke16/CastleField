// 魔力(P)・手札(H)・時間(T)・模倣(I)と、横断 X04/X05/X18/X22/X24/X44/X47 の短いスモークテスト（skillC2）。
// 各ノード1〜2件。基盤の部品（rt.enqueue・rt.planCardCost など）を直接使う単体寄りの確認と、実際にカードを使う確認を混ぜている。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { Soldier } from '../js/game/Soldier.js';
import { HANDLERS } from '../js/game/skills/handlers/index.js';
import { orderBuild } from '../js/game/SkillTree.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

/** 目的のノードまでの最短経路と必須ノードを足した、合法な取得順（テスト用） */
const TREE = loadOptionalData('classic').skillTree;
function pathTo(...targets) {
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  const groups = new Set(TREE.nodes.filter((n) => !n.cross).map((n) => n.group));
  for (const g of groups) for (const [a, b] of TREE.edges) link(a === 'START' ? 'START' : g + a, g + b);
  for (const n of TREE.nodes) if (n.ends) for (const e of n.ends) link(n.id, e);
  const need = new Set();
  const add = (id) => {
    if (need.has(id)) return;
    const prev = new Map([['START', null]]);
    const q = ['START'];
    while (q.length && !prev.has(id)) {
      const cur = q.shift();
      for (const nx of adj.get(cur) ?? []) if (!prev.has(nx)) { prev.set(nx, cur); q.push(nx); }
    }
    for (let at = id; at && at !== 'START'; at = prev.get(at)) need.add(at);
    for (const r of TREE.nodes.find((n) => n.id === id).requires ?? []) add(r);
  };
  for (const t of targets) add(t);
  const ids = orderBuild(TREE, [...need], TREE.budget);
  assert.ok(ids, `${targets} の合法な取得順が作れません`);
  return ids;
}

const RAY = 'classic_king_holy_ray'; // 単体攻撃魔法（威力5・MP4）
const HEAL = 'classic_king_minor_heal';
const INF = 'classic_king_infantry';

function classicGame(skills, { seed = 1, mulligan = false } = {}) {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  return new Game({ ...opts, cards, rules, setup: { skills }, rng: seededRng(seed) });
}

function scripted(values) {
  const list = [...values];
  const fn = () => {
    if (list.length === 0) throw new Error('乱数を予定より多く引きました');
    return list.shift();
  };
  fn.left = () => list.length;
  return fn;
}

function endTurn(game) {
  const r = game.endTurn();
  assert.equal(r.ok, true, r.reason);
  if (game.phase === 'discard') {
    const p = game.players[game.currentPlayer];
    assert.equal(game.discard(p.hand.slice(0, game.discardCount).map((c) => c.cardId)).ok, true);
  }
}

/** ownerId の道に type の兵士を直接置く（HP は大きくして倒れないように） */
function putSoldier(game, ownerId, type = 'classic_king_heavy', hp = 50) {
  const foe = game.opponentsOf(ownerId)[0];
  const road = game.roadsBetween(game.side(ownerId), game.side(foe.id))[0];
  const id = `s${String(game.nextSoldierNumber++).padStart(2, '0')}`;
  const s = new Soldier(id, { type, def: game.cardDefs[type] }, road.roadId, foe.id);
  s.hp = hp;
  s.maxHp = hp;
  game.players[ownerId].soldiers.push(s);
  return s;
}

const start = (skills, opts) => {
  const game = classicGame(skills, opts);
  game.start();
  return game;
};
/** 手札を4枚にしておく（初期手札＋ドローは手札上限の6枚を超えているので、追加ドローが断られないように） */
const trimHand = (game, id = 'p1') => {
  game.players[id].hand = game.players[id].hand.slice(0, 4);
};
const handOf = (game, id, type) => game.players[id].hand.find((c) => c.type === type);
const used = (game, id, skill) => game.skillCounters(id)[skill];

// ================= P =================

test('P02/P08：上限超過のMPを貯蔵（最大5）。自ターン開始に1まで自動移送。P08 は貯蔵を空きMP分まで一括移送', () => {
  const game = start([pathTo('P02', 'P08'), []]);
  const p1 = game.players.p1;
  const st = game.skillRt.stateOf('p1');
  p1.mp = game.maxMpOf(p1);
  game.changeMp(p1, 4, 'test');
  assert.equal(st.res.storedMp, 4);
  game.changeMp(p1, 4, 'test');
  assert.equal(st.res.storedMp, 5); // 最大5
  p1.mp = 5;
  const r = game.skillAction('p1', 'P08', { amount: 3 });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual([p1.mp, st.res.storedMp], [8, 2]);
  assert.equal(game.skillAction('p1', 'P08', { amount: 1 }).ok, false); // 各自ターン1回
  p1.mp = 0;
  endTurn(game);
  endTurn(game); // p1 のターン開始：回復（rules.mpPerTurn。段階A1 で 3→5）のあとに貯蔵から1
  assert.equal(p1.mp, game.rules.mpPerTurn + 1);
  assert.equal(st.res.storedMp, 1);
  assert.ok(used(game, 'p1', 'P02') >= 3 && used(game, 'p1', 'P08') === 1);
});

test('P03：コイン1でMP2（各自ターン1回）。コインがなければ使えない', () => {
  const game = start([pathTo('P03'), []]);
  const p1 = game.players.p1;
  p1.mp = 5;
  p1.coins = 0;
  assert.equal(game.skillAction('p1', 'P03').ok, false);
  p1.coins = 3;
  assert.equal(game.skillAction('p1', 'P03').ok, true);
  assert.deepEqual([p1.mp, p1.coins], [7, 2]);
  assert.equal(game.skillAction('p1', 'P03').ok, false);
});

test('P04：魔物にとどめを刺すと戦闘内コイン+1、試合中2回まで', () => {
  const game = start([pathTo('P04'), []]);
  const p1 = game.players.p1;
  const before = p1.coins;
  for (let i = 0; i < 3; i++) {
    game.emit('monsterDefeated', { monsterId: `m${i}`, playerId: 'p1', reward: 0 });
    game.skillRt.drain();
  }
  assert.equal(p1.coins - before, 2);
  assert.equal(used(game, 'p1', 'P04'), 2);
});

test('P05：使用宣言時10%でMPコスト-1（最低1）。見積もり（preview）では乱数を使わない', () => {
  const game = start([pathTo('P05'), []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  const card = game.createCard(RAY);
  game.rng = scripted([]);
  assert.equal(rt.planCardCost(p1, card, 4, {}, { preview: true }).mp, 4);
  game.rng = scripted([0.05]);
  assert.equal(rt.planCardCost(p1, card, 4, {}, {}).mp, 3);
  game.rng = scripted([0.5]);
  assert.equal(rt.planCardCost(p1, card, 4, {}, {}).mp, 4);
  game.rng = scripted([]);
  assert.equal(rt.planCardCost(p1, card, 1, {}, {}).mp, 1); // 最低1：減らせないときは判定しない
  assert.equal(used(game, 'p1', 'P05'), 1);
});

test('P06：使用宣言時のMPが上限なら、その攻撃魔法の直接基礎ダメージ+2', () => {
  const dmg = (full) => {
    const game = start([pathTo('P06'), []]);
    const p1 = game.players.p1;
    const foe = putSoldier(game, 'p2');
    game.debugSetHand('p1', [RAY]);
    p1.mp = full ? game.maxMpOf(p1) : 8;
    const r = game.playCard(p1.hand[0].cardId, { soldierId: foe.soldierId });
    assert.equal(r.ok, true, r.reason);
    return { lost: 50 - foe.hp, count: used(game, 'p1', 'P06') };
  };
  assert.deepEqual(dmg(false), { lost: 5, count: 0 });
  assert.deepEqual(dmg(true), { lost: 7, count: 1 });
});

// ================= H =================

test('H01：戻す枚数0〜2なら先に引いてから戻したカードを山札へ混ぜる（試合中1回）。3枚以上は通常のマリガン', () => {
  const game = classicGame([pathTo('H01'), []], { mulligan: true });
  game.start();
  assert.equal(game.phase, 'mulligan');
  const p1 = game.players.p1;
  const deckTop = game.pileOf('p1').deck.slice(0, 2).map((c) => c.cardId);
  const give = p1.hand.slice(0, 2).map((c) => c.cardId);
  assert.equal(game.mulligan('p1', give).ok, true);
  assert.deepEqual(p1.hand.slice(-2).map((c) => c.cardId), deckTop); // 山札の上の2枚をそのまま引いた
  assert.ok(give.every((id) => game.pileOf('p1').deck.some((c) => c.cardId === id)));
  assert.equal(used(game, 'p1', 'H01'), 1);
  // 3枚戻すときは H01 を使わず通常のマリガン
  const g2 = classicGame([pathTo('H01'), []], { mulligan: true });
  g2.start();
  assert.equal(g2.mulligan('p1', g2.players.p1.hand.slice(0, 3).map((c) => c.cardId)).ok, true);
  assert.equal(used(g2, 'p1', 'H01'), 0);
});

test('H02：通常ドローしたカードを10%で一時コピー（各自ターン1回・コピーからコピーは作らない）', () => {
  const game = start([pathTo('H02'), []]);
  trimHand(game);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  const n = p1.hand.length;
  const drawn = p1.hand[0];
  game.rng = scripted([0.05]);
  rt.beginRoot('test');
  rt.enqueue('onDraw', { ownerId: 'p1', cardIds: [drawn.cardId], kind: 'normal' });
  rt.drain();
  assert.equal(p1.hand.length, n + 1);
  const copy = p1.hand.at(-1);
  assert.deepEqual([copy.type, Boolean(copy.skillCopy)], [drawn.type, true]);
  rt.enqueue('onDraw', { ownerId: 'p1', cardIds: [drawn.cardId], kind: 'normal' });
  rt.drain(); // 各自ターン1回：乱数は引かない
  assert.equal(p1.hand.length, n + 1);
});

test('H03：捨て札の1枚を手札へ（試合中1回）', () => {
  const game = start([pathTo('H03'), []]);
  trimHand(game);
  const p1 = game.players.p1;
  const pile = game.pileOf('p1');
  const c = p1.takeFromHand(p1.hand[0].cardId);
  game.throwAway('p1', c, { used: false });
  const opt = game.listSkillActions('p1').find((a) => a.actionId === 'H03');
  assert.equal(opt.ok, true);
  const n = p1.hand.length;
  assert.equal(game.skillAction('p1', 'H03', { cardId: c.cardId }).ok, true);
  assert.equal(p1.hand.length, n + 1);
  assert.ok(!pile.discard.includes(c));
  assert.equal(game.skillAction('p1', 'H03', { cardId: c.cardId }).ok, false);
});

test('H04/H05：山札の上から最初の兵士／魔法を引く（試合中1回ずつ）', () => {
  const game = start([pathTo('H04', 'H05'), []]);
  const p1 = game.players.p1;
  game.debugSetHand('p1', []);
  game.debugSetDeck([HEAL, INF, RAY, 'classic_king_heavy'], 'p1');
  assert.equal(game.skillAction('p1', 'H04').ok, true);
  assert.deepEqual(p1.hand.map((c) => c.type), [INF]);
  assert.equal(game.skillAction('p1', 'H05').ok, true);
  assert.deepEqual(p1.hand.map((c) => c.type), [INF, HEAL]);
  assert.deepEqual(game.pileOf('p1').deck.map((c) => c.type), [RAY, 'classic_king_heavy']); // 残りの順序はそのまま
  assert.equal(game.skillAction('p1', 'H04').ok, false);
});

test('H06：同一自ターンで手札から3枚目のカードを使うと1枚ドロー（各自ターン1回）', () => {
  const game = start([pathTo('H06'), []]);
  trimHand(game);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  const n = p1.hand.length;
  rt.beginRoot('test');
  rt.enqueue('onCardPlayed', { ownerId: 'p1', cardNumberThisTurn: 2, origin: 'hand' });
  rt.drain();
  assert.equal(p1.hand.length, n);
  rt.enqueue('onCardPlayed', { ownerId: 'p1', cardNumberThisTurn: 3, origin: 'hand' });
  rt.drain();
  assert.equal(p1.hand.length, n + 1);
  assert.equal(used(game, 'p1', 'H06'), 1);
});

test('H07：手札1枚を捨てて1枚ドロー（各自ターン1回）', () => {
  const game = start([pathTo('H07'), []]);
  trimHand(game);
  const p1 = game.players.p1;
  const target = p1.hand[0];
  const n = p1.hand.length;
  const r = game.skillAction('p1', 'H07', { cardId: target.cardId });
  assert.equal(r.ok, true, r.reason);
  assert.equal(p1.hand.length, n);
  assert.ok(!p1.hand.includes(target));
  assert.equal(game.skillAction('p1', 'H07', { cardId: p1.hand[0].cardId }).ok, false);
});

test('H08：山札の上3枚から1枚と手札1枚を交換。残りの順序は変わらない', () => {
  const game = start([pathTo('H08'), []]);
  const p1 = game.players.p1;
  game.debugSetHand('p1', [INF]);
  game.debugSetDeck([HEAL, RAY, 'classic_king_heavy', INF], 'p1');
  const give = p1.hand[0].cardId;
  const opts = game.listSkillActions('p1').find((a) => a.actionId === 'H08').options;
  assert.equal(opts.length, 3);
  assert.deepEqual(opts[0].preview.reveal, [HEAL, RAY, 'classic_king_heavy']);
  assert.equal(game.skillAction('p1', 'H08', { handCardId: give, index: 1 }).ok, true);
  assert.deepEqual(p1.hand.map((c) => c.type), [RAY]);
  assert.deepEqual(game.pileOf('p1').deck.map((c) => c.type), [HEAL, INF, 'classic_king_heavy', INF]);
});

// ================= T =================

test('T01/T07：自ターン最初の単体攻撃魔法を次の自ターン開始に威力50%で予約発動。解決でMP+1（T07）', () => {
  const game = start([pathTo('T01', 'T07'), []]);
  const p1 = game.players.p1;
  const foe = putSoldier(game, 'p2');
  game.debugSetHand('p1', [RAY, RAY]);
  p1.mp = 20;
  const [a, b] = p1.hand.map((c) => c.cardId);
  assert.equal(game.playCard(a, { soldierId: foe.soldierId }).ok, true);
  assert.equal(foe.hp, 45);
  endTurn(game);
  endTurn(game); // p1 のターン開始：予約発動 floor(5×0.5)=2
  assert.equal(foe.hp, 43);
  assert.equal(used(game, 'p1', 'T01'), 1);
  assert.equal(used(game, 'p1', 'T07'), 1);
  assert.equal(game.skillRt.stateOf('p1').scheduled.length, 0);
  void b;
});

test('T02：自身が付与した有害状態の期限減算を20%で見送る（各状態の延長は最大1ターン）', () => {
  const game = start([pathTo('T02'), []]);
  const rt = game.skillRt;
  const foe = putSoldier(game, 'p2');
  rt.statusSource.set(foe.soldierId, { poison: 'p1' });
  game.rng = scripted([0.05]);
  assert.equal(rt.dotHold(game.players.p2, foe, 'poison'), true);
  assert.equal(rt.dotHold(game.players.p2, foe, 'poison'), false); // 最大1ターン：乱数も引かない
  game.rng = scripted([0.9]);
  assert.equal(rt.dotHold(game.players.p2, putSoldier(game, 'p2'), 'poison'), false);
  assert.equal(used(game, 'p1', 'T02'), 1);
});

test('T03：自ターン終了時にMPが2以上なら、次の自ターン開始時MP+1', () => {
  const game = start([pathTo('T03'), []]);
  const p1 = game.players.p1;
  p1.mp = 2;
  endTurn(game);
  endTurn(game);
  assert.equal(p1.mp, 2 + game.rules.mpPerTurn + 1);
  assert.equal(used(game, 'p1', 'T03'), 1);
});

test('T04：持続ダメージの次の1tickを見送る（ダメージなし・期限も減らない）。次のtickは通常どおり', () => {
  const game = start([pathTo('T04'), []]);
  const rt = game.skillRt;
  const s = putSoldier(game, 'p1');
  s.poison = { amount: 2, turns: 3 };
  assert.equal(game.skillAction('p1', 'T04', { soldierId: s.soldierId, status: 'poison' }).ok, true);
  assert.equal(rt.dotAmount(game.players.p1, s, 'poison', 2), 0);
  assert.equal(rt.dotHold(game.players.p1, s, 'poison'), true);
  assert.equal(rt.dotAmount(game.players.p1, s, 'poison', 2), 2);
  assert.equal(rt.dotHold(game.players.p1, s, 'poison'), false);
  assert.equal(game.skillAction('p1', 'T04', { soldierId: s.soldierId, status: 'poison' }).ok, false); // 各自ターン1回
});

test('T05：継続回復（水の精霊の城回復）のあと、次の自ターンにHP1回復を予約（予約由来からは作らない）', () => {
  const game = start([pathTo('T05'), []]);
  const p1 = game.players.p1;
  p1.castle.takeDamage(10);
  const hp = p1.castle.hp;
  game.skillRt.beginRoot('test');
  game.emit('spiritTriggered', { playerId: 'p1', type: 'x', spirit: 'water', amount: 1 });
  game.emit('castleHealed', { playerId: 'p1', amount: 1, hp });
  game.skillRt.drain();
  assert.equal(game.skillRt.stateOf('p1').scheduled.length, 1);
  endTurn(game);
  endTurn(game);
  assert.equal(p1.castle.hp, hp + 1);
  assert.equal(game.skillRt.stateOf('p1').scheduled.length, 0);
  assert.equal(used(game, 'p1', 'T05'), 1);
});

test('T06：次の自ターン開始に1枚追加ドローを予約（試合中2回）', () => {
  const game = start([pathTo('T06'), []]);
  const p1 = game.players.p1;
  assert.equal(game.skillAction('p1', 'T06').ok, true);
  assert.equal(game.skillAction('p1', 'T06').ok, true);
  assert.equal(game.skillAction('p1', 'T06').ok, false);
  game.debugSetHand('p1', []);
  endTurn(game);
  endTurn(game);
  assert.equal(p1.hand.length, game.rules.drawPerTurn + 2);
});

test('T08：前の自ターンの最初の単体攻撃魔法を元の基礎威力100%で再発動（対象を選び直せる・試合中1回）', () => {
  const game = start([pathTo('T08'), []]);
  const p1 = game.players.p1;
  const foe = putSoldier(game, 'p2');
  const other = putSoldier(game, 'p2');
  game.debugSetHand('p1', [RAY]);
  p1.mp = 20;
  assert.equal(game.skillAction('p1', 'T08', { targetId: foe.soldierId }).ok, false); // まだ前のターンがない
  assert.equal(game.playCard(p1.hand[0].cardId, { soldierId: foe.soldierId }).ok, true);
  endTurn(game);
  endTurn(game);
  assert.equal(game.skillAction('p1', 'T08', { targetId: other.soldierId }).ok, true);
  assert.equal(other.hp, 45);
  assert.equal(game.skillAction('p1', 'T08', { targetId: foe.soldierId }).ok, false); // 試合中1回
});

// ================= I =================

test('I01：相手が次にドローする山札の先頭1枚を自分だけが確認（各自ターン1回）', () => {
  const game = start([pathTo('I01'), []]);
  game.debugSetDeck([RAY, HEAL], 'p2');
  assert.equal(game.skillAction('p1', 'I01').ok, true);
  const mine = game.getState('p1').players.p1.skillState.peek.I01;
  assert.equal(mine.type, game.pileOf('p2').deck[0].type);
  assert.equal(game.getState('p2').players.p1.skillState.peek, undefined); // 相手には見えない
  assert.equal(game.skillAction('p1', 'I01').ok, false);
});

test('I02/I03/I04/X47：敵の単体攻撃魔法・兵士を一時コピー。模倣由来のカードはMP-1（最低1）で、使うと1枚ドロー', () => {
  const game = start([pathTo('I02', 'I03', 'I04', 'X47'), []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  game.debugSetHand('p1', []);
  game.rng = scripted([0.05]);
  rt.beginRoot('test');
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: RAY, kind: 'spell', copy: false });
  rt.drain();
  assert.deepEqual(p1.hand.map((c) => [c.type, c.skillCopy?.skillId]), [[RAY, 'I02']]);
  game.rng = scripted([0.05]);
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: INF, kind: 'soldier', copy: false });
  rt.drain();
  assert.deepEqual(p1.hand.map((c) => c.skillCopy?.skillId), ['I02', 'I03']);
  // コピーのコピーは作らない（乱数も引かない）
  game.rng = scripted([]);
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: RAY, kind: 'spell', copy: true });
  rt.drain();
  assert.equal(p1.hand.length, 2);
  // I04：模倣由来のコピーはMP-1（見積もりにも効く）。ふつうのカードは変わらない
  const copy = p1.hand[0];
  assert.equal(rt.planCardCost(p1, copy, 4, {}, { preview: true }).mp, 3);
  assert.equal(rt.planCardCost(p1, game.createCard(RAY), 4, {}, { preview: true }).mp, 4);
  // X47：模倣カードを使った後に1枚ドロー
  const foe = putSoldier(game, 'p2');
  p1.mp = 10;
  game.debugSetDeck([HEAL, HEAL], 'p1');
  const n = p1.hand.length;
  assert.equal(game.playCard(copy.cardId, { soldierId: foe.soldierId }).ok, true);
  assert.equal(p1.hand.length, n - 1 + 1);
  assert.equal(p1.mp, 7); // 4-1
  assert.equal(used(game, 'p1', 'X47'), 1);
});

test('I05：敵が攻撃魔法を使った後、次の自身の攻撃魔法の基礎ダメージ+1（非累積・各自ターン1回付与）', () => {
  const game = start([pathTo('I05'), []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  const foe = putSoldier(game, 'p2');
  rt.beginRoot('test');
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: RAY, kind: 'spell' });
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: RAY, kind: 'spell' });
  rt.drain();
  game.debugSetHand('p1', [RAY, RAY]);
  p1.mp = 20;
  game.playCard(p1.hand[0].cardId, { soldierId: foe.soldierId });
  assert.equal(foe.hp, 50 - 6);
  // 1枚目で使い切り：次の攻撃魔法には乗らない（メインは1ターン1枚なので次のターンに）
  endTurn(game);
  endTurn(game);
  game.playCard(p1.hand.find((c) => c.type === RAY).cardId, { soldierId: foe.soldierId });
  assert.equal(foe.hp, 50 - 6 - 5);
  assert.equal(used(game, 'p1', 'I05'), 1);
});

test('I06：敵が回復魔法を使った後、次の自身の回復魔法の回復量+2', () => {
  const game = start([pathTo('I06'), []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  p1.castle.takeDamage(20);
  const hp = p1.castle.hp;
  rt.beginRoot('test');
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: HEAL, kind: 'spell' });
  rt.drain();
  game.debugSetHand('p1', [HEAL, HEAL]);
  p1.mp = 20;
  game.playCard(p1.hand[0].cardId);
  assert.equal(p1.castle.hp, hp + 5 + 2);
  assert.equal(game.skillRt.stateOf('p1').vars.I06, undefined); // 1回で使い切り
  endTurn(game);
  endTurn(game);
  game.playCard(p1.hand.find((c) => c.type === HEAL).cardId);
  assert.equal(p1.castle.hp, hp + 5 + 2 + 5);
});

test('I07：敵が手札から3枚使うと、次の自ターン開始に1枚追加ドロー', () => {
  const game = start([pathTo('I07'), []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  rt.beginRoot('test');
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: RAY, kind: 'spell', cardNumberThisTurn: 2 });
  rt.enqueue('onEnemyCardPlayed', { ownerId: 'p1', enemyId: 'p2', cardType: RAY, kind: 'spell', cardNumberThisTurn: 3 });
  rt.drain();
  game.debugSetHand('p1', []);
  endTurn(game);
  endTurn(game);
  assert.equal(p1.hand.length, game.rules.drawPerTurn + 1);
});

test('I08：敵兵士1体の弱体トークンを自陣に召喚（試合中1回・固有能力なし）', () => {
  const game = start([pathTo('I08'), []]);
  const p1 = game.players.p1;
  const foe = putSoldier(game, 'p2', 'classic_king_heavy');
  const opt = game.listSkillActions('p1').find((a) => a.actionId === 'I08');
  assert.equal(opt.ok, true);
  assert.equal(game.skillAction('p1', 'I08', { targetId: foe.soldierId }).ok, true);
  const token = p1.soldiers.find((s) => s.skillToken);
  assert.deepEqual([token.maxHp, token.baseAttack, token.skillToken.kind], [4, 1, 'weak']);
  assert.equal(game.skillAction('p1', 'I08', { targetId: foe.soldierId }).ok, false);
});

// ================= X =================

test('X04：貯蔵MP2を消費して1枚ドロー（各自ターン1回）', () => {
  const game = start([pathTo('P02', 'X04'), []]);
  trimHand(game);
  const p1 = game.players.p1;
  const st = game.skillRt.stateOf('p1');
  assert.equal(game.skillAction('p1', 'X04').ok, false); // 貯蔵がない
  st.res.storedMp = 3;
  const n = p1.hand.length;
  assert.equal(game.skillAction('p1', 'X04').ok, true);
  assert.deepEqual([p1.hand.length, st.res.storedMp], [n + 1, 1]);
  assert.equal(game.skillAction('p1', 'X04').ok, false);
});

test('X05：非トークン味方兵士の死亡時、山札の先頭側の兵士カードを引く（各自ターン1回）', () => {
  const game = start([pathTo('X05'), []]);
  const p1 = game.players.p1;
  game.debugSetHand('p1', []);
  game.debugSetDeck([HEAL, INF, RAY], 'p1');
  const s = putSoldier(game, 'p1', INF, 3);
  game.skillRt.beginRoot('test');
  game.removeSoldier(p1, s, 'killed');
  game.skillRt.drain();
  assert.deepEqual(p1.hand.map((c) => c.type), [INF]);
  assert.equal(used(game, 'p1', 'X05'), 1);
});

test('X18：予約発動した単体攻撃魔法に通常やまびこを1回だけ許可（M02 の率・威力50%）', () => {
  const game = start([pathTo('T01', 'M02', 'X18'), []]);
  const p1 = game.players.p1;
  const foe = putSoldier(game, 'p2');
  game.debugSetHand('p1', [RAY]);
  p1.mp = 20;
  assert.equal(game.playCard(p1.hand[0].cardId, { soldierId: foe.soldierId }).ok, true);
  endTurn(game);
  game.rng = scripted([0.05, 0.05, 0.05, 0.05]); // やまびこの判定は成功。X18 は1回だけなので、続きの判定は使われない
  const before = foe.hp;
  endTurn(game);
  assert.equal(before - foe.hp >= 2, true); // 予約の2
  assert.equal(used(game, 'p1', 'X18'), 1);
  assert.ok(game.skillRt.log.some((e) => e.kind === 'extra' && e.extraKind === 'echo' && e.parentOrigin === 'scheduled'));
});

test('X22：模倣由来カードのやまびこは、実際に起きたときに数える（判定の本体は M02 側）。ハンドラは登録済み', () => {
  assert.ok(HANDLERS.X22.on.onAttackResolve);
  assert.ok(HANDLERS.X18.on.onAttackResolve);
});

test('X24：幸運対象の最終失敗を自ターン中1件記録し、次の自ターン開始に同じ判定を1回再試行（再試行からは延期しない）', () => {
  const game = start([pathTo('X24'), []]);
  const rt = game.skillRt;
  const log = [];
  const roll = (tag) => {
    rt.api('p1', 'P05', null).roll(0.5, { retry: () => { log.push(`retry:${tag}`); }, label: tag });
  };
  game.rng = scripted([0.9, 0.9]);
  roll('a');
  roll('b'); // 自ターン中1件：2件目は記録しない
  game.rng = seededRng(7);
  endTurn(game);
  endTurn(game);
  assert.deepEqual(log, ['retry:a']);
  assert.equal(used(game, 'p1', 'X24'), 1);
  // 無効なら破棄（false を返すと数えない）
  game.rng = scripted([0.9]);
  rt.api('p1', 'P05', null).roll(0.5, { retry: () => false });
  game.rng = seededRng(8);
  endTurn(game);
  endTurn(game);
  assert.equal(used(game, 'p1', 'X24'), 1);
});

test('X44：自ターン終了時に手札2枚以上なら次のドローの先頭2枚を自分だけ確認し、予約した順序にする', () => {
  const game = start([pathTo('X44'), []]);
  const p1 = game.players.p1;
  game.debugSetDeck([RAY, HEAL, INF], 'p1');
  assert.equal(game.skillAction('p1', 'X44', { swap: true }).ok, true);
  endTurn(game);
  assert.deepEqual(game.players.p2.hand.slice(-2).map((c) => c.type), [HEAL, RAY]); // 共有山札：次のドローは入れ替えた順
  assert.deepEqual(game.skillRt.stateOf('p1').peek.X44.cards.map((c) => c.type), [HEAL, RAY]);
  assert.equal(game.getState('p2').players.p1.skillState.peek, undefined);
  assert.equal(used(game, 'p1', 'X44') >= 1, true);
  void p1;
});

test('スキルのない・通常のゲームは乱数も状態も変えない（P/H/T/I のノードを取らない席は何も起きない）', () => {
  const a = classicGame([[], []]);
  a.start();
  assert.equal(a.skillRt, null);
  const { cards, rules } = buildData();
  const g = new Game({ cards, rules, rng: seededRng(1) });
  assert.equal(g.skillRt, null);
});
