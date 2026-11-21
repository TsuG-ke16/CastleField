// クラシックの属性の付着と反応（PR3b）のテスト：
//   new Game({ reactions }) を渡すと、属性つきの攻撃が兵士に当たったときに属性が付着し、
//   付いている属性と組になる攻撃が当たると反応（対消滅・黒氷・砕氷・混沌反応）が起こる。
//   渡さなければ（通常モード）何も起きない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { validateReactions, elementIds } from '../js/game/Elements.js';
import { canReact, STRATEGIES } from '../js/game/strategies.js';
import { loadFixture, seededRng, recordEvents, buildData, loadOptionalData, PLAIN_START } from './helpers.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readClassic = (name) => JSON.parse(readFileSync(join(ROOT, 'data', 'classic', name), 'utf8'));

// テスト用の数値（data/classic/reactions.json の調整でテストが落ちないよう、ここで決める）
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
  // 打たれ強い兵士（ダメージを数えやすいように）
  tank: { name: '大盾兵', kind: 'soldier', hp: 60, attack: 1, speed: 1, count: 1 },
  ninjaT: { name: '忍者', kind: 'soldier', role: 'ninja', hp: 5, attack: 1, speed: 1, count: 1 },
  lightBlade: { name: '光の剣', kind: 'weapon', attackBonus: 2, element: 'light', count: 1 },
  darkBlade: { name: '闇の剣', kind: 'weapon', attackBonus: 2, element: 'dark', count: 1 },
  iceBlade: { name: '氷の剣', kind: 'weapon', attackBonus: 2, element: 'ice', count: 1 },
  plainBlade: { name: '鉄の剣', kind: 'weapon', attackBonus: 2, count: 1 },
  lightBolt: { name: '光の矢', kind: 'spell', effect: 'singleDamage', element: 'light', amount: 1, count: 1 },
  darkBolt: { name: '闇の矢', kind: 'spell', effect: 'singleDamage', element: 'dark', amount: 1, count: 1 },
  iceBolt: { name: '氷の矢', kind: 'spell', effect: 'singleDamage', element: 'ice', amount: 1, count: 1 },
  chaosBolt: { name: '混沌の矢', kind: 'spell', effect: 'singleDamage', element: 'chaos', amount: 1, count: 1 },
  windBolt: { name: '風の矢', kind: 'spell', effect: 'singleDamage', element: 'wind', amount: 1, count: 1 },
  plainBolt: { name: 'ただの矢', kind: 'spell', effect: 'singleDamage', amount: 1, count: 1 },
  iceBreath: { name: '氷の息', kind: 'spell', effect: 'freezeEnemySoldiers', element: 'ice', turns: 1, count: 1 },
  lightRain: { name: '光の雨', kind: 'spell', effect: 'damageEnemySoldiers', element: 'light', amount: 1, count: 1 },
  lightBall: { name: '光の火球', kind: 'spell', effect: 'damageEnemyCastle', element: 'light', amount: 3, count: 1 },
};

const FOG = { fog: { name: '霧', weight: 1, rounds: [9, 9], missChance: 1 } };

/**
 * p2 が tank（武器 p2Weapon を持たせる）を出したところで、p1 の番にして返す。
 * p1 は魔法を何枚でも出せる（テストのため、出すたびにメインの枠を戻す）
 */
function setup({ reactions = REACTIONS, p2Weapon = null, p2Soldier = 'tank', weather = null } = {}) {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0, maxHand: 12 };
  const game = new Game({
    cards, rules, rng: seededRng(3), elements: readClassic('elements.json'),
    ...(reactions ? { reactions } : {}), ...(weather ? { weather } : {}),
  });
  game.debugSetHand('p1', ['lightBolt', 'darkBolt', 'iceBolt', 'chaosBolt', 'windBolt', 'plainBolt', 'iceBreath', 'lightBall']);
  game.debugSetHand('p2', [p2Soldier, ...(p2Weapon ? [p2Weapon] : [])]);
  game.debugSetDeck(Array(40).fill('heal'));
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  assert.equal(game.endTurn().ok, true);
  const hand2 = () => game.getState('p2').players.p2.hand;
  assert.equal(game.playCard(hand2().find((c) => c.type === p2Soldier).cardId).ok, true);
  const soldier = game.players.p2.soldiers[0];
  if (p2Weapon) assert.equal(game.playCard(hand2().find((c) => c.type === p2Weapon).cardId, { soldierId: soldier.soldierId }).ok, true);
  assert.equal(game.endTurn().ok, true);
  if (weather) game.weather = { type: Object.keys(weather)[0], roundsLeft: 9 };
  log.length = 0;
  /** p1 が魔法を出す（対象を省略すると p2 の兵士） */
  const cast = (type, target = { soldierId: soldier.soldierId }) => {
    game.players.p1.playedThisTurn = false;
    const card = game.getState('p1').players.p1.hand.find((c) => c.type === type);
    const r = game.playCard(card.cardId, target);
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
  };
  const attached = () => soldier.attachments.map((a) => `${a.element}:${a.turns}`);
  const events = (type) => log.filter((e) => e.event === type);
  return { game, log, soldier, cast, attached, events };
}

/** p1 → p2 → p1 と回して、p2 の兵士の進軍を1回すすめる */
function passRound(game) {
  for (let i = 0; i < 2; i++) {
    assert.equal(game.endTurn().ok, true); // p2 の番（進軍）→ p1 の番
    // 手札が上限を超えたら、ヒールから捨てる
    if (game.phase === 'discard') {
      const pid = game.currentPlayer;
      const over = game.players[pid].hand.length - game.players[pid].maxHand;
      const heals = game.players[pid].hand.filter((c) => c.type === 'heal').slice(0, over).map((c) => c.cardId);
      assert.equal(game.discard(heals).ok, true);
    }
  }
}

test('データ：data/classic/reactions.json は正しい形で、通常モードの modes には reactionsSet がない', () => {
  const data = readClassic('reactions.json');
  validateReactions(data, elementIds(readClassic('elements.json')));
  const modes = JSON.parse(readFileSync(join(ROOT, 'data', 'modes.json'), 'utf8'));
  assert.equal(modes.modes[modes.default]?.reactionsSet, undefined);
  assert.equal(loadOptionalData().reactions, undefined);
  assert.ok(loadOptionalData('classic').reactions);
});

test('データのチェック：おかしな反応は起動時に例外', () => {
  const ids = elementIds(readClassic('elements.json'));
  assert.throws(() => validateReactions({ ...REACTIONS, attachTurns: 0 }, ids), /attachTurns/);
  assert.throws(() => validateReactions({ ...REACTIONS, reactions: { x: { name: 'x', elements: ['light', 'light'], damage: 1 } } }, ids), /ちがう属性2つ/);
  assert.throws(() => validateReactions({ ...REACTIONS, reactions: { x: { name: 'x', elements: ['light', 'wood'], damage: 1 } } }, ids), /wood/);
  assert.throws(() => validateReactions({ ...REACTIONS, chaos: { ...REACTIONS.chaos, minElements: 1 } }, ids), /minElements/);
  const { cards, rules } = buildData({ mode: 'classic' });
  assert.throws(() => new Game({ cards, rules, rng: seededRng(1), elements: readClassic('elements.json'), reactions: { attachTurns: 2 } }), /reactions/);
});

test('付着：光の魔法が当たると光が付着する。getState にも出る', () => {
  const { game, soldier, cast, attached, events } = setup();
  cast('lightBolt');
  assert.deepEqual(attached(), ['light:3']);
  assert.deepEqual(events('elementAttached').map((e) => [e.playerId, e.soldierId, e.element, e.turns]), [['p2', soldier.soldierId, 'light', 3]]);
  assert.deepEqual(game.getState('p1').players.p2.soldiers[0].attachments, [{ element: 'light', turns: 3 }]);
});

test('付着：持ち主の進軍が終わるたびに1減り、0で消える（elementCleared の reason は expired）', () => {
  const { game, cast, attached, events } = setup();
  cast('lightBolt');
  passRound(game);
  assert.deepEqual(attached(), ['light:2']);
  passRound(game);
  assert.deepEqual(attached(), ['light:1']);
  passRound(game);
  assert.deepEqual(attached(), []);
  assert.deepEqual(events('elementCleared').map((e) => [e.element, e.reason]), [['light', 'expired']]);
});

test('付着：同じ属性がまた付いたら、残りが attachTurns に戻る（2つにはならない）', () => {
  const { game, cast, attached } = setup();
  cast('lightBolt');
  passRound(game);
  assert.deepEqual(attached(), ['light:2']);
  game.players.p1.hand.push(game.createCard('lightBolt'));
  cast('lightBolt');
  assert.deepEqual(attached(), ['light:3']);
});

test('付着：属性なしの魔法は付かない。城に当たる魔法・忍者にも付かない', () => {
  const { cast, attached, events } = setup();
  cast('plainBolt');
  assert.deepEqual(attached(), []);
  // 城への魔法（castleSpellHitsFront なし）は城に当たる
  cast('lightBall', { playerId: 'p2' });
  assert.deepEqual(attached(), []);
  assert.equal(events('elementAttached').length, 0);

  // 忍者：魔法の的にならず、属性も付かない。elementHit を直接呼んでも付かない
  const n = setup({ p2Soldier: 'ninjaT' });
  n.game.elementHit(n.game.players.p2, n.soldier, 'light');
  assert.deepEqual(n.soldier.attachments, []);
});

test('付着：ダメージのない氷の息でも、当たれば氷が付く', () => {
  const { soldier, cast, attached } = setup();
  cast('iceBreath', { playerId: 'p2' });
  assert.equal(soldier.frozen, 1);
  assert.deepEqual(attached(), ['ice:3']);
});

test('付着：属性つきの武器を持つ兵士の戦いで、相手に武器の属性が付く（属性なしの武器は付かない）', () => {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA };
  const rules = { ...loadFixture('rules.json'), elementBonus: 0 };
  const run = (w1, w2) => {
    const game = new Game({ cards, rules, rng: seededRng(1), elements: readClassic('elements.json'), reactions: REACTIONS });
    game.debugSetHand('p1', ['knight', w1]);
    game.debugSetHand('p2', ['tank', w2]);
    game.debugSetDeck(Array(30).fill('heal'));
    game.start();
    const play = (type, target) => {
      const pid = game.currentPlayer;
      const card = game.getState(pid).players[pid].hand.find((c) => c.type === type);
      assert.equal(game.playCard(card.cardId, target).ok, true, type);
    };
    play('knight');
    play(w1, { soldierId: game.players.p1.soldiers[0].soldierId });
    game.endTurn();
    play('tank');
    play(w2, { soldierId: game.players.p2.soldiers[0].soldierId });
    game.endTurn(); // p1 の騎士が進んで、p2 の兵士と戦う
    return [game.players.p1.soldiers[0], game.players.p2.soldiers[0]];
  };
  const [k, t] = run('lightBlade', 'iceBlade');
  assert.deepEqual(t.attachments.map((a) => a.element), ['light']);
  assert.deepEqual(k.attachments.map((a) => a.element), ['ice']);
  const [k2, t2] = run('plainBlade', 'plainBlade');
  assert.deepEqual(t2.attachments, []);
  assert.deepEqual(k2.attachments, []);
});

test('対消滅：光の武器の兵士が闇の魔法を受けると反応。武器の属性は外れ、攻撃ボーナスは残る', () => {
  const { game, soldier, cast, attached, log, events } = setup({ p2Weapon: 'lightBlade' });
  const attackBefore = soldier.attack;
  const hp = soldier.hp;
  cast('darkBolt');
  const r = events('reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'annihilation');
  assert.equal(r[0].name, '対消滅');
  assert.deepEqual(r[0].elements, ['dark', 'light']);
  assert.deepEqual(r[0].consumed, ['light']);
  assert.equal(r[0].damage, 8);
  assert.equal(soldier.hp, hp - 1 - 8);
  assert.equal(soldier.element, null);
  assert.equal(soldier.weapon, 'lightBlade');
  assert.equal(soldier.attack, attackBefore);
  assert.deepEqual(attached(), []); // 闇は反応で使われたので付かない
  // 順番：spellCast → soldierDamaged(spell) → reactionTriggered → elementCleared → soldierDamaged(reaction)
  const order = log.map((e) => e.event === 'soldierDamaged' ? `${e.event}:${e.cause}` : e.event).filter((e) => e !== 'cardPlayed' && e !== 'mpChanged');
  assert.deepEqual(order, ['spellCast', 'soldierDamaged:spell', 'reactionTriggered', 'elementCleared', 'soldierDamaged:reaction']);
  assert.equal(events('elementCleared')[0].weapon, true);
  assert.equal(game.getState('p1').players.p2.soldiers[0].element, null);
});

test('対消滅：同じ武器で2回目は起こらない（闇は付着するだけ）', () => {
  const { soldier, game, cast, attached, events } = setup({ p2Weapon: 'lightBlade' });
  cast('darkBolt');
  game.players.p1.hand.push(game.createCard('darkBolt'));
  cast('darkBolt');
  assert.equal(events('reactionTriggered').length, 1);
  assert.deepEqual(attached(), ['dark:3']);
  assert.equal(soldier.element, null);
});

test('対消滅：付着どうしでも起こる（光を付けてから闇）', () => {
  const { soldier, cast, attached, events } = setup();
  const hp = soldier.hp;
  cast('lightBolt');
  cast('darkBolt');
  assert.equal(events('reactionTriggered')[0].reaction, 'annihilation');
  assert.equal(soldier.hp, hp - 1 - 1 - 8);
  assert.deepEqual(attached(), []);
});

test('黒氷：闇の武器の兵士に氷が当たると、3ダメージと凍結1回', () => {
  const { soldier, cast, events } = setup({ p2Weapon: 'darkBlade' });
  const hp = soldier.hp;
  cast('iceBolt');
  assert.equal(events('reactionTriggered')[0].reaction, 'blackIce');
  assert.equal(soldier.hp, hp - 1 - 3);
  assert.equal(soldier.frozen, 1);
  assert.deepEqual(events('statusApplied').map((e) => [e.status, e.turns]), [['frozen', 1]]);
});

test('砕氷：氷＋混沌。凍っていなければ2、凍っていれば +6 で凍結が解ける', () => {
  const a = setup({ p2Weapon: 'iceBlade' });
  let hp = a.soldier.hp;
  a.cast('chaosBolt');
  assert.equal(a.events('reactionTriggered')[0].reaction, 'shatter');
  assert.equal(a.events('reactionTriggered')[0].damage, 2);
  assert.equal(a.soldier.hp, hp - 1 - 2);

  const b = setup();
  hp = b.soldier.hp;
  b.cast('chaosBolt'); // 混沌が付く
  assert.deepEqual(b.attached(), ['chaos:3']);
  b.cast('iceBreath', { playerId: 'p2' }); // 凍らせて、氷が当たる → 砕氷（凍結中）
  const r = b.events('reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'shatter');
  assert.equal(r[0].damage, 8);
  assert.equal(b.soldier.frozen, 0);
  assert.equal(b.soldier.hp, hp - 1 - 8);
  assert.ok(b.events('statusCleared').some((e) => e.status === 'frozen'));
  assert.deepEqual(b.attached(), []);
});

test('混沌反応：付いている属性が混沌を数えて3種以上なら、全部消えて 種類×4。盾・状態異常・武器（攻撃ボーナス）は残る', () => {
  const { game, soldier, cast, attached, events } = setup({ p2Weapon: 'lightBlade' });
  cast('iceBreath', { playerId: 'p2' }); // 氷（凍結1）
  soldier.shield = 50;
  soldier.poison = { amount: 1, turns: 3 };
  const attackBefore = soldier.attack;
  cast('chaosBolt'); // 光（武器）＋氷＋混沌 = 3種
  const r = events('reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'chaos');
  assert.equal(r[0].name, '混沌反応');
  assert.deepEqual([...r[0].elements].sort(), ['chaos', 'ice', 'light']);
  assert.equal(r[0].damage, 12);
  assert.deepEqual(attached(), []);
  assert.equal(soldier.element, null);
  assert.equal(soldier.weapon, 'lightBlade');
  assert.equal(soldier.attack, attackBefore);
  assert.equal(soldier.shield, 50 - 1 - 12); // 盾が先に受けて、盾は残る
  assert.deepEqual(soldier.poison, { amount: 1, turns: 3 });
  assert.equal(soldier.frozen, 1); // 混沌反応は凍結を解かない
  assert.ok(game.getState('p1'));
});

test('混沌反応：4種なら 16。2属性の反応（砕氷）より混沌反応が優先', () => {
  const { soldier, cast, events } = setup({ p2Weapon: 'iceBlade' });
  // 氷（武器）＋光 → 反応なし。氷（武器）＋光＋闇は対消滅になってしまうので、付着は直接足す
  cast('lightBolt');
  soldier.attachments.push({ element: 'wind', turns: 3 });
  cast('chaosBolt'); // 氷・光・風・混沌 = 4種。氷＋混沌の砕氷も成り立つが、混沌反応が先
  const r = events('reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'chaos');
  assert.equal(r[0].damage, 16);
});

test('混沌＋1種だけのときは、2属性の表（砕氷）を見る。混沌＋光だけは何も起きない', () => {
  const a = setup({ p2Weapon: 'iceBlade' });
  a.cast('chaosBolt');
  assert.equal(a.events('reactionTriggered')[0].reaction, 'shatter');
  const b = setup({ p2Weapon: 'lightBlade' });
  b.cast('chaosBolt');
  assert.equal(b.events('reactionTriggered').length, 0);
  assert.deepEqual(b.attached(), ['chaos:3']);
});

test('混沌反応：混沌が付いている兵士に別の属性が当たって3種になっても起きる（混沌の攻撃でなくてよい）', () => {
  const { soldier, cast, attached, events } = setup({ p2Weapon: 'lightBlade' });
  cast('chaosBolt'); // 光（武器）＋混沌 = 2種。表に組がないので、混沌が付くだけ
  assert.deepEqual(attached(), ['chaos:3']);
  assert.equal(events('reactionTriggered').length, 0);
  cast('windBolt'); // 風が当たって 光・混沌・風 = 3種（表の組はない）
  const r = events('reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'chaos');
  assert.deepEqual([...r[0].elements].sort(), ['chaos', 'light', 'wind']);
  assert.equal(r[0].damage, 12);
  assert.deepEqual(r[0].consumed.sort(), ['chaos', 'light']); // 当たった風は付かない
  assert.deepEqual(attached(), []);
  assert.equal(soldier.element, null);
});

test('混沌反応：武器が混沌の兵士でも、別の属性が2種当たれば起きる', () => {
  const cards = { ...loadFixture('cards-step2.json'), ...EXTRA, chaosBlade: { name: '混沌の剣', kind: 'weapon', attackBonus: 1, element: 'chaos', count: 1 } };
  const g = new Game({ cards, rules: { ...loadFixture('rules.json'), elementBonus: 0 }, rng: seededRng(3), elements: readClassic('elements.json'), reactions: REACTIONS });
  const soldier = { attachments: [{ element: 'light', turns: 3 }], element: 'chaos' };
  // Game の判定を直接調べる（武器の属性が混沌）
  assert.equal(g.findReaction(soldier, 'wind')?.id, 'chaos');
  assert.equal(g.findReaction({ attachments: [], element: 'chaos' }, 'wind'), null); // 2種だけ（表の組もない）
});

test('混沌反応と表の反応の優先：2種類なら表（砕氷）、3種類以上なら混沌反応（表の組が成り立っても）', () => {
  // 2種類：混沌が付いていて氷が当たる → 砕氷
  const a = setup();
  a.cast('chaosBolt');
  a.cast('iceBolt');
  assert.deepEqual(a.events('reactionTriggered').map((e) => e.reaction), ['shatter']);
  // 3種類：光（武器）＋混沌が付いていて、闇が当たる（光＋闇の対消滅も成り立つが、混沌反応が先）
  const b = setup({ p2Weapon: 'lightBlade' });
  b.cast('chaosBolt');
  b.cast('darkBolt');
  assert.deepEqual(b.events('reactionTriggered').map((e) => [e.reaction, e.damage]), [['chaos', 12]]);
});

test('混沌が入っていない3種類は混沌反応にならない（表の組があればその反応）', () => {
  const { soldier, cast, events } = setup({ p2Weapon: 'lightBlade' });
  soldier.attachments.push({ element: 'wind', turns: 3 });
  cast('darkBolt'); // 光・風・闇：混沌なし → 光＋闇の対消滅
  assert.deepEqual(events('reactionTriggered').map((e) => e.reaction), ['annihilation']);
});

test('getState().reactions：反応の定義が入る（コピー）。reactions を渡さないゲームにはキーがない', () => {
  const { game } = setup();
  const st = game.getState('p1');
  assert.deepEqual(st.reactions, REACTIONS);
  st.reactions.chaos.minElements = 99; // 書き換えても、ゲームの中身は変わらない
  assert.equal(game.getState('p1').reactions.chaos.minElements, 3);
  assert.equal(game.reactionDefs.chaos.minElements, 3);
  assert.equal(Object.hasOwn(setup({ reactions: null }).game.getState('p1'), 'reactions'), false);
});

test('CPU の canReact は Game.findReaction と、属性の組み合わせすべてで一致する', () => {
  const { game } = setup();
  const reactions = game.getState('p1').reactions;
  const ids = elementIds(readClassic('elements.json'));
  const subsets = [[]];
  for (const e of ids) for (const sub of [...subsets]) if (sub.length < 3) subsets.push([...sub, e]);
  let checked = 0;
  for (const weapon of [null, ...ids]) {
    for (const attach of subsets) {
      for (const element of ids) {
        const gameSoldier = { element: weapon, attachments: attach.map((e) => ({ element: e, turns: 3 })) };
        const stateSoldier = { element: weapon, attachments: attach.map((e) => ({ element: e, turns: 3 })) };
        assert.equal(canReact(reactions, element, stateSoldier), game.findReaction(gameSoldier, element) !== null, `武器${weapon} 付着${attach} 攻撃${element}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1000);
  assert.equal(canReact(null, 'light', { element: 'dark', attachments: [] }), false); // 反応のないゲーム
});

test('CPU（strategies.js）はゲームの内部（reactionDefs）を読まず、getState の公開データだけを使う', () => {
  const src = readFileSync(join(ROOT, 'js', 'game', 'strategies.js'), 'utf8');
  assert.equal(/reactionDefs/.test(src), false);
  assert.ok(STRATEGIES.smart);
});

test('霧で外れた攻撃は、反応も付着もしない', () => {
  const { soldier, cast, attached, events } = setup({ p2Weapon: 'lightBlade', weather: FOG });
  const hp = soldier.hp;
  cast('darkBolt');
  assert.equal(events('attackMissed').length, 1);
  assert.equal(events('reactionTriggered').length, 0);
  assert.deepEqual(attached(), []);
  assert.equal(soldier.element, 'light');
  assert.equal(soldier.hp, hp);
});

test('反応のダメージで倒れたら、soldierDestroyed（killed）', () => {
  const { game, soldier, cast, events } = setup({ p2Weapon: 'lightBlade' });
  soldier.hp = 5;
  cast('darkBolt');
  assert.equal(game.players.p2.soldiers.length, 0);
  assert.deepEqual(events('soldierDestroyed').map((e) => e.reason), ['killed']);
});

test('reactions を渡さないゲーム（通常モード）：付着も反応も起きず、getState に attachments がない', () => {
  const { soldier, cast, events, game } = setup({ reactions: null, p2Weapon: 'lightBlade' });
  const hp = soldier.hp;
  cast('darkBolt');
  cast('lightBolt');
  assert.equal(soldier.hp, hp - 2);
  assert.equal(events('reactionTriggered').length + events('elementAttached').length + events('elementCleared').length, 0);
  assert.equal(soldier.element, 'light');
  const st = game.getState('p1').players.p2.soldiers[0];
  assert.equal(Object.hasOwn(st, 'attachments'), false);
});

test('通常モードのデータでも、getState の兵士に attachments は付かない', () => {
  const { cards, rules } = buildData({ rules: PLAIN_START });
  const game = new Game({ cards, rules, rng: seededRng(2), ...loadOptionalData() });
  game.debugSetHand('p1', ['infantry']);
  game.start();
  const card = game.getState('p1').players.p1.hand.find((c) => c.type === 'infantry');
  assert.equal(game.playCard(card.cardId, game.getTargets(card.cardId)[0]).ok, true);
  const st = game.getState(null).players.p1.soldiers;
  assert.equal(st.length, 1);
  assert.equal(Object.hasOwn(st[0], 'attachments'), false);
});
