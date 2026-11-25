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

// ---------------- 脆弱（vulnerableCastle） ----------------

test('脆弱：相手の城が受ける攻撃のダメージ+25%（切り上げ・+50%まで）。毒・自分で払うコストには効かない', () => {
  const { game, play, events } = setup({ hands: { p1: ['fac_demon_vulnerable', 'bolt', 'mist'] } });
  play('p1', 'fac_demon_vulnerable', { playerId: 'p2' });
  assert.deepEqual(game.players.p2.castle.vulnerable, { ratio: 0.25, maxRatio: 0.5, turns: 3 });
  assert.deepEqual(game.getState('p1').players.p2.castleVulnerable, { ratio: 0.25, maxRatio: 0.5, turns: 3 });
  assert.deepEqual(events('castleVulnerable').at(-1), { event: 'castleVulnerable', playerId: 'p2', ratio: 0.25, turns: 3 });
  const hp = game.players.p2.castle.hp;
  game.damageCastle(game.players.p2, 5, { kind: 'spell', type: 'bolt' });
  assert.equal(game.players.p2.castle.hp, hp - 7, '5 + ceil(1.25)=2');
  assert.equal(events('castleDamaged').at(-1).vulnerable, 2);
  game.damageCastle(game.players.p2, 1, { kind: 'soldier', soldierId: 'x' });
  assert.equal(game.players.p2.castle.hp, hp - 8, '1 は +50%（切り捨て0）までなので増えない');
  game.damageCastle(game.players.p2, 4, { kind: 'self', type: 'x' });
  assert.equal(game.players.p2.castle.hp, hp - 12, '自分で払うコストには効かない');
  play('p1', 'mist', { playerId: 'p2' });
  game.tickCastlePoison(game.players.p2);
  assert.equal(game.players.p2.castle.hp, hp - 14, '毒には効かない');
});

test('脆弱：城の持ち主のターンの始めに1減って、3回で消える。重ねがけは回数だけ延びる（6回まで）。上限なら出せない', () => {
  const { game, play, can, events } = setup({ hands: { p1: ['fac_demon_vulnerable', 'fac_demon_vulnerable', 'fac_demon_vulnerable'] } });
  play('p1', 'fac_demon_vulnerable', { playerId: 'p2' });
  game.tickVulnerable(game.players.p2);
  play('p1', 'fac_demon_vulnerable', { playerId: 'p2' });
  assert.equal(game.players.p2.castle.vulnerable.turns, 5);
  assert.equal(game.players.p2.castle.vulnerable.ratio, 0.25, '割合は増えない');
  game.players.p2.castle.vulnerable.turns = 6;
  assert.equal(can('p1', 'fac_demon_vulnerable', { playerId: 'p2' }).ok, false);
  game.players.p2.castle.vulnerable.turns = 1;
  game.tickVulnerable(game.players.p2);
  assert.equal(game.players.p2.castle.vulnerable, null);
  assert.equal(events('castleVulnerableEnded').length, 1);
});

test('脆弱のカードがないモードでは getState に castleVulnerable のキーがない', () => {
  const game = new Game({ cards: loadFixture('cards-step2.json'), rules: loadFixture('rules.json'), rng: seededRng(1) });
  game.start();
  assert.equal('castleVulnerable' in game.getState(null).players.p1, false);
});

// ---------------- 闇の侵食（passive.darkErosion） ----------------

const EROSION = { darkErosion: { element: 'dark', ratio: 0.25, turns: 2, maxTurns: 4 } };

test('闇の侵食：魔族の闇の兵士が敵の城に着くと、敵の城の回復量−25%（2。持ち主のターンの始めに1減る）。重ねがけは延びるだけ（4まで）', () => {
  const { game, play, events } = setup({ passive: EROSION, hands: { p1: ['fac_demon_imp', 'fac_demon_imp', 'fac_demon_imp'] } });
  const L = game.rules.laneLength;
  const a = play('p1', 'fac_demon_imp');
  a.position = L - 1;
  march(game, 'p1');
  assert.deepEqual(game.players.p2.castle.healCut, { ratio: 0.25, turns: 2 });
  assert.deepEqual(events('castleHealCut').at(-1), { event: 'castleHealCut', playerId: 'p2', ratio: 0.25, turns: 2, source: 'erosion' });
  game.players.p2.castle.hp = game.players.p2.castle.maxHp - 10;
  assert.equal(game.players.p2.castle.heal(4), 3, '4 × 0.75 の切り捨て');
  for (let i = 0; i < 2; i++) {
    const b = play('p1', 'fac_demon_imp');
    b.position = L - 1;
    march(game, 'p1');
  }
  assert.equal(game.players.p2.castle.healCut.turns, 4, '2＋2＋2 は 4 まで');
  game.tickHealCut(game.players.p2);
  game.tickHealCut(game.players.p2);
  game.tickHealCut(game.players.p2);
  game.tickHealCut(game.players.p2);
  assert.equal(game.players.p2.castle.healCut, null);
});

test('闇の侵食：深淵侵食（半分）がかかっていれば割合はそのまま。闇でない兵士・パッシブのない陣営では起きない', () => {
  const { game, play } = setup({ passive: EROSION, hands: { p1: ['fac_demon_imp', 'weakling'] } });
  const L = game.rules.laneLength;
  game.players.p2.castle.healCut = { ratio: 0.5, turns: 1 };
  const a = play('p1', 'fac_demon_imp');
  a.position = L - 1;
  march(game, 'p1');
  assert.deepEqual(game.players.p2.castle.healCut, { ratio: 0.5, turns: 2 });
  game.players.p2.castle.healCut = null;
  const w = play('p1', 'weakling');
  w.position = L - 1;
  march(game, 'p1');
  assert.equal(game.players.p2.castle.healCut, null, '闇でない兵士');
  const other = setup({ hands: { p1: ['fac_demon_imp'] } });
  const b = other.play('p1', 'fac_demon_imp');
  b.position = L - 1;
  march(other.game, 'p1');
  assert.equal(other.game.players.p2.castle.healCut, null, 'パッシブがない');
});

test('パッシブのチェック：darkErosion の書き間違いは new Game() が例外', () => {
  assert.throws(() => setup({ passive: { darkErosion: { element: 'void', ratio: 0.25, turns: 2 } } }), /darkErosion\.element/);
  assert.throws(() => setup({ passive: { darkErosion: { element: 'dark', ratio: 2, turns: 2 } } }), /ratio/);
  assert.throws(() => setup({ passive: { darkErosion: { element: 'dark', ratio: 0.25, turns: 2, maxTurns: 1 } } }), /maxTurns/);
});

// ---------------- 魔の血（passive.magicBlood） ----------------

const BLOOD = { magicBlood: { spellReduce: 1, mpBonus: 1 } };

test('魔の血：魔族の兵士・城が攻撃魔法で受けるダメージ−1（最低1）。戦い・毒・反応は軽くしない', () => {
  const { game, play } = setup({ passive: BLOOD, hands: { p1: ['wall', 'weakling'], p2: ['tap', 'bolt', 'striker', 'mist'] }, reactions: null });
  const w = play('p1', 'wall');
  play('p2', 'tap', { soldierId: w.soldierId });
  assert.equal(w.hp, 40 - 2, '3 − 1');
  const hp = game.players.p1.castle.hp;
  play('p2', 'bolt', { playerId: 'p1' });
  assert.equal(game.players.p1.castle.hp, hp - 4, '5 − 1');
  game.damageCastle(game.players.p1, 1, { kind: 'spell', type: 'bolt' });
  assert.equal(game.players.p1.castle.hp, hp - 5, '最低1');
  game.damageCastle(game.players.p1, 3, { kind: 'reaction', reaction: 'x' }, { raw: true });
  assert.equal(game.players.p1.castle.hp, hp - 8, '反応は軽くしない');
  play('p2', 'mist', { playerId: 'p1' });
  game.tickCastlePoison(game.players.p1);
  assert.equal(game.players.p1.castle.hp, hp - 10, '毒は軽くしない');
  // 戦い：弱兵（攻撃1）と強兵（攻撃5）
  const k = play('p1', 'weakling');
  const s = play('p2', 'striker');
  game.fight(game.players.p1, k, game.players.p2, s);
  assert.equal(k.hp, 0, '戦いは軽くしない（3 − 5）');
});

test('魔の血：自分のターンの始めの MP 回復が +1（ほかの陣営は今までどおり）', () => {
  const { game, events } = setup({ passive: BLOOD, rules: { maxMp: 20, mpPerTurn: 3, initialMp: 5, secondPlayerMp: 0 } });
  game.endTurn(); // p2 のターン
  game.endTurn(); // p1 のターン
  const turnMp = (pid) => events('mpChanged').filter((e) => e.playerId === pid && e.reason === 'turn').map((e) => e.delta);
  assert.deepEqual(turnMp('p2'), [3], 'ふつうの陣営は +3');
  assert.deepEqual(turnMp('p1').at(-1), 4, '魔族は +4');
});

// ---------------- 血の契約（bloodPact） ----------------

test('血の契約：自城HPを6払い（城壁は通さない）、自分の城に近い2体の攻撃+3（ずっと）。HP7以下・兵士なしでは出せない', () => {
  const { game, play, can, events } = setup({ hands: { p1: ['fac_demon_blood_pact', 'weakling', 'weakling', 'weakling'] } });
  assert.match(can('p1', 'fac_demon_blood_pact').reason, /自分の兵士がいません/);
  const xs = [play('p1', 'weakling'), play('p1', 'weakling'), play('p1', 'weakling')];
  [xs[0].position, xs[1].position, xs[2].position] = [2, 0, 1];
  game.players.p1.armor = 10;
  game.players.p1.castle.hp = 7;
  assert.match(can('p1', 'fac_demon_blood_pact').reason, /城のHPが足りません（8以上必要）/);
  game.players.p1.castle.hp = 20;
  play('p1', 'fac_demon_blood_pact');
  assert.equal(game.players.p1.castle.hp, 14);
  assert.equal(game.players.p1.armor, 10, '城壁は通さない');
  assert.deepEqual(xs.map((x) => x.attack), [1, 4, 4], 'position 0・1 の2体');
  assert.equal(events('soldierBuffed').length, 2);
  assert.equal(events('castleDamaged').at(-1).source.kind, 'self');
});

// ---------------- 封魔（sealMp） ----------------

test('封魔：相手のターンの始めの MP 回復−1（2ターン）。重ねがけは回数だけ延びる（4まで）。getState に mpSeal', () => {
  const { game, play, can, events } = setup({ hands: { p1: ['fac_demon_mana_seal', 'fac_demon_mana_seal', 'fac_demon_mana_seal'] }, rules: { maxMp: 20, mpPerTurn: 3, initialMp: 10 } });
  play('p1', 'fac_demon_mana_seal', { playerId: 'p2' });
  assert.deepEqual(game.players.p2.mpSeal, { amount: 1, turns: 2 });
  assert.deepEqual(game.getState('p1').players.p2.mpSeal, { amount: 1, turns: 2 });
  assert.deepEqual(events('mpSealed').at(-1), { event: 'mpSealed', playerId: 'p2', amount: 1, turns: 2 });
  play('p1', 'fac_demon_mana_seal', { playerId: 'p2' });
  assert.deepEqual(game.players.p2.mpSeal, { amount: 1, turns: 4 }, '量は増えず、回数だけ延びる');
  assert.equal(can('p1', 'fac_demon_mana_seal', { playerId: 'p2' }).ok, false, 'もう上限');
  game.players.p2.mpSeal.turns = 2;
  const turnMp = () => events('mpChanged').filter((e) => e.playerId === 'p2' && e.reason === 'turn').map((e) => e.delta);
  for (let i = 0; i < 3; i++) {
    game.endTurn(); // p2 のターン
    game.endTurn(); // p1 のターン
  }
  assert.deepEqual(turnMp(), [2, 2, 3], '2ターンは 3−1、そのあと元に戻る');
  assert.equal(game.players.p2.mpSeal, null);
  assert.equal(events('mpSealEnded').length, 1);
});

// ---------------- 吸命の剣（武器の lifesteal） ----------------

test('吸命の剣：戦いで減らした相手のHPの半分（切り捨て）だけ自分の城が回復。盾が受けたぶんは数えない', () => {
  const { game, play, events } = setup({ hands: { p1: ['striker', 'fac_demon_drain_blade'], p2: ['wall'] }, reactions: null });
  const a = play('p1', 'striker');
  play('p1', 'fac_demon_drain_blade', { soldierId: a.soldierId });
  assert.equal(a.attack, 6);
  const w = play('p2', 'wall');
  w.shield = 1;
  game.players.p1.castle.hp = 10;
  game.fight(game.players.p1, a, game.players.p2, w);
  assert.equal(w.hp, 35, '6 − 盾1');
  assert.equal(game.players.p1.castle.hp, 12, 'floor(5 × 0.5)');
  assert.deepEqual(events('castleHealed').at(-1).source, { kind: 'lifesteal', soldierId: a.soldierId });
});

test('吸命の剣：城に着いたときも、城HPが減ったぶん（城壁が受けたぶんは数えない）の半分を回復', () => {
  const { game, play } = setup({ hands: { p1: ['striker', 'fac_demon_drain_blade'] }, reactions: null });
  const a = play('p1', 'striker');
  play('p1', 'fac_demon_drain_blade', { soldierId: a.soldierId });
  a.position = game.rules.laneLength - 1;
  game.players.p2.armor = 2;
  game.players.p1.castle.hp = 10;
  const hp2 = game.players.p2.castle.hp;
  march(game, 'p1');
  const lost = hp2 - game.players.p2.castle.hp;
  assert.ok(lost > 0);
  assert.equal(game.players.p1.castle.hp, 10 + Math.floor(lost / 2));
});

// ---------------- 混沌（attachRandomElement・chaos.attachTurnsMultiplier） ----------------

test('カオスロッド：当たった兵士に混沌（残り2倍）と、火・水・風・土のどれか1つが付く（反応はしない）', () => {
  const { game, play, events } = setup({ hands: { p1: ['striker', 'fac_demon_chaos_rod'], p2: ['wall'] } });
  const a = play('p1', 'striker');
  play('p1', 'fac_demon_chaos_rod', { soldierId: a.soldierId });
  const w = play('p2', 'wall');
  game.fight(game.players.p1, a, game.players.p2, w);
  const on = w.attachments.map((x) => x.element);
  assert.equal(on[0], 'chaos');
  assert.equal(w.attachments[0].turns, REACTIONS.attachTurns * 2, '混沌は残り2倍');
  assert.equal(on.length, 2);
  assert.ok(['fire', 'water', 'wind', 'earth'].includes(on[1]));
  assert.equal(events('elementAttached').at(-1).source, 'chaos');
  assert.equal(events('reactionTriggered').length, 0, '付けるだけで反応しない');
});

test('混沌の付着の倍率は城にも効く（castleAttach）。混沌反応は 3×種類', () => {
  const { game } = setup({ rules: { castleAttach: true, castleAttachTurns: 4, castleReactionPerRound: 1 } });
  game.castleElementHit(game.players.p2, 'chaos', null);
  assert.deepEqual(game.players.p2.castle.attachments, [{ element: 'chaos', turns: 8 }]);
  assert.equal(REACTIONS.chaos.damagePerElement, 3);
});

// ---------------- 属性持ちの兵士（ゾンビ・氷の亡者・混沌の落とし子） ----------------

test('属性持ちの兵士：ゾンビ（闇）・氷の亡者（氷）・混沌の落とし子（混沌）。戦うと相手に属性が付く。落とし子はランダム属性も付ける', () => {
  const { game, play } = setup({ hands: { p1: ['fac_demon_zombie', 'fac_demon_ice_wraith', 'fac_demon_chaos_spawn'], p2: ['wall', 'wall', 'wall'] } });
  const want = { fac_demon_zombie: ['dark', 9, 2, 1], fac_demon_ice_wraith: ['ice', 6, 2, 2], fac_demon_chaos_spawn: ['chaos', 4, 3, 2] };
  for (const [type, [element, hp, attack, speed]] of Object.entries(want)) {
    const s = play('p1', type);
    assert.deepEqual([s.element, s.hp, s.attack, s.speed], [element, hp, attack, speed], type);
    const w = play('p2', 'wall');
    game.fight(game.players.p1, s, game.players.p2, w);
    const on = w.attachments.map((x) => x.element);
    assert.equal(on[0], element, `${type} の属性が付く`);
    assert.equal(on.length, type === 'fac_demon_chaos_spawn' ? 2 : 1);
  }
});
