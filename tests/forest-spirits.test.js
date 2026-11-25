// 4陣営の森の同盟：常時の精霊（陣営の特性 passiveSpirits）と、反応の継続ダメージ（砂・凍傷）のテスト。
// CLAUDE.md「4陣営モード」の「森の常時の精霊」。数値は data/ の調整で落ちないよう、このファイルで決める（本物のデータは最後に確かめる）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { factionDecks, validatePassiveSpirits } from '../js/game/Setup.js';
import { validateReactions, elementIds } from '../js/game/Elements.js';
import { loadFixture, seededRng, recordEvents, buildData, loadOptionalData, loadJson } from './helpers.js';

const ELEMENTS = loadOptionalData('factions').elements;

const SPIRITS = {
  attachTurns: 1,
  spirits: [
    { spirit: 'fire', name: 'イフリート', element: 'fire', effect: 'castleDamage', amount: 3 },
    { spirit: 'water', name: 'ウンディーネ', element: 'water', effect: 'soldiersDamage', amount: 1 },
    { spirit: 'wind', name: 'シルフ', element: 'wind', effect: 'pushFront', push: 1, amount: 2 },
    { spirit: 'earth', name: 'タイタン', element: 'earth', effect: 'castleDamage', amount: 7 },
  ],
};

const EXTRA = {
  tank: { name: '大盾兵', kind: 'soldier', hp: 30, attack: 1, speed: 1, count: 1 },
  fragile: { name: '小兵', kind: 'soldier', hp: 1, attack: 1, speed: 1, count: 1 },
  ninja: { name: '忍者', kind: 'soldier', role: 'ninja', hp: 30, attack: 1, speed: 1, count: 1 },
  fireTap: { name: '火の粉', kind: 'spell', effect: 'singleDamage', element: 'fire', amount: 1, count: 1 },
  windTap: { name: '風の粉', kind: 'spell', effect: 'singleDamage', element: 'wind', amount: 1, count: 1 },
  earthTap: { name: '土の粉', kind: 'spell', effect: 'singleDamage', element: 'earth', amount: 1, count: 1 },
  darkTap: { name: '闇の粉', kind: 'spell', effect: 'singleDamage', element: 'dark', amount: 1, count: 1 },
  iceTap: { name: '氷の粉', kind: 'spell', effect: 'singleDamage', element: 'ice', amount: 1, count: 1 },
  purify: { name: '浄化', kind: 'spell', effect: 'purifyFlare', amount: 1, count: 1 },
};

const REACTIONS = {
  attachTurns: 3,
  reactions: {
    evaporate: { name: '蒸発', elements: ['fire', 'water'], damage: 2 },
    sandstorm: { name: '砂嵐', elements: ['wind', 'earth'], damage: 0, blind: { chance: 0.4, turns: 2 }, dot: { status: 'sand', amount: 1, turns: 2 } },
    blackIce: { name: '黒氷', elements: ['dark', 'ice'], damage: 0, frozenTurns: 1, dot: { status: 'frostbite', amount: 1, turns: 2 } },
  },
};

/**
 * p1 が森（常時の精霊）、p2 がふつうのデッキ。start() の前で返す（startGame で始める）。
 * play(pid, type, target) は手札から出す（手番・枠を戻す）
 */
function setup({ hands = {}, reactions = REACTIONS, spirits = SPIRITS, rules: patch = {} } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 30, deckMode: 'own', ...patch };
  const decks = {
    forest: { name: '森', cards: { heal: 30 }, ...(spirits ? { passiveSpirits: spirits } : {}) },
    plain: { name: 'ふつう', cards: { heal: 30 } },
  };
  const game = new Game({ cards, rules, rng: seededRng(5), elements: ELEMENTS, decks, setup: { decks: ['forest', 'plain'] }, ...(reactions ? { reactions } : {}) });
  game.debugSetHand('p1', hands.p1 ?? []);
  game.debugSetHand('p2', hands.p2 ?? []);
  const log = recordEvents(game, EVENT_TYPES);
  const play = (pid, type, target) => {
    if (game.phase === 'ready') game.start();
    game.currentPlayer = pid;
    const p = game.players[pid];
    p.playedThisTurn = false;
    p.soldiersPlayedThisTurn = 0;
    const card = p.hand.find((c) => c.type === type);
    assert.ok(card, `${pid} の手札に ${type} がある`);
    const r = game.playCard(card.cardId, target);
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
    return game.players[pid].soldiers.at(-1);
  };
  const events = (type) => log.filter((e) => e.event === type);
  /** p1 の精霊を、次に spirit が動くようにして1回動かす */
  const act = (spirit) => {
    const p1 = game.players.p1;
    p1.passiveSpiritIndex = p1.passiveSpirits.spirits.findIndex((x) => x.spirit === spirit);
    log.length = 0;
    return game.actPassiveSpirit(p1);
  };
  return { game, log, play, events, act };
}

test('常時の精霊：自分のターンの始めに 火 → 水 → 風 → 土 → 火 の順に1体ずつ動く（コイン・MP のあと、ドローの前）。getState に次の精霊', () => {
  const { game, log } = setup({ rules: { coinPerTurn: 1 } });
  const st0 = game.getState('p1');
  assert.deepEqual(st0.players.p1.passiveSpirit, { next: 'fire', name: 'イフリート', element: 'fire', effect: 'castleDamage', amount: 3, order: ['fire', 'water', 'wind', 'earth'], everyTurns: 1, turnsUntilAct: 1 });
  assert.equal(st0.players.p2.passiveSpirit, null, '持っていない人は null');
  game.start();
  const seen = [];
  for (let i = 0; i < 10; i++) {
    if (game.phase === 'gameOver') break;
    game.endTurn();
  }
  for (const e of log) if (e.event === 'passiveSpiritActed') seen.push([e.playerId, e.spirit]);
  assert.deepEqual(seen.slice(0, 5), [['p1', 'fire'], ['p1', 'water'], ['p1', 'wind'], ['p1', 'earth'], ['p1', 'fire']]);
  assert.ok(seen.every(([pid]) => pid === 'p1'), '森でない人の精霊は動かない');
  // 1ターン目：turnStarted → coinsChanged → passiveSpiritActed → castleDamaged → cardDrawn
  const first = log.slice(0, log.findIndex((e) => e.event === 'cardDrawn') + 1).map((e) => e.event);
  assert.deepEqual(first.filter((t) => ['turnStarted', 'coinsChanged', 'passiveSpiritActed', 'castleDamaged', 'cardDrawn'].includes(t)), ['turnStarted', 'coinsChanged', 'passiveSpiritActed', 'castleDamaged', 'cardDrawn']);
  assert.equal(game.getState('p1').players.p1.passiveSpirit.next, ['fire', 'water', 'wind', 'earth'][seen.length % 4]);
});

test('精霊の動く間隔（everyTurns）：自分の2ターンに1回動く（1ターン目に動く）。順番は動いたときだけ進む。getState に turnsUntilAct', () => {
  const { game, log } = setup({ spirits: { ...SPIRITS, everyTurns: 2 } });
  const ps = () => game.getState('p1').players.p1.passiveSpirit;
  assert.deepEqual([ps().next, ps().everyTurns, ps().turnsUntilAct], ['fire', 2, 1]);
  game.start(); // p1 の1ターン目：火が動く
  const acted = () => log.filter((e) => e.event === 'passiveSpiritActed').map((e) => e.spirit);
  assert.deepEqual(acted(), ['fire']);
  assert.deepEqual([ps().next, ps().turnsUntilAct], ['water', 2]);
  game.endTurn(); // p2
  game.endTurn(); // p1 の2ターン目：休む
  assert.deepEqual(acted(), ['fire']);
  assert.deepEqual([ps().next, ps().turnsUntilAct], ['water', 1]);
  game.endTurn();
  game.endTurn(); // p1 の3ターン目：水が動く
  assert.deepEqual(acted(), ['fire', 'water']);
  assert.deepEqual([ps().next, ps().turnsUntilAct], ['wind', 2]);
  for (let i = 0; i < 6; i++) game.endTurn(); // p1 の4・5・6ターン目
  assert.deepEqual(acted(), ['fire', 'water', 'wind']);
  assert.throws(() => setup({ spirits: { ...SPIRITS, everyTurns: 0 } }), /everyTurns/);
});

test('everyTurns を省略すると毎ターン（turnsUntilAct はいつも1）', () => {
  const { game } = setup();
  game.start();
  game.endTurn();
  game.endTurn();
  const ps = game.getState('p1').players.p1.passiveSpirit;
  assert.deepEqual([ps.next, ps.everyTurns, ps.turnsUntilAct], ['wind', 1, 1]);
});

test('常時の精霊を持つ人がいないゲームでは、getState に passiveSpirit のキーがない', () => {
  const { game } = setup({ spirits: null });
  assert.equal(Object.hasOwn(game.getState('p1').players.p1, 'passiveSpirit'), false);
});

test('イフリート（火）：敵城に3（城壁が先に受ける）。敵の兵士がいなくても入る', () => {
  const { game, act, events } = setup();
  game.start();
  const p2 = game.players.p2;
  p2.armor = 2;
  const hp = p2.castle.hp;
  act('fire');
  assert.equal(p2.castle.hp, hp - 1);
  assert.equal(p2.armor, 0);
  const e = events('passiveSpiritActed')[0];
  assert.deepEqual({ spirit: e.spirit, name: e.name, element: e.element, effect: e.effect, amount: e.amount, targetId: e.targetId }, { spirit: 'fire', name: 'イフリート', element: 'fire', effect: 'castleDamage', amount: 3, targetId: 'p2' });
  assert.deepEqual(events('castleDamaged')[0].source, { kind: 'passiveSpirit', spirit: 'fire' });
  assert.equal(events('defenseRequested').length, 0, '防御は聞かない');
});

test('タイタン（土）：敵城に7。城壁が先に受ける（イフリートと同じ）', () => {
  const { game, act, events } = setup();
  game.start();
  const p2 = game.players.p2;
  p2.armor = 5;
  const hp = p2.castle.hp;
  act('earth');
  assert.equal(p2.castle.hp, hp - 2);
  assert.equal(p2.armor, 0);
  assert.equal(events('castleDamaged')[0].blocked, 5);
  assert.equal(Object.hasOwn(events('castleDamaged')[0], 'ignoreArmor'), false);
});

test('ignoreArmor（仕組みは残す）：書いた精霊は城壁を無視する', () => {
  const spirits = { ...SPIRITS, spirits: SPIRITS.spirits.map((x) => (x.spirit === 'earth' ? { ...x, ignoreArmor: true } : x)) };
  const { game, act, events } = setup({ spirits });
  game.start();
  const p2 = game.players.p2;
  p2.armor = 5;
  const hp = p2.castle.hp;
  act('earth');
  assert.equal(p2.castle.hp, hp - 7);
  assert.equal(p2.armor, 5);
  assert.equal(events('castleDamaged')[0].ignoreArmor, true);
});

test('城の精霊で城が落ちたら、そのターンはそこで決着（ドローしない）', () => {
  const { game, events, log } = setup();
  game.debugSetCastleHp('p2', 3);
  game.start();
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, 'p1');
  assert.equal(events('cardDrawn').length, 0);
  assert.equal(log.at(-1).event, 'gameOver');
});

test('ウンディーネ（水）：敵の見える兵士全員に1（盾が先に受ける）→ 水が付着（残り1）。反応は起こさない', () => {
  const { game, play, act, events, log } = setup({ hands: { p2: ['tank', 'tank', 'shield'] } });
  const a = play('p2', 'tank');
  const b = play('p2', 'tank');
  play('p2', 'shield', { soldierId: b.soldierId });
  a.attachments = [{ element: 'fire', turns: 3 }]; // 火が付いていても、精霊の水では蒸発しない
  act('water');
  assert.equal(a.hp, 29);
  assert.equal(b.hp, 30);
  assert.equal(b.shield, 2);
  assert.deepEqual(events('passiveSpiritActed')[0].soldierIds, [a.soldierId, b.soldierId]);
  assert.ok(events('soldierDamaged').every((e) => e.cause === 'spirit'));
  assert.equal(events('reactionTriggered').length, 0);
  assert.deepEqual(a.attachments, [{ element: 'fire', turns: 3 }, { element: 'water', turns: 1 }]);
  const att = events('elementAttached');
  assert.deepEqual(att.map((e) => [e.soldierId, e.element, e.turns, e.source]), [[a.soldierId, 'water', 1, 'passiveSpirit'], [b.soldierId, 'water', 1, 'passiveSpirit']]);
  // 順番：passiveSpiritActed → soldierDamaged … → elementAttached …
  const order = log.map((e) => e.event).filter((t) => ['passiveSpiritActed', 'soldierDamaged', 'elementAttached'].includes(t));
  assert.deepEqual(order, ['passiveSpiritActed', 'soldierDamaged', 'soldierDamaged', 'elementAttached', 'elementAttached']);
});

test('精霊の属性が付いた兵士に、別の属性の魔法が当たると反応する。付着は持ち主の進軍のあとに消える', () => {
  const { game, play, act, events } = setup({ hands: { p1: ['fireTap'], p2: ['tank'] } });
  const t = play('p2', 'tank');
  act('water');
  play('p1', 'fireTap', { soldierId: t.soldierId });
  assert.equal(events('reactionTriggered')[0].reaction, 'evaporate');
  // もう一度：付着は1回で消える
  act('wind');
  assert.deepEqual(t.attachments, [{ element: 'wind', turns: 1 }]);
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2);
  assert.deepEqual(t.attachments, []);
  assert.equal(events('elementCleared').at(-1).reason, 'expired');
});

test('シルフ（風）：敵の先頭の見える兵士（自分の城にいちばん近い）を1マス押し戻して2。風はみんなに付く', () => {
  const { play, act, events, log } = setup({ hands: { p2: ['tank', 'tank', 'tank'] } });
  const a = play('p2', 'tank');
  const b = play('p2', 'tank');
  const c = play('p2', 'tank');
  a.position = 1;
  b.position = 3;
  c.position = 3; // 同じなら先に出された方（b）
  act('wind');
  assert.equal(b.position, 2);
  assert.equal(b.hp, 28);
  assert.equal(c.position, 3);
  assert.equal(c.hp, 30);
  assert.equal(a.hp, 30);
  const moved = events('soldierMoved')[0];
  assert.deepEqual([moved.soldierId, moved.from, moved.to, moved.cause], [b.soldierId, 3, 2, 'pushed']);
  assert.deepEqual(events('passiveSpiritActed')[0].soldierIds, [b.soldierId]);
  assert.equal(events('passiveSpiritActed')[0].push, 1);
  assert.deepEqual(events('elementAttached').map((e) => e.element), ['wind', 'wind', 'wind']);
  const order = log.map((e) => e.event).filter((t) => ['passiveSpiritActed', 'soldierMoved', 'soldierDamaged', 'elementAttached'].includes(t));
  assert.deepEqual(order.slice(0, 4), ['passiveSpiritActed', 'soldierMoved', 'soldierDamaged', 'elementAttached']);
});

test('シルフ（風）：先頭が城の前（マス0）なら下がらない（soldierMoved なし）が、ダメージは入る。倒れたらほかの兵士にだけ付く', () => {
  const { play, act, events } = setup({ hands: { p2: ['fragile', 'tank'] } });
  const f = play('p2', 'fragile');
  const t = play('p2', 'tank');
  f.position = 0;
  t.position = 0;
  act('wind');
  assert.equal(events('soldierMoved').length, 0);
  assert.equal(events('soldierDestroyed')[0].soldierId, f.soldierId);
  assert.deepEqual(events('elementAttached').map((e) => e.soldierId), [t.soldierId]);
});

test('敵の兵士がいなければ、水・風は何もしない（付着もなし）。passiveSpiritActed は出る', () => {
  const { act, events } = setup();
  for (const sp of ['water', 'wind']) {
    act(sp);
    assert.deepEqual(events('passiveSpiritActed')[0].soldierIds, []);
    assert.equal(events('soldierDamaged').length + events('elementAttached').length + events('soldierMoved').length, 0);
  }
});

test('忍者（見えない兵士）は、精霊のダメージ・押し戻し・付着の対象にならない', () => {
  const { play, act, events } = setup({ hands: { p2: ['ninja', 'tank'] } });
  const n = play('p2', 'ninja');
  const t = play('p2', 'tank');
  n.position = 4;
  act('water');
  assert.equal(n.hp, 30);
  assert.equal(t.hp, 29);
  act('wind');
  assert.equal(n.position, 4);
  assert.equal(t.hp, 27);
  act('fire');
  assert.deepEqual(n.attachments, []);
  assert.ok(events('elementAttached').every((e) => e.soldierId === t.soldierId));
});

test('reactions を渡さないゲームでは、精霊は動くが付着しない', () => {
  const { play, act, events } = setup({ reactions: null, hands: { p2: ['tank'] } });
  const t = play('p2', 'tank');
  act('water');
  assert.equal(t.hp, 29);
  assert.equal(events('elementAttached').length, 0);
});

test('身代わりがいれば、城への精霊の攻撃は身代わりの兵士が受ける', () => {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, decoy: { name: '身代わり', kind: 'defense', effect: 'guardCastle', count: 1 } };
  const rules = { ...loadFixture('rules.json'), maxHand: 30, deckMode: 'own' };
  const decks = { forest: { name: '森', cards: { heal: 30 }, passiveSpirits: SPIRITS }, plain: { name: 'ふつう', cards: { heal: 30 } } };
  const game = new Game({ cards, rules, rng: seededRng(5), elements: ELEMENTS, decks, setup: { decks: ['forest', 'plain'] } });
  game.debugSetHand('p2', ['tank', 'decoy']);
  game.start();
  game.currentPlayer = 'p2';
  game.playCard(game.players.p2.hand.find((c) => c.type === 'tank').cardId);
  const t = game.players.p2.soldiers[0];
  assert.equal(game.playCard(game.players.p2.hand.find((c) => c.type === 'decoy').cardId, { soldierId: t.soldierId }).ok, true);
  const hp = game.players.p2.castle.hp;
  game.players.p1.passiveSpiritIndex = 3;
  game.actPassiveSpirit(game.players.p1);
  assert.equal(game.players.p2.castle.hp, hp);
  assert.equal(t.hp, 23);
});

test('データのチェック：passiveSpirits の書き間違いは new Game() でエラー。factionDecks は passiveSpirits をデッキに写す', () => {
  const ids = elementIds(ELEMENTS);
  assert.doesNotThrow(() => validatePassiveSpirits(SPIRITS, ids, 'x'));
  const bad = (patch, re) => assert.throws(() => validatePassiveSpirits({ ...SPIRITS, spirits: [{ ...SPIRITS.spirits[0], ...patch }] }, ids, 'x'), re);
  bad({ effect: 'heal' }, /effect/);
  bad({ element: 'wood' }, /element/);
  bad({ amount: 0 }, /amount/);
  bad({ push: 1 }, /push/);
  bad({ ignoreArmor: 'yes' }, /ignoreArmor/);
  assert.throws(() => validatePassiveSpirits({ attachTurns: 0, spirits: SPIRITS.spirits }, ids, 'x'), /attachTurns/);
  assert.throws(() => validatePassiveSpirits({ attachTurns: 1, spirits: [SPIRITS.spirits[0], SPIRITS.spirits[0]] }, ids, 'x'), /spirit/);
  assert.throws(() => validatePassiveSpirits({ attachTurns: 1, spirits: [{ ...SPIRITS.spirits[2], push: undefined }] }, ids, 'x'), /push/);
  assert.throws(() => setup({ spirits: { attachTurns: 1, spirits: [] } }), /spirits/);
  const decks = factionDecks({ a: { name: 'A', passiveSpirits: SPIRITS }, b: { name: 'B' } }, { a: { x: { count: 1 } }, b: { x: { count: 1 } } });
  assert.deepEqual(decks.a.passiveSpirits, SPIRITS);
  assert.equal(Object.hasOwn(decks.b, 'passiveSpirits'), false);
});

// ================= 砂・凍傷（反応の継続ダメージ） =================

test('砂嵐：目くらまし40%＋砂（毎ターン1・2ターン。盾は効かない）。やけどにはならない', () => {
  const { game, play, events } = setup({ hands: { p1: ['windTap', 'earthTap'], p2: ['tank'] } });
  const t = play('p2', 'tank');
  play('p1', 'windTap', { soldierId: t.soldierId });
  play('p1', 'earthTap', { soldierId: t.soldierId });
  assert.equal(events('reactionTriggered')[0].reaction, 'sandstorm');
  assert.deepEqual(t.sand, { amount: 1, turns: 2 });
  assert.deepEqual(t.blinded, { chance: 0.4, turns: 2 });
  assert.equal(t.burn, null);
  const applied = events('statusApplied').find((e) => e.status === 'sand');
  assert.deepEqual([applied.amount, applied.turns], [1, 2]);
  assert.deepEqual(game.getState('p2').players.p2.soldiers[0].statuses.sand, { amount: 1, turns: 2 });
  assert.equal(game.getState('p2').players.p2.soldiers[0].statuses.frostbite, null);
  t.shield = 5;
  const hp = t.hp;
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2);
  const dmg = events('soldierDamaged').find((e) => e.cause === 'sand');
  assert.deepEqual([dmg.amount, dmg.blocked], [1, 0]);
  assert.equal(t.hp, hp - 1);
  assert.equal(t.shield, 5);
  game.advanceSoldiers(game.players.p2);
  assert.equal(t.hp, hp - 2);
  assert.equal(t.sand, null);
  assert.ok(events('statusCleared').some((e) => e.status === 'sand' && e.soldierId === t.soldierId));
});

test('黒氷：凍結1回＋凍傷（毎ターン1・2ターン）。やけどにはならない。浄化で治る', () => {
  const { game, play, events } = setup({ hands: { p1: ['darkTap', 'iceTap'], p2: ['tank', 'purify'] } });
  const t = play('p2', 'tank');
  play('p1', 'darkTap', { soldierId: t.soldierId });
  play('p1', 'iceTap', { soldierId: t.soldierId });
  assert.equal(events('reactionTriggered')[0].reaction, 'blackIce');
  assert.equal(t.frozen, 1);
  assert.deepEqual(t.frostbite, { amount: 1, turns: 2 });
  assert.equal(t.burn, null);
  const st = events('statusApplied').map((e) => e.status);
  assert.ok(st.indexOf('frozen') < st.indexOf('frostbite'), '凍結 → 凍傷の順');
  const hp = t.hp;
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2);
  assert.equal(t.hp, hp - 1);
  assert.equal(events('soldierDamaged').at(-1).cause, 'frostbite');
  play('p2', 'purify');
  assert.equal(t.frostbite, null);
  assert.ok(events('statusCleared').some((e) => e.status === 'frostbite'));
});

test('継続ダメージで倒れた兵士は動かない。dot の書き間違いはエラー', () => {
  const { game, play } = setup({ hands: { p2: ['fragile'] } });
  const f = play('p2', 'fragile');
  f.sand = { amount: 1, turns: 2 };
  game.currentPlayer = 'p2';
  game.advanceSoldiers(game.players.p2);
  assert.equal(game.players.p2.soldiers.length, 0);
  const ids = elementIds(ELEMENTS);
  assert.throws(() => validateReactions({ attachTurns: 1, reactions: { x: { name: 'x', elements: ['fire', 'water'], damage: 0, dot: { status: 'burn', amount: 1, turns: 1 } } } }, ids), /dot/);
  assert.throws(() => validateReactions({ attachTurns: 1, reactions: { x: { name: 'x', elements: ['fire', 'water'], damage: 0, dot: { status: 'sand', amount: 0, turns: 1 } } } }, ids), /dot/);
});

test('砂・凍傷を使わないゲーム（クラシック）の getState には statuses.sand / frostbite のキーがない', () => {
  const opts = loadOptionalData('classic');
  const { cards, rules } = buildData({ mode: 'classic' });
  const game = new Game({ cards, rules, rng: seededRng(1), ...opts });
  game.start();
  for (const p of Object.values(game.getState('p1').players)) for (const s of p.soldiers) assert.equal(Object.hasOwn(s.statuses, 'sand'), false);
  assert.equal(Object.values(opts.reactions.reactions).some((r) => r.dot), false);
});

// ================= 本物のデータ =================

test('本物のデータ：森の陣営は最初のターンにイフリートが敵城に4（調整で2から上げた）。森の属性の武器と魔法を出せる', () => {
  const { rules, cards } = buildData({ mode: 'factions' });
  const opts = loadOptionalData('factions');
  const game = new Game({ cards, rules: { ...rules, mulligan: false }, rng: seededRng(2), ...opts, setup: { decks: ['forest', 'kingdom'] } });
  const log = recordEvents(game, EVENT_TYPES);
  const hp = game.players.p2.castle.hp;
  game.start();
  const acted = log.find((e) => e.event === 'passiveSpiritActed');
  assert.equal(acted.name, 'イフリート');
  // 後攻の城壁（secondPlayerArmor）が先に受ける
  const dmg = log.find((e) => e.event === 'castleDamaged');
  assert.equal(dmg.amount, 4);
  assert.equal(game.players.p2.castle.hp, hp - (4 - dmg.blocked));
  assert.equal(game.getState('p1').players.p1.passiveSpirit.next, 'water');
  assert.equal(game.getState('p1').players.p2.passiveSpirit, null);
  // 武器（属性つき・MP2）と改名した魔法（MP3）
  game.debugSetHand('p1', ['fac_forest_beastman', 'fac_forest_flame_sword', 'fac_forest_flare_seed']);
  game.players.p1.mp = 20;
  const hand = () => game.players.p1.hand;
  const beast = hand().find((c) => c.type === 'fac_forest_beastman').cardId;
  assert.equal(game.playCard(beast, game.getTargets(beast)[0]).ok, true);
  const s = game.players.p1.soldiers[0];
  assert.equal(game.playCard(hand().find((c) => c.type === 'fac_forest_flame_sword').cardId, { soldierId: s.soldierId }).ok, true);
  assert.equal(s.element, 'fire');
  assert.equal(game.players.p1.mp, 20 - 2 - 2);
  assert.equal(game.getState('p1').mpCosts.fac_forest_flare_seed, 3);
  assert.equal(loadJson('rules.json').deckMode !== 'own', true);
});
