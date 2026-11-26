// 段階C（担当C1）のスモークテスト：会心 C04/C06/C07/C08、魔法 M01〜M08、属性 E02/E03/E05/E07/E08、幸運 L04〜L07、
// 横断 X01/X02/X03/X12/X13/X14/X15/X16/X19 と、やまびこの共通補助（echo.js）の上限。各ノード1〜2件の短い確認。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { Soldier } from '../js/game/Soldier.js';
import * as Units from '../js/game/skills/Units.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

import { orderBuild } from '../js/game/SkillTree.js';

const TREE = loadOptionalData('classic').skillTree;
/** 隣接表（系統内の辺のテンプレート＋横断ノードの端点） */
const ADJ = (() => {
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a).add(b);
    adj.get(b).add(a);
  };
  for (const g of Object.keys(TREE.groups)) for (const [a, b] of TREE.edges) link(a === 'START' ? 'START' : g + a, b === 'START' ? 'START' : g + b);
  for (const n of TREE.nodes) if (n.cross) for (const e of n.ends) link(n.id, e);
  return adj;
})();
/** targets を取れる合法なビルド（START からの最短経路の和＋必須ノード）。取れる順に並べる */
function legal(...targets) {
  const set = new Set();
  const add = (id) => {
    const prev = new Map([['START', null]]);
    const q = ['START'];
    while (q.length) {
      const x = q.shift();
      if (x === id) break;
      for (const y of ADJ.get(x) ?? []) if (!prev.has(y)) { prev.set(y, x); q.push(y); }
    }
    for (let x = id; x && x !== 'START'; x = prev.get(x)) set.add(x);
    for (const r of TREE.nodes.find((n) => n.id === id).requires) if (!set.has(r)) add(r);
  };
  for (const t of targets) add(t);
  const out = orderBuild(TREE, [...set], 99);
  assert.ok(out, `合法な順に並べられません: ${[...set]}`);
  return out;
}

const RAY = 'classic_king_holy_ray'; // 単体攻撃魔法（singleDamage 5・光）
const HEAL = 'classic_king_minor_heal';

/** クラシック（マリガン・ステージ・天候なし）。start() のあとすぐ p1 のターン1。p2 は防御カードなし */
function setup(p1Ids, { p2Ids = [], rng = () => 0, seed = 1 } = {}) {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const ids = p1Ids.length ? legal(...p1Ids) : [];
  const game = new Game({ ...opts, cards, rules, setup: { skills: [ids, p2Ids] }, rng: seededRng(seed) });
  if (ids.length) assert.ok(game.skillRt, `ビルドが通りません: ${ids} ${game.players.p1.skillError ?? ''}`);
  game.start();
  game.rng = rng;
  game.debugSetHand('p2', []);
  const p1 = game.players.p1;
  p1.mp = game.maxMpOf(p1);
  return { game, rt: game.skillRt, p1, p2: game.players.p2 };
}

/** p2 の兵士を p2→p1 の道に置く（position は p2 から見た進軍位置） */
function enemy(game, type = 'classic_demon_skeleton', { hp = null, position = 2, road = null } = {}) {
  const r = road ?? game.roadBetween('p2', 'p1');
  const s = new Soldier(`s${String(game.nextSoldierNumber++).padStart(2, '0')}`, game.createCard(type), r.roadId, 'p1');
  if (hp !== null) {
    s.hp = hp;
    s.maxHp = hp;
  }
  s.position = position;
  game.players.p2.soldiers.push(s);
  return s;
}

/** 今の人のターンを終える（手札が多ければ先頭から捨てる） */
function endTurn(game) {
  assert.equal(game.endTurn().ok, true);
  if (game.phase === 'discard') {
    const p = game.players[game.currentPlayer];
    assert.equal(game.discard(p.hand.slice(0, game.discardCount).map((c) => c.cardId)).ok, true);
  }
}

function cast(game, p1, type, soldier, opts) {
  game.debugSetHand('p1', [type]);
  p1.playedThisTurn = false; // テストのため：メインのカードは1ターン1枚（M07 の2枚目を出すために戻す）
  p1.mp = game.maxMpOf(p1);
  const card = p1.hand[0];
  const r = game.playCard(card.cardId, { soldierId: soldier.soldierId }, opts);
  assert.equal(r.ok, true, r.reason);
  return card;
}

const echoes = (game) => game.skillEvents.filter((e) => e.kind === 'extra' && e.extraKind === 'echo').length;

test('C04/C07/C08：確定会心で生存→出血2ターン、撃破→SP+1・次の会心確定', () => {
  let { game, rt, p1 } = setup(['C01', 'C04']);
  rt.stateOf('p1').critForcedNext = true;
  const big = enemy(game, 'classic_king_heavy', { hp: 20 });
  cast(game, p1, RAY, big);
  assert.equal(big.skillBleed?.turns, 2);
  assert.equal(game.skillCounters('p1').C04, 1);

  ({ game, rt, p1 } = setup(['C01', 'C07', 'C08']));
  rt.stateOf('p1').critForcedNext = true;
  const small = enemy(game, 'classic_demon_imp', { hp: 3 });
  cast(game, p1, RAY, small);
  assert.equal(game.players.p2.soldiers.includes(small), false);
  assert.equal(rt.stateOf('p1').res.sp >= 2, true); // 撃破の SP+1 と C07 の +1
  assert.equal(rt.stateOf('p1').critForcedNext, true);
  assert.deepEqual([game.skillCounters('p1').C07, game.skillCounters('p1').C08], [1, 1]);
});

test('C06：直接会心で 20% 判定に成功すると威力50%の追加攻撃（各自ターン1回）', () => {
  const { game, rt, p1 } = setup(['C01', 'C06']);
  rt.stateOf('p1').critForcedNext = true;
  const big = enemy(game, 'classic_king_heavy', { hp: 30 });
  cast(game, p1, RAY, big);
  assert.equal(game.skillCounters('p1').C06, 1);
  assert.ok(game.skillEvents.some((e) => e.kind === 'extra' && e.extraKind === 'extraAttack'));
});

test('M02/M08 と echo.js：M08 なしは原魔法あたり合計2回まで（M02 からの続きなし＝1回）、M08 ありは3回まで', () => {
  let { game, p1 } = setup(['M02']);
  let t = enemy(game, 'classic_king_heavy', { hp: 50 });
  cast(game, p1, RAY, t);
  assert.equal(echoes(game), 1);
  assert.equal(t.hp, 50 - 5 - 2);

  ({ game, p1 } = setup(['M02', 'X01', 'C01']));
  t = enemy(game, 'classic_king_heavy', { hp: 50 });
  cast(game, p1, RAY, t);
  assert.equal(echoes(game), 2); // M02 と X01（会心）で合計2回（上限）

  ({ game, p1 } = setup(['M02', 'M08']));
  t = enemy(game, 'classic_king_heavy', { hp: 50 });
  cast(game, p1, RAY, t);
  assert.equal(echoes(game), 3);
  assert.equal(t.hp, 50 - 5 - 2 * 3); // やまびこのやまびこも元の威力の50%
  assert.ok(game.skillEvents.some((e) => e.kind === 'diagnostic' && e.code === 'extraLimit'));
});

test('M01/M06：手札の攻撃魔法で敵兵士を倒すと MP+1・20% で1枚ドロー', () => {
  const { game, p1 } = setup(['M01', 'M06']);
  const t = enemy(game, 'classic_demon_imp', { hp: 3 });
  game.debugSetDeck(['classic_king_infantry', 'classic_king_infantry'], 'p1');
  cast(game, p1, RAY, t);
  const c = game.skillCounters('p1');
  assert.deepEqual([c.M01, c.M06], [1, 1]);
  assert.equal(p1.hand.length, 1);
});

test('M03/M04：隣接する敵兵士へ伝播（25%）と余剰ダメージ（最大3）', () => {
  let { game, p1 } = setup(['M03']);
  let t = enemy(game, 'classic_king_heavy', { hp: 20, position: 2 });
  let n = enemy(game, 'classic_king_heavy', { hp: 20, position: 3 });
  cast(game, p1, RAY, t);
  assert.equal(n.hp, 15);
  assert.equal(game.skillCounters('p1').M03, 1);

  ({ game, p1 } = setup(['M04']));
  t = enemy(game, 'classic_demon_imp', { hp: 1, position: 2 });
  n = enemy(game, 'classic_king_heavy', { hp: 20, position: 3 });
  cast(game, p1, RAY, t);
  assert.equal(n.hp, 17); // 5 - 1 = 4 → 最大3
});

test('M05/M07：魔法が捨て札から戻る（5%）、2枚目の魔法のあと次の魔法の消費MP-1', () => {
  let { game, p1 } = setup(['M05']);
  const t = enemy(game, 'classic_king_heavy', { hp: 50 });
  const card = cast(game, p1, RAY, t);
  assert.ok(p1.hand.some((c) => c.cardId === card.cardId));

  let rt;
  ({ game, rt, p1 } = setup(['M07']));
  const u = enemy(game, 'classic_king_heavy', { hp: 50 });
  cast(game, p1, RAY, u);
  cast(game, p1, RAY, u);
  assert.equal(rt.stateOf('p1').vars.M07ready, true);
  game.debugSetHand('p1', [RAY]);
  const base = game.mpCostOf(p1.hand[0]);
  const plan = rt.planCardCost(p1, p1.hand[0], base, {}, { preview: true });
  assert.equal(plan.mp, Math.max(1, base - 1));
});

test('E02/E03：自分の付着の持続+1、手札由来の付着で20%で別の属性を追加', () => {
  let { game, p1 } = setup(['E02']);
  let t = enemy(game, 'classic_king_heavy', { hp: 50 });
  cast(game, p1, RAY, t);
  assert.equal(t.attachments.find((a) => a.element === 'light')?.turns, game.reactionDefs.attachTurns + 1);

  ({ game, p1 } = setup(['E03']));
  t = enemy(game, 'classic_king_heavy', { hp: 50 });
  cast(game, p1, RAY, t);
  assert.equal(game.skillCounters('p1').E03, 1);
});

test('E05/E07/E08：反応のあとの拡散・残響・暴走', () => {
  const { game, p1 } = setup(['E05', 'E07', 'E08']);
  const t = enemy(game, 'classic_king_heavy', { hp: 50, position: 2 });
  const n = enemy(game, 'classic_king_heavy', { hp: 50, position: 3 });
  t.attachments.push({ element: 'dark', turns: 3 });
  cast(game, p1, RAY, t); // 光 × 闇 = 対消滅
  const c = game.skillCounters('p1');
  assert.deepEqual([c.E05, c.E07, c.E08], [1, 1, 1]);
  assert.ok(t.attachments.some((a) => a.element === 'dark')); // E07 で闇が1回分残る
  assert.ok(n.attachments.some((a) => a.element === 'light')); // E05 で光（起こした側）が隣へ
});

test('X02/X03/X13：反応の伝播（50%）・MP+1・同じ対象への再現（10%）', () => {
  const { game, p1 } = setup(['X02', 'X03', 'X13']);
  const t = enemy(game, 'classic_king_heavy', { hp: 50, position: 2 });
  const n = enemy(game, 'classic_king_heavy', { hp: 50, position: 3 });
  t.attachments.push({ element: 'dark', turns: 3 });
  cast(game, p1, RAY, t);
  const c = game.skillCounters('p1');
  assert.deepEqual([c.X02, c.X03, c.X13], [1, 1, 1]);
  assert.ok(n.hp < 50);
});

test('L04/L05/L07：ターン開始の追加ドロー、MP全還元、最終失敗3回で MP+1', () => {
  let { game, p1 } = setup(['L05']);
  const t = enemy(game, 'classic_king_heavy', { hp: 50 });
  const before = game.maxMpOf(p1);
  cast(game, p1, RAY, t);
  assert.equal(p1.mp, before);
  assert.equal(game.skillCounters('p1').L05, 1);

  let rt;
  ({ game, rt, p1 } = setup(['L07'], { rng: () => 0.99 }));
  p1.mp = 0;
  const api = rt.api('p1', 'L07', null);
  for (let i = 0; i < 3; i++) api.roll(0.1);
  assert.equal(p1.mp, 1);
  assert.equal(game.skillCounters('p1').L07, 1);

  ({ game, p1 } = setup(['L04']));
  game.debugSetHand('p1', []);
  endTurn(game);
  endTurn(game);
  assert.equal(game.currentPlayer, 'p1');
  assert.equal(game.skillCounters('p1').L04, 1);
});

test('L06：手札のサイコロの出目を2回生成して選ぶ（クラシックの実データにサイコロのカードはない→フックの確認）', () => {
  const { game, rt, p1 } = setup(['L06']);
  rt.beginRoot('hand', { playerId: 'p1' });
  rt.handCard = { cardId: 'x1' };
  rt.handPlan = { options: {} };
  assert.equal(rt.diceValue(p1, { cardId: 'x1' }, 2, () => 5), 5);
  rt.handPlan = { options: { diceChoice: 'first' } };
  assert.equal(rt.diceValue(p1, { cardId: 'x1' }, 2, () => 5), 2);
  assert.equal(rt.diceValue(p1, { cardId: 'other' }, 2, () => 5), 2); // 手札のそのカードでなければ振り直さない
  assert.equal(game.skillCounters('p1').L06, 2);
});

test('X12：M02 のやまびこ成功時 10% で原カードを手札へ（M05 の 5% は外れる乱数 0.07）', () => {
  const { game, p1 } = setup(['M02', 'X12'], { rng: () => 0.07 });
  const t = enemy(game, 'classic_king_heavy', { hp: 50 });
  const card = cast(game, p1, RAY, t);
  assert.ok(p1.hand.some((c) => c.cardId === card.cardId));
  assert.equal(game.skillCounters('p1').X12, 1);
});

test('X14：敵由来の致死ダメージで 20% で HP1（試合中1回）', () => {
  const { game, p1 } = setup(['X14']);
  p1.armor = 0;
  game.damageCastle(p1, 999, { kind: 'spell', type: RAY });
  assert.equal(p1.castle.hp, 1);
  game.damageCastle(p1, 999, { kind: 'spell', type: RAY });
  assert.equal(p1.castle.hp, 0);
});

test('X15/X16/X19：先頭2枚から選ぶ通常ドロー、コイン2倍、トークンの双子', () => {
  let { game, p1 } = setup(['X15']);
  game.debugSetHand('p1', []);
  endTurn(game);
  game.debugSetDeck(['classic_king_infantry', RAY, 'classic_king_infantry'], 'p1');
  endTurn(game);
  assert.equal(game.currentPlayer, 'p1');
  assert.equal(game.skillCounters('p1').X15, 1);
  assert.ok(p1.hand.some((c) => c.type === RAY));

  let rt;
  ({ game, rt, p1 } = setup(['X16']));
  const c0 = p1.coins;
  game.changeCoins(p1, 2, 'card');
  rt.drain();
  assert.equal(p1.coins, c0 + 4);

  ({ game, rt, p1 } = setup(['X19']));
  Units.summonToken(rt, 'p1', { kind: 'familiar', skillId: 'V07' });
  rt.drain();
  assert.equal(Units.aliveTokens(rt, 'p1').length, 2);
  assert.equal(game.skillCounters('p1').X19, 1);
});

test('通常モードとスキルなしクラシック：skillRt は null（乱数・状態に影響なし）', () => {
  const { cards, rules } = buildData();
  assert.equal(new Game({ cards, rules, rng: seededRng(1) }).skillRt, null);
  const { game } = setup([]);
  assert.equal(game.skillRt, null);
});
