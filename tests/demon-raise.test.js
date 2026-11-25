// 4陣営の魔族のパッシブ「死者を従える」（deck の passive.raiseOnKill）のテスト。
// CLAUDE.md「4陣営モード」の「魔族の死者を従える」。数値は data/ の調整で落ちないよう、このファイルで決める（本物のデータは最後に確かめる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { Monster } from '../js/game/Monster.js';
import { factionDecks, validatePassive } from '../js/game/Setup.js';
import { filterEventFor } from '../js/game/visibility.js';
import { loadFixture, seededRng, recordEvents, loadOptionalData, loadJson } from './helpers.js';

const ELEMENTS = loadOptionalData('factions').elements;
const PASSIVE = { raiseOnKill: { soldier: { name: '骸骨兵', hp: 2, attack: 2, speed: 2, element: 'dark' }, perTurn: 1 } };

const EXTRA = {
  striker: { name: '強兵', kind: 'soldier', hp: 9, attack: 5, speed: 1, count: 1 },
  weakling: { name: '弱兵', kind: 'soldier', hp: 3, attack: 1, speed: 1, count: 1 },
  bowman: { name: '弓兵', kind: 'soldier', role: 'archer', hp: 4, attack: 5, range: 2, stay: 5, count: 1 },
  ninja: { name: '忍者', kind: 'soldier', role: 'ninja', hp: 30, attack: 1, speed: 1, count: 1 },
  tap: { name: '火の粉', kind: 'spell', effect: 'singleDamage', amount: 9, count: 1 },
};

/** p1 が passive（既定は魔族）、p2 がふつうのデッキ。start() 済み（p1 のターン1） */
function setup({ passive = PASSIVE, p2Passive = undefined, rules: patch = {}, hands = {} } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, deckMode: 'own', ...patch };
  const decks = {
    demon: { name: '魔族', cards: { heal: 30 }, ...(passive ? { passive } : {}) },
    plain: { name: 'ふつう', cards: { heal: 30 }, ...(p2Passive ? { passive: p2Passive } : {}) },
  };
  const game = new Game({ cards, rules, rng: seededRng(5), elements: ELEMENTS, decks, setup: { decks: ['demon', 'plain'] } });
  game.debugSetHand('p1', hands.p1 ?? []);
  game.debugSetHand('p2', hands.p2 ?? []);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  /** pid の手札の type を出す（手番・枠は戻す）。出した兵士を返す */
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
  const events = (type) => log.filter((e) => e.event === type);
  const raised = () => events('soldierDeployed').filter((e) => e.raised);
  return { game, log, play, events, raised };
}

/** 道で向かい合わせる：p1 の兵士が position a、p2 の兵士が position b（自分の城から数えたマス） */
function face(p1s, a, p2s, b) {
  p1s.position = a;
  p2s.position = b;
}

test('戦いで敵を倒すと（攻める側）、骸骨兵が魔族の城の前に1体生まれる。getState に token と name', () => {
  const { game, play, raised, events } = setup({ hands: { p1: ['striker'], p2: ['weakling'] } });
  const a = play('p1', 'striker');
  const d = play('p2', 'weakling');
  face(a, 2, d, 1); // p1 のマス2、p2 のマス1 は道のマス3 → 隣り合う
  game.currentPlayer = 'p1';
  game.advanceSoldiers(game.players.p1);
  assert.equal(events('soldierDestroyed').find((e) => e.soldierId === d.soldierId)?.reason, 'killed');
  assert.equal(raised().length, 1);
  const e = raised()[0];
  assert.deepEqual([e.playerId, e.type, e.position, e.hp, e.attack, e.roadId, e.targetId, e.name], ['p1', 'raisedSoldier', 0, 2, 2, a.roadId, 'p2', '骸骨兵']);
  const st = game.getState('p2').players.p1.soldiers.find((s) => s.soldierId === e.soldierId);
  assert.deepEqual([st.token, st.name, st.element, st.hp, st.attack, st.position, st.roadId], [true, '骸骨兵', 'dark', 2, 2, 0, a.roadId]);
  // 倒した → 生まれる の順
  const order = events('soldierDestroyed').length;
  assert.ok(order >= 1);
  // 普通の兵士には token のキーがない
  assert.equal(Object.hasOwn(game.getState('p1').players.p1.soldiers.find((s) => s.soldierId === a.soldierId), 'token'), false);
});

test('生まれたターンは動かない（出したときと同じ）。次の自分のターンから進む', () => {
  const { game, play, raised } = setup({ hands: { p1: ['striker'], p2: ['weakling'] } });
  const a = play('p1', 'striker');
  const d = play('p2', 'weakling');
  face(a, 2, d, 1);
  game.currentPlayer = 'p1';
  game.advanceSoldiers(game.players.p1);
  const sk = game.players.p1.soldiers.find((s) => s.soldierId === raised()[0].soldierId);
  assert.equal(sk.position, 0, '同じ進軍では動かない');
  game.advanceSoldiers(game.players.p1);
  assert.equal(sk.position, 2, '次の進軍で速さ2');
});

test('射撃（弓兵）で敵を倒しても生まれる', () => {
  const { game, play, raised } = setup({ hands: { p1: ['bowman'], p2: ['weakling'] } });
  const b = play('p1', 'bowman');
  const d = play('p2', 'weakling');
  d.position = 3; // p1 から見て道のマス1（射程2の中）
  game.currentPlayer = 'p1';
  game.shoot(game.players.p1, b);
  assert.equal(game.players.p2.soldiers.length, 0);
  assert.equal(raised().length, 1);
});

test('守る側で倒しても生まれる（相手が攻めてきて、魔族の兵士がぶつかった相手を倒す）', () => {
  const { game, play, raised } = setup({ hands: { p1: ['striker'], p2: ['weakling'] } });
  const a = play('p1', 'striker');
  const d = play('p2', 'weakling');
  face(a, 2, d, 1);
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2); // p2 が攻める側。p1 の強兵が守る側として倒す
  assert.equal(game.players.p2.soldiers.length, 0);
  assert.equal(raised().length, 1);
  assert.equal(raised()[0].playerId, 'p1');
});

test('魔法・毒で倒れたときは生まれない', () => {
  const { game, play, raised, events } = setup({ hands: { p1: ['tap'], p2: ['weakling', 'weakling'] } });
  const w1 = play('p2', 'weakling');
  const w2 = play('p2', 'weakling');
  game.currentPlayer = 'p1';
  game.players.p1.playedThisTurn = false;
  const r = game.playCard(game.players.p1.hand[0].cardId, { soldierId: w1.soldierId });
  assert.equal(r.ok, true, r.reason);
  assert.equal(events('soldierDestroyed').filter((e) => e.reason === 'killed').length, 1);
  w2.poison = { amount: 5, turns: 2 };
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2);
  assert.equal(game.players.p2.soldiers.length, 0, '毒で倒れた');
  assert.equal(raised().length, 0);
});

test('魔物を倒したときは生まれない（兵士の戦いでも、射撃でも）', () => {
  const MONSTERS = { slime: { name: 'スライム', hp: 1, attack: 1, castleAttack: 1, attackEvery: 3, weight: 1, reward: 1, element: null } };
  const make = () => {
    const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
    const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, deckMode: 'own', monsterSpawnChance: 0 };
    const decks = { demon: { name: '魔族', cards: { heal: 30 }, passive: PASSIVE }, plain: { name: 'ふつう', cards: { heal: 30 } } };
    const game = new Game({ cards, rules, rng: seededRng(5), elements: ELEMENTS, decks, monsters: MONSTERS, setup: { decks: ['demon', 'plain'] } });
    game.debugSetHand('p1', ['striker', 'bowman']);
    const log = recordEvents(game, EVENT_TYPES);
    game.start();
    const put = () => {
      const m = new Monster('m01', 'slime', MONSTERS.slime, game.roads[0].roadId, game.middleSquare());
      game.monsters.push(m);
      return m;
    };
    const deploy = (type) => {
      const card = game.players.p1.hand.find((c) => c.type === type);
      game.players.p1.playedThisTurn = false;
      game.players.p1.soldiersPlayedThisTurn = 0;
      assert.equal(game.playCard(card.cardId).ok, true);
      return game.players.p1.soldiers.at(-1);
    };
    return { game, log, put, deploy };
  };
  // 兵士が魔物と戦って倒す
  const f = make();
  const a = f.deploy('striker');
  const m = f.put();
  a.position = 1;
  f.game.advanceSoldiers(f.game.players.p1);
  assert.equal(f.log.some((e) => e.event === 'monsterDefeated'), true, '魔物を倒した');
  assert.equal(f.log.some((e) => e.event === 'soldierDeployed' && e.raised), false);
  assert.equal(m.isDead, true);
  // 弓兵が魔物を撃って倒す
  const g = make();
  const b = g.deploy('bowman');
  g.put();
  g.game.shoot(g.game.players.p1, b);
  assert.equal(g.log.some((e) => e.event === 'monsterDefeated'), true, '魔物を撃ち倒した');
  assert.equal(g.log.some((e) => e.event === 'soldierDeployed' && e.raised), false);
});

test('1ターン（通算ターン）に1回まで。ターンが変われば、また生まれる', () => {
  const { game, play, raised } = setup({ hands: { p1: ['striker', 'striker'], p2: ['weakling', 'weakling'] } });
  const a1 = play('p1', 'striker');
  const a2 = play('p1', 'striker');
  const d1 = play('p2', 'weakling');
  const d2 = play('p2', 'weakling');
  face(a1, 2, d1, 1);
  face(a2, 2, d2, 1);
  game.currentPlayer = 'p1';
  game.advanceSoldiers(game.players.p1);
  assert.equal(game.players.p2.soldiers.length, 0, '2体とも倒した');
  assert.equal(raised().length, 1, '同じターンは1体だけ');
  // 次のターン：もう1回起きる
  const { game: g2, play: play2, raised: raised2 } = setup({ hands: { p1: ['striker', 'striker'], p2: ['weakling', 'weakling'] } });
  const b1 = play2('p1', 'striker');
  const b2 = play2('p1', 'striker');
  const e1 = play2('p2', 'weakling');
  const e2 = play2('p2', 'weakling');
  face(b1, 2, e1, 1);
  b2.position = 0;
  e2.position = 0; // 道の向こうはし。まだ遠い
  g2.currentPlayer = 'p1';
  g2.advanceSoldiers(g2.players.p1);
  assert.equal(raised2().length, 1);
  g2.turn += 1;
  face(b2, 2, e2, 1);
  g2.advanceSoldiers(g2.players.p1);
  assert.equal(raised2().length, 2, '通算ターンが変われば、また生まれる');
});

test('perTurn を2にすると、1ターンに2体まで', () => {
  const two = { raiseOnKill: { ...PASSIVE.raiseOnKill, perTurn: 2 } };
  const { game, play, raised } = setup({ passive: two, hands: { p1: ['striker', 'striker'], p2: ['weakling', 'weakling'] } });
  const a1 = play('p1', 'striker');
  const a2 = play('p1', 'striker');
  const d1 = play('p2', 'weakling');
  const d2 = play('p2', 'weakling');
  face(a1, 2, d1, 1);
  face(a2, 2, d2, 1);
  game.currentPlayer = 'p1';
  game.advanceSoldiers(game.players.p1);
  assert.equal(raised().length, 2);
});

test('骸骨兵（トークン）が倒した敵では生まれない（連鎖を断つ）。倒れた骸骨兵は蘇生の記録に残らない', () => {
  const { game, play, raised } = setup({ hands: { p1: ['striker'], p2: ['weakling', 'weakling', 'striker'] } });
  const a = play('p1', 'striker');
  const d = play('p2', 'weakling');
  face(a, 2, d, 1);
  game.currentPlayer = 'p1';
  game.advanceSoldiers(game.players.p1);
  const sk = game.players.p1.soldiers.find((s) => s.token);
  assert.ok(sk);
  // 骸骨兵が、次のターンに敵の弱兵を倒す → 生まれない
  game.turn += 1;
  const d2 = play('p2', 'weakling');
  sk.position = 2;
  sk.baseAttack = 9;
  d2.position = 1;
  game.currentPlayer = 'p1';
  game.advanceSoldiers(game.players.p1, [sk]);
  assert.equal(game.players.p2.soldiers.includes(d2), false, '骸骨兵が敵を倒した');
  assert.equal(raised().length, 1, '連鎖しない');
  // 骸骨兵が倒れても lastFallen には残らない
  game.players.p1.lastFallen = null;
  const big = play('p2', 'striker');
  big.baseAttack = 99;
  big.position = 3;
  sk.position = 0;
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2, [big]);
  assert.equal(game.players.p1.soldiers.includes(sk), false, '骸骨兵が倒れた');
  assert.equal(game.players.p1.lastFallen, null, '蘇生の記録に残らない');
});

test('魔族でない陣営（パッシブなし・p2）では起きない。パッシブの定義がないゲームでも起きない', () => {
  const { game, play, raised } = setup({ hands: { p1: ['weakling'], p2: ['striker'] } });
  const w = play('p1', 'weakling');
  const s = play('p2', 'striker');
  face(w, 1, s, 2);
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2); // p2（パッシブなし）が p1 の兵士を倒す
  assert.equal(game.players.p1.soldiers.includes(w), false);
  assert.equal(raised().length, 0, 'p2 には生まれない');
  const none = setup({ passive: null, hands: { p1: ['striker'], p2: ['weakling'] } });
  const a = none.play('p1', 'striker');
  const d = none.play('p2', 'weakling');
  face(a, 2, d, 1);
  none.game.currentPlayer = 'p1';
  none.game.advanceSoldiers(none.game.players.p1);
  assert.equal(none.raised().length, 0);
});

test('忍者（見えない兵士）は戦いも射撃も受けないので、忍者を倒して生まれることはない。生まれた骸骨兵のイベントは両方に見える', () => {
  const { game, play, raised } = setup({ hands: { p1: ['bowman', 'striker'], p2: ['ninja', 'weakling'] } });
  const b = play('p1', 'bowman');
  const n = play('p2', 'ninja');
  n.position = 3;
  game.currentPlayer = 'p1';
  game.shoot(game.players.p1, b);
  assert.equal(game.players.p2.soldiers.includes(n), true, '忍者は撃たれない');
  assert.equal(raised().length, 0);
  // 敵の弱兵を倒して生まれたイベントは、どちらの陣地にも送られる（stealth が付かない）
  const a = play('p1', 'striker');
  const d = play('p2', 'weakling');
  face(a, 2, d, 1);
  game.advanceSoldiers(game.players.p1, [a]);
  const e = raised()[0];
  assert.ok(e, '生まれた');
  assert.equal(Object.hasOwn(e, 'stealth'), false);
  const { event, ...payload } = e;
  assert.notEqual(filterEventFor('soldierDeployed', payload, 'p1', 'p1'), null);
  assert.notEqual(filterEventFor('soldierDeployed', payload, 'p2', 'p2'), null);
});

test('データのチェック：passive の書き間違いは new Game() でエラー。factionDecks は passive をデッキに写す', () => {
  const bad = (patch) => ({ raiseOnKill: { ...PASSIVE.raiseOnKill, ...patch } });
  assert.throws(() => setup({ passive: bad({ perTurn: 0 }) }), /perTurn/);
  assert.throws(() => setup({ passive: bad({ perTurn: 1.5 }) }), /perTurn/);
  assert.throws(() => setup({ passive: bad({ soldier: { ...PASSIVE.raiseOnKill.soldier, hp: 0 } }) }), /hp/);
  assert.throws(() => setup({ passive: bad({ soldier: { ...PASSIVE.raiseOnKill.soldier, attack: -1 } }) }), /attack/);
  assert.throws(() => setup({ passive: bad({ soldier: { ...PASSIVE.raiseOnKill.soldier, speed: 'x' } }) }), /speed/);
  assert.throws(() => setup({ passive: bad({ soldier: { ...PASSIVE.raiseOnKill.soldier, name: '' } }) }), /name/);
  assert.throws(() => setup({ passive: bad({ soldier: { ...PASSIVE.raiseOnKill.soldier, element: 'nothing' } }) }), /element/);
  assert.throws(() => setup({ passive: { somethingElse: {} } }), /知らないパッシブ/);
  assert.throws(() => setup({ passive: [] }), /passive/);
  assert.throws(() => validatePassive({ raiseOnKill: { perTurn: 1 } }, ['dark'], 'x'), /soldier/);
  validatePassive({ raiseOnKill: { perTurn: 1, soldier: { name: 'a', hp: 1, attack: 1, speed: 1 } } }, ['dark'], 'x'); // element は省略できる
  const decks = factionDecks({ a: { name: 'A', passive: PASSIVE }, b: { name: 'B' } }, { a: { x: { count: 1 } }, b: { x: { count: 1 } } });
  assert.deepEqual(decks.a.passive, PASSIVE);
  assert.equal(Object.hasOwn(decks.b, 'passive'), false);
});

test('本物のデータ：魔族だけが死者を従える（骸骨兵 HP2・攻撃2・速さ2・闇）', () => {
  const factions = loadJson('factions/factions.json');
  assert.deepEqual(factions.demon.passive.raiseOnKill, { soldier: { name: '骸骨兵', hp: 2, attack: 2, speed: 2, element: 'dark' }, perTurn: 1 });
  for (const f of ['kingdom', 'forest', 'dragon']) assert.equal(factions[f].passive, undefined, f);
});
