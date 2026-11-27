# 03. モダンフロント＆3D/2D/音アーキテクチャ仕様書

対象：**Track C（フロントエンド実装AI）**

---

## 1. 技術スタック（確定標準）

複数AIによる開発の一貫性と、3D（R3F）・モーション・PixiJSのエコシステム成熟度から、新フロントは **`web/` ディレクトリ** に以下の構成で構築する。

| カテゴリ | 採用パッケージ | 用途・選定理由 |
|---|---|---|
| ビルド | **Vite + TypeScript** | 高速HMR、コード分割、PWAプラグイン（`vite-plugin-pwa`） |
| UIフレームワーク | **React 19** | R3F・Motionとの親和性が最高、AI間の実装品質が最も安定 |
| 状態管理 | **Zustand** | 対戦状態・アニメーションキュー・UIモーダル・設定を一元管理 |
| アニメーション | **Motion (`motion/react`)** | 手札の扇状展開、ドラッグ＆ドロップ、バネ物理、画面遷移、宝箱演出 |
| 3D描画 | **Three.js + `@react-three/fiber` + `@react-three/drei` + `@react-three/postprocessing`** | Blender `.glb` 読み込み、Draco解凍、カメラ補間、トゥーン/ブルーム演出 |
| 2D WebGL描画 | **PixiJS (`pixi.js` v8)** | 200ノードのスキルツリー（SVG完全廃止）＋バトル魔法パーティクル |
| サウンド | **Howler.js** | SE（紙音・木音・衝突・勝利）＆動的BGM（通常／ピンチ／天候環境音） |
| スタイリング | **CSS Modules（`*.module.css`）** | スコープ隔離により `!important` ゼロ・42枚CSS地層化の根絶 |
| テスト | **Vitest + Playwright** | コンポーネント単体テスト＋3サイズ（390×844 / 360×640 / 1280×800）視覚検証 |

> **禁止**: MUI / shadcn/ui / Chakra UI / Bootstrap 等の汎用Web UIコンポーネントライブラリは導入しない。`<svg>` 要素も使用しない。

---

## 2. ディレクトリ構成（`web/`）

既存ルート（`index.html`, `js/`, `css/`）を壊さず、完全に独立して開発する：

```text
web/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx
    styles/
      tokens.css            # 01-art-and-ui-system.md の単一トークン定義
      reset.css             # 最小リセットのみ（!important 禁止）
      fonts.css             # 丸みのある日本語見出し＋数字 tabular-nums
    engine/
      adapter.ts            # GameEngineAdapter インターフェース（JS / Rust WASM 切替口）
      jsLegacyAdapter.ts    # Phase 2用：既存 js/game/Game.js をラップ
      wasmAdapter.ts        # Phase 3用：rust/crates/castlefield-wasm をラップ
      onlineClient.ts       # WebSocket / HTTP API クライアント（再接続・シーケンス同期）
      dataLoader.ts         # 既存 /data/*.json の型付きローダー
      types.ts              # GameState / GameEvent / CardDef 等の厳密なTypeScript型
    stores/
      useAppStore.ts        # 画面タブ・モード・設定・低電力フラグ・アカウント
      useBattleStore.ts     # 試合状態・イベント演出キュー・選択中カード・ターゲット
      useAudioStore.ts      # SE/BGM音量・ミュート・動的BGM状態
    components/
      ui/                   # 脱SVG・完全キャラ絵寄せの共通ゲームUI部品
        GameButton.tsx      # variant: 'primary-gold' | 'normal-stone' | 'selected-royal' | 'danger-ruby'
        RoundButton.tsx     # 丸ボタン（44px以上保証）
        WoodFrame.tsx       # 9-slice 木枠パネル
        ParchmentSheet.tsx  # 9-slice 羊皮紙シート＆ボトムシート
        PaintedIcon.tsx     # カラーWebPアイコン（SVGゼロ）
        RibbonBanner.tsx    # 勝利・敗北・見出しリボン
        GameCard.tsx        # 2:3 カード部品（一覧・手札・拡大で共通、空テキスト枠なし）
      nav/
        TopBar.tsx
        BottomDock.tsx
        SideDock.tsx
    scene3d/                # React Three Fiber（必要な画面のみ遅延ロード）
      HomeDioramaScene.tsx  # 浮島ジオラマ＋タブ連動カメラ補間＋オンデマンド描画
      BattleFieldScene.tsx  # 3D戦場＋3レーン＋城＋兵士＋ヒットストップ/シェイク
      GachaChestScene.tsx   # 3D宝箱＋開封アニメーション
      CardInspectScene.tsx  # 3Dホログラムカード鑑賞（既存 CardGL 置換）
    pixi/                   # PixiJS（SVGゼロの高速2D WebGL）
      SkillTreeCanvas.tsx   # 200ノード羊皮紙作戦図（パン・ピンチズーム・光背）
      BattleFxOverlay.tsx   # 魔法・爆発・雷・回復・天候パーティクル
    screens/
      HomeScreen.tsx
      BattleScreen.tsx
      GachaScreen.tsx
      ShopScreen.tsx
      DeckScreen.tsx
      CatalogScreen.tsx
      SkillTreeScreen.tsx
      SkinScreen.tsx
      MenuScreen.tsx
      ResultOverlay.tsx
    audio/
      soundManager.ts       # Howler.js ラッパー（SE/BGM・城ピンチ切替）
```

---

## 3. GameEngineAdapter 契約（JS版 → Rust WASM を無痛切替する設計）

フロントUIは **絶対にゲームロジックの実装（JSかRustか）を直接意識しない**。必ず以下の `GameEngineAdapter` 経由で操作する（`CLAUDE.md` の「ロジックとUIの約束」に100%準拠）：

```ts
export interface ActionResult {
  ok: boolean;
  reason?: string;
  needsTarget?: boolean;
}

export interface GameEngineAdapter {
  start(): void;
  getState(viewerId: string | null): GameState;
  canPlayCard(cardId: string, target?: PlayTarget): ActionResult;
  getTargets(cardId: string): PlayTarget[];
  playCard(cardId: string, target?: PlayTarget): ActionResult;
  discard(cardIds: string[]): ActionResult;
  canBuyUpgrade(upgradeId: string): ActionResult;
  buyUpgrade(upgradeId: string): ActionResult;
  canDefend(cardId: string, target?: PlayTarget): ActionResult;
  getDefenseTargets(cardId: string): PlayTarget[];
  defend(cardId: string, target?: PlayTarget): ActionResult;
  passDefense(): ActionResult;
  canFuse(cardIdA: string, cardIdB: string): ActionResult;
  fuse(cardIdA: string, cardIdB: string): ActionResult;
  endTurn(): ActionResult;
  surrender(playerId: string): ActionResult;
  onEvent(handler: (event: GameEvent) => void): () => void;
  dispose(): void;
}
```

- **Phase 2**: `jsLegacyAdapter.ts` で既存 `js/game/Game.js` を繋ぎ、新UI＆3Dバトルを先行完成させる。
- **Phase 3**: Track D の `castlefield-wasm` が完成したら、`wasmAdapter.ts` に1行差し替えるだけでエンジンがRust化する。

---

## 4. 共通ゲームUIコンポーネント仕様（`components/ui/`）

すべての画面は生 `<button>` や白い `<div>` 箱を直接作らず、必ず以下のパーツを使う：

- **`<GameButton variant="primary-gold" | "normal-stone" | "selected-royal" | "danger-ruby" size="sm" | "md" | "lg">`**
  - 9-slice画像（`assets/v2/ui/buttons/*.webp`）を使用。
  - Motion の `whileTap={{ y: 3, scale: 0.98 }}` で物理的に沈む手触り＋クリックSEを自動再生。
  - 最小高さ `44px`（`lg` の主CTAは `56px`）。
- **`<PaintedIcon name="..." size={24} />`**
  - `assets/v2/icons/` のカラーWebPスプライト／画像のみを描画。`<svg>` フォールバック禁止。
- **`<GameCard card={...} mode="hand" | "grid" | "compact" />`**
  - 2:3比率を厳守。`grid` / `hand` で空の説明枠を出さない。
  - 数値表示は型安全に整形（`soldier.range && soldier.range > 1` のみ射程表示 → `射undefined` を型レベルで根絶）。

---

## 5. 外遊びスマホ最適化仕様（通信量・電池・60fps）

1. **ルート／機能単位の遅延ロード（`React.lazy`）**
   - 初期起動で読むのは「ホームUI＋最小限の共通素材＋ホーム城」のみ。
   - ショップ・スキルツリー（PixiJS）・カード3D拡大・他ステージGLBは、開いた瞬間にオンデマンド取得する。
2. **3Dの省電力レンダリング**
   - `Canvas` の `dpr={[1, 1.75]}` に制限（スマホの3x描画による発熱を防ぐ）。
   - 静止中は `frameloop="demand"` ベースまたはアニメーション中のみ連続描画。
   - 設定に「描画品質：標準3D / 省電力2D」を用意し、WebGL非対応やバッテリー節約時は Blender プリレンダ2D版へシームレス切替。
3. **PWAキャッシュ戦略（`vite-plugin-pwa`）**
   - 旧版のように初回起動で全874ファイル（数十MB）を一括ダウンロードさせない。
   - アプリシェル（HTML/JS/CSS/共通UI部品/ホーム素材）だけ事前キャッシュし、カード絵・ステージGLB・スキルアトラスは **Stale-While-Revalidate / Cache-First のランタイムキャッシュ** とする。
4. **モバイル回線断への耐性**
   - オンライン対戦中はWebSocket断を自動検知し、指数バックオフで自動再接続＋未受信イベントをシーケンス番号で補完する。

---

## 6. 開発＆検証コマンド（Track C 完了条件）
- `npm run dev` で `web/` が起動し、既存 `/data/` と `/assets/` を配信できること。
- `npm run build` が TypeScript エラー・警告なしで完了すること。
- ビルド成果物および `web/src/` 内に `<svg`・`.svg`・`!important` が **0件** であること（CIチェック組込）。
- Playwright で `390×844`・`360×640`・`1280×800` の全画面スクリーンショットを自動撮影し、崩れゼロを確認すること。
