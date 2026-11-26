// 血魔術（B01〜B08）・闘志（Q01〜Q08）・横断（X26〜X35・X48）の短いスモークテスト（段階C・C5 担当）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { Soldier } from '../js/game/Soldier.js';
import * as Resources from '../js/game/skills/Resources.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

function classicGame(skills, { seed = 1 } = {}) {
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const game = new Game({ ...opts, cards, rules, setup: { skills }, rng: seededRng(seed) });
  assert.ok(game.skillRt, 'スキルが有効になっていない（ビルドが不正？）');
  assert.equal(game.players.p1.skillError ?? null, null);
  game.start();
  return game;
}

/** 決まった値を返す乱数（尽きたら 0.99） */
const scripted = (values) => () => (values.length ? values.shift() : 0.99);

/** 兵士を道の自分の城の前に置く（テスト用） */
function place(game, ownerId, type = 'classic_king_heavy') {
  const foe = game.opponentsOf(ownerId)[0];
  const road = game.roadsBetween(game.side(ownerId), game.side(foe.id))[0];
  const id = `s${String(game.nextSoldierNumber++).padStart(2, '0')}`;
  const s = new Soldier(id, { type, def: game.cardDefs[type] }, road.roadId, game.side(foe.id));
  game.players[ownerId].soldiers.push(s);
  return s;
}

function giveCard(game, playerId, type) {
  const p = game.players[playerId];
  p.hand = p.hand.slice(0, 3);
  const card = game.createCard(type);
  p.hand.push(card);
  return card;
}

const endTurn = (game) => {
  assert.equal(game.endTurn().ok, true);
  if (game.phase === 'discard') {
    const p = game.players[game.currentPlayer];
    game.discard(p.hand.slice(0, game.discardCount).map((c) => c.cardId));
  }
};

const BLOOD = ['B01', 'B02', 'B03', 'B04', 'B06', 'X32', 'X35', 'X33', 'X34', 'X28'];

test('B01：不足MP1につき城HP2で魔法を出せる（HP1を残せなければ出せない）。B08：1:1・任意量の置換', () => {
  const game = classicGame([['B01'], []]);
  const p1 = game.players.p1;
  place(game, 'p2');
  const card = giveCard(game, 'p1', 'classic_king_holy_ray'); // MP4
  p1.mp = 1;
  const hp = p1.castle.hp;
  assert.equal(game.playCard(card.cardId, undefined, {}).ok, true, '不足3 → HP6');
  assert.equal(p1.castle.hp, hp - 6);
  assert.equal(p1.mp, 0);
  assert.equal(game.skillCounters('p1').B01, 1);

  const g2 = classicGame([['B01', 'B02', 'B04', 'B06', 'B08'], []]);
  const q1 = g2.players.p1;
  place(g2, 'p2');
  const c2 = giveCard(g2, 'p1', 'classic_king_holy_ray');
  q1.mp = 10;
  const hp2 = q1.castle.hp;
  assert.equal(g2.playCard(c2.cardId, undefined, { hpForMp: 2 }).ok, true);
  assert.equal(q1.castle.hp, hp2 - 2, 'B08：MP2をHP2に置換（1:1）');
  assert.equal(q1.mp, 8);
  assert.equal(g2.skillRt.stateOf('p1').res.blood, 2, 'B06：実消費2で血気2');
  // HP1 を残せない置換は出せない
  const c3 = giveCard(g2, 'p1', 'classic_king_holy_ray');
  q1.mp = 0;
  q1.castle.hp = 4;
  assert.equal(g2.canPlayCard(c3.cardId).ok, false);
});

test('X32 免除：実消費0なので血気・SP・城壁・回復強化を作らない。X35 延期：債務→次の自ターン開始に支払', () => {
  const game = classicGame([BLOOD, []]);
  assert.equal(game.setSkillPrefs('p1', { X35: { autoDefer: true } }).ok, true); // 段階D2：自動延期は既定 OFF なので、本人の選択で ON にする
  const rt = game.skillRt;
  const p1 = game.players.p1;
  const st = rt.stateOf('p1');
  const hp = p1.castle.hp;
  const armor = p1.armor;
  p1.hand = p1.hand.slice(0, 2);
  game.rng = scripted([0]); // X32 の判定が成功
  const r = game.skillAction('p1', 'B02');
  assert.equal(r.ok, true, r.reason);
  assert.equal(p1.castle.hp, hp, '免除');
  assert.equal(st.res.blood, 0);
  assert.equal(st.res.sp, 0);
  assert.equal(p1.armor, armor);
  assert.equal(Boolean(st.vars.x28), false);
  assert.equal(game.skillCounters('p1').X32, 1);
  // 次の自ターン：免除は失敗、延期2・実消費1
  endTurn(game);
  endTurn(game);
  p1.hand = p1.hand.slice(0, 2);
  game.rng = scripted([0.99]);
  const hp2 = p1.castle.hp;
  const armor2 = p1.armor;
  assert.equal(game.skillAction('p1', 'B02').ok, true);
  assert.equal(p1.castle.hp, hp2 - 1);
  assert.equal(st.debt, 2);
  assert.equal(st.res.blood, 1);
  assert.equal(st.res.sp, 1);
  assert.equal(p1.armor, armor2 + 1);
  assert.equal(st.vars.x28, true, 'X28：実消費のあとに付与');
  // 債務がある間は新たな任意HP支払はできない
  assert.equal(Resources.payHp(rt, 'p1', 1, { preview: true }).ok, false);
  endTurn(game);
  endTurn(game); // 自ターン開始で債務2を支払う
  assert.equal(st.debt, 0);
  assert.equal(st.res.blood, 3, '債務の実消費2で血気+2（合計3。二重に数えない）');
});

test('X28：次の手札の回復魔法の基礎回復量+2（1回で消える）', () => {
  const game = classicGame([BLOOD, []]);
  const p1 = game.players.p1;
  p1.hand = p1.hand.slice(0, 2);
  game.rng = scripted([0.99]);
  assert.equal(game.skillAction('p1', 'B02').ok, true);
  p1.castle.hp = 20;
  const card = giveCard(game, 'p1', 'classic_king_minor_heal'); // 5
  p1.mp = 10;
  const before = p1.castle.hp;
  assert.equal(game.playCard(card.cardId).ok, true);
  assert.equal(p1.castle.hp, before + 5 + 2, '小回復5＋X28 2');
  assert.equal(game.skillRt.stateOf('p1').vars.x28, false);
});

test('B04/X26/X30：吸血は実HP損失から切り捨て・上限つき、トークン・追加由来からは得ない', () => {
  const game = classicGame([['B01', 'B02', 'B04', 'X26', 'X30'], []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  p1.castle.hp = 30;
  const hit = (f) => { rt.enqueue('onAttackResolve', { ownerId: 'p1', victimOwnerId: 'p2', targetId: 'sX', hitKind: 'fight', origin: 'normalAttack', direct: true, enemy: true, crit: false, ...f }); rt.drain(); };
  hit({ dealt: 9 });
  assert.equal(p1.castle.hp, 30, '9の10%は0');
  hit({ dealt: 25 });
  assert.equal(p1.castle.hp, 32);
  hit({ dealt: 25, victimToken: true });
  hit({ dealt: 25, origin: 'echo', direct: false });
  assert.equal(p1.castle.hp, 32, 'トークン・追加由来は0');
  hit({ dealt: 30 });
  assert.equal(p1.castle.hp, 33, '上限3（残り1）');
  // X26：直接会心で+1（合計2回）
  hit({ dealt: 0, crit: true });
  hit({ dealt: 0, crit: true });
  hit({ dealt: 0, crit: true });
  assert.equal(p1.castle.hp, 35);
  // X30：自分の出血の実損失の25%
  rt.enqueue('onStatusTick', { ownerId: 'p1', victimOwnerId: 'p2', targetId: 'sY', status: 'bleed', loss: 3, origin: 'dot' });
  rt.enqueue('onStatusTick', { ownerId: 'p1', victimOwnerId: 'p2', targetId: 'sY', status: 'bleed', loss: 8, origin: 'dot' });
  rt.enqueue('onStatusTick', { ownerId: 'p1', victimOwnerId: 'p2', targetId: 'sY', status: 'bleed', loss: 8, origin: 'dot', victimToken: true });
  rt.drain();
  assert.equal(p1.castle.hp, 37);
  assert.equal(game.skillCounters('p1').X30, 1);
});

test('B03/B05：血の刃は任意でHP2・+4（1対象）、瀕死の覚醒は宣言時HP30%以下で+20%', () => {
  const game = classicGame([['B01', 'B03', 'B05'], []]);
  const p1 = game.players.p1;
  const foe = place(game, 'p2');
  foe.maxHp = foe.hp = 40;
  p1.castle.hp = 18; // 60 の 30%
  p1.mp = 10;
  game.rng = scripted([0.99, 0.99, 0.99]);
  const card = giveCard(game, 'p1', 'classic_king_holy_ray'); // 5
  assert.equal(game.playCard(card.cardId, undefined, { bloodBlade: true }).ok, true);
  assert.equal(p1.castle.hp, 16, 'HP2を払う');
  assert.equal(foe.hp, 40 - Math.floor((5 + 4) * 1.2));
  const c = game.skillCounters('p1');
  assert.equal(c.B03, 1);
  assert.equal(c.B05, 1);
});

test('X27：手札の単体攻撃魔法のあと任意でHP2、同じ対象に威力50%', () => {
  const game = classicGame([['B01', 'B03', 'X27'], []]);
  const p1 = game.players.p1;
  const foe = place(game, 'p2');
  foe.maxHp = foe.hp = 40;
  p1.mp = 10;
  game.rng = scripted([0.99, 0.99, 0.99, 0.99]);
  const hp = p1.castle.hp;
  const card = giveCard(game, 'p1', 'classic_king_holy_ray');
  assert.equal(game.playCard(card.cardId, undefined, { bloodEcho: true }).ok, true);
  assert.equal(p1.castle.hp, hp - 2);
  assert.equal(foe.hp, 40 - 5 - 2);
  assert.equal(game.skillCounters('p1').X27, 1);
});

test('B06/B07/X29/X31：血気でMP・固定ダメージ、生贄、累計支払5で使い魔', () => {
  const game = classicGame([['B01', 'B02', 'B04', 'B06', 'B08', 'B07', 'X29', 'X31'], []]);
  const rt = game.skillRt;
  const p1 = game.players.p1;
  const st = rt.stateOf('p1');
  assert.equal(Resources.payHp(rt, 'p1', 5, { skillId: 'test' }).ok, true);
  rt.drain();
  assert.equal(st.res.blood, 5);
  assert.equal(p1.soldiers.filter((s) => s.skillToken?.kind === 'familiar').length, 1, 'X31');
  assert.equal(st.vars.x31, 0);
  p1.mp = 0;
  assert.equal(game.skillAction('p1', 'B06').ok, true);
  assert.equal(p1.mp, 1);
  assert.equal(st.res.blood, 2);
  const foe = place(game, 'p2');
  const hp = foe.hp;
  assert.equal(game.skillAction('p1', 'B07', { soldierId: foe.soldierId, amount: 3 }).ok, false, '血気が足りない');
  assert.equal(game.skillAction('p1', 'B07', { soldierId: foe.soldierId, amount: 2 }).ok, true);
  assert.equal(foe.hp, hp - 2);
  const mine = place(game, 'p1');
  p1.castle.hp = 40;
  const r = game.skillAction('p1', 'X29', { soldierId: mine.soldierId });
  assert.equal(r.ok, true, r.reason);
  assert.equal(p1.soldiers.includes(mine), false);
  assert.equal(p1.castle.hp, 42);
  assert.equal(p1.mp, 3);
  assert.equal(st.grave.length, 0, '生贄は墓地に入らない');
});

test('闘志：Q01〜Q08 と X48', () => {
  const game = classicGame([['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'X48', 'C02', 'C01'], []]);
  const rt = game.skillRt;
  const st = rt.stateOf('p1');
  const p1 = game.players.p1;
  const mine = place(game, 'p1');
  // Q01：敵の直接攻撃で実ダメージ → SP+1（合計3）
  for (let i = 0; i < 4; i++) rt.enqueue('onAttackResolve', { ownerId: 'p2', victimOwnerId: 'p1', targetId: mine.soldierId, hitKind: 'fight', dealt: 2, enemy: true, origin: 'normalAttack' });
  rt.drain();
  assert.equal(st.res.sp, 3);
  // Q04：通常攻撃で撃破 → +1
  rt.enqueue('onUnitDeath', { ownerId: 'p2', killerId: 'p1', killOrigin: 'normalAttack', targetId: 'sZ' });
  rt.drain();
  assert.equal(st.res.sp, 4);
  Resources.gain(rt, 'p1', 'sp', 20);
  rt.drain();
  assert.equal(game.skillAction('p1', 'Q03', { soldierId: mine.soldierId }).ok, true);
  assert.equal(mine.shield >= 3, true);
  assert.equal(game.skillAction('p1', 'Q05').ok, true);
  assert.equal(st.critFocus, 0.2);
  assert.equal(game.skillAction('p1', 'Q06').ok, true);
  assert.equal(st.res.sp, 13);
  Resources.gain(rt, 'p1', 'sp', 30);
  rt.drain();
  assert.equal(p1.mp >= 2, true);
  assert.equal(game.skillCounters('p1').Q07, 1, 'Q07：上限到達で MP+2');
  assert.equal(game.skillAction('p1', 'Q08', { soldierId: mine.soldierId }).ok, true);
  // 攻撃力補正：Q02(+1, SP15以上)・Q06(+1)・Q08(+3)
  const ctx = { kind: 'fight', attacker: mine, attackerOwner: p1, direct: true, origin: 'normalAttack' };
  const add = rt.collectMods('hitBaseAdd', 'p1', ctx).reduce((s, r) => s + r.value, 0);
  assert.equal(add, 5);
  // 次の自ターン開始で Q06/Q08 は失効
  endTurn(game);
  endTurn(game);
  const add2 = rt.collectMods('hitBaseAdd', 'p1', ctx).reduce((s, r) => s + r.value, 0);
  assert.equal(add2, 1);
});
