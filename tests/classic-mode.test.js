// クラシックモード（PR1：土台）のテスト：モードごとにカード・ルールが切り替わる／既定のモードは変わらない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { Lobby } from '../server/rooms.js';
import { loadData, loadModeData } from '../server/server.js';
import { buildData, loadOptionalData, loadJson, seededRng } from './helpers.js';

test('buildData: mode を省略すると今までと同じ。classic はクラシックのカード・ルール', () => {
  const normal = buildData();
  assert.equal(normal.rules.drawPerTurn, loadJson('rules.json').drawPerTurn);
  assert.ok(normal.cards.infantry);
  const classic = buildData({ mode: 'classic' });
  assert.equal(classic.rules.drawPerTurn, 2);
  assert.equal(classic.rules.maxHand, 8); // 段階A1：手札上限8
  assert.ok(classic.cards.classic_king_infantry);
  assert.equal(classic.cards.infantry, undefined);
  assert.throws(() => buildData({ mode: 'nothing' }), /cardSet/);
  assert.equal(loadOptionalData('classic').rarities, null);
  assert.ok(loadOptionalData().rarities);
});

test('クラシックのルールは、決めた値だけが通常モードと違う', () => {
  const normal = loadJson('rules.json');
  const { rules } = buildData({ mode: 'classic' });
  const changed = Object.keys({ ...normal, ...rules }).filter((k) => normal[k] !== rules[k]).sort();
  assert.deepEqual(changed, [
    'castleSpellHitsFront', 'coinPerTurn', 'collapseAnnounceRound', 'collapseDamage', 'collapseStartRound',
    'drawPerPlayed', 'drawPerTurn', 'drawUntilHand', 'firstTurnDraw', 'initialCoins', 'maxRounds',
    'mpAllCards', 'mpPerTurn', 'secondPlayerArmor', 'secondPlayerMp',
  ]);
});

test('クラシックのカードは、レアリティなしで Game が作れて、山札は count 枚ずつ（60〜80枚）', () => {
  const { cards, rules } = buildData({ mode: 'classic' });
  const total = Object.values(cards).reduce((n, c) => n + c.count, 0);
  assert.ok(total >= 60 && total <= 80, `山札は ${total} 枚`);
  for (const [k, c] of Object.entries(cards)) {
    assert.ok(k.startsWith('classic_'), k);
    assert.equal(c.rarity, undefined);
    assert.equal(c.fuseTo, undefined);
  }
  const game = new Game({ cards, rules, ...loadOptionalData('classic'), rng: seededRng(1) });
  game.start();
  assert.equal(game.getState(null).deckMode, 'shared');
});

test('server: loadData(dir, "classic") と loadModeData', () => {
  const data = loadData(undefined, 'classic');
  assert.equal(data.rarities, null);
  assert.equal(data.decks, null);
  assert.ok(data.cards.classic_king_wall);
  assert.ok(data.monsters); // 魔物などは通常モードと同じ
  assert.deepEqual(Object.keys(loadModeData()), ['classic', 'factions']); // factions は4陣営モード（tests/factions-server.test.js）
  assert.ok(loadData().rarities); // 既定は今まで通り
});

test('部屋: mode を選ぶと、その部屋はクラシックのカードで動く。別のモードの同じ合言葉には入れない', () => {
  let seed = 1;
  const lobby = new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0, modeData: loadModeData() });
  const a = lobby.join('abc', 'A', null, 'classic');
  assert.equal(a.ok, true);
  const { room } = lobby.findSeat(a.token);
  assert.equal(room.modeId, 'classic');
  assert.ok(room.data.cards.classic_king_infantry);
  assert.equal(room.data.rules.maxHand, 8); // 段階A1：手札上限8
  assert.equal(lobby.join('abc', 'B').ok, false); // 通常モードでは入れない
  assert.equal(lobby.join('abc', 'B', null, 'classic').ok, true);
  assert.equal(lobby.join('xyz', 'C', null, 'nothing').ok, false);
  const n = lobby.join('plain', 'D');
  assert.equal(lobby.findSeat(n.token).room.modeId, null);
  assert.ok(lobby.findSeat(n.token).room.data.cards.infantry);
});

test('クラシックの3人以上・チーム戦も決着する（広場・輪。CPU の smart で数試合）', async () => {
  const { runMatch } = await import('./sim/sim.js');
  const cases = [
    { playerCount: 4, roadLayout: 'plaza', setup: { teams: ['t1', 't2', 't1', 't2'] } },
    { playerCount: 3, roadLayout: 'plaza', winCondition: 'lastStanding' },
    { playerCount: 4, roadLayout: 'ring', winCondition: 'lastStanding' },
  ];
  for (const { setup, ...patch } of cases) {
    const { cards, rules } = buildData({ mode: 'classic', rules: patch });
    for (const seed of [1, 2]) {
      const r = runMatch({ cards, rules, strategies: Array(patch.playerCount).fill('smart'), seed, gameOptions: { ...loadOptionalData('classic'), ...(setup ? { setup } : {}) } });
      assert.ok(r.winner, `${JSON.stringify(patch)} seed ${seed}`);
    }
  }
});
