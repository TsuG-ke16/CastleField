# 05. 他のAIへそのまま渡せる作業依頼テンプレート集（Track A〜E）

各AI（Claude Code / Codex / Gemini / Antigravity 等）へ作業を振り分けるときは、以下の該当トラックをそのままコピペして渡してください。
**並列実行してもファイルが衝突しないように設計されています。**

---

## Track A：新ボタン・新UI部品・カラーアイコン・欠損カード絵（2Dアート担当AI）

```text
リポジトリ TsuG-ke16/CastleField のブランチ `feature/v2-art-assets` で作業してください。
まず `docs/v2-redesign/README.md` と `docs/v2-redesign/01-art-and-ui-system.md`、`assets/STYLE.md` を必ず読んでください。

【ミッション】
1. 現行リポジトリの既存ボタン素材は一切使わず、「ちびキャライラスト（太こげ茶輪郭 #4A2E1A・明るい手塗り立体・鋲なし）」に寄せた新ボタン5種と新UIフレーム/バナーを `assets/v2/ui/` に新規制作する。
2. `js/ui/HomeIcons.js` の線画SVGアイコンと `RankEmblem.js` の未認定SVG盾をすべて廃止できるよう、キャラ絵と同系統のカラーアイコン（WebP）を `assets/v2/icons/` に揃える。
3. `data/cards.json` と照合し、デッキ編集画面で空白になっていたサイコロ系カード等の欠損カード絵をすべて補完する。
4. 全アセットの索引 `assets/v2/manifest.json` を作成し、`assets/CREDITS.md` を更新する。

【厳守ルール】
- SVG（.svg / <svg>）は一切作らない。
- 既存ボタン素材（`assets/ui/btn-*.png`, `button-end-turn.png`, `assets/ui/natural/*`）は流用しない。
- `web/`, `rust/`, `js/`, `css/`, `data/` は触らない。
- 最後に一覧コンタクトシート画像を作成し、文字コントラスト（4.5:1以上）と24px縮小視認性を確認して報告すること。
```

---

## Track B：Blender 3Dトゥーン統一・軽量GLB・プリレンダ2D小物（Blender担当AI）

```text
リポジトリ TsuG-ke16/CastleField のブランチ `feature/v2-blender-3d` で作業してください。
まず `docs/v2-redesign/README.md` と `docs/v2-redesign/01-art-and-ui-system.md`（特に6章）を必ず読んでください。

【ミッション】
1. 既存の3D浮島ジオラマ（`assets/models/diorama/castle_field_diorama.glb`）と主要戦場・城・兵士モデルを、Blender上で「ちびキャライラストに馴染む明るい暖色トゥーン／ミニチュア調」へマテリアル＆ライティング調整し、Draco圧縮＋軽量テクスチャで `assets/v2/models/` に書き出す。
2. ホーム浮島のタブ別カメラ定義（battle / gacha / shop / deck）を `assets/v2/models/diorama-cameras.json` に出力する。
3. 戦場 `field-meadow.glb` に「はっきり見える3本の土道／石畳・5マス踏み石・中央広場・上下城門」を造形して `assets/v2/models/field-meadow.glb` へ書き出す。
4. ガチャ用の3D宝箱（開閉アニメ付き）を作成し、加えて外遊びスマホの省電力モード用に「コイン回転・ダイス回転・宝箱開封」のプリレンダ2D連番（WebP）を `assets/v2/renders/` に書き出す。

【厳守ルール】
- 仕様書の容量バジェット（浮島 ≤2.5MB、戦場 ≤1.2MB、城 ≤400KB、兵士 ≤250KB、宝箱 ≤500KB）を厳守。
- Blenderスクリプトは `assets/v2/blender/` に再現可能な形で保存する。
- `web/`, `rust/`, `js/`, `css/`, `data/` は触らない。
- 書き出し後、レンダリング確認画像とファイル容量一覧を報告すること。
```

---

## Track C：新フロント基盤＆ホーム〜1vs1バトル垂直スライス（フロント実装AI）

```text
リポジトリ TsuG-ke16/CastleField のブランチ `feature/v2-web-frontend` で作業してください。
まず `docs/v2-redesign/README.md`、`01-art-and-ui-system.md`、`02-screen-ux-spec.md`、`03-frontend-architecture.md` をすべて読んでください。

【ミッション（Phase 2：垂直スライス）】
1. `web/` に `Vite + React + TypeScript + Zustand + Motion + React Three Fiber (@react-three/drei, postprocessing) + PixiJS + Howler.js + CSS Modules` の新フロント基盤を構築する。
2. `GameEngineAdapter` と既存 `js/game/Game.js` を繋ぐ `jsLegacyAdapter.ts` を実装する（後で Rust WASM へ1行切替できる設計）。
3. 脱SVG・キャラ絵寄せの共通ゲームUI部品（`<GameButton>`, `<WoodFrame>`, `<ParchmentSheet>`, `<PaintedIcon>`, `<RibbonBanner>`, `<GameCard>`）を作成する（Track A/B素材が未配置の間は、同じトークン＆9-slice構造の仮画像に差し替え可能にしておく）。
4. スマホ縦（390×844）最優先で「新ホーム画面（フルスクリーン3D城＋旗モード切替＋作戦チップ＋ゴールド出陣ボタン＋5タブバー）→ 1vs1バトル画面（3レーン＋扇状手札ドラッグ＆ドロップ＋ヒットストップ/揺れ/音）→ リザルト画面」を一気通貫で遊べる状態まで実装する。

【厳守ルール】
- SVG（`<svg>`, `.svg`, `data:image/svg+xml`）は一切禁止。
- 既存ボタン素材（`assets/ui/btn-*.png`, `assets/ui/natural/*` 等）の流用禁止。
- 汎用Web UIライブラリ（MUI/shadcn等）およびCSS `!important` 禁止。
- 既存のルート `index.html` / `js/` / `css/` / `data/` / `rust/` は変更しない。
- Playwrightで `390×844`, `360×640`, `1280×800` のスクリーンショット確認と `npm run build` 通過を完了条件とする。
```

---

## Track D：Rust ゲームエンジンコア＆WASM（Rustコア担当AI）

```text
リポジトリ TsuG-ke16/CastleField のブランチ `feature/v2-rust-core` で作業してください。
まず `docs/v2-redesign/README.md`、`04-rust-core-and-server.md`、および `CLAUDE.md` の「ロジックとUIの約束」〜ルール仕様を読んでください。

【ミッション（Milestone D1 + D2）】
1. `rust/` に Cargo ワークスペースを作成し、`crates/castlefield-core` と `crates/castlefield-wasm` を構築する。
2. 既存 `data/*.json`（通常モード一式）をそのまま `serde` で読み込み、バリデーションできるデータ層を実装する。
3. 決定論RNG・全ゲーム状態・`CLAUDE.md` 記載の全メソッドと全イベント順を `castlefield-core` に実装する。
4. 既存 `js/game/Game.js` と同じシード・同じ操作列で100試合回して結果とイベント列を比較するゴールデンテスト（`rust/tests/golden_parity.rs`）を作成し、100%一致させる。
5. 7種CPU戦略を移植し、`castlefield-wasm` で `wasm-pack build --target web` が通る `WasmGame` API を公開する。

【厳守ルール】
- `data/*.json` の数値やルールを勝手に変更しない。
- `castlefield-core` は DOM / ファイルI/O / ネットワークに依存しない純Rust（`wasm32-unknown-unknown` ビルド可能）に保つ。
- `web/`, `assets/`, `js/`, `css/` は触らない。
- `cargo test --workspace` と `cargo clippy --all-targets -- -D warnings` がゼロエラーで通ることを完了条件とする。
```

---

## Track E：Rust オンラインサーバー（`axum` + WebSocket + SQLite）（Rustサーバー担当AI）

```text
リポジトリ TsuG-ke16/CastleField のブランチ `feature/v2-rust-server` で作業してください。
まず `docs/v2-redesign/README.md`、`04-rust-core-and-server.md`、`docs/accounts.md`、および現行 `server/server.js` / `server/rooms.js` を読んでください。

【ミッション】
1. `rust/crates/castlefield-server` を `axum` + `tokio` + SQLite で実装する。
2. 現行サーバーの `/healthz`, `/readyz`, `/metrics`, `/api/join`, `/api/action`, `/api/stream`（SSE互換）およびアカウント・ショップ・ガチャ・ランクAPIと互換を保つ。
3. 外遊びのモバイル回線断に強い WebSocket エンドポイント `/api/ws?token=...&lastSeq=...` を実装する（イベント連番＋直近200件リングバッファ差分再送＋15秒Ping/Pong）。
4. `castlefield-core` をエンジンとして組み込み、勝敗・ガチャ抽選・購入処理をすべてサーバー権威で実行する。

【厳守ルール】
- クライアントからの勝敗申告・通貨改ざんを一切信用しない。
- 既存の `server/`（Node.js版）や `web/`、`assets/`、`data/` は削除・変更しない。
- 統合テスト（入室→対戦→切断＆再接続復帰→決着→報酬反映）と `cargo clippy -- -D warnings` の全合格を完了条件とする。
```
