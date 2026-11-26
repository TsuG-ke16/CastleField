// スキルの共通基盤（段階B。js/game/skills/）の短いスモークテスト。
//   回数のリセット規則・幸運のパイプラインの順（L01/L08/L02/L03、注入 RNG で決定論）・会心の上限・派生の深度/件数の上限・
//   追加発動からの追加発動の禁止・HP支払の拒否規則・トークンの上限・予約の順序・任意アクションの原子性・公開状態・保存/復元
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { HANDLERS } from '../js/game/skills/handlers/index.js';
import * as Luck from '../js/game/skills/Luck.js';
import * as Crit from '../js/game/skills/Crit.js';
import * as Units from '../js/game/skills/Units.js';
import * as Cards from '../js/game/skills/Cards.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

/** クラシックのゲーム（マリガン・ステージなし）。start() のあとすぐ p1 のターン1 */
function classicGame(skills, { seed = 1 } = {}) {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  return new Game({ ...opts, cards, rules, setup: { skills }, rng: seededRng(seed) });
}

/** 決まった順に値を返す乱数（尽きたら例外：余計に引いていないかも確かめる） */
function scripted(values) {
  const list = [...values];
  const fn = () => {
    if (list.length === 0) throw new Error('乱数を予定より多く引きました');
    return list.shift();
  };
  fn.left = () => list.length;
  return fn;
}

/** テストの間だけハンドラを登録する（Runtime は作るときに購読表を作るので、ゲームを作る前に入れる） */
function withHandlers(defs, fn) {
  const saved = Object.fromEntries(Object.keys(defs).map((id) => [id, HANDLERS[id]]));
  Object.assign(HANDLERS, defs);
  try {
    return fn();
  } finally {
    for (const [id, def] of Object.entries(saved)) {
      if (def === undefined) delete HANDLERS[id];
      else HANDLERS[id] = def;
    }
  }
}

/** 今の人のターンを終える（手札が多ければ先頭から捨てる） */
function endTurn(game) {
  const r = game.endTurn();
  assert.equal(r.ok, true, r.reason);
  if (game.phase === 'discard') {
    const p = game.players[game.currentPlayer];
    assert.equal(game.discard(p.hand.slice(0, game.discardCount).map((c) => c.cardId)).ok, true);
  }
}

test('スキルを取っていない・他モードのゲームは skillRt が null（任意アクションは空、使うと理由）', () => {
  const game = classicGame([[], []]);
  assert.equal(game.skillRt, null);
  assert.deepEqual(game.listSkillActions('p1'), []);
  assert.equal(game.skillAction('p1', 'P03').ok, false);
  assert.deepEqual(game.skillEvents, []);
  const { cards, rules } = buildData();
  assert.equal(new Game({ cards, rules, rng: seededRng(1) }).skillRt, null);
});

test('回数：各自ターンは自ターン開始でリセット（相手ターン中も同じ区間）、試合中はリセットなし', () => {
  const game = classicGame([['P01'], ['P01']]);
  const rt = game.skillRt;
  game.start();
  assert.equal(rt.canUse('p1', 'X', 'a', 1), true);
  rt.consume('p1', 'X', 'a');
  rt.consume('p1', 'X', 'm', 1, 'match');
  assert.equal(rt.canUse('p1', 'X', 'a', 1), false);
  endTurn(game); // p2 のターン：p1 の区間はまだ続く
  assert.equal(game.currentPlayer, 'p2');
  assert.equal(rt.canUse('p1', 'X', 'a', 1), false);
  endTurn(game); // p1 の次のターン：リセット
  assert.equal(game.currentPlayer, 'p1');
  assert.equal(rt.canUse('p1', 'X', 'a', 1), true);
  assert.equal(rt.canUse('p1', 'X', 'm', 1, 'match'), false);
  assert.equal(rt.stateOf('p1').interval, 2);
});

test('幸運：基礎＋蓄積 → L01 ×1.1 → 上限 → 判定 → L02 の10%で1回再抽選 → L03 の蓄積（注入 RNG で決定論）', () => {
  const game = classicGame([['L01', 'L02', 'L03'], []]);
  const rt = game.skillRt;
  const st = rt.stateOf('p1');
  // 1回目：0.5 × 1.1 = 0.55。0.6 で失敗 → L02 の 0.05 < 0.1 で成功 → 再抽選 0.5 < 0.55 で成功
  game.rng = scripted([0.6, 0.05, 0.5]);
  let r = Luck.roll(rt, 'p1', 0.5, { skillId: 'T' });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.p - 0.55) < 1e-9);
  assert.deepEqual([r.entry.rolls, r.entry.secondChance, r.entry.reroll], [[false], true, true]);
  assert.equal(st.luckStack, 0);
  // 2回目：失敗・L02 も失敗 → L03 の蓄積 +0.02
  game.rng = scripted([0.9, 0.5]);
  r = Luck.roll(rt, 'p1', 0.5, { skillId: 'T' });
  assert.equal(r.ok, false);
  assert.ok(Math.abs(st.luckStack - 0.02) < 1e-9);
  // 3回目：(0.5 + 0.02) × 1.1 = 0.572（蓄積は倍率の前に足す）。0.56 で成功し、蓄積は0に戻る
  game.rng = scripted([0.56]);
  r = Luck.roll(rt, 'p1', 0.5, { skillId: 'T' });
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.p - 0.572) < 1e-9);
  assert.equal(st.luckStack, 0);
  // 上限：会心80%・ほか95%。確定（1）は乱数を引かず、蓄積も変えない
  game.rng = scripted([0.99, 0.5]);
  assert.equal(Luck.roll(rt, 'p1', 0.9, {}).p, 0.95);
  game.rng = scripted([0.9, 0.99]);
  assert.equal(Luck.roll(rt, 'p1', 0.5, { kind: 'crit', add: 1 }).p, 0.8);
  game.rng = scripted([]);
  assert.equal(Luck.roll(rt, 'p1', 1).ok, true);
  assert.ok(rt.log.some((e) => e.kind === 'luck' && e.certain));
});

test('幸運：L08 は同じ確率で最大2回（1回目で成功なら2回目は引かない）。L02 は全失敗のあと', () => {
  const game = classicGame([['L01', 'L02', 'L04', 'L06', 'L08'], []]);
  const rt = game.skillRt;
  game.rng = scripted([0.9, 0.1]);
  let r = Luck.roll(rt, 'p1', 0.2);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entry.rolls, [false, true]);
  game.rng = scripted([0.1]);
  assert.deepEqual(Luck.roll(rt, 'p1', 0.2).entry.rolls, [true]);
  game.rng = scripted([0.9, 0.9, 0.5]); // 2回とも失敗 → L02 の判定 0.5 は失敗（再抽選なし）
  r = Luck.roll(rt, 'p1', 0.2);
  assert.equal(r.ok, false);
  assert.equal(r.entry.secondChance, false);
  // スキルのない人の判定は補正なし（敵の判定には干渉しない）
  const other = classicGame([['L01'], ['P01']]);
  other.rng = scripted([0.52]);
  assert.equal(Luck.roll(other.skillRt, 'p2', 0.5).ok, false);
});

test('会心：C01 がなければ0%（乱数なし）、倍率は加算 → 豪運 ×2 → 上限3.0、確定会心は確率を使わない', () => {
  const none = classicGame([['P01'], []]);
  none.rng = scripted([]);
  assert.deepEqual(Crit.resolve(none.skillRt, { ownerId: 'p1', category: 'soldierAttack', amount: 10, direct: true }).crit, false);

  const game = classicGame([['C01', 'C02', 'C03', 'X11'], []]);
  const rt = game.skillRt;
  const st = rt.stateOf('p1');
  // 確定（C08 の次の会心確定）：1.5 + 0.3 = 1.8 → X11 成功で ×2 = 3.6 → 上限 3.0。10 → 30
  st.critForcedNext = true;
  game.rng = scripted([0.0]);
  let c = Crit.resolve(rt, { ownerId: 'p1', category: 'soldierAttack', amount: 10, direct: true });
  assert.deepEqual([c.crit, c.forced, c.multiplier, c.amount], [true, true, 3, 30]);
  // 確率の上限 80%：C02 の蓄積（最大 +0.3）を積んでも 0.15+0.3 = 0.45。外部の加算で上限を確かめる
  st.critStack = 0.3;
  game.rng = scripted([0.99]);
  c = Crit.resolve(rt, { ownerId: 'p1', category: 'spellHit', amount: 7, direct: true });
  assert.equal(c.crit, false);
  assert.ok(Math.abs(c.chance - 0.45) < 1e-9);
  assert.ok(Math.abs(st.critStack - 0.3) < 1e-9); // 最大 +0.3
  game.rng = scripted([0.5]);
  assert.equal(Luck.roll(rt, 'p1', 0.15, { kind: 'crit', add: 5 }).p, 0.8);
  // 城（X10）・持続（X17）は未解放なら0%
  game.rng = scripted([]);
  assert.equal(Crit.resolve(rt, { ownerId: 'p1', category: 'castle', amount: 10 }).unlocked, false);
  assert.equal(Crit.resolve(rt, { ownerId: 'p1', category: 'dot', amount: 1 }).unlocked, false);
  // 丸め：50% は切り捨て、正の元ダメージへの直接追加は最小1
  assert.equal(Crit.ratioAmount(3, 0.5), 1);
  assert.equal(Crit.ratioAmount(1, 0.5), 0);
  assert.equal(Crit.ratioAmount(1, 0.5, { directExtra: true }), 1);
});

test('派生の上限：深度8・1原アクション128件を超えた派生は診断だけ出して止める（基礎の処理は止めない）', () => {
  let calls = 0;
  withHandlers({
    C04: { on: { onDraw(api, ev) { calls += 1; api.emit('onDraw', { kind: 'test' }); } } },
  }, () => {
    const game = classicGame([['C01', 'C02', 'C04'], []]);
    const rt = game.skillRt;
    rt.beginRoot('test');
    rt.enqueue('onDraw', { ownerId: 'p1', kind: 'test' });
    rt.drain();
    assert.equal(calls, 9); // 深度 0〜8
    assert.ok(rt.log.some((e) => e.kind === 'diagnostic' && e.code === 'depthLimit'));
  });
  let wide = 0;
  withHandlers({
    C04: { on: { onDraw(api, ev) { wide += 1; if (ev.depth < 7) for (let i = 0; i < 3; i++) api.emit('onDraw', { kind: 'test' }); } } },
  }, () => {
    const game = classicGame([['C01', 'C02', 'C04'], []]);
    const rt = game.skillRt;
    rt.beginRoot('test');
    rt.enqueue('onDraw', { ownerId: 'p1', kind: 'test' });
    rt.drain();
    assert.equal(wide, 1 + 128);
    assert.ok(rt.log.some((e) => e.kind === 'diagnostic' && e.code === 'derivedLimit'));
  });
});

test('追加発動：追加由来から追加は作れない（例外は明示＋必要ノード）、やまびこは M08 なしで合計2回', () => {
  const game = classicGame([['M01', 'M02'], []]);
  const rt = game.skillRt;
  rt.beginRoot('hand', { playerId: 'p1' });
  const hand = { eventId: 1, origin: 'hand', depth: 0 };
  const echo = { eventId: 2, origin: 'echo', depth: 1, isExtra: true };
  assert.equal(rt.spawnExtra('p1', hand, 'echo').ok, true);
  assert.equal(rt.spawnExtra('p1', echo, 'chain').ok, false);
  assert.equal(rt.spawnExtra('p1', echo, 'echo', { allow: 'echo>echo' }).ok, false); // M08 がない
  assert.equal(rt.spawnExtra('p1', hand, 'echo').ok, true);
  assert.match(rt.spawnExtra('p1', hand, 'echo').reason, /合計2回/);
  assert.equal(rt.spawnExtra('p1', { origin: 'reflect', isExtra: true }, 'reflect').ok, false);
  assert.equal(rt.spawnExtra('p1', { origin: 'token', isExtra: true }, 'token', { allow: 'token>token' }).ok, false); // X19 がない
  assert.ok(rt.log.filter((e) => e.kind === 'diagnostic' && e.code === 'extraFromExtra').length >= 3);
});

test('HP支払：城壁を通らない独立イベント。HP1を残せない・債務があると拒否。債務は次の自ターン開始に最優先で払う', () => {
  const game = classicGame([['B01'], []]);
  const rt = game.skillRt;
  game.start();
  const p1 = game.players.p1;
  const api = rt.api('p1', 'B01', null);
  p1.armor = 5;
  const hp = p1.castle.hp;
  assert.match(api.payHp(hp).reason, /HP1を残す/);
  assert.equal(api.payHp(hp, { preview: true }).ok, false);
  const r = api.payHp(3);
  assert.deepEqual([r.ok, r.paid], [true, 3]);
  assert.equal(p1.castle.hp, hp - 3);
  assert.equal(p1.armor, 5);
  assert.ok(rt.log.some((e) => e.kind === 'hpPayment' && e.paid === 3));
  rt.stateOf('p1').debt = 2;
  assert.match(api.payHp(1).reason, /債務/);
  endTurn(game);
  endTurn(game); // p1 のターン開始：債務を払う
  assert.equal(rt.stateOf('p1').debt, 0);
  assert.equal(p1.castle.hp <= hp - 5, true);
});

test('トークン：各自ターンの生成2体・同時3体まで。墓地・lastFallen・onUnitDeath に入らない', () => {
  const game = classicGame([['V01'], []]);
  const rt = game.skillRt;
  game.start();
  const p1 = game.players.p1;
  assert.equal(Units.summonToken(rt, 'p1', { kind: 'familiar' }).ok, true);
  const weak = Units.summonToken(rt, 'p1', { kind: 'weak', fromType: 'classic_king_heavy' });
  assert.equal(weak.ok, true);
  const def = game.cardDefs.classic_king_heavy;
  assert.deepEqual([weak.soldier.maxHp, weak.soldier.baseAttack], [Math.max(1, Math.floor(def.hp / 2)), Math.max(1, Math.floor(def.attack / 2))]);
  assert.match(Units.summonToken(rt, 'p1', { kind: 'familiar' }).reason, /各自ターン2体/);
  rt.turnBegin(p1); // 次の区間
  assert.equal(Units.summonToken(rt, 'p1', { kind: 'familiar' }).ok, true);
  rt.turnBegin(p1);
  assert.match(Units.summonToken(rt, 'p1', { kind: 'familiar' }).reason, /同時に3体/);
  const fam = p1.soldiers.find((s) => s.skillToken?.kind === 'familiar');
  assert.deepEqual([fam.hp, fam.attack, fam.speed, fam.token], [2, 1, 1, true]);
  const fallen = p1.lastFallen;
  game.removeSoldier(p1, fam, 'killed');
  assert.equal(p1.lastFallen, fallen);
  assert.equal(rt.stateOf('p1').grave.length, 0);
});

test('予約：自ターン開始は HP債務 → 予約効果 → ほかの開始時効果の順。予約由来から新しい予約は作れない', () => {
  const order = [];
  withHandlers({
    T06: {
      scheduled(api, item) { order.push(`scheduled:${item.data.n}`); },
      on: { onTurnStart(api) { order.push('turnStart'); } },
    },
  }, () => {
    const game = classicGame([['T01', 'T02', 'T04', 'T06'], []]);
    const rt = game.skillRt;
    rt.observe((e) => { if (e.kind === 'hpPayment') order.push('debt'); });
    game.start();
    order.length = 0;
    const api = rt.api('p1', 'T06', null);
    assert.equal(api.schedule({ data: { n: 1 } }).ok, true);
    assert.equal(api.schedule({ data: { n: 2 } }).ok, true);
    assert.equal(rt.api('p1', 'T06', { origin: 'scheduled' }).schedule({ data: { n: 3 } }).ok, false);
    rt.stateOf('p1').debt = 1;
    endTurn(game);
    assert.deepEqual(order, []); // 相手のターン開始では何もしない
    endTurn(game);
    assert.deepEqual(order, ['debt', 'scheduled:1', 'scheduled:2', 'turnStart']);
  });
});

test('任意アクション：一覧（支払・上限・プレビュー）と原子的な実行（不成立なら支払・回数を消費しない）', () => {
  let ran = 0;
  withHandlers({
    P03: {
      actions: {
        P03: {
          list: () => [{ args: { n: 1 } }],
          check: (api, args) => (args.n === 1 ? { ok: true, cost: { mp: 2 }, preview: { mp: +3 } } : { ok: false, reason: '対象がありません' }),
          run: (api) => { ran += 1; api.mp(3); return 'done'; },
        },
      },
    },
  }, () => {
    const game = classicGame([['P01', 'P03'], []]);
    game.start();
    const p1 = game.players.p1;
    const list = game.listSkillActions('p1');
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].ok, list[0].options[0].cost, list[0].limit], [true, { mp: 2 }, 1]);
    const mp = p1.mp;
    assert.equal(game.skillAction('p1', 'P03', { n: 2 }).ok, false);
    assert.equal(game.skillAction('p2', 'P03', { n: 1 }).ok, false);
    assert.equal(p1.mp, mp);
    assert.equal(ran, 0);
    const r = game.skillAction('p1', 'P03', { n: 1 });
    assert.deepEqual([r.ok, r.result, ran], [true, 'done', 1]);
    assert.equal(p1.mp, Math.min(game.maxMpOf(p1), mp - 2 + 3));
    assert.match(game.skillAction('p1', 'P03', { n: 1 }).reason, /もう使いました/);
    assert.equal(game.skillCounters('p1').P03, 1);
    assert.equal(game.skillCounters('p1').P01, null); // 試合開始時の数値（static）は数えない
  });
});

test('公開状態と保存：相手には公開部分だけ。serialize → restore で同じ状態。コピーは使うと消える', () => {
  const game = classicGame([['C01'], ['P01']]);
  const rt = game.skillRt;
  game.start();
  rt.stateOf('p1').critStack = 0.1;
  rt.stateOf('p1').res.soul = 2;
  const mine = game.getState('p1').players.p1.skillState;
  const theirs = game.getState('p2').players.p1.skillState;
  assert.equal(mine.critStack, 0.1);
  assert.equal(theirs.critStack, undefined);
  assert.equal(theirs.uses, undefined);
  assert.equal(theirs.resources.soul, 2);
  assert.deepEqual(mine.counters, { C01: 0 });
  const saved = JSON.parse(JSON.stringify(rt.serialize()));
  rt.stateOf('p1').res.soul = 5;
  rt.restore(saved);
  assert.equal(rt.stateOf('p1').res.soul, 2);
  assert.ok(rt.stateOf('p1').owned.has('C01'));
  // コピー：手札に入り、使っても捨て札に入らない。コピーのコピーは作れない
  const p1 = game.players.p1;
  p1.hand = p1.hand.slice(0, 2); // 手札の空きを作る
  const copy = Cards.addCopy(rt, 'p1', 'classic_king_minor_heal');
  assert.equal(copy.ok, true);
  assert.equal(Cards.addCopy(rt, 'p1', copy.card).ok, false);
  const discards = game.pileOf('p1').discard.length;
  game.throwAway('p1', p1.takeFromHand(copy.cardId));
  assert.equal(game.pileOf('p1').discard.length, discards);
});
