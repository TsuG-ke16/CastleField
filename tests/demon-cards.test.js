// 4陣営の魔族の強化（人間の指示。数値はすべて仮）のテスト：毒の霧（城の毒）・呪いの印（手前3体）・脆弱・闇の侵食・魔の血・血の契約・封魔・吸命の剣・
// 混沌（カオスロッド・混沌の付着）・属性持ちの兵士。CLAUDE.md「4陣営モード」の「魔族の強化（第2弾）」。
// 仕組みのテストは、このファイルで決めた数値で確かめる（data/ の調整で落ちないように）。本物のデータは「本物のカード」のテストで確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents, loadOptionalData, buildData, loadFactionCards } from './helpers.js';

const MODE = 'factions';
const ELEMENTS = loadOptionalData(MODE).elements;
const REACTIONS = loadOptionalData(MODE).reactions;

const EXTRA = {
  striker: { name: '強兵', kind: 'soldier', hp: 9, attack: 5, speed: 1, count: 1 },
  weakling: { name: '弱兵', kind: 'soldier', hp: 3, attack: 1, speed: 1, count: 1 },
  wall: { name: '壁兵', kind: 'soldier', hp: 40, attack: 1, speed: 1, count: 1 },
  tap: { name: '火の粉', kind: 'spell', effect: 'singleDamage', amount: 3, count: 1 },
  bolt: { name: '雷', kind: 'spell', effect: 'damageEnemyCastle', amount: 5, count: 1 },
  mist: { name: '毒霧', kind: 'spell', effect: 'poisonEnemyCastle', amount: 2, turns: 4, maxTurns: 8, count: 1 },
};

/**
 * p1 が魔族（passive）、p2 がふつう（p2Passive）。本物の4陣営のカードも使える。start() 済み（p1 のターン1）。
 * reactions：既定は本物の反応（null で反応なし）
 */
function setup({ passive = null, p2Passive = null, rules: patch = {}, hands = {}, reactions = REACTIONS } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...buildData({ mode: MODE }).cards, ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, deckMode: 'own', ...patch };
  const decks = {
    demon: { name: '魔族', cards: { heal: 30 }, ...(passive ? { passive } : {}) },
    plain: { name: 'ふつう', cards: { heal: 30 }, ...(p2Passive ? { passive: p2Passive } : {}) },
  };
  const game = new Game({ cards, rules, rng: seededRng(7), elements: ELEMENTS, decks, setup: { decks: ['demon', 'plain'] }, ...(reactions ? { reactions } : {}) });
  game.debugSetHand('p1', hands.p1 ?? []);
  game.debugSetHand('p2', hands.p2 ?? []);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  const play = (pid, type, target) => {
    const p = game.players[pid];
    game.currentPlayer = pid;
    p.playedThisTurn = false;
    p.soldiersPlayedThisTurn = 0;
    const card = p.hand.find((c) => c.type === type);
    assert.ok(card, `${pid} の手札に ${type} がある`);
    const r = game.playCard(card.cardId, target);
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
    return p.soldiers.at(-1);
  };
  const can = (pid, type, target) => {
    game.currentPlayer = pid;
    game.players[pid].playedThisTurn = false;
    const card = game.players[pid].hand.find((c) => c.type === type);
    return game.canPlayCard(card.cardId, target);
  };
  const events = (type) => log.filter((e) => e.event === type);
  return { game, log, play, can, events };
}

/** pid の進軍を1回だけ起こす（ターンを回さずに） */
function march(game, pid) {
  game.currentPlayer = pid;
  game.advanceSoldiers(game.players[pid]);
}

// ---------------- 毒の霧（poisonEnemyCastle） ----------------

test('毒の霧：相手の城だけを毒にする（兵士は毒にしない）。城の持ち主のターンの始めに amount、城壁は効かない。turns 回で治る', () => {
  const { game, play, events } = setup({ hands: { p1: ['mist'], p2: ['striker'] } });
  const s = play('p2', 'striker');
  game.players.p2.armor = 10;
  play('p1', 'mist', { playerId: 'p2' });
  assert.equal(s.poison, null, '兵士は毒にしない');
  assert.equal(game.players.p2.castle.poison, 2);
  assert.equal(game.players.p2.castle.poisonTurns, 4);
  assert.deepEqual(events('castlePoisoned').at(-1), { event: 'castlePoisoned', playerId: 'p2', amount: 2, turns: 4 });
  const hp = game.players.p2.castle.hp;
  for (let i = 0; i < 4; i++) game.tickCastlePoison(game.players.p2);
  assert.equal(game.players.p2.castle.hp, hp - 8, '2×4＝8。城壁は効かない');
  assert.equal(game.players.p2.armor, 10);
  assert.equal(game.players.p2.castle.poison, null);
  assert.equal(events('castleCured').length, 1);
});

test('毒の霧：重ねがけは回数だけ延びる（量は増えない）。maxTurns まで。上限なら出せない', () => {
  const { game, play, can } = setup({ hands: { p1: ['mist', 'mist', 'mist'] } });
  play('p1', 'mist', { playerId: 'p2' });
  game.tickCastlePoison(game.players.p2); // 残り3
  play('p1', 'mist', { playerId: 'p2' });
  assert.equal(game.players.p2.castle.poison, 2, '量は増えない');
  assert.equal(game.players.p2.castle.poisonTurns, 7, '3＋4');
  game.players.p2.castle.poisonTurns = 8;
  assert.equal(can('p1', 'mist', { playerId: 'p2' }).ok, false, 'もう上限まで続く');
});

test('毒の霧：王国の浄化で城の毒が治る', () => {
  const { game, play } = setup({ hands: { p1: ['mist'], p2: ['fac_king_purify'] } });
  play('p1', 'mist', { playerId: 'p2' });
  play('p2', 'fac_king_purify');
  assert.equal(game.players.p2.castle.poison, null);
});

// ---------------- 呪いの印（weakenAttack の soldiers） ----------------

test('呪いの印：相手を選び、自分の城に近い順に3体の攻撃−2（2回の進軍）。道はまたぐ。呪われた兵士には重ねない', () => {
  const { game, play, can, events } = setup({ hands: { p1: ['fac_demon_curse_mark', 'fac_demon_curse_mark'], p2: ['striker', 'striker', 'striker', 'striker'] } });
  const xs = [];
  for (let i = 0; i < 4; i++) xs.push(play('p2', 'striker'));
  [xs[0].position, xs[1].position, xs[2].position, xs[3].position] = [1, 3, 0, 2];
  xs[2].roadId = game.players.p2.soldiers[0].roadId;
  play('p1', 'fac_demon_curse_mark', { playerId: 'p2' });
  assert.deepEqual(xs.map((x) => Boolean(x.weakened)), [true, true, false, true], 'position 3・2・1 の3体');
  assert.deepEqual(xs[1].weakened, { amount: 2, turns: 2 });
  assert.equal(game.getState('p1').players.p2.soldiers.find((s) => s.soldierId === xs[1].soldierId).attack, 5, 'getState の attack は武器の足し算だけ（呪いは戦いで引く）');
  assert.equal(events('spellCast').filter((e) => e.type === 'fac_demon_curse_mark').length, 1);
  // 2枚目：まだ呪われていない1体だけにかかる
  play('p1', 'fac_demon_curse_mark', { playerId: 'p2' });
  assert.equal(xs[2].weakened.turns, 2);
  assert.equal(xs[1].weakened.turns, 2, '重ねがけで延びない');
  game.players.p1.hand.push(game.createCard('fac_demon_curse_mark'));
  assert.equal(can('p1', 'fac_demon_curse_mark', { playerId: 'p2' }).ok, false, '全員呪われていれば出せない');
  // 2回の進軍で治る
  game.tickWeakened(game.players.p2);
  game.tickWeakened(game.players.p2);
  assert.equal(xs[1].weakened, null);
});
