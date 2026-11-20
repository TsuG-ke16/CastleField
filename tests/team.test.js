// チーム戦（setup.teams）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { STRATEGIES } from '../js/game/strategies.js';
import { loadFixture, seededRng, recordEvents, buildData, loadOptionalData } from './helpers.js';

function newGame({ teams, rules = {}, seed = 1 } = {}) {
  const game = new Game({
    cards: loadFixture('cards.json'),
    rules: { ...loadFixture('rules.json'), laneLength: 3, laneCount: 3, roadLayout: 'plaza', playerCount: teams.length, ...rules },
    rng: seededRng(seed),
    setup: { teams },
  });
  const log = recordEvents(game, EVENT_TYPES);
  return { game, log };
}

/** playerId の兵士を1体、targetId（城の持ち主）に向けて置く */
function place(game, playerId, targetId, position) {
  game.debugSetHand(playerId, ['infantry']);
  const saved = game.currentPlayer;
  game.currentPlayer = playerId;
  const r = game.playCard(game.players[playerId].hand[0].cardId, { playerId: targetId });
  assert.equal(r.ok, true, r.reason);
  game.players[playerId].playedThisTurn = false;
  game.currentPlayer = saved;
  const s = game.players[playerId].soldiers.at(-1);
  s.position = position;
  return s;
}

test('チーム：城はチームで1つ。HP は人数ぶん、城壁も共有。getState に teams と castleOwner', () => {
  const { game } = newGame({ teams: ['t1', 't2', 't1', 't2', 't2'] });
  const st = game.getState(null);
  assert.deepEqual(st.teams, {
    t1: { members: ['p1', 'p3'], castleOwner: 'p1', size: 2 },
    t2: { members: ['p2', 'p4', 'p5'], castleOwner: 'p2', size: 3 },
  });
  assert.equal(st.players.p3.castleOwner, 'p1');
  assert.equal(st.players.p3.team, 't1');
  assert.equal(st.players.p1.castleMaxHp, 50); // 25 × 2
  assert.equal(st.players.p5.castleMaxHp, 75); // 25 × 3
  assert.equal(game.players.p4.castle, game.players.p2.castle);
  game.players.p4.armor = 3;
  assert.equal(game.players.p2.armor, 3);
  // 城が2つなので、広場ではなく2人のときと同じ道（3本）
  assert.equal(st.layout, 'lanes');
  assert.equal(st.roads.length, 3);
});

test('チーム：手番はチームを交互に回し、チームの中は順番に', () => {
  const { game } = newGame({ teams: ['t1', 't1', 't1', 't2'] });
  game.start();
  const order = [game.currentPlayer];
  for (let i = 0; i < 7; i++) {
    game.endTurn();
    if (game.phase === 'discard') game.discard(game.players[game.currentPlayer].hand.slice(0, game.discardCount).map((c) => c.cardId));
    order.push(game.currentPlayer);
  }
  assert.deepEqual(order, ['p1', 'p4', 'p2', 'p4', 'p3', 'p4', 'p1', 'p4']);
  assert.equal(game.round, 4); // チームAの手番ごとに1周
});

test('チーム：味方には送れず、相手の城は代表を狙う。味方の兵士とは戦わない', () => {
  const { game } = newGame({ teams: ['t1', 't2', 't3', 't1', 't2', 't3'] });
  game.start();
  assert.equal(game.getState(null).layout, 'plaza'); // 城が3つ
  game.debugSetHand('p4', ['infantry', 'fireball']);
  const [inf, fb] = game.players.p4.hand;
  game.currentPlayer = 'p4';
  assert.deepEqual(game.getTargets(inf.cardId), [{ playerId: 'p2' }, { playerId: 'p3' }]);
  assert.deepEqual(game.getTargets(fb.cardId), [{ playerId: 'p2' }, { playerId: 'p3' }]);
  game.currentPlayer = 'p1';
  // 兵士の場所は、チームの城（代表）の道
  const mine = place(game, 'p4', 'p2', 0);
  assert.deepEqual(game.getState(null).players.p4.soldiers[0].place, { at: 'spoke', playerId: 'p1', square: 0 });
  // 味方（p1）の兵士とは戦わない。t2 のメンバー（p5）の兵士とは戦う
  place(game, 'p1', 'p3', 1);
  assert.equal(game.findClashTarget(mine, game.players.p4), null);
  const foe = place(game, 'p5', 'p3', 1);
  assert.equal(game.findClashTarget(mine, game.players.p4).soldier, foe);
});

test('チーム：城を落とすとチーム全員が抜け、勝ったチームが gameOver に入る', () => {
  const { game, log } = newGame({ teams: ['t1', 't2', 't3', 't1', 't2', 't3'], rules: { winCondition: 'lastStanding' } });
  game.start();
  for (const victim of ['p2', 'p3']) {
    game.players[victim].castle.hp = 0;
    game.checkGameOver();
  }
  assert.deepEqual(log.filter((e) => e.event === 'playerEliminated').map((e) => e.playerId), ['p2', 'p5', 'p3', 'p6']);
  const over = log.find((e) => e.event === 'gameOver');
  assert.equal(over.winnerTeam, 't1');
  assert.equal(over.winner, 'p1');
  assert.equal(game.getState(null).winnerTeam, 't1');
});

test('チーム：チームの数・人数の間違いは例外', () => {
  assert.throws(() => newGame({ teams: ['t1', 't1'] }), /2つ以上/);
  assert.throws(() => newGame({ teams: ['t1', 't5'] }), /t1/);
  assert.throws(() => newGame({ teams: ['t1', 't2', 't1'] , rules: { playerCount: 4 } }), /人数ぶん/);
});

test('チーム：1人対7人・4チームでも、CPU 同士で最後まで進む', () => {
  const { rules, cards } = buildData({ rules: { roadLayout: 'plaza', playerCount: 8 } });
  const setups = [
    ['t1', 't2', 't2', 't2', 't2', 't2', 't2', 't2'],
    ['t1', 't2', 't3', 't4', 't1', 't2', 't3', 't4'],
  ];
  for (const teams of setups) {
    for (const winCondition of ['firstDestroy', 'lastStanding']) {
      const opts = loadOptionalData();
      const game = new Game({ cards, rules: { ...rules, winCondition }, ...opts, rng: seededRng(3), setup: { teams } });
      const ctx = { cards, rules: game.rules, upgrades: opts.upgrades, discardCount: 0 };
      const rng = seededRng(4);
      const settle = () => {
        for (let i = 0; i < 50 && game.getState(null).phase === 'defend'; i++) {
          STRATEGIES.smart.respond(game, game.getState(null).defense.defenderId, rng, ctx);
        }
      };
      ctx.onDefense = settle;
      game.on('discardRequired', (e) => { ctx.discardCount = e.count; });
      game.start();
      for (const pid of game.getState(null).mulligan?.pending ?? []) game.mulligan(pid, []); // マリガンはしない
      for (let i = 0; i < 20000 && game.getState(null).phase !== 'gameOver'; i++) {
        const st = game.getState(null);
        if (st.phase === 'defend') { settle(); continue; }
        if (st.phase === 'discard') game.discard(STRATEGIES.smart.chooseDiscard(game, st.currentPlayer, rng, ctx));
        else {
          STRATEGIES.smart.takeTurn(game, st.currentPlayer, rng, ctx);
          if (game.getState(null).phase === 'main') game.endTurn();
        }
      }
      const end = game.getState(null);
      assert.equal(end.phase, 'gameOver', `${teams} ${winCondition}`);
      assert.ok(teams.includes(end.winnerTeam));
    }
  }
});
