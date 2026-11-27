// CPU が使う任意アクションの追加分（H07・H08・U06・K05・V05・X29・X44）と、対象選択の評価の短いスモークテスト。
// 各アクションが「使ってよい場面」で1回選ばれること・使うべきでない場面では見送ること・不正な手を出さないことだけを確かめる。勝率は測らない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { Card } from '../js/game/Card.js';
import { Soldier } from '../js/game/Soldier.js';
import { STRATEGIES, takeSkillActions, CPU_SKILL_ACTIONS } from '../js/game/strategies.js';
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

function classicGame(skills, { seed = 1 } = {}) {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const game = new Game({ ...opts, cards, rules, setup: { skills }, rng: seededRng(seed) });
  game.start();
  return { game, ctx: { cards, rules, discardCount: 0, upgrades: {} } };
}

let nextId = 200;
let nextCard = 900;
const card = (game, type) => new Card(`t${nextCard++}`, type, game.cardDefs[type]);
function place(game, ownerId, type, { position = 0, hp = null, roadIdx = 0 } = {}) {
  const foe = ownerId === 'p1' ? 'p2' : 'p1';
  const roads = game.roadsBetween(game.side(ownerId), game.side(foe));
  const s = new Soldier(`s${nextId++}`, { type, def: game.cardDefs[type] }, roads[roadIdx].roadId, foe);
  s.position = position;
  if (hp !== null) s.hp = hp;
  game.players[ownerId].soldiers.push(s);
  return s;
}
const ids = (used) => used.map((u) => [u.actionId, u.ok]);
const INF = 'classic_king_infantry';
const RAY = 'classic_king_holy_ray'; // MP4

test('CPU H07：今のMPより3以上重い魔法があるときだけ捨てて引く。軽い手札なら見送る', () => {
  const { game, ctx } = classicGame([buildIds('H07'), []]);
  const p1 = game.players.p1;
  p1.mp = 0;
  p1.hand = [card(game, INF), card(game, INF)];
  assert.deepEqual(takeSkillActions(game, 'p1', 'pre', ctx), []);
  p1.hand = [card(game, RAY), card(game, INF)];
  const ray = p1.hand[0].cardId;
  assert.deepEqual(ids(takeSkillActions(game, 'p1', 'pre', ctx)), [['H07', true]]);
  assert.ok(!p1.hand.some((c) => c.cardId === ray));
});

test('CPU H08：出せない手札を、山札の上3枚の出せるカードと交換する。出せるカードは手放さない', () => {
  const { game, ctx } = classicGame([buildIds('H08'), []]);
  const p1 = game.players.p1;
  p1.mp = 2;
  const deck = game.pileOf('p1').deck;
  deck.unshift(card(game, RAY), card(game, INF), card(game, RAY));
  p1.hand = [card(game, RAY)];
  const inf = deck[1].cardId;
  assert.deepEqual(ids(takeSkillActions(game, 'p1', 'pre', ctx)), [['H08', true]]);
  assert.deepEqual(p1.hand.map((c) => c.cardId), [inf]);
  // 出せる手札は手放さない
  p1.hand = [card(game, INF)];
  deck.unshift(card(game, INF), card(game, INF), card(game, INF));
  assert.ok(!ids(takeSkillActions(game, 'p1', 'pre', ctx)).some(([a]) => a === 'H08'));
});

test('CPU X44：次のドローの2枚目のほうが出しやすいときだけ入れ替えを予約する', () => {
  const { game, ctx } = classicGame([buildIds('X44'), []]);
  const p1 = game.players.p1;
  const deck = game.pileOf('p1').deck;
  p1.hand = [card(game, INF), card(game, INF)];
  p1.maxMp = 2;
  deck.unshift(card(game, RAY), card(game, INF));
  assert.deepEqual(ids(takeSkillActions(game, 'p1', 'post', ctx)), [['X44', true]]);
  assert.equal(game.skillRt.stateOf('p1').vars.X44swap, true);
});

test('CPU V05：MPに空きがあり、体力が3分の1以下のトークンだけ送還する', () => {
  const { game, ctx } = classicGame([buildIds('V05', 'V07'), []]);
  const p1 = game.players.p1;
  p1.hand = [];
  assert.equal(game.skillAction('p1', 'V07', {}).ok, true);
  const token = p1.soldiers.find((s) => s.skillToken);
  p1.mp = 0;
  assert.deepEqual(takeSkillActions(game, 'p1', 'post', ctx), []); // 元気なトークンは残す
  token.maxHp = 3;
  token.hp = 1;
  assert.deepEqual(ids(takeSkillActions(game, 'p1', 'post', ctx)), [['V05', true]]);
  assert.equal(p1.mp, 1);
  assert.ok(!p1.soldiers.includes(token));
});

test('CPU X29：城HPかMPが回復でき、体力が3分の1以下の兵士だけ生贄にする', () => {
  const { game, ctx } = classicGame([buildIds('X29'), []]);
  const p1 = game.players.p1;
  const healthy = place(game, 'p1', INF);
  p1.castle.hp = p1.castle.maxHp - 5;
  assert.deepEqual(takeSkillActions(game, 'p1', 'post', ctx), []);
  healthy.hp = 1;
  assert.deepEqual(ids(takeSkillActions(game, 'p1', 'post', ctx)), [['X29', true]]);
  assert.ok(!p1.soldiers.includes(healthy));
  assert.equal(p1.castle.hp, p1.castle.maxHp - 3);
});

test('CPU K05：敵のいるレーンで、後ろの近接兵士が前より強いときだけ入れ替える', () => {
  const { game, ctx } = classicGame([buildIds('K05'), []]);
  const back = place(game, 'p1', 'classic_king_cavalry', { position: 0 });
  const front = place(game, 'p1', INF, { position: 1, hp: 2 });
  assert.deepEqual(takeSkillActions(game, 'p1', 'post', ctx), []); // 敵のいないレーンでは動かさない
  place(game, 'p2', INF, { position: 3 });
  assert.deepEqual(ids(takeSkillActions(game, 'p1', 'post', ctx)), [['K05', true]]);
  assert.deepEqual([back.position, front.position], [1, 0]);
});

test('CPU U06：敵のいないレーンの近接兵士を、敵のいるレーンへ移す。傷ついた兵士は動かさない', () => {
  const { game, ctx } = classicGame([buildIds('U06'), []]);
  const s = place(game, 'p1', INF, { position: 0, roadIdx: 0, hp: 1 });
  place(game, 'p2', INF, { position: 3, roadIdx: 1 });
  assert.deepEqual(takeSkillActions(game, 'p1', 'post', ctx), []);
  s.hp = s.maxHp;
  const to = game.roadsBetween('p1', 'p2')[1].roadId;
  assert.deepEqual(ids(takeSkillActions(game, 'p1', 'post', ctx)), [['U06', true]]);
  assert.equal(s.roadId, to);
});

test('CPU：追加した7アクションを持つビルドの短い対戦で、任意アクションの失敗0・対応表にないものは使わない', () => {
  const { game, ctx } = classicGame([buildIds('H07', 'H08', 'U06', 'K05', 'V05', 'V07', 'X29', 'X44'), buildIds('B02')], { seed: 3 });
  game.on('discardRequired', (e) => { ctx.discardCount = e.count; });
  const rng = seededRng(9);
  ctx.onDefense = () => {
    for (let i = 0; i < 20 && game.phase === 'defend'; i++) STRATEGIES.smart.respond(game, game.getState(null).defense.defenderId, rng, ctx);
  };
  const calls = [];
  const orig = game.skillAction.bind(game);
  game.skillAction = (pid, id, args) => {
    const r = orig(pid, id, args);
    calls.push({ id, ok: r.ok, reason: r.reason });
    return r;
  };
  for (let i = 0; i < 40 && game.phase !== 'gameOver'; i++) {
    if (game.phase === 'defend') ctx.onDefense();
    const pid = game.getState(null).currentPlayer;
    STRATEGIES.smart.takeTurn(game, pid, rng, ctx);
    if (game.phase === 'defend') ctx.onDefense();
    if (game.phase === 'main') {
      assert.equal(game.endTurn().ok, true);
      if (game.phase === 'discard') {
        const p = game.players[game.currentPlayer];
        game.discard(p.hand.slice(0, game.discardCount).map((c) => c.cardId));
      }
    }
  }
  assert.deepEqual(calls.filter((c) => !c.ok), []);
  assert.ok(calls.every((c) => CPU_SKILL_ACTIONS[c.id]));
});
