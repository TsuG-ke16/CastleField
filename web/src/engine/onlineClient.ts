import type { ActionResult, GameEvent, GameState } from './types';

export interface JoinRoomResponse {
  ok: boolean;
  token?: string;
  playerId?: string;
  started?: boolean;
  state?: GameState;
  reason?: string;
}

export interface StreamPacket {
  seq?: number;
  kind: 'state' | 'event';
  event?: GameEvent;
  state?: GameState;
}

function normalizeBaseUrl(raw?: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  return trimmed;
}

export async function checkServerHealth(serverUrl?: string): Promise<boolean> {
  const base = normalizeBaseUrl(serverUrl);
  try {
    const res = await fetch(`${base}/healthz`);
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return Boolean(json.ok);
  } catch {
    return false;
  }
}

export async function joinOnlineRoom(
  passphrase: string,
  options: { name?: string; cpu?: boolean; serverUrl?: string } = {}
): Promise<JoinRoomResponse> {
  const base = normalizeBaseUrl(options.serverUrl);
  const res = await fetch(`${base}/api/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      passphrase,
      name: options.name || 'プレイヤー',
      cpu: Boolean(options.cpu),
    }),
  });
  return (await res.json()) as JoinRoomResponse;
}

export async function sendOnlineAction(
  token: string,
  method: string,
  args: unknown[] = [],
  serverUrl?: string
): Promise<{ result: ActionResult; state?: GameState; seq?: number }> {
  const base = normalizeBaseUrl(serverUrl);
  const res = await fetch(`${base}/api/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, method, args }),
  });
  return (await res.json()) as { result: ActionResult; state?: GameState; seq?: number };
}

export class OnlineRoomSocket {
  private ws: WebSocket | null = null;
  private closedByCaller = false;
  private lastSeq = 0;
  private retryDelayMs = 500;
  private retryTimer: number | null = null;

  constructor(
    private token: string,
    private onPacket: (packet: StreamPacket) => void,
    private onStatus?: (status: 'connecting' | 'open' | 'reconnecting' | 'closed') => void,
    private serverUrl?: string
  ) {}

  connect(): void {
    this.closedByCaller = false;
    this.openSocket();
  }

  private buildWsUrl(): string {
    const base = normalizeBaseUrl(this.serverUrl);
    if (base) {
      const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
      return `${wsBase}/api/ws?token=${encodeURIComponent(this.token)}&lastSeq=${this.lastSeq}`;
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/ws?token=${encodeURIComponent(this.token)}&lastSeq=${this.lastSeq}`;
  }

  private openSocket(): void {
    if (this.closedByCaller) return;
    this.onStatus?.(this.lastSeq > 0 ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(this.buildWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      this.retryDelayMs = 500;
      this.onStatus?.('open');
    };

    ws.onmessage = (ev) => {
      try {
        const pkt = JSON.parse(String(ev.data)) as StreamPacket;
        if (typeof pkt.seq === 'number' && pkt.seq > this.lastSeq) {
          this.lastSeq = pkt.seq;
        }
        this.onPacket(pkt);
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onclose = () => {
      if (this.closedByCaller) {
        this.onStatus?.('closed');
        return;
      }
      this.onStatus?.('reconnecting');
      const delay = this.retryDelayMs;
      this.retryDelayMs = Math.min(8000, this.retryDelayMs * 2);
      this.retryTimer = window.setTimeout(() => this.openSocket(), delay);
    };
  }

  dispose(): void {
    this.closedByCaller = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
