// v2 のお財布をサーバーで持つときの通信（Rust サーバーの /api/economy/*）。
// 本人確認はランクマッチと同じゲスト（rankedClient の ensureIdentity）。コインの増減はすべてサーバーが決める。
import { ensureIdentity } from './rankedClient';

export interface ServerWallet {
  coins: number;
  points: number;
  pityCount: number;
  ownedSkins: string[];
  matches: number;
  wins: number;
  gachaRolls: number;
  claimedMissions: string[];
  migrated: boolean;
  matchRewardsLeft: number;
}

export type WalletResult = ({ ok: true } & ServerWallet & { granted?: number; added?: string[] }) | { ok: false; reason: string };

function base(serverUrl?: string): string {
  return (serverUrl || '').trim().replace(/\/+$/, '');
}

async function call<T>(serverUrl: string | undefined, name: string, path: string, body: Record<string, unknown> = {}): Promise<T> {
  const id = await ensureIdentity(serverUrl, name);
  const res = await fetch(`${base(serverUrl)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: id.userId, secret: id.secret, ...body }),
  });
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('サーバーにつながりません');
  }
}

export const economyApi = {
  wallet: (serverUrl: string | undefined, name: string) => call<WalletResult>(serverUrl, name, '/api/economy/wallet'),
  /** 端末の所持品をサーバーに移す（1回だけ。コインは移らない） */
  migrate: (serverUrl: string | undefined, name: string, ownedSkins: string[]) =>
    call<WalletResult>(serverUrl, name, '/api/economy/migrate', { ownedSkins }),
  matchReward: (serverUrl: string | undefined, name: string, won: boolean) =>
    call<WalletResult>(serverUrl, name, '/api/economy/matchReward', { won }),
  mission: (serverUrl: string | undefined, name: string, missionId: string) =>
    call<WalletResult>(serverUrl, name, '/api/economy/mission', { missionId }),
  async gacha(
    serverUrl: string | undefined,
    name: string,
    count: 1 | 10
  ): Promise<{ ok: true; results: Array<{ id: string; name: string; rarity: string; isNew: boolean }>; wallet: ServerWallet } | { ok: false; reason: string }> {
    return call(serverUrl, name, '/api/economy/gacha', { count });
  },
  async buy(
    serverUrl: string | undefined,
    name: string,
    itemId: string,
    usePoints: boolean
  ): Promise<{ ok: true; wallet: ServerWallet } | { ok: false; reason: string }> {
    return call(serverUrl, name, '/api/economy/buy', { itemId, usePoints });
  },
};
