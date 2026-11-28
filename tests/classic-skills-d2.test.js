// 段階D2：QA 公開API（js/game/skills/qa.js）の契約・CPU の任意アクション（strategies.js）・ハンドラのカバレッジ・基盤の残課題の短い確認
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Game } from '../js/game/Game.js';
import { createSkillQa, observe, verify, attach, implementationOf } from '../js/game/skills/qa.js';
import * as Crit from '../js/game/skills/Crit.js';
import { HANDLERS } from '../js/game/skills/handlers/index.js';
import { STRATEGIES, mulliganChoice, takeSkillActions, cpuSkillOptions, CPU_SKILL_ACTIONS } from '../js/game/strategies.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

const classic = () => {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  return { cards, rules, opts };
};
const { opts: base } = classic();
const tree = base.skillTree;
const qa = createSkillQa(tree);

function classicGame(builds, { seed = 1 } = {}) {
  const { cards, rules, opts } = classic();
  const game = new Game(qa.apply({ ...opts, cards, rules, rng: seededRng(seed) }, builds));
  game.start();
  return game;
}

const endTurn = (game) => {
  assert.equal(game.endTurn().ok, true);
  if (game.phase === 'discard') {
    const p = game.players[game.currentPlayer];
    game.discard(p.hand.slice(0, game.discardCount).map((c) => c.cardId));
  }
};

// ================= QA 公開API =================

test('QA：nodes / canAcquire / validate / cost は本番の取得判定', () => {
  assert.equal(qa.nodes.length, 200);
  assert.deepEqual(Object.keys(qa.nodes[0]).sort(), ['group', 'id']);
  assert.equal(new Set(qa.nodes.map((n) => n.id)).size, 200);
  assert.equal(qa.canAcquire([], 'C01').ok, true);
  assert.equal(qa.canAcquire([], 'C02').ok, false);
  assert.equal(qa.canAcquire(['C01'], 'C02', 1).ok, false, '予算1');
  const preset = tree.presets.critMagicLuck.ids;
  assert.equal(qa.validate(preset).ok, true);
  assert.equal(qa.validate([...preset].reverse()).ok, false, '取得順を見る');
  assert.equal(qa.cost(preset), 12);
  assert.equal(qa.cost([]), 0);
});

test('QA：apply は既存オプションを壊さず、空ビルドはスキルの処理なし・予算を変えられる・不正は例外', () => {
  const { cards, rules, opts } = classic();
  const input = { ...opts, cards, rules, rng: seededRng(3), setup: { firstPlayer: 'p2' } };
  const before = JSON.stringify({ setup: input.setup, budget: input.skillTree.budget });
  const o = qa.apply(input, [[], []]);
  assert.equal(JSON.stringify({ setup: input.setup, budget: input.skillTree.budget }), before);
  assert.equal(o.setup.firstPlayer, 'p2');
  assert.equal(o.rng, input.rng);
  const g0 = new Game(o);
  assert.equal(g0.skillRt, null, '全員 [] ならスキルの処理なし');
  const g1 = new Game(qa.apply({ ...opts, cards, rules, rng: seededRng(3) }, [tree.presets.critMagicLuck.ids, { ids: ['E01', 'E02', 'E04'], config: { E04: tree.nodes.find((n) => n.id === 'E04').config.options[1].id } }]));
  assert.ok(g1.skillRt);
  assert.deepEqual(g1.getState(null).players.p1.skills, tree.presets.critMagicLuck.ids);
  assert.equal(g1.getState(null).players.p2.skillConfig.E04, tree.nodes.find((n) => n.id === 'E04').config.options[1].id);
  // 予算 15：13個のビルドが通る（元のツリーの budget は変えない）
  const big = [...tree.presets.critMagicLuck.ids, 'C03'];
  assert.throws(() => qa.apply(opts, [big, []]), /決まりに合いません/);
  const o15 = qa.apply(opts, [big, []], 15);
  assert.equal(o15.skillTree.budget, 15);
  assert.equal(tree.budget, 12);
  assert.throws(() => qa.apply(opts, [['C02'], []]), /p1/);
});

test('QA：observe は数値化できるものだけ（未知は null・ダミー値なし）', () => {
  assert.equal(observe('turnStarted', { playerId: 'p1' }), null);
  assert.equal(observe('skill', { kind: 'somethingNew' }), null);
  assert.deepEqual(observe('skill', { kind: 'copyGone', playerId: 'p1' }), []);
  const [t] = observe('skill', { kind: 'trigger', playerId: 'p1', skillId: 'M02', origin: 'echo', depth: 1 });
  assert.deepEqual([t.metric, t.skillId, t.value, t.depth], ['trigger', 'M02', 1, 1]);
  const [r] = observe('skill', { kind: 'luck', playerId: 'p1', skillId: 'C06', result: false, p: 0.22 });
  assert.deepEqual([r.metric, r.value, r.p], ['roll', 0, 0.22]);
  const [m] = observe('mpChanged', { playerId: 'p1', delta: -2, mp: 3, reason: 'cast' });
  assert.deepEqual([m.metric, m.value], ['mp', -2]);
  const [a] = observe('castleArmored', { playerId: 'p1', armor: 7, skill: 'D08' });
  assert.equal(a.value, null, '増加量は未計測（今の城壁だけ）');
});

test('QA：attach/summarize は既知の未発動 0 と未計測 null を分け、verify は状態の違反を返す', () => {
  const game = classicGame([['P01', 'P02', 'X03'], ['C01', 'C02', 'C04']]);
  const obs = attach(game);
  endTurn(game);
  endTurn(game);
  const s = obs.summary();
  assert.equal(s.players.p1.triggers.P01, null, 'static は回数なし');
  assert.equal(typeof s.players.p1.triggers.P02, 'number');
  assert.equal(typeof s.players.p2.triggers.C01, 'number', 'core は数える');
  assert.equal(s.players.p1.counters.P01, null);
  assert.equal(s.players.p1.implementation.P01, 'static');
  assert.deepEqual(verify(game), []);
  game.skillRt.stateOf('p1').res.soul = 99;
  game.skillRt.stateOf('p2').critStack = 2;
  const codes = verify(game).map((v) => v.code).sort();
  assert.deepEqual(codes, ['critStackRange', 'resourceRange']);
  obs.stop();
  // 通常モード（skillTree なし）
  const { cards, rules } = buildData();
  const normal = new Game({ cards, rules, rng: seededRng(1) });
  normal.start();
  assert.deepEqual(verify(normal), []);
});

// ================= CPU =================

test('CPU：スキルがなければ任意アクションも skillOptions も使わない', () => {
  const game = classicGame([[], []]);
  assert.deepEqual(game.listSkillActions('p1'), []);
  assert.deepEqual(takeSkillActions(game, 'p1', 'pre'), []);
  assert.equal(cpuSkillOptions(game, 'p1', game.players.p1.hand[0].cardId), undefined);
});

test('CPU：B02 は城HPに余裕があるときだけ、合法手だけを使う。手札の HP置換は余裕がなければしない', () => {
  const game = classicGame([['B01', 'B02'], []]);
  const p1 = game.players.p1;
  p1.hand = p1.hand.slice(0, 2);
  const used = takeSkillActions(game, 'p1', 'pre');
  assert.deepEqual(used.map((u) => [u.actionId, u.ok]), [['B02', true]]);
  endTurn(game);
  endTurn(game);
  p1.hand = p1.hand.slice(0, 2);
  p1.castle.hp = Math.ceil(p1.castle.maxHp * 0.5) + 2; // 3払うと半分を割る
  assert.deepEqual(takeSkillActions(game, 'p1', 'pre'), []);
  // HP置換：MP で払えるなら hpForMp 0（置換しない）
  const card = p1.hand[0];
  assert.equal(cpuSkillOptions(game, 'p1', card.cardId).hpForMp, 0);
});

test('CPU：スキル付きの短い対戦で、任意アクションはすべて合法（失敗0）・ハンドラのエラー0・verify の違反0', () => {
  for (const [a, b] of [['critMagicLuck', 'bloodHealDefense'], ['graveTroopsSummon', 'elementManaMagic']]) {
    const game = classicGame([tree.presets[a].ids, tree.presets[b].ids], { seed: 5 });
    const { cards, rules } = classic();
    const ctx = { cards, rules, discardCount: 0, upgrades: {} };
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
      if (game.phase === 'discard') {
        game.discard(STRATEGIES.smart.chooseDiscard(game, game.currentPlayer, rng, ctx));
        continue;
      }
      STRATEGIES.smart.takeTurn(game, game.currentPlayer, rng, ctx);
      if (game.phase === 'main') endTurn(game);
    }
    assert.deepEqual(calls.filter((c) => !c.ok), [], `${a} vs ${b}`);
    assert.ok(calls.every((c) => CPU_SKILL_ACTIONS[c.id]), 'CPU 対応表にない任意アクションは使わない');
    assert.deepEqual(verify(game).filter((v) => v.severity === 'error'), [], `${a} vs ${b}`);
  }
});

test('CPU：H01 を持つときだけ、撃てない重い魔法を最大2枚戻す（乱数なし）', () => {
  const { cards } = classic();
  const game = classicGame([['H01'], []]);
  const ctx = { cards };
  const back = mulliganChoice(game, 'p1', ctx);
  assert.ok(back.length <= 2);
  const p1 = game.players.p1;
  for (const id of back) assert.ok(game.mpCostOf(p1.hand.find((c) => c.cardId === id)) > p1.mp);
  assert.deepEqual(mulliganChoice(game, 'p2', ctx).length === 0 || !game.players.p2.hand.some((c) => cards[c.type]?.kind === 'soldier'), true);
});

// ================= カバレッジ =================

// 罠（js/game/Traps.js）を入れ、K01・A06・X06 を読み替えたので、休眠のノードはなくなった
const DORMANT = [];

test('カバレッジ：200ノードの区分（休眠なし）と docs/skilltree-200-coverage.md が最新', () => {
  const ids = tree.nodes.map((n) => n.id);
  for (const id of Object.keys(HANDLERS)) assert.ok(ids.includes(id), `ハンドラ ${id} のノードがない`);
  const dormant = ids.filter((id) => implementationOf(id) === null);
  assert.deepEqual(dormant.sort(), [...DORMANT].sort());
  const counts = {};
  for (const id of ids) counts[implementationOf(id) ?? 'dormant'] = (counts[implementationOf(id) ?? 'dormant'] ?? 0) + 1;
  assert.deepEqual(counts, { core: 11, handler: 179, static: 10 });
  const tool = fileURLToPath(new URL('../tools/skilltree-coverage.mjs', import.meta.url));
  execFileSync(process.execPath, [tool, '--check'], { stdio: 'pipe' });
});

// ================= 基盤の残課題 =================

test('X48：SP20以上の加算が乗った判定で会心が出たら counters を数える', () => {
  const game = classicGame([['C01', 'C02', 'X48'], []]);
  const rt = game.skillRt;
  rt.stateOf('p1').res.sp = 20;
  game.rng = () => 0;
  const r = Crit.resolve(rt, { ownerId: 'p1', category: 'spellHit', amount: 4, direct: true });
  assert.equal(r.crit, true);
  assert.equal(game.skillCounters('p1').X48, 1);
  rt.stateOf('p1').res.sp = 19;
  Crit.resolve(rt, { ownerId: 'p1', category: 'spellHit', amount: 4, direct: true });
  assert.equal(game.skillCounters('p1').X48, 1, 'SP19 では数えない');
});

test('D08：敵のスキルの固定ダメージ（A01・X39 など source kind "skill"）の致死も防ぐ。HP支払は対象外のまま', () => {
  const game = classicGame([['A01'], ['D01', 'D02', 'D04', 'D06', 'D08']]);
  const p2 = game.players.p2;
  p2.armor = 0;
  p2.castle.hp = 2;
  game.skillRt.withOrigin('chain', 'A01', null, () => game.damageCastle(p2, 9, { kind: 'skill', skill: 'A01' }), 'p1');
  assert.equal(p2.castle.hp, 1);
  assert.equal(p2.armor, 5);
  assert.equal(game.skillCounters('p2').D08, 1);
});

test('X35：自動延期は既定 OFF。本人の選択（setSkillPrefs）で ON。取っていないノードの設定は拒否', () => {
  const game = classicGame([['B01', 'B02', 'X35'], ['L01', 'L02', 'L04', 'X15']]);
  const p1 = game.players.p1;
  const st = game.skillRt.stateOf('p1');
  p1.hand = p1.hand.slice(0, 2);
  const hp = p1.castle.hp;
  assert.equal(game.skillAction('p1', 'B02').ok, true);
  assert.equal(p1.castle.hp, hp - 3);
  assert.equal(st.debt, 0);
  assert.equal(game.setSkillPrefs('p1', { X15: { pick: 'first' } }).ok, false);
  assert.equal(game.setSkillPrefs('p2', { X15: { pick: 'nope' } }).ok, false);
  assert.equal(game.setSkillPrefs('p2', { X15: { pick: 'first' } }).ok, true);
  assert.equal(game.setSkillPrefs('p1', { X35: { autoDefer: true } }).ok, true);
  assert.deepEqual(game.getState('p1').players.p1.skillState.prefs, { X35: { autoDefer: true } });
  assert.equal(game.getState('p2').players.p1.skillState.prefs, undefined, '相手には見せない');
  endTurn(game);
  endTurn(game);
  p1.hand = p1.hand.slice(0, 2);
  const hp2 = p1.castle.hp;
  assert.equal(game.skillAction('p1', 'B02').ok, true);
  assert.equal(p1.castle.hp, hp2 - 1);
  assert.equal(st.debt, 2);
});
