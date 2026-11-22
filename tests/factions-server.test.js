// 4陣営モード（data/factions/）をオンラインの部屋で遊ぶテスト：モードの読み込み・席ごとの陣営・開始・CPU との試合・イベントの隠し方。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../server/rooms.js';
import { loadData, loadModeData } from '../server/server.js';
import { filterEventFor } from '../js/game/visibility.js';
import { EVENT_TYPES } from '../js/game/Game.js';
import { seededRng } from './helpers.js';

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

test('新しいイベントはサーバーで落ちず、忍者（stealth）の隠しが効く', () => {
  const news = ['soldierHealed', 'castleGuardSet', 'castleGuarded', 'shieldBroken', 'castleHealCut', 'castleHealCutEnded'];
  for (const t of news) assert.ok(EVENT_TYPES.includes(t), t);
  for (const t of news) {
    const p = { playerId: 'p1', soldierId: 's01', amount: 2, hp: 3 };
    assert.deepEqual(filterEventFor(t, p, 'p2'), p, `${t} はそのまま送る`);
    assert.equal(filterEventFor(t, { ...p, stealth: 'p1' }, 'p2'), null, `${t} は忍者なら相手に送らない`);
    assert.deepEqual(filterEventFor(t, { ...p, stealth: 'p1' }, 'p1'), { ...p, stealth: 'p1' });
  }
});
