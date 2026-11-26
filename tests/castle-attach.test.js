// 4陣営（試作）：城の付着と反応（rules.castleAttach）のテスト。
// CLAUDE.md「4陣営モード」の「城の付着と反応（試作）」。数値は data/ の調整で落ちないよう、このファイルで決める
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { filterEventFor } from '../js/game/visibility.js';
import { validateReactions, elementIds } from '../js/game/Elements.js';
import { validatePassiveSpirits } from '../js/game/Setup.js';
import { loadFixture, seededRng, recordEvents, loadOptionalData } from './helpers.js';

const ELEMENTS = loadOptionalData('factions').elements;

const EXTRA = {
  fireBolt: { name: '火の矢', kind: 'spell', effect: 'damageEnemyCastle', element: 'fire', amount: 3, count: 1 },
  waterBolt: { name: '水の矢', kind: 'spell', effect: 'damageEnemyCastle', element: 'water', amount: 3, count: 1 },
  earthBolt: { name: '土の矢', kind: 'spell', effect: 'damageEnemyCastle', element: 'earth', amount: 3, count: 1 },
  plainBolt: { name: '無の矢', kind: 'spell', effect: 'damageEnemyCastle', amount: 3, count: 1 },
};

const REACTIONS = {
  attachTurns: 3,
  reactions: {
    evaporate: { name: '蒸発', elements: ['fire', 'water'], damage: 0, multiplier: 1.5, castle: { damage: 4 } },
    lava: { name: '溶岩', elements: ['fire', 'earth'], damage: 0, castle: { damage: 4, armorBreak: 2 } },
    mud: { name: '泥', elements: ['water', 'earth'], damage: 0, healCut: { ratio: 0.5, turns: 2 } },
  },
};

const ON = { castleAttach: true, castleAttachTurns: 4, castleReactionPerRound: 1 };

function setup({ rules: patch = ON, reactions = REACTIONS, playerCount = 2, teams = null } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), secondPlayerCastleBonus: 0, castleMaxHp: 40, elementBonus: 0, maxHand: 30, playerCount, ...patch };
  const game = new Game({
    cards, rules, rng: seededRng(7), elements: ELEMENTS, ...(reactions ? { reactions } : {}),
    ...(teams ? { setup: { teams } } : {}),
  });
  game.debugSetDeck(Array(60).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  /** pid の手札に type を作って出す（手番・枠を戻す） */
  const play = (pid, type, target) => {
    game.currentPlayer = pid;
    const p = game.players[pid];
    p.playedThisTurn = false;
    p.soldiersPlayedThisTurn = 0;
    game.debugSetHand(pid, [type]);
    const card = p.hand[0];
    const r = game.playCard(card.cardId, target);
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
    return r;
  };
  const events = (type) => log.filter((e) => e.event === type);
  return { game, log, play, events };
}

test('城の付着：属性つきの魔法が城に当たると、城に属性が付く（getState・イベント）', () => {
  const { game, play, events, log } = setup();
  log.length = 0;
  play('p1', 'fireBolt', { playerId: 'p2' });
  const att = events('castleElementAttached');
  assert.equal(att.length, 1);
  assert.deepEqual({ playerId: att[0].playerId, element: att[0].element, turns: att[0].turns }, { playerId: 'p2', element: 'fire', turns: 4 });
  assert.equal(att[0].source.kind, 'spell');
  // 当たりのイベント → 付着の順
  const names = log.map((e) => e.event);
  assert.ok(names.indexOf('castleDamaged') < names.indexOf('castleElementAttached'));
  assert.deepEqual(game.getState('p1').players.p2.castleAttachments, [{ element: 'fire', turns: 4 }]);
  assert.deepEqual(game.getState('p1').players.p1.castleAttachments, []);
  // 属性なしの魔法は付かない
  log.length = 0;
  play('p1', 'plainBolt', { playerId: 'p2' });
  assert.equal(events('castleElementAttached').length, 0);
  // 同じ属性がまた付いたら、残りは長い方にそろえる
  game.players.p2.castle.attachments[0].turns = 1;
  play('p1', 'fireBolt', { playerId: 'p2' });
  assert.deepEqual(game.getState(null).players.p2.castleAttachments, [{ element: 'fire', turns: 4 }]);
});

test('城の付着：城壁が全部受けても付く', () => {
  const { game, play, events } = setup();
  game.players.p2.armor = 10;
  play('p1', 'fireBolt', { playerId: 'p2' });
  const dmg = events('castleDamaged').at(-1);
  assert.equal(dmg.blocked, 3);
  assert.equal(game.players.p2.castle.hp, 40);
  assert.equal(events('castleElementAttached').length, 1);
});

test('城の付着：外れた魔法は付かない', () => {
  const { game, play, events } = setup();
  game.rollMiss = () => true;
  play('p1', 'fireBolt', { playerId: 'p2' });
  assert.equal(events('castleDamaged').length, 0);
  assert.equal(events('castleElementAttached').length, 0);
  assert.deepEqual(game.getState(null).players.p2.castleAttachments, []);
});

test('城の付着：属性つきの武器を持った兵士が城に着くと付く', () => {
  const { game, play, events, log } = setup();
  play('p1', 'infantry', { playerId: 'p2' });
  const s = game.players.p1.soldiers.at(-1);
  play('p1', 'flameSword', { soldierId: s.soldierId });
  s.position = 4; // 次の進軍で城に着く
  game.currentPlayer = 'p1';
  assert.equal(game.endTurn().ok, true); // p2 の番
  log.length = 0;
  assert.equal(game.endTurn().ok, true); // p1 の番：進軍で城に着く
  const names = log.map((e) => e.event);
  const hit = log.findIndex((e) => e.event === 'castleDamaged' && e.source?.kind === 'soldier');
  assert.ok(hit >= 0, '兵士が城に着いた');
  assert.ok(hit < names.indexOf('castleElementAttached'));
  const att = events('castleElementAttached')[0];
  assert.equal(att.playerId, 'p2');
  assert.equal(att.element, 'fire');
  assert.equal(att.source.kind, 'soldier');
});

test('城の反応：別の属性が当たると反応して追加ダメージ（城壁が先に受ける）。付いていた属性は消え、当たった属性は付かない', () => {
  const { game, play, events, log } = setup();
  play('p1', 'fireBolt', { playerId: 'p2' }); // 火が付く（40 → 37）
  game.players.p2.armor = 5;
  log.length = 0;
  play('p1', 'waterBolt', { playerId: 'p2' }); // 3 は城壁が受ける（残り2）→ 蒸発 4：城壁2・城HP2
  const r = events('castleReactionTriggered');
  assert.equal(r.length, 1);
  assert.deepEqual({ playerId: r[0].playerId, reaction: r[0].reaction, damage: r[0].damage }, { playerId: 'p2', reaction: 'evaporate', damage: 4 });
  assert.deepEqual(r[0].consumed, ['fire']);
  const names = log.map((e) => e.event);
  assert.deepEqual(names.filter((n) => ['castleDamaged', 'castleReactionTriggered', 'castleElementCleared', 'castleElementAttached'].includes(n)),
    ['castleDamaged', 'castleReactionTriggered', 'castleElementCleared', 'castleDamaged']);
  const reactionHit = events('castleDamaged').at(-1);
  assert.deepEqual(reactionHit.source, { kind: 'reaction', reaction: 'evaporate' });
  assert.equal(reactionHit.blocked, 2);
  assert.equal(game.players.p2.armor, 0);
  assert.equal(game.players.p2.castle.hp, 35);
  assert.deepEqual(events('castleElementCleared')[0], { playerId: 'p2', element: 'fire', reason: 'reaction', event: 'castleElementCleared' });
  assert.deepEqual(game.getState(null).players.p2.castleAttachments, []);
});

test('城の反応：溶岩は城壁を追加で削る。深淵侵食などの healCut は城の回復を減らす', () => {
  const { game, play, events } = setup({ rules: { ...ON, castleReactionPerRound: 0 } });
  play('p1', 'fireBolt', { playerId: 'p2' });
  game.players.p2.armor = 10;
  play('p1', 'earthBolt', { playerId: 'p2' }); // 3 は城壁（残り7）→ 溶岩：城壁を2削って（5）→ 4 は城壁（残り1）
  assert.equal(events('castleReactionTriggered').at(-1).armorBroken, 2);
  assert.equal(game.players.p2.armor, 1);
  assert.equal(game.players.p2.castle.hp, 37);
  // 泥（healCut）：水が付いて、土が当たる
  play('p1', 'waterBolt', { playerId: 'p2' });
  play('p1', 'earthBolt', { playerId: 'p2' });
  assert.equal(events('castleReactionTriggered').at(-1).reaction, 'mud');
  assert.equal(events('castleHealCut').length, 1);
  assert.deepEqual(game.players.p2.castle.healCut, { ratio: 0.5, turns: 2 });
});

test('城の反応：同じ城で起きる反応は1周回に1回まで（上限のあとは付着する）。次の周回でまた起きる', () => {
  const { game, play, events } = setup();
  play('p1', 'fireBolt', { playerId: 'p2' });
  play('p1', 'waterBolt', { playerId: 'p2' }); // 蒸発（この周回の1回目）
  assert.equal(events('castleReactionTriggered').length, 1);
  play('p1', 'fireBolt', { playerId: 'p2' }); // 付く
  play('p1', 'waterBolt', { playerId: 'p2' }); // 上限なので反応せず、水も付く
  assert.equal(events('castleReactionTriggered').length, 1);
  assert.deepEqual(game.getState(null).players.p2.castleAttachments.map((a) => a.element), ['fire', 'water']);
  // 次の周回なら起きる
  game.round += 1;
  play('p1', 'earthBolt', { playerId: 'p2' });
  assert.equal(events('castleReactionTriggered').length, 2);
  // 別の城の上限は別
  play('p2', 'fireBolt', { playerId: 'p1' });
  play('p2', 'waterBolt', { playerId: 'p1' });
  assert.equal(events('castleReactionTriggered').at(-1).playerId, 'p1');
});

test('城の付着：城の持ち主のターンの終わりに1減り、0で消える', () => {
  const { game, play, events } = setup({ rules: { ...ON, castleAttachTurns: 2 } });
  play('p1', 'fireBolt', { playerId: 'p2' });
  game.currentPlayer = 'p1';
  assert.equal(game.endTurn().ok, true); // p1 のターンの終わり：p2 の城は減らない
  assert.deepEqual(game.getState(null).players.p2.castleAttachments, [{ element: 'fire', turns: 2 }]);
  assert.equal(game.endTurn().ok, true); // p2 のターンの終わり：1
  assert.deepEqual(game.getState(null).players.p2.castleAttachments, [{ element: 'fire', turns: 1 }]);
  assert.equal(game.endTurn().ok, true); // p1
  assert.equal(game.endTurn().ok, true); // p2：0 で消える
  assert.deepEqual(game.getState(null).players.p2.castleAttachments, []);
  const cleared = events('castleElementCleared');
  assert.equal(cleared.length, 1);
  assert.deepEqual({ playerId: cleared[0].playerId, element: cleared[0].element, reason: cleared[0].reason }, { playerId: 'p2', element: 'fire', reason: 'expired' });
});

test('castleAttach が無い（false）と、城には何も付かず、getState にキーも出ない', () => {
  for (const rules of [{}, { castleAttach: false }]) {
    const { game, play, events } = setup({ rules });
    play('p1', 'fireBolt', { playerId: 'p2' });
    play('p1', 'waterBolt', { playerId: 'p2' });
    assert.equal(events('castleElementAttached').length, 0);
    assert.equal(events('castleReactionTriggered').length, 0);
    assert.equal(game.players.p2.castle.hp, 34);
    assert.equal('castleAttachments' in game.getState(null).players.p2, false);
  }
  // reactions を渡さないゲームでも何も起きない
  const { game, play, events } = setup({ reactions: null });
  play('p1', 'fireBolt', { playerId: 'p2' });
  assert.equal(events('castleElementAttached').length, 0);
  assert.equal('castleAttachments' in game.getState(null).players.p2, false);
});

test('チーム戦：城を共有する陣営の城（城の持ち主）に付き、メンバー全員の getState に同じ付着が出る', () => {
  const { game, play, events } = setup({ playerCount: 4, teams: ['t1', 't2', 't1', 't2'] });
  // p3（t1）が t2 の城（持ち主 p2）を撃つ
  play('p3', 'fireBolt', { playerId: 'p2' });
  const att = events('castleElementAttached');
  assert.equal(att.length, 1);
  assert.equal(att[0].playerId, 'p2');
  const st = game.getState(null);
  assert.deepEqual(st.players.p2.castleAttachments, [{ element: 'fire', turns: 4 }]);
  assert.deepEqual(st.players.p4.castleAttachments, [{ element: 'fire', turns: 4 }]);
  assert.deepEqual(st.players.p1.castleAttachments, []);
  // 別のメンバー（p1）の水で反応する
  play('p1', 'waterBolt', { playerId: 'p2' });
  assert.equal(events('castleReactionTriggered')[0].playerId, 'p2');
});

test('オンライン：城の付着・反応のイベントと getState は、だれにも隠さない', () => {
  const { game, play, log } = setup();
  play('p1', 'fireBolt', { playerId: 'p2' });
  play('p1', 'waterBolt', { playerId: 'p2' });
  play('p1', 'fireBolt', { playerId: 'p2' });
  for (const type of ['castleElementAttached', 'castleReactionTriggered', 'castleElementCleared']) {
    const e = log.find((x) => x.event === type);
    assert.ok(e, type);
    const { event, ...payload } = e;
    for (const viewer of ['p1', 'p2', null]) assert.deepEqual(filterEventFor(type, payload, viewer), payload, `${type} → ${viewer}`);
  }
  assert.deepEqual(game.getState('p1').players.p2.castleAttachments, game.getState('p2').players.p2.castleAttachments);
  assert.deepEqual(game.getState('p2').players.p2.castleAttachments, [{ element: 'fire', turns: 4 }]);
});

test('森の精霊の付着先 spiritAttachTo: "castle"：敵の兵士ではなく敵の城に付く（反応は起こさない）', () => {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, deckMode: 'own', ...ON };
  const spirits = {
    attachTurns: 1, spiritAttachTo: 'castle',
    spirits: [
      { spirit: 'fire', name: 'イフリート', element: 'fire', effect: 'castleDamage', amount: 2 },
      { spirit: 'water', name: 'ウンディーネ', element: 'water', effect: 'soldiersDamage', amount: 1 },
    ],
  };
  const decks = { forest: { name: '森', cards: { heal: 30 }, passiveSpirits: spirits }, plain: { name: 'ふつう', cards: { heal: 30 } } };
  const game = new Game({ cards, rules, rng: seededRng(5), elements: ELEMENTS, reactions: REACTIONS, decks, setup: { decks: ['forest', 'plain'] } });
  game.debugSetHand('p2', ['infantry']);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  // p2 の兵士を出しておく
  game.currentPlayer = 'p2';
  const c = game.players.p2.hand[0];
  assert.equal(game.playCard(c.cardId, { playerId: 'p1' }).ok, true);
  const soldier = game.players.p2.soldiers[0];
  // start() で p1 のターン1の精霊（火）がもう動いているので、最初からやり直す
  game.players.p1.passiveSpiritIndex = 0;
  game.players.p2.castle.attachments = [];
  log.length = 0;
  game.actPassiveSpirit(game.players.p1); // 火
  assert.equal(log.filter((e) => e.event === 'elementAttached').length, 0, '兵士には付かない');
  assert.equal(soldier.attachments.length, 0);
  const att = log.filter((e) => e.event === 'castleElementAttached');
  assert.equal(att.length, 1);
  assert.deepEqual({ playerId: att[0].playerId, element: att[0].element, turns: att[0].turns }, { playerId: 'p2', element: 'fire', turns: 1 });
  assert.equal(att[0].source.kind, 'passiveSpirit');
  game.actPassiveSpirit(game.players.p1); // 水：反応は起こさず、付着が増える
  assert.equal(log.filter((e) => e.event === 'castleReactionTriggered').length, 0);
  assert.deepEqual(game.getState(null).players.p2.castleAttachments.map((a) => a.element), ['fire', 'water']);
  // castleAttach が無いと、城にも付かない
  const off = new Game({ cards, rules: { ...rules, castleAttach: false }, rng: seededRng(5), elements: ELEMENTS, reactions: REACTIONS, decks, setup: { decks: ['forest', 'plain'] } });
  const log2 = recordEvents(off, EVENT_TYPES);
  off.start(); // p1 のターン1で精霊が動く
  off.actPassiveSpirit(off.players.p1);
  assert.equal(log2.filter((e) => e.event === 'castleElementAttached').length, 0);
});

test('データのチェック：reactions の castle・chaos.castleDamagePerElement、spiritAttachTo、rules のキー', () => {
  const ids = elementIds(ELEMENTS);
  assert.throws(() => validateReactions({ attachTurns: 1, reactions: { x: { name: 'x', elements: ['fire', 'water'], damage: 0, castle: { damage: -1 } } } }, ids), /castle/);
  assert.throws(() => validateReactions({ attachTurns: 1, reactions: { x: { name: 'x', elements: ['fire', 'water'], damage: 0, castle: { damage: 1, armorBreak: 0 } } } }, ids), /castle/);
  assert.throws(() => validateReactions({ attachTurns: 1, reactions: {}, chaos: { element: 'chaos', name: 'c', damagePerElement: 1, minElements: 3, castleDamagePerElement: 1.5 } }, ids), /castleDamagePerElement/);
  const sp = { attachTurns: 1, spirits: [{ spirit: 'fire', name: 'f', element: 'fire', effect: 'castleDamage', amount: 1 }] };
  assert.throws(() => validatePassiveSpirits({ ...sp, spiritAttachTo: 'monster' }, ids, 'x'), /spiritAttachTo/);
  validatePassiveSpirits({ ...sp, spiritAttachTo: 'castle' }, ids, 'x');
  const cards = loadFixture('cards-step2.json');
  const base = loadFixture('rules.json');
  assert.throws(() => new Game({ cards, rules: { ...base, castleAttach: 'yes' } }), /castleAttach/);
  assert.throws(() => new Game({ cards, rules: { ...base, castleAttachTurns: 0 } }), /castleAttachTurns/);
  assert.throws(() => new Game({ cards, rules: { ...base, castleReactionPerRound: -1 } }), /castleReactionPerRound/);
  // 本物のデータ（data/factions/）が通る
  const real = loadOptionalData('factions');
  validateReactions(real.reactions, elementIds(real.elements));
});

test('本物のデータ：4陣営の rules.json は城の付着を使う（castleAttach: true。人間の指示）。通常モード・クラシックは使わない', async () => {
  const { buildData } = await import('./helpers.js');
  assert.equal(buildData({ mode: 'factions' }).rules.castleAttach, true);
  assert.ok(!buildData({}).rules.castleAttach);
  assert.ok(!buildData({ mode: 'classic' }).rules.castleAttach);
});
