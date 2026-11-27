// ランクマッチ（v2 Phase 8）の通信。点数はサーバーが決める。ここは頼んで結果を受け取るだけ。
// 本人確認は、サーバーが発行するゲストの userId と secret（この端末の localStorage に保存）。
import type { GameState } from './types';

export interface RankedIdentity {
  userId: string;
  secret: string;
  /** どのサーバーで発行したか（別のサーバーでは使えない） */
  server: string;
}

export interface DisplayRank {
  tierId: string;
  name: string;
  division: number | null;
  divisionLabel: string;
  rp: number;
  rpIntoDivision: number | null;
  rpForNext: number | null;
  color: string;
  tierIndex: number;
  position: number | null;
}

/** ほかの人に見せるプロフィール（サーバーが決める。フレームはサーバーの所持品にあるものだけ） */
export interface PublicProfile {
  name: string;
  avatar: string | null;
  iconFrame: string | null;
  rank: DisplayRank | null;
}

export interface RankedChange {
  matchId: string;
  result: 'win' | 'loss';
  placement: boolean;
  placementLeft: number;
  placedNow: boolean;
  rpDelta: number | null;
  rpAfter: number;
  rankBefore: DisplayRank | null;
  rankAfter: DisplayRank | null;
  promoted: boolean;
  demoted: boolean;
  scaled: boolean;
  /** ランクマッチの報酬のコイン（サーバーが渡した量） */
  coins?: number;
}

export interface RankedSummary {
  ok: boolean;
  reason?: string;
  name?: string;
  season: number;
  seasonEndsAt?: number;
  placed: boolean;
  placementLeft: number;
  placementTotal: number;
  matches: number;
  wins: number;
  rank: DisplayRank | null;
  peak: DisplayRank | null;
  position: number | null;
  lastChange: RankedChange | null;
}

export type RankedStatus =
  | { ok: boolean; reason?: string; state: 'idle' }
  | { ok: boolean; reason?: string; state: 'timeout' }
  | { ok: boolean; reason?: string; state: 'queued'; waitedMs: number; range: number; timeoutMs: number; queued: number }
  | {
      ok: boolean;
      reason?: string;
      state: 'matched';
      token: string;
      playerId: 'p1' | 'p2';
      opponentName: string;
      opponent: PublicProfile | null;
      finished: boolean;
      gameState: GameState;
    };

export interface SeasonReward {
  season: number;
  eligible: boolean;
  claimed: boolean;
  peak: DisplayRank | null;
  items: string[];
  matches: number;
  minMatches: number;
}

export interface LeaderboardEntry {
  position: number;
  name: string;
  avatar?: string | null;
  iconFrame?: string | null;
  rp: number;
  matches: number;
  wins: number;
  rank: DisplayRank;
}

const ID_KEY = 'castlefield_v2_ranked_identity';

function base(serverUrl?: string): string {
  return (serverUrl || '').trim().replace(/\/+$/, '');
}

function serverKey(serverUrl?: string): string {
  return base(serverUrl) || (typeof window !== 'undefined' ? window.location.origin : '');
}

export function loadIdentity(serverUrl?: string): RankedIdentity | null {
  try {
    const raw = localStorage.getItem(ID_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as RankedIdentity;
    if (!v?.userId || !v?.secret || v.server !== serverKey(serverUrl)) return null;
    return v;
  } catch {
    return null;
  }
}

function saveIdentity(id: RankedIdentity | null): void {
  try {
    if (id) localStorage.setItem(ID_KEY, JSON.stringify(id));
    else localStorage.removeItem(ID_KEY);
  } catch {
    // 保存できない（プライベートモードなど）ときは、その場かぎりのゲストになる
  }
}

async function postJson<T>(serverUrl: string | undefined, path: string, body: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${base(serverUrl)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: T;
  try {
    json = (await res.json()) as T;
  } catch {
    throw new Error('サーバーにつながりません（ランクマッチはオンラインサーバーが必要です）');
  }
  return { status: res.status, json };
}

/** 保存済みのゲストを返す。なければサーバーに発行してもらう */
export async function ensureIdentity(serverUrl: string | undefined, name: string): Promise<RankedIdentity> {
  const saved = loadIdentity(serverUrl);
  if (saved) return saved;
  const { json } = await postJson<{ ok: boolean; userId?: string; secret?: string; reason?: string }>(
    serverUrl,
    '/api/account/guest',
    { name }
  );
  if (!json.ok || !json.userId || !json.secret) throw new Error(json.reason || 'ゲスト登録に失敗しました');
  const id = { userId: json.userId, secret: json.secret, server: serverKey(serverUrl) };
  saveIdentity(id);
  return id;
}

/** 本人確認つきで呼ぶ。サーバーが本人を知らない（データが消えた）ときは、ゲストを作り直して1回だけやり直す */
async function authed<T extends { ok: boolean; reason?: string }>(
  serverUrl: string | undefined,
  name: string,
  path: string
): Promise<T> {
  let id = await ensureIdentity(serverUrl, name);
  let r = await postJson<T>(serverUrl, path, { userId: id.userId, secret: id.secret, name });
  if (r.status === 403) {
    saveIdentity(null);
    id = await ensureIdentity(serverUrl, name);
    r = await postJson<T>(serverUrl, path, { userId: id.userId, secret: id.secret, name });
  }
  return r.json;
}

export const rankedApi = {
  summary: (serverUrl: string | undefined, name: string) => authed<RankedSummary>(serverUrl, name, '/api/ranked/summary'),
  queue: (serverUrl: string | undefined, name: string) => authed<RankedStatus>(serverUrl, name, '/api/ranked/queue'),
  status: (serverUrl: string | undefined, name: string) => authed<RankedStatus>(serverUrl, name, '/api/ranked/status'),
  leave: (serverUrl: string | undefined, name: string) => authed<{ ok: boolean; reason?: string }>(serverUrl, name, '/api/ranked/leave'),
  seasonRewards: (serverUrl: string | undefined, name: string) =>
    authed<{ ok: boolean; reason?: string; season: number; rewards: SeasonReward[] }>(serverUrl, name, '/api/ranked/seasonRewards'),
  async claimSeason(serverUrl: string | undefined, name: string, season: number): Promise<{ ok: boolean; reason?: string; items?: string[] }> {
    const id = await ensureIdentity(serverUrl, name);
    const { json } = await postJson<{ ok: boolean; reason?: string; items?: string[] }>(serverUrl, '/api/ranked/claimSeason', {
      userId: id.userId,
      secret: id.secret,
      season,
    });
    return json;
  },
  /** 名前・アバター・アイコンフレームをサーバーに伝える（ほかの人に見せる）。iconFrame は null で外す、省略で変えない */
  async updateProfile(
    serverUrl: string | undefined,
    name: string,
    patch: { avatar?: string; iconFrame?: string | null }
  ): Promise<(PublicProfile & { ok: boolean; reason?: string }) | null> {
    const id = loadIdentity(serverUrl);
    if (!id) return null; // まだランクマッチを遊んでいない端末は送らない
    const { json } = await postJson<PublicProfile & { ok: boolean; reason?: string }>(serverUrl, '/api/account/profile', {
      userId: id.userId,
      secret: id.secret,
      name,
      ...patch,
    });
    return json;
  },
  async leaderboard(serverUrl?: string, limit = 20): Promise<{ ok: boolean; season: number; entries: LeaderboardEntry[] }> {
    const res = await fetch(`${base(serverUrl)}/api/ranked/leaderboard?limit=${limit}`);
    return (await res.json()) as { ok: boolean; season: number; entries: LeaderboardEntry[] };
  },
  async claimIdle(serverUrl: string | undefined, token: string): Promise<{ ok: boolean; reason?: string; state?: GameState }> {
    const { json } = await postJson<{ ok: boolean; reason?: string; state?: GameState }>(serverUrl, '/api/ranked/claimIdle', { token });
    return json;
  },
};

/** ホームなどに出す短い文：「Gold II・512RP」「認定戦 2/5」 */
export function rankLabel(s: RankedSummary | null): string {
  if (!s) return 'ランク未参加';
  if (!s.placed) {
    const done = s.placementTotal - s.placementLeft;
    return done === 0 ? 'ランク未参加' : `認定戦 ${done}/${s.placementTotal}`;
  }
  return s.rank ? `${s.rank.divisionLabel}・${s.rank.rp}RP` : 'ランク未参加';
}
