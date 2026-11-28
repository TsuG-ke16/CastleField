# CastleField v2 リデザイン＆技術刷新 マスター仕様書

本ディレクトリ（`docs/v2-redesign/`）は、`TsuG-ke16/CastleField` を「Webフォーム風の画面」から**外でもスマホで片手プレイできる“本物の王国カードゲーム”**へ刷新するための、**複数AI（Antigravity / Claude Code / Codex / Gemini 等）並列作業用の正本仕様書**です。

> **他のAIへ作業を依頼するときは、必ず最初にこの `README.md` と担当トラックの仕様書を読ませること。**
> 既存ゲームルール・数値仕様の正本は引き続きリポジトリ直下の `CLAUDE.md` および `data/*.json` とする。

---

## 1. 確定した基本方針（変更不可の原則）

1. **配布形態＝スマホ＆PC対応 Web（PWA）**
   - 友達とURL共有だけで即対戦でき、外でもモバイル回線・片手で快適に遊べることを最優先する（将来の別作でデスクトップネイティブを見据え、コア資産は移植可能な形で設計する）。
2. **唯一のビジュアル基準＝現在のちびキャライラスト**
   - 太くて温かいこげ茶輪郭（`#4A2E1A`）、明るい手塗り立体ハイライト、丸みのある親しみやすいシルエットを、UI・ボタン・アイコン・3Dモデルすべてで統一する。
3. **SVG 完全廃止**
   - UIアイコン、装飾、代替絵、ランク未確定エンブレム、CSS `data:image/svg+xml`、スキルツリー描画まで **SVGを使用しない**。すべて **WebP/PNG ラスター素材（手描き／Blenderプリレンダ）** または **WebGL（Three.js / PixiJS）** で描画する。
4. **リポジトリ既存のボタン素材は全廃（流用禁止）**
   - 既存の鋲つき板ボタンや `assets/ui/natural/` のボタン素材・`assets/ui/btn-*.png` 等は一切使わない。キャライラストに寄せた新ボタンをゼロから制作する（詳細は `01-art-and-ui-system.md`）。
5. **脱Webフォーム・脱CSS地層化**
   - 現行の42枚グローバルCSS（約480KB・`!important` 169箇所）の上書きを打ち切り、新フロント（`web/`）をモダンスタックでクリーンに構築する。
6. **Rust コア＆サーバー導入**
   - ゲームロジック・CPU思考・バランス検証を純Rustクレート（`castlefield-core`）として実装し、ブラウザへは **WebAssembly（`castlefield-wasm`）**、オンライン対戦へは **Rustサーバー（`castlefield-server` / `axum`）** として共有する。

---

## 2. 全AI共通の絶対禁止ルール（DO NOT）

- **NO `main` 直コミット**: 作業は必ず `feature/v2-<track>-<内容>` などのブランチで行う（`CLAUDE.md` 準拠）。
- **NO SVG**: 新規コード（`web/`・`assets/v2/`）に `<svg>` タグ、`.svg` ファイル、`data:image/svg+xml` を入れない。
- **NO 既存ボタン素材流用**: `01-art-and-ui-system.md` の「使用禁止リスト」にあるボタン画像を一切参照しない。
- **NO 汎用Web UIライブラリ**: MUI / shadcn/ui / Chakra UI / Ant Design / Bootstrap 等は入れない（管理画面化を防ぐ）。
- **NO グローバルCSS `!important` 上書き**: スタイルはコンポーネント単位の CSS Modules に閉じ込める。
- **NO ルール・数値の無断改変**: `data/*.json` のカード性能・勝敗ルール・価格・排出率は人間承認なしで変えない。
- **NO 現行版の破壊（切替完了まで）**: Phase 4 の最終切替までは、既存の `index.html` / `js/` / `css/` / `server/` を壊さない（新フロントは `web/`、Rustは `rust/`、新素材は `assets/v2/` に隔離して並行開発する）。

---

## 3. ドキュメント一覧（読む順番）

| ファイル | 対象AI・用途 | 内容 |
|---|---|---|
| `README.md`（本書） | **全AI必読** | 全体方針・禁止ルール・トラック分担・ロードマップ |
| `01-art-and-ui-system.md` | **Track A（2Dアート）/ Track B（Blender 3D）** | キャラ絵基準のデザイン原則、廃止ボタン一覧、新ボタン仕様、脱SVG置換表、Blenderトゥーン＆軽量ハイブリッド仕様 |
| `02-screen-ux-spec.md` | **Track C（フロントUI/UX）** | スマホ片手ファースト設計、全7画面のレイアウト仕様、現行既知バグの完全修正一覧 |
| `03-frontend-architecture.md` | **Track C（フロント実装）** | `web/` 技術スタック（Vite/React/TS/Zustand/Motion/R3F/PixiJS/Howler）、コンポーネント契約、GameEngineAdapter、外遊びPWA最適化 |
| `04-rust-core-and-server.md` | **Track D（Rustコア/WASM）/ Track E（Rustサーバー）** | `rust/` Cargo構成、JSONデータ互換、Gameイベント契約、JS版とのゴールデンテスト、`axum` WebSocket/HTTP API仕様 |
| `07-phase8-ranked.md` | **全AI（ランク・サーバーを触るとき）** | Phase 8：ランクマッチ（ゲスト本人確認・待ち行列・結果の反映・ランキング）と、一緒に直したサーバーの不具合 |
| `08-server-wallet.md` | **全AI（コイン・所持品を触るとき）** | v2 のお財布をサーバーで持つ（移行・対戦報酬の上限・ミッション・ランク報酬） |
| `06-deploy-and-play.md` | **全AI / 運用** | ローカル起動・Docker・Render / Fly.io 本番デプロイ手順とヘルスチェック |
| `05-ai-work-orders.md` | **人間（司令塔）向け** | 各AIへそのままコピペして発注できる Track A〜E 別の作業依頼プロンプト＆受け入れ条件 |

---

## 4. 並列AIタスク分担マップ（衝突防止）

複数AIが同時に作業してもコンフリクトしないよう、**編集可能ディレクトリをトラックごとに厳密に分離**する。

| Track | 担当領域 | 編集してよい場所（所有権） | 触ってはいけない場所 | 依存関係 |
|---|---|---|---|---|
| **Track A** | 新ボタン・新UI部品・カラーアイコン・欠損カード絵（2D/画像生成） | `assets/v2/ui/`, `assets/v2/icons/`, `assets/v2/cards/`, `assets/v2/manifest.json`, `assets/CREDITS.md` | `web/`, `rust/`, `js/`, `css/`, `data/` | なし（即開始可） |
| **Track B** | Blender 3Dトゥーン統一・軽量GLB・プリレンダ2D小物＆連番 | `assets/v2/models/`, `assets/v2/renders/`, `assets/v2/blender/` | `web/`, `rust/`, `js/`, `css/`, `data/` | なし（即開始可） |
| **Track C** | 新フロント基盤（`web/`）・ホーム/バトル/各画面UI・R3F・PixiJS・音 | `web/` | `rust/`, `js/game/`, `server/`, `data/`, 既存`css/` | Track A/B 完成前はプレースホルダ定数で先行開発可 |
| **Track D** | Rust ゲームエンジンコア（`castlefield-core`）＆ WASM（`castlefield-wasm`） | `rust/Cargo.toml`, `rust/crates/castlefield-core/`, `rust/crates/castlefield-wasm/`, `rust/tests/` | `web/`, `assets/`, `js/`, `css/` | なし（`data/*.json` と `CLAUDE.md` を参照して即開始可） |
| **Track E** | Rust オンラインサーバー（`castlefield-server` / `axum` + SQLite） | `rust/crates/castlefield-server/` | `web/`, `assets/`, `js/`, `css/` | Track D の `castlefield-core` 公開API（先行モック可） |

---

## 5. 全体ロードマップ（Phase 1〜4）

| Phase | マイルストーン | 完了の定義（受け入れライン） |
|---|---|---|
| **Phase 1** | **アート＆脱SVG素材セット確立**（Track A + B） | 新ボタン全種・カラーアイコン全種・欠損カード絵・トゥーン調整済み城/戦場/宝箱GLB・プリレンダ小物が `assets/v2/` に揃い、人間の見た目承認を得る |
| **Phase 2** | **垂直スライス：新ホーム → 1vs1バトル → リザルト**（Track C） | `web/` でスマホ390×844＆PC1280×800にて、新デザイン＋3D城＋扇状手札ドラッグ＋3レーン戦場＋音＋ヒットストップが **SVGゼロ** で60fps動作する（最初は既存JS `Game` アダプタで接続） |
| **Phase 3** | **Rustコア＆サーバー接続**（Track D + E） | `castlefield-core` が既存JS版との同一シード100試合ゴールデンテストに100%一致し、`castlefield-wasm` で `web/` が動作、さらに `castlefield-server` でスマホ2台のオンライン対戦が通る |
| **Phase 4** | **全画面移植＆外遊びPWA仕上げ**（Track C + E） | ガチャ・ショップ・デッキ編成・図鑑・スキン装備・PixiJS 200ノードスキルツリー・メニュー・ランク/フレンドを全移植。4G回線・スマホ実機で初回ロード＆電池消費を検証し、旧フロントから切替 |
| **Phase 8** | **ランクマッチ**（Track D + E + C） | `data/ranks.json` の式でサーバーが MMR・RP を決め、v2 の待合室→対戦→結果（RP の増減）まで通る。くわしくは `07-phase8-ranked.md` |
| **Phase 8〜10** | **2D省エネ描画・4枠デッキ・SkillTree＆CI統合**（PR #226〜#228） | Blender 2Dプリレンダ、Lazy 3D、モード固有カード28枚切り出し、4枠マイデッキ＆構成グラフ、SkillTreeピンチズーム/系統フィルタ、`v2_integrity.test.mjs` CI を確立 |
| **Phase 11〜16** | **UX磨き上げ・共有・配布仕上げ**（PR #229〜#234） | 対戦履歴12戦＆ログ・初回ヒント・BGM省エネ＆Render/Fly設定（#229）、ショップ並び替え/レア度色分け＆スキン刷新（#230）、1行HUD＆リザルトXP＆PCキー操作（#231〜#232）、PWAキャッシュ修正＆`CF2-`共有コード＆スキル効果検索（#233）、ミッション一括受取＆ガイド拡充（#234） |
