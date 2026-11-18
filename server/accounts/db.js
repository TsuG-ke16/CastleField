// 永続データの保存基盤（SQLite。Node.js 標準の node:sqlite。外部パッケージなし）。
// - 1つのファイル（既定 data-store/castlefield.db。環境変数 CF_DB_PATH で変える。":memory:" も可）
// - 起動のたびに migrations を順に適用する（schema_migrations に記録。適用済みは飛ばす）
// - 書き込みは tx() の中で行う（BEGIN IMMEDIATE：同時リクエストが来ても1つずつ処理され、二重処理にならない）
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** 新しい変更は、末尾に足す（適用済みの項目は書きかえない） */
export const MIGRATIONS = [
  {
    id: 1,
    name: 'accounts-and-decks',
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        kind          TEXT NOT NULL CHECK (kind IN ('guest','member')),
        display_name  TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        last_seen_at  INTEGER NOT NULL
      );
      CREATE TABLE identities (
        provider      TEXT NOT NULL CHECK (provider IN ('google','apple')),
        subject       TEXT NOT NULL,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email_hash    TEXT,
        created_at    INTEGER NOT NULL,
        PRIMARY KEY (provider, subject)
      );
      CREATE INDEX identities_user ON identities(user_id);
      CREATE TABLE sessions (
        id_hash       TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf          TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        last_used_at  INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL,
        revoked_at    INTEGER
      );
      CREATE INDEX sessions_user ON sessions(user_id);
      CREATE TABLE oauth_states (
        state         TEXT PRIMARY KEY,
        provider      TEXT NOT NULL,
        nonce         TEXT NOT NULL,
        verifier      TEXT NOT NULL,
        user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL
      );
      CREATE TABLE link_conflicts (
        id            TEXT PRIMARY KEY,
        guest_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at    INTEGER NOT NULL,
        expires_at    INTEGER NOT NULL
      );
      CREATE TABLE user_decks (
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slot          INTEGER NOT NULL CHECK (slot >= 0 AND slot < 8),
        name          TEXT NOT NULL,
        list_json     TEXT NOT NULL,
        updated_at    INTEGER NOT NULL,
        PRIMARY KEY (user_id, slot)
      );
      CREATE TABLE user_settings (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        active_deck   INTEGER NOT NULL DEFAULT 0,
        deck_revision INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE audit_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        at            INTEGER NOT NULL,
        event         TEXT NOT NULL,
        user_hash     TEXT,
        detail        TEXT
      );
    `,
  },
  {
    id: 2,
    name: 'profile-progress-matches-wallet',
    sql: `
      CREATE TABLE user_profiles (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        icon          TEXT NOT NULL DEFAULT 'infantry',
        title         TEXT,
        privacy_json  TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE user_progress (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        xp            INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0)
      );
      -- 通貨：無料通貨と、将来の有料通貨は別の列（混ぜない）。マイナスにはならない
      CREATE TABLE wallets (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        free_coins    INTEGER NOT NULL DEFAULT 0 CHECK (free_coins >= 0)
      );
      CREATE TABLE matches (
        id            TEXT PRIMARY KEY,
        mode_id       TEXT NOT NULL DEFAULT 'kingdom',
        room_id       TEXT,
        started_at    INTEGER NOT NULL,
        ended_at      INTEGER NOT NULL,
        turns         INTEGER NOT NULL,
        reason        TEXT NOT NULL,
        player_count  INTEGER NOT NULL,
        deck_mode     TEXT,
        win_condition TEXT
      );
      CREATE TABLE match_players (
        match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        seat          INTEGER NOT NULL,
        user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
        name          TEXT NOT NULL,
        cpu           TEXT,
        result        TEXT NOT NULL CHECK (result IN ('win','loss')),
        counted       INTEGER NOT NULL DEFAULT 1,
        left_early    INTEGER NOT NULL DEFAULT 0,
        xp_gained     INTEGER NOT NULL DEFAULT 0,
        deck_name     TEXT,
        PRIMARY KEY (match_id, seat)
      );
      CREATE UNIQUE INDEX match_players_user ON match_players(match_id, user_id) WHERE user_id IS NOT NULL;
      CREATE INDEX match_players_by_user ON match_players(user_id, match_id);
      CREATE TABLE level_rewards (
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        level         INTEGER NOT NULL,
        coins         INTEGER NOT NULL,
        claimed_at    INTEGER NOT NULL,
        PRIMARY KEY (user_id, level)
      );
    `,
  },
  {
    id: 3,
    name: 'ranked-seasons',
    sql: `
      ALTER TABLE matches ADD COLUMN ranked INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE season_stats (
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        season        INTEGER NOT NULL,
        mode_id       TEXT NOT NULL DEFAULT 'kingdom',
        mmr           INTEGER NOT NULL,
        rp            INTEGER NOT NULL DEFAULT 0 CHECK (rp >= 0),
        peak_rp       INTEGER NOT NULL DEFAULT 0,
        matches       INTEGER NOT NULL DEFAULT 0,
        wins          INTEGER NOT NULL DEFAULT 0,
        placement_left INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, season, mode_id)
      );
      CREATE INDEX season_stats_board ON season_stats(season, mode_id, placement_left, rp DESC);
      CREATE TABLE rating_changes (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id      TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        user_id       TEXT REFERENCES users(id) ON DELETE CASCADE,
        opponent_id   TEXT,
        season        INTEGER NOT NULL,
        mode_id       TEXT NOT NULL,
        result        TEXT NOT NULL,
        mmr_before    INTEGER NOT NULL,
        mmr_after     INTEGER NOT NULL,
        rp_before     INTEGER NOT NULL,
        rp_after      INTEGER NOT NULL,
        placement     INTEGER NOT NULL DEFAULT 0,
        scale         REAL NOT NULL DEFAULT 1,
        at            INTEGER NOT NULL,
        UNIQUE (match_id, user_id)
      );
      CREATE INDEX rating_changes_user ON rating_changes(user_id, at);
      CREATE INDEX rating_changes_pair ON rating_changes(user_id, opponent_id, at);
    `,
  },
  {
    id: 4,
    name: 'social',
    sql: `
      CREATE TABLE user_codes (
        user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        code          TEXT NOT NULL UNIQUE
      );
      CREATE TABLE social_settings (
        user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        accept_requests  INTEGER NOT NULL DEFAULT 1,
        accept_invites   INTEGER NOT NULL DEFAULT 1,
        show_online      INTEGER NOT NULL DEFAULT 1,
        searchable       INTEGER NOT NULL DEFAULT 1
      );
      -- 2人の組は user_a < user_b にそろえて1行で持つ
      CREATE TABLE friendships (
        user_a        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_b        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status        TEXT NOT NULL CHECK (status IN ('pending','accepted','declined')),
        requested_by  TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        PRIMARY KEY (user_a, user_b),
        CHECK (user_a < user_b)
      );
      CREATE INDEX friendships_b ON friendships(user_b);
      CREATE TABLE blocks (
        blocker_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at    INTEGER NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id)
      );
      CREATE INDEX blocks_blocked ON blocks(blocked_id);
      -- 回数の制限（スパム対策）に使う短い記録
      CREATE TABLE social_log (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL,
        at            INTEGER NOT NULL
      );
      CREATE INDEX social_log_user ON social_log(user_id, kind, at);
    `,
  },
];

export class Db {
  /** @param {string} path ファイルのパスか ":memory:" */
  constructor(path = ':memory:') {
    this.path = path;
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (path !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    this.depth = 0;
    this.migrate();
  }

  migrate() {
    this.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    const done = new Set(this.all('SELECT id FROM schema_migrations').map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      this.tx(() => {
        this.raw.exec(m.sql);
        this.run('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)', m.id, m.name, Date.now());
      });
    }
  }

  run(sql, ...params) { return this.raw.prepare(sql).run(...params); }
  get(sql, ...params) { return this.raw.prepare(sql).get(...params); }
  all(sql, ...params) { return this.raw.prepare(sql).all(...params); }

  /** 1つのまとまりとして実行する（途中で例外が出たら全部なかったことにする）。入れ子は外側にまとめる */
  tx(fn) {
    if (this.depth > 0) return fn();
    this.raw.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const out = fn();
      this.raw.exec('COMMIT');
      return out;
    } catch (err) {
      try { this.raw.exec('ROLLBACK'); } catch { /* すでに閉じている */ }
      throw err;
    } finally {
      this.depth = 0;
    }
  }

  /** バックアップ（動いている最中でも、整合した1ファイルを作る）。同名のファイルがあるとエラー */
  backupTo(file) {
    mkdirSync(dirname(file), { recursive: true });
    this.raw.prepare('VACUUM INTO ?').run(file);
    return file;
  }

  close() { this.raw.close(); }
}
