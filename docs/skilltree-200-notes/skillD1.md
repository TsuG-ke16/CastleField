# 段階D1：UI（worktree /tmp/skill200-wt6・branch skillD1）

## 状況
- 完了：クラシックの入口、対戦前のスキルツリー画面、CPU戦・同じ端末・オンライン部屋への受け渡し、対戦中のスキル表示（一覧・状態・発動ログ・任意スキル・カード使用前の選択）、PR #200 の見た目への合わせ込みと書き出し、DOM非依存ロジックのテスト
- 未完・制限：下の「未確認・制限」

## 操作方法
1. ホーム上部の「クラシック」（通常モード／4陣営モードの隣）→ `?mode=classic&home=1` で読み直す（`cf-home-ruleset` に覚える）
2. 「対戦の準備へ」→ スキルツリー画面（ひとりで・同じ端末・カジュアル対戦のどれでも先に開く）
   - ドラッグでパン、ホイール／ピンチで拡大、＋／−／全体、ミニマップのタップで移動
   - 検索（ID・名前・効果文・系統名）→ 結果のボタンでジャンプ。系統チップで絞り込み＋その系統へ移動。「取得できる」チップで今取れるノードの一覧
   - ノードをタップ → 詳細（種類・系統・効果・必須・横断の両端・回数・状態と canAcquire の理由・休眠表示・未接続なら START からの道）。取得／解除（release の理由を表示）、E04/X25 の選択
   - おすすめ（data の presets＝第10章の4種）、全リセット（確認あり）。上部に残pt・奥義数・取得数
   - 変更のたびに localStorage `cf-classic-skilltree` へ `serializeBuild` の形（version 3）で保存。読むときは `deserializeBuild`（旧版は振り直し＋お知らせ）
3. 「このスキルで対戦の準備へ」→ 今までの準備画面（CPUの強さ等）。`new Game({ skillTree, setup.skills })`：自分の席は保存ビルド、CPU は `chooseSkillBuild(tree, rng, CPU_LEVELS[level].strategy)`（rng はシードから別系列）。同じ端末の2人以上は全員が保存ビルド
4. 対戦中：左の「スキル」ボタン（だれかがスキルを持つときだけ）→ パネル
   - 自分：状態（魂・血気・貯蔵MP・回復貯蔵・SP・HP債務・予約・トークン・墓地・会心/運命の蓄積・確認したカード。関係するノードを取ったときだけ）、取得スキル（折りたたみ・回数 n/m・休眠表示）、任意スキル（`listSkillActions` の結果だけ：対象・消費・preview・キャンセル・実行＝`skillAction`。対象が兵士なら盤面で光らせ、タップでも選べる）、発動ログ（`observeSkills` の自分の trigger だけ）
   - 相手：getState の公開部分（skills・skillState の resources/debt/tokens/scheduledCount/graveCount/public）だけ
   - カード使用前のダイアログ（自分の番のメインで、聞くことがあるときだけ）：B08 の HP置換量（スライダー）、B01 の不足分をHPで払うか、B03 血の刃、X27 血のやまびこ、L06 出目の選び方 → `playCard` の第3引数。実際の支払い（MP・城HP）は `LocalSession.previewCardCost`（Game の `skillRt.planCardCost(..., { preview: true })` をそのまま呼ぶ）で表示
   - H01 を持つときはマリガンで案内を1回出す
5. オンライン：クラシックで合言葉の部屋に入ると join に `mode: "classic"` を送り、入ったあと `setSeat({ skills })` で保存ビルドを席に送る。部屋の席に「スキル：n個（ID…）」と、自分の席に「スキルツリー」ボタン（変えると setSeat）

## 変更ファイル
- 新規：`js/ui/SkillTreeView.js`、`js/ui/SkillBattleView.js`、`js/ui/skillTreeModel.js`（DOM非依存：表示状態・検索・経路・保存・対戦中の行・カード前の質問）、`js/ui/skillTreeExport.js`（PR200 形式への変換）、`css/skilltree.css`、`tools/export-skilltree-preview.mjs`、`docs/skilltree-200-preview.json`、`tests/skilltree-ui.test.js`（7件）
- 変更：`js/main.js`（skillTree の読込・入口・startLocal の skills・doPlay の skillOptions・settle で表示更新・join の mode と setSeat）、`js/ui/HomeRuleSet.js`（skillTree を返す・`rulesetUrl` に classic）、`js/ui/Home.js`（クラシックのボタン・デッキ/ランク等の案内）、`js/ui/Session.js`（playCard 第3引数・listSkillActions・skillAction・previewCardCost）、`js/ui/OnlineClient.js`（playCard 第3引数・listSkillActions は state から・skillAction は未対応の理由）、`js/ui/RoomView.js`（席のスキル表示とボタン）、`index.html`（CSS）、`js/ui/precache.js`（build-precache で再生成）
- `js/game/`・`server/` は変更なし（サーバーは既に join の mode・setSeat の skills・playCard の args をそのまま Game に渡せた）

## 確認
- `node --test`：1025件 pass / 0 fail（開始時 1018件＋新規7件）
- `tests/sim/run.js`（通常 20試合・`--mode factions` 20試合・`--mode classic` 10試合、seed 1、--json）：変更前 d486eb0 と完全一致
- 実ブラウザ（Playwright＋google-chrome、390×844・1280×800、python の http.server と `node server/server.js`）：ホーム→クラシック→ツリー→おすすめ適用→検索→詳細→ホイール拡大→決定→CPU戦開始→スキルパネル／血の刃のダイアログで支払い表示と B03 発動（ログに出る）／V07 召喚の門を実行（MP-3）／オンラインの部屋で mode 送信・setSeat・CPU追加・対戦開始。ページエラーなし
- `ui-tests/home-ruleset.js` OK。`ui-tests/smoke.js` は結果画面の待ちでタイムアウトするが、変更前（d486eb0 を git archive で展開したもの）でも同じ所で失敗するので今回の変更とは無関係
- サーバーを動かしたとき `data-store/castlefield.db-shm/-wal`（追跡されているファイル）が書き換わったので、`git checkout` で元に戻した（コミットしていない）

## 未確認・制限
- 実機（指のピンチ・慣性・iOS Safari）は未確認。ピンチは Pointer Events で実装し、ヘッドレスのタッチでは試していない
- オンラインの対戦中の任意スキル（`skillAction`）は使えない（`server/rooms.js` の操作一覧に無く、今回の範囲は join/setSeat のみ）。カード使用前の選択はオンラインでも playCard の第3引数で届くが、支払いの見積もりは出せない（「サーバーで決まる」と表示）。発動ログもオンラインでは出ない（observe がない）（→ その後 feature/online-skills で対応。`online-skills.md`）
- X15（2枚から選ぶ）は Game 側に選択の口がなく自動選択のまま。L06 は事前指定（2つの出目を見てから選ぶ2段階は未対応。クラシックにサイコロのカードもない）。X35（延期）のオン/オフ UI はない
- 同じ端末の2人以上は全員が同じ保存ビルド（席ごとの選択画面はない）。発動ログは試合開始時の視点の人の分
- 任意スキルの対象は一覧のボタン＋兵士なら盤面で光らせる方式（Targeting.js の本体は onChoose が doPlay 固定なので再利用せず、Renderer.setTargets だけ使った）
- CPU の任意スキル・カード選択は D2 の担当（ここでは何もしていない）

## PR #200 との関係
PR #200（元リポジトリの ref `pr200`、`previews/skill-tree/`）は Game に接続しない独立プレビュー。読むだけで、元リポジトリは変更していない。
- 流用した点：配色（#102631/#193742/#234550/#3b5661、水色 #8ad7de、金 #f5cb80、橙 #f2a347）、点のパターンの背景、系統アイコン（既存 `assets/ui/icon-*.png`・`factions/crest-*`・`home/*`・`kingdom-crest.png`）、奥義＝大きな菱形、取得済み＝水色の塗り＋右下のチェック、取得できる＝金の輪郭、選択＝金の点線の輪、辺の色（取得済み＝水色の太線・選択/次＝金）、系統名のラベル、Canvas のミニマップ（クリックで移動）、詳細のカード枠（`cards/frame-rare/legendary.png`）、ズーム中心を保つ拡大・2本指ピンチの方式
- 違う点：ルールはすべて `js/game/SkillTree.js`（PR200 の「表示サンプルの取得」や仮データは使わない）。座標はデータの layout（×1.8）で、PR200 の自動クラスター配置は使わない。状態は4つ（取得済み／取得できる／条件不足＝破線と「!」／未接続＝点線・灰色）にした（PR200 は3つ）。横断ノードは六角形（PR200 には横断がない）、START は紋章の大きな円。カメラは viewBox 方式（PR200 は transform）。3ペインではなく、検索・系統チップ・下の詳細（PC は右に浮く詳細）の1画面。名前付きビルドの複数保存はない（保存は1つ、版つき）
- 書き出し：`node tools/export-skilltree-preview.mjs` → `docs/skilltree-200-preview.json`（変換 `js/ui/skillTreeExport.js`）。PR200 の `validateData` と `layout` で読めること、プレビュー画面の「仕様データ読込」で読み込めて描けることを確認済み
  - PR200 は nodes をちょうど200件に固定しているので、**START は入れない**（root ノードなし）。START–01 の辺19本も書き出さず、各系統の 01 と L01 の `condition` に「START に隣接（最初から取得できる）」と書き、`state` は空ビルドの canAcquire で 01 と L01 だけ `available`。START を root として入れたい場合は、PR200 側の検証を「200件＋root」にするか、取得ノードを1つ削る必要があり、後者は仕様違反なので採らない
  - 横断ノード（X01〜X48）は `group: null`・`kind: "normal"`（PR200 は group null のノードを position に置く）。辺は系統間（横断）も含めてそのまま267本。座標は layout×2
