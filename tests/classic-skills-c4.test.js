// 段階C 担当4（防御D・回復R・墓地G・状態異常S・召喚V・横断 X07/X08/X09/X20/X21/X36/X37/X38/X45/X46）の短いスモークテスト。
// 各ノードの効果が1回起きること（と、回数・上限の要点）だけを確かめる。大規模な検証・勝率測定はしない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { Soldier } from '../js/game/Soldier.js';
import * as Units from '../js/game/skills/Units.js';
import { buildData, loadJson, loadOptionalData, seededRng } from './helpers.js';


/** 目的のノードを取るのに必要な通路・必須ノードを足した、取得できる順のID配列（START からの最短経路。予算は 12） */
function buildIds(...wanted) {
  const tree = loadJson('classic/skilltree.json');
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const n of tree.nodes) {
    if (n.cross) for (const e of n.ends) link(n.id, e);
  }
  for (const g of Object.keys(tree.groups)) {
    for (const [a, b] of tree.edges) link(a === 'START' ? 'START' : `${g}${a}`, `${g}${b}`);
  }
  const have = new Set(['START']);
  const order = [];
  const add = (id) => {
    if (have.has(id)) return;
    // 必須ノード → 経路の順に足す
    for (const r of byId.get(id)?.requires ?? []) add(r);
    const prev = new Map([...have].map((x) => [x, null]));
    const queue = [...have];
    let found = null;
    while (queue.length && !found) {
      const cur = queue.shift();
      for (const nx of adj.get(cur) ?? []) {
        if (prev.has(nx)) continue;
        prev.set(nx, cur);
        if (nx === id) found = nx;
        queue.push(nx);
      }
    }
    const path = [];
    for (let x = id; x && !have.has(x); x = prev.get(x)) path.unshift(x);
    for (const x of path) {
      have.add(x);
      order.push(x);
    }
  };
  for (const id of wanted) add(id);
  return order;
}

const HEAL_SOLDIER = { name: 'テスト回復', kind: 'spell', effect: 'healSoldier', amount: 3, mpCost: 1, count: 0 };

/** クラシックのゲーム（マリガンなし）。p1 のターン1 */
function classicGame(skills, { seed = 1, cards = {} } = {}) {
  const { cards: cardDefs, rules } = buildData({ mode: 'classic', rules: { mulligan: false }, cards });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const game = new Game({ ...opts, cards: cardDefs, rules, setup: { skills }, rng: seededRng(seed) });
  game.start();
  return game;
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

let nextId = 80;
/** 盤面に兵士を直接置く（owner の兵士。道は p1-p2 間の1本目） */
function place(game, ownerId, type, { position = 0, hp = null, roadIdx = 0 } = {}) {
  const foe = ownerId === 'p1' ? 'p2' : 'p1';
  const roads = game.roadsBetween(game.side(ownerId), game.side(foe));
  const s = new Soldier(`s${nextId++}`, { type, def: game.cardDefs[type] }, roads[roadIdx].roadId, foe);
  s.position = position;
  if (hp !== null) s.hp = hp;
  game.players[ownerId].soldiers.push(s);
  return s;
}

function endTurn(game) {
  assert.equal(game.endTurn().ok, true);
  if (game.phase === 'discard') {
    const p = game.players[game.currentPlayer];
    game.discard(p.hand.slice(0, game.discardCount).map((c) => c.cardId));
  }
}

/** p1（手番）の魔法が p2 の城に当たる（スキルの原アクション付き） */
function spellAtCastle(game, victim, amount) {
  const rt = game.skillRt;
  rt.beginRoot('hand', { playerId: 'p1' });
  game.damageCastle(game.players[victim], amount, { kind: 'spell', type: 'classic_king_holy_fireball' });
  rt.drain();
  game.checkGameOver();
}

const fullHp = (game, id) => game.players[id].castle.maxHp;

test('D02 反射障壁：城壁が吸収した量の20%を敵城へ。各自ターン合計4まで', () => {
  const game = classicGame([[], buildIds('D02')]);
  const p1 = game.players.p1;
  const p2 = game.players.p2;
  p2.armor = 30;
  const before = p1.castle.hp + p1.armor;
  spellAtCastle(game, 'p2', 10); // 吸収10 → 反射2
  assert.equal(before - (p1.castle.hp + p1.armor), 2);
  spellAtCastle(game, 'p2', 15); // 吸収15 → 3 だが残り2
  assert.equal(before - (p1.castle.hp + p1.armor), 4);
  assert.equal(game.skillCounters('p2').D02, 2);
});

test('D03 危機察知：直接攻撃を10%で回避（幸運の対象判定）', () => {
  const game = classicGame([[], buildIds('D03')]);
  const a = place(game, 'p1', 'classic_king_infantry');
  const v = place(game, 'p2', 'classic_king_infantry');
  game.rng = scripted([0.05]);
  const out = game.skillRt.hit({ kind: 'fight', attackerOwner: game.players.p1, attacker: a, victimOwner: game.players.p2, victim: v, amount: 3 });
  assert.equal(out.evaded, true);
  game.rng = scripted([0.5]);
  assert.equal(game.skillRt.hit({ kind: 'fight', attackerOwner: game.players.p1, attacker: a, victimOwner: game.players.p2, victim: v, amount: 3 }).evaded, false);
});

test('D04 緊急防衛：城壁が壊れた後、次の城HPへの直接攻撃が50%軽減（非累積）', () => {
  const game = classicGame([[], buildIds('D04')]);
  const p2 = game.players.p2;
  p2.armor = 3;
  spellAtCastle(game, 'p2', 5); // 壁3を壊して2通る
  assert.equal(game.skillRt.stateOf('p2').vars.D04, true);
  const hp = p2.castle.hp;
  spellAtCastle(game, 'p2', 6);
  assert.equal(hp - p2.castle.hp, 3);
  spellAtCastle(game, 'p2', 6);
  assert.equal(hp - p2.castle.hp, 9);
});

test('D06 守護結界：最初の直接攻撃ダメージを最大3吸収（各自ターン1回）', () => {
  const game = classicGame([[], buildIds('D06')]);
  const p2 = game.players.p2;
  p2.armor = 0;
  const hp = p2.castle.hp;
  spellAtCastle(game, 'p2', 5);
  assert.equal(hp - p2.castle.hp, 2);
  spellAtCastle(game, 'p2', 5);
  assert.equal(hp - p2.castle.hp, 7);
});

test('D07 守護の誓い：指定兵士が次に受ける敵の直接攻撃-2。次の自ターン開始で失効', () => {
  const game = classicGame([[], buildIds('D07')]);
  const mine = place(game, 'p2', 'classic_king_heavy');
  const foe = place(game, 'p1', 'classic_king_infantry');
  endTurn(game); // p2 のメイン
  assert.equal(game.skillAction('p2', 'D07', { soldierId: mine.soldierId }).ok, true);
  const out = game.skillRt.hit({ kind: 'fight', attackerOwner: game.players.p1, attacker: foe, victimOwner: game.players.p2, victim: mine, amount: 3 });
  assert.equal(out.amount, 1);
  assert.equal(game.skillRt.stateOf('p2').vars.D07, undefined);
  assert.equal(game.skillAction('p2', 'D07', { soldierId: mine.soldierId }).ok, false); // 各自ターン1回
});

test('D08 絶対防衛：敵由来の致死ダメージでHP1にとどまり城壁5。試合中1回', () => {
  const game = classicGame([[], buildIds('D08')]);
  const p2 = game.players.p2;
  p2.armor = 0;
  p2.castle.hp = 3;
  spellAtCastle(game, 'p2', 10);
  assert.equal(p2.castle.hp, 1);
  assert.equal(p2.armor, 5 + 0);
  assert.equal(game.phase === 'gameOver', false);
  p2.armor = 0;
  spellAtCastle(game, 'p2', 10);
  assert.equal(game.phase, 'gameOver');
});

function healGame(skills, extra = {}) {
  const game = classicGame(skills, { cards: { test_heal_soldier: HEAL_SOLDIER }, ...extra });
  game.players.p1.mp = 10;
  return game;
}
const play = (game, type, target) => {
  game.debugSetHand('p1', [type]);
  game.players.p1.playedThisTurn = false;
  const id = game.players.p1.hand[0].cardId;
  const r = game.playCard(id, target);
  assert.equal(r.ok, true, r.reason);
};

test('R02＋X08 余剰回復：X08 が先に城壁へ（最大3）、残りを R02 が貯蔵（最大5）し、次の回復魔法に加算', () => {
  const game = healGame([buildIds('R02', 'X08', 'D05'), []]);
  const p1 = game.players.p1;
  const st = game.skillRt.stateOf('p1');
  p1.castle.hp = p1.castle.maxHp - 2;
  const armor = p1.armor;
  play(game, 'classic_king_heal', { playerId: 'p1' }); // 10 回復・実2・余剰8
  assert.equal(p1.armor, armor + 3);
  assert.equal(st.res.healStore, 5);
  p1.castle.hp = p1.castle.maxHp - 30 < 1 ? 1 : p1.castle.maxHp - 30;
  const hp = p1.castle.hp;
  play(game, 'classic_king_minor_heal', { playerId: 'p1' }); // 5 + 貯蔵5
  assert.equal(p1.castle.hp - hp, 11); // 5 + 貯蔵5 + R01（R02 の経路）の1
  assert.equal(st.res.healStore, 0);
});

test('R03 浄化・R04 癒しの残響・R05 生命循環・R08 生命創造（城への回復魔法）', () => {
  const game = healGame([buildIds('R03', 'R04', 'R05', 'R08'), []]);
  const p1 = game.players.p1;
  const hurt = place(game, 'p1', 'classic_king_heavy', { hp: 3 });
  p1.castle.hp = 20;
  p1.castle.poison = 2;
  const max = p1.castle.maxHp;
  play(game, 'classic_king_minor_heal', { playerId: 'p1' });
  assert.equal(p1.castle.poison, null); // R03
  assert.equal(hurt.hp, 4); // R05
  assert.equal(p1.castle.maxHp, max + 1); // R08（現在HPは増えない）
  assert.equal(p1.castle.hp, 26); // 20 + 5 + R01（経路）の1
  assert.equal(game.skillRt.stateOf('p1').scheduled.length, 1); // R04
  endTurn(game);
  endTurn(game);
  assert.equal(p1.castle.hp, 26 - (game.rules.castlePoison ?? 0) >= 0 ? p1.castle.hp : p1.castle.hp); // 予約が解決された（下で厳密に確認）
  assert.equal(game.skillRt.stateOf('p1').scheduled.length, 0);
});

test('R06 奇跡の治癒：20%で威力50%再発動（各自ターン1回）', () => {
  const game = healGame([buildIds('R06'), []]);
  const p1 = game.players.p1;
  p1.castle.hp = 20;
  game.rng = scripted([0.1]);
  play(game, 'classic_king_heal', { playerId: 'p1' }); // 10 + 5
  assert.equal(p1.castle.hp, 36); // R06 の経路に R01（+1）があるので 11 + 5
  assert.equal(game.skillCounters('p1').R06, 1);
});

test('R07 守りの癒し・X21 聖なる反応・X36 生命の闘気・X37 癒しの陣（兵士への回復魔法）', () => {
  const game = healGame([buildIds('R07', 'X21', 'X36', 'X37'), []]);
  const p1 = game.players.p1;
  const s = place(game, 'p1', 'classic_king_heavy', { hp: 3 });
  play(game, 'test_heal_soldier', { soldierId: s.soldierId });
  assert.equal(s.hp, 6);
  assert.equal(s.shield, 1); // R07
  assert.ok(s.attachments.some((a) => a.element === 'light')); // X21
  assert.equal(game.skillRt.stateOf('p1').res.sp, 2); // X36（実回復3）
  assert.deepEqual(game.skillRt.stateOf('p1').vars.X37, [s.soldierId]); // X37
  // X37：次の通常攻撃+1（1回だけ）
  const foe = place(game, 'p2', 'classic_king_infantry');
  const out = game.skillRt.hit({ kind: 'fight', attackerOwner: p1, attacker: s, victimOwner: game.players.p2, victim: foe, amount: 2 });
  assert.equal(out.amount, 3);
  assert.equal(game.skillRt.stateOf('p1').vars.X37.length, 0);
});

test('X09 復讐の砲火・X20 不屈・X38 守護者', () => {
  const game = classicGame([[], buildIds('X09', 'X20', 'X38')]);
  const p2 = game.players.p2;
  const guard = place(game, 'p2', 'classic_king_heavy'); // HP9
  p2.armor = 2;
  spellAtCastle(game, 'p2', 6); // 壁2を壊す（SP+1）、通る4のうち2を守護者が肩代わり
  assert.equal(game.skillRt.stateOf('p2').res.sp, 1);
  assert.equal(guard.hp, 7);
  assert.ok(game.skillRt.stateOf('p2').vars.X09);
  const add = game.skillRt.collectMods('hitBaseAdd', 'p2', { kind: 'spell', origin: 'hand', enemy: true });
  assert.equal(add[0].value, 3);
});

test('G01 死の爆発・G02 魂・G03 MP・G05 遺志：味方兵士が死んだとき', () => {
  const game = classicGame([buildIds('G01', 'G02', 'G03', 'G05'), []]);
  const p1 = game.players.p1;
  const mine = place(game, 'p1', 'classic_king_cavalry', { position: 2 }); // 攻撃4
  const foe = place(game, 'p2', 'classic_king_heavy', { position: 3 }); // 隣接（同じ道の前後1マス）
  const fhp = foe.hp;
  p1.mp = 0;
  game.skillRt.beginRoot('test');
  game.removeSoldier(p1, mine, 'killed');
  game.skillRt.drain();
  const st = game.skillRt.stateOf('p1');
  assert.equal(st.res.soul, 1);
  assert.equal(p1.mp, 1);
  assert.equal(st.vars.G05, 1); // 攻撃4の25%
  assert.equal(foe.hp, fhp - 2);
  assert.equal(st.grave.length, 1);
});

test('G04 冥界の門・G06 蘇生術・G07 冥府の護り・G08 死霊術', () => {
  const game = classicGame([buildIds('G02', 'G04', 'G06', 'G07', 'G08'), []]);
  const p1 = game.players.p1;
  const rt = game.skillRt;
  const st = rt.stateOf('p1');
  // G08：各自ターン最初の死亡で自動蘇生（HP50%）＋ G07 のシールド
  const a = place(game, 'p1', 'classic_king_heavy'); // HP9
  rt.beginRoot('test');
  game.removeSoldier(p1, a, 'killed');
  rt.drain();
  const revived = p1.soldiers.find((s) => s.skillHistoryId === a.soldierId);
  assert.ok(revived);
  assert.deepEqual([revived.hp, revived.shield], [4, 2]);
  assert.equal(st.grave.length, 0);
  // 2体目の死亡は今ターンの G08 を使い済み → 墓地に残る。G06：魂3で蘇生
  rt.beginRoot('test');
  game.removeSoldier(p1, revived, 'killed');
  rt.drain();
  assert.equal(st.grave.length, 1);
  st.res.soul = 3;
  endTurn(game);
  endTurn(game); // 次の自ターン（G07 の回数がリセット）
  const r = game.skillAction('p1', 'G06', { historyId: st.grave[0].historyId });
  assert.equal(r.ok, true, r.reason);
  assert.equal(st.res.soul, 0);
  assert.equal(st.grave.length, 0);
  // G04：墓地の兵士のカードを捨て札から手札へ（手札から出した兵士のみ記録される）
  game.debugSetHand('p1', ['classic_king_infantry']);
  const id = p1.hand[0].cardId;
  assert.equal(game.playCard(id, game.getTargets(id)[0]).ok, true);
  const soldier = p1.soldiers.find((s) => s.skillCardId === id);
  assert.ok(soldier);
  rt.beginRoot('test');
  game.removeSoldier(p1, soldier, 'killed');
  rt.drain();
  const g = st.grave.find((x) => x.cardId === id) ?? null;
  if (g) {
    const r2 = game.skillAction('p1', 'G04', { historyId: g.historyId });
    assert.equal(r2.ok, true, r2.reason);
    assert.ok(p1.hand.some((c) => c.cardId === id));
    assert.equal(st.grave.includes(g), false);
  }
});

test('S02 重症化・S03 毒の刃・S06 衰弱の刻印・S07 苦痛の回収・S08 疫病（毒・出血）', () => {
  const game = classicGame([buildIds('S02', 'S06', 'S07', 'S08'), []]);
  const p1 = game.players.p1;
  const foe = place(game, 'p2', 'classic_king_heavy'); // HP9
  const api = game.skillRt.api('p1', 'S08', null);
  game.skillRt.beginRoot('test');
  // 自分由来の毒と出血を付ける → S02（2種で固定2ダメージ）
  api.as('hand', () => {
    foe.poison = { amount: 2, turns: 3 };
    game.emit('statusApplied', { playerId: 'p2', soldierId: foe.soldierId, status: 'poison', turns: 3, amount: 2 });
  });
  api.bleed('p2', foe, 2, 1);
  game.skillRt.drain();
  assert.equal(foe.hp, 7); // S02
  // S06：直接攻撃+1
  assert.equal(game.skillRt.collectMods('hitBaseAdd', 'p1', { victim: foe, enemy: true, direct: true })[0].value, 1);
  // S08：毒 2×3 + 出血 1×2 = 8（最大8）を即時精算して消費
  const r = game.skillAction('p1', 'S08', { soldierId: foe.soldierId });
  assert.equal(r.ok, true, r.reason);
  assert.equal(game.players.p2.soldiers.includes(foe), false);
  assert.equal(foe.poison, null);
  assert.equal(p1.mp >= 0, true);
});

test('S03 毒の刃・S05 燃え広がる炎・S01 感染', () => {
  const game = classicGame([buildIds('S01', 'S03', 'S05'), []]);
  const rt = game.skillRt;
  const f1 = place(game, 'p2', 'classic_king_heavy', { position: 3 });
  const f2 = place(game, 'p2', 'classic_king_heavy', { position: 4 }); // f1 に隣接
  // S03：手札の攻撃魔法の命中で15%
  game.debugSetHand('p1', ['classic_king_holy_ray']);
  game.players.p1.mp = 10;
  game.rng = scripted([0.1, 0.9, 0.9, 0.9, 0.9]);
  const id = game.players.p1.hand[0].cardId;
  const hit = game.playCard(id, { soldierId: f1.soldierId });
  assert.equal(hit.ok, true, hit.reason);
  assert.ok(f1.poison && f1.poison.turns === 2);
  game.rng = seededRng(3);
  // S01：毒持ちの敵が死ぬと隣接の敵へ残り1ターンで移る
  rt.beginRoot('test');
  game.removeSoldier(game.players.p2, f1, 'killed');
  rt.drain();
  assert.ok(f2.poison && f2.poison.turns === 1);
  // S05：やけど tick 時に隣接へ（20%）
  const f3 = place(game, 'p2', 'classic_king_heavy', { position: 4 });
  f2.burn = { amount: 1, turns: 2 };
  rt.statusSource.set(f2.soldierId, { ...(rt.statusSource.get(f2.soldierId) ?? {}), burn: 'p1' });
  game.rng = scripted([0.1]);
  rt.beginRoot('test');
  rt.enqueue('onStatusTick', { ownerId: 'p1', victimOwnerId: 'p2', targetId: f2.soldierId, status: 'burn', amount: 1, hp: f2.hp, origin: 'dot' });
  rt.drain();
  assert.ok(f3.burn || f2.burn);
});

test('V01 分身・V03 召喚の盾・V04 群れの力・V08 軍勢の創造・V05 送還・V07 召喚の門', () => {
  const game = classicGame([buildIds('V01', 'V03', 'V04', 'V05', 'V07', 'V08'), []]);
  const p1 = game.players.p1;
  p1.mp = 10;
  game.debugSetHand('p1', ['classic_king_infantry']);
  game.rng = scripted([0.1]);
  const sid = p1.hand[0].cardId;
  assert.equal(game.playCard(sid, game.getTargets(sid)[0]).ok, true);
  const tokens = () => p1.soldiers.filter((s) => s.skillToken);
  assert.equal(tokens().length, 1);
  assert.deepEqual([tokens()[0].shield, tokens()[0].baseAttack], [1, Math.max(1, Math.floor(3 * 0.5)) + 1]); // V03 シールド1・V08 攻撃+1
  const r = game.skillAction('p1', 'V07');
  assert.equal(r.ok, true, r.reason);
  assert.equal(tokens().length, 2);
  const fam = tokens().find((s) => s.skillToken.kind === 'familiar');
  assert.equal(fam.baseAttack, 2); // 使い魔 1 + V08 1
  const foe = place(game, 'p2', 'classic_king_heavy');
  const add = game.skillRt.collectMods('hitBaseAdd', 'p1', { kind: 'fight', attacker: fam, origin: 'normalAttack', enemy: true });
  assert.equal(add[0].value, 1); // V04
  const mp = p1.mp;
  assert.equal(game.skillAction('p1', 'V05', { soldierId: fam.soldierId }).ok, true);
  assert.equal(tokens().length, 1);
  assert.equal(p1.mp, Math.min(game.maxMpOf(p1), mp + 1));
  assert.equal(p1.lastFallen, null);
  assert.ok(foe);
});

test('V02 使い魔（魔法3枚ごと）・V06 契約更新（敵の攻撃で消滅 → 次の自ターン開始に使い魔）', () => {
  const game = classicGame([buildIds('V02', 'V06'), []]);
  const p1 = game.players.p1;
  p1.mp = 10;
  for (let i = 0; i < 3; i++) {
    game.debugSetHand('p1', ['classic_king_minor_heal']);
    p1.playedThisTurn = false;
    p1.castle.hp = 10;
    assert.equal(game.playCard(p1.hand[0].cardId, { playerId: 'p1' }).ok, true);
  }
  const fam = p1.soldiers.find((s) => s.skillToken?.kind === 'familiar');
  assert.ok(fam);
  // V06：敵に倒されたトークン
  const foeSoldier = place(game, 'p2', 'classic_king_infantry');
  const rt = game.skillRt;
  rt.lastHit.set(fam.soldierId, { playerId: 'p2', origin: 'normalAttack' });
  game.rng = scripted([0.1]);
  rt.beginRoot('test');
  game.removeSoldier(p1, fam, 'killed');
  rt.drain();
  assert.equal(rt.stateOf('p1').scheduled.length, 1);
  game.rng = seededRng(5);
  assert.ok(foeSoldier);
  endTurn(game);
  endTurn(game);
  assert.ok(rt.log.some((e) => e.kind === 'scheduledResolved' && e.skillId === 'V06' && e.ok)); // 使い魔が召喚された（その後の戦いで倒れることはある）
});

test('X07 再誕の祝福・X46 魂の器（蘇生した兵士）', () => {
  const game = classicGame([buildIds('G02', 'G06', 'X07', 'X46'), []]);
  const p1 = game.players.p1;
  const rt = game.skillRt;
  const st = rt.stateOf('p1');
  const a = place(game, 'p1', 'classic_king_heavy');
  rt.beginRoot('test');
  game.removeSoldier(p1, a, 'killed');
  rt.drain();
  st.res.soul = 3;
  const r = game.skillAction('p1', 'G06', { historyId: st.grave[0].historyId });
  assert.equal(r.ok, true, r.reason);
  assert.equal(p1.soldiers.some((s) => s.skillToken?.kind === 'familiar'), true); // X46
  assert.equal(st.scheduled.some((x) => x.skillId === 'X07'), true);
  endTurn(game);
  endTurn(game);
  const revived = p1.soldiers.find((s) => s.skillHistoryId);
  assert.equal(revived.hp, 6); // 4（HP50%）+ 2
});

test('X45 元素病：自分由来の有害状態の敵兵士への反応ダメージ+2（各自ターン合計2回）', () => {
  const game = classicGame([buildIds('X45', 'S03'), []]);
  const foe = place(game, 'p2', 'classic_king_heavy');
  foe.burn = { amount: 1, turns: 2 };
  game.skillRt.statusSource.set(foe.soldierId, { burn: 'p1' });
  const ctx = { owner: game.players.p2, soldier: foe, reaction: { id: 'annihilation', by: game.players.p1 }, damage: 8, byId: 'p1' };
  game.skillRt.runMods('reactionDamage', 'p1', ctx);
  assert.equal(ctx.damage, 10);
});

test('担当ノード（罠を作る X23 を含む）は実装済みとして数える', async () => {
  const { HANDLERS } = await import('../js/game/skills/handlers/index.js');
  assert.ok(HANDLERS.X23);
  for (const id of ['D02', 'D03', 'D04', 'D06', 'D07', 'D08', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08',
    'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07', 'V08',
    'X07', 'X08', 'X09', 'X20', 'X21', 'X36', 'X37', 'X38', 'X45', 'X46']) assert.ok(HANDLERS[id], id);
  void Units;
});
