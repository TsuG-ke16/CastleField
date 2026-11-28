# 04. Rustコア（WASM）＆Rustオンラインサーバー仕様書

対象：**Track D（Rustコア＆WASM担当AI）** / **Track E（Rustオンラインサーバー担当AI）**

---

## 1. 目的とアーキテクチャ方針

1. **Single Source of Truth（ロジック一本化）**:
   - 対戦ルール・カード効果・属性反応・200スキルツリー計算・CPU思考・バランス検証を **1つの純Rustクレート（`castlefield-core`）** に集約する。
   - 同じクレートを **ブラウザ（`castlefield-wasm`）** と **サーバー（`castlefield-server`）** の両方から利用し、クライアント／サーバー間のルールズレを構造上ゼロにする。
2. **完全決定論（Deterministic Simulation）**:
   - 乱数生成器（例：`StdRng` / `ChaCha8Rng`）をシード付きで外から注入する設計とし、同じデータ＋同じシード＋同じ操作列で **100%同一の結果** を再現可能にする（リプレイ・観戦・AI探索・自動検証の土台）。
3. **既存 `data/*.json` との100%互換**:
   - `data/cards.json`, `data/rules.json`, `data/monsters.json`, `data/stages.json`, `data/weather.json`, `data/upgrades.json`, `data/castles.json`, `data/decks.json`, `data/rarities.json`, `data/modes.json`, `data/factions/*`, `data/classic/*` をそのまま `serde` で読み込めるようにする。

---

## 2. Cargo ワークスペース構成（`rust/`）

```text
rust/
  Cargo.toml                      # workspace: castlefield-core, castlefield-wasm, castlefield-server
  crates/
    castlefield-core/             # 純Rust（no I/O, no DOM, WASM互換）
      Cargo.toml
      src/
        lib.rs
        data/                     # data/*.json の serde 型定義＆バリデーション
        model/                    # GameState, Player, Castle, Soldier, Monster, Road, Status
        events.rs                 # CLAUDE.md 全イベントの enum（serde tag="type"）
        rng.rs                    # 決定論 RNG トレイト（テスト用に固定シード/配列注入可）
        game/                     # Game 構造体・ターン進行・進軍・戦闘・防御・合成・強化
        skills/                   # クラシック200ノードスキルツリー判定＆効果フック
        factions/                 # 4陣営モード固有効果・属性付着・反応・常時精霊
        ai/                       # CPU戦略（random/aggro/smart/defensive/rush/guard/pass）
        sim/                      # 高速バランスシミュレーター（マルチスレッド対応）
        visibility.rs             # オンライン対戦のプレイヤー別秘匿フィルタ
    castlefield-wasm/             # wasm-bindgen ブリッジ（web/ から呼び出し）
      Cargo.toml
      src/lib.rs                  # WasmGame（GameEngineAdapter と完全一致するJS API）
    castlefield-server/           # オンライン対戦＋アカウント＋ショップ/ガチャサーバー
      Cargo.toml
      src/
        main.rs
        config.rs                 # 環境変数（既存 .env.example / CF_* 互換）
        routes/
          health.rs               # /healthz, /readyz, /metrics
          room.rs                 # /api/join, /api/action, /api/stream (SSE互換) + /api/ws (WebSocket)
          account.rs              # 認証・プロフィール・フレンド・ランキング・ミッション
          economy.rs              # ショップ購入・ガチャ抽選・天井・スキン装備
        lobby.rs                  # 部屋管理・席管理・CPU参加・切断タイムアウト・イベント履歴再送
        db.rs                     # SQLite（rusqlite / sqlx）既存スキーマ互換
  tests/
    golden_parity.rs              # 既存JS版（Node）との同一シード結果比較テスト
```

---

## 3. `castlefield-core` のAPI＆互換契約（Track D）

### 必須メソッド（`CLAUDE.md` の「ロジックとUIの約束」に完全準拠）
- `Game::new(config: GameConfig) -> Result<Self, DataError>`
- `start(&mut self) -> Vec<GameEvent>`
- `mulligan(&mut self, player_id: &str, card_ids: &[String]) -> ActionOutcome`
- `get_state(&self, viewer_id: Option<&str>) -> GameStateView`
- `can_play_card(&self, card_id: &str, target: Option<&PlayTarget>) -> ActionCheck`
- `get_targets(&self, card_id: &str) -> Vec<PlayTarget>`
- `play_card(&mut self, card_id: &str, target: Option<&PlayTarget>) -> ActionOutcome`
- `discard(&mut self, card_ids: &[String]) -> ActionOutcome`
- `can_buy_upgrade(&self, upgrade_id: &str) -> ActionCheck`
- `buy_upgrade(&mut self, upgrade_id: &str) -> ActionOutcome`
- `can_defend(&self, card_id: &str, target: Option<&PlayTarget>) -> ActionCheck`
- `get_defense_targets(&self, card_id: &str) -> Vec<PlayTarget>`
- `defend(&mut self, card_id: &str, target: Option<&PlayTarget>) -> ActionOutcome`
- `pass_defense(&mut self) -> ActionOutcome`
- `can_fuse(&self, card_id_a: &str, card_id_b: &str) -> ActionCheck`
- `fuse(&mut self, card_id_a: &str, card_id_b: &str) -> ActionOutcome`
- `end_turn(&mut self) -> ActionOutcome`
- `surrender(&mut self, player_id: &str) -> ActionOutcome`

### 実装の段階分け（Track D はいきなり全部書かず、テスト通過順に積む）
1. **Milestone D1（通常モード1vs1完全互換）**:
   - `data/cards.json` + `rules.json` + `monsters.json` + `upgrades.json` + `castles.json` + `decks.json` + `rarities.json` + `stages.json` + `weather.json` の全ルール・全イベント順・サイコロ・合成・防御・マリガン。
   - **受け入れ条件**: 既存 `js/game/Game.js` と同じシード・同じ操作列で100試合シミュレーションし、**全ターンの状態・イベント種別・勝敗が100%一致**すること。
2. **Milestone D2（WASMビルド＆CPU戦略）**:
   - `wasm-pack build --target web` で `castlefield-wasm` を生成し、`web/src/engine/wasmAdapter.ts` から呼び出せること。
   - 7種CPU戦略（`strategies.js` 互換）の移植＋高速化。
3. **Milestone D3（多人数・チーム戦・4陣営・クラシック200スキルツリー）**:
   - `data/factions/*` の4陣営ルール・属性反応・常時精霊。
   - `data/classic/*` の200ノードスキルツリー判定＆効果。
   - 既存 `tests/*.test.js` のシナリオをRustテストへ移植し全合格。

---

## 4. `castlefield-server` のAPI＆モバイル回線対策仕様（Track E）

### 技術選定
- **HTTP/WS**: `axum` + `tokio` + `tower-http`（CORS、圧縮、静的ファイル配信、トレース）
- **DB**: `rusqlite`（または `sqlx` SQLite）— 既存 `docs/accounts.md` のDB仕様に準拠
- **シリアライズ**: `serde` + `serde_json`

### エンドポイント仕様
1. **既存互換API（現行クライアント＆段階移行用）**
   - `GET /healthz`, `GET /readyz`, `GET /metrics`
   - `POST /api/join`（合言葉入室・モード指定・ログイン名自動反映）
   - `POST /api/action`（トークン認証＋ `method` / `args` 実行）
   - `GET /api/stream?token=...`（SSE互換）
   - アカウント・プロフィール・ランク・フレンド・ガチャ・ショップ・スキン装備API（`docs/accounts.md` および `server/accounts/http.js` の全ルートと互換）
2. **新世代WebSocketプロトコル（外遊びスマホ回線最適化）**
   - `GET /api/ws?token=<seatToken>&lastSeq=<n>`
   - **イベント連番（`seq: u64`）付与**: 部屋内の全イベントに単調増加の連番を振り、直近200件をリングバッファ保持。
   - **瞬断からの無痛復帰**: 電車・エレベーター等で回線が切れて再接続した際、`lastSeq` 以降の未受信イベントだけ即座に差分再送（抜けが大きい場合は最新 `state` スナップショットを再送）。
   - **ハートビート**: 15秒間隔の Ping/Pong でゾンビ接続を検知し、一定時間内に復帰すれば席と試合をそのまま維持。
3. **静的配信（SPA対応）**:
   - `web/dist/` および `/data/`, `/assets/` を配信。`.webp` / `.glb` / `.wasm` に適切な `Content-Type` と長期キャッシュヘッダ（ハッシュ付きファイルは `immutable`）を付与。

---

## 5. セキュリティ＆運用要件
- 試合の勝敗・ガチャ抽選・コイン消費・ショップ購入・装備変更は **すべてサーバー側権威（Server-Authoritative）** で検証し、クライアント申告値を信用しない。
- リクエストボディ上限（16KB）、レート制限、パス・トラバーサル防止を維持。
- `cargo clippy --all-targets -- -D warnings` および `cargo test --workspace` が警告ゼロで通ること。
