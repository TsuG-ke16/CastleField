// 段階C（担当C3）：系統 U・K・F・A と横断 X10・X25・X39〜X43 のスモークテスト（各ノード1〜2件）。
// 盤面は Soldier を直接置いて作り、Game の戦い（fight / shoot / damageCastle）や手札の使用・任意アクションで効果を確かめる。
// 乱数は常に0を返す注入RNG（確率判定は必ず成功）で決定論にしている。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { Soldier } from '../js/game/Soldier.js';
import { buildData, loadOptionalData } from './helpers.js';

function classicGame(skills, { rng = () => 0 } = {}) {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const game = new Game({ ...opts, cards, rules, setup: { skills }, rng });
  game.start();
  return game;
}

/** 兵士を直接置く（roadIndex は 0〜2 のレーン、position は持ち主の城から数えたマス） */
function put(game, ownerId, type, roadIndex, position, patch = {}) {
  const road = game.roads[roadIndex];
  const owner = game.players[ownerId];
  const targetId = ownerId === 'p1' ? 'p2' : 'p1';
  const id = `s${String(game.nextSoldierNumber++).padStart(2, '0')}`;
  const s = new Soldier(id, { type, def: game.cardDefs[type] }, road.roadId, targetId);
  s.position = position;
  Object.assign(s, patch);
  owner.soldiers.push(s);
  return s;
}

const INF = 'classic_king_infantry';
const settle = (game) => game.skillRt.drain();
const fight = (game, a, e) => game.fight(game.players.p1, a, game.players.p2, e, false);
/** 敵城の壁を消して城HPを満タンにする */
const bareCastle = (game, id = 'p2') => {
  game.players[id].armor = 0;
  return game.players[id].castle;
};
const roadOf = (game, i) => game.roads[i].roadId;
const act = (game, id, args) => game.skillAction('p1', id, args);
const playSoldier = (game, roadIndex, type = INF) => {
  game.debugSetHand('p1', [type]);
  const card = game.players.p1.hand[0];
  return game.playCard(card.cardId, { playerId: 'p2', roadId: roadOf(game, roadIndex) });
};

test('休眠のノード（罠・固有能力・成立しない戦闘）は実装済みと数えない', () => {
  const game = classicGame([['F01'], []]);
  const rt = game.skillRt;
  for (const id of ['F02', 'F05', 'F06', 'F08', 'K01', 'A06', 'X06', 'X42']) assert.equal(rt.implementation(id), null, id);
  for (const id of ['U02', 'U03', 'U05', 'U06', 'U07', 'U08', 'K02', 'K03', 'K04', 'K05', 'K06', 'K07', 'K08', 'F01', 'F03', 'F04', 'F07',
    'A01', 'A02', 'A03', 'A04', 'A05', 'A07', 'A08', 'X10', 'X25', 'X39', 'X40', 'X41', 'X43']) assert.equal(rt.implementation(id), 'handler', id);
});

test('U02 連携攻撃：同一レーンの別の味方が同じ敵に2回目の通常攻撃をすると固定2ダメージ', () => {
  const game = classicGame([['U01', 'U02'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  const b = put(game, 'p1', INF, 0, 2);
  const e = put(game, 'p2', INF, 0, 2, { hp: 30, maxHp: 30 });
  fight(game, a, e);
  settle(game);
  assert.equal(e.hp, 27);
  fight(game, b, e);
  settle(game);
  assert.equal(e.hp, 27 - 3 - 2);
  assert.equal(game.skillCounters('p1').U02, 1);
});

test('U03 先制部隊：手札から出した兵士が射程内の敵を即時攻撃（各自ターン1回）', () => {
  const game = classicGame([['U01', 'U03'], []]);
  const e = put(game, 'p2', INF, 0, 4, { hp: 30, maxHp: 30 }); // p1 から数えて q=0
  assert.equal(playSoldier(game, 0).ok, true);
  assert.equal(e.hp, 27);
  assert.equal(game.skillCounters('p1').U03, 1);
  assert.equal(playSoldier(game, 0).ok, true);
  assert.equal(e.hp, 27); // 2枚目は出撃のみ
});

test('U05 戦術支援：隣接する味方がいる兵士の通常攻撃は+1', () => {
  const game = classicGame([['U01', 'U03', 'U05'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  const e = put(game, 'p2', INF, 0, 2, { hp: 30, maxHp: 30 });
  fight(game, a, e);
  assert.equal(e.hp, 27); // 隣がいない
  put(game, 'p1', INF, 0, 3);
  fight(game, a, e);
  assert.equal(e.hp, 27 - 4);
});

test('U06 戦術転換：隣のレーンの同じ位置の空き枠へ移す（各自ターン1回、空きがなければ不可）', () => {
  const game = classicGame([['U01', 'U02', 'U04', 'U06'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  put(game, 'p1', INF, 1, 2); // 隣の空きを塞ぐ
  assert.equal(act(game, 'U06', { soldierId: a.soldierId, roadId: roadOf(game, 1) }).ok, false);
  const r = act(game, 'U06', { soldierId: a.soldierId, roadId: roadOf(game, 0) });
  assert.equal(r.ok, false); // 同じレーンは隣ではない
  const b = game.players.p1.soldiers[1];
  b.position = 3; // 空ける
  assert.equal(act(game, 'U06', { soldierId: a.soldierId, roadId: roadOf(game, 1) }).ok, true);
  assert.equal(a.roadId, roadOf(game, 1));
  assert.equal(a.position, 2);
  assert.equal(act(game, 'U06', { soldierId: a.soldierId, roadId: roadOf(game, 0) }).ok, false); // 1ターン1回
});

test('U07 進軍の旗：手札から出した最初の兵士にシールド2', () => {
  const game = classicGame([['U01', 'U03', 'U05', 'U07'], []]);
  assert.equal(playSoldier(game, 0).ok, true);
  assert.equal(game.players.p1.soldiers[0].shield, 2);
  assert.equal(playSoldier(game, 1).ok, true);
  assert.equal(game.players.p1.soldiers[1].shield, 0);
});

test('U08 軍団指揮：通常攻撃で敵を倒した兵士が、別の敵に即時追加攻撃（各兵士・各自ターン1回）', () => {
  const game = classicGame([['U01', 'U02', 'U04', 'U06', 'U08'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  const e1 = put(game, 'p2', INF, 0, 2, { hp: 1, maxHp: 1 });
  const e2 = put(game, 'p2', INF, 0, 2, { hp: 10, maxHp: 10 });
  fight(game, a, e1);
  settle(game);
  assert.equal(game.players.p2.soldiers.includes(e1), false);
  assert.equal(e2.hp, 7);
  assert.equal(game.skillCounters('p1').U08, 1);
});

test('K02 横隊：同じ進軍位置の3レーンが揃うと直接被ダメージ-1', () => {
  const game = classicGame([['K01', 'K02'], []]);
  const a = put(game, 'p1', INF, 0, 2, { hp: 20, maxHp: 20 });
  const e = put(game, 'p2', INF, 0, 2, { hp: 30, maxHp: 30 });
  game.fight(game.players.p2, e, game.players.p1, a, false);
  assert.equal(a.hp, 17);
  put(game, 'p1', INF, 1, 2);
  put(game, 'p1', INF, 2, 2);
  game.fight(game.players.p2, e, game.players.p1, a, false);
  assert.equal(a.hp, 17 - 2);
});

test('K03 縦隊：前後に隣り合う列の最後尾の射程+1（外れたら戻る）', () => {
  const game = classicGame([['K01', 'K03'], []]);
  const back = put(game, 'p1', INF, 0, 1);
  const front = put(game, 'p1', INF, 0, 2);
  assert.equal(playSoldier(game, 2).ok, true); // 盤面が変わるイベント
  assert.equal(back.rangeBonus, 1);
  assert.equal(front.rangeBonus, 0);
  front.position = 4;
  assert.equal(playSoldier(game, 2).ok, true);
  assert.equal(back.rangeBonus, 0);
});

test('K04 迂回：隣のレーンへ移してシールド1', () => {
  const game = classicGame([['K01', 'K02', 'K04'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  assert.equal(act(game, 'K04', { soldierId: a.soldierId, roadId: roadOf(game, 1) }).ok, true);
  assert.equal(a.roadId, roadOf(game, 1));
  assert.equal(a.shield, 1);
});

test('K05 交代：前後に隣り合う2体の位置を交換', () => {
  const game = classicGame([['K01', 'K03', 'K05'], []]);
  const back = put(game, 'p1', INF, 0, 1);
  const front = put(game, 'p1', INF, 0, 2);
  assert.equal(act(game, 'K05', { backId: front.soldierId, frontId: back.soldierId }).ok, false);
  assert.equal(act(game, 'K05', { backId: back.soldierId, frontId: front.soldierId }).ok, true);
  assert.deepEqual([back.position, front.position], [2, 1]);
});

test('K06 待ち伏せ：空だったレーンに手札から最初の兵士を出すとシールド2', () => {
  const game = classicGame([['K01', 'K02', 'K04', 'K06'], []]);
  put(game, 'p1', INF, 0, 3);
  assert.equal(playSoldier(game, 0).ok, true); // 空ではない
  assert.equal(game.players.p1.soldiers.at(-1).shield, 0);
  assert.equal(playSoldier(game, 1).ok, true);
  assert.equal(game.players.p1.soldiers.at(-1).shield, 2);
});

test('K07 追い風：自分の進軍中に敵を倒した兵士が空き枠へ1マス追加進軍', () => {
  const game = classicGame([['K01', 'K03', 'K05', 'K07'], []]);
  const a = put(game, 'p1', INF, 0, 1);
  const e = put(game, 'p2', INF, 0, 3, { hp: 1, maxHp: 1 }); // q=1
  fight(game, a, e);
  settle(game);
  assert.equal(a.position, 2);
  assert.equal(game.skillCounters('p1').K07, 1);
});

test('K08 電撃作戦：任意の兵士を追加で1マス進軍（弓兵・凍結・敵と向かい合う兵士は不可）', () => {
  const game = classicGame([['K01', 'K02', 'K04', 'K06', 'K08'], []]);
  const a = put(game, 'p1', INF, 0, 1);
  const archer = put(game, 'p1', 'classic_king_archer', 1, 1);
  assert.equal(act(game, 'K08', { soldierId: archer.soldierId }).ok, false);
  assert.equal(act(game, 'K08', { soldierId: a.soldierId }).ok, true);
  assert.equal(a.position, 2);
  assert.equal(act(game, 'K08', { soldierId: a.soldierId }).ok, false); // 各自ターン1回
});

test('F01 再装填：武器の兵士の通常攻撃後に威力50%で追加攻撃', () => {
  const game = classicGame([['F01'], []]);
  const a = put(game, 'p1', INF, 0, 2, { weapon: 'classic_king_holy_sword' });
  const plain = put(game, 'p1', INF, 0, 2);
  const e = put(game, 'p2', INF, 0, 2, { hp: 30, maxHp: 30 });
  fight(game, a, e);
  settle(game);
  assert.equal(e.hp, 30 - 3 - 1);
  fight(game, plain, e); // 武器なしは対象外
  settle(game);
  assert.equal(e.hp, 30 - 3 - 1 - 3);
});

test('F03 防衛工事：手札から武器を装備した兵士にシールド2', () => {
  const game = classicGame([['F01', 'F03'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  game.debugSetHand('p1', ['classic_king_holy_sword']);
  assert.equal(game.playCard(game.players.p1.hand[0].cardId, { soldierId: a.soldierId }).ok, true);
  assert.equal(a.shield, 2);
});

test('F04 狙撃照準：武器の弓兵が射程の最大距離の敵に当てると+2', () => {
  const game = classicGame([['F01', 'F02', 'F04'], []]);
  const archer = put(game, 'p1', 'classic_king_archer', 0, 0, { weapon: 'classic_king_holy_sword' });
  const far = put(game, 'p2', INF, 0, 2, { hp: 30, maxHp: 30 }); // q=2＝最大距離
  game.shoot(game.players.p1, archer);
  assert.equal(far.hp, 30 - 3 - 2);
  const near = put(game, 'p2', INF, 0, 3, { hp: 30, maxHp: 30 }); // q=1
  far.hp = 0;
  game.players.p2.soldiers = game.players.p2.soldiers.filter((s) => s !== far);
  archer.turnsLeft = 5;
  game.shoot(game.players.p1, archer);
  assert.equal(near.hp, 30 - 3);
});

test('F07 工兵の知恵：自ターン最初の武器のMPコスト-1（最低1）', () => {
  const game = classicGame([['F01', 'F03', 'F05', 'F07'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  game.debugSetHand('p1', ['classic_king_holy_sword', 'classic_king_holy_sword']);
  const [c1, c2] = game.players.p1.hand;
  const mp0 = game.players.p1.mp;
  assert.equal(game.playCard(c1.cardId, { soldierId: a.soldierId }).ok, true);
  assert.equal(mp0 - game.players.p1.mp, 1); // 2→1
  const mp1 = game.players.p1.mp;
  assert.equal(game.playCard(c2.cardId, { soldierId: a.soldierId }).ok, true);
  assert.equal(mp1 - game.players.p1.mp, 2); // 2枚目は軽減なし
});

test('A01 城壁破砕＋A04 突破口：城壁を壊す攻撃魔法のあと固定2ダメージ・1枚ドロー', () => {
  const game = classicGame([['A01', 'A02', 'A04'], []]);
  game.players.p2.armor = 3;
  game.debugSetHand('p1', ['classic_king_holy_fireball']);
  game.debugSetHand('p2', [INF]);
  const hand0 = 1;
  assert.equal(game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: roadOf(game, 0) }).ok, true);
  assert.equal(game.phase, 'main');
  assert.equal(game.players.p2.castle.hp, game.players.p2.castle.maxHp - 3 - 2);
  assert.equal(game.players.p1.hand.length, hand0 - 1 + 1);
  assert.equal(game.skillCounters('p1').A01, 1);
  assert.equal(game.skillCounters('p1').A04, 1);
});

test('A02 攻城兵器：武器を装備した兵士の射程+1', () => {
  const game = classicGame([['A01', 'A02'], []]);
  const a = put(game, 'p1', INF, 0, 2);
  game.debugSetHand('p1', ['classic_king_holy_sword']);
  assert.equal(game.playCard(game.players.p1.hand[0].cardId, { soldierId: a.soldierId }).ok, true);
  assert.equal(a.rangeBonus, 1);
});

test('A03 包囲戦＋A07 城門の標的：到達の区間は攻撃魔法+2、到達後の次の城への直接攻撃+2', () => {
  const game = classicGame([['A01', 'A03', 'A05', 'A07'], []]);
  const castle = bareCastle(game);
  const a = put(game, 'p1', INF, 0, 5);
  game.damageCastle(game.players.p2, 4, { kind: 'soldier', soldierId: a.soldierId });
  assert.equal(castle.hp, 60 - 4 + 0); // 到達の攻撃そのものはA07で増えない
  game.players.p1.soldiers = [];
  game.debugSetHand('p1', ['classic_king_holy_fireball']);
  assert.equal(game.playCard(game.players.p1.hand[0].cardId, { playerId: 'p2', roadId: roadOf(game, 0) }).ok, true);
  assert.equal(castle.hp, 60 - 4 - (6 + 2 + 2)); // A03 +2、A07 +2
});

test('A05 貫通攻撃：城への直接ダメージの20%が城壁を通る', () => {
  const game = classicGame([['A01', 'A03', 'A05'], []]);
  game.players.p2.armor = 10;
  const a = put(game, 'p1', INF, 0, 2);
  game.damageCastle(game.players.p2, 10, { kind: 'soldier', soldierId: a.soldierId });
  assert.equal(game.players.p2.castle.hp, 60 - 2);
  assert.equal(game.players.p2.armor, 2);
});

test('A08 城門突破：城に着いた兵士の攻撃は城壁を100%貫通（魔法使いの射撃は対象外）', () => {
  const game = classicGame([['A01', 'A02', 'A04', 'A06', 'A08'], []]);
  game.players.p2.armor = 10;
  const a = put(game, 'p1', INF, 0, 5);
  game.damageCastle(game.players.p2, 4, { kind: 'soldier', soldierId: a.soldierId });
  assert.equal(game.players.p2.castle.hp, 56);
  assert.equal(game.players.p2.armor, 10);
  const b = put(game, 'p1', INF, 0, 2);
  game.damageCastle(game.players.p2, 4, { kind: 'soldier', soldierId: b.soldierId });
  assert.equal(game.players.p2.armor, 6);
});

test('X10 破壊衝動：城への会心（率15%・倍率1.5）と、会心時の城壁貫通', () => {
  const game = classicGame([['A01', 'A03', 'A05', 'X10'], []]);
  game.players.p2.armor = 10;
  const a = put(game, 'p1', INF, 0, 2);
  game.damageCastle(game.players.p2, 4, { kind: 'soldier', soldierId: a.soldierId });
  assert.equal(game.players.p2.castle.hp, 60 - 6); // 4×1.5=6 が全部城HPへ
  assert.equal(game.players.p2.armor, 10);
  assert.equal(game.skillCounters('p1').X10 >= 1, true);
});

test('X25 元素砲：武器の兵士の通常攻撃に選んだ属性の付着を追加', () => {
  const game = classicGame([['F01', 'F02', 'F04', 'X25'], []]);
  const a = put(game, 'p1', INF, 0, 2, { weapon: 'classic_king_holy_sword' });
  const e = put(game, 'p2', INF, 0, 2, { hp: 30, maxHp: 30 });
  fight(game, a, e);
  settle(game);
  assert.equal(e.attachments.some((x) => x.element === 'fire'), true);
});

test('X39 突破戦術：倒したときの余剰ダメージ（最大3）を敵城へ', () => {
  const game = classicGame([['U01', 'U02', 'U04', 'X39'], []]);
  const castle = bareCastle(game);
  const a = put(game, 'p1', INF, 0, 2);
  const e = put(game, 'p2', INF, 0, 2, { hp: 1, maxHp: 1 });
  fight(game, a, e);
  settle(game);
  assert.equal(castle.hp, 60 - 2); // 3 - 1
});

test('X40 盾の陣形：横隊が成立するとその兵士たちにシールド1（各自ターン1回）', () => {
  const game = classicGame([['K01', 'K02', 'X40'], []]);
  const s = [0, 1, 2].map((i) => put(game, 'p1', INF, i, 3));
  assert.equal(playSoldier(game, 0).ok, true);
  assert.deepEqual(s.map((x) => x.shield), [1, 1, 1]);
  assert.equal(playSoldier(game, 1).ok, true);
  assert.deepEqual(s.map((x) => x.shield), [1, 1, 1]); // 同じ区間は1回
});

test('X41 機動射撃：手札由来の兵士がレーン変更すると射程内の敵へ威力50%の追加攻撃', () => {
  const game = classicGame([['U01', 'U02', 'U04', 'U06', 'X41'], []]);
  const e = put(game, 'p2', INF, 1, 3, { hp: 30, maxHp: 30 }); // q=1（同じ位置は空き枠にならない）
  assert.equal(playSoldier(game, 0).ok, true);
  const a = game.players.p1.soldiers.at(-1);
  assert.equal(act(game, 'U06', { soldierId: a.soldierId, roadId: roadOf(game, 1) }).ok, true);
  assert.equal(e.hp, 30 - 1);
  assert.equal(game.skillCounters('p1').X41, 1);
});

test('X43 魔力装填：MP2で武器の兵士の次の通常攻撃+3（一度だけ）', () => {
  const game = classicGame([['F01', 'X43'], []]);
  const a = put(game, 'p1', INF, 0, 2, { weapon: 'classic_king_holy_sword' });
  const e = put(game, 'p2', INF, 0, 2, { hp: 30, maxHp: 30 });
  const mp0 = game.players.p1.mp;
  assert.equal(act(game, 'X43', { soldierId: a.soldierId }).ok, true);
  assert.equal(mp0 - game.players.p1.mp, 2);
  fight(game, a, e);
  assert.equal(e.hp, 30 - 6);
  fight(game, a, e);
  assert.equal(e.hp, 30 - 6 - 3);
});
