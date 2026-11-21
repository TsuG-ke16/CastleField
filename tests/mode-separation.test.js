// モードの分離（人間の指示）：通常モード（本編）と四大陣営モードを、ルール上も完全に分ける。
// 通常モードのカード・合成ルート・属性相性・MP上限・排出率・既存の対戦ルールは、四大陣営を足す前（main）のまま。
// 四大陣営のカード・属性の倍率相性・属性の反応・陣営用のルールは、陣営モード（setup.faction）だけで効く。
// 通常モードの基準は tests/fixtures/normal-mode-cards.json・normal-mode-rules.json（四大陣営を足す前の data/ のコピー）。
// 意図して通常モードを変えるときは、この2つの資料と、このテストを一緒に直す（直し忘れで通常モードが変わるのを防ぐ）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES, ELEMENT_BEATS } from '../js/game/Game.js';
import { Card } from '../js/game/Card.js';
import { applyFactionOverrides, factionPool } from '../js/game/Factions.js';
import { dropRates, sampleDeckTypes, sampleType, sampleTypeOfRarity, isDeckable, checkCostDeck } from '../js/game/Setup.js';
import { Lobby } from '../server/rooms.js';
import { loadData } from '../server/server.js';
import { runMatch } from './sim/sim.js';
import { loadJson, loadFixture, loadOptionalData, seededRng, recordEvents, PLAIN_START } from './helpers.js';

const MAIN_CARDS = loadFixture('normal-mode-cards.json');
const MAIN_RULES = loadFixture('normal-mode-rules.json');
const CARDS = loadJson('cards.json');
const RULES = loadJson('rules.json');
const rarities = loadJson('rarities.json');
const factions = loadJson('factions.json');
const factionRules = loadJson('faction-rules.json');
const elements = loadJson('elements.json');
const reactions = loadJson('reactions.json');
const strip = ({ faction, factionOverride, ...rest }) => rest;

/** 通常モードの Game（陣営に使うデータを全部渡しても、通常モードのまま）。extra で上書き */
function normalGame(extra = {}) {
  return new Game({ cards: CARDS, rules: { ...RULES, ...PLAIN_START }, rarities, factions, factionRules, elements, reactions, rng: seededRng(1), ...extra });
}
function factionGame(faction = 'kingdom', extra = {}) {
  return normalGame({ setup: { faction }, ...extra });
}

// ================= データ =================

test('データ：rules.json は通常モードの値のまま（四大陣営用の項目を入れない）', () => {
  assert.deepEqual(RULES, MAIN_RULES);
  for (const key of ['attachTurns', 'reactionsPerTurn']) assert.equal(Object.hasOwn(RULES, key), false, `rules.json に ${key} を入れない（陣営用は faction-rules.json）`);
  assert.equal(RULES.maxMp, 20);
  assert.equal(RULES.elementBonus, 2);
});

test('データ：faction-rules.json は陣営モード用の差分だけ（MP上限30・付着3ターン・1ターン1回の反応）', () => {
  assert.deepEqual(factionRules, { maxMp: 30, attachTurns: 3, reactionsPerTurn: 1 });
});

test('データ：既存のカードは、通常モードの定義が main と1文字も変わらない。新しいカードは全部 factionOnly', () => {
  for (const id of Object.keys(MAIN_CARDS)) {
    assert.ok(Object.hasOwn(CARDS, id), `${id} が消えた`);
    assert.deepEqual(strip(CARDS[id]), strip(MAIN_CARDS[id]), `${id} の通常モードの定義が変わった`);
  }
  for (const [id, def] of Object.entries(CARDS)) {
    if (!Object.hasOwn(MAIN_CARDS, id)) assert.equal(def.factionOnly, true, `${id} は新しいカードなので factionOnly にする（通常モードの山札に出さない）`);
  }
});

test('データ：陣営モードで違う所は factionOverride だけ（名前・合成先・属性）。改名4・合成先の付けかえ・聖剣神剣の光', () => {
  const eff = applyFactionOverrides(CARDS);
  assert.deepEqual(Object.keys(CARDS).filter((id) => CARDS[id].factionOverride).sort(),
    ['blessing', 'earthHammer', 'flameSword', 'galeForce', 'godSword', 'holySword', 'lifeSteal', 'paladin', 'shieldBlast', 'waterSpear', 'windBow']);
  assert.equal(CARDS.flameSword.name, '炎の剣');
  assert.equal(eff.flameSword.name, 'フレイムソード');
  assert.equal(CARDS.holySword.element, undefined);
  assert.equal(eff.holySword.element, 'light');
  assert.equal(CARDS.shieldBlast.fuseTo, 'apocalypse');
  assert.equal(eff.shieldBlast.fuseTo, null);
  // applyFactionOverrides は元のデータを変えない
  assert.equal(CARDS.flameSword.name, '炎の剣');
});

test('factionOverride の検査：書けるのは name / fuseTo / element。faction のないカードには書けない。合成先は1つ上のレアリティ', () => {
  const base = { ...CARDS };
  const check = (id, patch) => Card.validateDefinitions({ ...base, [id]: { ...base[id], ...patch } }, rarities, { factions });
  check('flameSword', { factionOverride: { name: 'x' } }); // 通る
  assert.throws(() => check('flameSword', { factionOverride: { hp: 1 } }), /factionOverride に書けるのは/);
  assert.throws(() => check('flameSword', { factionOverride: 'x' }), /オブジェクト/);
  assert.throws(() => check('flameSword', { factionOverride: { name: '' } }), /name/);
  assert.throws(() => check('flameSword', { factionOverride: { element: 'wood' } }), /element/);
  assert.throws(() => check('flameSword', { factionOverride: { fuseTo: 'nothing' } }), /fuseTo/);
  assert.throws(() => check('flameSword', { factionOverride: { fuseTo: 'godSword' } }), /1つ上のレアリティ/);
  assert.throws(() => check('magicSword', { factionOverride: { name: 'x' } }), /faction のあるカードにだけ/);
  // 陣営モードで使う合成先が、別の陣営なら例外
  assert.throws(() => check('paladin', { factionOverride: { fuseTo: 'dragonKnight' } }), /別の陣営/);
});

// ================= 通常モード =================

test('通常モード：山札・引き当ての排出率は main と同じ（陣営専用のカードは出ない）', () => {
  const now = dropRates(CARDS, rarities);
  const before = dropRates(MAIN_CARDS, rarities);
  for (const [id, rate] of Object.entries(before)) assert.equal(now[id], rate, `${id} の排出率`);
  for (const [id, def] of Object.entries(CARDS)) if (def.factionOnly) assert.equal(now[id], 0, `${id} は通常モードで出ない`);
  const rng = seededRng(7);
  assert.deepEqual(sampleDeckTypes(CARDS, rarities, 300, seededRng(7)), sampleDeckTypes(MAIN_CARDS, rarities, 300, seededRng(7)));
  for (let i = 0; i < 3000; i++) assert.ok(Object.hasOwn(MAIN_CARDS, sampleType(CARDS, rarities, rng, { from: 'rare', multiplier: 4 })));
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) for (let i = 0; i < 200; i++) assert.ok(Object.hasOwn(MAIN_CARDS, sampleTypeOfRarity(CARDS, r, rng)));
});

test('通常モード：陣営用のデータ（elements・reactions・factionRules・factions）を渡しても、渡さないときと試合が完全に同じ', () => {
  const all = loadOptionalData();
  const without = { ...all };
  for (const key of ['elements', 'reactions', 'factions', 'factionRules']) delete without[key];
  assert.ok(all.elements && all.reactions && all.factions && all.factionRules, '陣営用のデータを読めている');
  const rules = { ...RULES };
  for (const strategies of [['smart', 'smart'], ['random', 'smart'], ['aggro', 'defensive']]) {
    for (let seed = 1; seed <= 6; seed++) {
      const a = runMatch({ cards: CARDS, rules, strategies, seed, gameOptions: all });
      const b = runMatch({ cards: CARDS, rules, strategies, seed, gameOptions: without });
      assert.deepEqual(a.events, b.events, `${strategies} seed ${seed}`);
      assert.deepEqual(a.finalState, b.finalState, `${strategies} seed ${seed}`);
      assert.equal(a.events.reactionTriggered ?? 0, 0, '通常モードに反応はない');
      assert.equal(a.events.attachmentChanged ?? 0, 0, '通常モードに付着はない');
    }
  }
});

test('通常モード：MP上限は 20（陣営用ルールを渡されても）。陣営ルールは rules に混ざらない', () => {
  const g = normalGame();
  assert.equal(g.getState(null).maxMp, 20);
  assert.equal(g.rules.maxMp, 20);
  assert.equal(g.rules.attachTurns, 2); // 省略したときの値（陣営の3ではない）
  assert.equal(g.faction, null);
  assert.equal(g.getState(null).faction, null);
});

test('通常モード：属性は旧来の4つの輪（水→火→風→土→水）で、強いとき rules.elementBonus（+2）が増える。倍率の相性はない', () => {
  assert.deepEqual(ELEMENT_BEATS, { water: 'fire', fire: 'wind', wind: 'earth', earth: 'water' });
  const g = normalGame();
  assert.equal(g.elementTable, null);
  const e = (element) => ({ attack: 3, element });
  for (const [strong, weak] of Object.entries(ELEMENT_BEATS)) {
    assert.equal(g.fightDamage(e(strong), e(weak)), 5, `${strong} は ${weak} に強い（3+2）`);
    assert.equal(g.fightDamage(e(weak), e(strong)), 3, `${weak} は ${strong} に弱い（増えない・減らない）`);
  }
  // 新しい倍率の相性（水→土・風→火・光⇄闇・氷など）は通常モードにはない
  assert.equal(g.fightDamage(e('water'), e('earth')), 3);
  assert.equal(g.fightDamage(e('wind'), e('fire')), 3);
  assert.equal(g.fightDamage(e('light'), e('dark')), 3);
  assert.equal(g.fightDamage(e('fire'), e('ice')), 3);
  assert.equal(g.fightDamage(e('fire'), e(null)), 3);
  // rules.elementBonus を変えれば変わる（昔からの調整のしかた）
  assert.equal(normalGame({ rules: { ...RULES, ...PLAIN_START, elementBonus: 5 } }).fightDamage(e('water'), e('fire')), 8);
  // CPU・画面が使う判定も、モードに合う
  assert.equal(g.hasElementAdvantage('water', 'fire'), true);
  assert.equal(g.hasElementAdvantage('water', 'earth'), false);
  assert.equal(g.hasElementAdvantage('fire', 'ice'), false);
});

/** 相手の兵士に、属性つきの魔法を続けて当てる（水流 → 火炎弾）。イベントの記録を返す */
function elementSpells(game) {
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  const cast = (type, target) => {
    const p = game.players[game.currentPlayer];
    p.playedThisTurn = false; p.soldiersPlayedThisTurn = 0; p.mp = 30;
    game.debugSetHand(p.id, [type]);
    const r = game.playCard(p.hand[0].cardId, target);
    assert.equal(r.ok, true, `${type}: ${r.reason}`);
  };
  game.endTurn();
  cast('tough', { playerId: 'p1' }); // p2 が p1 の方へ兵士を送る
  game.endTurn();
  cast('waterJet'); // レーンは1本なので対象は選ばない
  cast('flameBolt');
  return log;
}
const fightCards = { ...CARDS, tough: { name: '打たれ強い兵士', kind: 'soldier', hp: 500, attack: 3, speed: 2, count: 0, rarity: 'common', fuseTo: null, weight: 0 } };
const fightRules = { ...RULES, ...PLAIN_START, laneCount: 1, defenseReaction: false };
const fightGame = (extra = {}) => new Game({ cards: fightCards, rules: fightRules, rarities, factions, factionRules, elements, reactions, rng: seededRng(2), ...extra });

test('通常モード：属性の反応・付着は起きない（reactions を渡しても）。同じことを陣営モードでやると反応が起きる', () => {
  const g = normalGame();
  assert.equal(g.reactionsOn, false);
  assert.equal(g.reactionDefs, null);
  const normal = fightGame();
  const log = elementSpells(normal);
  assert.ok(log.filter((e) => e.event === 'soldierDamaged' && e.cause === 'spell').length >= 2, '魔法は兵士に当たった（ダメージは通る）');
  assert.equal(log.filter((e) => e.event === 'reactionTriggered' || e.event === 'attachmentChanged').length, 0);
  for (const id of normal.playerOrder) for (const s of normal.players[id].soldiers) assert.equal(s.attachment, null);
  // 対照：陣営モードなら、水の付着に火で攻撃 → 蒸発（この組み立てが反応を起こせるという確認）
  const log2 = elementSpells(fightGame({ setup: { faction: 'kingdom' } }));
  assert.ok(log2.some((e) => e.event === 'attachmentChanged'), '陣営モードでは付着する');
  assert.ok(log2.some((e) => e.event === 'reactionTriggered' && e.reaction === 'evaporate'), '陣営モードでは反応（蒸発）が起きる');
});

test('通常モード：合成ルートは昔のまま（炎の剣→鉄の剣、聖騎士→竜騎士、天の恵み→盗賊、ゲイルフォース→氷河）。名前も昔のまま', () => {
  const g = normalGame({ rules: { ...RULES, ...PLAIN_START, maxMp: 30 } });
  assert.equal(g.cardDefs.flameSword.name, '炎の剣');
  const routes = { flameSword: 'ironSword', waterSpear: 'ironSword', windBow: 'ironSword', earthHammer: 'ironSword', paladin: 'dragonKnight', blessing: 'thief', galeForce: 'glacier', shieldBlast: 'apocalypse' };
  for (const [from, to] of Object.entries(routes)) {
    const game = normalGame();
    game.debugSetHand('p1', [from, from]);
    game.start();
    const [a, b] = game.getState('p1').players.p1.hand.map((c) => c.cardId);
    const r = game.fuse(a, b);
    assert.equal(r.ok, true, `${from}: ${r.reason}`);
    assert.equal(game.players.p1.hand.at(-1).type, to, `${from} → ${to}`);
  }
  // 命の簒奪は合成しない（通常モード）
  const game = normalGame();
  game.debugSetHand('p1', ['lifeSteal', 'lifeSteal']);
  game.start();
  const [a, b] = game.getState('p1').players.p1.hand.map((c) => c.cardId);
  assert.equal(game.canFuse(a, b).reason, 'このカードは合成できません');
});

test('通常モード：聖剣・神剣に属性はない（攻撃力は +6 / +9）', () => {
  const g = normalGame();
  assert.equal(g.cardDefs.holySword.element, undefined);
  assert.equal(g.cardDefs.godSword.element, undefined);
  assert.equal(g.cardDefs.holySword.attackBonus, 6);
  assert.equal(g.cardDefs.godSword.attackBonus, 9);
});

// ================= カスタムデッキ（コスト制）=================

test('カスタムデッキ：陣営専用のカードは入れられない。今までのマイデッキ・見本のデッキは今までどおり使える', () => {
  for (const [id, def] of Object.entries(CARDS)) {
    if (def.factionOnly) assert.equal(isDeckable(def), false, `${id} は通常モードのマイデッキに入れられない`);
  }
  // 通常のカード（陣営の印がついた既存カードを含む）は入れられる
  for (const id of Object.keys(MAIN_CARDS)) {
    const def = CARDS[id];
    if (def.monster === undefined && def.implemented !== false) assert.equal(isDeckable(def), true, id);
  }
  const bad = checkCostDeck({ king_light_spell_common: 1 }, CARDS, rarities, RULES);
  assert.equal(bad.ok, false);
  // 見本のコスト制デッキ（decks.json）は、四大陣営を足す前と同じく決まりに合う
  const decks = loadJson('decks.json');
  const samples = Object.entries(decks).filter(([, d]) => d.costDeck);
  assert.ok(samples.length >= 3);
  for (const [id, d] of samples) assert.equal(checkCostDeck(d.cards, CARDS, rarities, RULES).ok, true, id);
  // 同じ中身を、四大陣営を足す前のカード・ルールで確かめても同じ結果
  for (const [id, d] of samples) assert.deepEqual(checkCostDeck(d.cards, CARDS, rarities, RULES), checkCostDeck(d.cards, MAIN_CARDS, rarities, MAIN_RULES), id);
});

// ================= 陣営モード =================

test('陣営モード：陣営用のルール（MP上限30・付着3ターン）・倍率の相性・反応・陣営用の名前と合成先が効く', () => {
  const g = factionGame('forest');
  assert.equal(g.faction, 'forest');
  assert.equal(g.getState(null).maxMp, 30);
  assert.equal(g.rules.attachTurns, 3);
  assert.equal(g.rules.reactionsPerTurn, 1);
  assert.equal(g.reactionsOn, true);
  const e = (element) => ({ attack: 3, element });
  assert.equal(g.fightDamage(e('water'), e('earth')), 5); // ×1.5（切り上げ）。通常モードの旧相性にはない組
  assert.equal(g.fightDamage(e('earth'), e('wind')), 5);
  assert.equal(g.fightDamage(e('fire'), e('water')), 3); // ×0.75 切り上げ
  assert.equal(g.hasElementAdvantage('water', 'earth'), true);
  assert.equal(g.cardDefs.flameSword.name, 'フレイムソード');
  assert.equal(g.cardDefs.flameSword.fuseTo, 'forest_fire_sword_uncommon');
  // faction-rules は陣営モードのときだけ。rules.json の値は変わらない
  assert.equal(RULES.maxMp, 20);
  assert.equal(normalGame().getState(null).maxMp, 20);
});

test('陣営モード：カードの合成は陣営の系統（炎の剣のコモン2枚→次の段）。陣営をまたぐ旧合成は合成しない', () => {
  const game = factionGame('forest');
  game.debugSetHand('p1', ['flameSword', 'flameSword']);
  game.start();
  const [a, b] = game.getState('p1').players.p1.hand.map((c) => c.cardId);
  assert.equal(game.fuse(a, b).ok, true);
  assert.equal(game.players.p1.hand.at(-1).type, 'forest_fire_sword_uncommon');
  const g2 = factionGame('kingdom');
  g2.debugSetHand('p1', ['blessing', 'blessing']);
  g2.start();
  const [c, d] = g2.getState('p1').players.p1.hand.map((x) => x.cardId);
  assert.equal(g2.canFuse(c, d).reason, 'このカードは合成できません');
});

test('陣営モード：山札は陣営＋共通のカードだけ（陣営専用が入る）。通常モードの山札には陣営専用は入らない', () => {
  const g = factionGame('kingdom');
  const types = [...g.pileOf('p1').deck, ...g.players.p1.hand, ...g.players.p2.hand].map((c) => c.type);
  const pool = factionPool(g.cardDefs, 'kingdom');
  assert.ok(types.every((t) => pool.has(t)));
  const n = normalGame();
  const normalTypes = [...n.pileOf('p1').deck, ...n.players.p1.hand, ...n.players.p2.hand].map((c) => c.type);
  assert.ok(normalTypes.every((t) => !CARDS[t].factionOnly));
});

// ================= 部屋（オンライン）=================

function enter(lobby, pass, name) {
  const r = lobby.join(pass, name);
  assert.equal(r.ok, true, r.reason);
  const { room, seat } = lobby.findSeat(r.token);
  room.connect(seat, () => {});
  return { room, seat };
}

test('部屋：陣営を選ばない部屋は通常モード（MP上限20・反応なし）、陣営を選んだ部屋だけ陣営ルール', () => {
  let seed = 1;
  const lobby = new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0 });
  assert.ok(loadData().factionRules, 'サーバーが faction-rules.json を読んでいる');
  const a = enter(lobby, 'normal-room', 'A');
  enter(lobby, 'normal-room', 'B');
  a.room.action(a.seat, 'setRules', [{ deckMode: 'shared' }]);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  const n = a.room.game;
  assert.equal(n.getState(null).faction, null);
  assert.equal(n.getState(null).maxMp, 20);
  assert.equal(n.reactionsOn, false);
  assert.equal(n.cardDefs.flameSword.name, '炎の剣');
  assert.equal(n.elementTable, null);

  const b = enter(lobby, 'faction-room', 'A');
  enter(lobby, 'faction-room', 'B');
  assert.equal(b.room.action(b.seat, 'setRules', [{ deckMode: 'shared', faction: 'forest' }]).ok, true);
  assert.equal(b.room.action(b.seat, 'start', []).ok, true);
  const f = b.room.game;
  assert.equal(f.getState(null).faction, 'forest');
  assert.equal(f.getState(null).maxMp, 30);
  assert.equal(f.reactionsOn, true);
  assert.equal(f.cardDefs.flameSword.name, 'フレイムソード');
  // 部屋の「マイデッキ（コスト制）」は今までどおり（陣営専用カードは使えない）
  const c = enter(lobby, 'cost-room', 'A');
  enter(lobby, 'cost-room', 'B');
  assert.equal(c.room.action(c.seat, 'start', []).ok, true);
  assert.equal(c.room.game.getState(null).deckMode, 'cost');
  assert.equal(c.room.game.getState(null).maxMp, 20);
});
