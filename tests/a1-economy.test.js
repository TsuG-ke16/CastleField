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

// ================= 経済のカード（段階5） =================

const ECON = ['classic_econ_tax', 'classic_econ_trade', 'classic_econ_gold_mine', 'classic_econ_plunder', 'classic_econ_invest', 'classic_econ_treasure'];
/** p1 のターンで、手札を types にし、MP を満タン・コインのカードの枚数を0に戻して1枚出す */
function playEcon(game, type, target) {
  const p1 = game.players.p1;
  game.debugSetHand('p1', [type]);
  p1.mp = 20;
  p1.coinCardsPlayedThisTurn = 0;
  return game.playCard(p1.hand[0].cardId, target);
}
/** p1 → p2 → p1 のターンに進める（手札があふれたら捨てる） */
function nextOwnTurn(game) {
  for (let i = 0; i < 2; i++) {
    game.endTurn();
    if (game.phase === 'discard') game.discard(game.players[game.currentPlayer].hand.slice(0, game.discardCount).map((c) => c.cardId));
  }
  assert.equal(game.currentPlayer, 'p1');
}

test('A1 経済のカード：6種がクラシック（山札80枚のまま）と4陣営（各陣営2種）にあり、economy: true・slot "support"', () => {
  const { cards } = buildData({ mode: 'classic' });
  assert.equal(Object.values(cards).reduce((n, d) => n + d.count, 0), 80);
  for (const t of ECON) {
    assert.equal(cards[t].economy, true, t);
    assert.ok(cards[t].count >= 1, t);
  }
  const { game } = modeGame();
  for (const t of ECON) assert.equal(game.createCard(t).slot, 'support', t);
  const fac = buildData({ mode: 'factions' }).cards;
  for (const f of ['king', 'forest', 'demon', 'dragon']) {
    const eco = Object.entries(fac).filter(([k, d]) => k.startsWith(`fac_${f}_`) && d.economy);
    assert.equal(eco.length, 2, f);
  }
});

test('A1 経済のカード：徴税+3・貿易（MP3）+5・宝探し（サイコロの目）。コインのカードは1ターン coinCardsPerTurn 枚まで', () => {
  const { game, cards, rules } = modeGame();
  const p1 = game.players.p1;
  let c = p1.coins;
  assert.equal(playEcon(game, 'classic_econ_tax').ok, true);
  assert.equal(p1.coins - c, cards.classic_econ_tax.amount);
  c = p1.coins;
  assert.equal(playEcon(game, 'classic_econ_trade').ok, true);
  assert.equal(p1.coins - c, cards.classic_econ_trade.amount);
  assert.equal(p1.mp, 20 - cards.classic_econ_trade.mpCost);
  c = p1.coins;
  game.rng = () => 0.5; // 目は4
  assert.equal(playEcon(game, 'classic_econ_treasure').ok, true);
  assert.equal(p1.coins - c, 4);
  assert.equal(p1.mp, 20 - cards.classic_econ_treasure.mpCost, '宝探しは mpCost を使う');
  // 1ターンの枚数
  game.debugSetHand('p1', ['classic_econ_tax', 'classic_econ_tax']);
  p1.coinCardsPlayedThisTurn = 0;
  assert.equal(game.playCard(p1.hand[0].cardId).ok, true);
  const second = game.canPlayCard(p1.hand[0].cardId);
  assert.equal(second.ok, rules.coinCardsPerTurn === 0 || rules.coinCardsPerTurn >= 2);
});

test('A1 経済のカード：金鉱は次の自分のターンから3回+2、投資はコイン3を払って3回あとのターンに+6', () => {
  const { game, cards, log } = modeGame();
  const p1 = game.players.p1;
  const mine = cards.classic_econ_gold_mine;
  const inv = cards.classic_econ_invest;
  assert.equal(playEcon(game, 'classic_econ_gold_mine').ok, true);
  p1.coins = inv.cost;
  assert.equal(playEcon(game, 'classic_econ_invest').ok, true);
  assert.equal(p1.coins, 0);
  assert.deepEqual(game.getState('p2').players.p1.economy, { mines: [{ amount: mine.amount, turns: mine.turns }], investments: [{ amount: inv.amount, turns: inv.turns }] });
  const paid = (reason) => log.filter((e) => e.event === 'coinsChanged' && e.playerId === 'p1' && e.reason === reason).map((e) => e.delta);
  for (let t = 1; t <= 4; t++) {
    nextOwnTurn(game);
    assert.equal(paid('mine').length, Math.min(t, mine.turns), `金鉱 ${t}`);
    assert.equal(paid('invest').filter((d) => d > 0).length, t >= inv.turns ? 1 : 0, `投資 ${t}`);
  }
  assert.deepEqual(paid('mine'), Array(mine.turns).fill(mine.amount));
  assert.deepEqual(paid('invest'), [-inv.cost, inv.amount]);
  assert.deepEqual(game.getState('p1').players.p1.economy, { mines: [], investments: [] });
  // コインが足りなければ投資は出せない
  p1.coins = inv.cost - 1;
  game.debugSetHand('p1', ['classic_econ_invest']);
  p1.coinCardsPlayedThisTurn = 0;
  assert.equal(game.canPlayCard(p1.hand[0].cardId).ok, false);
});

test('A1 経済のカード：略奪は相手のコインを2枚まで（コインのない相手には出せない）', () => {
  const { game, cards } = modeGame();
  const [p1, p2] = [game.players.p1, game.players.p2];
  p2.coins = 0;
  game.debugSetHand('p1', ['classic_econ_plunder']);
  assert.equal(game.canPlayCard(p1.hand[0].cardId).ok, false);
  p2.coins = 1;
  const c = p1.coins;
  assert.equal(playEcon(game, 'classic_econ_plunder', { playerId: 'p2' }).ok, true);
  assert.deepEqual([p1.coins - c, p2.coins], [1, 0]);
  p2.coins = 10;
  assert.equal(playEcon(game, 'classic_econ_plunder', { playerId: 'p2' }).ok, true);
  assert.equal(p2.coins, 10 - cards.classic_econ_plunder.amount);
});

test('A1 経済のカード：CPU（smart）が使う（クラシック・4陣営）', async () => {
  const { runMatch } = await import('./sim/sim.js');
  for (const mode of ['classic', 'factions']) {
    const { cards, rules } = buildData({ mode });
    const gameOptions = loadOptionalData(mode);
    let used = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const r = runMatch({ cards, rules, gameOptions, strategies: ['smart', 'smart'], seed });
      used += Object.entries(r.played).filter(([t]) => cards[t]?.economy).reduce((n, [, v]) => n + v, 0);
      assert.ok(r.winner, `${mode} seed ${seed} 決着`);
    }
    assert.ok(used > 0, `${mode}：経済のカードを使った`);
  }
});

// ================= 攻撃の魔法は1ターン2回（段階6） =================

test('A1：攻撃の魔法は1ターン attackSpellsPerTurn 回まで。回復・経済のカードは数えない。次のターンに戻る', () => {
  const { game, rules } = modeGame();
  const p1 = game.players.p1;
  assert.equal(rules.attackSpellsPerTurn, 2);
  assert.equal(game.getState('p1').attackSpellsPerTurn, 2);
  const foes = [0, 1, 2].map((r) => put(game, 'p2', 'classic_king_heavy', r, 0));
  game.debugSetHand('p1', [SHADOW, SHADOW, SHADOW, 'classic_king_minor_heal', 'classic_king_heal', 'classic_econ_tax']);
  p1.mp = 20;
  p1.castle.hp = 10;
  const of = (type) => p1.hand.find((c) => c.type === type).cardId;
  assert.equal(game.playCard(of(SHADOW), { soldierId: foes[0].soldierId }).ok, true);
  assert.equal(game.playCard(of('classic_king_minor_heal')).ok, true, '回復は数えない');
  assert.equal(game.playCard(of(SHADOW), { soldierId: foes[1].soldierId }).ok, true, '2回目');
  assert.equal(p1.attackSpellsThisTurn, 2);
  assert.match(game.canPlayCard(of(SHADOW)).reason, /攻撃の魔法は2回まで/);
  assert.equal(game.playCard(of('classic_king_heal')).ok, true, '回復は何枚でも');
  assert.equal(game.playCard(of('classic_econ_tax')).ok, true, '経済のカードは数えない');
  assert.equal(game.getState('p1').players.p1.attackSpellsThisTurn, 2);
  nextOwnTurn(game);
  assert.equal(p1.attackSpellsThisTurn, 0);
  assert.equal(game.canPlayCard(of(SHADOW)).ok, true);
});

test('A1：スキルの追加の詠唱（M02 やまびこ）は攻撃の魔法の回数に数えない', async () => {
  const { createSkillQa } = await import('../js/game/skills/qa.js');
  const { cards, rules } = buildData({ mode: 'classic', rules: { mulligan: false, monsterSpawnChance: 0, defenseReaction: false } });
  const opts = loadOptionalData('classic');
  delete opts.stages;
  delete opts.weather;
  const qa = createSkillQa(opts.skillTree);
  const game = new Game(qa.apply({ ...opts, cards, rules, rng: () => 0 }, [['M01', 'M02'], []]));
  game.start();
  const p1 = game.players.p1;
  const foe = put(game, 'p2', 'classic_king_heavy', 0, 0, { hp: 30, maxHp: 30 });
  game.debugSetHand('p1', [SHADOW, SHADOW, SHADOW]);
  p1.mp = 20;
  for (let i = 0; i < 2; i++) assert.equal(game.playCard(p1.hand[0].cardId, { soldierId: foe.soldierId }).ok, true);
  assert.ok(game.skillCounters('p1').M02 >= 1, 'やまびこが起きた');
  assert.equal(p1.attackSpellsThisTurn, 2, '手札から使った2回だけ');
  assert.equal(game.canPlayCard(p1.hand[0].cardId).ok, false);
});

test('A1：通常モードは今までどおり「メインは1ターン1枚」', () => {
  const { cards, rules } = buildData({ rules: { mulligan: false } });
  assert.equal(rules.attackSpellsPerTurn, undefined);
  const game = new Game({ cards, rules, rng: () => 0.5 });
  game.start();
  assert.equal(game.getState('p1').attackSpellsPerTurn, undefined);
  const spell = Object.keys(cards).find((k) => cards[k].effect === 'damageEnemyCastle');
  game.debugSetHand('p1', [spell, spell]);
  const p1 = game.players.p1;
  p1.mp = game.maxMpOf(p1);
  const r = game.playCard(p1.hand[0].cardId, { playerId: 'p2' });
  assert.equal(r.ok, true, r.reason);
  if (game.phase === 'defend') game.passDefense();
  assert.match(game.canPlayCard(p1.hand[0].cardId).reason, /メインのカードを出しました/);
});
