// 4陣営モード（data/factions/）をオンラインの部屋で遊ぶテスト：モードの読み込み・席ごとの陣営・開始・CPU との試合・イベントの隠し方。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../server/rooms.js';
import { loadData, loadModeData } from '../server/server.js';
import { filterEventFor } from '../js/game/visibility.js';
import { EVENT_TYPES } from '../js/game/Game.js';
import { Game } from '../js/game/Game.js';
import { createGameServer } from '../server/server.js';
import { seededRng, loadFixture, recordEvents } from './helpers.js';

function newLobby() {
  let seed = 1;
  return new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0, modeData: loadModeData() });
}
function enter(lobby, pass = 'f', name = 'A') {
  const r = lobby.join(pass, name, null, 'factions');
  assert.equal(r.ok, true, r.reason);
  const { room, seat } = lobby.findSeat(r.token);
  const seen = [];
  room.connect(seat, (m) => seen.push(m));
  return { room, seat, seen, lastRoom: () => seen.filter((m) => m.type === 'room').at(-1) };
}

test('読み込み：4陣営モードのデータ（陣営ごとのカード表を合わせたカード・属性・反応・各陣営のデッキ）を読める', () => {
  const d = loadData(undefined, 'factions');
  assert.deepEqual(d.factions, ['kingdom', 'forest', 'demon', 'dragon']);
  assert.deepEqual(Object.keys(d.decks), d.factions);
  assert.ok(d.elements && d.reactions);
  assert.equal(d.rarities, null);
  assert.ok(d.cards.infantry === undefined || typeof d.cards.infantry === 'object');
  assert.ok(Object.hasOwn(loadModeData(), 'factions'));
  // 通常モードにはキーが付かない
  assert.equal(loadData().factions, undefined);
});

test('部屋：陣営を席ごとに選べる。room の形・不正な陣営・始まる前だけ', () => {
  const lobby = newLobby();
  const a = enter(lobby);
  const room0 = a.lastRoom();
  assert.deepEqual(room0.choices.factions.map((f) => f.id), ['kingdom', 'forest', 'demon', 'dragon']);
  assert.ok(room0.choices.factions.every((f) => typeof f.name === 'string'));
  assert.equal(room0.players[0].faction, 'kingdom', '既定は王国');
  assert.equal(room0.settings.deckMode, 'own');
  assert.deepEqual(room0.choices.decks, []);
  assert.equal(a.room.action(a.seat, 'setSeat', [{ faction: 'dragon' }]).ok, true);
  assert.equal(a.lastRoom().players[0].faction, 'dragon');
  for (const bad of ['nothing', 3, null, '__proto__']) {
    const r = a.room.action(a.seat, 'setSeat', [{ faction: bad }]);
    assert.equal(r.ok, false);
    assert.equal(typeof r.reason, 'string');
  }
  assert.equal(a.room.action(a.seat, 'setSeat', [{ deck: 'kingdom' }]).ok, false);
  // CPU の席は部屋主が選ぶ。ほかの人は選べない
  const cpu = a.room.action(a.seat, 'addCpu', ['hard']);
  assert.equal(a.room.action(a.seat, 'setSeat', [{ faction: 'demon' }, cpu.playerId]).ok, true);
  const b = enter(lobby, 'f', 'B');
  assert.equal(b.room, a.room);
  assert.equal(b.room.action(b.seat, 'setSeat', [{ faction: 'forest' }, cpu.playerId]).ok, false);
  assert.equal(b.room.action(b.seat, 'setSeat', [{ faction: 'forest' }]).ok, true);
  assert.deepEqual(a.lastRoom().players.map((p) => p.faction), ['dragon', 'demon', 'forest']);
  // チーム戦・ほかの山札の形は使えない
  assert.deepEqual(a.room.action(a.seat, 'setRules', [{ teams: 'auto' }]), { ok: false, reason: '4陣営ではチーム戦は使えません' });
  assert.equal(a.room.action(a.seat, 'setRules', [{ deckMode: 'shared' }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setSeat', [{ team: 't2' }]).ok, false);
  // 始まったら変えられない。試合の山札は選んだ陣営
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  const st = a.room.game.getState('p1');
  assert.equal(st.deckMode, 'own');
  assert.deepEqual(['p1', 'p2', 'p3'].map((p) => st.players[p].deckId), ['dragon', 'demon', 'forest']);
  assert.equal(a.room.action(a.seat, 'setSeat', [{ faction: 'kingdom' }]).ok, false);
});

test('ほかのモードの部屋には陣営がない（faction は null・choices.factions は空）。陣営は選べない', () => {
  const lobby = newLobby();
  const r = lobby.join('n', 'A');
  const { room, seat } = lobby.findSeat(r.token);
  const info = room.roomInfo();
  assert.equal(info.players[0].faction, null);
  assert.deepEqual(info.choices.factions, []);
  assert.equal(room.action(seat, 'setSeat', [{ faction: 'kingdom' }]).ok, false);
});

test('1人＋CPU 3人（陣営ばらばら）の試合が決着まで進む', () => {
  const lobby = newLobby();
  const a = enter(lobby);
  const cpus = ['hard', 'normal', 'easy'].map((l) => a.room.action(a.seat, 'addCpu', [l]).playerId);
  ['forest', 'demon', 'dragon'].forEach((f, i) => assert.equal(a.room.action(a.seat, 'setSeat', [{ faction: f }, cpus[i]]).ok, true));
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  let over = null;
  for (let i = 0; i < 20000 && !over; i++) {
    const game = a.room.game;
    const st = game.getState(null);
    if (st.phase === 'gameOver') { over = st; break; }
    if (st.phase === 'mulligan') { for (const id of st.mulligan.pending) { const s = a.room.seatOf(id); assert.equal(s.cpu, null); a.room.action(s, 'mulligan', [[]]); } continue; }
    if (st.phase === 'defend') { const s = a.room.seatOf(st.defense.defenderId); assert.equal(s.cpu, null); a.room.action(s, 'passDefense', []); continue; }
    const s = a.room.seatOf(st.currentPlayer);
    assert.equal(s.cpu, null, 'CPU の番で止まっている');
    if (st.phase === 'discard') {
      const me = game.getState(s.playerId).players[s.playerId];
      a.room.action(s, 'discard', [me.hand.slice(0, me.handCount - me.maxHand).map((c) => c.cardId)]);
    } else a.room.action(s, 'endTurn', []);
  }
  assert.ok(over?.winner, '決着する');
  assert.ok(a.seen.some((m) => m.event === 'gameOver'));
});

test('2人（人2人）でも始められ、数手進められる', () => {
  const lobby = newLobby();
  const a = enter(lobby);
  const b = enter(lobby, 'f', 'B');
  a.room.action(a.seat, 'setSeat', [{ faction: 'demon' }]);
  b.room.action(b.seat, 'setSeat', [{ faction: 'forest' }]);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  const g = a.room.game;
  for (const s of [a.seat, b.seat]) if (g.getState(null).phase === 'mulligan') assert.equal(a.room.action(s, 'mulligan', [[]]).ok, true);
  for (let i = 0; i < 4; i++) {
    const cur = a.room.seatOf(g.getState(null).currentPlayer);
    const r = a.room.action(cur, 'endTurn', []);
    assert.equal(r.ok, true, r.reason);
    const st = g.getState(null);
    if (st.phase === 'discard') {
      const me = g.getState(cur.playerId).players[cur.playerId];
      assert.equal(a.room.action(cur, 'discard', [me.hand.slice(0, me.handCount - me.maxHand).map((c) => c.cardId)]).ok, true);
    }
  }
  assert.ok(g.getState(null).turn >= 4);
});

test('新しいイベントは EVENT_TYPES にあり、そのまま送られる。忍者の隠しは Game が本当に付ける', () => {
  const news = ['soldierHealed', 'castleGuardSet', 'castleGuarded', 'shieldBroken', 'castleHealCut', 'castleHealCutEnded'];
  for (const t of news) {
    assert.ok(EVENT_TYPES.includes(t), t);
    const p = { playerId: 'p1', amount: 2 };
    assert.deepEqual(filterEventFor(t, p, 'p2'), p, `${t} はそのまま送る`);
  }
  const cards = {
    ...loadFixture('cards.json'),
    ninja: { name: '下忍', kind: 'soldier', role: 'ninja', hp: 3, attack: 2, speed: 1, count: 1 },
    decoy: { name: '身代わり', kind: 'defense', effect: 'guardCastle', count: 1 },
  };
  const game = new Game({ cards, rules: { ...loadFixture('rules.json'), laneLength: 5, defenseReaction: false }, rng: seededRng(1) });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(40).fill('heal'));
  game.start();
  const play = (type, target) => {
    const pid = game.currentPlayer;
    game.debugSetHand(pid, [type]);
    const r = game.playCard(game.players[pid].hand[0].cardId, target);
    assert.equal(r.ok, true, r.reason);
    return game.players[pid].soldiers.at(-1);
  };
  const ninja = play('ninja');
  play('decoy', { soldierId: ninja.soldierId });
  // 忍者に関わるイベントには、Game が stealth を付ける（相手には送らない）
  const set = log.find((e) => e.event === 'castleGuardSet');
  assert.equal(set.stealth, 'p1');
  assert.equal(filterEventFor('castleGuardSet', set, 'p2'), null);
  assert.ok(filterEventFor('castleGuardSet', set, 'p1'));
  // shieldBroken（忍者は魔法・反応の的にならないので、盤面では起きない）：忍者の持ち主の陣地を stealth に付ける決まりだけ確かめる
  game.emit('shieldBroken', { playerId: 'p1', soldierId: ninja.soldierId, amount: 1 });
  const broken = log.find((e) => e.event === 'shieldBroken');
  assert.equal(broken.stealth, 'p1');
  assert.equal(filterEventFor('shieldBroken', broken, 'p2'), null);
  // 身代わりの castleGuarded：stealth は付けず、相手にも届く（城が攻撃を受けなかったことは伝わる）。隠すのは soldierId だけ
  game.currentPlayer = 'p2';
  game.guardCastleHit(game.players.p1, 5);
  const guarded = log.find((e) => e.event === 'castleGuarded');
  assert.equal(guarded.stealth, undefined);
  const seenByFoe = filterEventFor('castleGuarded', guarded, 'p2');
  assert.deepEqual(seenByFoe, { event: 'castleGuarded', playerId: 'p1', guardOwnerId: 'p1', amount: 5 });
  assert.equal(filterEventFor('castleGuarded', guarded, 'p1').soldierId, ninja.soldierId);
  assert.equal(filterEventFor('castleGuarded', guarded, null).soldierId, undefined);
  // 忍者でない兵士の castleGuarded は、そのまま
  const plain = { playerId: 'p1', soldierId: 's9', guardOwnerId: 'p1', amount: 5 };
  assert.deepEqual(filterEventFor('castleGuarded', plain, 'p2'), plain);
});

test('部屋：CPU を外す・始まる前に出ると席が詰まり、陣営は席についていく', () => {
  const lobby = newLobby();
  const a = enter(lobby);
  const c1 = a.room.action(a.seat, 'addCpu', ['easy']).playerId;
  a.room.action(a.seat, 'addCpu', ['easy']);
  a.room.action(a.seat, 'setSeat', [{ faction: 'demon' }, c1]);
  a.room.action(a.seat, 'setSeat', [{ faction: 'dragon' }, 'p3']);
  assert.equal(a.room.action(a.seat, 'removeCpu', [c1]).ok, true);
  assert.deepEqual(a.lastRoom().players.map((p) => [p.playerId, p.faction]), [['p1', 'kingdom'], ['p2', 'dragon']]);
  const b = enter(lobby, 'f', 'B');
  a.room.action(b.seat, 'setSeat', [{ faction: 'forest' }]);
  assert.equal(b.seat.playerId, 'p3');
  assert.equal(a.room.action(a.seat, 'setSeat', [{ faction: 'demon' }]).ok, true);
  assert.equal(a.room.action(a.seat, 'leave', []).ok, true);
  const room = b.lastRoom();
  assert.deepEqual(room.players.map((p) => [p.playerId, p.faction]), [['p1', 'dragon'], ['p2', 'forest']]);
  assert.equal(room.hostId, 'p2');
});

test('部屋：もう1回・部屋に戻ったあとも、陣営と deckId は同じ席に残る。deckMode "cost" は断る', () => {
  const lobby = newLobby();
  const a = enter(lobby);
  const cpu = a.room.action(a.seat, 'addCpu', ['hard']).playerId;
  a.room.action(a.seat, 'setSeat', [{ faction: 'dragon' }]);
  a.room.action(a.seat, 'setSeat', [{ faction: 'demon' }, cpu]);
  assert.deepEqual(a.room.action(a.seat, 'setRules', [{ deckMode: 'cost' }]).ok, false);
  assert.equal(a.room.settings.deckMode, 'own');
  const decks = () => ['p1', 'p2'].map((p) => a.room.game.getState(p).players[p].deckId);
  a.room.action(a.seat, 'start', []);
  assert.deepEqual(decks(), ['dragon', 'demon']);
  a.room.action(a.seat, 'surrender', []);
  assert.equal(a.room.game.phase, 'gameOver');
  assert.equal(a.room.action(a.seat, 'rematch', []).ok, true);
  assert.deepEqual(decks(), ['dragon', 'demon'], 'もう1回');
  a.room.action(a.seat, 'surrender', []);
  assert.equal(a.room.action(a.seat, 'backToRoom', []).ok, true);
  assert.deepEqual(a.lastRoom().players.map((p) => p.faction), ['dragon', 'demon']);
  a.room.action(a.seat, 'setSeat', [{ faction: 'forest' }]);
  a.room.action(a.seat, 'start', []);
  assert.deepEqual(decks(), ['forest', 'demon'], '部屋に戻って変えたあと');
});

test('HTTP：/api/join に mode: "factions" を付けると4陣営の部屋に入れ、陣営を選んで始められる', async () => {
  let seed = 1;
  const server = createGameServer({ data: loadData(), modeData: loadModeData(), makeRng: () => seededRng(seed++), cpuDelayMs: 0 });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const post = async (path, body) => (await fetch(base + path, { method: 'POST', body: JSON.stringify(body) })).json();
  try {
    const a = await post('/api/join', { passphrase: 'f4', name: 'A', mode: 'factions' });
    assert.equal(a.ok, true, a.reason);
    assert.deepEqual(await post('/api/join', { passphrase: 'f4', name: 'B' }), { ok: false, reason: 'その合言葉の部屋は別のモードです' });
    assert.equal((await post('/api/join', { passphrase: 'zz', name: 'B', mode: 'nothing' })).ok, false);
    assert.equal((await post('/api/action', { token: a.token, method: 'setSeat', args: [{ faction: 'dragon' }] })).ok, true);
    assert.equal((await post('/api/action', { token: a.token, method: 'setSeat', args: [{ faction: 'x' }] })).ok, false);
    assert.equal((await post('/api/action', { token: a.token, method: 'addCpu', args: ['normal'] })).ok, true);
    assert.equal((await post('/api/action', { token: a.token, method: 'start', args: [] })).ok, true);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
