// ステージ（data/stages.json）・やけど・昼と夜のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, loadJson, seededRng, recordEvents } from './helpers.js';

const EXTRA_CARDS = {
  archer: { name: '弓兵', kind: 'soldier', role: 'archer', hp: 3, attack: 3, range: 2, stay: 2, count: 1 },
  wolf: { name: '狼', kind: 'soldier', hp: 5, attack: 3, speed: 3, beast: true, count: 1 },
  moonrise: { name: 'ムーンライズ', kind: 'spell', effect: 'setTime', time: 'night', count: 1 },
  dawnbreak: { name: 'ドーンブレイク', kind: 'spell', effect: 'setTime', time: 'day', count: 1 },
};

function setup({ p1 = [], p2 = [], rules = {}, stages = null, stage, deck = Array(40).fill('heal') } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA_CARDS };
  const r = { ...loadFixture('rules.json'), ...rules };
  const opts = { cards, rules: r, rng: seededRng(1) };
  if (stages) opts.stages = stages;
  if (stage !== undefined) opts.setup = { stage };
  const game = new Game(opts);
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};
const stageOf = (def) => ({ s: { name: 'テスト', weight: 1, ...def } });

test('data/stages.json は読み込める。6つのステージがある', () => {
  const stages = loadJson('stages.json');
  assert.deepEqual(Object.keys(stages), ['meadow', 'lava', 'ice', 'ruins', 'darkForest', 'desert']);
  assert.doesNotThrow(() => setup({ stages, stage: 'lava' }));
});

test('ステージは setup.stage で決まる。省略・"random" なら重みでランダム。知らないステージ・stages なしは例外', () => {
  const stages = { a: { name: 'A', weight: 1 }, b: { name: 'B', weight: 1 } };
  assert.equal(setup({ stages, stage: 'b' }).game.getState(null).stage.id, 'b');
  assert.ok(['a', 'b'].includes(setup({ stages }).game.getState(null).stage.id));
  assert.throws(() => setup({ stages, stage: 'zzz' }), /setup.stage/);
  assert.throws(() => setup({ stage: 'a' }), /stages/);
  assert.throws(() => setup({ stages: { a: { name: 'A', weight: 1, heat: 0 } } }), /heat/);
  assert.throws(() => setup({ stages: { a: { name: 'A', weight: 1, lavaSquares: [1] } } }), /burn/);
  assert.equal(setup().game.getState(null).stage, null);
});

/** p1 が騎士に武器を持たせ、次の進軍で城に着かせる（道3マス）。p2 の城へのダメージを返す */
function knightHit(weapon, stages) {
  const { game, log } = setup({ p1: weapon ? ['knight', weapon] : ['knight'], rules: { laneLength: 3 }, stages, stage: stages ? 's' : undefined });
  game.playCard(idOf(game, 'knight'));
  if (weapon) game.playCard(idOf(game, weapon));
  game.endTurn();
  game.endTurn();
  return log.find((e) => e.event === 'castleDamaged' && e.playerId === 'p2').amount;
}

test('ステージに合う属性の武器を持った兵士だけ、ダメージが1.5倍（切り上げ）', () => {
  const lava = stageOf({ element: 'fire', elementMultiplier: 1.5 });
  assert.equal(knightHit('flameSword', null), 6);
  assert.equal(knightHit('flameSword', lava), 9); // 6 × 1.5
  assert.equal(knightHit('waterSpear', lava), 6); // 属性が違う
  assert.equal(knightHit(null, lava), 5); // 武器なし
});

test('1.5倍は兵士同士の戦いにも効く', () => {
  const { game, log } = setup({
    p1: ['infantry', 'flameSword'], p2: ['infantry'], rules: { laneLength: 3 },
    stages: stageOf({ element: 'fire', elementMultiplier: 1.5 }), stage: 's',
  });
  game.playCard(idOf(game, 'infantry'));
  game.playCard(idOf(game, 'flameSword'));
  game.endTurn();
  game.playCard(idOf(game, 'infantry'));
  game.endTurn(); // p1 の歩兵が進んで、p2 の歩兵とぶつかる
  const hit = log.find((e) => e.event === 'soldierDamaged' && e.playerId === 'p2' && e.cause === 'fight');
  assert.equal(hit.amount, 6); // (3 + 1) × 1.5
});

test('溶岩：ターンの終わりに自分の兵士全員に灼熱、溶岩マスならやけど。やけどは進軍の前に効いて、回数で治る', () => {
  const { game, log } = setup({
    p1: ['infantry'], stages: stageOf({ heat: 1, lavaSquares: [0], burn: { amount: 1, turns: 1 } }), stage: 's',
  });
  game.playCard(idOf(game, 'infantry'));
  log.length = 0;
  game.endTurn();
  assert.deepEqual(log.slice(0, 2).map((e) => [e.event, e.cause ?? e.status]), [['soldierDamaged', 'heat'], ['statusApplied', 'burn']]);
  assert.deepEqual(game.getState(null).players.p1.soldiers[0].statuses.burn, { amount: 1, turns: 1 });
  game.endTurn(); // p2
  const burn = log.findIndex((e) => e.event === 'soldierDamaged' && e.cause === 'burn');
  assert.ok(burn > 0);
  assert.equal(log[burn + 1].event, 'statusCleared');
  assert.equal(game.getState(null).players.p1.soldiers[0].hp, 3);
});

test('溶岩：周回の始めの噴火で、そのマスの兵士にダメージとやけど', () => {
  const { game, log } = setup({
    p1: ['infantry'], rules: { laneLength: 3 }, stages: stageOf({ eruption: { chance: 1, amount: 3 }, burn: { amount: 1, turns: 2 } }), stage: 's',
  });
  game.playCard(idOf(game, 'infantry'));
  game.players.p1.soldiers[0].position = 1; // 噴火するマス（道3マスなら真ん中だけ）
  game.endTurn();
  log.length = 0;
  game.endTurn(); // 周回2の始め
  const i = log.findIndex((e) => e.event === 'stageEruption');
  assert.deepEqual(log[i], { event: 'stageEruption', roadId: 'p1-p2', square: 1, amount: 3 });
  assert.equal(log[i + 1].cause, 'eruption');
  assert.equal(log[i + 2].status, 'burn');
});

test('氷：歩き切った兵士が滑って1マス余分に進む。凍結の休み・盾が増える', () => {
  const ice = stageOf({ slipChance: 1, effectBonus: { freezeEnemySoldiers: 1, shieldSoldier: 1 } });
  const a = setup({ p1: ['infantry', 'shield'], p2: ['frostBreath'], stages: ice, stage: 's' });
  a.game.playCard(idOf(a.game, 'infantry'));
  a.game.playCard(idOf(a.game, 'shield'));
  assert.equal(a.log.find((e) => e.event === 'shieldAdded').amount, 4);
  a.game.endTurn();
  a.game.playCard(idOf(a.game, 'frostBreath'));
  assert.equal(a.game.getState(null).players.p1.soldiers[0].statuses.frozen, 2);

  const b = setup({ p1: ['infantry'], stages: ice, stage: 's' });
  b.game.playCard(idOf(b.game, 'infantry'));
  b.game.endTurn();
  b.game.endTurn();
  const moved = b.log.find((e) => e.event === 'soldierMoved');
  assert.deepEqual([moved.from, moved.to, moved.slipped], [0, 3, true]);
});

test('遺跡：ターンの始めにMP+1、城への魔法が強くなる', () => {
  const { game, log } = setup({
    p1: ['fireball'], rules: { maxMp: 10, initialMp: 0 }, stages: stageOf({ mpPerTurn: 1, effectBonus: { damageEnemyCastle: 2 } }), stage: 's',
  });
  assert.deepEqual(log.find((e) => e.event === 'mpChanged'), { event: 'mpChanged', playerId: 'p1', delta: 1, mp: 1, reason: 'stage' });
  game.playCard(idOf(game, 'fireball'));
  assert.equal(log.find((e) => e.event === 'castleDamaged').amount, 10);
});

/** p1 の弓兵（射程2）が、2マス先に来た p2 の歩兵を撃てるか */
function archerShoots(stages) {
  const { game, log } = setup({ p1: ['archer'], p2: ['infantry'], stages, stage: stages ? 's' : undefined });
  game.playCard(idOf(game, 'archer'));
  game.endTurn();
  game.playCard(idOf(game, 'infantry'));
  game.endTurn();
  game.endTurn(); // p2 の歩兵が位置2（弓兵から2マス先）へ
  game.endTurn(); // p1 の弓兵が撃つ番
  return log.some((e) => e.event === 'soldierShot');
}

test('砂漠：弓兵・魔法使いの射程が短くなる', () => {
  assert.equal(archerShoots(null), true);
  assert.equal(archerShoots(stageOf({ rangePenalty: 1 })), false);
});

test('夜：nightChance で周回の始めに夜になり、nightRounds 周で昼に戻る', () => {
  const { game, log } = setup({ rules: { nightChance: 1, nightFirstRound: 1, nightRounds: 2 } });
  assert.deepEqual(log.find((e) => e.event === 'timeChanged'), { event: 'timeChanged', time: 'night', previous: 'day', rounds: 2, cause: 'natural', playerId: null });
  assert.equal(game.getState(null).time, 'night');
  assert.equal(game.getState(null).nightRoundsLeft, 2);
  for (let i = 0; i < 4; i++) game.endTurn(); // 周回3の始め
  assert.equal(log.filter((e) => e.event === 'timeChanged').at(-1).time, 'day');
  assert.equal(game.getState(null).time, 'day');
});

test('夜は獣（beast・魔物の駒）が強くなる。ステージの nightChance・nightRoundsBonus が効く', () => {
  const { game, log } = setup({
    p1: ['wolf'], rules: { laneLength: 3, nightBeastAttack: 2, nightRounds: 1 },
    stages: stageOf({ nightChance: 1, nightRoundsBonus: 2 }), stage: 's',
  });
  game.playCard(idOf(game, 'wolf'));
  game.endTurn();
  game.endTurn(); // 周回2（nightFirstRound の既定）の始めに夜。狼が城に着く
  assert.equal(log.find((e) => e.event === 'timeChanged').rounds, 3);
  assert.equal(log.find((e) => e.event === 'castleDamaged' && e.playerId === 'p2').amount, 5); // 3 + 2
});

test('ムーンライズは昼だけ、ドーンブレイクは夜だけ出せる', () => {
  const { game, log } = setup({ p1: ['moonrise', 'dawnbreak'], p2: ['dawnbreak'] });
  assert.deepEqual(game.canPlayCard(idOf(game, 'dawnbreak')), { ok: false, reason: 'もう昼です' });
  assert.equal(game.playCard(idOf(game, 'moonrise')).ok, true);
  assert.deepEqual(log.find((e) => e.event === 'timeChanged'), { event: 'timeChanged', time: 'night', previous: 'day', rounds: 2, cause: 'card', playerId: 'p1' });
  game.endTurn();
  assert.equal(game.playCard(idOf(game, 'dawnbreak')).ok, true);
  assert.equal(game.getState(null).time, 'day');
});

test('data/cards.json：暗殺者は見えない兵士（忍者と同じ役割）、刻の魔法はスペシャル', () => {
  const cards = loadJson('cards.json');
  assert.equal(cards.assassin.role, 'ninja');
  assert.equal(cards.moonrise.time, 'night');
  assert.equal(cards.dawnbreak.time, 'day');
});
