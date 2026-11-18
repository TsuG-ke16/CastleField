// 天候と、倒した魔物の駒のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, loadJson, seededRng, recordEvents } from './helpers.js';

const WEATHER = {
  sunny: { name: '晴れ', weight: 1, rounds: [2, 2], elementBonus: { fire: 2 } },
  heavyRain: { name: '大雨', weight: 1, rounds: [2, 2], elementBonus: { water: 2 }, lightning: 5 },
  fog: { name: '霧', weight: 1, rounds: [2, 2], missChance: 1 },
  storm: { name: '嵐', weight: 1, rounds: [2, 2], stopMarch: true },
  sandstorm: { name: '砂嵐', weight: 1, rounds: [2, 2], sandDamage: 1 },
  coinRain: { name: 'コインの雨', weight: 1, rounds: [2, 2], coinPerTurn: 2 },
};

/** 最初の周回に、指定の天候が必ず始まる設定 */
function setup({ type, p1 = [], p2 = [], rules = {}, cards = {}, weather = WEATHER } = {}) {
  const base = loadFixture('cards-step2.json');
  const only = { [type]: weather[type] };
  const r = { ...loadFixture('rules.json'), weatherFirstRound: 1, weatherChangeChance: 1, ...rules };
  const game = new Game({ cards: { ...base, ...cards }, rules: r, rng: seededRng(1), weather: only });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(Array(40).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const events = (log) => log.map((e) => e.event);
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};

test('weather を渡さなければ天候は出ない', () => {
  const game = new Game({ cards: loadFixture('cards-step2.json'), rules: { ...loadFixture('rules.json'), weatherChangeChance: 1 }, rng: seededRng(1) });
  game.start();
  assert.equal(game.getState(null).weather, null);
  assert.equal(game.getState(null).weatherEnabled, false);
});

test('周回の始めに天候が始まり、rounds 周で終わる（roundStarted → weatherChanged）', () => {
  const { game, log } = setup({ type: 'sunny' });
  assert.deepEqual(events(log).slice(0, 3), ['turnStarted', 'roundStarted', 'weatherChanged']);
  assert.deepEqual(log[2], {
    event: 'weatherChanged', weather: 'sunny', previous: null, rounds: 2, cause: 'natural', playerId: null,
    name: '晴れ', icon: null, description: null, previousName: null,
  });
  assert.equal(game.getState(null).weather.type, 'sunny');
  for (let i = 0; i < 2; i++) game.endTurn(); // 2周目：まだ続く
  assert.equal(game.getState(null).weather.type, 'sunny');
  for (let i = 0; i < 2; i++) game.endTurn(); // 3周目：終わる
  assert.equal(game.getState(null).weather, null);
  assert.equal(log.filter((e) => e.event === 'weatherChanged' && e.weather === null).length, 1);
});

test('weatherFirstRound より前は天候が出ない', () => {
  const { game } = setup({ type: 'sunny', rules: { weatherFirstRound: 2 } });
  assert.equal(game.getState(null).weather, null);
  for (let i = 0; i < 2; i++) game.endTurn();
  assert.equal(game.getState(null).weather.type, 'sunny');
});

test('晴れ：火の属性のダメージが増える（水は増えない）', () => {
  const { game } = setup({ type: 'sunny' });
  assert.equal(game.fightDamage({ attack: 3, element: 'fire' }, { element: null }), 5);
  assert.equal(game.fightDamage({ attack: 3, element: 'water' }, { element: null }), 3);
  assert.equal(game.fightDamage({ attack: 3, element: null }, { element: null }), 3);
});

test('大雨：水が強くなり、周回の始めに雷がどちらかの城に5ダメージ', () => {
  const { game, log } = setup({ type: 'heavyRain' });
  assert.equal(game.fightDamage({ attack: 3, element: 'water' }, { element: null }), 5);
  const i = events(log).indexOf('weatherLightning');
  assert.ok(i > events(log).indexOf('weatherChanged'));
  assert.deepEqual(events(log).slice(i, i + 2), ['weatherLightning', 'castleDamaged']);
  const hit = log[i];
  assert.equal(hit.amount, 5);
  assert.deepEqual(log[i + 1].source, { kind: 'weather', weather: 'heavyRain' });
  const s = game.getState(null);
  assert.equal(s.players[hit.playerId].castleHp, s.players[hit.playerId].castleMaxHp - 5);
});

test('霧：兵士の戦い・攻撃魔法が外れる（attackMissed）', () => {
  const { game, log } = setup({ type: 'fog', p1: ['fireball', 'infantry'], p2: [] });
  const hp = game.getState(null).players.p2.castleHp;
  assert.equal(game.playCard(idOf(game, 'fireball'), { playerId: 'p2' }).ok, true);
  assert.equal(game.getState(null).players.p2.castleHp, hp);
  assert.deepEqual(log.find((e) => e.event === 'attackMissed'), { event: 'attackMissed', playerId: 'p1', kind: 'spell', type: 'fireball' });
});

test('霧でないときは、外れの判定で乱数を使わない', () => {
  const { game } = setup({ type: 'sunny' });
  let used = 0;
  game.rng = () => { used += 1; return 0; };
  assert.equal(game.rollMiss(), false);
  assert.equal(used, 0);
});

test('嵐：進む兵士が動かない', () => {
  const { game, log } = setup({ type: 'storm', p1: ['infantry'] });
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2' });
  game.endTurn(); game.endTurn(); // 次の自分のターン：進軍
  assert.equal(events(log).filter((e) => e === 'soldierMoved').length, 0);
  assert.equal(game.getState(null).players.p1.soldiers[0].position, 0);
});

test('砂嵐：周回の始めに全員の城と兵士に1ダメージ', () => {
  const { game, log } = setup({ type: 'sandstorm' });
  const s = game.getState(null);
  assert.equal(s.players.p1.castleHp, s.players.p1.castleMaxHp - 1);
  assert.equal(s.players.p2.castleHp, s.players.p2.castleMaxHp - 1);
  assert.deepEqual(log.filter((e) => e.event === 'castleDamaged').map((e) => e.source), [{ kind: 'weather', weather: 'sandstorm' }, { kind: 'weather', weather: 'sandstorm' }]);
});

test('砂嵐：城は削りきれない（HP1で止まり、両方の城がHP1でも決着しない）', () => {
  const base = loadFixture('cards-step2.json');
  const r = { ...loadFixture('rules.json'), weatherFirstRound: 2, weatherChangeChance: 1 };
  const game = new Game({ cards: base, rules: r, rng: seededRng(1), weather: { sandstorm: WEATHER.sandstorm } });
  game.debugSetDeck(Array(40).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  game.debugSetCastleHp('p1', 1);
  game.debugSetCastleHp('p2', 2);
  game.endTurn(); game.endTurn(); // 2周目：砂嵐が始まる
  const s = game.getState(null);
  assert.equal(s.weather.type, 'sandstorm');
  assert.equal(s.players.p1.castleHp, 1);
  assert.equal(s.players.p2.castleHp, 1);
  assert.notEqual(s.phase, 'gameOver');
  const sand = log.filter((e) => e.event === 'castleDamaged');
  assert.deepEqual(sand.map((e) => [e.playerId, e.amount, e.hp]), [['p2', 1, 1]]); // HP1の城には出ない
  game.endTurn(); game.endTurn(); // 3周目も砂嵐。どちらも1のまま
  assert.equal(game.getState(null).players.p1.castleHp, 1);
  assert.equal(game.getState(null).players.p2.castleHp, 1);
  assert.notEqual(game.getState(null).phase, 'gameOver');
});

test('砂嵐：兵士も1ダメージ（cause は weather）', () => {
  const { game, log } = setup({ type: 'sandstorm', p1: ['infantry'], rules: { weatherFirstRound: 2 } });
  game.playCard(idOf(game, 'infantry'), { playerId: 'p2' });
  const hp = game.getState(null).players.p1.soldiers[0].hp;
  game.endTurn(); game.endTurn(); // 2周目：砂嵐が始まる（始まった周回から効く）
  const s = game.getState(null).players.p1.soldiers[0];
  assert.equal(s.hp, hp - 1);
  assert.ok(log.some((e) => e.event === 'soldierDamaged' && e.cause === 'weather'));
});

test('コインの雨：自分のターンの始めに2コイン（reason は weather）', () => {
  const { game, log } = setup({ type: 'coinRain' });
  assert.equal(game.getState(null).players.p1.coins, 2);
  game.endTurn();
  assert.equal(game.getState(null).players.p2.coins, 2);
  assert.ok(log.filter((e) => e.event === 'coinsChanged').every((e) => e.reason === 'weather'));
});

test('天候の呪文：天候を変える（今と違う天候になる）', () => {
  const card = { name: '天候の呪文', kind: 'spell', effect: 'changeWeather', count: 0 };
  const base = loadFixture('cards-step2.json');
  const game = new Game({ cards: { ...base, weatherCall: card }, rules: loadFixture('rules.json'), rng: seededRng(1), weather: WEATHER });
  game.debugSetHand('p1', ['weatherCall']);
  game.debugSetDeck(Array(40).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  assert.equal(game.getState(null).weather, null);
  assert.equal(game.playCard(idOf(game, 'weatherCall')).ok, true);
  const changed = log.find((e) => e.event === 'weatherChanged');
  assert.equal(changed.cause, 'card');
  assert.equal(changed.playerId, 'p1');
  assert.equal(game.getState(null).weather.type, changed.weather);
});

test('天候なしのゲームでは、天候の呪文は出せない', () => {
  const card = { name: '天候の呪文', kind: 'spell', effect: 'changeWeather', count: 0 };
  const game = new Game({ cards: { ...loadFixture('cards-step2.json'), weatherCall: card }, rules: loadFixture('rules.json'), rng: seededRng(1) });
  game.debugSetHand('p1', ['weatherCall']);
  game.start();
  assert.equal(game.canPlayCard(idOf(game, 'weatherCall')).ok, false);
});

test('weather.json の書き間違いは例外', () => {
  const opts = { cards: loadFixture('cards-step2.json'), rules: loadFixture('rules.json') };
  assert.throws(() => new Game({ ...opts, weather: { x: { name: 'x', weight: 1, rounds: [3, 2] } } }), /rounds/);
  assert.throws(() => new Game({ ...opts, weather: { x: { name: 'x', weight: 1, rounds: [1, 2], missChance: 2 } } }), /missChance/);
  assert.throws(() => new Game({ ...opts, weather: { x: { name: 'x', weight: 1, rounds: [1, 2], elementBonus: { wood: 1 } } } }), /elementBonus/);
});

test('data/weather.json は読めて、7種類の天候がある', () => {
  const w = loadJson('weather.json');
  assert.deepEqual(Object.keys(w).sort(), ['coinRain', 'fog', 'heavyRain', 'rain', 'sandstorm', 'storm', 'sunny']);
  new Game({ cards: loadJson('cards.json'), rules: loadJson('rules.json'), rarities: loadJson('rarities.json'), weather: w, rng: seededRng(1) });
});

test('倒した魔物は、駒（兵士カード）としてとどめを刺した人の手札に入る', () => {
  const cards = loadJson('cards.json');
  const monsters = loadJson('monsters.json');
  const rarities = loadJson('rarities.json');
  const game = new Game({ cards, rules: { ...loadJson('rules.json'), monsterSpawnChance: 0 }, rng: seededRng(1), monsters, rarities });
  game.start();
  const log = recordEvents(game, EVENT_TYPES);
  // 魔物を1体置いて倒す
  const m = { monsterId: 'mX', type: 'bat', isDead: true, roadId: game.roads[0].roadId, def: monsters.bat };
  game.monsters.push(m);
  const before = game.players.p1.hand.length;
  game.defeatMonsterIfDead(m, 'p1');
  const defeated = log.find((e) => e.event === 'monsterDefeated');
  assert.equal(defeated.pieceType, 'beast_bat');
  assert.equal(game.players.p1.hand.length, before + 2); // ごほうびのカード＋駒
  assert.equal(game.players.p1.hand.filter((c) => c.type === 'beast_bat').length, 1);
  // 兵士カードとして出せる（魔物のHP・攻撃の兵士になる）
  game.debugSetHand('p1', ['beast_bat']);
  const id = game.getState('p1').players.p1.hand[0].cardId;
  assert.equal(game.playCard(id, { playerId: 'p2', roadId: game.roads[0].roadId }).ok, true);
  const s = game.getState(null).players.p1.soldiers[0];
  assert.equal(s.hp, monsters.bat.hp);
  assert.equal(s.attack, monsters.bat.attack);
});

test('魔物の駒は合成できず、排出（山札・ごほうび）では出ない', () => {
  const cards = loadJson('cards.json');
  const rarities = loadJson('rarities.json');
  const game = new Game({ cards, rules: loadJson('rules.json'), rng: seededRng(1), monsters: loadJson('monsters.json'), rarities });
  game.start();
  game.debugSetHand('p1', ['beast_bat', 'beast_bat']);
  const [a, b] = game.getState('p1').players.p1.hand;
  assert.equal(game.canFuse(a.cardId, b.cardId).ok, false);
  assert.equal(game.getDropRates().cards.beast_bat.rate, 0);
});
