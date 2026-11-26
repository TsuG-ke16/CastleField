// 4陣営の「凍結している兵士は、氷が付着している扱い」（rules.frozenCountsAsIce）のテスト。
// 数値はこのファイルで決める（data/ の調整で落ちないように）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { canReact, STRATEGIES } from '../js/game/strategies.js';
import { loadFixture, seededRng, recordEvents, buildData, loadOptionalData } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readClassic = (name) => JSON.parse(readFileSync(join(ROOT, 'data', 'classic', name), 'utf8'));
const REACTIONS = {
  attachTurns: 3,
  reactions: {
    annihilation: { name: '対消滅', elements: ['light', 'dark'], damage: 8 },
    blackIce: { name: '黒氷', elements: ['dark', 'ice'], damage: 3, frozenTurns: 1 },
    shatter: { name: '砕氷', elements: ['ice', 'chaos'], damage: 2, frozenBonus: 6 },
  },
  chaos: { element: 'chaos', name: '混沌反応', damagePerElement: 4, minElements: 3 },
};
const EXTRA = {
  tank: { name: '大盾兵', kind: 'soldier', hp: 60, attack: 1, speed: 1, count: 1 },
  lightBlade: { name: '光の剣', kind: 'weapon', attackBonus: 2, element: 'light', count: 1 },
  iceBlade: { name: '氷の剣', kind: 'weapon', attackBonus: 2, element: 'ice', count: 1 },
  darkBolt: { name: '闇の矢', kind: 'spell', effect: 'singleDamage', element: 'dark', amount: 1, count: 1 },
  chaosBolt: { name: '混沌の矢', kind: 'spell', effect: 'singleDamage', element: 'chaos', amount: 1, count: 1 },
  lightBolt: { name: '光の矢', kind: 'spell', effect: 'singleDamage', element: 'light', amount: 1, count: 1 },
  iceBolt: { name: '氷の矢', kind: 'spell', effect: 'singleDamage', element: 'ice', amount: 1, count: 1 },
};

/** p2 の tank（武器 p2Weapon つき）を場に出して p1 の番にする。frozenCountsAsIce は flag */
function setup({ flag = true, p2Weapon = null, reactions = REACTIONS } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 12, ...(flag === 'none' ? {} : { frozenCountsAsIce: flag }) };
  const game = new Game({ cards, rules, rng: seededRng(3), elements: readClassic('elements.json'), reactions });
  game.debugSetHand('p1', ['darkBolt', 'chaosBolt', 'lightBolt', 'iceBolt']);
  game.debugSetHand('p2', ['tank', ...(p2Weapon ? [p2Weapon] : [])]);
  game.debugSetDeck(Array(40).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  assert.equal(game.endTurn().ok, true);
  const hand2 = () => game.getState('p2').players.p2.hand;
  assert.equal(game.playCard(hand2().find((c) => c.type === 'tank').cardId).ok, true);
  const soldier = game.players.p2.soldiers[0];
  if (p2Weapon) assert.equal(game.playCard(hand2().find((c) => c.type === p2Weapon).cardId, { soldierId: soldier.soldierId }).ok, true);
  assert.equal(game.endTurn().ok, true);
  log.length = 0;
  const cast = (type) => {
    game.players.p1.playedThisTurn = false;
    const card = game.getState('p1').players.p1.hand.find((c) => c.type === type);
    const r = game.playCard(card.cardId, { soldierId: soldier.soldierId });
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
  };
  const events = (type) => log.filter((e) => e.event === type);
  return { game, soldier, cast, events, log };
}

test('砕氷：凍結中の兵士に混沌が当たると、氷が付着していなくても砕氷（凍結中の上乗せ込み）。凍結は解ける', () => {
  const { soldier, cast, events } = setup();
  soldier.frozen = 1;
  const hp = soldier.hp;
  cast('chaosBolt');
  const r = events('reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'shatter');
  assert.deepEqual(r[0].consumed, ['ice']);
  assert.equal(r[0].damage, 2 + 6);
  assert.equal(soldier.frozen, 0);
  assert.equal(events('statusCleared').filter((e) => e.status === 'frozen').length, 1);
  assert.equal(events('elementCleared').length, 0, '実際の付着は消えていないので elementCleared は出ない');
  assert.equal(soldier.hp, hp - 1 - 8);
  assert.deepEqual(soldier.attachments, [], '当たった混沌は付着しない（反応したので）');
});

test('黒氷：凍結中の兵士に闇が当たると黒氷。凍結が解けて、生き残れば凍結1回が付き直す', () => {
  const { soldier, cast, events } = setup();
  soldier.frozen = 3;
  cast('darkBolt');
  assert.equal(events('reactionTriggered')[0].reaction, 'blackIce');
  assert.equal(events('statusCleared').filter((e) => e.status === 'frozen').length, 1);
  assert.equal(events('statusApplied').filter((e) => e.status === 'frozen').length, 1);
  assert.equal(soldier.frozen, 1, '黒氷の frozenTurns');
});

test('凍結していない兵士・フラグなしでは、氷は付いていない扱い（反応しない）', () => {
  const a = setup();
  a.cast('darkBolt');
  assert.equal(a.events('reactionTriggered').length, 0);
  assert.deepEqual(a.soldier.attachments.map((x) => x.element), ['dark']);
  for (const flag of [false, 'none']) {
    const b = setup({ flag });
    b.soldier.frozen = 1;
    b.cast('darkBolt');
    assert.equal(b.events('reactionTriggered').length, 0, `flag=${flag}`);
    assert.equal(b.soldier.frozen, 1, '凍結はそのまま');
  }
});

test('氷の付着＋凍結の両方でも、氷は1種類（混沌反応の種類の数え方も二重にしない）', () => {
  const { game, soldier } = setup();
  soldier.frozen = 1;
  soldier.attachments.push({ element: 'ice', turns: 2 });
  assert.deepEqual(game.findReaction(soldier, 'light'), null, '氷＋光は表に組がなく、種類は2つ');
  // 氷（付着＋凍結）＋混沌 → 2種類。混沌反応にならず砕氷
  const r = game.findReaction(soldier, 'chaos');
  assert.equal(r.id, 'shatter');
  assert.deepEqual(r.consumed, ['ice']);
  // 氷＋光（付着）に混沌：3種類 → 混沌反応。種類は ice・light・chaos の3つ（凍結の氷を重ねて4つにしない）
  soldier.attachments.push({ element: 'light', turns: 2 });
  const c = game.findReaction(soldier, 'chaos');
  assert.equal(c.id, 'chaos');
  assert.equal(c.damage, 4 * 3);
  assert.deepEqual([...c.consumed].sort(), ['ice', 'light']);
});

test('混沌反応：凍結（氷）＋光の付着に混沌が当たると3種類で混沌反応。凍結も付着も消える。凍結だけの氷は elementCleared を出さない', () => {
  const { soldier, cast, events } = setup();
  soldier.frozen = 2;
  soldier.attachments.push({ element: 'light', turns: 2 });
  cast('chaosBolt');
  const r = events('reactionTriggered')[0];
  assert.equal(r.reaction, 'chaos');
  assert.deepEqual([...r.consumed].sort(), ['ice', 'light']);
  assert.deepEqual(events('elementCleared').map((e) => e.element), ['light']);
  assert.equal(soldier.frozen, 0);
  assert.equal(events('statusCleared').filter((e) => e.status === 'frozen').length, 1);
});

test('実際に氷が付着していて凍結もしているとき：反応で付着も凍結も消える', () => {
  const { soldier, cast, events } = setup();
  soldier.frozen = 1;
  soldier.attachments.push({ element: 'ice', turns: 2 });
  cast('darkBolt');
  assert.equal(events('reactionTriggered')[0].reaction, 'blackIce');
  assert.deepEqual(events('elementCleared').map((e) => [e.element, e.reason]), [['ice', 'reaction']]);
  assert.equal(events('statusCleared').filter((e) => e.status === 'frozen').length, 1);
});

test('氷の武器の兵士が凍結していても、氷は1種類（武器の氷＋凍結）。闇で黒氷が1回、武器の氷が外れる', () => {
  const { soldier, cast, events } = setup({ p2Weapon: 'iceBlade' });
  soldier.frozen = 1;
  cast('darkBolt');
  assert.equal(events('reactionTriggered').length, 1);
  assert.equal(soldier.element, null);
  assert.deepEqual(events('elementCleared').map((e) => [e.element, e.weapon]), [['ice', true]]);
});

test('getState().reactions に frozenCountsAsIce が出る（フラグがあるときだけ）。CPU の canReact が凍結中の兵士を反応の対象に選ぶ', () => {
  const on = setup();
  on.soldier.frozen = 1;
  const stOn = on.game.getState('p1');
  assert.equal(stOn.reactions.frozenCountsAsIce, true);
  const s = stOn.players.p2.soldiers[0];
  assert.equal(s.statuses.frozen, 1);
  assert.equal(canReact(stOn.reactions, 'dark', s), true);
  assert.equal(canReact(stOn.reactions, 'chaos', s), true);
  assert.equal(canReact(stOn.reactions, 'light', s), false);
  const off = setup({ flag: false });
  off.soldier.frozen = 1;
  const stOff = off.game.getState('p1');
  assert.equal('frozenCountsAsIce' in stOff.reactions, false);
  assert.equal(canReact(stOff.reactions, 'dark', stOff.players.p2.soldiers[0]), false);
  // 凍結していない兵士には効かない
  assert.equal(canReact(stOn.reactions, 'dark', { ...s, statuses: { ...s.statuses, frozen: 0 } }), false);
});

test('CPU（smart）：凍結中の相手の兵士に反応できる武器（闇の剣）を、その兵士の道の味方に持たせる', () => {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, darkBlade: { name: '闇の剣', kind: 'weapon', attackBonus: 2, element: 'dark', count: 1 } };
  // p1 が武器を持って反応を狙う場面：p1 に兵士を出して、p1 の手札を作る
  const play = (flag) => {
    const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 12, frozenCountsAsIce: flag };
    const game = new Game({ cards, rules, rng: seededRng(5), elements: readClassic('elements.json'), reactions: REACTIONS });
    game.debugSetHand('p1', ['tank', 'lightBlade', 'darkBlade']);
    game.debugSetHand('p2', ['tank']);
    game.debugSetDeck(Array(40).fill('heal'));
    game.start();
    game.playCard(game.getState('p1').players.p1.hand.find((c) => c.type === 'tank').cardId);
    game.endTurn();
    game.playCard(game.getState('p2').players.p2.hand.find((c) => c.type === 'tank').cardId);
    game.players.p2.soldiers[0].frozen = 3;
    game.endTurn();
    game.debugSetHand('p1', ['lightBlade', 'darkBlade']);
    const ctx = { cards, rules: game.rules, discardCount: 0, upgrades: {} };
    STRATEGIES.smart.takeTurn(game, 'p1', seededRng(1), ctx);
    return game.players.p1.soldiers.map((s) => s.weapon);
  };
  const withFlag = play(true);
  const without = play(false);
  assert.ok(withFlag.includes('darkBlade'), `フラグあり：闇の剣を選ぶ（${withFlag}）`);
  assert.ok(!without.includes('darkBlade'), `フラグなし：反応を狙わない（${without}）`);
});

test('データ：4陣営の rules.json は frozenCountsAsIce が true。通常モード・クラシックには書いていない。おかしな値は例外', () => {
  assert.equal(buildData({ mode: 'factions' }).rules.frozenCountsAsIce, true);
  assert.equal(buildData({}).rules.frozenCountsAsIce, undefined);
  assert.equal(buildData({ mode: 'classic' }).rules.frozenCountsAsIce, undefined);
  assert.equal(typeof loadOptionalData('factions').reactions, 'object');
  const cards = loadFixture('cards-step2.json');
  assert.throws(() => new Game({ cards, rules: { ...loadFixture('rules.json'), frozenCountsAsIce: 1 }, rng: seededRng(1) }), /frozenCountsAsIce/);
});
