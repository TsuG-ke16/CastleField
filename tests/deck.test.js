// デッキ編成（deckMode "cost"）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { checkCostDeck, deckCostOf } from '../js/game/Setup.js';
import { Lobby } from '../server/rooms.js';
import { loadData } from '../server/server.js';
import { loadJson, seededRng, recordEvents } from './helpers.js';

const cards = loadJson('cards.json');
const rarities = loadJson('rarities.json');
const rules = loadJson('rules.json');
const decks = loadJson('decks.json');
const check = (list) => checkCostDeck(list, cards, rarities, rules);

/** コスト95の、決まりに合うデッキ */
const GOOD = { infantry: 10, fireball: 10, spearman: 10, thunder: 5, heavy: 3, knight: 3, meteor: 3, giant: 2, hero: 2 };

test('コスト：コモン1・アンコモン2・レア3・エピック4・レジェンド5、スペシャルはレアと同じ3', () => {
  assert.deepEqual(['infantry', 'spearman', 'heavy', 'giant', 'hero', 'adapt', 'weatherCall'].map((t) => deckCostOf(cards[t], rarities)), [1, 2, 3, 4, 5, 3, 3]);
});

test('編成：合計コストが90〜100のとき有効。範囲の外は理由つきで断る', () => {
  assert.equal(check(GOOD).ok, true, check(GOOD).problems.join());
  assert.equal(check(GOOD).cost, 10 + 10 + 20 + 10 + 9 + 9 + 9 + 8 + 10);
  const low = check({ infantry: 10, fireball: 10 });
  assert.equal(low.ok, false);
  assert.match(low.reason, /90未満/);
  const high = check({ ...GOOD, hero: 3, giant: 3, sage: 3 }); // 5 を3種で15追加
  assert.equal(high.ok, false);
  assert.ok(high.problems.some((p) => /100を超え/.test(p)));
});

test('編成：同じカードは、コモン・アンコモンが10枚まで、レア以上は3枚まで', () => {
  assert.ok(check({ ...GOOD, infantry: 11 }).problems.some((p) => /歩兵.*10枚まで/.test(p)));
  assert.ok(check({ ...GOOD, heavy: 4 }).problems.some((p) => /重装兵.*3枚まで/.test(p)));
  assert.ok(check({ ...GOOD, hero: 4 }).problems.some((p) => /勇者.*3枚まで/.test(p)));
});

test('編成：レアは合計20枚・エピックは10枚・レジェンドは5枚まで（コモン・アンコモンは無制限）', () => {
  const rare = ['heavy', 'knight', 'meteor', 'thief', 'glacier', 'greatHeal', 'steelShield'];
  const list = Object.fromEntries(rare.map((t) => [t, 3])); // 21枚
  assert.ok(check(list).problems.some((p) => /レアは合計20枚まで/.test(p)));
  assert.ok(check({ giant: 3, paladin: 3, sniper: 3, archmage: 3 }).problems.some((p) => /エピックは合計10枚まで/.test(p)));
  assert.ok(check({ hero: 3, dragonKnight: 3 }).problems.some((p) => /レジェンドは合計5枚まで/.test(p)));
  // コモン・アンコモンは何種類・何枚でも（同じカードの上限だけ）
  const commons = Object.keys(cards).filter((t) => cards[t].rarity === 'common' && !cards[t].monster);
  assert.equal(check(Object.fromEntries(commons.map((t) => [t, 10]))).problems.some((p) => /合計/.test(p) && !/コスト/.test(p)), false);
});

test('編成：スペシャルはレアと同じ枠（コスト3・3枚まで・レアの合計に数える）', () => {
  assert.ok(check({ ...GOOD, adapt: 4 }).problems.some((p) => /適応.*3枚まで/.test(p)));
  const r = check({ ...GOOD, thief: 3, glacier: 3, adapt: 3 }); // レア 9 + 6 + 3(適応)
  assert.equal(r.counts.rare, 18);
  assert.equal(r.counts.special, undefined);
  assert.ok(check({ heavy: 3, knight: 3, meteor: 3, thief: 3, glacier: 3, greatHeal: 3, adapt: 3 }).problems.some((p) => /レアは合計20枚まで/.test(p)));
});

test('編成：魔物の駒・知らないカード・枚数の形の間違いは断る。0枚は数えない', () => {
  assert.ok(check({ ...GOOD, beast_slime: 1 }).problems.some((p) => /入れられません/.test(p)));
  assert.ok(check({ ...GOOD, nothing: 1 }).problems.some((p) => /ありません/.test(p)));
  assert.ok(check({ ...GOOD, infantry: 1.5 }).problems.length > 0);
  assert.equal(check({ ...GOOD, beast_slime: 0 }).ok, true);
  assert.equal(check(null).ok, false);
  assert.equal(check([]).ok, false);
});

test('decks.json のコスト制の見本は、どれも決まりに合う', () => {
  const presets = Object.entries(decks).filter(([, d]) => d.costDeck);
  assert.ok(presets.length >= 3);
  for (const [id, d] of presets) assert.equal(check(d.cards).ok, true, `${id}: ${check(d.cards).problems.join()}`);
  assert.ok(Object.hasOwn(decks, rules.defaultCostDeck));
});

const make = (extra = {}, rulePatch = {}) => new Game({ cards, rules: { ...rules, deckMode: 'cost', ...rulePatch }, rarities, decks, rng: seededRng(1), ...extra });

test('Game：deckMode "cost" は、席ごとに編成したデッキか見本の山札を作る', () => {
  const g = make({ setup: { deckLists: [GOOD, null], decks: [null, 'costAssault'] } });
  const s = g.getState('p1');
  assert.equal(s.deckMode, 'cost');
  assert.equal(s.players.p1.deckId, 'custom');
  assert.equal(s.players.p2.deckId, 'costAssault');
  // 山札 + 初期手札 = デッキの枚数
  const n1 = Object.values(GOOD).reduce((a, b) => a + b, 0);
  assert.equal(s.deckCount + s.players.p1.handCount, n1);
  assert.equal(s.players.p1.deckCount + 5, n1);
  const n2 = Object.values(decks.costAssault.cards).reduce((a, b) => a + b, 0);
  assert.equal(s.players.p2.deckCount + 5, n2);
});

test('Game：何も選ばなければ rules.defaultCostDeck。決まりに合わないデッキは例外', () => {
  const g = make();
  assert.equal(g.getState('p1').players.p1.deckId, rules.defaultCostDeck);
  assert.throws(() => make({ setup: { deckLists: [{ infantry: 10 }, null] } }), /席1のデッキが決まりに合いません/);
  assert.throws(() => make({ setup: { decks: ['balanced', 'balanced'] } }), /デッキがありません/);
  assert.throws(() => make({ rarities: null }), /rarities/);
  assert.throws(() => new Game({ cards, rules, rarities, decks, setup: { deckLists: [GOOD] } }), /deckMode/);
});

test('Game：山札を引ききったら、捨て札から山札に戻る（デッキの枚数は増えない）', () => {
  const tiny = GOOD;
  // 毎ターン3枚引き、手札は4枚までにして、捨てながら山札を使い切る
  const g = make({ setup: { deckLists: [tiny, tiny] } }, { drawPerTurn: 3, firstTurnDraw: 3, drawUntilHand: 0, drawPerPlayed: false, maxHand: 4 });
  const log = recordEvents(g, EVENT_TYPES);
  g.start();
  const total = Object.values(tiny).reduce((a, b) => a + b, 0);
  for (let i = 0; i < 120 && g.getState(null).phase !== 'gameOver'; i++) {
    const st = g.getState(null);
    if (st.phase === 'defend') { g.passDefense(); continue; }
    if (st.phase === 'discard') {
      const me = g.getState(st.currentPlayer).players[st.currentPlayer];
      g.discard(me.hand.slice(0, me.handCount - me.maxHand).map((c) => c.cardId));
      continue;
    }
    g.endTurn();
  }
  assert.ok(log.some((e) => e.event === 'deckShuffled'), '山札が尽きて、捨て札から戻った');
  const s = g.getState(null);
  for (const id of ['p1', 'p2']) {
    const p = s.players[id];
    const onBoard = 0; // 兵士は出していないので、盤面に出たカードはない
    assert.equal(p.deckCount + p.discardCount + p.exhaustedCount + p.handCount + onBoard, total, id);
  }
});

test('部屋：コスト制は、編成したデッキも見本も選べ、決まりに合わないデッキは断る', () => {
  const lobby = new Lobby(loadData(), () => seededRng(1), { cpuDelayMs: 0 });
  const r = lobby.join('deck', 'A');
  const { room, seat } = lobby.findSeat(r.token);
  const modes = () => room.roomInfo().choices.deckModes.map((m) => m.id);
  assert.ok(modes().includes('cost'));
  assert.equal(room.action(seat, 'setRules', [{ deckMode: 'cost' }]).ok, true);
  const info = room.roomInfo();
  assert.ok(info.choices.costDecks.length >= 3);
  assert.ok(info.choices.decks.every((d) => !decks[d.id].costDeck), '1人1つのデッキの一覧に、コスト制の見本は出ない');
  assert.equal(info.players[0].costDeck, loadJson('rules.json').defaultCostDeck);

  const bad = room.action(seat, 'setSeat', [{ deckList: { infantry: 10 } }]);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /決まりに合いません/);
  assert.equal(room.action(seat, 'setSeat', [{ deckList: GOOD }]).ok, true);
  assert.equal(room.roomInfo().players[0].costDeck, 'custom');
  assert.equal(room.action(seat, 'setSeat', [{ costDeck: 'costFortress' }]).ok, true);
  assert.equal(room.roomInfo().players[0].costDeck, 'costFortress');
  assert.equal(room.action(seat, 'setSeat', [{ costDeck: 'balanced' }]).ok, false);

  room.action(seat, 'setSeat', [{ deckList: GOOD }]);
  room.action(seat, 'addCpu', []);
  assert.equal(room.action(seat, 'start', []).ok, true);
  const st = room.game.getState('p1');
  assert.equal(st.deckMode, 'cost');
  assert.equal(st.players.p1.deckId, 'custom');
  assert.equal(st.players.p2.deckId, loadJson('rules.json').defaultCostDeck);
});
