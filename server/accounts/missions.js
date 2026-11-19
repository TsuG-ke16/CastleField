// ミッションとシーズン報酬。進み具合は、サーバーが確定した試合の結果とゲームのイベント（合成・魔物のとどめ）から数える。
// クライアントが「達成した」と申告する口はない。報酬は(ユーザー, ミッション, 期間)ごとに1回だけ（二重に受け取れない）。
// 期間の区切りは日本時間（JST）。数値は data/missions.json・data/seasons.json（仮）。
import { createHash } from 'node:crypto';
import { AccountError } from './accounts.js';

const JST = 9 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
const hash = (s) => createHash('sha256').update(s).digest('hex');

export class Missions {
  constructor({ db, config, economy, ranking, seasons, now = () => Date.now() }) {
    Object.assign(this, { db, cfg: config, economy, ranking, seasons, now });
    const all = [...config.daily, ...config.weekly, ...config.season];
    this.byId = new Map(all.map((m) => [m.id, m]));
    if (this.byId.size !== all.length) throw new Error('missions.json: id が重なっています');
  }

  // ---- 期間 ----
  dayKey(t = this.now()) { return new Date(t + JST).toISOString().slice(0, 10); }
  weekStart(t = this.now()) { // 月曜 0:00 JST
    const d = new Date(t + JST); const dow = (d.getUTCDay() + 6) % 7;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) - JST;
  }
  periods(t = this.now()) {
    const dayStart = Math.floor((t + JST) / DAY) * DAY - JST;
    const ws = this.weekStart(t);
    const season = this.ranking.seasonAt(t);
    return {
      daily: { key: this.dayKey(t), resetsAt: dayStart + DAY },
      weekly: { key: `w${this.dayKey(ws + JST)}`, resetsAt: ws + 7 * DAY },
      season: { key: `s${season.id}`, resetsAt: season.endsAt },
    };
  }

  /** その日のデイリー（プールから、日付で決まる3つ。全員同じ） */
  dailyList(key) {
    const pool = [...this.cfg.daily].sort((a, b) => (hash(`${key}:${a.id}`) < hash(`${key}:${b.id}`) ? -1 : 1));
    return pool.slice(0, this.cfg.pickDaily ?? 3);
  }
  active(t = this.now()) {
    const p = this.periods(t);
    return {
      daily: { ...p.daily, missions: this.dailyList(p.daily.key) },
      weekly: { ...p.weekly, missions: this.cfg.weekly },
      season: { ...p.season, missions: this.cfg.season },
    };
  }

  // ---- 進み具合 ----
  /**
   * 確定した試合の結果を反映する（recordMatch と同じトランザクションの中で呼ぶ）。
   * @param {object} m 試合の結果（seats[].stats に { fuses, monsters }）  @param {Map} results recordMatch が返した、数える対象になった人
   */
  applyMatch(m, results) {
    if (!results) return;
    const act = this.active(m.endedAt ?? this.now());
    const week = this.periods(m.endedAt ?? this.now());
    void week;
    for (const s of m.seats) {
      const r = s.userId && results.get(s.userId);
      if (!r) continue; // 戦績に数えない試合・人は、ミッションにも数えない
      const delta = {
        matches: 1, wins: r.won ? 1 : 0, fuses: s.stats?.fuses ?? 0, monsters: s.stats?.monsters ?? 0,
        rankedMatches: m.ranked ? 1 : 0, rankedWins: m.ranked && r.won ? 1 : 0,
      };
      for (const kind of ['daily', 'weekly', 'season']) {
        for (const mission of act[kind].missions) {
          const add = delta[mission.metric] ?? 0;
          if (add > 0) this.bump(s.userId, mission, act[kind].key, add);
        }
      }
    }
  }

  bump(userId, mission, periodKey, add) {
    const t = this.now();
    const cur = this.db.get('SELECT progress, completed_at FROM mission_progress WHERE user_id = ? AND mission_id = ? AND period_key = ?', userId, mission.id, periodKey);
    const next = Math.min(mission.target, (cur?.progress ?? 0) + add);
    const done = next >= mission.target;
    this.db.run(`INSERT INTO mission_progress (user_id, mission_id, period_key, progress, completed_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, mission_id, period_key) DO UPDATE SET progress = excluded.progress, completed_at = COALESCE(mission_progress.completed_at, excluded.completed_at)`,
      userId, mission.id, periodKey, next, done ? t : null);
  }

  view(userId) {
    const act = this.active();
    const out = {};
    for (const kind of ['daily', 'weekly', 'season']) {
      const rows = new Map(this.db.all('SELECT mission_id, progress, completed_at, claimed_at FROM mission_progress WHERE user_id = ? AND period_key = ?', userId, act[kind].key).map((r) => [r.mission_id, r]));
      out[kind] = {
        key: act[kind].key, resetsAt: act[kind].resetsAt,
        missions: act[kind].missions.map((m) => {
          const r = rows.get(m.id);
          return { id: m.id, name: m.name, target: m.target, coins: m.coins, progress: r?.progress ?? 0, completed: !!r?.completed_at, claimed: !!r?.claimed_at };
        }),
      };
    }
    return out;
  }

  /** 報酬を受け取る。今の期間の、達成済みで未受け取りのものだけ。コインの加算と「受け取った」の記録は1つのトランザクション */
  claim(userId, missionId) {
    const m = typeof missionId === 'string' ? this.byId.get(missionId) : null;
    if (!m) throw new AccountError('そのミッションはありません', 404);
    const act = this.active();
    const kind = ['daily', 'weekly', 'season'].find((k) => act[k].missions.some((x) => x.id === m.id));
    if (!kind) throw new AccountError('そのミッションは、いまはありません', 404);
    return this.db.tx(() => {
      const key = act[kind].key;
      const r = this.db.get('SELECT completed_at, claimed_at FROM mission_progress WHERE user_id = ? AND mission_id = ? AND period_key = ?', userId, m.id, key);
      if (!r?.completed_at) throw new AccountError('まだ達成していません', 409);
      if (r.claimed_at) throw new AccountError('もう受け取っています', 409);
      this.db.run('UPDATE mission_progress SET claimed_at = ? WHERE user_id = ? AND mission_id = ? AND period_key = ?', this.now(), userId, m.id, key);
      const balance = this.economy.credit(userId, m.coins, 'mission', `${m.id}:${key}`);
      return { missionId: m.id, coins: m.coins, balance };
    });
  }

  // ---- シーズン報酬 ----
  /** 終わったシーズンの、到達ランク（最高）に応じた報酬の一覧 */
  seasonRewards(userId, modeId = 'kingdom') {
    const cur = this.ranking.seasonAt().id;
    const min = this.seasons.minMatchesForReward ?? 5;
    const claimed = new Map(this.db.all('SELECT season FROM season_rewards WHERE user_id = ? AND mode_id = ?', userId, modeId).map((r) => [r.season, true]));
    return this.db.all('SELECT season, peak_rp, matches, placement_left FROM season_stats WHERE user_id = ? AND mode_id = ? AND season < ? ORDER BY season DESC', userId, modeId, cur).map((r) => {
      const eligible = r.placement_left === 0 && r.matches >= min;
      const tier = this.ranking.displayRank(r.peak_rp);
      const items = eligible ? this.rewardItems(tier.tierId) : [];
      return { season: r.season, peak: eligible ? tier : null, items, eligible, claimed: claimed.has(r.season), matches: r.matches, minMatches: min };
    });
  }

  /** 階級の報酬（アイコンフレーム・カード裏面）。景品の一覧にあるものだけ */
  rewardItems(tierId) {
    const rw = this.seasons.rewards?.[tierId] ?? {};
    return [rw.iconFrame, rw.cardBack].filter((id) => id && this.economy.item(id)).map((id) => this.economy.item(id));
  }

  claimSeason(userId, season, modeId = 'kingdom') {
    return this.db.tx(() => {
      const r = this.seasonRewards(userId, modeId).find((x) => x.season === season);
      if (!r) throw new AccountError('そのシーズンの報酬はありません', 404);
      if (!r.eligible || !r.items.length) throw new AccountError(`報酬には、認定戦を終えて${r.minMatches}試合以上のランク戦が必要です`, 409);
      if (r.claimed) throw new AccountError('もう受け取っています', 409);
      this.db.run('INSERT INTO season_rewards (user_id, season, mode_id, tier_id, coins, claimed_at) VALUES (?, ?, ?, ?, ?, ?)', userId, season, modeId, r.peak.tierId, 0, this.now());
      for (const it of r.items) this.economy.grant(userId, it.id, 'season');
      return { season, items: r.items.map((it) => it.id), tier: r.peak.divisionLabel };
    });
  }

  /** 古い期間の行を消す（受け取らなかった日・週のミッションは、期間が終わると受け取れない。シーズンの記録は残す） */
  purge() {
    const act = this.active();
    this.db.run("DELETE FROM mission_progress WHERE period_key NOT LIKE 's%' AND period_key NOT IN (?, ?)", act.daily.key, act.weekly.key);
  }
}
