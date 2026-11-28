# 06. CastleField v2 実行・デプロイ＆外遊び接続ガイド

CastleField v2（React + Three.js 遅延読込 + 省電力2Dプリレンダ + PixiJS + Rust WASM + `axum` サーバー）をローカルPC・スマホ実機・本番環境で動かす手順です。

---

## 1. ローカルで遊ぶ（CPU対戦 / 同じ端末2P / ガチャ / デッキ編成）

Node.js (v20+) と npm があれば、ビルド不要ですぐ動きます。

### Windows (PowerShell) / macOS / Linux
```bash
cd web
npm install      # 初回のみ
npm run dev      # http://localhost:5173 で起動
```

スマホと同じ Wi-Fi（LAN）で開きたい場合は `--host 0.0.0.0` を付けて起動します：
```bash
cd web
npx vite --host 0.0.0.0 --port 5173
# 表示された Network の URL（例: http://192.168.x.x:5173）をスマホのブラウザで開く
```

### 外遊び省電力モード（「省電力2D」）
- メニュー画面の **「描画品質（外遊び省電力）」→「省電力2D」** を選ぶと、`three.js` や大型 3D GLB を読み込まず、Blender で事前レンダリングした軽量 WebP スプライト（`assets/v2/renders/`）で動作します。
- 電池消費・4G/5G 通信量を大幅に抑えつつ、草原・溶岩・氷・遺跡・闇森・砂漠の各ステージや宝箱開封アニメを楽しめます。

---

## 2. 友達と「合言葉対戦」＆「ランクマッチ」（Rust サーバー起動）

オンライン対戦・ランクマッチ・サーバーお財布・端末引き継ぎコードを使う場合は Rust サーバーを起動します（静的フロントと `data/`・`assets/` も同じポート `8787` で配信されます）。

1. **フロントをビルド**（初回または `web/` 変更時）:
   ```bash
   cd web
   npm ci
   npm run build
   ```
2. **Rust サーバーを起動**（Linux / macOS / CI）:
   ```bash
   cargo run --manifest-path rust/server/Cargo.toml --release
   # http://0.0.0.0:8787 で待機（ブラウザで http://localhost:8787 を開く）
   ```
   > **補足（Windows）**: Windows Smart App Control が有効な環境ではローカル `.exe` 実行がブロックされる場合があります。その場合は下記の Docker、または WSL2 (Ubuntu) 上で実行してください。WSL2 の `/mnt/c/...` 配下では `redb` のロックや I/O を Linux 側へ逃がすと高速＆安定します：
   > ```bash
   > CF_ROOT=. CF_REDB_PATH=$HOME/castlefield.redb cargo run --manifest-path rust/server/Cargo.toml --release
   > ```
3. **URL 招待で1タップ参加**:
   - ホストがホーム画面の `対戦形式` → `合言葉対戦` → **`招待URLをコピー`** を押すと `https://<ホスト>/?room=castle-XXXX&stage=...` が生成されます。
   - LINE / Discord 等で共有すると、友達はリンクを開くだけで同じルームへ入室できます。

---

## 3. Rust WASM・省電力2D素材の再生成（開発者向け）

- **Rust WASM の再コンパイル＆一致テスト**:
  ```bash
  cd rust
  cargo build -p castlefield-wasm --target wasm32-unknown-unknown --release
  cp target/wasm32-unknown-unknown/release/castlefield_wasm.wasm ../web/public/wasm/castlefield_wasm.wasm
  cd ..
  node --test rust/tests/wasm_parity.test.mjs
  node --test rust/tests/js_vs_rust_parity.test.mjs
  ```
- **省電力 2D スプライトの再レンダリング**:
  ```bash
  blender --background --python assets/v2/blender/render_power_saver_sprites.py
  cd web && node scripts/finalize-lite-renders.mjs
  ```

---

## 4. Docker 1コンテナ本番デプロイ（Fly.io / Render / Railway 等）

ルート直下の [Dockerfile](../../Dockerfile) は、Rust WASM + `castlefield-server` (`axum` + `redb`) + Vite `web/dist` を 1つのコンテナイメージにまとめます。

```bash
docker build -t castlefield-v2 .
docker run -d -p 8787:8787 -v castlefield_data:/app/data-store castlefield-v2
```

- ヘルスチェックエンドポイント: `GET /healthz`, `GET /readyz`
- Prometheus メトリクス: `GET /metrics`
- WebSocket 差分再送: `GET /api/ws?token=...&lastSeq=...`
