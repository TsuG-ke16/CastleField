// 段階A1（docs/skilltree-200-notes/a1-battle-tempo.md）：クラシック・4陣営の基本数値と、コイン報酬（撃破・魔物・城HP50%）。
// 数値はモードの rules.json から読む（テストに数値を直書きしない）。通常モードは今までどおり（報酬なし）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { Soldier } from '../js/game/Soldier.js';
import { Monster } from '../js/game/Monster.js';
import { buildData, loadJson, loadOptionalData, recordEvents } from './helpers.js';

function modeGame(mode = 'classic', { rules: patch = {}, setup = {} } = {}) {
  const { cards, rules } = buildData({ mode, rules: { mulligan: false, monsterSpawnChance: 0, ...patch } });
  const opts = loadOptionalData(mode);
  delete opts.stages;
  delete opts.weather;
  const game = new Game({ ...opts, cards, rules, setup: { ...(mode === 'factions' ? { decks: ['kingdom', 'demon'] } : {}), ...setup }, rng: () => 0.5 });
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log, rules, cards };
}

/** 兵士を直接置く */
function put(game, ownerId, type, roadIndex, position, patch = {}) {
  const road = game.roads[roadIndex];
  const targetId = ownerId === 'p1' ? 'p2' : 'p1';
  const s = new Soldier(`s${String(game.nextSoldierNumber++).padStart(2, '0')}`, { type, def: game.cardDefs[type] }, road.roadId, targetId);
  s.position = position;
  Object.assign(s, patch);
  game.players[ownerId].soldiers.push(s);
  return s;
}
const coinLog = (log, reason) => log.filter((e) => e.event === 'coinsChanged' && e.reason === reason);
const INF = 'classic_king_infantry';
const SKEL = 'classic_demon_skeleton';
const SHADOW = 'classic_demon_shadow'; // 敵兵士1体にダメージ

test('A1 データ：クラシック・4陣営の基本数値（MP10/20・回復5・手札8・2枚ドロー・兵士3体・初期コイン2・毎ターン2）', () => {
  for (const mode of ['classic', 'factions']) {
    const { rules } = buildData({ mode });
    assert.deepEqual(
      [rules.initialMp, rules.maxMp, rules.mpPerTurn, rules.maxHand, rules.drawPerTurn, rules.soldiersPerTurn, rules.initialCoins, rules.coinPerTurn],
      [10, 20, 5, 8, 2, 3, 2, 2],
      mode,
    );
    assert.equal(rules.killCoins, 1);
    assert.equal(rules.killCoinsPerTurn, 3);
    assert.equal(rules.castleHalfCoins, 3);
    assert.equal(rules.monsterCardRewards, false);
    // 既存の魔物12種すべてにコイン報酬がある（小型2・中型3〜4・ドラゴン6・魔王10）
    const monsters = loadJson('monsters.json');
    assert.deepEqual(Object.keys(rules.monsterCoinRewards).sort(), Object.keys(monsters).filter((k) => !k.startsWith('_')).sort(), mode);
    assert.equal(rules.monsterCoinRewards.dragon, 6);
    assert.equal(rules.monsterCoinRewards.demonKing, 10);
  }
  // 通常モードは今までどおり（報酬なし・カードのごほうびあり）
  const normal = loadJson('rules.json');
  for (const k of ['killCoins', 'killCoinsPerTurn', 'castleHalfCoins', 'monsterCoinRewards', 'monsterCardRewards']) assert.equal(normal[k], undefined, k);
});

test('A1：試合の最初のコインは initialCoins、自分のターンの始めに coinPerTurn', () => {
  const { game, rules } = modeGame();
  // 先攻 p1 はターン1の始めに coinPerTurn をもらっている
  assert.equal(game.players.p1.coins, rules.initialCoins + rules.coinPerTurn);
  assert.equal(game.players.p2.coins, rules.initialCoins);
  assert.equal(game.endTurn().ok, true);
  assert.equal(game.players.p2.coins, rules.initialCoins + rules.coinPerTurn);
});

test('A1：敵兵士を魔法で倒すと撃破報酬（手番の人に killCoins）。1ターン killCoinsPerTurn 枚まで', () => {
  const { game, log, rules } = modeGame();
  const p1 = game.players.p1;
  const coins0 = p1.coins;
  const foes = [0, 1, 2, 0].map((r) => put(game, 'p2', SKEL, r, 0, { hp: 1, maxHp: 1 }));
  for (const f of foes) {
    game.debugSetHand('p1', [SHADOW]);
    p1.mp = 20;
    p1.playedThisTurn = false;
    p1.attackSpellsThisTurn = 0;
    assert.equal(game.playCard(p1.hand[0].cardId, { soldierId: f.soldierId }).ok, true);
  }
  assert.equal(foes.every((f) => !game.players.p2.soldiers.includes(f)), true, '4体とも倒れた');
  assert.equal(p1.coins - coins0, rules.killCoins * rules.killCoinsPerTurn, '上限まで');
  assert.equal(coinLog(log, 'kill').length, rules.killCoinsPerTurn);
  // 次の自分のターンには、また上限までもらえる
  game.endTurn();
  if (game.phase === 'discard') game.discard(game.players.p2.hand.slice(0, game.discardCount).map((c) => c.cardId));
  game.endTurn();
  if (game.phase === 'discard') game.discard(p1.hand.slice(0, game.discardCount).map((c) => c.cardId));
  assert.equal(game.currentPlayer, 'p1');
  const f = put(game, 'p2', SKEL, 0, 0, { hp: 1, maxHp: 1 });
  game.debugSetHand('p1', [SHADOW]);
  p1.mp = 20;
  const before = p1.coins;
  assert.equal(game.playCard(p1.hand[0].cardId, { soldierId: f.soldierId }).ok, true);
  assert.equal(p1.coins - before, rules.killCoins);
});

test('A1：戦いで倒したときは、倒した兵士の持ち主に撃破報酬（相手のターンでも）', () => {
  const { game, log } = modeGame();
  const a = put(game, 'p1', INF, 0, 2, { hp: 9, maxHp: 9 });
  const d = put(game, 'p2', SKEL, 0, 2, { hp: 1, maxHp: 1 });
  game.fight(game.players.p1, a, game.players.p2, d, false);
  assert.deepEqual(coinLog(log, 'kill').map((e) => e.playerId), ['p1']);
  // p2 の兵士が、p1 のターンに p1 の兵士を倒しても、p2 がもらう
  const a2 = put(game, 'p1', INF, 1, 2, { hp: 1, maxHp: 1 });
  const d2 = put(game, 'p2', SKEL, 1, 2, { hp: 9, maxHp: 9 });
  game.fight(game.players.p1, a2, game.players.p2, d2, false);
  assert.deepEqual(coinLog(log, 'kill').map((e) => e.playerId), ['p1', 'p2']);
});

test('A1：召喚・蘇生・トークンが倒された／倒したときは撃破報酬なし（無限獲得の防止）', () => {
  const { game, log } = modeGame();
  // 倒されたのがトークン・蘇生
  for (const patch of [{ token: true }, { noBounty: true }]) {
    const a = put(game, 'p1', INF, 0, 2, { hp: 9, maxHp: 9 });
    const d = put(game, 'p2', SKEL, 0, 2, { hp: 1, maxHp: 1, ...patch });
    game.fight(game.players.p1, a, game.players.p2, d, false);
    assert.equal(game.players.p2.soldiers.includes(d), false);
  }
  // 倒したのがトークン・蘇生
  for (const patch of [{ token: true }, { noBounty: true }]) {
    const a = put(game, 'p1', INF, 1, 2, { hp: 9, maxHp: 9, ...patch });
    const d = put(game, 'p2', SKEL, 1, 2, { hp: 1, maxHp: 1 });
    game.fight(game.players.p1, a, game.players.p2, d, false);
    assert.equal(game.players.p2.soldiers.includes(d), false);
  }
  assert.equal(coinLog(log, 'kill').length, 0);
});

test('A1：蘇生のカード（残響の魂）で戻った兵士は noBounty', () => {
  const { game } = modeGame();
  const p1 = game.players.p1;
  const s = put(game, 'p1', SKEL, 0, 1, { hp: 1, maxHp: 5 });
  game.removeSoldier(p1, s, 'killed');
  game.debugSetHand('p1', ['classic_demon_echo_soul']);
  p1.mp = 20;
  assert.equal(game.playCard(p1.hand[0].cardId).ok, true);
  const back = p1.soldiers.at(-1);
  assert.equal(back.type, SKEL);
  assert.equal(back.noBounty, true);
});

test('A1：毒・天候などで倒れたときは撃破報酬なし', () => {
  const { game, log } = modeGame();
  const d = put(game, 'p2', SKEL, 0, 0, { hp: 1, maxHp: 1 });
  game.damageSoldier(game.players.p2, d, 5, 'weather');
  assert.equal(game.players.p2.soldiers.includes(d), false);
  assert.equal(coinLog(log, 'kill').length, 0);
});

test('A1：魔物を倒すと、モードの monsterCoinRewards のコイン。カードのごほうびは出ない', () => {
  for (const mode of ['classic', 'factions']) {
    const { game, log, rules } = modeGame(mode);
    for (const type of ['slime', 'dragon', 'demonKing']) {
      const m = new Monster(`m-${type}`, type, game.monsterDefs[type], game.roads[0].roadId, game.middleSquare());
      game.monsters.push(m);
      const st = game.getState('p1').monsters.find((x) => x.monsterId === m.monsterId);
      assert.equal(st.reward, rules.monsterCoinRewards[type], 'getState の reward もコイン');
      assert.equal(st.rewardRarity, null);
      const hand = game.players.p1.hand.length;
      const coins = game.players.p1.coins;
      m.takeDamage(999);
      game.defeatMonsterIfDead(m, 'p1');
      assert.equal(game.players.p1.coins - coins, rules.monsterCoinRewards[type], `${mode} ${type}`);
      assert.equal(game.players.p1.hand.length, hand, 'カードは増えない');
    }
    assert.equal(coinLog(log, 'reward').length, 3);
  }
});

test('A1：城HPが初めて50%以下になった人に castleHalfCoins（各プレイヤー1回）', () => {
  const { game, log, rules } = modeGame();
  const p2 = game.players.p2;
  const max = p2.castle.maxHp;
  p2.armor = 0;
  const hit = (n) => game.damageCastle(p2, n, { kind: 'spell', type: 'test' }, { ignoreArmor: true });
  hit(max - (Math.floor(max / 2) + 1));
  assert.equal(p2.castle.hp, Math.floor(max / 2) + 1);
  assert.equal(coinLog(log, 'castleHalf').length, 0, '50%より上ではもらえない');
  const coins = p2.coins;
  hit(1);
  assert.equal(p2.coins - coins, rules.castleHalfCoins);
  p2.castle.hp = max;
  hit(max - 1);
  assert.equal(coinLog(log, 'castleHalf').length, 1, '2回目はない');
  assert.equal(coinLog(log, 'castleHalf')[0].playerId, 'p2');
});

test('A1：通常モードは撃破・城HP50% の報酬なし（今までどおり）', () => {
  const { cards, rules } = buildData({ rules: { mulligan: false } });
  const game = new Game({ cards, rules, rng: () => 0.5 });
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  const type = Object.keys(cards).find((k) => cards[k].kind === 'soldier');
  const a = put(game, 'p1', type, 0, 2, { hp: 99, maxHp: 99 });
  const d = put(game, 'p2', type, 0, 2, { hp: 1, maxHp: 1 });
  game.fight(game.players.p1, a, game.players.p2, d, false);
  game.debugSetCastleHp('p2', 1);
  assert.equal(log.filter((e) => e.event === 'coinsChanged' && ['kill', 'castleHalf'].includes(e.reason)).length, 0);
});
