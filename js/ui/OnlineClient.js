// オンライン対戦のクライアント。サーバー（CLAUDE.md「STEP 4」）と話して、画面に「まとまり」を渡す。
// - 操作は POST /api/action（返事は Promise）
// - 届くものは GET /api/stream（EventSource）。その操作のイベントを全部ためて、
//   最後の `state` が届いたところで「イベントの列 + 状態」の1まとまり（batch）にして渡す
// UI はゲームの状態を直接書き換えない（サーバーの Game を操作するだけ）。

async function postJson(path, body) {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { ok: false, reason: 'サーバーにつながりません' };
  }
}

export class OnlineClient {
  /**
   * @param {object} h
   * @param {(room: object) => void} h.onRoom 部屋の状態（人数・つながっているか・もう1回の投票）
   * @param {(batch: {events: {type: string, payload: object}[], state: object, playable: object[], upgrades: object}) => void} h.onBatch
   * @param {(connected: boolean) => void} h.onConnection
   */
  constructor({ onRoom, onBatch, onConnection }) {
    this.onRoom = onRoom;
    this.onBatch = onBatch;
    this.onConnection = onConnection;
    this.token = null;
    this.playerId = null;
    this.source = null;
    this.pending = [];
    this.playable = new Map();
  }

  /** 合言葉で部屋に入り、つなぐ。成功したら { ok: true } */
  async join(passphrase, name) {
    const res = await postJson('/api/join', { passphrase, name });
    if (!res.ok) return res;
    this.token = res.token;
    this.playerId = res.playerId;
    this.open();
    return { ok: true, playerId: res.playerId, roomId: res.roomId };
  }

  open() {
    this.source?.close();
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(this.token)}`);
    this.source = es;
    es.onopen = () => this.onConnection?.(true);
    es.onerror = () => this.onConnection?.(false);
    es.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.receive(msg);
    };
  }

  close() {
    this.source?.close();
    this.source = null;
  }

  receive(msg) {
    if (msg.type === 'room') {
      this.onRoom?.(msg);
    } else if (msg.type === 'event') {
      this.pending.push(this.adapt(msg.event, msg.payload));
    } else if (msg.type === 'state') {
      const events = this.pending;
      this.pending = [];
      this.lastState = msg.state;
      this.playable = new Map((msg.playable ?? []).map((p) => [p.cardId, p]));
      this.onBatch?.({ events, state: msg.state, playable: msg.playable ?? [], upgrades: msg.upgrades ?? {} });
    }
  }

  /** 相手の cardDrawn は枚数だけ届く。画面は cardIds の個数で演出するので、ダミーのIDを入れる */
  adapt(type, payload) {
    if (type === 'cardDrawn' && !payload.cardIds) {
      return { type, payload: { ...payload, cardIds: Array.from({ length: payload.count ?? 0 }, (_, i) => `hidden-${i}`) } };
    }
    return { type, payload };
  }

  /** そのカードを今出せるか（サーバーが状態と一緒に送ってきた結果） */
  canPlayCard(cardId) {
    return this.playable.get(cardId) ?? { ok: false, reason: 'そのカードは手札にありません' };
  }

  act(method, args = []) {
    return postJson('/api/action', { token: this.token, method, args });
  }

  /** 選ぶ必要がある対象の一覧（2つ以上あるときだけ） */
  choices(cardId) {
    const info = this.playable.get(cardId);
    return info?.ok && info.needsTarget ? (info.targets ?? []) : [];
  }

  playCard(cardId, target) {
    const info = this.playable.get(cardId);
    let t = target;
    // 対象を選ぶ必要があっても、今の画面は選ぶ場所がないので、相手の城か、自分の先頭の兵士にする
    if (!t && info?.needsTarget) {
      const list = info.targets ?? [];
      t = list.find((x) => x.playerId && x.playerId !== this.playerId) ?? this.frontSoldier(list);
    }
    return this.act('playCard', t ? [cardId, t] : [cardId]);
  }

  /** 兵士を選ぶカード：自分の兵士のうち、いちばん相手の城に近いもの */
  frontSoldier(list) {
    const mine = new Map((this.lastState?.players?.[this.playerId]?.soldiers ?? []).map((s) => [s.soldierId, s.position]));
    const cands = list.filter((x) => x.soldierId);
    cands.sort((a, b) => (mine.get(b.soldierId) ?? 0) - (mine.get(a.soldierId) ?? 0));
    return cands[0];
  }

  buyUpgrade(id) { return this.act('buyUpgrade', [id]); }
  endTurn() { return this.act('endTurn'); }
  discard(cardIds) { return this.act('discard', [cardIds]); }
  rematch() { return this.act('rematch'); }
}
