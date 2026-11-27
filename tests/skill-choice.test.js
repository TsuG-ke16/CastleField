// スキルの選択UI（feature/skill-choice-ui）の DOM 非依存部分：X15 の「毎回選ぶ」（選択待ち→X15pick／ほかの操作で自動決定）、
// L06 の出目の選び方の本人設定、X35 の切り替えの表示用ロジック、サーバーの setSkillPrefs が新しい値を通すこと
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { createSkillQa } from '../js/game/skills/qa.js';
import { cleanSkillPrefs } from '../server/rooms.js';
import { skillPrefRows, cardSkillQuestions, answersToOptions } from '../js/ui/skillTreeModel.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

const { opts: base } = (() => {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  return { cards, rules, opts };
})();
const qa = createSkillQa(base.skillTree);

function classicGame(builds) {
  // maxHand 6：段階A1 で手札上限が8になり、X15_BUILD の L04（ターン開始の追加ドロー）が手札6枚でも引くようになったため、従来の上限に固定（X15 が山札の先頭2枚を見ることを確かめる）
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false, maxHand: 6 } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const game = new Game(qa.apply({ ...opts, cards, rules, rng: seededRng(1) }, builds));
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

const X15_BUILD = ['L01', 'L02', 'L04', 'X15'];
const CHEAP = 'classic_king_infantry';
const RAY = 'classic_king_holy_ray';

/** p2 が X15 を "ask" にして、p2 のターン開始のドローで選択待ちを作る */
function x15Pending() {
  const game = classicGame([[], X15_BUILD]);
  assert.equal(game.setSkillPrefs('p2', { X15: { pick: 'ask' } }).ok, true);
  game.rng = () => 0; // X15 の 20% を必ず通す
  game.debugSetDeck([CHEAP, RAY, CHEAP, CHEAP, CHEAP], 'p2');
  const hand0 = game.players.p2.hand.length;
  endTurn(game);
  assert.equal(game.currentPlayer, 'p2');
  return { game, hand0 };
}

test('X15 "ask"：2枚が本人だけの選択待ちになり、X15pick で選んだ方を引く（残りは山札の先頭へ）', () => {
  const { game, hand0 } = x15Pending();
  const p2 = game.players.p2;
  const ch = game.getState('p2').players.p2.skillState.choice;
  assert.deepEqual(ch.options.map((o) => o.type), [CHEAP, RAY]);
  assert.equal(game.getState('p1').players.p2.skillState.choice, undefined, '相手には見せない');
  const act = game.listSkillActions('p2').find((a) => a.actionId === 'X15pick');
  assert.ok(act?.ok);
  assert.equal(act.options.length, 2);
  const drawnBefore = p2.hand.length - hand0; // X15 の1枚は手札に入っていない
  assert.equal(game.skillAction('p2', 'X15pick', { index: 2 }).ok, false);
  assert.equal(game.skillAction('p2', 'X15pick', { index: 0 }).ok, true);
  assert.equal(p2.hand.length - hand0, drawnBefore + 1);
  assert.equal(p2.hand.at(-1).type, CHEAP);
  assert.equal(game.skillRt.stateOf('p2').choice, null);
  assert.equal(game.pileOf('p2').deck[0].type, RAY, '選ばなかった方は山札の先頭');
  assert.equal(game.skillCounters('p2').X15, 1);
  assert.equal(game.listSkillActions('p2').some((a) => a.actionId === 'X15pick'), false, '選んだあとは一覧に出ない');
  assert.equal(game.skillAction('p2', 'X15pick', { index: 0 }).ok, false);
});

test('X15 "ask"：選ばずにほかの操作（endTurn）をしたら既定（MPコストの大きい方）で決まる', () => {
  const { game } = x15Pending();
  const p2 = game.players.p2;
  assert.ok(!p2.hand.some((c) => c.type === RAY));
  endTurn(game);
  assert.ok(p2.hand.some((c) => c.type === RAY));
  assert.equal(game.skillRt.stateOf('p2').choice, null);
});

test('X15：既定（設定なし）は選択待ちを作らず、X15pick は一覧に出ない', () => {
  const game = classicGame([[], X15_BUILD]);
  game.rng = () => 0;
  game.debugSetDeck([CHEAP, RAY, CHEAP], 'p2');
  endTurn(game);
  assert.equal(game.skillRt.stateOf('p2').choice, null);
  assert.ok(game.players.p2.hand.some((c) => c.type === RAY));
  assert.equal(game.listSkillActions('p2').some((a) => a.actionId === 'X15pick'), false);
});

test('L06：出目の選び方の本人設定（skillOptions.diceChoice が優先）', () => {
  const game = classicGame([['L01', 'L02', 'L04', 'L06'], []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  assert.equal(game.setSkillPrefs('p1', { L06: { diceChoice: 'nope' } }).ok, false);
  assert.equal(game.setSkillPrefs('p1', { L06: { diceChoice: 'low' } }).ok, true);
  rt.beginRoot('hand', { playerId: 'p1' });
  rt.handCard = { cardId: 'x1' };
  rt.handPlan = { options: {} };
  assert.equal(rt.diceValue(p1, { cardId: 'x1' }, 4, () => 2), 2);
  rt.handPlan = { options: { diceChoice: 'high' } };
  assert.equal(rt.diceValue(p1, { cardId: 'x1' }, 4, () => 2), 4);
});

test('サーバー：setSkillPrefs の値（X15 ask・L06 diceChoice）を通し、形の違うものは拒否', () => {
  assert.deepEqual(cleanSkillPrefs({ X15: { pick: 'ask' } }).value, { X15: { pick: 'ask' } });
  assert.deepEqual(cleanSkillPrefs({ L06: { diceChoice: 'low' } }).value, { L06: { diceChoice: 'low' } });
  assert.ok(cleanSkillPrefs({ X15: { pick: { a: 1 } } }).error);
});

test('画面：設定の行（取ったノードだけ・今の値）と、X35 のカードごとの延期', () => {
  assert.deepEqual(skillPrefRows(['B01'], {}), []);
  const rows = skillPrefRows(['X35', 'X15', 'L06'], { X35: { autoDefer: true } });
  assert.deepEqual(rows.map((r) => [r.skillId, r.key, r.value]), [['X15', 'pick', 'cost'], ['L06', 'diceChoice', 'high'], ['X35', 'autoDefer', true]]);
  assert.ok(rows.find((r) => r.skillId === 'X35').note.includes('任意のHP支払'));
  // HP支払を聞くカードで X35 を持つと「延期する」を聞く。既定は本人の設定。false も送る（設定の ON を1枚だけ止められる）
  const def = { kind: 'spell', effect: 'singleDamage' };
  const qs = cardSkillQuestions(['B03', 'X35'], def, { mp: 5, cost: 2, prefs: { X35: { autoDefer: true } } });
  const q = qs.find((x) => x.key === 'deferHp');
  assert.equal(q.default, true);
  assert.deepEqual(answersToOptions(qs, { bloodBlade: true, deferHp: false }), { bloodBlade: true, deferHp: false });
  assert.equal(cardSkillQuestions(['X35'], def, { mp: 5, cost: 2 }).length, 0, 'HPを払う選択がなければ聞かない');
  // L06 の既定は本人の設定
  const dice = cardSkillQuestions(['L06'], { kind: 'spell', effect: 'dice' }, { prefs: { L06: { diceChoice: 'low' } } });
  assert.equal(dice[0].default, 'low');
});

test('画面：端末に覚えた設定は、取ったノード・選べる値の分だけ送る', async () => {
  const { savedPrefsFor, loadSavedPrefs, savePrefs, prefFromInput } = await import('../js/ui/skillChoiceDialogs.js');
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  savePrefs(storage, { X35: { autoDefer: true } });
  savePrefs(storage, { X15: { pick: 'ask' } });
  assert.deepEqual(loadSavedPrefs(storage), { X35: { autoDefer: true }, X15: { pick: 'ask' } });
  assert.deepEqual(savedPrefsFor(['X35'], loadSavedPrefs(storage)), { X35: { autoDefer: true } });
  assert.deepEqual(savedPrefsFor(['X15', 'X35'], { X15: { pick: 'zzz' }, X35: { autoDefer: 'yes' }, B01: { a: 1 } }), {});
  mem.set('cf-skill-prefs', '{壊れ');
  assert.deepEqual(loadSavedPrefs(storage), {});
  assert.deepEqual(prefFromInput({ dataset: { pref: 'X35', key: 'autoDefer' }, type: 'checkbox', checked: false }), { X35: { autoDefer: false } });
  assert.equal(prefFromInput({ dataset: {} }), null);
});
