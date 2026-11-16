// リアクション型防御（攻撃された側が、その場でカードを使って対応する）のテスト。
// tests/fixtures/cards-step6.json：STEP 2 のカード ＋ 防御カード（受け流し5・迎撃4・反撃（軽減2・反撃4））＋ 防御できない魔法（貫く炎）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { previewReaction, checkCombo, canReactWith } from '../js/game/Reaction.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

// 道は3マス・兵士が城に着くと 攻撃力×3 のダメージ（今の data/rules.json と同じ形）
function setup({ p1 = [], p2 = [], deck = Array(40).fill('heal'), rules = {}, cards = null } = {}) {
  const defs = cards ?? loadFixture('cards-step6.json');
  const r = { ...loadFixture('rules.json'), laneLength: 3, castleMaxHp: 40, soldierCastleDamageMultiplier: 3, reactionMaxCards: 2, ...rules };
  const game = new Game({ cards: defs, rules: r, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const handOf = (game, pid) => game.getState(pid).players[pid].hand;
const idOf = (game, pid, type, nth = 0) => handOf(game, pid).filter((c) => c.type === type)[nth].cardId;
const names = (log, from = 0) => log.slice(from).map((e) => e.event);
const hp = (game, pid) => game.getState(null).players[pid].castleHp;

/** p1 が騎士を出し、p2 が何もせずターンを終え、p1 の進軍で騎士が城に着く直前まで進める。
 *  騎士は速さ3なので、出した次の p1 のターンの進軍で城に着く */
function knightArrives({ p2 = ['guard'], p1Extra = [], rules } = {}) {
  const t = setup({ p1: ['knight', ...p1Extra], p2, rules });
  const { game } = t;
  assert.equal(game.playCard(idOf(game, 'p1', 'knight')).ok, true);
  assert.equal(game.endTurn().ok, true); // p2 のターン
  assert.equal(game.endTurn().ok, true); // p1 のターンの進軍で騎士が城に着く
  return t;
}

test('防御できるカードがあれば、城に着いた兵士のところで止まって防御を待つ', () => {
  const { game, log } = knightArrives();
  const st = game.getState('p2');
  assert.equal(st.phase, 'reaction');
  assert.equal(st.currentPlayer, 'p1'); // 手番は攻撃した側のまま
  assert.deepEqual(
    { ...st.reaction, soldier: undefined },
    {
      attackerId: 'p1', defenderId: 'p2', target: 'castle', source: { kind: 'soldier', soldierId: 's01' },
      damage: 15, unblockable: false, maxCards: 2, soldier: undefined, castleHp: 42, armor: 0,
    },
  );
  assert.equal(st.reaction.soldier.hp, 4);
  // まだ城にダメージは入っていない。兵士も消えていない
  assert.equal(hp(game, 'p2'), 42);
  assert.equal(st.players.p1.soldiers.length, 1);
  assert.equal(names(log).at(-1), 'reactionRequested');
});

test('防御できるカードがなければ、止まらずに自動で受ける（場面を作らない）', () => {
  const { game, log } = knightArrives({ p2: ['infantry', 'heal'] });
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(hp(game, 'p2'), 42 - 15);
  assert.equal(names(log).includes('reactionRequested'), false);
  assert.equal(names(log).includes('reactionResolved'), false);
});

test('防御せずに受ける：react([]) で、そのまま城にダメージが入る。カードは減らない', () => {
  const { game, log } = knightArrives();
  const from = log.length;
  assert.deepEqual(game.react([]), { ok: true });
  assert.equal(hp(game, 'p2'), 27);
  assert.equal(game.getState(null).phase, 'main');
  assert.deepEqual(names(log, from), ['reactionResolved', 'castleDamaged', 'soldierDestroyed']);
  assert.equal(log[from].passed, true);
  assert.equal(handOf(game, 'p2').some((c) => c.type === 'guard'), true);
});

test('受け流し：ダメージを5減らす。カードは使った分だけ減る', () => {
  const { game, log } = knightArrives({ p2: ['guard', 'heal'] });
  const from = log.length;
  assert.equal(game.react([idOf(game, 'p2', 'guard')]).ok, true);
  assert.equal(hp(game, 'p2'), 42 - 10);
  assert.deepEqual(names(log, from), ['cardPlayed', 'reactionResolved', 'castleDamaged', 'soldierDestroyed']);
  const r = log.find((e) => e.event === 'reactionResolved');
  assert.deepEqual({ types: r.types, damage: r.damage, reduced: r.reduced, intercepted: r.intercepted }, { types: ['guard'], damage: 10, reduced: 5, intercepted: false });
  assert.equal(handOf(game, 'p2').some((c) => c.type === 'guard'), false);
  assert.equal(game.getState(null).discardCount >= 1, true);
});

test('迎撃：兵士を倒せれば攻撃は無効（城にダメージなし・兵士は「killed」で消える）', () => {
  const { game, log } = knightArrives({ p2: ['intercept'] });
  const from = log.length;
  assert.equal(game.react([idOf(game, 'p2', 'intercept')]).ok, true);
  assert.equal(hp(game, 'p2'), 42);
  assert.deepEqual(names(log, from), ['cardPlayed', 'reactionResolved', 'soldierDamaged', 'soldierDestroyed']);
  assert.equal(log[from + 2].cause, 'intercept');
  assert.equal(log[from + 3].reason, 'killed');
  assert.equal(log[from + 1].intercepted, true);
  assert.equal(game.getState(null).players.p1.soldiers.length, 0);
});

test('迎撃：倒せなければ兵士は城に着く（盾が先にダメージを受けるので、盾つきの兵士は迎撃に強い）', () => {
  const { game } = setup({ p1: ['knight', 'shield'], p2: ['intercept'] });
  game.playCard(idOf(game, 'p1', 'knight'));
  game.playCard(idOf(game, 'p1', 'shield'), { soldierId: 's01' }); // 盾3
  game.endTurn();
  game.endTurn();
  assert.equal(game.getState(null).phase, 'reaction');
  const pv = game.previewReaction([idOf(game, 'p2', 'intercept')]);
  assert.equal(pv.intercepted, false);
  assert.equal(pv.soldierHpAfter, 3); // 盾3が受けて、HP4に1だけ届く
  assert.equal(game.react([idOf(game, 'p2', 'intercept')]).ok, true);
  assert.equal(hp(game, 'p2'), 42 - 15); // 倒せなかったので、そのまま届く
});

test('反撃：ダメージを2減らし、相手の城に4ダメージ', () => {
  const { game, log } = knightArrives({ p2: ['counter'] });
  const from = log.length;
  assert.equal(game.react([idOf(game, 'p2', 'counter')]).ok, true);
  assert.equal(hp(game, 'p2'), 42 - 13);
  assert.equal(hp(game, 'p1'), 40 - 4);
  assert.deepEqual(names(log, from), ['cardPlayed', 'reactionResolved', 'castleDamaged', 'castleDamaged', 'soldierDestroyed']);
  assert.deepEqual(log[from + 3].source, { kind: 'counter', type: 'counter' });
  assert.equal(log[from + 3].playerId, 'p1');
});

test('反撃：防御側の城が落ちたら、反撃は起きない（先に決着する）', () => {
  const { game, log } = knightArrives({ p2: ['counter'] });
  assert.equal(game.debugSetCastleHp('p2', 5).ok, true);
  assert.equal(game.react([idOf(game, 'p2', 'counter')]).ok, true); // 15-2=13 > 5
  assert.equal(game.getState(null).phase, 'gameOver');
  assert.equal(game.getState(null).winner, 'p1');
  assert.equal(hp(game, 'p1'), 40);
  assert.equal(log.at(-1).event, 'gameOver');
});

test('反撃で相手の城を落とせば、防御した側の勝ち', () => {
  const { game } = knightArrives({ p2: ['counter'] });
  assert.equal(game.debugSetCastleHp('p1', 3).ok, true);
  assert.equal(game.react([idOf(game, 'p2', 'counter')]).ok, true);
  assert.equal(game.getState(null).phase, 'gameOver');
  assert.equal(game.getState(null).winner, 'p2');
});

test('組み合わせ：迎撃＋受け流し。迎撃で倒せるなら、受け流しは使わなくてよい（使ったぶんは無駄になる）', () => {
  const { game } = knightArrives({ p2: ['intercept', 'guard', 'counter'] });
  const pv = game.previewReaction([idOf(game, 'p2', 'intercept'), idOf(game, 'p2', 'guard')]);
  assert.deepEqual({ ok: pv.ok, intercepted: pv.intercepted, damage: pv.damage }, { ok: true, intercepted: true, damage: 0 });
  // 受け流し＋反撃：軽減 5+2 = 7、反撃4
  const pv2 = game.previewReaction([idOf(game, 'p2', 'guard'), idOf(game, 'p2', 'counter')]);
  assert.deepEqual({ damage: pv2.damage, reduced: pv2.reduced, counterDamage: pv2.counterDamage }, { damage: 8, reduced: 7, counterDamage: 4 });
});

test('組み合わせの決まり：最大枚数・同じ効果は1枚まで・持っていないカード・防御できないカード', () => {
  const { game } = knightArrives({ p2: ['guard', 'guard', 'intercept', 'heal'], rules: { reactionMaxCards: 2 } });
  const g1 = idOf(game, 'p2', 'guard', 0);
  const g2 = idOf(game, 'p2', 'guard', 1);
  const i1 = idOf(game, 'p2', 'intercept');
  assert.equal(game.react([g1, g2]).reason, '同じ効果のカードは、1回の攻撃に1枚までです');
  assert.equal(game.react([g1, g1]).reason, '同じカードが2回選ばれています');
  assert.equal(game.react(['c999']).reason, 'そのカードは手札にありません');
  assert.equal(game.react([idOf(game, 'p2', 'heal')]).reason, 'このカードは防御には使えません');
  assert.equal(game.react('x').ok, false);
  assert.equal(game.getState(null).phase, 'reaction'); // 失敗しても、場面は続く
  assert.equal(game.react([g1, i1]).ok, true);
});

test('reactionMaxCards が1なら、1枚まで。0なら防御の場面を作らない', () => {
  const one = knightArrives({ p2: ['guard', 'intercept'], rules: { reactionMaxCards: 1 } }).game;
  assert.equal(one.react([idOf(one, 'p2', 'guard'), idOf(one, 'p2', 'intercept')]).reason, '防御に使えるカードは1回の攻撃に1枚までです');
  const none = knightArrives({ p2: ['guard'], rules: { reactionMaxCards: 0 } }).game;
  assert.equal(none.getState(null).phase, 'main');
  assert.equal(hp(none, 'p2'), 27);
});

test('防御の場面では、ほかの操作はできない（理由つき）。防御カードは自分の番には出せない', () => {
  const { game } = knightArrives({ p2: ['guard'] });
  assert.equal(game.endTurn().ok, false);
  assert.match(game.endTurn().reason, /防御/);
  assert.equal(game.playCard('c01').ok, false);
  assert.equal(game.discard([]).ok, false);
  assert.equal(game.buyUpgrade('repair').ok, false);
  game.react([]);
  // 自分の番に防御カードを出そうとしても出せない
  game.endTurn(); // p2 のターン
  const r = game.canPlayCard(idOf(game, 'p2', 'guard'));
  assert.deepEqual(r, { ok: false, reason: '防御カードは、相手に攻撃されたときに使います' });
});

test('canReact：防御の場面だけ。使えない理由も返す', () => {
  const { game } = setup({ p1: ['knight'], p2: ['guard', 'heal'] });
  assert.equal(game.canReact(idOf(game, 'p2', 'guard')).reason, 'いまは防御する場面ではありません');
  assert.equal(game.react([]).reason, 'いまは防御する場面ではありません');
  const t = knightArrives({ p2: ['guard', 'heal'] }).game;
  assert.deepEqual(t.canReact(idOf(t, 'p2', 'guard')), { ok: true });
  assert.equal(t.canReact(idOf(t, 'p2', 'heal')).ok, false);
  assert.equal(t.canReact('c999').reason, 'そのカードは手札にありません');
});

test('防御しないでよい手札があるあいだは、毎回止まる。複数の兵士が着くときは、出した順に1体ずつ防御の場面になる', () => {
  const { game, log } = setup({ p1: ['infantry', 'knight'], p2: ['guard', 'guard', 'heal'], deck: Array(40).fill('heal') });
  game.playCard(idOf(game, 'p1', 'infantry'));
  game.endTurn(); // p2
  game.endTurn(); // p1：歩兵は2マス進む
  // 歩兵は出した次の進軍で 2 マス、次で城に着く（速さ2・道3マス）。2回目の進軍まで進める
  assert.equal(game.getState(null).phase, 'main');
  game.playCard(idOf(game, 'p1', 'knight'));
  game.endTurn(); // p2
  game.endTurn(); // p1：歩兵（先に出した）が城に着く → 防御の場面
  assert.equal(game.getState(null).phase, 'reaction');
  assert.equal(game.getState(null).reaction.source.soldierId, 's01');
  assert.equal(game.getState(null).reaction.damage, 9);
  assert.equal(game.react([]).ok, true);
  // 続けて騎士が着く：2回目の防御の場面
  assert.equal(game.getState(null).phase, 'reaction');
  assert.equal(game.getState(null).reaction.source.soldierId, 's02');
  assert.equal(game.getState(null).reaction.damage, 15);
  assert.equal(game.react([idOf(game, 'p2', 'guard')]).ok, true);
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(hp(game, 'p2'), 42 - 9 - 10);
  assert.equal(log.filter((e) => e.event === 'reactionRequested').length, 2);
});

test('防御のあとも進軍は続く：止まっていた手番のドローは済んでいて、メインに戻る', () => {
  const { game } = knightArrives({ p2: ['guard'] });
  const handBefore = handOf(game, 'p1').length;
  game.react([]);
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(game.getState(null).currentPlayer, 'p1');
  assert.equal(handOf(game, 'p1').length, handBefore); // ドローは防御の前に済んでいる（二重に引かない）
  assert.equal(game.playCard('c01').ok, false); // 騎士はもう手札にない
  assert.equal(game.endTurn().ok, true);
});

test('ファイアボール：防御の場面ができる。迎撃は魔法には使えない（理由つき）。受け流しは使える', () => {
  const { game, log } = setup({ p1: ['fireball'], p2: ['intercept', 'guard'] });
  assert.equal(game.playCard(idOf(game, 'p1', 'fireball')).ok, true);
  assert.equal(game.getState(null).phase, 'reaction');
  assert.deepEqual(game.getState(null).reaction.source, { kind: 'spell', type: 'fireball' });
  assert.equal(game.getState(null).reaction.soldier, null);
  assert.equal(hp(game, 'p2'), 42);
  assert.equal(game.canReact(idOf(game, 'p2', 'intercept')).reason, '迎撃は兵士の攻撃にしか使えません（魔法は止められません）');
  assert.equal(game.react([idOf(game, 'p2', 'intercept')]).ok, false);
  assert.equal(game.react([idOf(game, 'p2', 'guard')]).ok, true);
  assert.equal(hp(game, 'p2'), 42 - 8 + 5);
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(names(log).filter((e) => e === 'spellCast').length, 1);
  // メインは出し終えている
  assert.equal(game.getState(null).players.p1.playedThisTurn, true);
});

test('ファイアボールを防御しなかったとき：反撃を使えば、相手の城にも届く。城壁は先にダメージを受ける', () => {
  const { game } = setup({ p1: ['fireball', 'wall'], p2: ['counter', 'wall'] });
  game.playCard(idOf(game, 'p1', 'fireball'));
  assert.equal(game.react([idOf(game, 'p2', 'counter')]).ok, true);
  assert.equal(hp(game, 'p2'), 42 - 6);
  assert.equal(hp(game, 'p1'), 36);
});

test('防御不能の魔法（unblockable）は、防御の場面を作らない', () => {
  const { game, log } = setup({ p1: ['pierce'], p2: ['guard', 'counter'] });
  assert.equal(game.playCard(idOf(game, 'p1', 'pierce')).ok, true);
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(hp(game, 'p2'), 42 - 6);
  assert.equal(names(log).includes('reactionRequested'), false);
});

test('城壁があるときの防御：軽減のあとに城壁が受ける', () => {
  const { game } = setup({ p1: ['knight'], p2: ['wall', 'guard'] });
  game.playCard(idOf(game, 'p1', 'knight'));
  game.endTurn();
  game.playCard(idOf(game, 'p2', 'wall')); // 城壁5
  game.endTurn();
  assert.equal(game.getState(null).phase, 'reaction');
  assert.equal(game.getState(null).reaction.armor, 5);
  game.react([idOf(game, 'p2', 'guard')]); // 15-5=10、城壁5が受けて、城には5
  assert.equal(hp(game, 'p2'), 42 - 5);
});

test('防御の途中で降参すると、すぐ決着する（止まった処理は続かない）', () => {
  const { game, log } = knightArrives();
  assert.equal(game.surrender('p2').ok, true);
  const st = game.getState(null);
  assert.equal(st.phase, 'gameOver');
  assert.equal(st.winner, 'p1');
  assert.equal(st.reaction, null);
  assert.equal(game.react([]).ok, false);
  assert.equal(log.at(-1).event, 'gameOver');
});

test('魔物の攻撃や毒は防御の対象ではない', () => {
  const { game, log } = setup({ p1: ['poisonMist'], p2: ['guard'] });
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(names(log).includes('reactionRequested'), false);
});

test('Reaction.js：見積もりの計算（迎撃→軽減→ダメージ→反撃）', () => {
  const guard = { kind: 'reaction', effect: 'guard', amount: 5 };
  const icpt = { kind: 'reaction', effect: 'intercept', amount: 4 };
  const ctr = { kind: 'reaction', effect: 'counter', amount: 4, block: 2 };
  const atk = { source: 'soldier', damage: 15, soldier: { hp: 4, shield: 0 } };
  assert.deepEqual(previewReaction(atk, []).damage, 15);
  assert.deepEqual(previewReaction(atk, [guard]).damage, 10);
  assert.equal(previewReaction(atk, [icpt]).intercepted, true);
  assert.equal(previewReaction({ ...atk, soldier: { hp: 4, shield: 1 } }, [icpt]).intercepted, false);
  // 軽減は攻撃のダメージより大きくならない
  assert.equal(previewReaction({ source: 'spell', damage: 3 }, [guard, ctr]).damage, 0);
  assert.equal(previewReaction({ source: 'spell', damage: 3 }, [guard, ctr]).reduced, 3);
  assert.equal(canReactWith({ source: 'spell', damage: 3 }, icpt).ok, false);
  assert.equal(canReactWith({ source: 'soldier', damage: 3, unblockable: true }, guard).reason, 'この攻撃は防げません');
  assert.equal(canReactWith({ source: 'soldier', damage: 3 }, { kind: 'spell', effect: 'x' }).ok, false);
  assert.equal(checkCombo(atk, [guard, icpt, ctr], 2).ok, false);
  assert.equal(checkCombo(atk, [guard, icpt], 2).ok, true);
});

test('cards.json の防御カードの書き間違いは、起動時に気づける', () => {
  const bad = loadFixture('cards-step6.json');
  bad.guard = { ...bad.guard, amount: 0 };
  assert.throws(() => new Game({ cards: bad, rules: loadFixture('rules.json') }), /amount は1以上の整数/);
  const bad2 = loadFixture('cards-step6.json');
  bad2.counter = { name: '反撃', kind: 'reaction', effect: 'counter', amount: 4, count: 1 };
  assert.throws(() => new Game({ cards: bad2, rules: loadFixture('rules.json') }), /block は1以上の整数/);
  const bad3 = loadFixture('cards-step6.json');
  bad3.thunder = { ...bad3.thunder, unblockable: true };
  assert.throws(() => new Game({ cards: bad3, rules: loadFixture('rules.json') }), /unblockable/);
});
