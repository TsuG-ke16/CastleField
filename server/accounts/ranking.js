// ランク：内部レーティング（MMR）、ランクポイント（RP）、表示ランク、認定戦、シーズン、ランキング。
// 値は、サーバーが確定した試合の結果（recordMatch と同じトランザクション）からだけ変わる。クライアントから指定する口はない。
// 数値はすべて data/ranks.json・data/seasons.json（仮）。
const DEFAULT_RANKS = {
  initialMmr: 1000, placementMatches: 5, elo: { k: 32, placementK: 64, scale: 400 },
  rp: { win: 22, loss: 18, minGain: 10, maxGain: 40, minLoss: 8, maxLoss: 30 }, rpFromMmr: { base: 800, perMmr: 2, max: 900 },
  tiers: [{ id: 'iron', name: 'Iron', start: 0, divisions: 3, divisionRp: 100, color: '#888' }],
  matchmaking: { baseRange: 100, expandPerStep: 50, stepMs: 10000, maxRange: 800, timeoutMs: 90000, tickMs: 2000, resultKeepMs: 21600000 },
  ranked: { connectGraceMs: 60000, disconnectGraceMs: 90000, idleTurnMs: 180000 }, pairLimit: { windowMs: 86400000, fullGains: 3, halfUntil: 6 },
};
const DEFAULT_SEASONS = { epoch: '2026-01-01T00:00:00Z', lengthDays: 56, softReset: { mmrKeep: 0.5, placementMatches: 2 } };
export const MODE_DEFAULT = 'kingdom';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const DAY = 24 * 60 * 60 * 1000;

export class Ranking {
  constructor(db, { ranks = DEFAULT_RANKS, seasons = DEFAULT_SEASONS, now = () => Date.now() } = {}) {
    this.db = db;
    this.cfg = ranks;
    this.seasons = seasons;
    this.now = now;
  }

  // ---- シーズン ----
  seasonAt(t = this.now()) {
    const epoch = Date.parse(this.seasons.epoch);
    const len = this.seasons.lengthDays * DAY;
    const id = Math.max(1, Math.floor((t - epoch) / len) + 1);
    return { id, startsAt: epoch + (id - 1) * len, endsAt: epoch + id * len };
  }

  // ---- 個人の成績 ----
  rpFromMmr(mmr) {
    const c = this.cfg.rpFromMmr;
    return clamp(Math.round((mmr - c.base) * c.perMmr), 0, c.max);
  }

  /** 今のシーズンの成績の行を返す（なければ作る。前のシーズンがあれば、MMRを初期値に近づけて引き継ぐ） */
  entry(userId, modeId = MODE_DEFAULT) {
    const season = this.seasonAt().id;
    let row = this.db.get('SELECT * FROM season_stats WHERE user_id = ? AND season = ? AND mode_id = ?', userId, season, modeId);
    if (row) return row;
    const prev = this.db.get('SELECT * FROM season_stats WHERE user_id = ? AND mode_id = ? AND season < ? ORDER BY season DESC LIMIT 1', userId, modeId, season);
    let mmr = this.cfg.initialMmr; let rp = 0; let placement = this.cfg.placementMatches;
    if (prev) {
      mmr = Math.round(this.cfg.initialMmr + (prev.mmr - this.cfg.initialMmr) * this.seasons.softReset.mmrKeep);
      placement = this.seasons.softReset.placementMatches;
      rp = this.rpFromMmr(mmr);
    }
    this.db.run('INSERT INTO season_stats (user_id, season, mode_id, mmr, rp, peak_rp, placement_left) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, season, modeId, mmr, rp, rp, placement);
    return this.db.get('SELECT * FROM season_stats WHERE user_id = ? AND season = ? AND mode_id = ?', userId, season, modeId);
  }

  /** 順位（認定戦が終わっている人のうち、RP が自分より高い人の数 + 1） */
  position(row) {
    return this.db.get('SELECT COUNT(*) + 1 AS pos FROM season_stats WHERE season = ? AND mode_id = ? AND placement_left = 0 AND (rp > ? OR (rp = ? AND mmr > ?))',
      row.season, row.mode_id, row.rp, row.rp, row.mmr).pos;
  }

  /** RP と順位から、表示するランク。{ tierId, name, division, divisionLabel, rp, rpIntoDivision, rpForNext, color, tierIndex } */
  displayRank(rp, position = null) {
    const tiers = this.cfg.tiers;
    let idx = 0;
    for (let i = 0; i < tiers.length; i++) if (tiers[i].divisions > 0 && rp >= tiers[i].start) idx = i;
    const top = tiers.findIndex((t) => t.divisions === 0);
    const upperMin = top >= 0 ? tiers[top].start : Infinity;
    if (top >= 0 && rp >= upperMin && position != null) {
      // 上位階級：順位で決まる（Radiant は Immortal より人数が少ない）
      const byN = tiers.filter((t) => t.divisions === 0).sort((a, b) => a.topN - b.topN);
      const hit = byN.find((t) => position <= t.topN);
      if (hit) return { tierId: hit.id, name: hit.name, division: null, divisionLabel: hit.name, rp, rpIntoDivision: null, rpForNext: null, color: hit.color, tierIndex: tiers.indexOf(hit), position };
    }
    const t = tiers[idx];
    const width = t.divisionRp;
    const d = clamp(Math.floor((rp - t.start) / width), 0, t.divisions - 1);
    const into = rp - t.start - d * width;
    const label = ['I', 'II', 'III', 'IV', 'V'][d];
    const last = idx === tiers.findLastIndex((x) => x.divisions > 0) && d === t.divisions - 1;
    return { tierId: t.id, name: t.name, division: d + 1, divisionLabel: `${t.name} ${label}`, rp, rpIntoDivision: into, rpForNext: last ? null : width, color: t.color, tierIndex: idx };
  }

  /** 自分のランクの表示用のまとめ */
  summary(userId, modeId = MODE_DEFAULT) {
    const row = this.entry(userId, modeId);
    const placed = row.placement_left === 0;
    const pos = placed ? this.position(row) : null;
    return {
      season: this.seasonAt().id, modeId, placed, placementLeft: row.placement_left, placementTotal: this.cfg.placementMatches,
      matches: row.matches, wins: row.wins, mmr: undefined,
      rank: placed ? this.displayRank(row.rp, pos) : null, peak: placed ? this.displayRank(row.peak_rp) : null, position: pos,
    };
  }

  internalMmr(userId, modeId = MODE_DEFAULT) { return this.entry(userId, modeId).mmr; }

  // ---- 試合の結果 ----
  pairScale(userId, opponentId, t) {
    const lim = this.cfg.pairLimit;
    const n = this.db.get('SELECT COUNT(*) AS n FROM rating_changes WHERE user_id = ? AND opponent_id = ? AND at > ?', userId, opponentId, t - lim.windowMs).n;
    return n < lim.fullGains ? 1 : n < lim.halfUntil ? 0.5 : 0;
  }

  /**
   * ランク戦の結果を反映する（recordMatch と同じトランザクションの中で呼ぶ）。
   * 人間2人・別々のアカウント・どちらも正会員のときだけ。違えば何も変えない。
   */
  applyMatch(m) {
    if (!m.ranked || m.seats.length !== 2) return null;
    const [a, b] = m.seats;
    if (!a.userId || !b.userId || a.userId === b.userId || a.cpu || b.cpu) return null;
    const kinds = this.db.all('SELECT id, kind FROM users WHERE id IN (?, ?)', a.userId, b.userId);
    if (kinds.length !== 2 || kinds.some((u) => u.kind !== 'member')) return null;
    const modeId = m.modeId ?? MODE_DEFAULT;
    const t = this.now();
    const ea = this.entry(a.userId, modeId); const eb = this.entry(b.userId, modeId);
    const out = {};
    for (const [me, op, s] of [[ea, eb, a], [eb, ea, b]]) {
      const won = !!s.won;
      const expected = 1 / (1 + 10 ** ((op.mmr - me.mmr) / this.cfg.elo.scale));
      const placing = me.placement_left > 0;
      const k = placing ? this.cfg.elo.placementK : this.cfg.elo.k;
      const mmr = Math.max(100, Math.round(me.mmr + k * ((won ? 1 : 0) - expected)));
      let rp = me.rp; let placementLeft = me.placement_left;
      let scale = 1;
      if (placing) {
        placementLeft -= 1;
        if (placementLeft === 0) rp = this.rpFromMmr(mmr); // 認定戦が終わったら、MMR からランクを決める
      } else if (won) {
        scale = this.pairScale(s.userId, (s === a ? b : a).userId, t);
        const c = this.cfg.rp;
        rp += Math.round(clamp(Math.round(c.win * (0.5 + (1 - expected))), c.minGain, c.maxGain) * scale);
      } else {
        const c = this.cfg.rp;
        rp -= clamp(Math.round(c.loss * (0.5 + expected)), c.minLoss, c.maxLoss);
      }
      rp = Math.max(0, rp);
      const peak = Math.max(me.peak_rp, rp);
      this.db.run('UPDATE season_stats SET mmr = ?, rp = ?, peak_rp = ?, matches = matches + 1, wins = wins + ?, placement_left = ? WHERE user_id = ? AND season = ? AND mode_id = ?',
        mmr, rp, peak, won ? 1 : 0, placementLeft, s.userId, me.season, modeId);
      this.db.run('INSERT INTO rating_changes (match_id, user_id, opponent_id, season, mode_id, result, mmr_before, mmr_after, rp_before, rp_after, placement, scale, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        m.matchId, s.userId, (s === a ? b : a).userId, me.season, modeId, won ? 'win' : 'loss', me.mmr, mmr, me.rp, rp, placing ? 1 : 0, scale, t);
      out[s.userId] = { rpBefore: me.rp, rpAfter: rp, placement: placing };
    }
    this.db.run('UPDATE matches SET ranked = 1 WHERE id = ?', m.matchId);
    return out;
  }

  /** 直近のランク戦の変化（結果画面用）。MMR の数値は返さない */
  lastChange(userId) {
    const r = this.db.get('SELECT * FROM rating_changes WHERE user_id = ? ORDER BY id DESC LIMIT 1', userId);
    if (!r) return null;
    const row = this.entry(userId, r.mode_id);
    const placedNow = row.season === r.season && row.placement_left === 0;
    const before = r.placement ? null : this.displayRank(r.rp_before);
    const after = placedNow || !r.placement ? this.displayRank(r.rp_after) : null;
    return {
      matchId: r.match_id, result: r.result, placement: !!r.placement, placementLeft: row.season === r.season ? row.placement_left : 0,
      rpDelta: r.placement ? null : r.rp_after - r.rp_before, rpAfter: r.rp_after, rankBefore: before, rankAfter: after,
      promoted: !!(before && after && after.tierIndex * 10 + (after.division ? 4 - after.division : 0) > before.tierIndex * 10 + (before.division ? 4 - before.division : 0)),
      demoted: !!(before && after && after.tierIndex * 10 + (after.division ? 4 - after.division : 0) < before.tierIndex * 10 + (before.division ? 4 - before.division : 0)),
      scaled: r.scale < 1,
    };
  }

  // ---- ランキング ----
  leaderboard({ modeId = MODE_DEFAULT, limit = 50, season = null } = {}) {
    const s = season ?? this.seasonAt().id;
    const rows = this.db.all(`SELECT st.user_id, st.rp, st.peak_rp, st.mmr, st.matches, st.wins, u.display_name, p.icon, p.privacy_json
      FROM season_stats st JOIN users u ON u.id = st.user_id LEFT JOIN user_profiles p ON p.user_id = st.user_id
      WHERE st.season = ? AND st.mode_id = ? AND st.placement_left = 0 ORDER BY st.rp DESC, st.mmr DESC, st.user_id LIMIT ?`, s, modeId, Math.max(1, Math.min(100, limit)));
    return rows.map((r, i) => {
      let hide = false;
      try { hide = JSON.parse(r.privacy_json ?? '{}').ranking === 'private'; } catch { /* 既定（公開） */ }
      return { position: i + 1, userId: hide ? null : r.user_id, name: hide ? '匿名プレイヤー' : r.display_name, icon: hide ? null : r.icon ?? 'infantry', rank: this.displayRank(r.rp, i + 1), rp: r.rp, matches: r.matches, wins: r.wins };
    });
  }

  /** シーズンごとの記録（最高到達ランクを含む） */
  history(userId, modeId = MODE_DEFAULT) {
    return this.db.all('SELECT season, rp, peak_rp, matches, wins, placement_left FROM season_stats WHERE user_id = ? AND mode_id = ? ORDER BY season DESC', userId, modeId).map((r) => ({
      season: r.season, matches: r.matches, wins: r.wins, placed: r.placement_left === 0,
      rank: r.placement_left === 0 ? this.displayRank(r.rp) : null, peak: r.matches ? this.displayRank(r.peak_rp) : null,
    }));
  }

  bestRank(userId, modeId = MODE_DEFAULT) {
    const r = this.db.get('SELECT MAX(peak_rp) AS p, MAX(matches) AS m FROM season_stats WHERE user_id = ? AND mode_id = ? AND placement_left = 0', userId, modeId);
    return r?.p != null ? this.displayRank(r.p) : null;
  }
}
