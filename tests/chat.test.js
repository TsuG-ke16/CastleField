// チャットとスタンプ（サーバー）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby, CHAT_MAX_LENGTH, CHAT_INTERVAL_MS } from '../server/rooms.js';
import { loadData } from '../server/server.js';
import { seededRng } from './helpers.js';

function newLobby() {
  let seed = 1;
  return new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0 });
}
function enter(lobby, pass, name) {
  const r = lobby.join(pass, name);
  assert.equal(r.ok, true, r.reason);
  const { room, seat } = lobby.findSeat(r.token);
  const seen = [];
  room.connect(seat, (m) => seen.push(m));
  return { room, seat, seen, chats: () => seen.filter((m) => m.type === 'chat') };
}
/** 送る間隔の制限を、時間を進めずに越える */
const rewind = (seat) => { seat.lastChatAt -= CHAT_INTERVAL_MS + 1; };

test('チャット：文字とスタンプが、同じ部屋の全員に届く', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'chat', 'A');
  const b = enter(lobby, 'chat', 'B');
  assert.deepEqual(a.room.action(a.seat, 'chat', [{ text: 'よろしく' }]), { ok: true });
  rewind(a.seat);
  assert.deepEqual(a.room.action(a.seat, 'chat', [{ stamp: 'nice' }]), { ok: true });
  for (const who of [a, b]) {
    const got = who.chats();
    assert.equal(got.length, 2);
    assert.deepEqual([got[0].playerId, got[0].name, got[0].text], ['p1', 'A', 'よろしく']);
    assert.deepEqual([got[1].playerId, got[1].stamp], ['p1', 'nice']);
  }
});

test('チャット：試合の前も試合中も送れる。CPU の席は送れない', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'chat2', 'A');
  a.room.action(a.seat, 'addCpu', []);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  assert.equal(a.room.action(a.seat, 'chat', [{ stamp: 'go' }]).ok, true);
  const cpu = a.room.seats.find((s) => s.cpu);
  assert.equal(a.room.action(cpu, 'chat', [{ stamp: 'go' }]).ok, false);
});

test('チャット：形の間違い・長すぎる文・知らないスタンプ・空は断る', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'chat3', 'A');
  const send = (p) => { const r = a.room.action(a.seat, 'chat', [p]); if (r.ok) rewind(a.seat); return r; };
  assert.equal(send(undefined).ok, false);
  assert.equal(send({}).ok, false);
  assert.equal(send({ text: 'a', stamp: 'nice' }).ok, false);
  assert.equal(send({ text: 5 }).ok, false);
  assert.equal(send({ text: '   ' }).ok, false);
  assert.equal(send({ text: 'あ'.repeat(CHAT_MAX_LENGTH + 1) }).ok, false);
  assert.equal(send({ stamp: 'nope' }).ok, false);
  assert.equal(send({ stamp: { x: 1 } }).ok, false);
  assert.equal(send({ text: 'あ'.repeat(CHAT_MAX_LENGTH) }).ok, true);
  assert.equal(a.chats().length, 1);
});

test('チャット：制御文字・改行は空白になり、前後の空白は取る', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'chat4', 'A');
  a.room.action(a.seat, 'chat', [{ text: '  こんにちは\nせかい\u0007 ' }]);
  assert.equal(a.chats()[0].text, 'こんにちは せかい');
});

test('チャット：つづけて送ると、少し待つように断る', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'chat5', 'A');
  assert.equal(a.room.action(a.seat, 'chat', [{ stamp: 'hello' }]).ok, true);
  const second = a.room.action(a.seat, 'chat', [{ stamp: 'hello' }]);
  assert.equal(second.ok, false);
  assert.match(second.reason, /待って/);
});

test('チャット：あとからつないだ人に、履歴が届く（部屋の席が詰まっても、いまの席番号で）', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'chat6', 'A');
  const b = enter(lobby, 'chat6', 'B');
  b.room.action(b.seat, 'chat', [{ text: 'おはよう' }]);
  a.room.action(a.seat, 'leave', []); // A が出て、B が p1 に詰まる
  const late = { seen: [] };
  b.room.connect(b.seat, (m) => late.seen.push(m));
  const log = late.seen.find((m) => m.type === 'chatLog');
  assert.equal(log.messages.length, 1);
  assert.deepEqual([log.messages[0].playerId, log.messages[0].name, log.messages[0].text], ['p1', 'B', 'おはよう']);
});

test('data/stamps.json：id が重ならず、アイコンとラベルがある', () => {
  const { stamps } = loadData();
  assert.ok(stamps.length >= 6);
  assert.equal(new Set(stamps.map((s) => s.id)).size, stamps.length);
  for (const s of stamps) assert.ok(s.icon && s.label);
});
