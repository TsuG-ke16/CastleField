// プレイヤーレベル・戦績・プロフィール・無料通貨。勝敗は「ゲームサーバーが決めた試合の結果」だけから記録する
// （クライアントが経験値や勝敗を申告する口はない）。数値は data/progression.json。
import { AccountError } from './accounts.js';

const DEFAULT_PROGRESSION = {
  maxLevel: 100, xpToNext: { base: 60, growth: 20 }, match: { base: 20, win: 15, minTurns: 4, cpuMultiplier: 0.5 },
  levelReward: { coins: 20, milestones: {} }, titles: [{ level: 1, name: '見習い兵' }],
};
const DEFAULT_PROFILE = { icons: [{ id: 'infantry', name: '歩兵', image: 'assets/units/infantry-blue.png' }], defaultPrivacy: { stats: 'public', history: 'private', decks: 'private', ranking: 'public' }, privacyLevels: ['public', 'friends', 'private'] };

export class Progress {
  constructor(db, accounts, { progression = DEFAULT_PROGRESSION, profile = DEFAULT_PROFILE, now = () => Date.now() } = {}) {
    this.db = db;
    this.accounts = accounts;
    this.cfg = progression;
    this.profileCfg = profile;
    this.now = now;
    this.economy = null; // Economy（あれば、対戦報酬のコイン・装備中のアイコン/称号を使う）
    this.ranking = null; // Ranking（あれば、ホーム・プロフィールにランクを出す）
    this.levelStarts = [0]; // levelStarts[L-1] = レベル L に必要な累計の経験値
    for (let l = 1; l < this.cfg.maxLevel; l++) this.levelStarts.push(this.levelStarts[l - 1] + this.xpToNext(l));
  }

  xpToNext(level) { return this.cfg.xpToNext.base + this.cfg.xpToNext.growth * (level - 1); }

  levelInfo(xp) {
    let level = 1;
    while (level < this.cfg.maxLevel && xp >= this.levelStarts[level]) level++;
    const maxed = level >= this.cfg.maxLevel;
    const start = this.levelStarts[level - 1];
    const need = maxed ? 0 : this.levelStarts[level] - start;
    return { level, xp, xpIntoLevel: maxed ? 0 : xp - start, xpForNext: need, maxed };
  }

  titleFor(level) {
    let name = this.cfg.titles[0]?.name ?? '';
    for (const t of this.cfg.titles) if (level >= t.level) name = t.name;
    return name;
  }

  rewardCoins(level) { return this.cfg.levelReward.milestones?.[String(level)] ?? this.cfg.levelReward.coins; }

  // ---- 試合の記録 ----
  /**
   * ゲームサーバーが決めた試合の結果を記録して、経験値を足す。同じ試合 ID は1回だけ（二重付与しない）。
   * @param {object} m { matchId, modeId, roomId, startedAt, endedAt, turns, reason, deckMode, winCondition,
   *   seats: [{ seat, userId|null, name, cpu|null, won, left, deckName? }] }
   * @returns {Map<string, object>|null} userId → 結果（xpGained・levelBefore・levelAfter）。すでに記録済みなら null
   */
  recordMatch(m) {
    return this.db.tx(() => {
      if (this.db.get('SELECT 1 AS x FROM matches WHERE id = ?', m.matchId)) return null;
      const t = this.now();
      this.db.run('INSERT INTO matches (id, mode_id, room_id, started_at, ended_at, turns, reason, player_count, deck_mode, win_condition) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        m.matchId, m.modeId ?? 'kingdom', m.roomId ?? null, m.startedAt ?? t, m.endedAt ?? t, m.turns, m.reason, m.seats.length, m.deckMode ?? null, m.winCondition ?? null);
      const perUser = new Map();
      for (const s of m.seats) if (s.userId) perUser.set(s.userId, (perUser.get(s.userId) ?? 0) + 1);
      const results = new Map();
      const seen = new Set();
      for (const s of m.seats) {
        const exists = s.userId && this.db.get('SELECT 1 AS x FROM users WHERE id = ?', s.userId);
        const userId = exists ? s.userId : null;
        // 同じアカウントが複数の席にいる試合（ひとり対戦での稼ぎ）は、戦績にも経験値にも数えない
        const opponentsAreOthers = m.seats.some((o) => o.seat !== s.seat && !(o.userId && o.userId === s.userId));
        const counted = userId && perUser.get(userId) === 1 && opponentsAreOthers ? 1 : 0;
        const xp = counted ? this.matchXp(m, s) : 0;
        const coins = xp > 0 ? this.matchCoins(m, s) : 0; // 経験値の対象になった試合だけ、コインも出る
        this.db.run('INSERT INTO match_players (match_id, seat, user_id, name, cpu, result, counted, left_early, xp_gained, deck_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          m.matchId, s.seat, userId && !seen.has(userId) ? userId : null,
          s.name, s.cpu ?? null, s.won ? 'win' : 'loss', counted, s.left ? 1 : 0, xp, s.deckName ?? null);
        if (userId) seen.add(userId);
        if (userId && counted) {
          const before = this.levelInfo(this.getXp(userId)).level;
          this.db.run('INSERT INTO user_progress (user_id, xp) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET xp = xp + excluded.xp', userId, xp);
          const after = this.levelInfo(this.getXp(userId)).level;
          const coinsGained = coins > 0 && this.economy ? this.economy.awardMatch(userId, m.matchId, coins) : 0;
          results.set(userId, { matchId: m.matchId, won: !!s.won, xpGained: xp, coinsGained, levelBefore: before, levelAfter: after, leveledUp: after > before });
        }
      }
      return results;
    });
  }

  matchXp(m, s) {
    const c = this.cfg.match;
    if (s.left || m.turns < c.minTurns) return 0; // すぐ抜けた・すぐ終わった試合では増えない
    const humans = m.seats.filter((o) => o.userId && o.seat !== s.seat).length;
    const raw = c.base + (s.won ? c.win : 0);
    return Math.max(0, Math.round(humans > 0 ? raw : raw * c.cpuMultiplier));
  }

  /** 対戦報酬のコイン（データは progression.json の matchCoins）。相手が人間でなければ少なくなる */
  matchCoins(m, s) {
    const c = this.cfg.matchCoins;
    if (!c) return 0;
    const humans = m.seats.filter((o) => o.userId && o.seat !== s.seat).length;
    const raw = c.base + (s.won ? c.win : 0);
    return Math.max(0, Math.round(humans > 0 ? raw : raw * c.cpuMultiplier));
  }

  getXp(userId) { return this.db.get('SELECT xp FROM user_progress WHERE user_id = ?', userId)?.xp ?? 0; }
  getCoins(userId) { return this.db.get('SELECT free_coins FROM wallets WHERE user_id = ?', userId)?.free_coins ?? 0; }

  /** 戦績。modeId を渡すと、そのモード（世界）だけ */
  stats(userId, modeId = null) {
    const r = this.db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(p.result = 'win'), 0) AS w FROM match_players p JOIN matches m ON m.id = p.match_id
      WHERE p.user_id = ? AND p.counted = 1 AND (? IS NULL OR m.mode_id = ?)`, userId, modeId, modeId);
    return { matches: r.n, wins: r.w, losses: r.n - r.w, winRate: r.n ? Math.round((r.w / r.n) * 1000) / 10 : null };
  }

  /** モードごとの戦績（試合のあるモードだけ） */
  statsByMode(userId) {
    const modes = this.db.all('SELECT DISTINCT m.mode_id AS id FROM match_players p JOIN matches m ON m.id = p.match_id WHERE p.user_id = ? AND p.counted = 1', userId);
    return Object.fromEntries(modes.map((m) => [m.id, this.stats(userId, m.id)]));
  }

  history(userId, limit = 20, modeId = null) {
    const n = Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 20));
    const rows = this.db.all(`SELECT m.id, m.mode_id, m.ended_at, m.turns, m.reason, m.player_count, p.result, p.xp_gained, p.deck_name, p.counted
      FROM match_players p JOIN matches m ON m.id = p.match_id WHERE p.user_id = ? AND (? IS NULL OR m.mode_id = ?) ORDER BY m.ended_at DESC, m.id DESC LIMIT ?`, userId, modeId, modeId, n);
    return rows.map((r) => ({
      matchId: r.id, modeId: r.mode_id, endedAt: r.ended_at, turns: r.turns, reason: r.reason, playerCount: r.player_count,
      result: r.result, xpGained: r.xp_gained, deckName: r.deck_name, counted: !!r.counted,
      opponents: this.db.all('SELECT name, cpu FROM match_players WHERE match_id = ? AND NOT (user_id IS ? ) ORDER BY seat', r.id, userId).map((o) => ({ name: o.name, cpu: o.cpu })),
    }));
  }

  /** 直近の1試合の結果（試合のあとの「経験値＋レベルアップ」の表示用） */
  lastMatch(userId) {
    const r = this.db.get(`SELECT p.match_id, p.result, p.xp_gained, p.counted, m.ended_at FROM match_players p JOIN matches m ON m.id = p.match_id
      WHERE p.user_id = ? ORDER BY m.ended_at DESC, m.id DESC LIMIT 1`, userId);
    if (!r) return null;
    const after = this.levelInfo(this.getXp(userId));
    const beforeXp = Math.max(0, after.xp - r.xp_gained);
    const coinsGained = this.db.get("SELECT delta FROM coin_ledger WHERE user_id = ? AND reason = 'match' AND ref = ?", userId, r.match_id)?.delta ?? 0;
    return { matchId: r.match_id, won: r.result === 'win', counted: !!r.counted, xpGained: r.xp_gained, coinsGained, levelBefore: this.levelInfo(beforeXp).level, ...after };
  }

  // ---- プロフィール ----
  privacy(userId) {
    const row = this.db.get('SELECT privacy_json FROM user_profiles WHERE user_id = ?', userId);
    let saved = {};
    try { saved = JSON.parse(row?.privacy_json ?? '{}'); } catch { /* 壊れていたら既定 */ }
    const out = { ...this.profileCfg.defaultPrivacy };
    for (const k of Object.keys(out)) if (this.profileCfg.privacyLevels.includes(saved[k])) out[k] = saved[k];
    return out;
  }

  profileRow(userId) {
    const row = this.db.get('SELECT icon, title FROM user_profiles WHERE user_id = ?', userId) ?? { icon: this.profileCfg.icons[0].id, title: null };
    const eq = this.economy?.equippedOf(userId) ?? {};
    return { icon: eq.icon ?? row.icon, title: eq.title ? this.economy.item(eq.title)?.text ?? row.title : row.title };
  }

  /** アイコンの id から画像（無料のアイコンと、ショップのアイコン） */
  iconImage(id) {
    return this.profileCfg.icons.find((i) => i.id === id)?.image ?? this.economy?.item(id)?.image ?? this.profileCfg.icons[0].image;
  }

  /** 選べるアイコン：無料のものと、持っているショップのアイコン */
  iconChoices(userId) {
    const own = (this.economy?.ownedIds(userId) ?? []).map((id) => this.economy.item(id)).filter((it) => it?.slot === 'icon').map((it) => ({ id: it.id, name: it.name, image: it.image }));
    return [...this.profileCfg.icons, ...own];
  }

  /** 自分のプロフィール設定を変える（アイコン・プライバシー） */
  updateProfile(userId, { icon, privacy } = {}) {
    return this.db.tx(() => {
      const cur = this.profileRow(userId);
      const shopIcon = typeof icon === 'string' ? this.economy?.item(icon) : null;
      const nextIcon = icon === undefined ? this.db.get('SELECT icon FROM user_profiles WHERE user_id = ?', userId)?.icon ?? this.profileCfg.icons[0].id : shopIcon ? this.db.get('SELECT icon FROM user_profiles WHERE user_id = ?', userId)?.icon ?? this.profileCfg.icons[0].id : icon;
      if (shopIcon) {
        if (shopIcon.slot !== 'icon') throw new AccountError('そのアイコンは使えません');
        this.economy.equip(userId, 'icon', shopIcon.id); // 持っていなければここで失敗する
      } else if (!this.profileCfg.icons.some((i) => i.id === nextIcon)) throw new AccountError('そのアイコンは使えません');
      else if (icon !== undefined) this.economy?.equip(userId, 'icon', null); // 無料のアイコンを選んだら、ショップのアイコンの装備は外す
      const nextPrivacy = this.privacy(userId);
      if (privacy !== undefined) {
        if (!privacy || typeof privacy !== 'object' || Array.isArray(privacy)) throw new AccountError('公開設定が正しくありません');
        for (const [k, v] of Object.entries(privacy)) {
          if (!Object.hasOwn(nextPrivacy, k) || !this.profileCfg.privacyLevels.includes(v)) throw new AccountError('公開設定が正しくありません');
          nextPrivacy[k] = v;
        }
      }
      this.db.run(`INSERT INTO user_profiles (user_id, icon, privacy_json) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET icon = excluded.icon, privacy_json = excluded.privacy_json`, userId, nextIcon, JSON.stringify(nextPrivacy));
    });
  }

  /**
   * プロフィール。viewerId が本人なら全部、他人なら公開設定の範囲だけ。
   * 「friends」は、フレンド機能（Phase 4）ができるまでは、本人以外には見せない
   */
  profile(userId, viewerId, { isFriend = () => false } = {}) {
    const u = this.accounts.publicUser(userId);
    if (!u) return null;
    const self = userId === viewerId;
    const privacy = this.privacy(userId);
    const can = (k) => self || privacy[k] === 'public' || (privacy[k] === 'friends' && isFriend(userId, viewerId));
    const lv = this.levelInfo(this.getXp(userId));
    const prow = this.profileRow(userId);
    const out = {
      userId, displayName: u.displayName, kind: u.kind, icon: prow.icon, iconImage: this.iconImage(prow.icon), title: prow.title ?? this.titleFor(lv.level),
      level: lv.level, rank: this.rankSummary(userId, u), bestRank: u.kind === 'member' ? this.ranking?.bestRank(userId) ?? null : null, createdAt: u.createdAt, self,
      equipped: null /* Phase 5：装備中スキン */,
    };
    if (self) out.privacy = privacy;
    if (can('stats')) { out.stats = this.stats(userId); out.statsByMode = this.statsByMode(userId); } else { out.stats = null; out.statsByMode = null; }
    if (can('history')) out.history = this.history(userId, 10); else out.history = null;
    if (can('decks')) {
      const d = this.accounts.getDecks(userId);
      out.deck = d.slots[d.active] ? { name: d.slots[d.active].name, list: d.slots[d.active].list } : null;
    } else out.deck = null;
    return out;
  }

  /** ランクは正会員だけ（ゲストはランクに参加できない）。ゲストの行は作らない */
  rankSummary(userId, u) { return u.kind === 'member' ? this.ranking?.summary(userId) ?? null : null; }

  /** ホーム画面に出すもの */
  home(userId) {
    const u = this.accounts.publicUser(userId);
    const lv = this.levelInfo(this.getXp(userId));
    const prow = this.profileRow(userId);
    const d = this.accounts.getDecks(userId);
    return {
      user: u, icon: prow.icon, title: prow.title ?? this.titleFor(lv.level), level: lv, coins: this.getCoins(userId),
      rank: this.rankSummary(userId, u), season: this.ranking ? this.ranking.seasonAt() : null,
      deck: d.slots[d.active] ? { slot: d.active, name: d.slots[d.active].name } : null,
      stats: this.stats(userId), rewardsAvailable: this.availableRewards(userId).length,
      icons: this.iconChoices(userId), iconImage: this.iconImage(prow.icon), points: this.economy?.balance(userId).points ?? 0,
    };
  }

  // ---- レベル報酬（無料通貨）----
  availableRewards(userId) {
    const lv = this.levelInfo(this.getXp(userId)).level;
    const got = new Set(this.db.all('SELECT level FROM level_rewards WHERE user_id = ?', userId).map((r) => r.level));
    const out = [];
    for (let l = 2; l <= lv; l++) if (!got.has(l)) out.push({ level: l, coins: this.rewardCoins(l) });
    return out;
  }

  /** レベル報酬を受け取る。同じレベルは1回だけ（同時に押しても二重にならない） */
  claimReward(userId, level) {
    return this.db.tx(() => {
      const lv = this.levelInfo(this.getXp(userId)).level;
      if (!Number.isInteger(level) || level < 2 || level > lv) throw new AccountError('まだ受け取れません');
      if (this.db.get('SELECT 1 AS x FROM level_rewards WHERE user_id = ? AND level = ?', userId, level)) throw new AccountError('もう受け取っています', 409);
      const coins = this.rewardCoins(level);
      this.db.run('INSERT INTO level_rewards (user_id, level, coins, claimed_at) VALUES (?, ?, ?, ?)', userId, level, coins, this.now());
      if (this.economy) this.economy.credit(userId, coins, 'levelReward', String(level));
      else this.db.run('INSERT INTO wallets (user_id, free_coins) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET free_coins = free_coins + excluded.free_coins', userId, coins);
      return { level, coins, balance: this.getCoins(userId) };
    });
  }
}
