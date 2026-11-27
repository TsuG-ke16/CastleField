# 06. CastleField v2 デプロイ＆外遊び接続ガイド

本ガイドでは、CastleField v2（React + Three.js + PixiJS + Rust WASM + `axum` サーバー）をローカル開発・スマホLAN対戦・クラウド本番環境で動かす手順をまとめます。

---

## 1. ローカル開発（PC＋スマホ実機プレビュー）

1. **フロント起動（Rust WASM 自動同梱）**:
   ```bash
   cd web
   npm ci
   npm run build    # 初回または Rust 再ビルド時は web/dist と PWA 更新
   npx vite --host 0.0.0.0 --port 5173
   ```
2. **Rust WASM の再コンパイル（ゲームロジック変更時）**:
   ```bash
   cd rust
   cargo build -p castlefield-wasm --target wasm32-unknown-unknown --release
   cp target/wasm32-unknown-unknown/release/castlefield_wasm.wasm ../web/public/wasm/castlefield_wasm.wasm
   cd .. && node --test rust/tests/wasm_parity.test.mjs
   ```

---

## 2. 友達と「合言葉対戦」（Rust サーバー経由）

1. **Rust サーバー起動（Linux / macOS / CI）**:
   ```bash
   cargo run --manifest-path rust/server/Cargo.toml --release
   # 既定で http://0.0.0.0:8787 で待機（web/dist・data・assets も同居配信）
   ```
2. **URL招待で1タップ参加**:
   - ホストがホーム画面の `対戦形式` → `合言葉対戦` → **`招待URLをコピー`** を押すと `https://<ホスト>/?room=castle-XXXX&stage=...` が生成されます。
   - LINE・Discord 等で共有された友達がそのURLを開くと、そのまま合言葉ルーム入室状態でバトルを始められます。
3. **1台のスマホで交互プレイ（回線不要）**:
   - 電波の弱い屋外や飛行機内では、`対戦形式` → **`同じ端末`** を選ぶと手札隠し受け渡しカーテン付きで1台対戦できます。

---

## 3. Docker 1コンテナ本番デプロイ（Fly.io / Render / Railway 等）

ルート直下の [Dockerfile](../../Dockerfile) は、Rust WASM + `castlefield-server` (`axum` + `redb`) + Vite `web/dist` を 1つのコンテナイメージにまとめます。

```bash
docker build -t castlefield-v2 .
docker run -d -p 8787:8787 -v castlefield_data:/app/data-store castlefield-v2
```

- ヘルスチェックエンドポイント: `GET /healthz`, `GET /readyz`
- Prometheus メトリクス: `GET /metrics`
- WebSocket 差分再送: `GET /api/ws?token=...&lastSeq=...`
