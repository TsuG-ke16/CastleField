// 罠を使うスキル（F02・F05・F06・F07・F08・X23・X42）と、読み替えた K01・A06・X06 のテスト（クラシック）。
// 盤面は Soldier を直接置いて作り、進軍（advanceSoldiers）・戦い（fight）・手札の使用・任意アクションで効果を確かめる。
// 乱数は常に0を返す（確率判定は必ず成功）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { Soldier } from '../js/game/Soldier.js';
import { filterEventFor } from '../js/game/visibility.js';
import { buildData, loadOptionalData, recordEvents } from './helpers.js';

const PIT = 'classic_king_pitfall';
const ICE = 'classic_demon_ice_trap';
const INF = 'classic_king_infantry';
const SWORD = 'classic_king_holy_sword';

function classicGame(skills, { rng = () => 0 } = {}) {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const game = new Game({ ...opts, cards, rules, setup: { skills, firstPlayer: 'p1' }, rng });
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  game.players.p1.mp = 20;
  return { game, log };
}

function put(game, ownerId, type, roadIndex, position, patch = {}) {
  const road = game.roads[roadIndex];
  const targetId = ownerId === 'p1' ? 'p2' : 'p1';
  const id = `s${String(game.nextSoldierNumber++).padStart(2, '0')}`;
  const s = new Soldier(id, { type, def: game.cardDefs[type] }, road.roadId, targetId);
  s.position = position;
  Object.assign(s, patch);
  game.players[ownerId].soldiers.push(s);
  return s;
}

/** p1 が手札から罠を置く（1ターン1枚の決まりは、テストのために戻す） */
function setTrap(game, type, roadIndex, square) {
  game.players.p1.trapsPlayedThisTurn = 0;
  game.debugSetHand('p1', [type]);
  const r = game.playCard(game.players.p1.hand[0].cardId, { roadId: game.roads[roadIndex].roadId, square });
  assert.equal(r.ok, true, r.reason);
  return game.players.p1.traps.at(-1);
}

/** p2 の兵士を進軍させる（p1 のターンのまま、進軍の処理だけを呼ぶ） */
function march(game) {
  game.advanceSoldiers(game.players.p2);
  game.skillRt?.drain();
}

test('クラシックの山札：罠2種が各2枚入り、80枚のまま', () => {
  const { cards } = buildData({ mode: 'classic' });
  const total = Object.values(cards).reduce((n, d) => n + d.count, 0);
  assert.equal(total, 80);
  assert.equal(cards[PIT].count, 2);
  assert.equal(cards[ICE].count, 2);
});

test('クラシック：氷の罠は止めて凍らせ、氷を付ける', () => {
  const { game, log } = classicGame([[], []]);
  setTrap(game, ICE, 0, 2);
  const e = put(game, 'p2', INF, 0, 1);
  march(game);
  assert.equal(e.position, 2);
  assert.equal(e.frozen, 1);
  assert.ok(log.some((x) => x.event === 'elementAttached' && x.element === 'ice' && x.soldierId === e.soldierId));
});

test('F02 再設置：手札の罠が発動したあと、同じマスに同じ罠を作り直す（作り直した罠は再設置しない・相手に見えない）', () => {
  const { game, log } = classicGame([['F01', 'F02'], []]);
  setTrap(game, PIT, 0, 2);
  put(game, 'p2', INF, 0, 1, { hp: 20, maxHp: 20 });
  march(game);
  const traps = game.players.p1.traps;
  assert.equal(traps.length, 1);
  assert.equal(traps[0].type, PIT);
  assert.equal(traps[0].square, 2);
  assert.equal(traps[0].generated, true);
  const set = log.filter((x) => x.event === 'trapSet').at(-1);
  assert.equal(set.source, 'F02');
  assert.equal(filterEventFor('trapSet', set, 'p2'), null);
  // 作り直した罠が発動しても、もう作り直さない
  game.skillRt.stateOf('p1').uses.turn = {};
  const e2 = put(game, 'p2', INF, 0, 1, { hp: 20, maxHp: 20 });
  march(game);
  assert.equal(e2.position, 2);
  assert.equal(game.players.p1.traps.length, 0);
});

test('F05 連動装置：罠が発動した敵を、射程に入る「武器を持った味方」が威力50%で追撃する', () => {
  const { game } = classicGame([['F01', 'F03', 'F05'], []]);
  setTrap(game, PIT, 0, 2);
  put(game, 'p1', INF, 0, 1, { weapon: SWORD, weaponBonus: 2 }); // 攻撃 3+2=5
  const e = put(game, 'p2', INF, 0, 1, { hp: 20, maxHp: 20 }); // p1 から見て q=3 → 罠のマス（p1 の2マス目）へ
  march(game);
  // 罠4 ＋ 追撃 5×50%（切り捨て）=2
  assert.equal(e.hp, 20 - 4 - 2);
});

test('F05：武器を持った味方の射程に敵がいなければ追撃しない', () => {
  const { game } = classicGame([['F01', 'F03', 'F05'], []]);
  setTrap(game, PIT, 0, 2);
  put(game, 'p1', INF, 1, 1, { weapon: SWORD, weaponBonus: 2 }); // 別のレーン
  const e = put(game, 'p2', INF, 0, 1, { hp: 20, maxHp: 20 });
  march(game);
  assert.equal(e.hp, 16);
});

test('F06 罠の回収：手札の罠が消えると MP+1', () => {
  const { game } = classicGame([['F01', 'F02', 'F04', 'F06'], []]);
  setTrap(game, PIT, 0, 2);
  game.players.p1.mp = 5;
  put(game, 'p2', INF, 0, 1, { hp: 20, maxHp: 20 });
  march(game);
  assert.equal(game.players.p1.mp, 6);
});

test('F07 工兵の知恵：自ターン最初の罠の MP が1少ない', () => {
  const { game } = classicGame([['F01', 'F03', 'F05', 'F07'], []]);
  game.players.p1.mp = 10;
  setTrap(game, PIT, 0, 2);
  assert.equal(game.players.p1.mp, 9);
});

test('F08 連鎖起爆：罠が発動すると、隣の自分の罠も同じ敵に発動する（つられた罠からは連鎖しない）', () => {
  const { game, log } = classicGame([['F01', 'F02', 'F04', 'F06', 'F08'], []]);
  setTrap(game, PIT, 0, 2);
  setTrap(game, PIT, 0, 1);
  setTrap(game, PIT, 1, 1); // 罠のマス(0,1)の隣のレーン。連鎖の連鎖は起きない
  const e = put(game, 'p2', INF, 0, 1, { hp: 30, maxHp: 30 });
  march(game);
  assert.equal(e.hp, 30 - 4 - 4);
  const fired = log.filter((x) => x.event === 'trapTriggered');
  assert.equal(fired.length, 2);
  assert.equal(fired[1].chained, true);
  // 残るのは、手を付けていない (1,1) の罠と、F02（再設置）で作り直した罠
  assert.deepEqual(game.players.p1.traps.filter((t) => !t.generated).map((t) => [t.roadId, t.square]), [[game.roads[1].roadId, 1]]);
});

test('X23 死者の地雷：味方が倒れると、その道の近い置けるマスに一時罠（固定2）ができる', () => {
  const { game, log } = classicGame([['F01', 'F02', 'X23'], []]);
  const mine = put(game, 'p1', INF, 0, 1);
  game.damageSoldier(game.players.p1, mine, 99, 'spell');
  game.skillRt.drain();
  const trap = game.players.p1.traps[0];
  assert.ok(trap);
  assert.equal(trap.type, 'deadMine');
  assert.equal(trap.roadId, game.roads[0].roadId);
  assert.equal(trap.square, 1);
  assert.equal(trap.damage, 2);
  assert.equal(game.getState('p1').players.p1.traps[0].name, '死者の地雷');
  const e = put(game, 'p2', INF, 0, 2, { hp: 20, maxHp: 20 }); // 2 → 3（p1 の1マス目）
  march(game);
  assert.equal(e.hp, 18);
  assert.ok(log.some((x) => x.event === 'trapTriggered' && x.type === 'deadMine'));
});

test('X42 伏兵配置：罠を隣のレーンの同じマスへ動かす（相手には見えない）', () => {
  const { game, log } = classicGame([['F01', 'F03', 'F05', 'X42'], []]);
  const trap = setTrap(game, PIT, 0, 1);
  const list = game.listSkillActions('p1').find((a) => a.actionId === 'X42');
  assert.ok(list);
  const r = game.skillAction('p1', 'X42', { trapId: trap.trapId, roadId: game.roads[1].roadId });
  assert.equal(r.ok, true, r.reason);
  assert.equal(trap.roadId, game.roads[1].roadId);
  assert.equal(trap.square, 1);
  const moved = log.find((x) => x.event === 'trapMoved');
  assert.equal(filterEventFor('trapMoved', moved, 'p2'), null);
  assert.equal(game.skillAction('p1', 'X42', { trapId: trap.trapId, roadId: game.roads[0].roadId }).ok, false); // 各自ターン1回
});

test('K01 挟撃（読み替え）：同じ自ターンに別の味方が攻撃した敵への2回目の攻撃は、盾を1無視する', () => {
  const run = (skills) => {
    const { game } = classicGame([skills, []]);
    const a = put(game, 'p1', INF, 0, 1, { hp: 50, maxHp: 50 });
    const b = put(game, 'p1', INF, 0, 1, { hp: 50, maxHp: 50 });
    const e = put(game, 'p2', INF, 0, 2, { hp: 50, maxHp: 50, shield: 10 });
    game.fight(game.players.p1, a, game.players.p2, e, false);
    game.fight(game.players.p1, b, game.players.p2, e, false);
    game.skillRt?.drain();
    return e.shield;
  };
  assert.equal(run([]), 10 - 3 - 3);
  assert.equal(run(['K01']), 10 - 3 - 4);
});

test('A06 総攻撃（読み替え）：手札から城への魔法を撃つと、相手の城の前のマスの味方が城を攻撃力ぶん追撃する', () => {
  const { game, log } = classicGame([['A01', 'A02', 'A04', 'A06'], []]);
  const castle = game.players.p2.castle;
  game.players.p2.armor = 0;
  const front = put(game, 'p1', INF, 0, game.rules.laneLength - 1);
  const hp0 = castle.hp;
  game.debugSetHand('p1', ['classic_king_holy_fireball']);
  const r = game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: game.roads[1].roadId });
  assert.equal(r.ok, true, r.reason);
  const spell = game.cardDefs.classic_king_holy_fireball.amount;
  assert.equal(castle.hp, hp0 - spell - 3);
  assert.ok(game.players.p1.soldiers.includes(front)); // 兵士は消えない
  assert.ok(log.some((x) => x.event === 'castleDamaged' && x.source?.kind === 'soldier' && x.source.soldierId === front.soldierId));
});

test('A06：城の前に味方がいなければ何もしない', () => {
  const { game } = classicGame([['A01', 'A02', 'A04', 'A06'], []]);
  const castle = game.players.p2.castle;
  game.players.p2.armor = 0;
  put(game, 'p1', INF, 0, 2);
  const hp0 = castle.hp;
  game.debugSetHand('p1', ['classic_king_holy_fireball']);
  game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: game.roads[1].roadId });
  assert.equal(castle.hp, hp0 - game.cardDefs.classic_king_holy_fireball.amount);
});

test('X06 戦士の遺産（読み替え）：武器を持った味方が倒れると、次に手札から出す兵士がその武器を受け継ぐ', () => {
  const { game, log } = classicGame([['U01', 'U03', 'U05', 'X06'], []]);
  const fallen = put(game, 'p1', INF, 0, 1, { weapon: 'classic_demon_frost_blade', weaponBonus: 3, element: 'ice' });
  game.damageSoldier(game.players.p1, fallen, 99, 'spell');
  game.skillRt.drain();
  game.debugSetHand('p1', [INF]);
  const r = game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: game.roads[0].roadId });
  assert.equal(r.ok, true, r.reason);
  const heir = game.players.p1.soldiers.at(-1);
  assert.equal(heir.weapon, 'classic_demon_frost_blade');
  assert.equal(heir.weaponBonus, 3);
  assert.equal(heir.element, 'ice');
  assert.ok(log.some((x) => x.event === 'weaponEquipped' && x.legacy && x.soldierId === heir.soldierId));
});

test('X06：次の自分のターンが終わるまでに出さなければ消える', () => {
  const { game } = classicGame([['U01', 'U03', 'U05', 'X06'], []]);
  const fallen = put(game, 'p1', INF, 0, 1, { weapon: SWORD, weaponBonus: 2 });
  game.damageSoldier(game.players.p1, fallen, 99, 'spell');
  game.skillRt.drain();
  // p2 → p1（次のターン）→ p2 → p1（その次）。手札が上限を超えないよう、毎回手札を空にしてから終える
  for (let i = 0; i < 4; i++) {
    game.debugSetHand(game.currentPlayer, []);
    game.endTurn();
  }
  assert.equal(game.currentPlayer, 'p1');
  game.debugSetHand('p1', [INF]);
  game.players.p1.mp = 20;
  assert.equal(game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: game.roads[0].roadId }).ok, true);
  const s = game.players.p1.soldiers.at(-1);
  assert.equal(s.weaponBonus, 0);
});
