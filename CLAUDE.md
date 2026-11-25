# キャッスルフィールド（城攻めカードゲーム）

ゴッドフィールドを参考にした、城攻めの対戦カードゲーム。
手札から兵士・武器・魔法のカードを出して相手の城に送り込み、先に城を落とした人が勝つ。
途中で中央に魔物が現れ、とどめを刺した人がボーナスをもらえる。

企画書（全体の仕様）：https://claude.ai/artifact/7RTPauHRXWenSp1grsePnf
このファイルは、企画書から開発に必要な部分を抜き出したもの。

- 企画書は2人とも開ける状態にしておく（共有設定を確認すること）
- **実装の判断はこのファイルを正とする。** 企画書と食い違いを見つけたら、実装を止めて人間に確認し、このファイルを直すPRを出す
- 企画書を更新したら、このファイルの該当箇所も同じPRで直す

## チーム開発のルール（必ず守ること）

このリポジトリは2人で開発している。それぞれが自分のClaude Codeを使って作業する。

- **main に直接コミットしない。** 作業は必ずブランチで行い、プルリクエスト（PR）でまとめる
- ブランチ名：`feature/<内容>`、`fix/<内容>`、`docs/<内容>`（例：`feature/soldier-move`）
- **PRは相手の承認を受けてからマージする。** 自分のPRを自分でマージしない
- **担当外のフォルダは変更しない。** 指示で「触っていい範囲」が示されたら、その外のファイルは編集しない。必要なときは変更せず、PRの説明文に「相手側で必要な変更」として書く
- 作業を始める前に `git pull origin main` で最新を取り込む
- 仕様に書かれていないことを決めるとき、仕様と違うやり方にしたいときは、実装する前に必ず人間に確認する
- 1つのPRは1つの機能にする。大きくなりすぎたら分ける
- コミットメッセージは日本語でよい。何を変えたかが一行でわかるように書く

## ゲームづくりの原則（桜井流）

YouTube「桜井政博のゲーム作るには」の考え方を、このゲーム向けにまとめたもの。仕様を決めるとき、カードを足すとき、PRをレビューするときは、この原則に照らす。

- スキル `sakurai`（https://github.com/kociden/sakurai-skill ）が入っている環境では、企画・調整・レビューのときに必ず読み込む。入っていなくても、以下の原則は守る
- 迷ったら「遊ぶ人が楽しいか」で決める。作る側の都合や好みは理由にしない
- 判断を先送りしない。決まっていないことは、その場で人間に聞いて決める

### カードとルール
- **どのカードにも長所と短所をつける。** 他のカードの完全な上位互換・下位互換を作らない（例：速いけど弱い／遅いけど強い）
- **大きな見返りには、大きなリスクを。** すぐ効く・防げないカードは弱めに、時間がかかる・妨害されうるカードは強めにする
- 平均的なカードばかりにしない。強みは尖らせ、調整は威力以外（速さ・枚数・使い切りなど）で行う
- **必ず決着がつくようにする。** 回復や防御が攻撃を上回り続けて終わらない状態は、仕様の不具合として扱う
- 運だけで勝敗が決まらないようにする。引くカードは運でも、それをどう使うかで差がつくようにする

### 遊びやすさ
- 1試合は10分前後を目安にする。最初の1分で面白さが伝わるようにする（長い説明から始めない）
- 待ち時間を短く。演出・画面切り替え・アニメーションは長すぎないか常に見直す。演出はタップで飛ばせるようにする
- 押して何も起きない操作を作らない。出せないカードは、出せない理由を表示する
- 負けた人も「もう1回」と思えるように、再戦までの操作を短くする

### 手応え
- 攻撃が当たったときは、一瞬止める（ヒットストップ）・画面を揺らす・数字を大きく出す、をセットで入れる
- 強い攻撃ほど、止める時間・揺れ・音を大きくする
- 勝った人を派手に褒める演出を入れる

### 調整のしかた
- 数値は `data/` に出し、JSONを直してリロードするだけで試せるようにする
- デバッグモードを用意する（URLに `?debug=1`：城HPや手札を自由に変えられる、山札の順番を固定できる）
- カードや数値を変えたら、何試合か通して遊び、決着までの手番数と「出すカードに迷う場面があるか」を確かめてPRに書く
- 作った本人は慣れているので、難しさや分かりにくさは「思ったより下げる」くらいでちょうどよい。初めての人に遊んでもらい、説明せずに反応を見る

## 担当の分け方

| 領域 | フォルダ・ファイル | 内容 |
|---|---|---|
| ゲームロジック | `js/game/`、`data/`、`tests/`、`server/` | ターン進行、兵士の進軍、カード効果、勝敗判定、数値データ、自動テストとシミュレーション、オンライン対戦のサーバー |
| 画面（UI） | `index.html`、`css/`、`js/ui/`、`js/main.js`、`assets/`、`sw.js`、`manifest.webmanifest`、`ui-tests/` | レイアウト、手札の表示、アニメーション、入力、Game と UI の接続、画像素材、ホーム画面に追加・オフライン（PWA）、画面のスモークテスト |
| 共有 | `CLAUDE.md` | 変更は2人で相談してから。PRで相手の承認を必須とする |

ロジックと画面のつなぎ方は、下の「ロジックとUIの約束」に従う。この約束を変えるときは、2人で相談してからこのファイルを更新する。

## 技術

- HTML / CSS / JavaScript（フレームワークなし、ES Modules）。**例外：three.js を `js/vendor/three/` に置いてある**（図鑑・デッキ編成の拡大表示のカードを3Dで描くためだけに使う。人間に確認して入れた。npm からは入れず、ファイルをそのまま置く。拡大表示を開いたときにだけ読み込む）
- 起動：リポジトリのルートで `python3 -m http.server` を実行し、`http://localhost:8000` を開く（Windows は `python -m http.server`）
  - 遊ぶモード（通常／4陣営）は、ホームの「通常モード／4陣営モード」で選ぶ（URL の `?mode=factions` でも同じ。くわしくは「4陣営モード（ベータ）の入口」）
- 自動テスト：リポジトリのルートで `node --test`（Node.js 22.7 以上。`package.json` がなくても `.js` を ES Modules として読めるのが 22.7 から。外部パッケージは使わない）。ロジックを変えたら必ず全部通してからPRを出す。新しい機能にはテストを足す
- 画面のスモークテスト：`node ui-tests/smoke.js`（タイトル→ひとりで遊ぶ→1手出す→結果→再戦。Playwright は環境にあるものを使い、リポジトリには入れない）。画面を大きく変えたら通す
- **オフライン用の一覧**：配るファイル（`index.html`・`css/`・`js/`・`data/`・`assets/`）を変えたら、`node js/ui/build-precache.js` で `js/ui/precache.js` を作り直して同じPRに入れる（忘れると、2回目以降の起動で古い版が出る）
- バランスのシミュレーション：`node tests/sim/run.js`（いろいろな戦い方の組み合わせで各1000試合）。乱数はシード付きなので、同じ引数なら誰が回しても同じ結果になる
  - `--games 200`（試合数）、`--seed 7`、`--match smart,random`（1つの組み合わせだけ）、`--rules '{"castleMaxHp":30}'`・`--cards '{"fireball":{"count":3}}'`（`data/` を書き換えずに一部の値だけ試す）、`--json`
  - 「出せる種類が2以上」の列は、出せるカードが2種類以上あったターンの割合（目安）。本当に迷うかは人が遊んで確かめる
  - 戦い方（`js/game/strategies.js`。ひとりで遊ぶモードの CPU も同じものを使う）：`random`（出せるカードからランダム）、`aggro`（城への魔法 → 兵士）、`smart`（ほどよく考える）、`defensive`（守り優先）、`rush`（攻め重視：城への魔法 → 兵士。武器・盾・強化は使うが回復はしない）、`guard`（兵士で守る）、`pass`（何も出さない）
- 数値はコードに直接書かない（バランス調整をJSONだけでできるようにするため）
  - カードの数値 → `data/cards.json`
  - ルールの数値（城HP、手札枚数、道の長さ `laneLength` など）→ `data/rules.json`
- ゲームロジックは画面（DOM）に一切触らない。後でオンライン対戦にするとき、ロジックをそのままサーバーに移すため
- ゲームロジックは乱数を外から渡せるようにする（`new Game({ rng })`）。テストで山札の順番を固定するため

## フォルダ構成

```
index.html
sw.js              … サービスワーカー（オフライン。PWA。UI担当）
manifest.webmanifest … ホーム画面に追加するときの情報（UI担当）
README.md          … このリポジトリの入口（遊び方・起動・フォルダ）
.gitignore
css/               … 画面のスタイル。style.css が土台、theme.css・step5.css などが上に重なる
js/
  main.js          … 起動。Game と UI をつなぐ（UI担当）
  game/            … ゲームロジック（DOMを使わない）
    Game.js
    Player.js
    Castle.js
    Card.js
    Soldier.js
    Road.js        … 道（となりの席どうし・広場の通り道）
    Monster.js     … 魔物と、強化のデータのチェック
    Weather.js     … 天候のデータのチェック
    Stage.js       … ステージ（マップ）のデータのチェックと選び方
    Setup.js       … 城の種類・デッキのデータのチェックと、山札1組（Pile）
    visibility.js  … オンラインで、イベントをプレイヤーごとに隠す決まり
    strategies.js  … 戦い方（random / aggro / smart / defensive / rush / guard / pass）。シミュレーションと CPU が使う
  ui/              … 画面表示と入力
    Renderer.js    … 盤面（道・広場・城・兵士・魔物）
    HandView.js    … 手札
    Animations.js  … 演出
    RoomView.js・LocalSetup.js … 部屋・ひとりで遊ぶの設定
    Tutorial.js・HelpView.js・CardGuide.js … 案内・遊び方・図鑑
    Settings.js・Sound.js・Music.js … 設定・効果音・BGM
    MatchStats.js  … 結果のまとめと戦績
    ChatView.js    … チャットとスタンプ（💬ボタン・吹き出し）
    DeckEditor.js・DeckStore.js … デッキ編成の画面と、マイデッキの保存（この端末の localStorage）
    CardZoom.js    … デッキ編成・図鑑でカードを長押しすると拡大（傾き・偏光・360度回転）
    CardGL.js      … 拡大表示のカードを、Blender 製の板（assets/models/card-slab.glb）と three.js で描く。凹凸は枠の高さの地図から作った本物のメッシュ（光・影・金属の映り込みは three.js）。宝石は内側から光り、金属・宝石の上に向きと時間で瞬く星形の粒（キラキラ）を散らす。ランク報酬の裏（`assets/skins/back-rank-*-relief.png`）も同じくメッシュ。偏光は CardRelief.js と同じ色。読めないときは Card3D.js（CSS の 3D）のまま。`?card3d=css` か `?fx=lite` で CSS に固定
    stories.js     … 図鑑で読むカードのストーリー（画面だけで使う文。カードを増やしたら1つ足す。ui-tests/stories.js が確かめる）
    card-shapes.js … カードの枠・ランクの裏の凹凸を、色ではなく形の部品（外形・はみ出す飾り・帯・メダル・宝石のカット・紋章の輪と葉）で組み立てる。位置は絵を測って書いた。build-card-relief.js が使う（宝石を足した・動かしたときはここを直す）
    art.js・config.js … 画像の割り当てと、UIの数値（CPUの強さの割り当ても）
    precache.js    … オフライン用の一覧（自動生成。node js/ui/build-precache.js）
data/
  cards.json       … カードの定義
  rules.json       … ルールの数値
  monsters.json    … 魔物の定義（STEP 3）
  castles.json     … 城の種類（STEP 5）
  decks.json       … デッキ対戦のデッキ（STEP 5）
  rarities.json    … レアリティと排出率（コモン〜レジェンド）
  upgrades.json    … コインで買う強化（STEP 3）
  weather.json     … 天候（晴れ・雨・大雨・霧・嵐・砂嵐・コインの雨）
  stages.json      … ステージ（草原・溶岩・氷・古代遺跡・闇の森・砂漠）
  stamps.json      … チャットのスタンプの一覧
  factions/        … 4陣営モード（factions.json・cards/<陣営>.json・rules.json・elements.json・reactions.json。「4陣営モード」）
ui-tests/          … 画面のスモークテスト（node ui-tests/smoke.js。Playwright は環境にあるものを使う。UI担当）
docs/              … 設計メモ。archive/ は終わった依頼（Codex 向けのプロンプトなど）
tests/             … 自動テスト（node --test）。Node.js だけで動く
  helpers.js       … data/ と fixtures/ の読み込み、シード付き乱数、イベントの記録
  fixtures/        … テスト用の固定データ（data/ を調整してもロジックのテストが落ちないように）
  *.test.js        … テスト本体
  sim/             … バランス確認のシミュレーション
    sim.js         … 1試合・何試合も回して数字を集める
    strategies.js  … js/game/strategies.js をそのまま出すだけ（戦い方の本体はそちら）
    run.js         … 表を出すコマンド（2人）
    multi.js       … 2人・4人・8人で、道の形（広場・輪）と勝利条件を比べる
    castles.js     … 城の種類・デッキの勝率
    teams.js       … チーム戦の分け方ごとの勝率と長さ
    factions.js    … 4陣営モードの陣営どうしの勝率と長さ
server/            … オンライン対戦のサーバー（Node.js だけ。ロジック担当）
  server.js        … HTTP（合言葉で入る・操作を受ける・SSE で送る）。node server/server.js で起動
  rooms.js         … 部屋と席。Game を動かし、プレイヤーごとに隠して送る
                     画面のファイルのほか、/sw.js と /manifest.webmanifest（PWA）も配る
assets/            … 画像素材（UI担当）
  STYLE.md         … 絵柄の決まりと、画像生成AIに使う共通の指示文
  CREDITS.md       … 素材ごとの出どころとライセンス
  bg/              … 背景
  castles/         … 城
  units/           … 兵士（盤面に置くもの）
  cards/           … カードの絵と枠
  fx/              … 演出（爆発・雷・回復・土けむりなど）
  ui/              … ボタン・看板・帯などの画面部品
  models/          … 3Dのモデル（.glb）と、それを作る Blender のスクリプト（make-card.py。python3 assets/models/make-card.py。bpy が要る）
```

## 画像素材

見た目は、明るいカートゥーン調のファンタジー（太めのこげ茶の輪郭線、やわらかい影、2頭身のちびキャラ）でそろえる。絵柄の決まりと、画像生成AIに毎回付ける共通の指示文は `assets/STYLE.md` に書く。

- **絵柄をそろえる**：新しい絵は、必ず `assets/STYLE.md` の共通の指示文を使って作る。作者や絵柄がばらばらの素材を混ぜない
- **形式**：背景が透明な PNG。背景は 1080×1920（9:16）、城は横 512px、兵士は 256×256、カードの絵は 512×512、カードの枠は 512×768 を目安にする。1枚 300KB 以下に圧縮する
- **ファイル名**：小文字の英字とハイフンだけ。プレイヤーの色は最後に付ける
  - 盤面の兵士：`units/<カード種類>-blue.png`、`units/<カード種類>-orange.png`（例：`units/infantry-blue.png`）
  - 城：`castles/castle-blue.png`、壊れ具合は `castles/castle-blue-damaged-1.png` のように番号を付ける
  - カードの絵：`cards/card-<カード種類>.png`（`<カード種類>` は `cards.json` のキー。例：`cards/card-fireball.png`）
  - カードの枠：`cards/frame-soldier.png`、`cards/frame-spell.png`
- **プレイヤーの色**：p1 は空色（blue）、p2 は夕焼けオレンジ（orange）
- **画像の割り当ては画面側で決める**：どのカードにどの画像を使うかは `js/ui/` に書き、`data/cards.json` には画像の情報を入れない（ロジックを画面に依存させないため）。カードを増やしたら、同じ名前の決まりで画像を足す
- **出どころを記録する**：素材を足すときは、同じPRで `assets/CREDITS.md` に「ファイル名・作った道具（画像生成AIの名前）か配布元・ライセンス・作った日」を書く
- **ライセンスを守る**：使う前に利用規約を確認する。再配布が禁止されている素材は、リポジトリが公開されている間は入れない

## ロジックとUIの約束

UIはゲームの状態を直接書き換えない。必ず Game のメソッドを呼ぶ。

### 用語

- プレイヤーID：`"p1"`〜`"p8"`（人数は `rules.playerCount`）。先攻は `setup.firstPlayer`（省略すると `"p1"`。「コイントス・後攻の補正・マリガン」）
- カード種類（type）：`cards.json` のキー。例：`"infantry"`
- カードID（cardId）：山札の1枚1枚につく一意のID。例：`"c07"`。同じ種類のカードでもIDは別
- 兵士ID（soldierId）：場に出た兵士につく一意のID。例：`"s03"`
- カードIDは山札をシャッフルしたあとの順に振る。IDから種類は分からない
- 道ID（roadId）：道のID。2人のIDを席順で `-` でつなぐ（3人以上の広場のときは、2人ずつの組の「通り道」。STEP 5 の「真ん中の広場を通る道」）。例：`"p1-p2"`。`rules.laneCount`（レーンの数）が2以上のときは、同じ2人の間に道が `laneCount` 本でき、`"p1-p2#1"`、`"p1-p2#2"` … のように番号がつく（1本のときは番号なし）
- 対象（target）：カードを出す先。`{ playerId }`（兵士は送り込む相手、攻撃の魔法は攻める相手、ヒール・城壁は自分）、`{ playerId, roadId }`（レーンが2本以上のときの、兵士を出す道と、`scope: "lane"` の魔法で狙う道。`castleSpellHitsFront` のときの城への魔法も）、`{ soldierId }`（武器・盾：道の上の自分の兵士）、`{ monsterId }`（ファイアボールで魔物を狙う）

### UIから呼ぶもの

| メソッド | 説明 |
|---|---|
| `new Game({ cards, rules, rng, monsters, upgrades, castles, decks, stages, setup })` | ゲームを作る。`stages`（`data/stages.json`）を渡すと、`setup.stage`（ステージのIDか `"random"`。省略すると `"random"`）のステージで遊ぶ。`cards` / `rules` / `monsters` / `upgrades` / `castles` / `decks` は `data/` の JSON の中身（Game はファイルを読まない）。`cards` / `rules` 以外は省略でき、省略すると魔物は出ず・強化は買えず・城の種類はなし。`setup` は席ごとの選択 `{ castles: [...], decks: [...] }`（省略すると `rules.defaultCastle` / `rules.defaultDeck`）。`rng` は 0以上1未満を返す乱数で、省略すると `Math.random`。作った時点で初期手札は配られていて、`phase` は `"ready"`。イベントは出さない |
| `game.start()` | ゲームを始める。全イベントを `on()` で購読してから呼ぶと、先攻（`setup.firstPlayer`。省略すると p1）のターン1が始まる（`turnStarted` → ドロー → 進軍）。`rules.mulligan` が `true` なら、先に `phase` が `"mulligan"` になり、全員が `mulligan()` を選んでからターン1 |
| `game.mulligan(playerId, cardIds)` | マリガン（`phase` が `"mulligan"` のときだけ。1人1回。自分の番でなくてよい）。`cardIds`（0枚でもよい）を山札に戻してシャッフルし、同じ枚数を引き直す。全員が選んだら先攻のターン1が始まる |
| `game.getState(viewerId)` | 今の状態をただのオブジェクトで返す。`viewerId` の手札は中身まで、相手の手札は枚数だけ入る |
| `game.canPlayCard(cardId, target)` | そのカードを今出せるかを返す（読むだけで、状態は変わらない）。出せないときは `{ ok: false, reason }`。`playCard` と同じ判定なので、UIは出せない理由を前もって表示できる。`target` を省略して、対象が2つ以上あるときは `{ ok: true, needsTarget: true }` |
| `game.getTargets(cardId)` | そのカードを今出せる対象の一覧（読むだけ）。出せないときは空の配列。対象の形は下の「対象」 |
| `game.playCard(cardId, target)` | カードを使う。対象が1つしかないときは `target` を省略してよい（2人なら、魔物がいないときは今のカードはすべて省略できる。魔物がいるとファイアボールは「相手の城か魔物か」を選ぶ）。対象が2つ以上あるのに省略すると `{ ok: false, reason: "対象を選んでください", needsTarget: true }` |
| `game.discard(cardIds)` | 手札を捨てる。`phase` が `"discard"` のときだけ使える。捨てる必要がある枚数ちょうどを1回で渡す（多い・少ない・重複・手札にないカードは `{ ok: false }`）。捨て終わったら、自動で次の人のターンが始まる（`endTurn()` を呼び直さない） |
| `game.canBuyUpgrade(upgradeId)` | 強化を今買えるか（読むだけ）。`{ ok }` か `{ ok: false, reason }` |
| `game.buyUpgrade(upgradeId)` | コインで強化を買う。自分のメインの場面（`phase` が `"main"`）で何回でも。メインの1枚とは別 |
| `game.canDefend(cardId, target)` / `game.getDefenseTargets(cardId)` | 攻撃を受けているとき（`phase` が `"defend"`）に、その防御カードを今出せるか／出せる対象の一覧（読むだけ）。`canPlayCard` / `getTargets` の防御版。出せるのは `getState().defense.defenderId` の手札だけ |
| `game.defend(cardId, target)` | 攻撃を受けた人が、防御カードをその場で出す（何枚でも）。出せるカードがなくなったら、自動で攻撃を受ける。対象が1つなら `target` は省略できる |
| `game.passDefense()` | 防御しないで（これ以上出さずに）攻撃を受ける |
| `game.canFuse(cardIdA, cardIdB)` / `game.fuse(cardIdA, cardIdB)` | 手札の同じ種類のカード2枚を合成して、1つ上のレアリティのカード1枚にする（`phase` が `"main"` の自分の番に、何回でも。メインの1枚には数えない）。`canFuse` は読むだけ。レジェンドは合成できない |
| `game.endTurn()` | ターンを終える。手札が上限を超えていたら `phase` が `"discard"` になり、捨て終わるまで次の人の番にならない |
| `game.surrender(playerId)` | 降参する。自分の番でなくても使える。城が2つ（2人・2チーム）のときは、相手の勝ちですぐ終わる（`gameOver` の `reason` は `"surrender"`）。城が3つ以上のときは、降参した人（チーム戦はチーム全員）の城が壊れて（`castleDamaged`、`source: { kind: "surrender" }`）抜け、`playerEliminated` のあと、残りの試合を見守る（番が来ない）。残りの城が1つになったら `gameOver`（`reason` は `"lastStanding"`） |
| `game.on(type, handler)` / `game.off(type, handler)` | イベントの購読と解除。`handler` はペイロードのオブジェクトを1つ受け取る。表にない `type` を渡すと `{ ok: false }` |

- 操作が許されないとき（自分の番でない、1ターンに2枚目を出した、など）は例外を投げず、`{ ok: false, reason: "..." }` を返す。成功したら `{ ok: true }`。`reason` はそのまま画面に出せる日本語の文
- `cards` / `rules` の中身が間違っているときだけは、`new Game()` が例外を投げる（どこが悪いかを書いた Error）
- イベントは操作の中で同期的に、起きた順に発行される。UIはキューにためて順番にアニメーションする
- `handler` の中で例外が出ても、Game は `console.error` に出して処理を続ける（ゲームの状態が途中で止まらないように）

#### デバッグ用（`?debug=1` のときだけ使う）

| メソッド | 説明 |
|---|---|
| `game.debugSetCastleHp(playerId, hp)` | 城HPを変える（1〜その城の上限の整数。後攻の城は上限が高い）。`phase` が `"gameOver"` のときは使えない |
| `game.debugSetHand(playerId, types)` | 手札をカード種類の並びで作り直す（例：`["infantry", "fireball"]`）。カードIDは新しく振り、元の手札はゲームから消える。`phase` が `"discard"` のときは使えない |
| `game.debugSetDeck(types, playerId)` | 山札をカード種類の並びで作り直す（`deckMode` が `"own"` のときは `playerId` の山札。省略すると手番の人）。配列の先頭から順に引かれる。カードIDは新しく振り、元の山札はゲームから消える |

- どれも `{ ok: true }` か `{ ok: false, reason }` を返す。イベントは出さないので、呼んだあとは `getState()` を読み直して描き直す
- `start()` の前に呼べば、開始時の状態を作れる
- 山札の順番を毎回同じにしたいときは、`new Game()` にシード付きの `rng` を渡す

### getState() の形

```js
{
  deckMode: "shared",          // "shared"（全員共通の山札）| "own"（1人1つ）
  playerOrder: ["p1", "p2"],   // 席順（手番の順）。p1〜p8
  round: 2,                    // 周回（席順の最初の人のターンが始まるたびに1増える。start() の前は 0）
  collapse: null,              // 崩壊の刻（rules.collapseStartRound が 0 か省略なら null）。使うときは { announced, active, round }（round は始まった周回。まだなら null）
  monsters: [{ monsterId: "m01", type: "slime", roadId: "p1-p2", square: 1, hp: 4, maxHp: 4, attack: 1, element: "water", attackIn: 3, reward: 2, castleAttack: 2 }],
  roads: [{ roadId: "p1-p2#1", players: ["p1", "p2"], length: 3, lane: 0 }, /* laneCount 本ぶん */],  // 道。length はいつも laneLength。lane は同じ2人の間の何本目か（0から）
  turn: 3,                     // 通算ターン数（1から）
  currentPlayer: "p1",
  phase: "main",               // "ready"（start() の前）| "main" | "discard" | "defend"（攻撃を受ける人の防御待ち）| "gameOver"
  defense: null,               // "defend" のときだけ { defenderId, attackerId, kind: "castle" | "soldiers", amount, soldierIds }
  winner: null,                // 決着したら勝った人のID（"p1"〜"p8"）
  deckCount: 18,               // "own" のときは viewer 本人の山札の数（viewer がいなければ null）
  discardCount: 5,
  exhaustedCount: 1,           // 使い切り置き場の枚数（使い切りのカードを使うとここへ行き、山札に戻らない）
  players: {
    p1: {
      castleHp: 32,
      castleMaxHp: 40,         // その城の上限。後攻（p2）は castleMaxHp + secondPlayerCastleBonus
      hand: [{ cardId: "c07", type: "infantry" }],  // viewer 本人のみ。相手は null
      handCount: 7,
      playedThisTurn: false,   // このターンにメインのカードを出したか
      eliminated: false,       // 負けて抜けたか（3人以上のときに使う。2人ならいつも false）
      cardsPlayedThisTurn: 2,  // このターンに出した枚数（メイン・付加・防御すべて）
      armor: 0,                // 城壁の残り
      coins: 2,                // コイン（魔物のとどめでもらう）
      castleType: "standard",  // 城の種類（castles を渡さなければ null）
      maxHand: 8,              // 手札の上限（城の種類で変わる）
      deckId: null,            // "own" のときのデッキのID
      deckCount: null, discardCount: null, exhaustedCount: null,  // "own" のときだけ、その人の山札などの数
      soldiers: [{
        soldierId: "s03", type: "knight", hp: 4, attack: 6, position: 3, roadId: "p1-p2", targetId: "p2",
        weapon: "waterSpear",  // 持っている武器のカード種類か null
        element: "water",      // "fire" | "water" | "wind" | "earth" | null
        shield: 0,             // 盾の残り
        statuses: { poison: { amount: 1, turns: 2 } /* か null */, frozen: 0 /* 凍結の残り回数 */, burn: null /* やけど */, weakened: null /* 呪い { amount, turns } か null */ },
        token: true, name: "骸骨兵", speed: 2,  // 魔族の骸骨兵（トークン）のときだけ付くキー
        attachments: [{ element: "light", turns: 5 }]  // 付着（reactions を渡したゲームだけ。渡さなければこのキー自体がない）
      }]
    },
    p2: { /* 同じ形 */ }
  }
}
```

- `getState(null)` のように、どちらのプレイヤーIDでもない値を渡すと、両方の `hand` が `null` になる（手番交代の目隠し中などに使う）
- `turn` は `start()` の前は 0
- `position` は「自分の城から数えたマス」（0 = 自分の城の前、`laneLength - 1` = 相手の城の前）
- 画面で道の上に置くときは「道のマス番号」（その道の `players[0]` の城側を 0 とする。2人なら p1 の城側）に直す
  - 道の `players[0]` の兵士：道のマス番号 = `position`
  - 道の `players[1]` の兵士：道のマス番号 = `laneLength - 1 - position`
- 兵士の `targetId` は、その兵士が向かっている相手（道の向こうの人）
- 4陣営モードで足すキー（そのデータを使うゲームだけ。今までのモードの形は変わらない）：兵士の `rangeBonus`（射程+。1以上のときだけ）、`statuses.slowed`（鈍足 `{ amount, turns }` か null）・`statuses.blinded`（目くらまし `{ chance, turns }` か null。どちらも反応に鈍足・目くらましがあるゲームだけ）、`players.pX.castleGuard`（身代わりの兵士のID か null。身代わりのカードがあるゲームだけ）・`bloodArmor`（血の膜の残り。血の膜のカードがあるゲームだけ）・`castleHealCut`（回復量減少 `{ ratio, turns }` か null。反応に回復量減少があるゲームだけ）、`statuses.sand` / `statuses.frostbite`（砂・凍傷 `{ amount, turns }` か null。反応にあるゲームだけ）、`players.pX.castleAttachments`（城に付いている属性 `[{ element, turns }]`。`rules.castleAttach` のゲームだけ。試作）、`players.pX.passiveSpirit`（森の常時の精霊 `{ next, name, element, effect, amount, order, everyTurns, turnsUntilAct }` か null。`next` は次に動く精霊、`turnsUntilAct` は自分のターンの始めがあと何回来たら動くか（1＝次の自分のターン）。だれかが常時の精霊を持つゲームだけ）。くわしくは「4陣営モード」

### Gameが出すイベント

UIはこれを受けてアニメーションする。イベントを増やすときは、この表に追記する。

| イベント | ペイロード |
|---|---|
| `turnStarted` | `{ playerId, turn }` |
| `overdriveChanged` | `{ playerId, active, hp, attack }` … 背水の陣になった（`active: true`）／終わった。`playerId` は城の持ち主。城HPが変わるイベント（`castleDamaged` / `castleHealed` / `monsterAttackedCastle`）のすぐあとに出る |
| `mulliganStarted` | `{ playerIds, firstPlayer }` … マリガンの場面が始まった（`start()` のとき。`rules.mulligan` が `true`） |
| `mulliganDone` | `{ playerId, count, returnedIds, cardIds }` … 引き直した。オンラインでは本人以外に `{ playerId, count }` だけ送る |
| `timeChanged` | `{ time, previous, rounds, cause, playerId }` … 昼と夜が変わった。`time` は `"night"` / `"day"`、`rounds` は夜が続く周回（昼なら0）、`cause` は `"natural"` か `"card"`（ムーンライズ・ドーンブレイク。`playerId` は出した人） |
| `stageEruption` | `{ roadId, square, amount }` … 溶岩のステージの噴火（広場なら `roadId` は `"plaza"`）。このあと、そのマスの兵士の `soldierDamaged`（`cause: "eruption"`）→ `statusApplied`（`"burn"`） |
| `cardDrawn` | `{ playerId, cardIds }` |
| `deckShuffled` | `{ deckCount, playerId }` … `playerId` は、`"own"` のときだれの山札か（`"shared"` なら `null`） |
| `cardPlayed` | `{ playerId, cardId, type }` |
| `cardsFused` | `{ playerId, cardIds: [a, b], cardId, from, to }` … 手札の2枚（`from` の種類）が、1枚（`to` の種類）になった。オンラインでは本人以外に `{ playerId }` だけ送る |
| `discardRequired` | `{ playerId, count }` … 捨てる必要がある枚数 |
| `cardDiscarded` | `{ playerId, cardIds }` |
| `soldierDeployed` | `{ playerId, soldierId, type, roadId, targetId, position, hp, attack, revived?, raised?, name? }` … `raised: true` は魔族の「死者を従える」で生まれた骸骨兵（`type` は `"raisedSoldier"`、`name` は表示名。「魔族の死者を従える」）。`hp` / `attack` は出した時点の値。`revived: true` は蘇生（`reviveFallen`）で生き返った兵士 |
| `soldierMoved` | `{ playerId, soldierId, roadId, from, to, cause?, slipped? }` … `cause` は押し戻されたときだけ `"pushed"`（ゲイルフォース。`to` が `from` より小さい）。`slipped: true` は氷のステージで滑って1マス余分に進んだとき |
| `soldiersClashed` | `{ attacker: { playerId, soldierId }, defender: { playerId, soldierId }, roadId, square }` … 道の上で兵士同士がぶつかった。`attacker` は進軍中の側。`square` は**攻める側が止まったマス**の道のマス番号（1マス先の相手と戦うときも攻める側のマス） |
| `soldierDamaged` | `{ playerId, soldierId, amount, hp, cause, blocked }` … `cause` は `"fight"` / `"spell"` / `"poison"` / `"shot"`（弓兵・魔法使いに撃たれた）/ `"burn"`（やけど）/ `"heat"`（溶岩の灼熱）/ `"eruption"`（噴火）/ `"reaction"`（属性の反応の追加ダメージ。クラシック）/ `"guard"`（身代わりとして城への攻撃を受けた。4陣営）/ `"spirit"`（森の常時の精霊。4陣営）/ `"sand"`・`"frostbite"`（砂・凍傷の継続ダメージ。4陣営）。`blocked` は盾が受けた量（`amount` は与えようとしたダメージ） |
| `soldierDestroyed` | `{ playerId, soldierId, reason }` … `reason` は `"killed"` / `"reachedCastle"` / `"eliminated"`（持ち主が抜けた）/ `"roadClosed"`（道がなくなった）/ `"returned"`（弓兵・魔法使いが帰った） |
| `soldierShot` | `{ playerId, soldierId, role, target, amount }` … 弓兵・魔法使いが撃った。`target` は `{ kind: "soldier", playerId, soldierId }` / `{ kind: "monster", monsterId }` / `{ kind: "castle", playerId }`。このあと `soldierDamaged`（`cause: "shot"`）／`monsterDamaged` …／`castleDamaged`（`source: { kind: "soldier", soldierId }`） |
| `spellCast` | `{ playerId, type, target, targetKind, roadId?, soldierId? }` … `roadId` は、レーンを選んだ魔法（`scope: "lane"`）と、`castleSpellHitsFront` の城への魔法（道が決まるとき）に入る。`soldierId` は、城への魔法が先頭の兵士に当たるとき（`castleSpellHitsFront`）とチェーン・ブラストのときだけ入る（このあと `soldierDamaged`（`cause: "spell"`））。`element` は、ランダム属性ダメージ（`randomElementDamage`）で選ばれた属性（`"fire"` / `"water"` / `"wind"` / `"earth"`）。 `target` は効果を受けるプレイヤーIDか魔物IDの**文字列**、`targetKind` は `"player"` か `"monster"`（`playCard` に渡す `target` のオブジェクトとは形が違う）（ファイアボール・サンダーは相手、ヒールは自分） |
| `castleDamaged` | `{ playerId, amount, blocked, hp, source }` … `playerId` は城の持ち主。崩壊の刻のダメージは `source: { kind: "collapse" }`。`amount` は与えようとしたダメージ（兵士は攻撃力 × `soldierCastleDamageMultiplier`、魔法は値そのまま）（`hp` は0未満にならない）。`blocked` は城壁が受けた量（`hp` は城壁で減らしたあとの値）。`source` は `{ kind: "soldier", soldierId }` か `{ kind: "spell", type }`（4陣営：反応の城へのダメージは `{ kind: "reaction", reaction }`、森の常時の精霊は `{ kind: "passiveSpirit", spirit }`）。`ignoreArmor: true` は城壁を通さなかったとき（4陣営の火炎の吐息。`blocked` は0） |
| `castleHealed` | `{ playerId, amount, hp, source? }` … `amount` は実際に増えた量（上限で止まったぶんは含まない。回復量減少のときは減らしたあと）。`source: { kind: "bloodArmor" }` は血の膜で回復したとき（4陣営） |
| `weaponEquipped` | `{ playerId, soldierId, type, attack, element }` … 武器を持たせた。`attack` は持たせたあとの攻撃力（重ねると足し算。`element` は最後の武器の属性に上書き） |
| `shieldAdded` | `{ playerId, soldierId, amount, shield }` … `shield` は足したあとの盾 |
| `castleArmored` | `{ playerId, armor, bloodArmor? }` … 城壁を置いた。`bloodArmor` は血の膜の城壁を置いたときの、血の膜の残り（4陣営） |
| `armorExpired` | `{ playerId }` … 城壁が消えた（その人のターンの始め） |
| `statusApplied` | `{ playerId, soldierId, status, turns }` … `status` は `"poison"` / `"frozen"` / `"burn"` / `"weakened"`（呪い。`amount` も付く）/ `"slowed"`（鈍足。`amount` も付く。4陣営）/ `"blinded"`（目くらまし。`chance` も付く。4陣営）/ `"sand"`（砂）・`"frostbite"`（凍傷）（継続ダメージ。`amount` も付く。4陣営） |
| `statusCleared` | `{ playerId, soldierId, status }` |
| `roundStarted` | `{ round }` … 周回の始め（`turnStarted` のすぐあと） |
| `monsterAppeared` | `{ monsterId, type, roadId, square, hp, attack, element }` |
| `monsterAttackedCastle` | `{ monsterId, playerId, amount, hp }` … 放置された魔物が城を攻めた。`playerId` は城の持ち主、`amount` は実際に減った量。城HPが0以下になったら、このあとすぐ `gameOver`（城を落とされた方の負け） |
| `monsterClashed` | `{ attacker: { playerId, soldierId }, monsterId, roadId, square }` … 兵士が魔物と戦う。`square` は兵士が止まったマス |
| `monsterDamaged` | `{ monsterId, amount, hp, by }` … `by` は `{ playerId, soldierId }`（兵士）か `{ playerId, type }`（魔法） |
| `monsterDefeated` | `{ monsterId, playerId, reward }` … `playerId` はとどめを刺した人 |
| `coinsChanged` | `{ playerId, delta, coins, reason }` … `reason` は `"reward"` / `"upgrade"` / `"turn"` / `"card"` / `"weather"` / `"stolen"`（ミミックに奪われた）/ `"steal"`（奪った） |
| `upgradeBought` | `{ playerId, upgradeId, cost }` … このあと効果のイベント（`castleHealed` / `cardDrawn` / `soldierBuffed`） |
| `soldierBuffed` | `{ playerId, soldierId, attack }` … とぎ石・訓練・バフサイコロで攻撃力が上がった |
| `diceRolled` | `{ playerId, type, dice, value, amount, rolls, cost? }` … サイコロのカードを振った（「サイコロのカード」の節） |
| `playerEliminated` | `{ playerId, by }` … 城が落ちて抜けた（`lastStanding`）。`by` は落とした人 |
| `defenseRequested` | `{ defenderId, attackerId, kind, amount, soldierIds? }` … 攻撃が当たる前に、受ける人に防御を聞く。`kind` は `"castle"`（城に当たる）か `"soldiers"`（兵士に当たる。`soldierIds` が当たる兵士）。このあと `defend()` / `passDefense()` が来るまで止まる |
| `defenseEnded` | `{ defenderId }` … 防御が終わった。このあと攻撃が当たる（`castleDamaged` / `soldierDamaged` …） |
| `roadClosed` | `{ roadId, monsterIds }` … 道がなくなった。その道の魔物（`monsterIds`）も消える |
| `roadOpened` | `{ roadId, players }` … 抜けた人の両どなりをつなぐ道ができた |
| `spellReflected` | `{ defenderId, attackerId, amount }` … 反射。このあと撃った人の城に `castleDamaged` |
| `soldierDecoyed` | `{ defenderId, attackerId, soldierId }` … 身代わり。このあと兵士の `soldierDestroyed`（`"reachedCastle"`）。城にダメージは入らない |
| `cardStolen` | `{ playerId, victimId, cardId }` … 盗賊。`cardId` から種類は分からない（奪った本人だけが `state` で種類を見られる） |
| `spiritSummoned` | `{ playerId, type, spirit, amount, turns, targetId }` … 精霊を呼んだ。`spirit` は `"fire"` / `"water"` / `"wind"` / `"earth"`。`targetId` は火の精霊が攻める相手（ほかは `null`） |
| `spiritTriggered` | `{ playerId, type, spirit, amount, targetId? }` … 火・水の精霊が効いた（このあと `castleDamaged`（`source: { kind: "spirit", type }`）／`castleHealed`） |
| `passiveSpiritActed` | `{ playerId, spirit, name, element, effect, amount, targetId, soldierIds, push? }` … 4陣営の森の常時の精霊が動いた（自分のターンの始め。コイン・MP の回復のあと、ドローの前。`everyTurns` で休むターンには出ない）。`effect` は `"castleDamage"`（`targetId` の城に。このあと `castleDamaged`（`source: { kind: "passiveSpirit", spirit }`。精霊に `ignoreArmor` を書けば `ignoreArmor: true`。今の森の精霊は書いていない））／`"soldiersDamage"`（`soldierIds` の兵士に `soldierDamaged`（`cause: "spirit"`））／`"pushFront"`（`soldierIds` の先頭の兵士を `push` マス押し戻す `soldierMoved`（`cause: "pushed"`。マス0なら出ない）→ `soldierDamaged`（`cause: "spirit"`））。敵の兵士がいなければ `soldierIds` は空で、何も起きない。そのあと、敵の見える兵士全員に `elementAttached`（`source: "passiveSpirit"`。`reactions` を渡したゲームだけ） |
| `spiritEnded` | `{ playerId, type, reason }` … `reason` は `"expired"`（終わった）か `"replaced"`（ほかの精霊に入れ替わった） |
| `mpChanged` | `{ playerId, delta, mp, reason }` … `reason` は `"cast"`（魔法・精霊で使った。`mpAllCards` なら兵士・武器・防御なども）／`"turn"`（ターンの始めの自然回復 `mpPerTurn`）／`"stage"`（古代遺跡）／`"card"`（マナ回復）／`"drained"`（MPドレインで奪われた）／`"drain"`（MPドレインで奪った）。上限や0で止まったぶんは `delta` に含まない |
| `monsterEvolved` | `{ monsterId, rewardRarity, hp, maxHp, attack, castleAttack, count }` … 放置された魔物が強くなった（`count` は強くなった回数）。`monsterAppeared` の後の周回の始め、魔物の城への攻撃のあと |
| `collapseAnnounced` | `{ round, startRound }` … 崩壊の刻の予告（`rules.collapseAnnounceRound` の周回の始め。`roundStarted` のあと） |
| `collapseStarted` | `{ round }` … 崩壊の刻が始まった（`rules.collapseStartRound` の周回の始め）。このあと全員の城の `castleDamaged`（`source: { kind: "collapse" }`） |
| `elementAttached` | `{ playerId, soldierId, element, turns, source? }` … 兵士に属性が付着した（同じ属性がまた付いて残りが戻ったときも出る）。`source: "turnStart"` は自分のターンの始めのランダム付着（「クラシックの属性：ターン開始時のランダム付着」）、`source: "passiveSpirit"` は森の常時の精霊の付着（4陣営）。`reactions` を渡したゲームだけ（「クラシックの付着と反応」） |
| `elementCleared` | `{ playerId, soldierId, element, reason, weapon? }` … 兵士の属性が消えた。`reason` は `"reaction"`（反応で使われた）か `"expired"`（付着の残りが0）か `"purified"`（4陣営の浄化で消された）。`weapon: true` は武器の属性が反応で外れたとき（武器の攻撃ボーナスは残る。生まれつきの属性が消えたときは付かない） |
| `reactionTriggered` | `{ reaction, name, soldierId, playerId, elements, damage, consumed }` … 属性の反応が起きた。`reaction` は反応のID（`"chaos"` は混沌反応）、`elements` は反応した属性（当たった攻撃の属性も含む）、`consumed` は兵士から消える属性、`damage` は追加ダメージ（砕氷の凍結中の上乗せ込み）。このあと `elementCleared` …（`"reaction"`）→ 追加ダメージの `soldierDamaged`（`cause: "reaction"`） |
| `soldierHealed` | `{ playerId, soldierId, amount, hp }` … 兵士が回復した（4陣営の竜血の雫・生命の雫） |
| `castleGuardSet` | `{ playerId, soldierId }` … 身代わり（`guardCastle`）を置いた |
| `castleGuarded` | `{ playerId, soldierId, guardOwnerId, amount }` … 城への攻撃を身代わりの兵士が受けた。このあと `soldierDamaged`（`cause: "guard"`） |
| `shieldBroken` | `{ playerId, soldierId, amount }` … 溶岩の反応で盾が全部壊れた |
| `castleHealCut` | `{ playerId, ratio, turns }` … 深淵侵食で城の回復量が減る |
| `castleHealCutEnded` | `{ playerId }` … 回復量減少が終わった |
| `castleElementAttached` | `{ playerId, element, turns, source }` … 城に属性が付いた（4陣営・試作。`rules.castleAttach`）。`playerId` は城の持ち主（チーム戦は代表）。`source` は当たった攻撃の `castleDamaged.source`（森の精霊の付着は `{ kind: "passiveSpirit", spirit }`）。同じ属性なら残りは長い方 |
| `castleElementCleared` | `{ playerId, element, reason }` … 城の属性が消えた。`reason` は `"reaction"`（反応で使われた）か `"expired"`（城の持ち主のターンの終わりに残りが0） |
| `castleReactionTriggered` | `{ playerId, reaction, name, elements, damage, consumed, armorBroken? }` … 城で反応が起きた（4陣営・試作）。このあと `castleElementCleared`（`"reaction"`）…→（`healCut` なら `castleHealCut`）→ `castleDamaged`（`source: { kind: "reaction", reaction }`）。`armorBroken` は溶岩が追加で削った城壁 |
| `gameOver` | `{ winner, reason }` … `reason` は `"castleDestroyed"` / `"lastStanding"` / `"roundLimit"` / `"surrender"`（降参）/ `"collapse"`（崩壊の刻のダメージで決着） |

#### イベントの順番

- ターンの始め：`turnStarted` → ドロー → 進軍（`randomAttachTurnStart` のゲームでは、コイン・MP の回復のあと、ドローの前に `elementAttached`（`source: "turnStart"`））
  - ドロー：山札が途中で尽きたら `deckShuffled` → 残りを引く。`cardDrawn` は引いたぶんを1回にまとめて出す。1枚も引かなければ `cardDrawn` は出さない
  - 進軍：兵士は出した順に1体ずつ動く。城に着いた兵士は `soldierMoved` → `castleDamaged` → `soldierDestroyed`（`"reachedCastle"`）の順に出す
  - 城に着いた兵士の `soldierMoved.to` は `laneLength` にそろえる（`laneLength` 以上に進んでも `laneLength`）
  - 兵士同士が戦うとき：`soldierMoved`（止まった位置まで。動かなければ出さない）→ `soldiersClashed` → `soldierDamaged`（守る側）→ `soldierDamaged`（攻める側）→ HPが0以下の兵士の `soldierDestroyed`（`"killed"`）。両方消えるときは**守る側 → 攻める側**の順（`soldierDamaged` と同じ順番）
  - 戦いで相手だけが消えて進み続けるとき（`advanceAfterWin`）：上の戦いのイベントのあと、続きの `soldierMoved`（さっき止まったマスから）→（また相手に会えば）`soldiersClashed` …、城に着けば `castleDamaged` → `soldierDestroyed`（`"reachedCastle"`）。1体の兵士の `soldierMoved` が1回の進軍で2回以上出ることがある
  - 進軍の途中で城HPが0以下になったら、残りの兵士は動かさずにすぐ `gameOver` を出す
- 進軍（STEP 2）：1体ずつ「毒の `soldierDamaged`（`cause: "poison"`）→（0なら `soldierDestroyed` で、動かない）→（凍結なら休んで、0回になったら `statusCleared`）→ 動く」
- 強化を買ったとき：`coinsChanged`（`reason: "upgrade"`）→ `upgradeBought` → 効果のイベント
- 周回の始め（席順の最初の人のターン）：`turnStarted` → `roundStarted` → 放置された魔物の `monsterAttackedCastle`（出た順）→ `monsterAppeared`（道の順）→ 城壁の `armorExpired` → ドロー → 進軍。魔物の攻撃で城HPが0以下になったら、`monsterAttackedCastle` → `gameOver` で止まる（落とされた方の負け）
- 兵士と魔物の戦い：`soldierMoved`（動いたら）→ `monsterClashed` → `monsterDamaged` → `soldierDamaged`（兵士）→（魔物が0なら）`monsterDefeated` → `coinsChanged` →（兵士が0なら）`soldierDestroyed`。1マスごとに相手の兵士 → 魔物の順に確かめる
- ファイアボールで魔物：`cardPlayed` → `spellCast`（`target` は `monsterId`）→ `monsterDamaged` →（0なら）`monsterDefeated` → `coinsChanged`
- ターンの始めに城壁が残っていたら、`turnStarted` のすぐあと（ドローの前）に `armorExpired`
- カードを出したとき：`cardPlayed` のあと
  - 兵士：`soldierDeployed`
  - ファイアボール：`spellCast` → `castleDamaged`
  - サンダー：`spellCast` → 相手の兵士1体ずつ `soldierDamaged` →（HPが0なら）`soldierDestroyed`（`"killed"`）
  - ヒール：`spellCast` → `castleHealed`
  - 毒の霧・氷の息：`spellCast` → 相手の兵士1体ずつ `statusApplied`
  - 武器：`weaponEquipped`／盾：`shieldAdded`／城壁：`castleArmored`
- ターン終了：手札が上限を超えていたら `discardRequired`。捨てたら `cardDiscarded` → 次の人の `turnStarted` …
- 周回の上限（`maxRounds`）に来たら、次の周回の `turnStarted` の代わりに `gameOver`（`reason: "roundLimit"`）
- `lastStanding` で城が落ちたとき：`castleDamaged`（兵士なら `soldierDestroyed`（`"reachedCastle"`）のあと）→ `playerEliminated` → 抜けた人の兵士の `soldierDestroyed`（`"eliminated"`）→ `roadClosed` → その道の兵士の `soldierDestroyed`（`"roadClosed"`）… → `roadOpened` →（残りが1人なら）`gameOver`
- `gameOver` はいちばん最後に1回だけ出る。そのあとの操作はすべて `{ ok: false }`

### データの形

`data/rules.json`

```json
{
  "castleMaxHp": 40,
  "secondPlayerCastleBonus": 1,
  "initialHand": 5,
  "drawPerTurn": 1,
  "firstTurnDraw": 1,
  "drawUntilHand": 5,
  "maxHand": 8,
  "laneLength": 3,
  "laneCount": 3,
  "advanceAfterWin": false,
  "soldierCastleDamageMultiplier": 2,
  "elementBonus": 2,
  "monsterFirstRound": 3,
  "monsterCooldownRounds": 2,
  "monsterSpawnChance": 0.35
}
```

`data/cards.json`（キーがカード種類）

```json
{
  "infantry":  { "name": "歩兵", "kind": "soldier", "hp": 5, "attack": 3, "speed": 2, "count": 10 },
  "knight":    { "name": "騎士", "kind": "soldier", "hp": 4, "attack": 5, "speed": 3, "count": 6 },
  "fireball":  { "name": "ファイアボール", "kind": "spell", "effect": "damageEnemyCastle", "amount": 8, "count": 6 },
  "thunder":   { "name": "サンダー", "kind": "spell", "effect": "damageEnemySoldiers", "amount": 3, "count": 6 },
  "heal":      { "name": "ヒール", "kind": "spell", "effect": "healOwnCastle", "amount": 10, "count": 3, "exhaust": true },
  "flameSword":  { "name": "炎の剣", "kind": "weapon", "attackBonus": 1, "element": "fire", "count": 2 },
  "shield":      { "name": "盾", "kind": "defense", "effect": "shieldSoldier", "amount": 3, "count": 3 },
  "poisonMist":  { "name": "毒の霧", "kind": "spell", "effect": "poisonEnemySoldiers", "amount": 1, "turns": 3, "count": 3 }
}
```

- `laneCount`：同じ2人の間の道（レーン）の本数（1〜5。省略すると1）。兵士は出すときにどのレーンに出すかを選び、**兵士同士が戦うのは同じレーンの上だけ**。**魔物は2人の間に1体だけ**（どのレーンに出るかはランダム）。魔物のいないレーンの兵士は、魔物に止められず城へ進める。魔物を倒したあとの `monsterCooldownRounds` は、2人の間全体にかかる
- カードの `scope`（`damageEnemySoldiers` / `poisonEnemySoldiers` / `freezeEnemySoldiers` の魔法だけ。省略すると `"all"`）：`"all"` は相手の全レーンの兵士に効く。`"lane"` は選んだ1レーンの相手の兵士だけに効く（対象は `{ playerId, roadId }`）。`laneCount` が1のときは `"lane"` でも `"all"` と同じ（対象を選ばない）
- `monsterFirstRound`：魔物が出はじめる周回（省略すると3）。`monsterCooldownRounds`：魔物を倒した道に次の魔物が出ない周回の数（省略すると0）。`monsterSpawnChance`：周回の始めに、魔物がいない道ごとに魔物が出る確率（0〜1の数。省略すると0）
- `elementBonus`：属性が強いときに増えるダメージ（省略すると0）
- カードの `kind`：`soldier` / `spell` / `weapon`（`attackBonus`、`element`）/ `defense`（`effect`: `shieldSoldier` / `armorCastle`、`amount`）。魔法の `effect` に `poisonEnemySoldiers`（`amount`, `turns`）と `freezeEnemySoldiers`（`turns`）が増えた。`element` は `fire` / `water` / `wind` / `earth`
- `secondPlayerCastleBonus`：後攻（p2）の城だけ、HPと上限がこのぶん多い（先攻有利をやわらげるため）。0以上の整数
- `advanceAfterWin`：`true` なら、戦いで相手だけが消えたとき、残りの歩数で進み続ける（`false` ならそのターンはその場で止まる）。省略すると `false`
- `soldierCastleDamageMultiplier`：城に着いた兵士が与えるダメージ ＝ 攻撃力 × この値（1以上の整数）。省略すると 1
- `firstTurnDraw`：先攻の最初のターンに引く枚数（2ターン目以降と後攻は `drawPerTurn`）
- `castleSpellHitsFront`：`true` なら、城への魔法（`damageEnemyCastle`）は選んだレーンの相手の先頭の兵士に当たる（下の「クラシックの戦闘ルール」）。省略すると `false`（今までどおり城に当たる）
- `collapseStartRound` / `collapseAnnounceRound` / `collapseDamage`：崩壊の刻（下の「クラシックの戦闘ルール」）。`collapseStartRound` が 0 か省略なら使わない。`collapseAnnounceRound` は 0 なら予告しない（`collapseStartRound` 以下）。`collapseDamage` は1以上（省略すると1）
- `mpAllCards`：`true` なら、兵士・武器・防御・回復などのカードも、カードの `mpCost`（書かなければ0）だけ MP を使う（下の「クラシックの道具」）。省略すると `false`（今までどおり、攻撃の魔法と精霊だけ）
- `mpPerTurn`：自分のターンの始めに増える MP（0以上の整数。省略すると0）。`secondPlayerMp`：後攻（先攻以外の人）の最初の MP に足す量（0以上の整数。省略すると0。チーム戦では使わない）
- 魔法の `effect` に `singleDamage`（`amount`。敵兵士1体にダメージ）と `weakenAttack`（`amount`・`turns`。呪い：敵兵士1体の攻撃力を下げる）が増えた（下の「クラシックの道具」）
- 魔法の `effect` に `reviveFallen`（`amount`：0より大きく1以下の数。蘇生）と `randomElementDamage`（`amount`。ランダムな属性で敵兵士1体にダメージ）が増えた（下の「クラシックの道具：蘇生・ランダム属性ダメージ」）
- カードの `element` は武器と魔法に書ける（魔法の属性は、`reactions` を渡したゲームで兵士に当たったときの付着・反応だけに使う）。使える属性は `new Game({ elements })` の表のキー（渡さなければ fire / water / wind / earth。下の「クラシックの属性」）
- `exhaust`：`true` のカードは使い切り。使うと使い切り置き場へ行き、山札に戻らない。省略すると `false`。手札の上限で捨てたときは、ふつうに捨て札置き場へ行く（山札に戻る）
- カードの説明文は UI が `kind` / `effect` と数値から組み立てる。カードに `description` を書けば、そちらを優先する（Game は `description` を使わない）

## ゲームのルール（現在：STEP 1）

STEP 1 は、2人が同じ端末で交互に遊ぶ最小版。数値はすべて仮（`data/` で調整する）。

- 城HP：40（上限も40）。後攻（p2）の城は 41 で始まる（上限も41）
- 山札：2人共通。シャッフルして使う。使ったカードと捨てたカードは捨て札置き場へ
  - 兵士カードも、出した時点で捨て札置き場へ行く（場の兵士とは別に扱う）
  - 使い切りのカード（ヒール）は、使ったら使い切り置き場へ行き、二度と山札に戻らない。手札の上限で捨てたときは捨て札置き場へ行く（山札に戻る）
- 山札が尽きたら、捨て札をシャッフルして新しい山札にする。両方とも空なら引かない
- 初期手札：5枚ずつ
- 先攻は p1。先攻の最初のターンも1枚引く
- ターンの流れ
  1. ドロー：1枚引く
  2. 進軍：自分の兵士が出した順に1体ずつ前に進む。相手の兵士とぶつかったら戦う。相手の城に着いた兵士は、攻撃力の2倍（`soldierCastleDamageMultiplier`）のダメージを与えて消える
  3. メイン：カードを1枚出す（出さなくてもよい）
     - 出しても何も起きないカードは出せない（道の上に相手の兵士がいないときのサンダー、城HPが満タンのときのヒール）
  4. ターン終了：手札が8枚を超えていたら、本人が選んで8枚になるまで捨てる
     - 捨てる枚数ちょうどを一度に選ぶ。捨て終わったら、そのまま次の人のターンになる
- 道：城と城の間は**1本の道**で、3マス（`laneLength`）。両方のプレイヤーの兵士が同じ道を向かい合って進む
  - 出した兵士は位置0（自分の城の前のマス）に置かれ、出したターンには動かない。そのマスに相手の兵士がいても出せる
  - 進軍で位置が `laneLength`（3）以上になったら「相手の城に着いた」とする（ぴったりでなくてよい）
  - 例：歩兵は出した次のターンから 2 → 4 で、2回目の進軍で城に着く。騎士は 3 で1回目に着く（どちらも邪魔されなかった場合）
  - 自分の兵士同士は、同じマスに何体いてもよい
- 兵士同士の戦い
  - 進軍は1マスずつ進める。進む前と、1マス進むごとに、**同じマスか1つ先のマス**に相手の兵士がいないか確かめる。いたら、そこで止まって戦う
  - 戦う相手が何体かいるときは、先に出された兵士と戦う
  - 戦い：お互いに攻撃力ぶんのダメージを同時に与える。HPが0以下になった兵士は消える
  - 相手だけが消えても、そのターンはその場で止まる（続きは次の進軍で）。両方とも生き残ったら、次の進軍でもう一度戦う（`advanceAfterWin` を `true` にすると、相手だけが消えたときに残りの歩数で進み続ける。今は `false`）
  - 戦いは進軍している側のターンにだけ起きる
- 真ん中のマス（道のマス番号1）は、STEP 3 で魔物が出る場所。STEP 1 では普通のマスとして通れる
  - STEP 3 の予定：魔物がいる間、兵士は真ん中のマスの手前で止まって魔物を攻撃する。倒すまで先へは進めない
  - `laneLength` を変えるときは、真ん中がひとつに決まるよう奇数にする
- 兵士が受けたダメージは回復しない。HPが0以下になったら消える
- 勝利：相手の城HPを0以下にした瞬間に勝ち。その時点でゲームを止める

### STEP 1 のカード

| 名前 | 種類 | 効果 | 枚数 |
|---|---|---|---|
| 歩兵 | 兵士 | HP5・攻撃3（城には6）・1ターンに2マス進む（遅いけど打たれ強い。サンダーに耐える） | 10 |
| 騎士 | 兵士 | HP4・攻撃5（城には10）・1ターンに3マス進む（速くて強いけど、歩兵より打たれ弱い） | 6 |
| ファイアボール | 魔法 | 相手の城に8ダメージ（すぐ効いて防げないので、枚数は抑える。回復を減らしたぶん、攻めが報われるよう4→6枚） | 6 |
| サンダー | 魔法 | 道の上にいる相手の兵士全員に3ダメージ | 6 |
| ヒール | 魔法 | 自分の城HP+10（上限はその城の上限）。**使い切り**（回復が強すぎて攻めが報われなかったため、6→3枚） | 3 |

### STEP 1 の画面

- スマホの縦画面が基準。PCのブラウザでも崩れないようにする
- 上に相手の城、下に自分の城、その間に道（3マス）が `laneCount` 本（今は3本）横に並ぶ。自分の兵士は上へ、相手の兵士は下へ進む
- 真ん中のマスは、魔物の居場所だと分かるように見た目を少し変えておく（STEP 1 では魔物は出ない）
- 兵士同士がぶつかったら、戦っていることが分かる演出を入れる
- 手札は画面下に並べ、左右にスライドできるようにする
- 兵士の進軍と魔法の命中は、アニメーションで見せる
- 手番が変わるときは画面を隠して「プレイヤー2の番です」と出す（相手に手札が見えないように）。タップしたら表示する
- 相手の手札は枚数だけ表示する
- 捨てる必要があるときは、手札から選ぶ画面を出す
- 山札と捨て札の枚数を表示する

### ひとりで遊ぶ（CPU と対戦）

- タイトルの「ひとりで遊ぶ」から、CPU の強さを3段階で選ぶ。URL に `?local=1&cpu=hard`（`easy` / `normal` / `hard`）でもすぐ始まる
- CPU は `js/game/strategies.js` の戦い方をそのまま使う。Game の公開メソッドだけを使い、自分の手札しか見ない（ずるをしない）

| 強さ | 戦い方 | random（ランダムに出す）に勝つ割合（先攻のとき） |
|---|---|---|
| よわい（`easy`） | `defensive`（守り優先） | 約18% |
| ふつう（`normal`） | `rush`（攻め重視。守らない） | 約21% |
| つよい（`hard`） | `smart`（ほどよく考える） | 約91% |

（コインの強化・精霊・兵士の追加で、以前の「rush が最弱」の順が入れかわったので、割り当てを直した。測定：`node tests/sim/run.js --games 200 --match <戦い方>,random`）

- 先攻・後攻は毎回ランダム（後攻の補正は「コイントス・後攻の補正・マリガン」の節）。「もう1回」は同じ強さで始まる
- 交代の画面は出さない（オンラインと同じく、だれの番かを帯で知らせる）。メニューから降参できる
- 強さの割り当ては `js/ui/config.js` の `UI_CONFIG.cpuLevels`（`js/main.js` の `CPU_LEVELS` が読む）。カードや数値を変えたら、`node tests/sim/run.js --match rush,random` などで弱い順が変わっていないか確かめる

## 完成の目安（STEP 1）

- 2人で最後まで遊べて、勝敗が表示される
- 山札が尽きても止まらない
- 手番交代で相手の手札が見えない
- ブラウザのコンソールにエラーが出ない

## レーン（STEP 2 の続き・仮）

「魔物と戦うか、相手の攻撃を必ず受けるか」しか選べず戦略性が低かったので、城と城の間の道を3本（`rules.laneCount`）にして、**兵士を出すときにどの道に出すかを選べる**ようにした（人間に確認して決めた）。

- 兵士は、出した道だけを進む。**兵士同士は同じ道の上でだけ戦う**。別の道なら、すれちがって城まで進む
- 魔物は2人の間に1体だけで、出る道はランダム。魔物のいない道なら魔物に止められないので、「魔物を倒して稼ぐか」「魔物を避けて城を攻めるか」「相手の兵士を迎え撃つか」を選べる
- 魔法は、カードごとに効く範囲を変える（`scope`）：サンダー・氷の息・猛毒は選んだ1レーンだけ（`"lane"`）、毒の霧・大雷・大氷結は全レーン（`"all"`）。範囲が狭いぶん、カードの数値は今のまま。ファイアボール・ヒールなど城に関する魔法は、レーンを選ばない
- 確かめたこと（`node tests/sim/run.js --games 300`）：smart 同士の平均42手番（レーンなしは48）、p1 勝率50%。smart vs random 72%。CPU の兵士の出し先は `js/game/strategies.js`（相手の兵士が来ている道に迎え撃つ、なければ魔物のいる道）
- 画面：道が横に `laneCount` 本並ぶ。兵士を出すときは、光っている道をタップして選ぶ（`js/ui/Renderer.js` のレーン、`js/ui/Targeting.js`）。レーンを選んだ魔法は、その道だけに雷・霧の演出が出る。魔物の居場所（真ん中のマス）は全レーンに印がつく（どの道に出るかは出るまで分からない）

## STEP 2：カード拡張（武器・防御・属性・状態異常）

トラップ（落とし穴）は、ルールがややこしくなるため**入れない**（レビューで決めた）。

**数値はすべて仮**（`data/cards.json`・`data/rules.json` で調整する）。カードの枚数と数値は、実装のPRでシミュレーションして決める。

### カードの種類（`kind`）と出し方（`slot`）
| `kind` | 出し方（`slot`、`kind` から決まる） | 対象 | 何をするか |
|---|---|---|---|
| `soldier` | メイン（1ターン1枚） | 送り込む相手 `{ playerId }` | 今と同じ |
| `spell` | メイン | `effect` による | 今と同じ＋状態異常の魔法 |
| `weapon`（武器） | 付加（何枚でも） | 道の上の自分の兵士 `{ soldierId }` | 兵士に持たせる。攻撃力が上がり、属性がつく。**1体に1つ**（新しく持たせると前の武器は消える） |
| `defense`（防御） | 防御（何枚でも） | `effect` による | 兵士に盾をつける・城を守る |

- 「メイン」を出したかどうかは `playedThisTurn`。付加・防御は、メインを出す前でも後でも出せる
- 付加・防御も、出しても何も起きないときは出せない（例：道の上に自分の兵士がいないときの武器、同じ武器をもう持っている兵士、全員がもう同じ状態のときの毒の霧・氷の息、今と同じか強い城壁があるときの城壁）

### 属性
- 属性は 火（`fire`）・水（`water`）・風（`wind`）・土（`earth`）の4つ（人間に確認して、木をなくして風・土にした）。**水は火に強い、火は風に強い、風は土に強い、土は水に強い**（4つの輪。火と土・水と風は、どちらも強くも弱くもない。**強弱の組み合わせは仮**）
- 兵士は、属性つきの武器を持つとその属性になる（持っていなければ属性なし）
- 兵士同士の戦いで、自分の属性が相手の属性に強いとき、与えるダメージが `rules.elementBonus`（仮：2）増える。属性なしの相手には増えない
- 理由：武器で強くすると、相手が「強い属性」の武器で返せる。強くするほど狙われるので、出す順番と読み合いが生まれる（大きな見返りには、大きなリスク）

### 状態異常
| 状態 | どうなるか | 終わり方 |
|---|---|---|
| 毒（`poison`） | 持ち主のターンの進軍の前に、`amount` ダメージ。**盾は効かない** | `turns` 回ダメージを受けたら治る（最後の1回で消えた兵士には `statusCleared` は出ない） |
| 凍結（`frozen`） | 次の進軍で動かない（戦いも起こさない）。相手から攻められたら戦う | 進軍を1回休んだら治る |

- 同じ状態がもう一度かかったら、残りの回数を長い方にそろえる（重ねがけで増えない）
- 毒で HP が0になった兵士は消える（`soldierDestroyed` の `reason` は `"killed"`）

### 防御
- 盾（`shieldSoldier`）：兵士に盾を `amount` つける。ダメージは先に盾が受ける。何枚でも重なる
- 城壁（`armorCastle`）：自分の城を `amount` 守る。城へのダメージは先に城壁が受ける。**自分の次のターンの始めに消える**。重ならない（今の城壁より多いときだけ入れかわる）
  - 理由：防御は何枚でも出せるので、重なったり残り続けたりすると、攻撃が通らず決着しなくなる

### ドロー
- **ドロー**：毎ターン `drawPerTurn` 枚が最低。**`rules.drawPerPlayed: true` のときは、前のターンに出した枚数ぶん引く**（人間の指示で、「使った枚数では増やさない」を変えた。仕様の変更の経緯は「カードのレアリティと合成」の節）。先攻の最初のターンは `firstTurnDraw`
  - 付加・防御を出したぶん手札が減るコストは、次のターンの補充で戻る。手札が上限を超えたら、ふつうにターン終了で捨てる

### STEP 2 のカード（仮）
枚数：炎の剣・水の槍・（木の斧→風の弓）各2、盾・城壁・毒の霧・氷の息 各3（山札は32 → 50枚。調整後は、ファイアボール6・ヒール3に変えたので49枚）。

| 名前（type） | 種類 | 効果 | 長所 | 短所 |
|---|---|---|---|---|
| 炎の剣（`flameSword`） | 武器・火 | 攻撃+1、火 | 風の兵士に強い | 水の武器に返される |
| 水の槍（`waterSpear`） | 武器・水 | 攻撃+1、水 | 火の兵士に強い | 土の武器に返される |
| 風の弓（`windBow`） | 武器・風 | 攻撃+1、風 | 土の兵士に強い | 火の武器に返される |
| 土の槌（`earthHammer`） | 武器・土 | 攻撃+1、土 | 水の兵士に強い | 風の武器に返される |
| 盾（`shield`） | 防御 | 兵士に盾3 | 何枚でも重なる。兵士が城まで届きやすくなる | 城は守れない。攻撃力は上がらない |
| 城壁（`wall`） | 防御 | 自分の城を5守る（次の自分のターンまで）。**使い切り** | ファイアボールも兵士も止める | 1ターンで消える。重ならない。1試合に3回まで |
| 毒の霧（`poisonMist`） | 魔法（メイン） | 相手1人の兵士全員に毒（1ダメージ×4回） | サンダー（3）より合計のダメージが大きく（4）、盾が効かない | すぐには効かない。その間に城に着かれることがある |
| 氷の息（`frostBreath`） | 魔法（メイン） | 相手1人の兵士全員を凍結（1回休み） | 城の前まで来た兵士を1ターン止められる | ダメージがない。メインを使う |

### 追加カード（STEP 2 の続き・仮）
既存の `effect` だけで作れるカード10種を足した（ルール・イベントの変更なし）。**数値はすべて仮**。枚数は、下の「攻撃と防御の比率」で調整したあとの値。

| 名前（type） | 種類 | 効果 | 長所 | 短所 |
|---|---|---|---|---|
| 槍兵（`spearman`）×3 | 兵士 | HP3・攻撃4・速さ2 | 歩兵より攻撃が高い | 歩兵より打たれ弱い |
| 重装兵（`heavy`）×2 | 兵士 | HP9・攻撃2・速さ1 | とても打たれ強い | 遅く、攻撃が低い |
| 巨人（`giant`）×2 | 兵士 | HP7・攻撃5・速さ1 | 強くて打たれ強い | 城に着くまで3ターンかかる |
| 隕石（`meteor`）×2 | 魔法・使い切り | 相手の城に14 | ファイアボールの倍近いダメージ | 1試合に1回きり（山札に戻らない） |
| 大雷（`bigThunder`）×2 | 魔法・使い切り | 相手の兵士全員に5 | サンダーで倒せない兵士も倒せる | 使い切り |
| 猛毒（`venom`）×3 | 魔法 | 相手の兵士全員に毒（2ダメージ×2回） | 毒の霧より早く効く | 毒の霧と同じ合計4で、続く期間が短い |
| 大氷結（`deepFreeze`）×3 | 魔法・使い切り | 相手の兵士全員を2回休ませる | 氷の息より長く止められる | 使い切り・ダメージなし |
| 鉄の剣（`ironSword`）×1 | 武器 | 攻撃+2・属性なし | 武器の中でいちばん強い | 属性がないので、属性の強みも弱みも出ない（属性つきの武器を上書きすると属性が消える） |
| 大盾（`bigShield`）×3 | 防御・使い切り | 兵士に盾6 | 盾の倍の厚み | 使い切り |
| 土嚢（`sandbag`）×4 | 防御 | 自分の城を3守る（次の自分のターンまで） | 使い切りでないので何度も使える | 城壁（5）より薄い |

- 確かめたこと（`node tests/sim/run.js --games 300`）：smart 同士の p1 勝率51%・平均48手番、smart vs random は68%（追加前は70%）。全員共通の山札では決着しなくなる試合なし
- デッキ対戦（`data/decks.json`）：3つのデッキに新カードを足した。籠城に新カードを入れすぎると勝率が23%まで落ちたので、`tests/sim/castles.js` で確かめながら直した（バランス49%・突撃52%・籠城51%）
- 見た目は仮の絵（既存の絵の使い回し）。専用の絵ができたら `js/ui/art.js` を差しかえる

### 攻撃と防御の比率（半々）

攻撃と防御の枚数は、全員共通の山札でほぼ半々にする（人間に確認して決めた）。数え方：
- **攻撃側**：兵士・武器・城や兵士を直接ダメージする魔法（ファイアボール・隕石・サンダー・大雷）
- **防御側**：防御カード（盾・大盾・城壁・土嚢）・ヒール・相手の兵士を弱らせる魔法（氷の息・大氷結・毒の霧・猛毒）

| | 枚数 |
|---|---|
| 攻撃側 | 36（歩兵8・騎士4・槍兵3・重装兵2・巨人2・武器4・ファイアボール5・隕石2・サンダー4・大雷2） |
| 防御側 | 35（盾6・大盾3・城壁4・土嚢4・ヒール4・氷の息4・大氷結3・毒の霧4・猛毒3） |

- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均51手番（半々にする前は42）。CPU の強さの順は変わらない（rush 32%・defensive 48%・smart 63%、いずれも random に勝つ割合）
- 防御が増えたぶん試合は少し長くなる。決着しない試合は、周回の上限（`maxRounds`）で必ず終わる
- デッキ対戦（`data/decks.json`）は、バランスが攻撃23・防御17、突撃が攻撃22・防御13、籠城が攻撃21・防御17。デッキは役割の違いを残すため、半々にはしていない（`node tests/sim/castles.js`：バランスに勝つ割合は突撃55%・籠城53%）

## 攻撃を受けたときの防御（STEP 2 の続き）

企画書の「相手の対応：攻撃されたら、防御カードを何枚でも出して受けられる」を入れた（人間に確認して決めた）。`rules.defenseReaction: true` のとき（省略すると `false`）。

- **聞くとき**：兵士が城に着いたとき（城にダメージ）／ファイアボール・隕石が城に当たるとき／サンダー・大雷が兵士に当たるとき。毒・凍結は、防御カードで防げないので聞かない。兵士同士の戦い・魔物の城への攻撃も聞かない
- **出せるカード**：城に当たるなら城壁・土嚢（`armorCastle`）。兵士に当たるなら盾・大盾（`shieldSoldier`。当たる兵士だけ）。ヒールなどは今までどおり自分のターン。自分のターンに前もって盾・城壁を出すのも今までどおりできる
- **手札になければ止まらない**：出せる防御カードが手札になければ、聞かずにそのまま当たる
- **流れ**：攻撃が当たる前に `phase` が `"defend"` になる（`currentPlayer` は攻める人のまま）。受ける人は `defend()` を何枚でも → `passDefense()`（出せるカードがなくなったら自動）。攻める人はそのあいだ何もできない（`playCard` / `endTurn` は `{ ok: false, reason: "相手が防御を選んでいます" }`）。降参はできる。返事が来たら攻撃が当たり、残りの進軍・ターンが続く
- **イベントの順番**：`spellCast`（魔法のとき）→ `defenseRequested` → `cardPlayed`（防御カード）→ `castleArmored` / `shieldAdded` … → `defenseEnded` → `castleDamaged` / `soldierDamaged` …。兵士が城に着くときは、`soldierMoved` → `defenseRequested` → … → `defenseEnded` → `castleDamaged` → `soldierDestroyed`
- **オンライン**：`POST /api/action` の `method` に `defend` / `passDefense` を足した（攻撃を受ける人だけが、自分の番でなくても送れる）。`state` の `playable` は、防御を選ぶあいだ、受ける人には「防御カードを出せるか」を、ほかの人には全部 `ok: false`（「相手が防御を選んでいます」）を返す
- **画面**：受ける人には「防御のチャンス！」の帯を出し、「ターン終了」ボタンが「防御しない」になる。出せる防御カードだけが光る。2人で交代して遊ぶ（ひとつの端末）ときは、手札を見せ合えないので聞かない（`defenseReaction` を切る）
- **CPU**：戦い方に `respond(game, pid, rng, ctx)` を足した。`never`（aggro・rush・pass：防御しない）、`always`（defensive：出せるなら出す）、`smart`（smart・guard：城HPが半分を切りそう・大きなダメージ・兵士がやられそうなときだけ）、`random`（半分の確率）
- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均61手番（防御なしは51）。CPU の強さの順は変わらない（rush 32%・defensive 55%・smart 70%、いずれも random に勝つ割合）。**試合は長くなる**（1試合10分前後の目安に対して長めなので、遊んで確かめる）

### ロジックとUIの約束に足すもの（STEP 2）
- `getState()`
  - 兵士：`weapon`（武器のカード種類か `null`）、`element`（`"fire"` / `"water"` / `"wind"` / `"earth"` / `null`）、`shield`（盾の残り）、`statuses`（`{ poison: { amount, turns } | null, frozen: 回数 | 0 }`）
  - プレイヤー：`armor`（城壁の残り）、`cardsPlayedThisTurn`
- イベント（「Gameが出すイベント」の表に足す）
  - `weaponEquipped`：`{ playerId, soldierId, type, attack, element }`（`attack` は持たせたあとの攻撃力）
  - `shieldAdded`：`{ playerId, soldierId, amount, shield }`（`shield` は足したあとの盾）
  - `castleArmored`：`{ playerId, armor }` / `armorExpired`：`{ playerId }`
  - `statusApplied`：`{ playerId, soldierId, status, turns }` / `statusCleared`：`{ playerId, soldierId, status }`
  - `soldierDamaged` に `cause`（`"fight"` / `"spell"` / `"poison"`）と `blocked`（盾が受けた量）を足す
  - `castleDamaged` に `blocked`（城壁が受けた量）を足す。`amount` は今と同じく「与えようとしたダメージ」、`hp` は城壁で減らしたあとの値
- イベントの順番
  - 進軍：1体ずつ「毒のダメージ →（凍結なら休んで `statusCleared`）→ 動く …」。毒で消えたら、その兵士は動かない
  - 城壁はターンの始め（`turnStarted` のあと、ドローの前）に `armorExpired`

## STEP 3：魔物とコイン

**数値はすべて仮**（`data/monsters.json`・`data/upgrades.json`・`data/rules.json`）。

### 魔物
- 魔物の種類は `data/monsters.json`（キーが魔物の種類）。Game は `new Game({ cards, rules, rng, monsters, upgrades })` で受け取る（ファイルは読まない）。`monsters` を渡さなければ魔物は出ない（STEP 1・2 のまま）
- **周回（`round`）**：席順の最初の人（まだ負けていない人）のターンが始まるたびに1増える（1から）。`getState().round`
- **出現**：`rules.monsterFirstRound`（仮：3）周目から、周回の始めに、魔物がいない道ごとに `rules.monsterSpawnChance`（仮：0.35）の確率で1体出る。種類は `monsters.json` の `weight` の重みでランダム
  - 出る場所は道の真ん中のマス（道のマス番号 `floor(laneLength / 2)`。**道3マス（#18）なら1**）。1本の道に1体まで（2人なら道は1本なので1体まで）
  - 出るとき真ん中のマスに兵士がいても出る（その兵士は次の進軍で、そのマスで魔物と戦う）
- 魔物を倒した道には、`rules.monsterCooldownRounds`（仮：2）周のあいだ次の魔物が出ない（魔物が道をふさぎ続けて、兵士が城に届かなくならないように）
- `monsterSpawnChance` が 0 のときは乱数を使わない（魔物を渡しても渡さなくても、同じシードなら山札の並びは同じ）
- **兵士と魔物**：兵士は進軍で、相手の兵士と同じように「同じマスか1つ先のマス」に魔物がいたら止まって戦う（お互いに攻撃力ぶんを同時に与える。属性も効く）。**倒すまで先へは進めない**
  - 1マスごとに、相手の兵士 → 魔物 の順に確かめる
  - **道3マスでの止まり方**：真ん中（マス1）は、兵士を出すマス（自分の城の前、マス0）の1つ先。なので魔物がいる間、兵士は出したマスから動かず、進軍のたびにその場で魔物と戦う。真ん中より先（相手の城の前のマス）にいる兵士は、魔物に止められずそのまま城へ進む
  - 魔物がいる間は、自分の兵士と相手の兵士は真ん中をはさんで2マス離れているので、ぶつからない（魔物が壁になる）
  - 戦うのは進軍している側のターンだけ。魔物から兵士を攻めることはない
- **魔法**：ファイアボール（`damageEnemyCastle`）は、自分の道（自分が両はしのどちらか）の魔物も対象にできる（`{ monsterId }`）。サンダー・毒・凍結は魔物には効かない
- **とどめボーナス**：魔物のHPを0にした人（兵士の持ち主か、魔法を使った人）が、その魔物の `reward` だけコインをもらう
- **放置すると城を攻める**：魔物は出てから `attackEvery` 周ごとに、周回の始めに、その道の両はしの2人のうちランダムな1人の城に `castleAttack` ダメージ
  - **魔物の攻撃で城HPが0以下になってもよい**（レビューで決めた）。2人のときは、落とされた方の負け（相手の勝ち）。3人以上のときの扱いは STEP 5 で決める。城壁は効かない
  - 城が落ちたら、そこでゲームを止める（残りの魔物の攻撃・魔物の出現・ドロー・進軍はしない）
- 理由（桜井流）：魔物は「倒すとコイン」「放置すると城が削られる」なので、どちらの人にも倒しに行く理由がある。倒すには兵士を道の真ん中で止めることになるので、攻めるか魔物を倒すかで迷いが生まれる

### コインと強化
- コインは魔物のとどめでもらえる。`getState().players.pX.coins`
- 強化の種類は `data/upgrades.json`。自分のメインの場面（`phase` が `"main"`）で、何回でも買える（コインが足りる限り）。メインの1枚とは別
  - `game.canBuyUpgrade(upgradeId)`：買えるか（`{ ok }` / `{ ok: false, reason }`）。読むだけ
  - `game.buyUpgrade(upgradeId)`：買う
- 強化（仮）

| id | 名前 | 値段 | 効果 | 買えないとき |
|---|---|---|---|---|
| `repair` | 修理 | 3 | 自分の城HP+6（上限まで） | 城HPが満タン |
| `recruit` | 補充 | 2 | 1枚引く | 山札も捨て札も空 |
| `sharpen` | とぎ石 | 4 | 道の上の自分の兵士全員の攻撃力+1（ずっと） | 道の上に自分の兵士がいない |

- `upgrades.json` の `limit`：1試合に買える回数（省略すると何回でも）。修理は2回、とぎ石は3回まで（仮）
- 理由：魔物は出続けるので、修理を何回でも買えると回復で決着しなくなるおそれがある。回数に上限をつけた

### 魔物の種類（仮）
| type | 名前 | HP | 攻撃 | 属性 | ごほうび | 放置したとき | 出やすさ |
|---|---|---|---|---|---|---|---|
| `slime` | スライム | 4 | 1 | 水 | 2 | 3周ごとに城へ2 | 5 |
| `goblin` | ゴブリン | 7 | 3 | 風 | 3 | 2周ごとに城へ3 | 3 |
| `dragon` | ドラゴン | 12 | 5 | 火 | 6 | 2周ごとに城へ5 | 1 |

- 強い魔物ほどごほうびが多いが、倒しに行った兵士がやられやすい（大きな見返りには大きなリスク）

### 追加の魔物・強化（STEP 3 の続き・仮）
データだけで足した（ルール・イベントの変更なし）。**数値はすべて仮**。

| type | 名前 | HP | 攻撃 | 属性 | ごほうび | 放置したとき | 出やすさ | 長所・短所 |
|---|---|---|---|---|---|---|---|---|
| `bat` | コウモリ | 3 | 2 | なし | 1 | 2周ごとに城へ1 | 4 | すぐ倒せるが、ごほうびが少ない |
| `skeleton` | スケルトン | 6 | 3 | なし | 3 | 2周ごとに城へ2 | 3 | 属性がないので、属性の武器の強みも弱みも出ない |
| `golem` | ゴーレム | 14 | 2 | 土 | 5 | 4周ごとに城へ3 | 2 | 硬くて倒すのに時間がかかるが、城への攻撃はゆっくり |
| `demon` | デーモン | 10 | 4 | 火 | 5 | 2周ごとに城へ4 | 1 | ごほうびが多いが、倒しに行った兵士がやられやすい |

| id | 名前 | 値段 | 効果 | 回数 |
|---|---|---|---|---|
| `greatRepair` | 大修理 | 6 | 城HP+12 | 1回 |
| `greatRecruit` | 大補充 | 5 | 3枚引く | 2回 |
| `whetstone` | 名匠のとぎ石 | 7 | 兵士全員の攻撃+2 | 1回 |

- 確かめたこと：`node tests/sim/run.js --games 300` で、全組み合わせが300/300決着。smart 同士の平均50.7手番（追加前48）、smart vs random は67%
- 魔物の見た目は仮の絵。専用の絵ができたら `js/ui/art.js` を差しかえる

### ロジックとUIの約束に足すもの（STEP 3）
- `getState()`：`round`、`monsters`（`[{ monsterId, type, roadId, square, hp, maxHp, attack, element, attackIn }]`。`attackIn` は城を攻めるまでの残り周回）、`players.pX.coins`
- 対象：`{ monsterId }`（ファイアボール）
- メソッド：`canBuyUpgrade(upgradeId)`、`buyUpgrade(upgradeId)`
- イベント
  - `roundStarted`：`{ round }` … `turnStarted` のすぐあと
  - `monsterAppeared`：`{ monsterId, type, roadId, square, hp, attack, element }`
  - `monsterAttackedCastle`：`{ monsterId, playerId, amount, hp }` … `playerId` は城の持ち主。`amount` は実際に減った量
  - `monsterClashed`：`{ attacker: { playerId, soldierId }, monsterId, roadId, square }` … 兵士が魔物と戦う（`square` は兵士が止まったマス）
  - `monsterDamaged`：`{ monsterId, amount, hp, by: { playerId, soldierId? , type? } }`
  - `monsterDefeated`：`{ monsterId, playerId, reward }` … `playerId` はとどめを刺した人
  - `coinsChanged`：`{ playerId, delta, coins, reason }` … `reason` は `"reward"` か `"upgrade"`
  - `upgradeBought`：`{ playerId, upgradeId, cost }` → 効果のイベント（`castleHealed` / `cardDrawn` / `soldierBuffed`）
  - `soldierBuffed`：`{ playerId, soldierId, attack }`
- 順番
  - 周回の始め：`turnStarted` → `roundStarted` → 魔物の城への攻撃（出た順）→ `monsterAppeared`（道の順）→（STEP 2 の `armorExpired`）→ ドロー → 進軍。魔物の攻撃で城が落ちたら `monsterAttackedCastle` → `gameOver` で止まる
  - 兵士と魔物の戦い：`soldierMoved` → `monsterClashed` → `monsterDamaged` → `soldierDamaged`（兵士）→（魔物が0なら）`monsterDefeated` → `coinsChanged` →（兵士が0なら）`soldierDestroyed`
  - ファイアボールで魔物：`spellCast`（`target` は `monsterId`）→ `monsterDamaged` →（0なら）`monsterDefeated` → `coinsChanged`

## STEP 4：オンライン対戦

### しくみ
- サーバーは `server/`（Node.js 22.7 以上。**外部パッケージなし**）。Game（`js/game/`）をそのまま動かす。乱数もサーバーだけが持つ
- 起動：リポジトリのルートで `node server/server.js`（ポートは環境変数 `PORT`、省略すると 8787）。`data/` の JSON はサーバーが読み、間違っていれば起動したときにエラーで止まる
- **画面のファイル（`index.html`・`css/`・`js/`・`data/`・`assets/`）も同じサーバーが配る**。`http://localhost:8787` を開けば、画面とサーバーが同じ場所なので、画面はつなぎ先を `/api/...` と書くだけでよい
- 人数は部屋に入った人数（CPU を含めて2〜8）。**自動では始まらず、部屋主が「開始」を押して始める**（下の「部屋（ロビー）」）。`rules.playerCount` はオンラインでは使わない
- 通信は HTTP だけ（WebSocket は使わない。外部パッケージなしで作れて、ブラウザでもそのまま使えるため）
  - ブラウザ → サーバー：`fetch` で `POST`（JSON）
  - サーバー → ブラウザ：Server-Sent Events（`EventSource` で受け取る）
- **合言葉で部屋に入る**：同じ合言葉を入れた人が同じ部屋に入る（最大8人）。入った順に `p1`、`p2` …
- 見えてはいけない情報は、サーバーが `js/game/visibility.js` の決まりでプレイヤーごとに隠してから送る（Game はそのまま）

### 送るもの（ブラウザ → サーバー）
| URL | 送る JSON | 返る JSON |
|---|---|---|
| `POST /api/join` | `{ passphrase, name }` … 合言葉（1〜32文字）と表示名（1〜16文字） | `{ ok: true, roomId, playerId, token }` か `{ ok: false, reason }`。`token` はその人だけの鍵（以後ずっと使う） |
| `POST /api/action` | `{ token, method, args }` … `method` は試合の操作 `playCard` / `discard` / `endTurn` / `buyUpgrade` / `fuse` / `defend` / `passDefense` と、部屋の操作 `start` / `setRules` / `setSeat` / `addCpu` / `removeCpu` / `backToRoom` / `rematch` / `surrender` / `leave` のどれか（部屋の操作は自分の番でなくても送れる。`defend`・`passDefense` は攻撃を受ける人だけが送れる。部屋の操作の中身は下の「部屋（ロビー）」）。`args` は Game のメソッドに渡す引数の配列（例：`["c07", { "playerId": "p2" }]`） | Game のメソッドの返り値（`{ ok }` / `{ ok: false, reason }`）。自分の番でない人の操作は `{ ok: false, reason: "あなたの番ではありません" }` |

- `rematch`：人が全員送ったら（CPU は送らない）、同じ部屋・同じ席・同じ設定で新しい試合が始まる（負けた人もすぐ「もう1回」できるように）

### 届くもの（サーバー → ブラウザ）
`GET /api/stream?token=...` を `EventSource` で開く。メッセージは JSON で、`type` で分かれる。

| `type` | 中身 | いつ |
|---|---|---|
| `room` | `{ roomId, you, hostId, players: [{ playerId, name, connected, left, cpu, castle, deck, faction }], capacity, minPlayers, started, settings, choices, rematchVotes }` … `you` は受け取った人の今の `playerId`（始まる前に誰かが出ると席が詰まって変わる。自分が出たときは `null`）。`hostId` は部屋主。`left` は試合中に自分から部屋を出たか。`cpu` は CPU の強さ（人なら `null`。CPU の `connected` はいつも `true`）。`castle` / `deck` は席の城・デッキ。`faction` は4陣営モードの席の陣営（ほかのモードは `null`）。`settings` は `{ winCondition, deckMode }`。`choices` は選べるもの `{ winConditions, deckModes, castles, decks, factions, cpuLevels }`（`factions` は4陣営モードの部屋だけ中身が入り、ほかは空。`decks` は4陣営では空）（どれも `[{ id, name }]`）。`rematchVotes` は「もう1回」を送った人のIDの配列（新しい試合が始まると空に戻る） | 入ったとき・誰かが入った／抜けたとき・設定が変わったとき・始まったとき |
| `event` | `{ event, payload }` … Game のイベント（「Gameが出すイベント」の表）を、その人向けに隠したもの | 起きた順に |
| `state` | `{ state, playable, upgrades }` … `state` は `getState(自分)`。`playable` は自分の手札の各カードの `{ cardId, ok, reason, needsTarget, targets }`（自分の番でないときは全部 `ok: false`）。`upgrades` は `{ upgradeId: { ok, reason } }` | 操作のたび（その操作のイベントを全部送ったあと）・つないだとき |

- つなぎ直したとき（`EventSource` は自動でつなぎ直す）は、`room` と `state` が届くので、それで画面を描き直す
- 試合の途中でつなぎ直した人は、それまでのイベントを受け取れない（`state` は届く）。画面は `state` から描けるようにする
- `token` は URL に入る（`EventSource` の決まり）。サーバーのアクセスログに残ることがあるので、ログを人に見せない
- 表示名（`name`）は人が入れた文字列そのまま。画面では `textContent` で出す（HTML として入れない）
- エラーの返事：壊れた JSON は 400、大きすぎる本文（16KB 超）は 413、知らない token は 403。どれも `{ ok: false, reason }`
- 手札にないカードを出そうとしたときの理由は、相手の手札にあるかどうかにかかわらず「そのカードは手札にありません」（文の違いから相手の手札が分からないように）
- 始まる前に全員が帰った部屋（30秒だれもつないでいない）は、次に同じ合言葉で入った人のために作り直す。30分だれもつないでいない部屋は消す。部屋は全部で1000まで
- **試合中に相手が抜けたとき**（決めた）
  - 接続が切れただけなら、**自動では決着しない**（待つ時間の上限はない）。残った人には「接続が切れています。戻るのを待っています…」と「やめる」ボタンを出す。「やめる」は部屋を出てタイトルへ戻る（勝ち負けはつかない）
  - ページを読み直した・閉じて開き直した人は、同じタブなら元の部屋につなぎ直す（画面が `token` を `sessionStorage` に覚えておく）
  - **自分から部屋を出る**（`leave`。「タイトルへ戻る」を押したとき）：もう戻れない。残った人には `room` の `players[].left` で伝わり、「○○さんが部屋を出ました」と出る。出た人がいる部屋では「もう1回」はできず、同じ合言葉で入ると新しい部屋になる
  - **降参**（`surrender`。メニューから、確認のため2回押す）：自分の番でなくてもできる。城が2つなら相手の勝ちで終わる（`gameOver` の `reason` は `"surrender"`）。3つ以上なら城が壊れて抜け、残りの試合を見守る（「MP・武器の加算・魔物の成長・降参の観戦」の節）
- 画面は、イベントで演出し、`state` で答え合わせをする（同じ端末のときと同じ）。出せない理由は `playable` を使う（ブラウザに Game はない）

### 部屋（ロビー）（人間に確認して決めた）
「8人がそろわないと始まらない」のではなく、**8人まで入れる部屋で、好きなときに始める**。足りなければ CPU を足せる。

- **部屋主**：最初に入った人。部屋主が出たら、残っている人のうちいちばん前の席の人が部屋主になる（CPU はなれない）
- **始まる前**（`started: false`）
  - `start`：部屋主だけ。CPU を含めて `minPlayers`（2）人以上で始まる。始まったら、その部屋には入れない
  - `setRules`、`args: [{ winCondition?, deckMode?, teams? }]`：部屋主だけ。勝ち方（`"firstDestroy"`：最初に城を落とした人の勝ち／`"lastStanding"`：バトルロイヤル）と山札（`"shared"`：共通の山札／`"own"`：1人1つのデッキ）とチームの分け方（`"off"`：個人戦／`"auto"`：自動で2チーム／`"choose"`：各自で選ぶ。下の「チーム」）
  - `setSeat`、`args: [{ castle?, deck?, faction?, team? }, playerId?]`：席の城の種類・デッキ（`castles.json` / `decks.json` のキー）・**陣営**（`faction`。4陣営モードの部屋だけ。`data.decks` のキー＝`kingdom` / `forest` / `demon` / `dragon`。始まる前だけ。省略すると王国。ほかのモードや、ない陣営は `{ ok: false, reason }`）・チーム（`"t1"`〜`"t4"`。各自で選ぶときに使う）。自分の席は自分で、CPU の席は部屋主が `playerId` を付けて選ぶ。デッキは `deckMode` が `"own"` のときに使われる
  - `addCpu`、`args: [level?]`：部屋主だけ。`level` は `"easy"` / `"normal"`（省略したとき）/ `"hard"`（戦い方は `js/main.js` の `CPU_LEVELS` と同じ：defensive / rush / smart）。名前は「CPU1（つよい）」など。返り値に `playerId`
  - `removeCpu`、`args: [playerId]`：部屋主だけ。CPU を外す（席が詰まる）
  - `leave`：始まる前に出た人は席ごと消え、うしろの席が詰まる（`playerId` が変わるので、画面は `room` の `you` を見る）。人が全員出たら CPU も消える
- **試合中・試合のあと**
  - CPU は、サーバーが `js/game/strategies.js` の戦い方で動かす（自分の手札しか見ない）。1手ごとに少し間をおく（`createGameServer({ cpuDelayMs })`、省略すると 700ミリ秒）。人の番・人の防御になったら止まって待つ。CPU が攻めて人が防御を選ぶあいだも待つ
  - `backToRoom`：試合が終わったあと、部屋主だけ。始まる前の状態に戻る（設定を変えたり、人が入ったりできる）。試合中に出た人の席は、ここで消える（出た人がいても、部屋に戻せばまた遊べる）
- 試合の `rules` は `data/rules.json` に、部屋の人数（`playerCount`）と `settings` を上書きしたもの。城への魔法は `castleSpellRange`（今は `"any"`：誰にでも）のまま
- **チーム**（人間に確認して決めた。ルールは STEP 5 の「チーム戦」）
  - `"auto"`：始めるたびに、席をシャッフルして2チームに半分ずつ分ける（奇数ならチームAが1人少ない）。「もう1回」でも分け直す
  - `"choose"`：各自が `setSeat` でチームを選ぶ（入った順に A・B・A・B … で始まる）。CPU のチームは部屋主が選ぶ。チームは4つまで（A〜D）、1チーム7人まで。2チーム以上に分かれていないと始められない
  - `room` の `players[].team`：始まる前は各自で選んだチーム、試合中・試合のあとはその試合のチーム（個人戦なら `null`）。`choices.teamModes` / `choices.teams`（`[{ id, name }]`。名前は チームA〜D）
- 広場（3人以上）・チーム戦は、STEP 5 のルールのとおり（部屋が `rules.json` と `setup.teams` を渡すだけ）

### 隠す情報（`js/game/visibility.js`）
| イベント | 本人以外に送るとき |
|---|---|
| `cardDrawn` | `cardIds` を消し、`count`（枚数）だけにする |
| `cardDiscarded` | `cardIds` はそのまま（捨てたカードは表向き）。種類は `state` の捨て札には出ない |
| `cardPlayed` | そのまま |

- `getState(自分)` は、相手の手札を `null` にしている（STEP 1 のとおり）
- 山札の順番・乱数は送らない

## STEP 5：拡張（最大8人・デッキ対戦・城の種類・勝利条件）

> **注意（#16 のレビューで決めたこと）**：3人以上のルール（道のつなぎ方・勝ち方・魔物の扱い）は、まだ決めていない。この STEP 5 の「人数」「勝利条件」に書いた**輪（となりどうし）の道と、3人以上の勝ち方は試作**で、STEP 5 で実際に遊んでから「全体の設計」の「3人以上のルールの案」（真ん中に広場・チーム戦）に合わせて作り直す。2人のときの遊び方（城の種類・デッキ対戦を含む）は、ここに書いたとおり。

**数値はすべて仮**。設定はすべて `data/`（`rules.json`・`castles.json`・`decks.json`）で切り替える。

### 人数
- `rules.playerCount`：2〜8（省略すると2）。席順に `p1`〜`p8`。道は「となりの席どうし」（#16）
- 席ごとの城ボーナス：`rules.seatCastleBonus`（席ごとの数の配列、省略できる）。省略すると、2人なら `[0, secondPlayerCastleBonus]`、3人以上なら席 i（0から）に `round(secondPlayerCastleBonus × i ÷ (人数−1))`（後ろの席ほど少し多い）
- 兵士は道でつながった相手（となりの2人）にだけ送れる。ファイアボールなど城への魔法の届く相手は `rules.castleSpellRange`：`"neighbors"`（となりだけ）か `"any"`（誰にでも）。**仮：`"any"`**（シミュレーションで、勝利条件が「最初に落とした人」のとき、4人・8人とも「誰にでも」の方が席ごとの勝率の差が小さく、考える人が勝ちやすく、試合も短かった。「最後の1人」ではほとんど差がない）。サンダー・毒の霧・氷の息は、この設定にかかわらず誰の兵士にでも使える。2人ならどちらも同じ

### 真ん中の広場を通る道（`rules.roadLayout: "plaza"`。人間に確認して決めた）
3人以上のときは、輪（となりどうし）ではなく、真ん中の広場を通ってだれの城へも行ける形にする（`data/rules.json` は `"plaza"`。`"ring"` にすると今までの輪の道）。**2人のときは広場にしない**（今までどおり道が `laneCount` 本）。

```
     城A     城B
       ＼   ／
        広場（魔物）
       ／   ＼
     城D     城C
```

- **道は1本**（`laneCount` は使わず1本。レーンがあると画面がごちゃごちゃになるため）。兵士は「自分の城の前（マス0）→ 広場（真ん中のマス）→ 狙った城の前 → 城」と進む。道3マスなら2人のときと同じ歩数
- 兵士はまだ負けていない相手ならだれにでも送れる（対象 `{ playerId }`）
- **戦う相手**：**自分の方に向かってくる兵士**（相手が自分の城を狙っている）と、**自分が狙っている人の兵士**とだけ戦う。それ以外の人の兵士とは、同じマスにいても戦わずにすれちがう（例：p1→p2 と p3→p2 は戦わない。p1→p2 と p4→p1 は戦う。p1→p2 と p2→p3 は戦う）。「同じマスか1つ先のマス」で確かめるのは今までと同じで、場所は広場と各城の道で比べる。何体かいるときは、先に出された兵士と戦う
- **魔物**：広場に1体だけ（`roadId` は `"plaza"`、`square` は真ん中のマス）。どの城の兵士も、広場の手前で止まって戦う。だれでもファイアボールで狙える。倒したあとの `monsterCooldownRounds` は広場全体にかかる
  - **HP は人数に比例**：出た時点で残っている人数 ÷ 2 倍（四捨五入。2人のときの HP が基準。8人なら4倍）
  - **城への攻撃も人数に合わせる**：攻めるときは、残っている人数の半分（切り上げ）の城をランダムに選んで攻める（2人のときの「2人に1人」と同じ割合。8人なら4つの城）。ダメージは今までと同じで、同じ回に攻める城には同じダメージ
- **通り道**：`getState().roads` には、まだ負けていない2人ずつの組すべての「通り道」が入る（`roadId` は今と同じ `"p1-p3"` の形。広場で重なっている）。兵士の `roadId` は自分と狙った人の通り道。抜けた人がいると、その人への通り道は消える（`roadClosed`。そこを進んでいた兵士も消える）。新しい道はできない（`roadOpened` は出ない）
- 理由：だれの城へも同じ条件で行けるので、席の場所で有利・不利が出にくい。関係ない兵士とは戦わないので、狙われた人が守る形になり、乱戦がわかりやすい

#### ロジックとUIの約束に足すもの（広場）
- `getState().layout`：`"plaza"`（広場）か `"lanes"`（今までの道）
- 兵士の `place`：広場のときだけ、今いる場所。`{ at: "spoke", playerId, square }`（`playerId` の城から広場への道の上。`square` はその城から数えたマス）か `{ at: "plaza" }`。となりの道のときは `null`。画面は兵士をこれで置く
- 魔物の `roadId` が `"plaza"` なら広場にいる
- 確かめたこと（`node tests/sim/multi.js --games 200`）：全試合が決着。最初に落とした人の勝ち：4人は平均45手番、8人は36手番（輪の道は43・43）。バトルロイヤル：4人119手番（周回の上限で終わる21%）、8人206手番（上限で終わる30%）で、**とても長い**。8人のバトルロイヤルで smart 1人が random 7人に勝つ割合は33%（人数ぶんの1＝13%よりは高い）。長さは遊んで確かめる（短くするなら城HP・`maxRounds` を調整する）

### チーム戦（`setup.teams`。人間に確認して決めた）
- **チーム**：`new Game({ ..., setup: { teams: ["t1", "t2", "t1", "t2"] } })`（席ごとのチームID。`"t1"`〜`"t4"`）。**2〜4チーム、1チーム7人まで**（8人なら1対7もできる）。省略するとチーム戦ではない（今までどおり）
- **城はチームで1つ**。城の持ち主は、チームでいちばん前の席の人（**代表**）。盤面（道・広場・兵士を送る先・城への魔法の対象）は代表で考える。城が2つ（2チーム）なら2人のときと同じ道（`laneCount` 本）、3つ以上なら広場（`roadLayout: "plaza"` のとき）
- **城HP** ＝ 代表の城HP ＋ `rules.teamCastleHpShare`（仮：0.25）× ほかのメンバーの城HPの合計。城HPは、その人の `castleMaxHp` ＋ 自分の城の種類の `hpBonus`（席ごとの城ボーナスは使わない）。城の種類のほかの効果（城への魔法・兵士の攻撃・手札の上限）は、メンバーごとに自分が選んだ城のもの
- **城壁も共有**（城に置く）。代表の城に攻撃が来たときの防御（`defenseRequested`）を聞かれるのは代表（ほかのメンバーの手札では防御できない。仮）
- **手番**：`rules.teamTurns`。`"rotate"`（仮・決めた）：チームを順に回し、1回の手番はメンバー1人（2チームなら A1 → B1 → A2 → B2 …。チームの中は順番）。`"all"`：チームの手番でメンバー全員が順に動く。周回は、最初のチームの手番が来るたびに1増える
- **手札・兵士・コイン・精霊は1人ずつ別**。味方には兵士を送れず、城への魔法も撃てない。**味方の兵士とは戦わない**。相手チームのメンバーの兵士とは、1人のときと同じ決まりで戦う（広場なら「自分の陣地に向かってくる・自分が狙っている陣地の兵士」）
- **勝ち方**：城を落とされたチームはメンバー全員が抜ける（`playerEliminated` が1人ずつ）。`firstDestroy` は最初に城を落としたチーム、`lastStanding` は最後まで城が残ったチームの勝ち。`gameOver` に `winnerTeam` が付く（チーム戦のときだけ）
- **城の見た目**（画面）：チームの人数（`teams[t].size`）が多いほど城を豪華にする（UI担当）
- 確かめたこと（`node tests/sim/teams.js --games 200`、全員 smart）：

| 分け方 | 勝ち方 | 平均手番 | 周回の上限で決着 | チームの勝率 |
|---|---|---|---|---|
| 2対2 | 最初に落とした | 86 | 27% | 49%・51% |
| 4対4 | 最初に落とした | 107 | 60% | 48%・53% |
| 3対5 | 最初に落とした | 107 | 56% | 51%・49% |
| 1対7 | 最初に落とした | 95 | 45% | 62%（1人側）・38% |
| 2人×4チーム | 最初に落とした | 66 | 0% | 23〜27% |
| 2人×4チーム | 最後の1チーム | 159 | 56% | 22〜28% |

  - 決め方：案どおり「城HP＝人数ぶん（`teamCastleHpShare: 1`）」だと、1周で動ける回数は1人のときと同じなのに城HPだけ増えるので、4対4の98%が周回の上限で決着した。`"all"`（全員が動く）は同じ人数なら公平だが、1対7・3対5は人数が多い方が100%勝つ。0.25 は人数が違っても勝率が近く、長さもほどほど
  - **周回の上限で決着する試合がまだ多い**（2チームで3〜6割）。遊んで長ければ、チーム戦の城HP・`maxRounds` を調整する

#### ロジックとUIの約束に足すもの（チーム戦）
- `getState().teams`：`{ t1: { members: ["p1", "p3"], castleOwner: "p1", size: 2 }, … }`（チームの順）。チーム戦でなければ `null`
- `getState().winnerTeam`：勝ったチーム（チーム戦でなければ `null`）
- `players.pX.team`（チームID か `null`）・`players.pX.castleOwner`（城の持ち主。チーム戦でなければ本人）。チームのメンバーは同じ `castleHp` / `castleMaxHp` / `armor` を持つ
- 城のイベント（`castleDamaged` / `castleHealed` / `castleArmored` / `armorExpired`）の `playerId` は、代表とは限らない（回復した人・城壁を置いた人のこともある）。画面は `players[playerId].castleOwner` の城に出す
- 兵士の `targetId` は相手の城の持ち主（代表）。広場の `place` の `playerId` も城の持ち主

### 勝利条件（`rules.winCondition`）
| 値 | 勝ち方 | 城が落ちた人 |
|---|---|---|
| `"firstDestroy"`（省略したとき） | **最初にどこかの城を落とした人の勝ち**（2人なら今と同じ） | — |
| `"lastStanding"` | 最後まで城が残った1人の勝ち。**長い**（8人で平均約160手番。抜けた人は終わるまで待つ）ので少人数向け | 負けて抜ける（`playerEliminated`）。その人の兵士は消え、手札は捨て札へ。その人の道はなくなり、両どなりが新しい道でつながる（なくなった道の兵士・魔物も消える） |

- **周回の上限 `rules.maxRounds`**（仮：60。0 なら上限なし。2人の smart 同士で上限まで行くのは、全員共通の山札で約5%、デッキ対戦で1〜11%）：その周回を全員が終えても決着していなければ、城HPの残りの割合（`castleHp ÷ castleMaxHp`）がいちばん多い人の勝ち。同じなら城HPが多い人、それも同じなら席順が後ろの人（先攻有利をやわらげる）。必ず決着させるため
- `gameOver` に `reason` を足す：`"castleDestroyed"`（城を落とした）／`"lastStanding"`（最後の1人）／`"roundLimit"`（周回の上限）

### 城の種類（`data/castles.json`）
- 席ごとに城の種類を選べる：`new Game({ ..., castles, setup: { castles: ["fortress", "tower"] } })`。`setup` を省略すると全員 `rules.defaultCastle`（仮：`"standard"`）
- 城の種類ごとに：`hpBonus`（城HPと上限に足す）、`maxHandBonus`（手札の上限に足す）、`castleSpellBonus`（自分が使う城への魔法のダメージに足す）、`soldierAttackBonus`（自分が出す兵士の攻撃力に足す）。どれも省略すると0

| type | 名前 | 長所 | 短所 |
|---|---|---|---|
| `standard` | ふつうの城 | — | — |
| `fortress` | とりで | 城HP+2 | 手札の上限−2 |
| `tower` | 魔法の塔 | 城への魔法+2 | 城HP−6 |
| `barracks` | 兵舎 | 出す兵士の攻撃+1（城には×2なので+2） | 城HP−12 |

- 道3マス・兵士の城ダメージ×2（#18）に合わせて数値を直した。smart 同士で、ふつうの城に勝つ割合はどれも48〜51%（`node tests/sim/castles.js`。ヒール・ファイアボールの枚数調整のあとに直した）

### デッキ対戦（`rules.deckMode`）
- `"shared"`（省略したとき）：今と同じ、全員共通の山札
- デッキ（仮）：`balanced`（バランス）、`assault`（突撃：歩兵と武器が多い）、`siege`（籠城：盾・城壁・状態異常の魔法が多い）。smart 同士で、バランスに勝つ割合は、突撃49%・籠城49%（籠城は盾5→4枚で直した。カード1枚で10%以上動く敏感なデッキなので、変えたら必ず2000試合で確かめる）
- `"own"`：1人1つずつ山札・捨て札・使い切り置き場を持つ。中身は `data/decks.json` のデッキ（`{ name, cards: { type: 枚数 } }`）。席ごとに選ぶ：`setup: { decks: ["assault", "balanced"] }`。省略すると全員 `rules.defaultDeck`
  - `getState()`：`deckMode`。`"own"` のとき、いちばん上の `deckCount` / `discardCount` / `exhaustedCount` は viewer 本人の数（viewer がいなければ `null`）、`players.pX.deckCount` などにそれぞれの数。`"shared"` のときは `players.pX` の方が `null`
  - `deckShuffled` に `playerId`（`"own"` のとき、だれの山札か。`"shared"` のときは `null`）を足す

### ロジックとUIの約束に足すもの（STEP 5）
- `new Game({ cards, rules, rng, monsters, upgrades, castles, decks, setup })`。`castles` / `decks` / `setup` は省略できる
- `getState()`：`deckMode`、`players.pX.castleType`、`players.pX.maxHand`、`players.pX.deckCount` / `discardCount` / `exhaustedCount`（`"own"` のときだけ数）
- イベント
  - `playerEliminated`：`{ playerId, by }`（`by` は城を落とした人）
  - `roadClosed`：`{ roadId, monsterIds }` → その道の兵士の `soldierDestroyed`（`reason: "roadClosed"`）／`roadOpened`：`{ roadId, players }`
  - `gameOver`：`{ winner, reason }`
- 順番（`"lastStanding"` で城が落ちたとき）：`castleDamaged`（兵士が城に着いたときは、そのあとの `soldierDestroyed`（`"reachedCastle"`））→ `playerEliminated` → 抜けた人の兵士の `soldierDestroyed`（`"eliminated"`）→ `roadClosed` →（その道の兵士の `soldierDestroyed`（`"roadClosed"`））→ `roadOpened` →（残りが1人なら）`gameOver`

### 4陣営モード（ベータ）の入口（画面。人間の指示：ホームの刷新 #192 に合わせて一本化した）
- **入口はホームだけ**：ホームの「通常モード／4陣営モード」で4陣営を選ぶと、ページを `?mode=factions&home=1` で読み直し、4陣営のカード・ルールで動く。そのまま、対戦形式（モード）で選んだ遊び方で遊べる：**ひとりで遊ぶ**（CPU）・**カジュアル対戦**（合言葉の部屋。サーバー #182）・**同じ端末**。4陣営のときはチュートリアルを出さない。ランク・ランキング・フレンド・ミッションは通常モードだけ（押すと理由を出す）
- **陣営**：ホームの「使用する陣営」で選んだ陣営を、ひとりで遊ぶ・同じ端末では自分の席に使う。カジュアル対戦では、部屋に入ったときに自分の席の陣営にする（部屋の「陣営」でいつでも変えられる。「陣営の説明」・陣営のフレーム・属性反応の演出は #191 のまま）
- **前に選んだモードを覚える**（`localStorage` の `cf-home-ruleset`）：URL に `?mode=` がなければ、覚えたモードで開く。ただし
  - `?debug=1`・`?local=1`・`?seed=` があるときは**覚えたモードを使わない**（URL の `?mode=` だけ見る。なければ通常モード）
  - つなぎ直せる部屋が残っているとき（同じタブを読み直した。`sessionStorage` の `cf-online`）は、**その部屋のモード**で開いてつなぎ直す（鍵と一緒に `mode` を覚える。通常モードの部屋を4陣営で開かない。モードを覚えていない前の版の鍵は、URL の `?mode=`、なければ通常として扱う）
- `?beta=factions`（前の入口）は互換のために残し、**`?mode=factions` と同じ**（ホームが4陣営で開く。合言葉の画面に直行はしない）。ホームで通常モードに切り替えると `beta` も URL から消す（`js/ui/HomeRuleSet.js` の `rulesetUrl`）
- `data/modes.json` の `beta: true` のモードは、戦績・経験値・ミッションに記録しない（`Room.finishMatch`）。部屋と対戦では左上に「4陣営（ベータ）」の目印（ホームでは出さない）。使い方・検証結果・既知の不具合・バランス提案は `docs/beta-factions/`。カードの数値は変えていない
- テスト：`ui-tests/home-factions-entry.js`（サーバーを起動して：ホームから4陣営のひとりで遊ぶ・カジュアル対戦・`?debug`／`?local` では通常・通常の部屋は通常でつなぎ直す）、`ui-tests/home-lobby.js`、`ui-tests/faction-beta-cards.js`
- **今はやらない（あとで）**（人間の指示）：Blender 製カード（3D）の作り直し・凹凸の地図の追加などの作り込み、手札のカードの長押し拡大

## ゴッドフィールド風の変更（人間に確認して決めた）

「ゴッドフィールドに似せる」ため、ターン進行とカードを変えた。案の全体は `docs/godfield-proposal.md`。採用したのは A1 と B1〜B5（A2・A3・B6 は採用しない）。**数値はすべて仮。**

- **A1 補充**：`rules.drawUntilHand`（省略すると 0 ＝ 今までどおり）。0 より大きいと、毎ターンのドローは「手札がその枚数になるまで」（`drawPerTurn` は最低枚数）。仮：5
- カード（`data/cards.json`。説明文は `description` に書いてある）

| 名前（type） | 種類 | 効果 | 長所 | 短所 | 枚数 |
|---|---|---|---|---|---|
| 反射（`reflect`） | 防御（`reflectSpell`） | 城に魔法（ファイアボール・隕石）を撃たれたとき、相手の城に返す | 大ダメージを逆手に取れる | 魔法にしか使えない。自分のターンには出せない | 2 |
| 身代わり（`decoy`） | 防御（`nullifySoldier`）・使い切り | 城に着いた兵士1体のダメージを無効にする（兵士は消える） | 城への一撃を確実に止める | 魔法には使えない。使い切り | 2 |
| 天の恵み（`blessing`） | 魔法（`redrawHand`） | 手札を全部捨てて、同じ枚数を引き直す | 手札事故を直せる | 何も攻めない。メインを使う | 2 |
| 神頼み（`prayer`） | 魔法（`randomEffect`） | 山札の上の1枚をタダで出す（対象は出せる中からランダム。出せないカードは捨てるだけ） | 当たれば逆転 | 外れもある。メインを使う | 2 |
| 盗賊（`thief`） | 魔法（`stealCard`）・使い切り | 相手の手札から1枚ランダムに奪う | 切り札を奪える | 相手に手札がないと出せない。使い切り | 2 |

- 反射・身代わりは、`rules.defenseReaction` が `true` のときの「攻撃を受けたとき」にだけ出せる（`defend()`）。出すと防御はそこで終わり、攻撃は反射／無効になる。自分のターンに `canPlayCard` で調べると「攻撃を受けたときにだけ使えます」
- 神頼みでタダで出したカードの `cardPlayed` には `free: true` が付く。盗賊で奪ったカードの ID は `cardStolen` で全員に見えるが、種類は奪った本人にしか見えない
- 確かめたこと（`node tests/sim/run.js --games 300` / `--games 400`）：全組み合わせが決着。smart 同士は平均62手番、CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 16%・defensive 41%・smart 61%）。CPU の `smart`（`guard` も）は新カードを使う：反射・身代わりは城壁より先に出す。ほかに出すものがないとき、相手の手札が3枚以上なら盗賊、自分の手札が4枚以上なら天の恵み、最後に神頼み（先攻のとき random に勝つ割合は smart 78%）
- 画面（人間に確認して、同じ変更で入れた）：新カードの仮の絵（`js/ui/art.js`）、`spellReflected` / `soldierDecoyed` / `cardStolen` の演出と、神頼み（`cardPlayed` の `free: true`）の扱い（`js/ui/Animations.js`）、反射・身代わりの説明（`js/ui/text.js`）。出せるカードを光らせるのは、防御カード全般と同じしくみ（`canDefend`）。専用の絵ができたら `art.js` を差しかえる。UI 担当のレビューを受けること

### 魔法カードの追加（「魔法カード増やして」）
既存の `effect` だけで4種を足した（ルール・イベントの変更なし）。**数値はすべて仮**。

| 名前（type） | 効果 | 長所 | 短所 | 枚数 |
|---|---|---|---|---|
| 小回復（`minorHeal`） | 自分の城HP+5 | 使い切りでないので何度も使える | ヒール（10）の半分 | 2 |
| 毒の雨（`toxicRain`） | 選んだ1レーンの相手の兵士に毒（1×6回） | 毒の霧（4）より合計が大きい（6） | 1レーンだけ。効くのが遅い | 2 |
| 氷河（`glacier`） | 選んだ1レーンの相手の兵士を3回休ませる | 氷の息（1回）より長く止められる | 1レーンだけ・使い切り | 2 |
| 雷光（`bolt`） | 相手の全レーンの兵士に2ダメージ | 使い切りでなく、全レーンに届く | サンダー（3）より弱い | 3 |

- 防御側が増えて試合が長くなったので、城壁・土嚢・毒の霧・氷の息を各4→3枚に減らした（山札は86枚。攻撃側39・防御側47で、「半々」からは防御に寄っている。遊んで確かめる）
- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均64手番（追加前は58〜62）。CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 8%・defensive 38%・smart 75%）。**試合は少し長くなった**ので、遊んで確かめる
- 見た目は仮の絵（`js/ui/art.js`）

### 精霊カード（人間に確認して決めた）
基本4属性（火・水・風・土）それぞれに「精霊」と「大精霊」を作った。**数値はすべて仮**。`kind: "spell"`・`effect: "summonSpirit"`、`spirit` に種類、`amount` と `turns`（続くターン数）を書く（`data/cards.json`）。

- **1人1体まで**（複数枚で強くなりすぎないように、1種類だけ選ぶ形）。新しく呼ぶと、今の精霊と入れ替わる（`spiritEnded` の `reason: "replaced"`）。同じカードの精霊が来ているときは呼べない（「同じ精霊がもう来ています」）
- **呼んだターンは効かない。** 次の自分のターンから `turns` 回効き、自分のターンの終わりに残りが1つ減り、0で消える。`getState().players.pX.spirit` は `{ type, spirit, amount, turns, targetId }` か `null`
- 「ここでの火・水・風・土」は精霊カードだけの属性。**兵士同士の戦いの属性も、火・水・風・土の4つにした**（精霊の風・土とは別の仕組みで、効き方は関係ない）

| 種類 | 精霊（枚数2） | 大精霊（使い切り・枚数1） | 効き方 |
|---|---|---|---|
| 火 | 3ダメージ×3ターン | 5×3 | 自分のターンの始めに、選んだ相手の城にダメージ（城壁は受ける。防御は聞かない） |
| 水 | +2×4ターン | +3×4 | 自分のターンの始めに、自分の城を回復 |
| 風 | 速さ最低2・3ターン | 最低3・3ターン | 自分の兵士の速さが、最低でもその値になる |
| 土 | -1・3ターン | -2・3ターン | 自分の城と兵士が受けるダメージ（城・兵士同士の戦い・魔法・魔物）が軽くなる。ただし最低1（毒は軽くならない） |

- 長所と短所：火・水は少しずつ効くので、すぐには効かず、入れ替えられると無駄になる。風は兵士がいないと意味がない。土はダメージを0にはできない。大精霊は強いが使い切り・1枚だけ
- CPU（`smart` 系）は、精霊が来ていなければ呼ぶ（大精霊は城HPが半分を切ったときだけ）
- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均65手番、CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 7%・defensive 25%・smart 64%）。精霊を足して、random に勝つ割合は下がった（random も精霊を出すため）。**試合の長さと迷う場面は、遊んで確かめる**
- 画面：城のそばに「💧 あと4」のバッジを出す（`js/ui/Renderer.js`）。絵は仮（`js/ui/art.js`）

### 戦いの属性を4つにした（木 → 風・土）
人間の指示で、兵士同士の戦いの属性を 火・水・風・土 の4つにした（木はなくした）。**強弱の組み合わせは仮。**

- 強弱：水→火→風→土→水の輪（矢印の先の属性に強い）。向かい合う属性（火と土・水と風）は、強くも弱くもない
- 武器：木の斧をやめて、風の弓（`windBow`）と土の槌（`earthHammer`）にした（各1枚。武器は炎の剣・水の槍・風の弓・土の槌 各1と鉄の剣1）。魔物は、ゴブリンを風、ゴーレムを土にした
- デッキ（`data/decks.json`）：木の斧を風の弓に置きかえた（土の槌は入れていない）
- 確かめたこと：`node --test` は全部通る。`node tests/sim/run.js --games 400` は全組み合わせが決着し、CPU の強さの順は変わらない。デッキ対戦の勝率は、いったん突撃61%・籠城58%（A1 の5枚補充から）とずれていたが、下の「デッキ対戦の再調整」で直した
- 画面：属性のアイコン・武器の絵・説明文を風・土に直した（`js/ui/look.js`・`art.js`・`text.js`）。絵は仮

### デッキ対戦の再調整（`data/decks.json`）
`node tests/sim/castles.js --games 800`（smart 同士、席を入れかえ）で、バランスに勝つ割合が 突撃59%・籠城66% だったので、データだけ直した（仮）。
- 籠城：防御を減らした（盾5→3、大盾2→0、城壁2→1、凍結系を減らす）。防御を厚くするほど勝率が上がったので、強みを残しつつ減らした。山札は38→30枚
- 突撃：隕石を外し、騎士3→2・歩兵6→7
- 結果：バランス51%・突撃54%・籠城49%（平均手番44〜49）。突撃はまだ目安（49〜52%）よりやや高い。**遊んで確かめる**

## 兵士を4系統×5レアリティにした（人間に確認して決めた）

兵士は **普通の兵士・騎兵・弓兵・魔法使い** の4系統で、それぞれコモン〜レジェンドの5段階（合計20体）。合成は同じ系統の1つ上へ。今までの兵士6種は組み込んだ（歩兵・槍兵・重装兵・巨人・勇者は普通の兵士、騎士は騎兵）。**数値はすべて仮。**

| 系統 | コモン | アンコモン | レア | エピック | レジェンド | 特徴 |
|---|---|---|---|---|---|---|
| 普通の兵士 | 歩兵 5/5/2 | 槍兵 4/7/2 | 重装兵 11/6/2 | 巨人 13/9/2 | 勇者 16/12/3 | 進んで城を攻める。基準 |
| 騎兵 | 斥候騎兵 3/4/4 | 騎兵 4/5/4 | 騎士 5/7/5 | 聖騎士 8/8/5 | 竜騎士 10/10/5 | 速い（1〜2ターンで城）。打たれ弱く、攻撃は少し低い |
| 弓兵 | 見習い弓兵 3/3 | 弓兵 4/5 | 長弓兵 5/7 | 狙撃手 6/9 | 天弓の射手 8/12 | 動かずに撃つ（下） |
| 魔法使い | 見習い魔法使い 3/2 | 魔法使い 3/4 | 魔導士 4/6 | 大魔導士 5/8 | 賢者 7/11 | 動かずに撃つ。撃つ相手がいなければ城を撃つ（下） |

（HP/攻撃/速さ。弓兵・魔法使いは HP/攻撃）

- **道を5マスにした**（`rules.laneLength: 5`。人間の指示）：3マスだと速さ3で1ターンで城に着き、騎兵の「速い」が出せなかったため。真ん中（魔物・広場）はマス2。普通の兵士は速さ2（勇者は3）で、城まで2〜3ターン
- **城HPを70 → 60にした**：道が長くなって試合が延びた（smart 同士 平均71手番・周回の上限で決着17%）ので、前の指示「60手番くらい」に合わせた（60で平均59手番・上限8%。55は54手番、65は67手番）
- **弓兵・魔法使い**（`role: "archer"` / `"mage"`、`range`（撃てる距離）、`stay`（残るターン数）。`speed` は書かない）
  - 出したマス（自分の城の前）から**動かない**。出した次の自分のターンから、進軍のときに撃つ
  - 自分のマスから `range`（2）マス先までの、**戦う相手の兵士**（ほかの兵士がぶつかって戦う相手と同じ決まり）のうち、いちばん近い1体（同じなら先に出された方）を撃つ。**反撃は受けない**。ダメージは攻撃力（属性も効く。盾が先に受ける）
  - 相手の兵士がいなければ、射程の中の**魔物**を撃つ（とどめを刺せばごほうび）
  - **魔法使いだけ**は、兵士も魔物もいなければ、**狙った相手の城**に攻撃力ぶんのダメージ（城壁は受ける。防御は聞かない）
  - **2ターンで帰る**（自分のターンごとに1減る。撃つ相手がいない・凍っているときも減る）。帰るときは `soldierDestroyed`（`"returned"`）
  - **守りにも使える**：道の上にいるので、向かってくる兵士はふつうにぶつかって戦う（そのときは同時に攻撃し合う）
- `getState()` の兵士に `role`（`"melee"` / `"archer"` / `"mage"`）・`range`・`turnsLeft`（弓兵・魔法使いの残りターン。ほかは `null`）を足した
- 排出の重み（`weight`）：コモン1・アンコモン0.75・レア以上0.5（兵士の割合が少し増えた）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均59手番・p1 勝率51%・周回の上限で決着8%。CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 41%・defensive 18%・smart 97%）。3人以上（`multi.js`）・チーム戦（`teams.js`）もほぼ前と同じ
- 画面（UI担当）：新しい兵士14体のカードの絵と盤面の絵、`soldierShot` の演出（矢・魔法弾）、5マスの道、弓兵・魔法使いの残りターンの表示

## カードのレアリティと合成（人間に確認して決めた）

レアリティは コモン（`common`）・アンコモン（`uncommon`）・レア（`rare`）・エピック（`epic`）・レジェンド（`legendary`）の5段階（`data/rarities.json`。キーの並びが低い順）。**数値はすべて仮。**

- **試合の中で合成する**：手札の**同じ種類**のカード2枚 → 1つ上のレアリティの**別のカード**1枚（`game.fuse()`）。使った2枚はゲームから消える（山札・捨て札には戻らない）。メインの1枚には数えず、何回でもできる（手札が減ることがコスト）。レジェンドはこれ以上合成できない
- **カードの書き方**（`data/cards.json`）：`rarity`、`fuseTo`（合成してできるカード種類。1つ上のレアリティのカードだけ。レジェンドは書かない）、`weight`（同じレアリティの中での出やすさ。省略すると1）。レアリティごとに別のカードなので、数値も効果もカードごとに決める（上位互換にしすぎない）
- **系統**（`fuseTo` でつながる5段階。2つの系統が途中で合流してもよい）：兵士（歩兵→重装兵→騎士→巨人→勇者）／城攻め（ファイアボール→業火→隕石→星降り→終末の炎）／対兵士（雷光→サンダー→大雷→雷神の怒り→天罰）／回復（小回復→ヒール→大回復→聖なる光→女神の祝福）／毒・氷・武器・盾・城壁・精霊・特殊（神頼み→天の恵み→盗賊→身代わり→反射）
- **排出率**：`rarities.json` の `dropRate`（%、合計100）が、レアリティごとの出る割合（仮：50 / 28 / 14 / 6 / 2）。カードごとの排出率は、そのレアリティの割合を `weight` で分けたもの（`dropRates()` in `js/game/Setup.js`）
- **山札**：`new Game({ rarities })` を渡すと、全員共通の山札は `rules.deckSize`（仮：100）枚を排出率で引き当てて作る（乱数は `rng`。試合ごとに中身が変わる）。`rarities` を渡さないときは今までどおり `count` 枚ずつ（テストの固定データ用。デッキ対戦 `deckMode: "own"` は `decks.json` のまま）
- CPU：`smart` 系は、ターンの最初に手札の同じカードを合成する
- 城HP：上限を **40**、先攻・後攻とも同じ（`secondPlayerCastleBonus` は 0）にした（人間の指示。いったん100にしたが長すぎたので40に決めた）。`node tests/sim/run.js --games 200 --match smart,smart`：城HP 40 で平均61手番・周回上限で終わる試合は5.5%（100 だと平均110手番・上限で終わるのが60%）。遊んで長ければ下げる
- 画面（UI担当）：レアリティの色・名前の表示と、合成の操作は未実装（`rarities.json` の `color` を使える）。ひとりで遊ぶ・同じ端末のときに `rarities` を渡すのも `js/main.js` 側。オンラインは `POST /api/action` の `method` に `fuse` を足した

### 適応（どのカードとでも合成できるカード。人間に確認して決めた）
- `adapt`（適応。`kind: "spell"`・`effect: "wild"`・**スペシャル**・`weight` 1）。**手札のどのカードとも合成できる**：適応＋カードX → Xを2枚合成したのと同じ結果（Xの `fuseTo`）。使った2枚（適応とX）は消える。Xがレジェンド（合成先なし）なら合成できない。**適応どうしは合成できない**
- **手札から出せない**（合成専用）。`canPlayCard` の理由は「適応は合成に使うカードです（出せません）」。手札の枠を取るのが短所
- `cards.json`：`fuseTo` は書かない（書くと起動時に例外）。`cardsFused` の `from` は、合成の相手になったカード（Xの種類）
- CPU（`smart` 系）：同じ種類の組を先に合成し、残った適応は、合成先のある中でいちばんレアリティの高いカードと合成する
- **スペシャル**（`rarities.json` の `special`。`special: true`）：合成・ラッキーの「1つ上」の並びに入らない別枠のレアリティ。色は虹色（`color` は仮に紫、画面は虹色のグラデーション）。**排出率は今までと同じ**にした（適応は約0.82%。レアを 14 → 13.18、スペシャル 0.82）。スペシャルのカードに `fuseTo` は書けない。魔物のごほうび・ラッキーには出ない
- 画面：虹色のカード（`css/rarity-fx.css` の `.wild`・`data-rarity=special`。枠の絵はレアの枠を色相で回して使う。専用の枠の絵ができたら `cardFrame.js` を直す）と虹色の仮の絵（`js/ui/art.js`）。合成の画面に「適応 ＋ ○○」の組を出す。専用の絵ができたら差しかえる

### 使い切りをなくし、兵士を強くした（人間の指示）
- 全カードの `exhaust` を外した（使ったカードは捨て札に行き、山札に戻る）。回復・城壁が何度も使えて決着しにくくなった（周回上限で終わる試合：約5.5% → 約18.7%）ので、**兵士を強くして攻めが報われるようにした**（`node tests/sim` 相当、smart 同士300試合）
- 兵士（仮）：攻撃 +2（歩兵5・槍兵6・重装兵4・騎士7・巨人7・勇者10）、速さ：歩兵2→3、重装兵1→2、巨人1→2（槍兵・騎士・勇者は変えない）。HP は変えない
- 確かめたこと：smart 同士の平均44手番（強化前63）、周回上限で終わる試合 5.7%、p1 勝率52%。smart vs random は 71%（変わらず）。試して選ばなかった案：攻撃+1だけ（上限で終わる10.7%）、攻撃+2だけ（9.7%）、攻撃+3（4.7%・平均41手番で、攻撃が強すぎる）
- 注意：歩兵の速さが騎士と同じ3になり、歩兵は「1回で城に着く」。歩兵と騎士の差は HP（5 と 4）と攻撃（5 と 7）だけ。**遊んで、歩兵が強すぎないか確かめる**。試合は短くなった（44手番）ので、10分前後の目安に対して短すぎないかも遊んで確かめる

### 城HPを70にした（人間の指示：60手番くらいを目安）
兵士・コイン強化で試合が短くなった（平均31手番）ので、城HP上限を 40 → **70**（先攻・後攻とも同じ）にした。`node tests/sim/run.js --match smart,smart`（smart 同士）：HP50＝平均43手番、60＝52、65＝56、**70＝62（周回上限で終わる10.6%）**、80＝70（13.7%）、100＝84（25.7%）。先攻勝率は49〜53%。上限で終わる試合が1割あるので、長ければ65に下げる

### コインで兵士を強化しまくれるようにした（人間の指示）
終盤は魔物が強くなる想定なので、コインで軍を育てられるようにした（`upgrades.json`。数値はすべて仮）。
- **訓練**（`effect: "trainArmy"`、`amount`）：いる兵士と、**これから出す兵士**の攻撃力が、ずっと +amount（とぎ石は今いる兵士だけだった）。訓練 +1（3コイン・3回まで）・猛特訓 +3（10コイン・1回まで）
- **鍛錬**（`effect: "fortifyArmy"`）：同じく HP が +amount。鍛錬 +1（3コイン・3回まで）・超鍛錬 +3（10コイン・1回まで）
- `getState().players.pX.armyAttack` / `armyHp`（今までに買った合計）。`soldierBuffed` に、鍛錬のときは `hp` も付く。CPU（`smart` 系）は、とぎ石の次に買う
- 回数の上限は、最初10/5/10/5回だったが、3/1/3/1回に減らした（人間の指示）。ただし上限を変えても平均手番はほとんど変わらない（10/5/10/5：29.9、5/2/5/2：30.2、3/1/3/1：30.8、1/1/1/1：33.8）。コインが足りなくて、そもそも上限まで買えないため。長さを変えるには、コストかコインの入手量を動かす
- 確かめたこと（`node tests/sim/run.js --games 400`）：smart 同士は平均31手番・周回上限で終わる試合は0.7%（強化前は42手番）。**試合が短くなりすぎた**。先攻のとき random に勝つ割合：rush 53%・defensive 29%・smart 90%
- 注意：**「終盤にかけて魔物が強くなる」仕様は、まだ実装していない**（今の魔物は周回で変わらない）。実装するなら、先に人間に確認する

### 魔物は放置するとヤバい・倒すとドパが出る（人間の指示：重要視する）
魔物の「放置の怖さ」と「倒したときのごほうびの嬉しさ」を、この遊びの大事な要素とする。カードや数値を変えるときも、この2つが弱まっていないかを確かめる。

- **放置するほど攻撃が重くなる**：`rules.monsterAttackGrowth`（省略すると0。仮：1）。魔物が城を攻めるたびに、ダメージが `castleAttack` から +growth ずつ増える（例：スライム 2 → 3 → 4 …）。早く倒さないと城が削り殺される。`getState().monsters[].castleAttack` は「次に攻めるときのダメージ」（攻めるたびに増える）
- **ごほうびがラッキーでブレる（ガチャ感）**：`rules.rewardLuckyChance`（0〜1、省略すると0。仮：0.15）。魔物のごほうびが、この確率で**1つ上のレアリティ**になる（レジェンドの上はないので、ブレない）。`monsterDefeated` は `rewardRarity`（実際に出たレアリティ）・`baseRarity`（本来のレアリティ）・`lucky`（ラッキーだったか）を持つ。UI はこれで派手に見せる（演出は UI 担当）。確率が0のときは乱数を使わない
- **排出率が見える**：`game.getDropRates()`（読むだけ。`rarities` を渡していなければ `null`）が `{ rarities: [{ id, name, dropRate }], cards: { type: { name, rarity, rate } }, monsters: { type: { name, odds: [{ rarity, rate, lucky }] } } }` を返す。UI が「排出率を見る」画面を作れる。`dropRates()` / `rewardOdds()`（`js/game/Setup.js`）はブラウザからも読める。表で見るなら `node tests/sim/droprates.js`

### 新しい魔物を5種足した（人間の指示。仮）
データだけで足した（ルール・イベントの変更なし）。ごほうびは `rewardRarity`。

| type | 名前 | HP | 攻撃 | 属性 | ごほうび | 放置したとき | 出やすさ | 長所・短所 |
|---|---|---|---|---|---|---|---|---|
| `ghost` | ゴースト | 5 | 3 | なし | アンコモン | 2周ごとに城へ2 | 3 | 柔らかく倒しやすいが、放置するとじわじわ削る |
| `treant` | トレント | 9 | 2 | 土 | アンコモン | 3周ごとに城へ2 | 3 | 硬いがゆっくり |
| `mimic` | ミミック | 8 | 1 | なし | レア | 1/4周ごとに城へ1 | 2 | 弱いのにレアが出る当たり枠。ただし8HPあるので、倒す手間がかかる |
| `vampire` | ヴァンパイア | 11 | 4 | 水 | エピック | 2周ごとに城へ4 | 1 | 大きな見返り・大きなリスク |
| `demonKing` | 魔王 | 20 | 6 | 火 | **レジェンド** | 2周ごとに城へ6 | 1 | HP20・攻撃6で、倒すのが大変。放置すると城が大きく削れる |

- 魔物は全部で12種（コウモリ・スライム・ゴブリン・スケルトン・ゴーレム・デーモン・ドラゴン・上の5種）。魔物の絵はまだない（`js/ui/art.js` の `MONSTER_ART` に足すまで、名前の1文字目の仮の絵が出る。UI担当）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均63手番（周回上限12%）。先攻のとき random に勝つ割合は smart 95%

### 魔物のごほうびをカードにした（人間の指示）
コインの価値が下がったので、魔物を倒したごほうびを**カード**にした。`data/monsters.json` の `reward`（コイン）をやめて、`rewardRarity`（そのレアリティのカードが1枚、とどめを刺した人の手札に入る。同じレアリティの中は `weight` の重み）にした。コインは魔物からは出ない。`reward`（コイン）も書ける（どちらか1つは必須。テスト用・互換のため）。
- 割り当て（仮）：コウモリ・スライム＝コモン／ゴブリン・スケルトン＝アンコモン／ゴーレム・デーモン＝レア／ドラゴン＝エピック（強い魔物ほど高いレアリティ。大きな見返りには大きなリスク）
- イベント：`monsterDefeated` に `rewardRarity`（コインのごほうびなら `null`）を足した → `cardDrawn`（`cardIds` は本人だけ。ほかの人には `count`）。`getState().monsters[].reward`（コインの魔物だけ。ほかは0）と `rewardRarity`
- CPU：ファイアボール系で魔物にとどめを刺すのは、ごほうびがレア以上のカード（または5コイン以上）のときだけ
- 確かめたこと：`node tests/sim/run.js --games 300`：smart 同士は平均42手番・全組み合わせ決着。CPU の強さの順（rush 42%・defensive 29%・smart 86%）は、先に書いたとおり rush > defensive のまま

### コインの入手手段を増やした（人間の指示）
コインが魔物のとどめだけでは少なかったので、次の2つとカードを足した（**数値はすべて仮**）。
- **最初に5枚**（`rules.initialCoins`、省略すると0）／**自分のターンの始めに1枚**（`rules.coinPerTurn`、省略すると0。`turnStarted` の後、ドローの前。`coinsChanged` の `reason` は `"turn"`）
- **コインを増やすカード**（`effect: "gainCoins"`、`amount`。魔法なのでメインを使う）。5段階の系統：小銭袋（コモン+1）→金貨（アンコモン+3）→財宝（レア+8）→金脈（エピック+20）→王の財宝（レジェンド+50）。`coinsChanged` の `reason` は `"card"`。CPU（`smart` 系）は、ほかに出すものがないときに出す
- **コインで買えるもの（強化）を足した**（`upgrades.json`。数値はすべて仮）：
  - 入手券（`effect: "gainCard"`、`rarity`）：買うと、そのレアリティのカードを1枚（`weight` の重みで）手札に加える（`cardDrawn` が出る）。コモン2（5回まで）・アンコモン6（3回）・レア15（2回）・エピック35（1回）・レジェンド80（1回）。`rarities` を渡していないと買えない
  - 超修理：城HP+20、20コイン、1回／大量補充：5枚引く、12コイン、1回
  - CPU（`smart` 系）は、買える入手券のうち高いものを先に買う
- コインのカードの `weight` は、一度 0.5 にして出にくくしたが、人間の指示で元（省略＝1）に戻した
- `coinsChanged.reason` は `"reward"` / `"upgrade"` / `"turn"` / `"card"`
- 確かめたこと：`node tests/sim/run.js --games 300`：smart 同士は平均43手番・周回上限で終わる6.7%・p1 勝率52%（変更前とほぼ同じ）。**CPU の強さの順が変わった**（先攻のとき random に勝つ割合：rush 44%・defensive 30%・smart 89%。以前は rush < defensive < smart）。強い CPU がコインで強化を買うため smart が大きく伸びた。`CPU_LEVELS`（`js/main.js`）の割り当てを見直すか決める必要がある

### コインで排出率を上げる・出した枚数ぶん引く（人間に確認して決めた）
- **運命の祈り**（`upgrades.json` の `luck`、効果 `boostDrops`。仮：コスト3・1試合2回まで）：買うと、自分の**次の `amount` 枚（仮：5）のドロー**が、山札からではなく、`fromRarity`（仮：レア）以上のレアリティの排出率を `boost` 倍（仮：4倍）にして引き当てたカードになる（山札は減らない）。効いているあいだは重ねて買えない。`rarities` を渡していないと買えない。`getState().players.pX.luck` は `{ draws, boost }` か `null`。CPU の smart 系は、とぎ石の次に買う
- **出した枚数ぶん引く**：`rules.drawPerPlayed`（省略すると `false`。仮：`true`）。ターンの始めに引く枚数は `max(drawPerTurn（先攻の最初は firstTurnDraw）, drawUntilHand − 手札, 前のターンに出した枚数)`。合成は「出した」に数えない
- 確かめたこと（`node tests/sim/run.js --games 200`）：全組み合わせが決着。城HP100のときは平均110手番で上限60周に近かった。城HP40にして解消（上の城HPの項）。**運命の祈りの強さは遊んで確かめる**

## MP・武器の加算・魔物の成長・降参の観戦（人間の指示。仮）

**数値はすべて仮**。`data/` のJSONで調べて直す。

- **MP（魔法のコスト）**：`rules.initialMp`（仮：10）・`rules.maxMp`（仮：20。0 なら MP を使わない＝コストなし）。**攻撃の魔法**（`damageEnemyCastle` / `damageEnemySoldiers` / `poisonEnemySoldiers` / `freezeEnemySoldiers`）と**精霊**（`summonSpirit`）を出すと、レアリティのぶん MP を使う（`rarities.json` の `mpCost`：コモン1・アンコモン2・レア3・エピック4・レジェンド5。カードの `mpCost` で個別に変えられる）。足りなければ出せない（`canPlayCard` の理由は「MPが足りません（○必要・あと○）」）。兵士・武器・防御・回復・コイン・神頼みでタダで出すカードは MP を使わない。自然回復はなく、マナ回復のカードだけで増える
- **マナ回復のカード**（`effect: "gainMp"`、`amount`。メインを使わず何枚でも）：魔力のかけら（コモン+1）→魔力のしずく（アンコモン+2）→魔力の水晶（レア+5）→魔力の泉（エピック+10）→世界樹のしずく（レジェンド+20）の5段階の系統（合成でつながる）。上限を超えたぶんは捨てる。MP が満タンなら出せない
- `getState()`：`maxMp`、`mpCosts`（MP を使うカード種類 → 必要な MP）、`players.pX.mp`。イベント `mpChanged`
- CPU：MP が上限の半分以下になったら、ターンの最初にマナ回復のカードを出す（`pass` 以外）
- **武器は重ねられる**：攻撃力は足し算（`weaponBonus` に足す）。属性は上書き（最後に持たせた武器。属性なしの鉄の剣なら属性が消える）。同じ武器も重ねられる。（以前は「1体に1つ」で、持ちかえると攻撃力が下がっていた）
- **開幕のコインは 0**（`rules.initialCoins`）。**速さ**：歩兵2・騎兵3（騎兵は4→3。斥候騎兵は4のまま）
- **排出率の恒久強化**（`upgrades.json` の `permLuck`、効果 `permanentLuck`：`amount`（買うたびに増える%）・`boost`・`fromRarity`。仮：コストは買うたびに 3 → 5 → 8 → 11（`costs`）・4回まで・15%ずつ・レア以上3倍）：買うと、その試合ずっと、ドローのたびに確率 `amount`% × 買った回数で、山札からではなく排出率（レア以上が `boost` 倍）で引き当てる（山札は減らない）。運命の祈り（次の5ドローだけ）とは別に重なる。`getState().players.pX.permLuck` は `{ chance, boost }` か `null`。CPU（`smart` 系）は、運命の祈りより先に買う
- **魔物は後半ほど強く、放置するほど育つ**
  - 後半ほど強い魔物が出やすい：`rules.monsterLateBias`（仮：0.15）。魔物の出やすさ（`weight`）に × (1 + 値 × ごほうびの段階（コモン0〜レジェンド4）× `monsterFirstRound` を過ぎた周回の数)
  - 放置するとレアリティが上がる：`rules.monsterEvolveEvery`（仮：3。0 なら強くならない）周ごとに、魔物の HP・攻撃・城への攻撃が `rules.monsterEvolveMultiplier`（仮：1.2）倍（HP は増えたぶん回復）になり、ごほうびのレアリティが1つ上がる（レジェンドの上はない）。倒したときは、育ったあとのレアリティのごほうびが出る。イベント `monsterEvolved`。`getState().monsters[]` に `evolveCount`
  - 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均55手番・p1 勝率53%、smart vs random は91%（育たないときは93%）。放置の怖さは出た（魔物で決着する試合：random 同士で約4割、smart 同士は約2%）。**強すぎないかは遊んで確かめる**
- **降参（3人以上）**：城が壊れて抜け、残りの試合を見守る（上の `surrender` の表）。画面は観戦中の帯を出し、ターン終了・強化・合成を押せなくする
- 画面：MP の表示（上のバー。自分は「✦10/20」）、手札に必要な MP の札、合成の演出（レアリティが高いほど光・火花・揺れが大きい）、魔物が育つ演出、城が落ちた帯（`js/ui/Animations.js`）。マナ回復カードの絵は仮（`js/ui/art.js` に足すまで「魔」の仮の絵が出る）

## 天候・魔物の駒・チャット・体力ゲージ（人間の指示。仮）

**数値はすべて仮**（`data/weather.json`・`data/rules.json`・`data/cards.json`・`data/stamps.json`）。

### 天候（`new Game({ weather })`。`weather.json` を渡さなければ天候なし）
- 周回の始め（`roundStarted` のすぐあと）に、天候が切り替わる。`rules.weatherFirstRound`（仮：2）周目から。ふつうの天気のときは、`rules.weatherChangeChance`（仮：0.6）の確率で新しい天候になる（`weight` の重みで選ぶ）。天候は `rounds: [最短, 最長]` 周続き、終わったらふつうの天気に戻る。`weatherChangeChance` が 0 なら乱数を使わず天候は出ない
- **天候の呪文**（`weatherCall`・`effect: "changeWeather"`・スペシャル・メインを使う）：今と違う天候にランダムに変える（`weatherChanged` の `cause` は `"card"`）。出る割合はスペシャルの中で適応と 2:1（適応の排出率は約0.82% → 約0.55%）。`weather` を渡していないと出せない。ほかに変えられる天候がないとき（定義が今の天候1つだけ）も出せない。呪文で `weatherFirstRound` より前に始めた天候も、周回ごとに減って終わる
- 天候の効果（`weather.json` のキー）

| 天候 | キー | 効果 |
|---|---|---|
| 晴れ `sunny` | `elementBonus: { fire: 2 }` | 火属性の兵士・魔物・火の精霊のダメージ +2（魔法使いが城を撃つときも） |
| 雨 `rain` | `elementBonus: { water: 2 }` | 水属性のダメージ +2・水の精霊の回復 +2 |
| 大雨 `heavyRain` | 雨 ＋ `lightning: 5` | 周回の始めに雷が落ち、ランダムな1つの城に5ダメージ（城壁は受ける） |
| 霧 `fog` | `missChance: 0.3` | 兵士の戦い・射撃（弓兵・魔法使い）・攻撃魔法（城・兵士・魔物へ）が30%で外れる（ダメージ0） |
| 嵐 `storm` | `stopMarch: true` | 進む兵士（`melee`）が動かない。弓兵・魔法使いは撃てる |
| 砂嵐 `sandstorm` | `sandDamage: 1` | 周回の始めに、全員の城（城壁は無視）と兵士に1ダメージ。**城は砂嵐では落ちない**（HP1で止まる。全員の城が同時に落ちて勝者がいなくなるのを防ぐ。人間の指示）。兵士は倒れる |
| コインの雨 `coinRain` | `coinPerTurn: 2` | 自分のターンの始めに2コイン（`coinsChanged` の `reason` は `"weather"`） |

- `getState().weather`：`{ type, name, icon, description, roundsLeft }`（ふつうの天気なら `null`）。`weatherEnabled`：天候を使うルールか
- イベント：`weatherChanged`（`{ weather, previous, rounds, cause: "natural" | "card", playerId, name, icon, description, previousName }`。`weather` が `null` なら天候が終わった）／`weatherLightning`（`{ playerId, amount }`。このあと `castleDamaged`（`source: { kind: "weather", weather }`））／`attackMissed`（`{ playerId, kind: "fight" | "shot" | "spell", soldierId? / monsterId? / type? }`。外した側。魔物が外したときは `playerId: null` と `monsterId`）
- 砂嵐の城ダメージは `castleDamaged`（`amount` は実際に減った量。HP1の城には出ない。`blocked: 0`・`source: { kind: "weather" }`）、兵士は `soldierDamaged`（`cause: "weather"`）
- 順番（周回の始め）：`turnStarted` → `roundStarted` → `weatherChanged` → 雷・砂嵐 → 魔物の城への攻撃 → …。天候で城が落ちたら、そこで `gameOver`
- 画面：上のバッジ（天候名・あと何周）、背景の効果、変わった瞬間の**警報**（サイレン・赤いふち・帯。良い天候は金・雨は青。`js/ui/config.js` の `weatherTone`）。タップで飛ばせる
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士の平均43手番・p1 勝率50%（天候なしと同じ）

### 倒した魔物は駒になる
- （のちに変更：魔物のカードの多くは効果のカードにした。下の「魔物のカードを「効果」にする」。駒のままなのはゴブリン・スケルトン（弓兵）・ゴーレム（護衛））
- 魔物のとどめを刺した人の手札に、その魔物の**兵士カード**（`cards.json` の `beast_<魔物の種類>`、`monster: "<種類>"`）が1枚入る（ごほうびのカードとは別。`monsterDefeated` に `pieceType`、このあと `cardDrawn`）。兵士カードと同じように、兵士の枠で出せる
- 魔物の駒は HP・攻撃が魔物と同じ（`monsters.json` の値）、速さは1〜2。合成できない（`fuseTo` なし）。山札・ごほうび・入手券では出ない（`weight: 0`）。**出しても捨てても使い切り置き場へ行き、山札に戻らない**（シャッフルで山札に混ざらないように）。魔物は放置で強くなる（`monsterEvolve*`）が、駒は元の強さ
- 絵は魔物の絵を使う（`js/ui/art.js`）

### 画面の揺れ・体力ゲージ
- **画面の揺れ**：兵士・魔物がダメージを受けたとき、魔法を使ったとき、天候が変わったときに、盤面ぜんたいが揺れる（強いほど大きく。`UI_CONFIG.screenShake`）。城に当たったときの揺れは今までどおり。設定で動きを減らしているときは揺れない
- **兵士の体力ゲージ**：兵士の頭の上に細い帯。残りHP ÷ 上限で、緑 → 黄 → 赤。減った分は白い影が遅れて追いかける。`getState()` の兵士に `maxHp`（鍛錬で増える）を足した

### チャットとスタンプ
- 使える場所：**オンライン対戦**（文字とスタンプ）と、**ひとりで遊ぶ**（文字とスタンプ。CPU はスタンプで返す。文字には、ことばに合うスタンプを選んで返す（`js/main.js` の `CPU_TEXT_REPLY`）。ずるはしない）。2人で交代して遊ぶときは出ない（人間の指示で、ひとりで遊ぶにも文字を足した）
- スタンプは `data/stamps.json`（`{ id, icon, label }` の配列）。画面とサーバーが同じ一覧を読む
- `POST /api/action` の `method` に `chat`（`args: [{ text }]` か `[{ stamp }]`）。文字は制御文字を空白にして前後を取り、1〜40文字。つづけて送れるのは0.6秒ごと。CPU の席・形の違う送り方は `{ ok: false, reason }`。試合の前・中・あとのいつでも送れる
- 届くもの：`{ type: "chat", id, playerId, name, text | stamp, at }`。つないだとき（つなぎ直したときも）、直近30通が `{ type: "chatLog", messages }` で届く（つなぎ直すたびに全部届くので、画面は受けたら表示を作り直す）。もう部屋にいない人の発言は `playerId: null`・`left: true`（名前は残る）。文字は人が入れたものなので、画面は `textContent` で出す

## デッキ編成（コスト制。`rules.deckMode: "cost"`。人間の指示。仮）

今までの山札（`"shared"`：全員共通／`"own"`：`decks.json` の見本から選ぶ）は残し、**別モード**として足した。1人1つの山札を、コストの決まりに合うように編成する。

- **コスト**（`rarities.json` の `deckCost`）：コモン1・アンコモン2・レア3・エピック4・レジェンド5。**スペシャルはレアと同じ扱い**（`deckAs: "rare"`。コスト3・同じカードの上限・レアの合計枚数に数える）
- **決まり**（`checkCostDeck()` in `js/game/Setup.js`。画面もサーバーも同じものを使う）
  - 合計コストは **90 以上 100 以下**（`rules.deckCostMin` / `deckCostMax`。少なくていいと、レジェンドだけの少ない枚数で山札がすぐ尽きて回せるので、下限をつけた）
  - 同じカードは、コモン・アンコモンが10枚まで、レア以上は3枚まで（`maxCopies`）
  - レアリティごとの合計枚数：コモン・アンコモンは無制限、レア20・エピック10・レジェンド5まで（`deckLimit`。`null` は無制限）
  - 魔物の駒（`beast_*`）は入れられない。天候の呪文・適応はスペシャルなのでレアの枠で入れられる
- **山札が尽きたら、捨て札を混ぜて山札に戻す**（今までと同じ）。1人1つの山札・捨て札・使い切り置き場を持つ（`own` と同じ。`getState()` の `deckMode` は `"cost"`）
- **Game**：`new Game({ rarities, decks, setup: { deckLists, decks } })`。席ごとに、`setup.deckLists[席]`（`{ カード種類: 枚数 }`。決まりに合わなければ `new Game()` が例外）か、なければ `setup.decks[席]`／`rules.defaultCostDeck`（`decks.json` の `costDeck: true` の見本）。`rarities` が必須。`players.pX.deckId` は見本のID か `"custom"`
- **見本のデッキ**（`decks.json` の `costDeck: true`）：`costBalance`（バランス・コスト92）・`costAssault`（突撃・91）・`costFortress`（籠城・96）。`own` の見本の一覧には出ない。確かめたこと（`node tests/sim/costdecks.js`、smart 同士）：勝率 45〜52%・全部決着
- **オンライン**：部屋の `setRules` の `deckMode` に `"cost"`。`setSeat` に `{ costDeck: 見本のID }` か `{ deckList: { 種類: 枚数 } }`（`null` で見本に戻す。決まりに合わなければ `{ ok: false, reason }`）。`room` の `players[].costDeck`（見本のID か `"custom"`）、`choices.costDecks`。ほかの人のマイデッキは選べない（自分の席だけ）
- **画面**：タイトルの「デッキ編成」（コストのメーター・レアリティごとの枚数・足せない理由を出す。決まりに合うときだけ保存できる）。マイデッキはこの端末に保存（`js/ui/DeckStore.js`）。「ひとりで遊ぶ／同じ端末」の詳細設定と、オンラインの部屋で「マイデッキ」を選べる

## 永続の毒と解毒薬／山札の既定を各自のデッキにした（人間の指示。仮）

- **毒（永続）**：毒の5枚（毒の霧1・猛毒2・毒の雨3・死の霧4・疫病5。レアリティごとの毎ターンのダメージ）は `effect: "poisonEnemy"`（`amount`）。**選んだ相手（陣地）の兵士全員と城**を、**永続の毒状態**にする。毒の兵士は持ち主のターンの進軍の前に、毒の城は持ち主のターンの始め（`armorExpired` のあと、コインの前）に、毎回 `amount` ダメージ。**盾・城壁・土の精霊は効かない**（毒で城が落ちたら、そこで決着）。**重ねがけは足し算**（毒の量が増える。上限なし。城も兵士も。人間の指示で「上書き」から変えた）。相手がいればいつでも出せる。範囲は全レーン（`scope` なし）。MP を使う（攻撃の魔法）。兵士の毒は `turns: null`（永続）。ターン数つきの `poisonEnemySoldiers` は、テスト用に残してある（`cards.json` では使わない）
- **解毒薬**（`antidote`・`effect: "curePoison"`・スペシャル・`weight` 1）：**自分の毒状態（兵士も城も）をすべて治す**。毒にかかっていないと出せない（「毒にかかっているものがありません」）。メインを使わず何枚でも出せる（`slot: "support"`）。MP は使わない。CPU（`smart` 系）は、毒にかかっていれば先に使い、毒カードは強いものから出す
- `getState().players.pX.castlePoison`（城の毒の量か `null`。チーム戦では城を共有）、兵士の `statuses.poison` は `{ amount, turns: null }`（永続）。イベント：`castlePoisoned`（`{ playerId, amount }`）・`castleCured`（`{ playerId }`）。`statusApplied` に `amount` が付き、永続の毒は `turns: null`。毒の城のダメージは `castleDamaged`（`source: { kind: "poison" }`、`blocked: 0`）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均28手番（上書きのときは33、毒を直接ダメージにしていたときは41）で、**かなり短くなった**。smart vs random は84%。数値は遊んで確かめる（試合が短すぎれば、毒の量を 1・1・2・3・5 などに弱める）
- 画面：城のそばに「毒 N」のバッジ、城が緑がかる。解毒薬の絵は仮の絵（`js/ui/art.js`）
- **カードの長押し拡大**（人間の指示）：デッキ編成・図鑑で、カード（`data-zoom` 属性つき）を約0.4秒長押しすると、カードを大きく出す（`js/ui/CardZoom.js`・`css/card-zoom.css`）。なぞる・端末を傾けると、カードが傾いて偏光（`Hologram.js` の光）が動く。外をタップ・Esc・×で閉じる。長押しのあとに指を離しても、カードの追加・詳細は開かない。動きを減らす設定のときは傾けない
- **画面の大きさへの合わせ方**（人間の指示：実機の大きさに合わせて確かめることを怠らない）：`css/fit.css`（最後に読む）に、高さ・向きごとの調整を書く。画面を変えたら、`390x797`（ホーム画面アプリ）・`375x667`・`360x640`・`390x664`（ブラウザの帯あり）・`320x568`・横向き `844x390` で、**上が切れない・スクロールなしで収まる**ことを確かめる
- **デッキ名**：保存済みのデッキは、名前を変えた時点ですぐ保存する（カードの変更は保存ボタンまで保存しない）
- **山札の既定は「プレイヤーごと別（コスト制）」**：ひとりで遊ぶ（設定を選ばずに始めたときも）・同じ端末・オンラインの部屋で、最初から1人1つの山札。編成したマイデッキが決まりに合っていれば自分の席で使い、CPU は見本のデッキ。「みんな共通」は設定で選べる。`data/rules.json` の `deckMode` は変えていない（シミュレーションの基準を変えないため）

## 忍者（`role: "ninja"`。日本バージョンのために足した。人間に確認して決めた）

日本バージョン（タイトルで切り替える。カードは全部日本専用に作り直し、西洋版とは混ぜない）の忍者のための役割。**相手から見えず、敵の兵士をすり抜ける**（人間の指示）。ロジックだけ先に入れた（`data/cards.json`（西洋版）には忍者はいない）。

- 書き方：`cards.json` の兵士に `role: "ninja"`。`hp`・`attack`・`speed` を書く（進む兵士。`range`・`stay` は書かない）
- **すり抜け**：忍者は相手の兵士と戦わない。相手の兵士も忍者を止めず、弓兵・魔法使いも撃たない（`foesOf` が忍者を数えない）。**魔物には止められる**（倒すまで進めない）。城に着けば、ふつうの兵士と同じく攻撃力 × `soldierCastleDamageMultiplier` のダメージ（防御も聞く）
- **見えない**：`getState(viewerId)` は、ほかの陣地の忍者を `soldiers` に入れない（`viewerId` が `null` のときも入れない）。味方（チーム戦の同じ陣地）には見える
- **妖術（魔法）の的にならない**：兵士を狙う魔法・毒（`damageEnemySoldiers` / `poisonEnemySoldiers` / `freezeEnemySoldiers` / `poisonEnemy`）は忍者に当たらず、対象の数え方（「相手の兵士がいません」）にも入れない（いるかどうかが分からないように）。`Player.visibleSoldiers` が忍者を除いた兵士。天候（砂嵐）は当たる
- **イベント**：忍者に関わるイベント（`soldierDeployed` / `soldierMoved` / `soldierDamaged` / `soldierDestroyed` / `statusApplied` / `statusCleared` / `weaponEquipped` / `shieldAdded` / `soldierBuffed` / `monsterClashed`）には、持ち主の陣地 `stealth`（例：`"p1"`）が付く。`filterEventFor(type, payload, viewerId, viewerSide)`（`js/game/visibility.js`）は、`stealth` がその人の陣地でなければ `null`（送らない）を返す。サーバーは `null` のイベントを送らない。**城・魔物へのダメージ（`castleDamaged` / `monsterDamaged`）と、カードを出したこと（`cardPlayed`）は見える**（「忍者を出した」ことは分かるが、どこにいるかは分からない）
- 画面（ひとりで遊ぶ・同じ端末）は、オンラインと同じく、見ている人の陣地で `stealth` のイベントを飛ばす（UI担当。日本バージョンの画面のPRで入れる）
- 確かめたこと：`tests/ninja.test.js`（見えない・すり抜け・弓兵に撃たれない・魔法の的にならない・魔物には止められる・イベントを隠す）。西洋版のシミュレーションは変わらない（忍者がいないため）

## バランス調整：ファイアボール弱体化・城壁の永続・毒の期限・コインの制限（人間の指示。仮）

攻撃（城への魔法）が防御・ほかの攻撃より強すぎ、毒も強すぎたので調整した。数値はすべて仮（`data/`）。いずれも、`rules.json` に書かなければ従来どおり（テストの固定データ用）。

- **城への魔法を弱くした**（`cards.json`）：ファイアボール 8→5・業火 11→9・隕石 14→14（変えない）・星降り 22→19・終末の炎 36→25（人間の指示で数値を直した）
- **城壁は永続で、上限40**（`rules.armorMax`、仮：40）：次の自分のターンで消えなくなった。置くと**足し算**で、上限まで積める（上限に達していたら出せない）。ダメージは先に城壁が受ける（毒は無視）。0 または省略なら従来どおり（重ならず、次のターンの始めに消える）。`armorExpired` は `armorMax` があると出ない
- **毒は5ターンで治り、量は10まで**（`rules.poisonTurns`、仮：5／`rules.poisonMax`、仮：10）：兵士は進軍のたび、城は持ち主のターンの始めに、ダメージを受けるごとに残りが1減って 0 で治る。重ねがけは足し算（上限 `poisonMax`）で、残りターンは5に戻る。城の毒が期限で治るときは `castleCured`、兵士は `statusCleared`。`getState().players.pX.castlePoisonTurns`（城の毒の残り。永続なら `null`）。0 または省略なら従来どおり（永続・上限なし）
- **部屋の画面からもチャットできる／チャットの見た目**（人間の指示）：部屋の「💬 チャット」ボタンで同じチャットを開く（未読の数つき）。届いた発言は画面に、**枠なし**で、左にアイコン・右に色つきの名前（席ごとの色）と小さいランクのアイコン・その下にランク名、さらにその下に文字かスタンプを出し、画面の真ん中あたり（高さの4割）から、ゆらゆら揺れながら、数秒とどまって上へ登って消える。未読の数は、ボタンの右上のすみの丸い円の中に出す（`js/ui/ChatView.js`・`css/chat.css`）。サーバーは、アカウントのある人の発言に `profile`（`{ icon, iconImage, rank: { tierIndex, division, color, name, divisionLabel } | null }`。ゲスト・合言葉だけの人は付かない）を添える（`createGameServer` が `profileOf` を渡す）。アイコンがなければ名前の頭文字
- **カジュアル対戦の部屋：ルールは部屋主の席の「ルールを変更」画面で変える。部屋主は譲れる**（人間の指示）：部屋の下の「対戦ルール」は、部屋主も含めて見るだけ。部屋主は （`args: [playerId]`。部屋にいる人だけ。CPU・自分・ランク戦は不可）で部屋主を譲れる。CPU の追加は席の下に残した
- **カジュアル対戦の部屋：ルールは部屋主の席の「ルールを変更」画面で変える。部屋主は譲れる**（人間の指示）：部屋の下の「対戦ルール」は、部屋主も含めて見るだけ。部屋主は `transferHost`（`args: [playerId]`。部屋にいる人だけ。CPU・自分・ランク戦は不可）で部屋主を譲れる。CPU の追加は席の下に残した
- **カジュアル対戦（合言葉の部屋）で城のHPを入力できる**（人間の指示）：部屋主が `setRules` の `castleHp`（10〜200の整数。選ぶのではなく自分で入力）で決める。試合の `rules.castleMaxHp` を上書きする（初期値は `rules.json` のまま）。`room.settings.castleHp` は数、`choices.castleHpRange`（`{ min, max }`）。ランクマッチは変えられない。画面は部屋の「対戦ルール」に数の入力欄を足した（`js/ui/RoomView.js`）
- **コインのカードは1ターン1枚まで**（`rules.coinCardsPerTurn`、仮：1）：`gainCoins` が対象。出せないときの理由は「コインのカードは1ターンに1枚までです」。0 または省略なら無制限
- **王の財宝（レジェンドのコイン）はデッキ編成で1枚まで**：`cards.json` のカードに `maxCopies`（1以上の整数）を書くと、レアリティの `maxCopies` より厳しい上限になる（`checkCostDeck`）
- 画面：`js/ui/text.js` の城壁・毒の説明文を `armorMax` / `poisonTurns` / `poisonMax` に合わせた。城の毒の残りターンのバッジ表示は未対応
- 確かめたこと：`node --test` は全部通る。`node tests/sim/run.js --games 300`：全組み合わせが決着。smart 同士は平均38.7手番・p1 勝率49%、smart vs random 85%

## 吸収・捨て身・爆発のカード（仕様書4章。レア・合成しない。人間に確認して決めた。数値は仮）

仕様書（`docs/system-spec-4-8.md`）の4章から、カード4枚を足した。**SP は今の MP と同じもの**（呼び名は MP のまま）。最初は各5段階（20枚）で作ったが、「カードを増やしすぎ」なので1枚ずつにまとめた。いったんスペシャルにしたが「スペシャルにしては弱い」ので**レア・合成しない（`fuseTo: null`）**にした（人間の指示）。数値はレアの段の値。シミュレーションでの調整はしない（人間の指示）。

| カード（`effect`） | 効果 | MP | 長所／短所 |
|---|---|---|---|
| 魔力強奪 `manaRaid`（`drainMp`） | 相手の MP を4奪って自分の MP にする（自分の上限を超えたぶんは捨てる） | 使わない | MP 回復のカードがなくても魔法を撃てる／相手の MP が0なら出せない（「相手のMPがありません」） |
| 命の簒奪 `lifeSteal`（`drainCastle`） | 相手の城に8ダメージ。城HPを実際に減らしたぶん、自分の城を回復（城壁が受けたぶんは回復しない） | 3 | 攻めと回復を一度に／魔物は狙えない |
| 決死の砲撃 `desperateShot`（`sacrificeAttack`、`selfDamage`） | 自分の城HPを6払って、相手の城に20ダメージ | 3 | 大きな威力／自分の城が削れる。城HPが `selfDamage` 以下なら出せない（「城のHPが足りません（○より多く必要です）」） |
| 火薬庫 `powderKeg`（`damageAllSoldiers`） | 場にいる兵士全員（**自分の兵士も**、全レーン）に8ダメージ | 3 | まとめて倒せる／味方も巻き込む。場に兵士がいなければ出せない |

- **`fuseTo: null`**（`cards.json`）：合成しないカード（同じカード2枚でも、適応とでも合成できない。理由は「このカードは合成できません」）。書き忘れ（`fuseTo` なし）は今までどおり起動時に例外。MP はレアのコスト（3）。排出率はレアの枠（13.18%）の中で `weight` 1
- どれもメイン（1ターン1枚）。命の簒奪・決死の砲撃は城への魔法と同じく、魔法の塔の `castleSpellBonus` が乗り、攻撃を受けたときの防御（城壁・土嚢・反射）を聞く。反射されたときは回復しない
- 決死の砲撃の支払いは、城壁・土の精霊を通さず、霧で外れても払う。`castleDamaged`（`source: { kind: "sacrifice", type }`、`blocked: 0`）
- 命の簒奪の回復は `castleDamaged` → `castleHealed`。相手の城が落ちたときは回復せずに決着
- 火薬庫は対象を選ばない（`{ playerId: 自分 }`）。席順に、各プレイヤーの兵士へ `soldierDamaged`（`cause: "spell"`）。忍者には当たらない。防御は聞かない。霧で外れることがある
- 魔力強奪のイベント：`spellCast` → `mpChanged`（相手、`reason: "drained"`）→ `mpChanged`（自分、`reason: "drain"`）
- CPU：`random` は出せるカードとして使う。`smart` などの戦い方は、まだ選んで使わない
- 画面（UI担当にお願いしたいこと）：カードの絵（今は仮の絵）、`js/ui/text.js` の効果アイコン、`js/ui/DeckEditor.js` の分類、`js/ui/CardGuide.js` の MP を使う effect の一覧、`js/ui/Animations.js` の演出。説明文は `cards.json` の `description` に書いてある
- 魔法スキン（`data/shop.json` の `fxskin_*`）を4枚ぶん足した（全魔法に1つずつ、のテストに合わせた。レア扱い）
- 確かめたこと：`node --test` 全部通る（`tests/drain-sacrifice.test.js`）

## 合成・高レアリティの機会を増やす調整（人間の指示。仮）

カードの種類が増えると、同じカードがそろいにくくなって合成の機会が減り、高レアリティを手に入れる機会も減る。そこで次のように変えた（数値は人間の指示）。
- **適応の排出率を約0.33% → 約2.5%**（解毒薬・天候の呪文が増えて、スペシャル0.82%を3枚で分けていたため下がっていた）。`rarities.json` のスペシャルを 0.82 → 3、コモンを 50 → 47.82（合計100）。`cards.json` の適応の `weight` を 1 → 7.625（解毒薬 約0.33%・天候の呪文 約0.16% は今までどおり）
- **排出率アップの強化を安くした**：運命の祈り 5 → 3コイン（2回まで）。幸運の加護 12 → **買うたびに 3 → 5 → 8 → 11コイン**（3回 → 4回まで）
- `upgrades.json` の `costs`（省略できる）：買うたびの値段の配列（1回目・2回目…。回数が配列より多ければ最後の値段）。`costs[0]` は `cost` と同じにする（違うと起動時に例外）。`upgradeBought.cost` は実際に払った値段
- `getState().players.pX.upgradeCosts`：`{ upgradeId: 次に買うときの値段 }`（だれからも見える）。画面は強化の値段をここから出す（`js/main.js` の `refreshUpgrades`・`js/ui/UpgradePanel.js`。UI担当の確認がほしい）
- 確かめたこと：`node --test` 全部通る（排出率の恒久強化のテストを4回までに直した。適応のテストは、山札の並びが変わって相手が防御カードを持つようになったので、相手の手札を決めるようにした）

## カードの整理と剣の強化（人間の指示。仮）

- **神頼み（`prayer`）・小銭袋（`coinPouch`）・金貨（`goldCoin`）をなくした**。特殊の系統は 天の恵み（アンコモン）→ 盗賊 → 身代わり → 反射、コインの系統は 財宝（レア）→ 金脈 → 王の財宝 から始まる。`randomEffect`（神頼みの効果）のしくみは Game に残してある（使うカードはない）。この節より上の記述で神頼み・小銭袋・金貨に触れている所は、昔の経緯として読む
- **剣を強くした**：魔剣 +3 → **+4**、聖剣 +4 → **+6**、神剣 +6 → **+9**
- 画面のテスト（`ui-tests/layout.js`）の手札にあった神頼みを、天の恵みに替えた（UI担当の確認がほしい）
- 合成できないときの理由：レジェンドだけ「レジェンドはこれ以上合成できません」、スペシャル・`fuseTo: null` は「このカードは合成できません」（以前はスペシャルにもレジェンドの文が出ていた）

## 魔物のカードを「効果」にする（人間の指示。仮）

**これからは、倒した魔物のカード（`beast_<魔物>`）は兵士（駒）ではなく、効果のカード（魔法）として作る**（人間の指示）。魔物ごとに効果を決めて、1体ずつ置きかえる。駒のままにすると決めた魔物（ゴブリン・スケルトン（弓兵）・ゴーレム（護衛））は、駒（兵士）のまま。

- 書き方：`cards.json` の魔物のカードを `kind: "spell"`・`monster: "<魔物>"`・`effect` にする（`monster` は兵士か魔法に書ける）。手に入れ方（とどめを刺した人の手札に入る）・使い切り（使っても捨てても山札に戻らない）・合成できない（「魔物のカードは合成できません」）・排出では出ない（`weight: 0`）は、駒のときと同じ。MP は使わない（`MP_EFFECTS` に入れていない効果）
- 魔物のカードには魔法スキン（`fxskin_*`）を作らない（キャラのスキン `charSkin:beast_<魔物>` を使う。`tests/economy.test.js` を合わせた）

| 魔物 | カード | 効果（`effect`） |
|---|---|---|
| コウモリ（`beast_bat`） | 効果 | 超音波：相手の兵士全員を1ターン止める（`freezeEnemySoldiers`、`turns: 1`） |
| スライム（`beast_slime`） | 効果 | 自分の城HPか MP のどちらかをランダムに5回復（`healCastleOrMp`。満タンの方は選ばない。両方満タンなら出せない） |
| ゴブリン（`beast_goblin`） | 駒（兵士） | 今までどおり（HP7・攻撃3・速さ2） |
| スケルトン（`beast_skeleton`） | 駒（弓兵） | HP6・攻撃3・射程2・2ターンで帰る（`role: "archer"`） |
| ゴースト（`beast_ghost`） | 効果 | 相手の手札を2枚ランダムに奪う（`stealCard`、`amount: 2`。`stealCard` に `amount` を書けるようにした。省略すると1枚） |
| トレント（`beast_treant`） | 効果 | 自分の城HPを10回復し、城壁を5置く（`healAndArmor`：`amount`・`armor`。城壁の決まりは城壁のカードと同じ） |
| ゴーレム（`beast_golem`） | 駒（護衛） | 城の護衛：HP14・攻撃2。自分の城の前（マス0）から動かず、**出した道と左右のとなりの道**（1体で3本まで）の城の前を守る。4ターンで帰る（`role: "guard"`・`stay: 4`） |
| デーモン（`beast_demon`） | 効果 | 相手の城と兵士を毒3にする（`poisonEnemy`、`amount: 3`） |
| ミミック（`beast_mimic`） | 効果 | 相手のコインを5枚奪う（持っている分だけ。`stealCoins`。相手が0枚なら出せない。`coinsChanged` の `reason` は `"stolen"`（奪われた）／`"steal"`（奪った）） |
| ドラゴン（`beast_dragon`） | 効果 | 相手の城に15ダメージ（`damageEnemyCastle`。防御を聞く・魔物も狙える） |
| ヴァンパイア（`beast_vampire`） | 効果 | 相手の城に10ダメージ、自分の城を10回復（`damageCastleAndHeal`：`amount`・`heal`） |
| 魔王（`beast_demonKing`） | 効果 | 相手の城と、相手の兵士全員に15ダメージ（`damageEnemyAll`。兵士が先、城は防御を聞く。忍者には当たらない） |

- **護衛（`role: "guard"`）**：`hp`・`attack`・`stay` を書く（`speed`・`range` は書かない）。動かず、自分から戦いには行かない。相手の兵士は、護衛のいる道か、そのとなりの道（同じ2人の間で `lane` が1つ違う道）を進むとき、護衛を「自分の道の相手の城の前（マス0）にいる兵士」として扱い、いつもの決まり（同じマスか1つ先）でぶつかって戦う（同時に攻撃し合う）。弓兵・魔法使いも、となりの道の護衛を撃てる。弓兵・魔法使いと同じく、自分のターンごとに `turnsLeft` が1減り、0で帰る（`soldierDestroyed` の `reason` は `"returned"`。凍っていても減る）。広場（3人以上）では、自分の道だけを守る
- **魔物のカードは MP を使わない**（`mpCostOf` が `monster` のカードを0にする。ドラゴン・デーモン・コウモリ・魔王のように、ふつうなら MP を使う効果でも）

- ヴァンパイアのカード：メイン（1ターン1枚）。城への攻撃は防御（城壁・土嚢・反射）を聞く。魔法の塔の `castleSpellBonus` は乗せない（10ちょうど）。**回復は、外れても・防がれても・反射されても起きる**。相手の城が落ちたら回復せずに決着。イベント：`spellCast` →（防御）→ `castleDamaged` → `castleHealed`
- 確かめたこと：`node --test` 全部通る（`tests/drain-sacrifice.test.js` に4件）

## サイコロのカード（仕様書7章。人間の指示。数値は仮）

サイコロデッキを組めるように、サイコロのカードを8枚足した（どれも**スペシャル**。ゴッドサイコロだけデッキ編成ではレジェンド枠。合成しない。デッキ編成ではレアと同じ扱いで、1種類3枚まで）。排出率は1枚約0.33%（`weight` 1。ゴッドサイコロは下）。適応（約2.5%）・解毒薬・天候の呪文の排出率を変えないよう、スペシャルの枠を 3 → 5.301、コモンを 47.82 → 45.519 にした。攻撃サイコロの MP は `mpCost: 3`（スペシャルにはレアリティの MP がないため、カードに書く）。`effect: "dice"`、`dice` に種類、`per` に目に掛ける数を書く。効果の量は **出た目（1〜6）× `per`（端数は切り上げ）**。

| カード | `dice` | 効果 | 出し方 | MP |
|---|---|---|---|---|
| 攻撃サイコロ `attackDice` | `attack` | 相手の城に 目×3.5（4〜21）。防御を聞く。魔法の塔のボーナスは乗せない | メイン | 3 |
| ヒールサイコロ `healDice` | `heal` | 自分の城を 目×3（3〜18）回復。満タンなら出せない | メイン | なし |
| マナサイコロ `manaDice` | `mana` | MP を 目×2（2〜12）回復。満タンなら出せない | 何枚でも | なし |
| コインサイコロ `coinDice` | `coin` | 目×2（2〜12）コイン | 何枚でも（ただしコインのカードと合わせて1ターン `coinCardsPerTurn` 枚まで） | なし |
| シールドサイコロ `shieldDice` | `shield` | 目×3（3〜18）の城壁（城壁のカードと同じ決まり。上限なら出せない） | 何枚でも | なし |
| バフサイコロ `buffDice` | `buff` | 選んだ自分の兵士1体の攻撃力 +目×1（1〜6。ずっと） | 何枚でも | なし |
| ランダムサイコロ `randomDice` | `random` | **振る前にコストを払う**：城HP4・コイン3・MP3 のうち払えるものを1つランダムに払う（`randomCost`。城HPは払っても城が落ちないとき＝HP5以上のときだけ。どれも払えなければ出せない：「払えるコストがありません」）。そのあと2回振る：1回目の目で、上の6つのうち今使えるサイコロのどれかを選ぶ（使えるものが6つなら 1=攻撃・2=ヒール・3=マナ・4=コイン・5=シールド・6=バフ）。2回目の目は必ず4〜6。対象はランダム | メイン | なし（コストは左） |

- **ゴッドサイコロ** `godDice`（`dice: "god"`。人間の指示）：1回振って、その目で6つのサイコロの効果が**全部**起きる（倍率はそれぞれのサイコロのカードの `per`：相手の城に 目×3.5・自分の城 目×3 回復・MP 目×2・コイン 目×2・城壁 目×3・**自分の兵士全員**の攻撃+目）。使えない効果（城・MP が満タン、城壁が上限、兵士なし）は飛ばす。起きる順は ヒール → マナ → コイン → シールド → バフ → 攻撃（攻撃は防御を聞くので最後）。**コストなし**（MP も使わない）・メイン。`diceRolled` は1回で、`dice: "god"`・`amount` は種類ごとの量 `{ attack, heal, mana, coin, shield, buff }`。コインのカードの1ターン1枚には数えない
  - **スペシャルだがレジェンド枠**：カードに `deckAs: "legendary"` を書いた（デッキ編成で、コスト5・レジェンドの合計枚数に数える。`deckRarityOf()` はカードの `deckAs` → レアリティの `deckAs` の順に見る）。排出率はレジェンドのカード1枚（`weight` 1）と同じくらいの約0.12%（`weight: 0.36`）。適応などの排出率を変えないよう、スペシャルの枠を 5.301 → 5.42、コモンを 45.519 → 45.4 にした
- ランダムサイコロのコスト（「何も払わないと強い」ので人間の指示で足した）：城HPは城壁を通さず `castleDamaged`（`source: { kind: "sacrifice", type }`）、コインは `coinsChanged`（`reason: "cost"`）、MP は `mpChanged`（`reason: "cast"`）。`diceRolled` に `cost: { kind: "hp" | "coins" | "mp", amount }` が付く
- イベント `diceRolled`：`{ playerId, type, dice, value, amount, rolls, cost? }`（`dice` は実際に起きた種類、`value` は効果に使った目、`amount` は効果の量、`rolls` は振った目の並び。ランダムサイコロは2つ）。カードを出した `cardPlayed` のあと、効果のイベント（`spellCast` → `castleDamaged`、`castleHealed`、`mpChanged`、`coinsChanged`、`castleArmored`、`soldierBuffed`）の前に出る。画面はこれでサイコロを振る演出を出す（UI担当）
- `Card.slot`：マナ・コイン・シールド・バフのサイコロは `support`（`SUPPORT_DICE`）、ほかはメイン
- 確かめたこと：`node --test` 全部通る（`tests/dice.test.js`）

## ゲイルフォース（押し戻しの魔法。人間に確認して決めた。仮）

- **ゲイルフォース**（`galeForce`・`kind: "spell"`・`effect: "pushBackEnemySoldiers"`・`amount: 2`・**アンコモン**・`weight` 1）：選んだ相手の兵士全員（**全レーン**）を `amount` マス押し戻す（`position` を減らす）。**自分の城の前（マス0）より後ろには下がらない**（マス1なら1マスだけ）。メインを使い、MP を使う（攻撃の魔法と同じ。アンコモンなので2）
- 押し戻せる兵士（マス0より前にいる、見える兵士）がいないと出せない（「押し戻せる兵士がいません（みんな城の前にいます）」）。忍者には効かない（ほかの魔法と同じ）。ダメージではないので、霧でも外れず、防御も聞かない（凍結と同じ）
- `scope: "lane"` を書くと、選んだ1レーンだけになる（今のカードは全レーン）
- 合成：ゲイルフォース2枚 → **氷河**（レア。同じ「足止め」の系統に合流させた。仮）
- イベント：`cardPlayed` → `spellCast` → 下がった兵士ごとに `soldierMoved`（出した順。`cause: "pushed"`）。マス0で動かない兵士には出さない
- 長所と短所：城の前まで来た兵士を、凍結（1回休み）より大きく戻せる。ただしダメージはなく、兵士は次の進軍でまた進んでくる
- CPU（`smart` 系）：次の進軍で城に着きそうな兵士がいるとき、凍結がなければ使う
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均39.7手番・p1 勝率49%（追加前とほぼ同じ）。CPU の弱い順は変わらない（`--games 200` で random に勝つ割合：defensive 10%・rush 16%・smart 89%。追加前は 8%・17%・84%）
- 画面：説明文・札（`js/ui/text.js`）、道に土けむりと風の音の演出（`Animations.js` の `mist`・`Sound.js` の `gust`）、押し戻しは今の進軍の動きで後ろへ下がる。チュートリアルは押し戻しを「進軍した」と数えない。絵は仮の SVG（`js/ui/art.js`）、魔法のスキン `fxskin_galeForce`（`data/shop.json`）。専用の絵ができたら差しかえる

## 背水の陣とBGMの切り替え（人間に確認して決めた。仮）

- **背水の陣**（`rules.overdriveHpRatio`、仮：0.3333／`rules.overdriveAttack`、仮：10。どちらかが0なら使わない）：城HPが「上限 × `overdriveHpRatio`（四捨五入）」以下（城HP60なら20以下。部屋で城HPを変えても同じ割合）になると、その城の兵士全員（チーム戦は城を共有するメンバー全員）の攻撃が +`overdriveAttack`。戦い・射撃・城へのダメージに効く（城へは「攻撃力×`soldierCastleDamageMultiplier`」なので +20）。回復して線を超えたら終わる。イベント `overdriveChanged`、`getState().players.pX.overdrive`（`true` / `false`）。`getState()` の兵士の `attack` には足さない（夜と同じ）
- 確かめたこと：`--match smart,smart --games 600` で平均39手番・先攻の勝率46%（背水の陣なしと同じくらい）。**先に城HPが1/3以下になった側が勝つ割合**は、背水の陣なしで19%、+5で22%、**+10で27%**（smart 同士400試合）。逆転は起きやすくなったが、強すぎてはいない。遊んで確かめる
- 画面：城が赤く燃える（`css/stage.css` の `.castle.overdrive`）、「🔥 背水の陣！」の帯と画面の揺れ
- **BGM**（`js/ui/Music.js`・`js/ui/musicScene.js`）：場面の優先は **ピンチ**（どこかの城が背水の陣）＞**ボス戦**（`UI_CONFIG.bossMonsters`＝ドラゴン・デーモン・魔王か、ごほうびがエピック以上まで育った魔物）＞**夜**＞**魔物がいる**＞ふつう。試合中の場面どうしは、曲を止めずに8拍の切れ目で次の曲へ移る。夜・ボス・ピンチの曲を足した（音源ファイルなし。今までと同じく音符で書いた旋律）

## コイントス・後攻の補正・マリガン（人間に確認して決めた。仮）

- **先攻（コイントス）**：`new Game({ setup: { firstPlayer } })`（省略すると席順の最初の人）。ひとりで遊ぶ・同じ端末は画面がシードから、オンラインはサーバーが部屋の乱数で、ランダムに選んで渡す（チーム戦は席順のまま。`firstPlayer` を変えると例外）。周回は先攻のターンで増える（先攻が抜けたら、先攻から席順に数えて残っている人）。`getState().firstPlayer`。画面は、試合の始めにコインが回る演出で知らせる（`Animations.coinToss`・`css/coin-toss.css`。演出なしの設定なら帯だけ）
- **後攻の補正**（先攻以外の人。チーム戦では使わない）：初期手札 +`secondPlayerHandBonus`（仮：1）、最初から城壁 `secondPlayerArmor`（仮：5）。今までの `secondPlayerCastleBonus`（城HP）は0のまま
- **マリガン**（`rules.mulligan`、仮：`true`）：`start()` のあと `phase` が `"mulligan"`（`getState().mulligan` は `{ pending: まだ選んでいない人 }`）。そのあいだ `playCard` / `endTurn` などは「最初の手札を選んでいるところです」。降参はできる（2人なら相手の勝ち）
  - CPU：兵士が1枚もない手札なら全部戻し、それ以外は戻さない（`mulliganChoice` in `js/game/strategies.js`）
  - オンライン：`POST /api/action` の `method` に `mulligan`（`args: [cardIds]`。自分の手札だけ。自分の番でなくても送れる）。CPU は少し間をおいて選ぶ
  - 画面：「捨てる」と同じバーで、0枚から何枚でも選ぶ（「このまま始める」／「引き直す（N枚）」）。**2人で交代して遊ぶときはしない**（手札を見せ合えないため）
- テスト：本物の `data/rules.json` で、マリガン・後攻の補正と関係のない仕組みを確かめるテストは、`tests/helpers.js` の `PLAIN_START` でこの3つを切る
- 確かめたこと（`node tests/sim/run.js --match smart,smart --games 600`。シミュレーションは p1 が先攻）：全試合決着、平均40手番、**先攻の勝率45%±4%**（補正が手札+1だけ・城壁5だけなら47%、補正なしは前の測定で52%）。後攻がやや有利なので、遊んで確かめる（直すなら `secondPlayerHandBonus` か `secondPlayerArmor` を0にする）。CPU の弱い順は変わらない（random に勝つ割合：defensive 8%・rush 13%・smart 78%。random が後攻の補正をもらうため smart の数字は下がった）

## 魔法4種：チェーン・ブラスト／イグニッション・バースト／シールド・ブラスト／ピュリファイ・フレア（人間に確認して決めた。仮）

| 名前（type・effect） | 効果 | 長所 | 短所 | レアリティ（MP）・合成先 |
|---|---|---|---|---|
| チェーン・ブラスト（`chainBlast`・`chainBlast`） | 相手の兵士1体（対象 `{ soldierId }`）に `amount`（4）。同じ道の前後1マス（同じマスも）と、となりのレーンの同じマスにいる同じ陣地の兵士に半分（切り上げ、2） | 固まった部隊をまとめて削れる | 1体だけなら4で終わる | アンコモン（2）→ 大雷 |
| イグニッション・バースト（`ignitionBurst`・`ignitionBurst`） | 自分の城に `selfDamage`（6。城壁が先に受ける。`castleDamaged` の `source.kind` は `"self"`）。代わりに相手の兵士全員と相手の城に `amount`（7）。防御は聞かない | 盤面も城も一気に削れる | 自分も痛い。城HPが `selfDamage + 1`（7）以下だと出せない（自滅させない） | レア（3）→ 星降り |
| シールド・ブラスト（`shieldBlast`・`armorBlast`） | 自分の城壁の値と同じダメージを相手の城に。城壁は0（`castleArmored` の `armor: 0`）。**使い切り**（`exhaust`）。城に当たる魔法なので、相手は防御（反射など）を出せる | 城壁を積むほど大きなとどめ（最大 `armorMax`＝40） | 城壁が全部なくなる。城壁がないと出せない | エピック（4）→ 終末の炎 |
| ピュリファイ・フレア（`purifyFlare`・`purifyFlare`） | 自分の兵士の毒・やけど・凍結と城の毒を全部治し（`statusCleared` / `castleCured`）、相手の兵士全員に `amount`（1） | 守りと攻めを同時に | 治すものも相手の兵士もいなければ出せない。ダメージは小さい | アンコモン（2）→ 大回復 |

- どれも攻撃の魔法（メインの1枚・MP を使う）。「シビレ」はないので、治すのは毒・やけど・凍結
- `spellCast` は、チェーン・ブラストのとき `roadId`（狙った兵士の道）と `soldierId` を持つ
- CPU（smart 系）：浄化（自分に状態異常があれば）→ シールド・ブラスト（城壁10以上か、相手の城を落とせるとき）→ イグニッション・バースト（自分の城HPが半分より多く、相手の兵士2体以上か相手の城を落とせるとき）→ チェーン・ブラスト（いちばん前の相手の兵士）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士 平均36.7手番・p1 勝率52%。CPU の弱い順は変わらない（`--games 200`、random に勝つ割合：defensive 12%・rush 19%・smart 87%）
- 画面：説明文・札（`js/ui/text.js`）、演出（チェーン＝雷の演出、イグニッション・シールド＝火の玉、浄化＝金色の霧）、仮の SVG の絵、ストーリー、魔法のスキン

## ステージ（マップ）と昼と夜（人間に確認して決めた。仮）

**数値はすべて仮**（`data/stages.json`・`data/rules.json`）。

### ステージ（`new Game({ stages, setup: { stage } })`）
- 試合の最初に1つ決まり、試合のあいだ変わらない。`setup.stage` がIDならそのステージ、省略か `"random"` なら `weight` の重みでランダム（山札を作ったあとに乱数を使う。`stages` を渡さなければ乱数を使わない）
- **合う属性の武器を持った兵士は、ダメージが `elementMultiplier`（1.5）倍**（小数は切り上げ）。武器を持っていて、兵士の属性（最後に持たせた武器の属性）がステージの `element` と同じときだけ。兵士同士の戦い・魔物との戦い・射撃・城へのダメージに効く（城へは「攻撃力×1.5（切り上げ）」× `soldierCastleDamageMultiplier`）。魔法・魔物には効かない（人間の指示）
- 溶岩＝火（炎の剣）・氷＝水（水の槍。「氷の剣」はないので水の槍に当てた）・闇の森＝風（風の弓）・砂漠＝土（土の槌）。遺跡・草原は属性なし

| ステージ（ID） | 属性 | ギミック |
|---|---|---|
| 草原・王都（`meadow`） | なし | なし（標準） |
| 溶岩（`lava`） | 火 | 城への魔法+3（`effectBonus`）。**ターンの終わりに、手番の人の兵士全員に灼熱1**（`heat`。盾は効く）、自分の城から数えて `lavaSquares`（1・3）のマスにいる兵士は**やけど**。**周回の始めに40%で噴火**（`eruption`）：ランダムな道の1マス（城の前のマス以外。広場なら広場）の兵士に3ダメージとやけど |
| 氷（`ice`） | 水 | 進む兵士が止められずに歩き切ったら、25%で**滑って1マス余分に進む**（`slipChance`）。凍結の休み+1・盾+1（`effectBonus`） |
| 古代遺跡（`ruins`） | なし | 自分のターンの始めに **MP+1**（`mpPerTurn`。`maxMp` が0なら何もしない）。城・兵士へのダメージの魔法+2 |
| 闇の森（`darkForest`） | 風 | **夜になりやすく（50%）、夜が1周長い**（`nightChance`・`nightRoundsBonus`） |
| 砂漠・荒野（`desert`） | 土 | 弓兵・魔法使いの**射程−1**（最低1。`rangePenalty`）。**砂嵐が4倍起きやすい**（`weatherWeights`） |

- **やけど**（`burn`。ステージの `burn`：1ダメージ×2回）：持ち主の進軍の前に `amount` ダメージ（盾は効かない）。回数が来たら治る（`statusCleared`）。重ねがけは量・回数を大きい方にそろえる。`statuses.burn` は `{ amount, turns }` か `null`
- 「移動マス−1」（氷）は、滑ると逆の効果になるので入れていない。「溶岩の裂け目噴火」は噴火で表した
- **選び方**：ふだんは毎試合ランダム。ひとりで遊ぶ・同じ端末の詳細設定（`js/ui/LocalSetup.js`）と、オンラインの部屋主の「ルールを変更」（`setRules` の `stage`。`"random"` かステージのID。`room.settings.stage`、`choices.stages`）で決めたステージも選べる
- `getState().stage`：`{ id, name, icon, description, element, elementMultiplier }` か `null`
- 画面：ステージごとに、盤面の景色（`#scenery`）・道・飛び石・城の色味を変える（`css/stage.css`。今はグラデーションと模様で描いた仮の見た目）。背景の絵 `assets/bg/stage-<ステージ>.png`（`darkForest` は `stage-dark-forest.png`）を置いて `assets/asset-manifest.json` に足せば、`js/ui/Renderer.js` の `setStage` が自動でそちらを使う（作り方は `assets/STYLE.md`）。2人のときは、相手の城を大きく（1.35倍）、自分の城を小さく（0.78倍）見せる（奥行き。人間の指示。`css/stage.css`）。背景の絵は草原・古代遺跡・闇の森・氷・溶岩の5枚がある（`assets/bg/stage-*.png`。城と城の間の地面（フィールド）だけの絵で、城はゲームの城のまま（人間の指示）。砂漠はまだ CSS の見た目）。絵があるときは、画面側の道の枠を消し、飛び石は道にぴったり合う画面側のもの（砂漠と同じ石。`ui/kingdom-platform.png`）を地面の絵の上に3列に並べる。真ん中のマスは、どのステージでも大きな石の台（人間の指示）。**真ん中のマス（魔物・のちのワールドボスの場所）は、ほかのマスの `UI_CONFIG.midCellScale`（1.8）倍の高さ**（画面だけ。`js/ui/Renderer.js` の `rowCenter` と `--cell-rows` が同じ比率を使う）。上の「○周目」の前にステージのアイコン。試合の始めにステージの説明をお知らせで出す。噴火の演出
- シミュレーション：`node tests/sim/run.js` は毎試合ランダムなステージで回す。`--stage lava` で1つに決める、`--no-stages` でステージなし
- 確かめたこと（`--games 200 --match smart,smart --stage …`）：どのステージも全試合決着。平均手番：草原38・溶岩38・氷35・遺跡33・闇の森39・砂漠36、先攻の勝率49〜53%。CPU の弱い順は変わらない（random に勝つ割合：defensive 10%・rush 13%・smart 84%）

### 昼と夜（`rules.nightChance` など）
- 周回の始め（天候のあと）に、昼なら `nightChance`（仮：0.15。ステージの `nightChance` が優先。0 なら乱数を使わず夜にならない）の確率で夜になる（`nightFirstRound`（仮：3）周目から）。夜は `nightRounds`（仮：2）＋ステージの `nightRoundsBonus` 周続き、昼に戻る。イベント `timeChanged`。`getState().time`（`"day"` / `"night"`）・`nightRoundsLeft`
- **夜の効果**：**獣**（魔物の駒＝`monster` のある兵士カードと、`beast: true` の兵士）の攻撃 +`nightBeastAttack`（仮：2。**ビースト覚醒**）／**暗殺者・忍者**（`role: "ninja"`）の攻撃 +`nightStealthAttack`（仮：2）／**魔物の城への攻撃** +`nightMonsterAttack`（仮：1。夜の脅威）。`getState()` の兵士の `attack` には夜の分を足さない（戦い・城へのダメージのときに足す）
- **刻の魔法**（`effect: "setTime"`、`time`。スペシャル・メインを使う・MPなし）：**ムーンライズ**（`moonrise`、昼のときだけ。夜にする）／**ドーンブレイク**（`dawnbreak`、夜のときだけ。昼に戻す）。出せないときは「もう夜です」「もう昼です」
- **暗殺者**（`assassin`。スペシャルの兵士・`role: "ninja"`・HP3/攻撃4/速さ3）：忍者と同じく、相手から見えず、敵の兵士をすり抜け、魔物には止められる。夜は攻撃+2。ひとりで遊ぶときも、相手の暗殺者のイベント（`stealth` 付き）は画面に出さない（`js/main.js`）
- 排出率：ムーンライズ・ドーンブレイク・暗殺者（スペシャル、`weight` 各0.5）を足しても、適応・解毒薬・サイコロなどの排出率が変わらないよう、スペシャルの枠を 5.42 → 5.91、コモンを 45.4 → 44.91 にした（`data/rarities.json`。#152・#153 とまとめたときに直した）
- CPU（`smart` 系）：自分に獣・暗殺者がいれば昼にムーンライズ。夜に、自分には獣・暗殺者がいなくて、相手に獣が見えるか魔物がいればドーンブレイク
- 画面：夜は盤面に青い影、「○周目」の前に🌙、夜になった・明けたの帯

### まだ作っていないもの
- **ワールドレイド**（ボスごとに専用ステージ：ドラゴン＝溶岩・古代竜＝古代遺跡・魔王＝闇の魔城）：遊び方（だれとだれが、どこで、何人で、何を倒すか）がまだ決まっていないので、人間に確認してから作る

## クラシックの戦闘ルール（PR2a。人間の指示。仮）

どちらも `rules` のキーで切り替える（書かなければ今までどおり。通常モードの `data/rules.json` には書いていない）。クラシック（`data/classic/rules.json`）だけで使う。

### 城への魔法が先頭の兵士に当たる（`rules.castleSpellHitsFront: true`）
- 対象：`effect: "damageEnemyCastle"` のカード。**対象は `{ playerId, roadId }`**（相手と、レーンの道）。2人の間の道が1本なら `{ playerId }`（省略できる）。魔物を狙う `{ monsterId }` は今までどおり
- 当たる先：選んだ道の、相手の陣地の見える兵士のうち、**撃った人の城にいちばん近い兵士**（`position` がいちばん大きい。同じなら先に出された方）。忍者は見えないので数えない。いなければ、今までどおり相手の城に当たる（城壁・防御・魔法の塔のボーナスも今までどおり）
- 兵士に当たるとき：ダメージはカードの `amount`（ステージの魔法の増加は乗る。**魔法の塔の `castleSpellBonus` は城への分なので乗せない**）。盾が先に受け、HPが0以下なら倒れる。霧で外れることがある。防御はサンダーと同じ（`defenseRequested` の `kind: "soldiers"`。盾だけ。反射・身代わりは出せない）。`defenderId` は当たる兵士の持ち主
- イベント：`cardPlayed` → `spellCast`（`roadId`・`soldierId`）→（防御）→ `soldierDamaged`（`cause: "spell"`）→（0なら）`soldierDestroyed`（`"killed"`）。城に当たるときは `spellCast`（道が決まれば `roadId`）→ `castleDamaged`
- CPU（`js/game/strategies.js`）：道を選ぶとき、相手の兵士がいちばん先頭まで来ている道へ（いなければ最初の道）
- クラシックのカード：聖なる火球・闇の火球（PR2b で足した）

### 崩壊の刻（`rules.collapseStartRound` など）
- `collapseAnnounceRound`（クラシック：50）の周回の始めに予告（`collapseAnnounced`）。`collapseStartRound`（クラシック：60）の周回から崩壊（`collapseStarted`）
- 崩壊中は、周回の始め（天候・噴火のあと、魔物の城への攻撃の前）に、**残っている全員の城に同じダメージ**：`collapseDamage` × (始まってからの周回の数。始まった周回が1)＝ 1, 2, 3 …。城壁が先に受け、残りが城HP（土の精霊・防御カードでは防げない）。`castleDamaged`（`source: { kind: "collapse" }`）
- 城が落ちた人は負け。**同時に2つ以上落ちたら、ここまでに相手の城に与えたダメージの合計が大きい人の勝ち**（同じなら席順が後ろ）。城が残った人がいれば、その中で同じ決め方（2人なら残った人）。`gameOver` の `reason` は `"collapse"`。バトルロイヤル（`lastStanding`）で城が2つ以上残るなら、落ちた人だけ抜けて続ける
- 「相手の城に与えたダメージ」：`castleDamaged` で相手の陣地の城HPに実際に入った量（`amount − blocked`）。兵士はその持ち主、反射は反射した人、ほかは手番の人に数える。自分で払うコスト（`sacrifice` / `self`）・崩壊・降参・天候・城の毒・魔物の城への攻撃は数えない。崩壊の刻を使うルールのときだけ数える
- クラシックは周回の上限なし（`maxRounds: 0`）。崩壊の刻で必ず終わる
- 確かめたこと（`node tests/sim/run.js --mode classic --games 100 --seed 1 --match smart,smart`）：100/100 決着、平均126手番（周回の上限60のときは115手番・上限で終わる83%）、崩壊の刻で決着した試合49%
- 画面（UI担当にお願いしたいこと）：崩壊の予告・開始の帯、`collapse` のバッジ、`castleDamaged` の `source.kind: "collapse"` の演出、`gameOver` の `reason: "collapse"` の表示。城への魔法でレーンを選ぶ操作（`getTargets` が `{ playerId, roadId }` を返す）と、`spellCast.soldierId` があるときに兵士へ当てる演出

## クラシックの道具：MP・1体への魔法・呪い（PR2b。人間の指示。仮）

どれも `rules` のキー・カードの `effect` で切り替える（書かなければ今までどおり。通常モードの `data/rules.json`・`data/cards.json` には書いていない）。

### MP をすべてのカードに（`rules.mpAllCards: true`）
- 兵士・武器・防御・回復なども、カードの `mpCost` だけ MP を使う（書かなければ0）。攻撃の魔法・精霊は今までどおり（`mpCost` か、レアリティの `mpCost`）。足りなければ出せない（理由は「MPが足りません（○必要・あと○）」）
- 魔物のカード・サイコロ（攻撃サイコロ以外）・マナ回復のカードは、今までどおり MP を使わない
- 攻撃を受けたときの防御カード（`defend()`）も MP を使う。MP が足りない防御カードは、出せるカードに数えない（ほかに出せるカードがなければ防御を聞かない）
- `getState().mpCosts` に、MP を使う兵士・武器・防御なども入る
- **MP の自然回復**（`rules.mpPerTurn`）：自分のターンの始め（コインのあと、ドローの前）に増える（`mpChanged` の `reason: "turn"`。上限まで）
- **後攻のマナ**（`rules.secondPlayerMp`）：先攻以外の人の最初の MP がこれだけ多い（上限まで。イベントは出さない）
- クラシック（仮）：`initialMp` 10・`maxMp` 20・`mpPerTurn` 3・`secondPlayerMp` 2（後攻の優遇は少し弱めた：城壁5→3・MP3→2。手札+1はそのまま）。`data/classic/cards.json` の全カードに `mpCost` を書いた（兵士1〜2・武器1〜2・防御1〜2・回復1〜3・攻撃の魔法2〜4）

### 敵兵士1体にダメージ（`effect: "singleDamage"`、`amount`）
- 対象は相手の見える兵士1体 `{ soldierId }`（忍者・暗殺者は選べない）。ダメージは `amount`（ステージの魔法の増加は乗る）。盾が先に受ける。霧で外れる。属性なし
- 兵士に当たる魔法なので、相手は盾を出せる（`defenseRequested` の `kind: "soldiers"`）
- 攻撃の魔法（メインの1枚・MP を使う）
- イベント：`cardPlayed` → `spellCast`（`roadId`・`soldierId`）→（防御）→ `soldierDamaged`（`cause: "spell"`）→（0なら）`soldierDestroyed`（`"killed"`）

### 呪い（`effect: "weakenAttack"`、`amount`・`turns`）
- 対象は相手の見える兵士1体 `{ soldierId }`。状態 `weakened`（`getState()` の兵士の `statuses.weakened` は `{ amount, turns }` か `null`）
- 攻撃力が `amount` 下がる（最低1）。戦い・射撃・城へのダメージの攻撃力に効く（背水の陣・夜と同じところで引く。`getState()` の `attack` は変わらない）
- **持ち主の進軍が終わるたびに**残りが1減り、0で治る（`statusCleared`）。凍っていて動かなかった進軍も数える。呪いは自分のターンにしか出せないので、`turns: 3` なら相手の進軍3回ぶん（そのあいだの守りの戦いも）効く
- 重ねがけは、量・回数を大きい方にそろえる。もう同じか強い呪いがかかっている兵士は選べない（「もう同じ状態になっています」）
- ダメージではないので、霧でも外れず、防御も聞かない（凍結と同じ）。浄化（`purifyFlare`）では治らない
- 攻撃の魔法（メインの1枚・MP を使う）
- イベント：`cardPlayed` → `spellCast`（`roadId`・`soldierId`）→ `statusApplied`（`status: "weakened"`、`amount`・`turns`）

### クラシックのカードを足した（`data/classic/cards.json`）
| 陣営 | カード（type） | 効果 | MP | 枚数 |
|---|---|---|---|---|
| 王国 | ホーリーレイ（`classic_king_holy_ray`） | 敵兵士1体に5 | 4 | 2 |
| 王国 | 聖なる火球（`classic_king_holy_fireball`） | 城への魔法6（先頭の兵士に当たる） | 4 | 2 |
| 魔族 | シャドウ（`classic_demon_shadow`） | 敵兵士1体に4 | 3 | 3 |
| 魔族 | 呪いの印（`classic_demon_curse_mark`） | 敵兵士1体の攻撃−2・3回 | 2 | 2 |
| 魔族 | 闇の火球（`classic_demon_dark_fireball`） | 城への魔法6（先頭の兵士に当たる） | 4 | 2 |

- 山札は 76 枚
- CPU（`smart` 系）：1体への魔法は、倒せる兵士のうちいちばん前の兵士（いなければいちばん前の兵士）。呪いは攻撃力がいちばん高い兵士。MP が足りないカードは `canPlayCard` で出せないので選ばない
- 確かめたこと（`node tests/sim/run.js --mode classic --games 100 --seed 1`）：smart 同士 100/100 決着・平均106手番・先攻の勝率51%・崩壊の刻で決着25%（PR2a のときは126手番・49%）。smart が random に勝つ割合は、先攻73%・後攻74%（PR2a のときは先攻81%）。通常モードのシミュレーションは変わらない（変更前と結果が完全に一致）
- 画面（UI担当にお願いしたいこと）：新しい5枚の絵、`weakened` の表示（兵士のそば）と `statusApplied` / `statusCleared` の演出、兵士・武器・防御の札に必要な MP を出す（`getState().mpCosts`）、`singleDamage` / `weakenAttack` の対象選び（相手の兵士をタップ）と命中の演出、`js/ui/text.js` の説明文・効果アイコン

## クラシックの道具：蘇生・ランダム属性ダメージ（PR2c。人間の指示。仮）

どちらもカードの `effect` で切り替える（通常モードの `data/cards.json` には書いていない）。

### 蘇生（`effect: "reviveFallen"`、`amount`）
- 自分の兵士のうち**最後に倒れた1体**を、倒れた道の自分の城の前（マス0）に生き返らせる。対象は自分 `{ playerId }`（省略できる）
- 「倒れた」＝ `soldierDestroyed` の `reason` が `"killed"`。城に着いた・帰った・抜けた・道がなくなった兵士は数えない。魔物のカードの駒（`monster`）は生き返らせない
- 記録は持ち主ごとに1体だけ（新しく倒れると上書き。生き返らせたら消える）。`getState()` には出さない
- HP は倒れたときの最大HP（鍛錬を含む）× `amount`（切り上げ・最低1）。最大HPは元のまま。武器・盾・状態異常はなし。攻撃は新しく出した兵士と同じ（種類の値＋兵舎＋訓練）。出したターンは動かない
- メインの1枚を使う。兵士の枠（`soldiersPerTurn`）には数えない。攻撃の魔法ではないので、MP は `mpAllCards` のときだけ（カードの `mpCost`）
- 出せない：倒れた兵士がいない（「生き返らせる兵士がいません」）／その道がもうない（「倒れた兵士の道がもうありません」）
- 忍者も生き返る（`soldierDeployed` は `stealth` 付き。`spellCast` には `roadId` を入れない）
- イベント：`cardPlayed` → `spellCast`（`target` は自分、`roadId`）→ `soldierDeployed`（`revived: true`）

### ランダム属性ダメージ（`effect: "randomElementDamage"`、`amount`）
- 対象は相手の見える兵士1体 `{ soldierId }`（忍者は選べない）。火・水・風・土のうちランダムな1つ（`rng`）の属性で撃つ
- ダメージは `amount`（ステージの魔法の増加は乗る）＋、その属性が兵士の属性に強いとき `rules.elementBonus`。属性なしの相手・弱い側に当たったときは増減なし。盾が先に受ける。霧で外れる。相手は盾を出せる（`kind: "soldiers"`、`amount` は上乗せ込み）
- 攻撃の魔法（メインの1枚・MP を使う。`MP_EFFECTS`）
- イベント：`cardPlayed` → `spellCast`（`roadId`・`soldierId`・`element`）→（防御）→ `soldierDamaged`（`cause: "spell"`）→（0なら）`soldierDestroyed`（`"killed"`）

### クラシックのカード
| 陣営 | カード（type） | 効果 | MP | 枚数 |
|---|---|---|---|---|
| 魔族 | 残響の魂（`classic_demon_echo_soul`） | 蘇生（HP半分） | 3 | 2 |
| 魔族 | カオスパルス（`classic_demon_chaos_pulse`） | ランダム属性で敵兵士1体に3 | 3 | 2 |

- 山札は 80 枚（`tests/classic-mode.test.js` の上限）。王国の蘇生（聖なる祈り）は、入れると上限を超えるので入れていない
- CPU（`smart` 系）：ランダム属性ダメージは1体へのダメージと同じ選び方。蘇生は、ほかに出す兵士・魔法がないときに出す
- 確かめたこと（`node tests/sim/run.js --mode classic --games 100 --seed 1 --match smart,smart`）：100/100 決着・平均104手番・先攻の勝率39%±10%（PR2b は51%）・崩壊の刻で決着19%（PR2b は25%）。smart が random に勝つ割合は先攻66%・後攻83%。通常モードのシミュレーションは変わらない
- 画面（UI担当にお願いしたいこと）：2枚の絵、`soldierDeployed.revived` の演出、`spellCast.element` の色、`js/ui/text.js` の説明文・効果アイコン、`randomElementDamage` の対象選び（相手の兵士をタップ）

## クラシックの属性（PR3a。人間に確認して決めた。仮）

クラシックだけ、属性を9つにした（通常モードは今までの4属性の輪のまま）。付着・混沌反応は PR3b（下の「クラシックの付着と反応」）。

- **表**：`data/classic/elements.json`（`{ elements: { <id>: { name, beats: [<id>, ...] } } }`。`beats` は「その属性が強い相手」）。`data/modes.json` のモードに `elementsSet` を書くと、画面（`js/main.js`）・サーバー（`server/server.js` の `loadData`）・テスト（`tests/helpers.js` の `loadOptionalData(mode)`）が読んで `new Game({ elements })` に渡す。書いていないモード（通常モード）には渡さない
- **`new Game({ elements })`**（省略できる。チェックは `js/game/Elements.js`）：渡すと、兵士同士・兵士と魔物の戦い・射撃・ランダム属性ダメージの「強いか」を、この表の `beats` で決める。増え方は今までどおり `rules.elementBonus`（足し算。弱い側に当たっても減らない）。渡さなければ今までの輪（水→火→風→土→水）
- 起動時のチェック：カード（武器・魔法）・魔物・ステージ・天候の属性が、表にない（表がなければ4つにない）とエラー
- 強弱：火→氷／水→火・土／風→火／土→雷・風／氷→水／雷→水／闇→光／光→闇／混沌→なし（混沌に強い属性もない）
- **魔法にも `element` を書ける**（武器と魔法だけ）。ダメージ・強弱には使わない。兵士に当たったときの付着・反応に使う（PR3b）
- クラシックのカード：光＝聖鉄の剣・ルミナスランス・ルミナ・ホーリーレイ・聖なる火球／闇＝シャドウサイズ・シャドウ・闇の火球／氷＝フロストブレード・氷の息／混沌＝カオスロッド。カオスパルスは書かない（ランダム属性の仮の魔法。撃つ属性は今までどおり火・水・風・土から選び、強いかは表で決める）
- 確かめたこと（`node tests/sim/run.js --mode classic --games 100 --seed 1 --match smart,smart`）：100/100 決着・平均104手番・先攻の勝率38%（属性を入れる前は104手番・39%）。通常モードのシミュレーションは変わらない
- 画面（UI担当にお願いしたいこと）：`js/ui/look.js` の `ELEMENT_LOOK` に光・闇・氷・雷・混沌がないので、名前・色・アイコンが出ない（落ちはしない）。`js/ui/text.js`・`js/ui/Animations.js` の強弱（`ELEMENT_BEATS`）と `js/ui/HelpView.js` の説明は4属性の輪のまま

## クラシックの付着と反応（PR3b。人間に確認して決めた。数値は仮）

クラシックだけ。`new Game({ reactions })`（`data/classic/reactions.json`。チェックは `js/game/Elements.js` の `validateReactions`）。**渡さなければ付着も反応も起きない**（通常モード。乱数も使わず、`getState()` の兵士に `attachments` のキーも付かない）。`data/modes.json` のモードに `reactionsSet` を書くと、画面（`js/main.js`）・サーバー（`server/server.js` の `loadData`）・テスト（`tests/helpers.js` の `loadOptionalData(mode)`）が読んで渡す。

- **属性を持つのは武器を持った兵士だけ**（生まれつきの属性はない）。武器の属性（`element`）は、その兵士に最初から付いている属性として数える
- **付着**：属性つきの攻撃が兵士に当たると、その属性が付く（`attachments`：`[{ element, turns }]`。種類ごとに1つ。同じ属性がまた付いたら残りが `attachTurns` に戻る）。付く攻撃：①属性つきの武器を持つ兵士の戦い（お互いに）・射撃（武器の属性）②`element` のある魔法が兵士に当たったとき（ダメージのない氷の息・毒・呪い・押し戻しも、当たれば付く）。城に当たる魔法・魔物の攻撃・魔物への攻撃・忍者には付かない。属性なしの武器・魔法は付かない。霧で外れた攻撃は付かない。当たって倒れた兵士には付かない
- 付着の残りは、持ち主の進軍が終わったあとに1減り、0で消える（`elementCleared` の `reason: "expired"`。呪いと同じ。凍って動かなかった進軍も数える）
- **反応**：属性 X の攻撃が当たったとき、兵士に付いている属性（武器の属性＋付着）に、表で X と組になる属性があれば反応する（1回の攻撃で1つ。**3種類以上で混沌が入っていれば混沌反応が先**、次に表の順）。反応した属性は兵士から消える（**武器の属性も外れる。武器の攻撃ボーナスは残る**。同じ武器で何度も反応し続けないように）。当たった攻撃の属性は付かない。追加ダメージは元のダメージのあとに別に入る（盾が先に受ける。土の精霊は効く。城壁は関係ない）。属性の強弱の上乗せ（`elementBonus`）は今までどおり別に乗る

| 反応（ID） | 組 | 効果（仮） |
|---|---|---|
| 対消滅（`annihilation`） | 光＋闇 | 追加8 |
| 黒氷（`blackIce`） | 闇＋氷 | 追加3。生き残れば凍結1回 |
| 砕氷（`shatter`） | 氷＋混沌 | 追加2。凍結中なら、さらに+6して凍結が解ける |
| 混沌反応（`chaos`） | 攻撃が当たったあとの属性（武器の属性＋付着＋当たった攻撃の属性）に混沌が入っていて、種類が3以上（`minElements`）。**当たったのは混沌でなくてもよい** | 付いている属性が全部消えて、追加 4 × 種類の数（混沌を含む）。状態異常・盾・武器（攻撃ボーナス）は残る |

- 混沌＋ほか1種（2種類）のときは、2つの反応の表を見る（氷なら砕氷、光なら何も起きずに付着する）。**2種類で表の反応が成り立つなら表が優先、3種類以上なら混沌反応が優先**（表の組が成り立っていても。例：光＋混沌が付いていて闇が当たると、対消滅ではなく混沌反応）。混沌が付いている（武器が混沌の）兵士に別の属性が当たって3種になったときも起きる。混沌が入っていない3種類は混沌反応にならない。混沌と同じ属性の攻撃がまた当たっても、すでに混沌を含めて3種以上なら起きる（武器だけで3種そろっていたとき）
- `attachTurns`（仮：5）：兵士は戦いで数ターンのうちに倒れるので、4以上にしても結果は変わらない（smart 同士100試合で、4・5・8・10 は完全に同じ。2・3 は混沌反応が少し減る）。混沌反応が出にくいときは、この数字ではなく成立条件で調整する
- `reactions.json` の形：`{ attachTurns, reactions: { <id>: { name, elements: [a, b], damage, frozenTurns?, frozenBonus? } }, chaos: { element, name, damagePerElement, minElements } }`。反応した2つは必ず消える
- イベントの順番：（元の攻撃の `soldierDamaged`）→ `reactionTriggered` → `elementCleared`（`"reaction"`。消える属性ごと）→（砕氷で凍結中なら `statusCleared`（`frozen`））→ `soldierDamaged`（`cause: "reaction"`）→（0なら `soldierDestroyed`（`"killed"`）、黒氷で生き残れば `statusApplied`（`frozen`））。反応しなければ `elementAttached`。兵士同士の戦いでは、両方の `soldierDamaged`・倒れた兵士の `soldierDestroyed` のあとに、守る側 → 攻める側の順
- `getState().reactions`：反応の定義（`reactions.json` の中身のコピー。`reactions` を渡したゲームだけ。キーごとなし）。CPU・画面が、ゲームの内部を読まずに反応を調べるために出す
- CPU（`smart` 系だけ）：武器を出すとき、反応を起こせる相手の兵士がいる武器を先に選び、その相手と同じ道の、まだ武器のない兵士に持たせる（`js/game/strategies.js` の `canReact`。`getState().reactions` だけを使い、`game.reactionDefs` は読まない。判定は `Game.findReaction` と同じ決まりで、`tests/classic-reactions.test.js` が全組み合わせで一致を確かめる）
- 確かめたこと（`node tests/sim/run.js --mode classic --games 100 --seed 1 --match smart,smart`）：100/100 決着・平均105手番・先攻の勝率52%（PR3a は104手番・38%）。反応は smart 同士で1試合に平均1.8回（対消滅0.8・黒氷0.5・砕氷0.4・混沌反応0.15。直す前は混沌反応0.02）、反応が1回以上あった試合70%。smart vs random は1.5回、random 同士は1.4回。反応の回数は `node tests/sim/run.js --mode classic` の表の下に出る。通常モードのシミュレーションは変わらない（変更前と結果が完全に一致）
- 画面（UI担当にお願いしたいこと）：兵士のそばに付着の表示（`attachments`・`elementAttached` / `elementCleared`）、`reactionTriggered` の演出（反応名を大きく。ヒットストップ・揺れ）、`soldierDamaged` の `cause: "reaction"`、武器の属性が外れたとき（`elementCleared.weapon`）の表示

## クラシックの属性：ターン開始時のランダム付着（人間の指示。仮）

`rules.randomAttachTurnStart: true`（省略すると `false`）で有効。`reactions` を渡したゲーム（クラシック）だけ。スキルツリーはまだないので、今は有効にすると全プレイヤーに効く。処理は `Game.js` の `randomAttachAtTurnStart(player)` の1か所（スキルツリーが入ったら、ここの先頭の条件を「そのプレイヤーが持っているか」に変える）。

- **いつ**：自分のターンの始め。コイン・MP の回復のあと、ドローの前（自分の進軍の前なので、そのターンのうちに自分の武器・魔法で反応を起こせる）
- **何を**：敵（チーム戦なら相手チーム）の**見える兵士**（忍者・暗殺者は除く）からランダムに1体を選び、`elements` の表の全属性（混沌を含む）から等確率で1つ付着させる（`rng` を2回使う）。自分の兵士には付かない。**付着だけで、その場で反応は起こさない**。同じ属性がもう付いていれば、残りは**長い方にそろえる**（武器・魔法で付いた長い残りが縮まない）
- 敵の兵士がいなければ何も起きない（乱数も使わない）。キーが `false`/なしなら通常どおり（乱数も使わず、通常モードのシミュレーションは変わらない）
- 付着が残る回数：`data/classic/reactions.json` の `randomAttach: { turns }`（仮：1。省略すると `attachTurns`）。付着の残りは**持ち主の進軍が終わるたびに1減る**ので、1なら「持ち主の次の進軍が終わるまで」残る。つまり、付いたそのターンの自分の攻撃のほか、その間の相手の守りの戦いでも、こちらの兵士の属性が当たれば反応する。3人以上では、間の席の人のターンでも残る。広場では、自分を狙っていない兵士にも付く（兵士同士は戦わないので、魔法でしか活かせない）
- イベント：`elementAttached`（`{ playerId, soldierId, element, turns }`）に `source: "turnStart"` が付く（武器・魔法の付着には付かない）。反応したときは今までの `reactionTriggered`
- 確かめたこと（`node tests/sim/run.js --mode classic --games 100 --seed 1 --match smart,smart`。`--rules '{"randomAttachTurnStart":true}'`）：

| | 反応/試合 | 混沌反応（100試合） | あり | 平均手番 | p1勝率 |
|---|---|---|---|---|---|
| なし | 1.79 | 15 | 70% | 105.0 | 52% |
| 1ターン | 3.30 | 91 | 93% | 100.8 | 47% |
| 5ターン | 4.61 | 193 | 95% | 105.1 | 46% |

  1ターンを採用（5ターンは反応が増えすぎ）。1ターンでも目安（1〜3回）をやや超える。`data/classic/rules.json` にはまだ書いていない（スキルツリーで一部のプレイヤーだけに渡す想定のため。書くときは遊んで確かめる）
- 画面（UI担当にお願いしたいこと）：`elementAttached.source: "turnStart"` のとき、付着の演出を目立たせるか（スキルの発動として見せる）

## クラシック：王国の「守りを貫く手段」（案A 聖壁の号砲。人間の指示。数値は仮）

城への魔法は先頭の兵士に当たる（`castleSpellHitsFront`）ので、兵士を並べられると王国は城を撃てなかった（魔族には城と兵士を貫く毒がある）。王国らしく「守り（城壁）を攻めに変える」カードを足した。Game は変えていない（通常モードのシールド・ブラストと同じ効果 `armorBlast` をデータで使う）。

| 陣営 | カード（type） | 効果 | MP | 枚数 |
|---|---|---|---|---|
| 王国 | 聖壁の号砲（`classic_king_rampart_volley`） | 自分の城壁の値と同じダメージを相手の城に（兵士には止められない。相手の城壁・血の膜では止められる）。自分の城壁は0になる。光 | 3 | 2 |

- **陣営のカードだが、クラシックは全員共通の山札なので、魔族のプレイヤーも引いて使える**（ほかの王国・魔族のカードと同じ）
- 効果：対象は相手 `{ playerId }`（2人なら省略できる。レーンは選ばない）。相手の城壁は受け、攻撃を受けたときの防御を聞く（クラシックの山札で出せるのは城壁・血の膜。反射・土嚢はクラシックにない）。霧で外れても城壁は0になる。城壁がないと出せない（「城壁がありません」）。魔法の塔の `castleSpellBonus` は乗らない。使い切りではない（通常モードのシールド・ブラストは使い切り）。レアリティ・`fuseTo` は書かない（クラシックのほかのカードと同じ）
- 長所：城壁を貯めるほど大きい。貯めているあいだは城を守る。兵士の壁を越えて城に届く
- 短所：城壁を置く手間（城壁1枚 MP2・血の膜 MP1・手札）がかかり、撃つと守りが0になる。城壁がないと出せない。相手の城壁・血の膜で止められる
- **山札は80枚のまま**：身代わり（`classic_king_decoy`）2枚を外して、号砲2枚を入れた（身代わりは smart 同士で1試合0.1回しか使われず、城壁・盾と役目が重なっていた）
- CPU（**`smart`・`guard` だけ**。`js/game/strategies.js` の `playSupports` の `chargeArmor`。defensive・rush は今までどおり貯めない）：`castleSpellHitsFront` のルールで、城壁をぶつける魔法（`armorBlast`）を手札に持っているときは、城HPが満タンでも城壁を15（`ARMOR_CHARGE`）まで貯める。撃つのは今までどおり城壁10以上か、相手の城を落とせるとき。CPU を変えないと、号砲は1試合0.04回しか撃たれなかった。通常モードは `castleSpellHitsFront` がないので変わらない
- 確かめたこと（全員共通の山札。`node tests/sim/run.js --mode classic --games 100 --seed 1 --match smart,smart`）：100/100 決着・平均98.9手番・先攻の勝率52%±10%（入れる前は106.3手番・46%）。号砲は1試合0.95回撃たれ（王国・魔族どちらのプレイヤーも撃つ）、城に9.2ダメージ（城壁で止まったぶんを引く）。崩壊の刻で決着14%。通常モードのシミュレーション（`node tests/sim/run.js --games 100 --seed 1 --json`）は変更前と完全に一致
  - 参考（陣営の山札：王国40枚 vs 魔族40枚を1人1つの山札で、席を入れかえて200試合。今のクラシックの遊び方ではない。計測用のスクリプトはリポジトリの外）：王国の勝率53%（先攻46%・後攻60%）、平均99手番
- 気になる点（遊んで確かめる）：山札の城壁（城壁5×3・血の膜4×3）を全部集めれば27まで（後攻は最初の城壁3を足して30）貯まり、一撃が城HP60の半分ほどになる。人が遊ぶと CPU より上手に貯められる。強すぎたら一撃の上限か、使い切りで抑える
- 画面（UI担当にお願いしたいこと）：号砲の絵（今は仮の絵）、`js/ui/text.js` の説明文・効果アイコン、演出はシールド・ブラスト（`armorBlast`）と同じものが使えるか確かめる。図鑑・デッキ編成などでクラシックの身代わりを見せている所があれば外す

## クラシックの陣営カード：森の同盟・竜族帝国（人間の指示。数値は仮）

四大陣営のPR（#163〜#166。まだ main にない）で作った森（`faction: "forest"`）・竜（`"dragon"`）のカードを、クラシック用にした（人間の指示：「クラシックにするだけ」）。**クラシックの山札（`data/classic/cards.json`、80枚）には混ぜず、別のカード表にした**（人間の確認）。

- **置き場**：`data/classic/factions/forest.json`・`data/classic/factions/dragon.json`（各40枚）。`data/modes.json` のクラシックに `factionCardSets`（陣営 → ファイル）を足した。今は**テスト・シミュレーションだけが読む**（`tests/helpers.js` の `loadFactionCards(mode, faction)` と `buildData({ mode, factions: ['forest', 'dragon'] })`）。画面（`js/main.js`）・サーバー（`server/server.js`）は読まないので、遊べるのは陣営のデッキを選ぶ画面ができてから
- 書き方は王国・魔族と同じ：キーは `classic_forest_*` / `classic_dragon_*`、`rarity`・`fuseTo`・`weight`・`faction` は書かない、`count` と `mpCost` を書く。名前は #166 のまま。数値はクラシックの王国・魔族の帯に合わせて直した（#166 のコモン〜レアの値を土台に、MP で重さをつけた）
- 陣営らしさ（#163 の `factions.json`）：森＝回復・支援・粘り（精霊・城壁・射手・押し戻し・夜に強い獣人）、竜＝高火力・高耐久（硬い竜人・+2/+4 の武器・城と兵士への大きな魔法）。**竜は防御・回復のカードを持たない**（#166 の竜の防御・回復はどれも未実装のため）。それが竜の短所

### 森の同盟（18種・40枚）
| カード（type） | 効果 | MP | 枚数 | 長所／短所 |
|---|---|---|---|---|
| 森の獣兵（`classic_forest_beast`） | 兵士 HP2・攻撃5・速さ3・獣（`beast`） | 1 | 5 | 安くて速く、夜は攻撃+2／とても打たれ弱い |
| ウルフファイター（`classic_forest_wolf`） | 兵士 HP5・攻撃6・速さ3・獣 | 3 | 3 | 強くて夜は攻撃+2／MPが重い |
| エルフの斥候（`classic_forest_elf_scout`） | 弓兵 HP2・攻撃3・射程3・2ターン | 1 | 3 | 弓兵より遠く・安い／とても打たれ弱い |
| エルフの射手（`classic_forest_elf_archer`） | 弓兵 HP4・攻撃5・射程2・2ターン | 3 | 2 | 弓兵より強い／MPが重い |
| フレイムソード・アクアスピア・ゲイルボウ・アースハンマー | 武器 攻撃+1・火／水／風／土 | 各1 | 各1 | 安い・相手に合わせて属性を選べる／+1だけ。反応（光・闇・氷・混沌）は起こさない |
| 火の精霊（`classic_forest_fire_spirit`） | 精霊：相手の城に3×3ターン | 3 | 2 | メインを使わない／すぐ効かない・1人1体 |
| 水の精霊（`classic_forest_water_spirit`） | 精霊：自分の城+2×4ターン | 2 | 3 | メインを使わない回復／すぐ効かない・入れ替えると無駄 |
| 水の大精霊（`classic_forest_great_water_spirit`） | 精霊：自分の城+3×4ターン | 4 | 1 | 水の精霊より多い／MPが重い |
| 風の精霊（`classic_forest_wind_spirit`） | 精霊：自分の兵士の速さが最低2・3ターン | 2 | 2 | 遅い兵士を急がせる／兵士がいないと無駄 |
| 土の精霊（`classic_forest_earth_spirit`） | 精霊：受けるダメージ−1（最低1）・3ターン | 3 | 2 | 城も兵士も軽くなる／0にはできない |
| ゲイルフォース（`classic_forest_gale_force`） | 相手の兵士全員を2マス押し戻す | 2 | 2 | 城の前の兵士を戻せる／ダメージなし |
| 蔦の防壁（`classic_forest_ivy_wall`） | 城壁3 | 0 | 4 | MPを使わない／薄い |
| 樹皮の鎧（`classic_forest_bark_armor`） | 兵士に盾5 | 2 | 3 | 盾（3）より厚い／MPが重い |
| ブレイズ（`classic_forest_blaze`） | 選んだ1レーンの相手の兵士に3・火 | 4 | 2 | ルミナ（2）より強い／MPが重い |
| 森の結界（`classic_forest_grove_barrier`） | 城壁9 | 4 | 2 | 厚い／MPが重い |

### 竜族帝国（14種・40枚）
| カード（type） | 効果 | MP | 枚数 | 長所／短所 |
|---|---|---|---|---|
| 竜人の新兵（`classic_dragon_recruit`） | 兵士 HP6・攻撃4・速さ2 | 2 | 6 | 歩兵より強い／MPが重い |
| 竜鱗戦士（`classic_dragon_scale_warrior`） | 兵士 HP6・攻撃6・速さ2 | 3 | 5 | 硬くて強い／遅い・MPが重い |
| 竜槍兵（`classic_dragon_lancer`） | 兵士 HP10・攻撃7・速さ2 | 4 | 2 | とても硬い／MPが重い |
| 竜将（`classic_dragon_general`） | 兵士 HP12・攻撃10・速さ2 | 7 | 1 | いちばん強い兵士／MP7 |
| 紅蓮の竜剣・迅雷の槍 | 武器 攻撃+2・火／雷 | 2 | 各3 | 強い武器／属性が反応を起こさない |
| 灼竜剣・轟雷竜槍 | 武器 攻撃+4・火／雷 | 4 | 各1 | 武器でいちばん強い／MPが重い |
| ファイアボール（`classic_dragon_fireball`） | 城への魔法5（先頭の兵士に当たる） | 3 | 5 | 火球（6・MP4）より軽い／弱い |
| 業火（`classic_dragon_inferno`） | 城への魔法9 | 6 | 2 | 大きい／MPが重い |
| 隕石（`classic_dragon_meteor`） | 城への魔法14 | 9 | 1 | とても大きい／MP9 |
| サンダー（`classic_dragon_thunder`） | 選んだ1レーンの相手の兵士に3 | 4 | 5 | ルミナより強い／MPが重い・属性なし |
| 雷光（`classic_dragon_bolt`） | 相手の全レーンの兵士に2 | 4 | 3 | 全レーンに届く／弱い |
| 大雷（`classic_dragon_big_thunder`） | 相手の全レーンの兵士に5 | 7 | 2 | まとめて倒せる／MP7 |

### 除いたカード（#166 の森83種・竜70種から）
- **今のクラシックのしくみで動かないもの**（#166 で `implemented: false`。森28種・竜44種）：ドルイド（精霊起点の反応）、水・風・土の攻撃魔法（属性連鎖・拡散・拘束）、生命の回復（兵士の回復）、棘の鎧（棘の反撃）、竜騎兵（飛行）、竜術師（火雷の支援）、純竜（武器を持てない制限）、竜の息（城と兵士を同時に・範囲増加）、竜の覚醒（竜威ゲージ）、竜の城壁・鎧・再生（個性・量が未決定）
- **動くが入れなかったもの**：レアリティの高い段（エピック・レジェンドの武器・兵士・魔法、精霊王、火・風・土の大精霊、竜騎士・星降り・終末の炎・雷神の怒り・天罰）は、クラシックの数値の帯に合わないため。根の城柵（城壁5）・葉の衣（盾3）・フレイム（1レーン2）は、王国の城壁・盾・ルミナと効果が同じか、属性だけ違う下位互換になるため
- 森・竜の武器の属性（火・水・風・土・雷）は、クラシックの反応（光・闇・氷・混沌の組）には入っていない。属性の強弱（`elements.json`）だけに効く

### 確かめたこと
- `node --test` 全部通る（`tests/classic-factions.test.js`：山札80枚のまま・書き方・`new Game()` の検証・全32種を1枚ずつ出して効果のイベント・ほかのカードと効果が完全に同じでない・森 vs 竜の試合が決着）。王国の歩兵と魔族の骸骨兵は、このPRより前から同じ数値（テストは森・竜のカードだけを比べる）
- 通常モード（`node tests/sim/run.js --games 100 --seed 1 --json`）・クラシック（`--mode classic --games 100 --seed 1 --match smart,smart`）のシミュレーションは変更前と完全に一致
- 陣営の山札どうし（`deckMode: "own"`、smart 同士、席を入れかえて各400試合。リポジトリの外の計測スクリプト）：全試合決着

| 組み合わせ | 前の陣営の勝率 | 平均手番 | 崩壊の刻で決着 |
|---|---|---|---|
| 森 vs 竜 | 54% | 85 | 13% |
| 森 vs 王国 | 48% | 128 | 60% |
| 森 vs 魔族 | 47% | 75 | 3% |
| 竜 vs 王国 | 59% | 88 | 12% |
| 竜 vs 魔族 | 60% | 50 | 0% |
| 王国 vs 魔族 | 56% | 98 | 17% |

  - 調整：最初の数値では、森が王国に7%・魔族に20%、竜が森に29%だった。森は獣兵・斥候の MP を2→1、ウルフの HP を4→5、斥候4→3枚・蔦の防壁3→4枚。竜は竜槍兵の MP を5→4・3→2枚、サンダー4→5枚。竜はカード1枚で勝率が10%以上動く（竜槍兵の MP だけで、王国に44→62%）ので、変えたら必ず400試合で確かめる
  - **竜は王国・魔族に59〜60%で、目安のふち**。森 vs 王国は崩壊の刻で決着する試合が6割と多い（森の城壁・回復と王国の守りで長引く）。遊んで確かめる
- 画面（UI担当にお願いしたいこと）：陣営のデッキを選ぶ画面（`factionCardSets` を読む）、32種のカードの絵（今は仮の絵もない）、`js/ui/text.js` の説明文（`description` を書いたカードはそれを使える。武器には書いていない）、雷（`thunder`）属性の見た目（`js/ui/look.js` の `ELEMENT_LOOK`）

## 4陣営モード（王国・森の同盟・魔族軍・竜族帝国。人間に確認して決めた。数値はすべて仮）

四大陣営のPR（#163〜#166。まだ main にない。349種）は、カードを取り込みすぎて多すぎたので、**クラシックと同じ作りで組み直した**（人間の指示）。レアリティを使わず、属性の付着と反応を楽しむ。カード表は人間が確定した案（王国15・森14・魔族15・竜13種）のとおり。ただし竜の「竜の鼓動」（竜威）は、竜威のルールが決まっていないので外した（竜は12種）。王国の防御は案どおり身代わり（3MP）で、聖壁の号砲（#176）は入れない。

- **置き場**：`data/factions/`（`factions.json` 陣営の名前と特性（森の常時の精霊 `passiveSpirits`・魔族の `passive`）・`cards/<陣営>.json` 陣営ごとのカード表・`rules.json`・`elements.json`・`reactions.json`）。`data/modes.json` の `factions`（`hidden`・`available: false`）。`cardSet` はなく、`factionCardSets` を全部合わせたものがカード定義、`factionDecks: true` で**各陣営のカード表がその陣営のデッキ**になる（`js/game/Setup.js` の `factionDecks(factions, cardSets)` → decks.json と同じ形）
- **遊び方**：1人1つのデッキ（`rules.deckMode: "own"`）。`new Game({ ..., decks: factionDecks(...), setup: { decks: ["kingdom", "dragon"] } })` で席ごとに陣営を選ぶ（省略すると `rules.defaultDeck` の王国）。テスト・シミュレーションは `tests/helpers.js` の `buildData({ mode: "factions" })`・`loadOptionalData("factions")` で読む。**サーバー対応済み・画面は未対応**：`server/server.js` の `loadData(dir, "factions")` が陣営ごとのカード表を合わせたカード・`decks`（陣営）・`factions`（陣営IDの配列）・属性・反応を読み、`loadModeData()` に `factions` が入る（部屋に入るとき `body.mode: "factions"`）。部屋（`server/rooms.js`）は席ごとに `setSeat` の `faction` で陣営を選び、始まると `setup.decks` に各席の陣営を渡す（2〜8人・CPU を含む）。**チーム戦（`teams`）と、`deckMode` を `own` 以外にすることは `setRules` で断る**（「4陣営ではチーム戦は使えません」）。忍者のイベントを隠す `stealth` は `shieldBroken` にも付く。テストは `tests/factions-server.test.js`。画面は対応済み：ホームの「4陣営モード」から、ひとりで遊ぶ・カジュアル対戦（部屋で陣営を選ぶ）・同じ端末で遊べる（「4陣営モード（ベータ）の入口」）
- **要確認（人間の確認待ち。まだ決めていない）**：①`available: false` のモードに、`/api/join` の `mode` 指定で入れてしまう（今は入れる）②4陣営で城の種類（`castles.json`）を使うか（今は部屋が城の種類を渡している）③4陣営でチーム戦を断るのは仮か恒久か
- **枚数**：案に枚数がないので、**どのカードも2枚**（`count: 2`。王国30・森28・魔族30・竜24枚）にした（仮）
- **ルール**（`data/factions/rules.json`。全モード共通の `data/rules.json` は変えていない）：クラシックのルールのまま（毎ターン2枚ドロー固定 `drawPerTurn` 2・`drawUntilHand` 0・`drawPerPlayed` false、手札上限6、全カードで MP を使う `mpAllCards`、MP 10/20・毎ターン+3、城HP60、城への魔法は先頭の兵士に当たる、崩壊の刻）に、`deckMode: "own"`・`defaultDeck: "kingdom"` を足し、使わないデッキ編成の数値を外した
- 属性の強弱の表はクラシックと同じ9属性（`data/factions/elements.json`。写し）

### カード（`data/factions/cards/*.json`。キーは `fac_king_*` / `fac_forest_*` / `fac_demon_*` / `fac_dragon_*`）
| 陣営 | 兵士 | 武器 | 魔法 | 回復・防御・特殊 |
|---|---|---|---|---|
| 王国 | 歩兵 3/5/2（MP2）・騎兵 4/4/3（3）・弓兵 3/3（3）・重装兵 2/9/1（4）・**勇者 10/14/2 光・切り札（5）**・聖術師 2/4 魔法使い・光（4） | 聖鉄の剣 +2光（2）・ルミナスランス +1光・射程+1（2）・**神剣 +9光・切り札（5）** | ルミナ 1レーンに2・光（3）・ホーリーレイ 1体に5・光（4） | ヒール 10（4）・盾 3（1）・**神盾 盾15・状態異常無効・切り札（5）**・城壁 5（2）・身代わり（3）・浄化（2）（小回復は外した。下の「王国の光の先制と切り札」） |
| 森 | 獣人 4/5/2（2）・エルフ 3/3 弓兵（3）・ドルイド 2/4 魔法使い・火水風土の魔法+1（4） | フレイムソード +1火・アクアスピア +1水・ゲイルボウ +1風・アースハンマー +1土（各2） | フレアシード 1体に4・火・スプリングウェーブ 1体に3・水・付着8回・リーフストーム 1レーンに2・風・ルートバインド 1体に3・土・1回休み（各3。いったん2にしたが人間の指示で3に戻した） | 生命の雫 城+3・兵士+2（3）・茨の壁 4（2）・樹皮の盾 3（1）。精霊はカードではなく陣営の特性（下の「森の常時の精霊」） |
| 魔族 | 骸骨兵 3/5/2 闇（2）・小悪魔 4/3/3 闇（2）・呪術師 2/3 魔法使い・闇氷混沌の魔法+1（3） | シャドウサイズ +2闇・フロストブレード +1氷・当てた相手を1回休み・カオスロッド +1混沌・吸命の剣 +1・与えたダメージの半分で自城回復（各2） | シャドウ 先頭の兵士に4・闇・氷の息 1レーン凍結1・氷・カオスパルス 先頭の兵士にランダム属性で3・混沌が付く・毒の霧 相手の城に毒2×4回（城だけ。下の「魔族の強化（第2弾）」）（各3）・呪いの印 手前3体に−2×2（2）・脆弱 相手の城の被ダメージ+25%（3）・血の契約 自城HP6で兵士2体に攻撃+3（3）・封魔 相手のMP回復−1×2（2）・魂の欠片 城に3・自城+3（3）・残響の魂 蘇生（4） | 血の膜 城壁4（2）・骨の盾 3（1） |
| 竜 | 竜人の新兵 4/5/2（3）・竜騎兵 5/3/3（3）・幼炎竜 5/5/2 火（4）・幼雷竜 4/4/3 雷（4） | 竜牙剣 +2火・雷牙槍 +2雷・射程+1（各2） | ファイアボール 5・火（先頭の兵士か城。3）・雷光 1レーンに3・雷（3）・火炎の吐息（4） | 竜血の雫 兵士1体+4（2）・火山灰の幕 城壁3（2）・幼竜の鱗 盾2（1） |

（兵士は 攻撃/HP/速さ。括弧は MP）

### 4陣営のために足した仕組み（どれもデータで切り替える。書かなければ今までどおり）
- **生まれつきの属性**（兵士の `innateElement`）：出した兵士の属性になる（武器の属性と同じ扱い。武器を持つと上書き、反応で消える）。兵士の `element` は今までどおり書けない
- **射程+**（武器の `rangeBonus`。重ねると足し算）：弓兵・魔法使いは撃てる距離がのびる。**進む兵士は、1マスより先（1＋射程+ マスまで）の相手を、止まって突く。相手の攻撃は届かないので反撃を受けない**（`fight` の `reach`。攻める側の `soldierDamaged` は出さない）。すぐ前（同じマスか1つ先）に魔物がいるときは、魔物を飛び越えて突けない（ふつうに魔物と戦う）
- **凍らせる武器**（武器の `freezeOnHit`）：その兵士の攻撃（戦い・射撃）が当たって生き残った相手は、その回数休む（付着・反応のあと）
- **属性魔法の強化**（兵士の `spellBoost: { elements, amount }`）：その兵士が場にいるあいだ、持ち主の、その属性のダメージの魔法（1体へ・ランダム属性（カードの属性で見る）・兵士全員へ・城への魔法・火炎の吐息）が +amount（何体いても重ならない）
- **付着の長い魔法**（魔法の `attachTurns`）・**休ませる1体への魔法**（`singleDamage` の `freezeTurns`）
- **風の精霊の足し算**（`spiritMode: "add"`。省略すると `"min"`＝今までの「速さの最低値」。森の精霊のカードをなくしたので、今の4陣営のカードは使っていない）
- **回復**：`healSoldier`（竜血の雫。傷ついた自分の兵士1体。対象 `{ soldierId }`）・`healCastleAndSoldiers`（生命の雫。`amount` と `soldierHeal`）。兵士の回復は最大HPまで。イベント `soldierHealed`
- **身代わり**（防御 `guardCastle`。対象は自分の兵士 `{ soldierId }`。自分のターンに何枚でも）：次に城が受ける**相手からの攻撃**（兵士・魔法・精霊・反応）を、その兵士が代わりに受ける（盾は効く。城壁は使わない。土の精霊は効く）。1回で消える。守る兵士が場からいなくなったとき（倒れた・城に着いた・帰った）も消える。城に1体だけ（置き直すと入れかわる）。毒・崩壊・天候・自分で払うコストは受けない。守る兵士がもういなければ、城がそのまま受ける。攻撃を受けたときの防御（`defend`）には出せない。イベント `castleGuardSet` / `castleGuarded`（このあと兵士の `soldierDamaged`、`cause: "guard"`）
- **浄化の付着消し**（`purifyFlare` の `clearEnemyAttachments: true`。このときは `amount` 0 も書ける）：相手の兵士の付着を全部消す（武器・生まれつきの属性は残る。`elementCleared` の `reason: "purified"`）
- **先頭に当たる1体への魔法**（`singleDamage` / `randomElementDamage` の `target: "front"`）：兵士を選ばずに、相手（レーンが2本以上なら道も。対象は `{ playerId }` / `{ playerId, roadId }`）を選び、その道の、自分の城にいちばん近い見える兵士に当たる（`frontSoldier`。城への魔法の `castleSpellHitsFront` と同じ選び方）。その道に兵士がいなければ出せない（城には当たらない）。当たり方・防御・イベントは、兵士を選んだときと同じ。竜のファイアボールは城への魔法（`castleSpellHitsFront` で先頭の兵士に当たり、いなければ城に当たる）
- **土の精霊を兵士だけに**（`spiritScope: "soldiers"`。省略すると `"all"`＝城と兵士。今の4陣営のカードは使っていない）
- **回数つきの毒**（`poisonEnemy` の `turns`。書かなければ `rules.poisonTurns`。今の4陣営のカードは使っていない。毒の霧は兵士だけのターン数つきの毒 `poisonEnemySoldiers`）
- **血の膜**（城壁の `bloodArmor: true`）：増えた城壁のぶんが「血の膜」。城壁が攻撃を受けたとき、血の膜のぶんから先に削れ、削れた量だけ城HPが回復する（`castleHealed` の `source: { kind: "bloodArmor" }`）
- **火炎の吐息**（`breathAttack`：`amount`・`castleAmount`。対象は相手（レーンが2本以上なら `{ playerId, roadId }`）。攻撃の魔法）：選んだ道の相手の兵士全員に amount、相手の城に**城壁を無視して** castleAmount（`castleDamaged` の `ignoreArmor: true`）。防御は聞かない。霧で外れる
- **反応の追加の効果**（`reactions.json` の反応に書ける。チェックは `validateReactions`）：`multiplier`（当たった攻撃のダメージ × (倍率−1) を切り上げで足す）・`burn`（やけど。`scope: "adjacent"` なら同じ道の前後1マスの同じ陣地の兵士にも）・`slow`（鈍足：速さ −amount、最低1）・`blind`（目くらまし：戦い・射撃が chance で外れる）・`splash`（同じ道の同じ陣地のほかの兵士に amount）・`castleDamage`（当たった兵士の陣地の城に。城壁は受ける。`source: { kind: "reaction", reaction }`）・`shieldBreak`（盾を全部壊して、壊した量＋bonus のダメージ。`shieldBroken`）・`healCut`（当たった兵士の陣地の城の回復が ratio だけ減る（切り捨て）。城の持ち主のターンの始めに1減る。`castleHealCut` / `castleHealCutEnded`）。鈍足・目くらましは持ち主の進軍が終わるたびに1減る（`statusApplied` / `statusCleared` の `status` は `"slowed"` / `"blinded"`）
- 順番（反応）：`reactionTriggered` → `elementCleared` …（→ 砕氷の `statusCleared`）→ 溶岩の `shieldBroken` → 追加ダメージの `soldierDamaged` → 生き残れば 凍結・やけど・鈍足・目くらましの `statusApplied` → splash の `soldierDamaged` → `castleHealCut` → `castleDamaged`
- `getState()`：兵士に `rangeBonus`（1以上のときだけ）。反応に鈍足・目くらましがあるゲームだけ `statuses.slowed` / `statuses.blinded`。カード・反応にあるゲームだけ `players.pX.castleGuard`（身代わりの兵士のID か null）・`bloodArmor`（血の膜の残り）・`castleHealCut`（`{ ratio, turns }` か null）。今までのモードの `getState` の形は変わらない
- 進軍中の戦い・射撃の反応で城が落ちたら（轟雷爆炎）、そこで止める（反応のないゲームでは今までどおり）
- 忍者：`soldierHealed` / `castleGuardSet` / `shieldBroken` も、忍者の兵士なら `stealth` が付く（ほかの忍者のイベントと同じく相手に隠す）。**`castleGuarded` は `stealth` を付けず**、城が攻撃を受けなかったことは相手にも送る。忍者が身代わりのときだけ `stealthSoldier`（持ち主の陣地）が付き、`visibility.js` が同じ陣地でない人には `soldierId` と `stealthSoldier` を消す（このあとの `soldierDamaged` は `stealth` つきで隠れる）

### 王国の光の先制と切り札（人間と決めた。数値はすべて仮）
- **光の先制**（`rules.lightFirstStrike: true`。`data/factions/rules.json` だけに書いた。省略すると `false`）：光の兵士（生まれつき光・光の武器で光になった兵士。今の `element` が `"light"`）が兵士と戦うとき、自分の攻撃のダメージ（属性の強弱・夜・背水・呪い・ステージ・土の精霊など、戦いで実際に与える量）が相手の HP＋盾 以上なら、**相手の反撃を受けない**。**攻める側（進軍している側）だけ**に効く。守る側（攻められて戦うとき）は、光の兵士でもふつうの同時ダメージ（最初は両方に効かせたが、人間の指示で攻める側だけにした。両方が光のときも、先制するのは攻める側）。霧・目くらましで光の側が外れたら、ふつうの戦い。射撃・魔物との戦いは変えていない
  - イベントは今までのまま：先制したとき、攻める側の `soldierDamaged`（`cause: "fight"`）を出さない（突きと同じ）。守る側の攻撃による付着・反応・凍らせる武器も起きない。判定は `Game.fight` の1か所（`firstStrikes`）
- **切り札**（王国。レアリティなし・デッキに1枚まで（`count: 1`・`maxCopies: 1`。`factionDecks` が count が maxCopies を超えるとエラーにする）・MP5）：神剣（`fac_king_god_sword`。武器・光・攻撃+9）／勇者（`fac_king_hero`。兵士・光・HP14・攻撃10・速さ2。`noRevive: true`：倒れても蘇生の記録に残らない）／神盾（`fac_king_god_shield`。盾15・`statusWard: true`：盾が残っている間、その兵士は状態異常（毒・凍結・やけど・呪い・鈍足・目くらまし・砂・凍傷）を受けない。付着は付く。ダメージ反射はなし。`getState()` の兵士に `statusWard: true`（効いているときだけ））
- 守りが厚くなりすぎないよう、王国から**小回復を外した**（15種 → 17種・31枚）。光の反応は対消滅だけのまま
- **光の触媒**（実験用。`rules.lightCatalyst`：0以上の整数。省略すると0＝使わない。どのデータにも書いていない）：光の攻撃が当たったとき、反応が起きず、兵士に光以外の属性（武器・生まれつき・付着）があれば、それを全部消して1種類ごとに lightCatalyst の追加ダメージ（反応と同じイベント。`reactionTriggered` の `reaction` は `"lightCatalyst"`。光は付着しない）
- シミュレーション：`node tests/sim/factions.js --with kingdom`（王国とほかの陣営だけ）・`--rules` / `--cards` / `--decks`（`data/` を書き換えずに試す）
- **CPU**（`js/game/strategies.js` の `playTrumps`。smart・guard だけ。カードの `trump: true` で見分けるので、ほかの陣営・モードの CPU は変わらない）：ターンの最初（とメインのあと）に、MP が足りれば切り札を先に出す。勇者は兵士としていちばん先に。神剣は武器を持っていても重ねて、進む兵士（勇者がいれば勇者）のいちばん前の兵士に。神盾は、次の進軍で城に着きそうな兵士か、同じ道の2マス以内に HP＋盾 を削り切れる相手の兵士がいる兵士（攻撃力の高い方）に
- 確かめたこと（`node tests/sim/factions.js --games 200 --with kingdom --spirit-every <1|2>`、シード1、smart 同士・席を入れかえて各400試合。先制は攻める側だけ・CPU は切り札を出す）：全試合決着。王国の勝率（括弧は平均手番・崩壊の刻で決着した割合）

| 王国 | 森（精霊 毎ターン） | 森（精霊 2ターンに1回） | × 魔族 | × 竜 |
|---|---|---|---|---|
| 変更前 | 12%（101・25%） | 58%（118・51%） | 64%（109・34%） | 46%（115・45%） |
| 先制＋切り札（神剣+9） | 27%（79・7%） | 69%（90・18%） | 67%（94・19%） | 60%（88・16%） |
| 先制＋切り札（神剣+6） | 27%（79・8%） | 70%（90・18%） | 66%（94・20%） | 59%（89・17%） |

  - 1試合あたり（神剣+9、森は毎ターン）：勇者 森1.67・魔族1.97・竜1.86回、神剣 0.55・0.80・0.65回、神盾 0.26・0.46・0.38回、先制 1.14・1.82・3.19回（1枚ずつでも、捨て札から山札に戻るので2回以上出ることがある）
  - 森にはまだ負け越し（精霊が毎ターンなら27%）。魔族・竜には勝ち越し（59〜67%）。神剣の +9 と +6 の差はほとんどない。数値は人間と決める
- **凍結している兵士は、氷が付着している扱い**（`rules.frozenCountsAsIce`。人間の指示。数値・細部は仮。省略すると `false`＝今までどおり。4陣営の `data/factions/rules.json` だけ `true`。通常モード・クラシックは変えない）
  - 反応の判定（`findReaction`）で、凍結中（`frozen > 0`）の兵士には氷（`ice`）が付いているものとして数える。実際の `attachments` に氷は足さない（判定用の仮想の付着）。武器・付着・凍結の氷は**種類としては1つの `ice`**（二重に数えない）。混沌反応の「3種類以上」にも凍結由来の氷を数える（すでに `ice` があれば増えない）
  - 氷が反応で使われると（黒氷・砕氷・氷を含む組・混沌反応の `consumed` に `ice`）、**凍結も解ける**（`statusCleared` の `frozen`）。実際の氷の付着・武器の氷があれば、今までどおりそれも消える（`elementCleared`）。**凍結由来の氷だけのときは `elementCleared` を出さない**（`reactionTriggered.consumed` には `ice` が入る）。黒氷は、生き残れば凍結1回が付き直す（今までどおり）。砕氷の「凍結中なら +6」も今までどおり
  - `getState().reactions.frozenCountsAsIce`：有効なときだけ `true`（CPU が読む）。CPU の `canReact`（`js/game/strategies.js`）は、これが `true` のとき `statuses.frozen > 0` の兵士に氷が付いているものとして、反応を起こせる武器を選ぶ。無効なら今までどおり
  - テスト：`tests/frozen-ice.test.js`

### 森の常時の精霊（人間の指示。元の案・統合仕様書から変えた。数値は仮）
元の案は「精霊4種を召喚するカード（火 城に1×3・水 城+1×3・風 速さ+1×3・土 ダメージ−1×3）」で、統合仕様書は「召喚中の精霊の属性は先行付着属性の代用」だった。**人間の指示で、精霊はカードではなく、森の陣営にいつもいる特性に変えた**（精霊のカード4枚はなくし、属性の武器4枚に入れかえた。森は14種のまま）。

- **置き場**：`data/factions/factions.json` の森の `passiveSpirits`（`{ attachTurns, everyTurns?, spirits: [{ spirit, name, element, effect, amount, ignoreArmor?, push? }] }`。`ignoreArmor: true` は城壁を無視する（仕組みは残してあるが、今の精霊は使っていない））。`factionDecks` がデッキに写し、Game は席のデッキの `passiveSpirits` を読む（チェックは `js/game/Setup.js` の `validatePassiveSpirits`）。書かない陣営・モードは今までどおり
- **いつ**：自分のターンの始め（コイン・MP の回復のあと、ドローの前。`randomAttachTurnStart` と同じ位置）に、`spirits` の順（火 → 水 → 風 → 土 → 火 …）に1体ずつ動く（1ターン目は火）
- **動く間隔**（`everyTurns`。省略すると1＝毎ターン。**今のデータは2**（人間の指示で 1 → 2。2ターンに1回））：自分の `everyTurns` ターンに1回だけ動く。1ターン目に動き、間の自分のターンは休む（イベントなし）。順番は動いたときだけ1つ進む。`getState()` の `passiveSpirit.turnsUntilAct` で、次に動くまでの自分のターンの数が分かる

| 精霊 | 属性 | 効果（`effect`） |
|---|---|---|
| イフリート | 火 | 敵城に2（`castleDamage`。城壁が先に受ける。最初は3だったが、森が強すぎたので人間の指示で下げた） |
| ウンディーネ | 水 | 敵の見える兵士全員に1（`soldiersDamage`。盾が先に受ける） |
| シルフ | 風 | 敵の先頭の見える兵士（自分の城にいちばん近い。同じなら先に出された方）を1マス押し戻し（マス0より後ろには下がらない）、2（`pushFront`。盾が先に受ける） |
| タイタン | 土 | 敵城に5（`castleDamage`。城壁が先に受ける。最初は10・城壁を無視だったが、森が全勝したので人間の指示で 7 → 5 と下げた） |

- 城を攻める相手は、まだ負けていない相手の陣地のうち席順で最初の陣地（2人なら相手。3人以上の選び方は仮）。**防御は聞かない**。身代わりは受ける（`source.kind: "passiveSpirit"`）。霧で外れない。土の精霊のカードのような軽減は、城の持ち主のものが効く（今の4陣営にはない）
- **付着**：動いた精霊の属性が、**敵の見える兵士全員**に `attachTurns`（1）回付く（クラシックの `randomAttach.turns: 1` と同じ考え方。持ち主の進軍が終わると消える。同じ属性がもう付いていれば、残りは長い方）。**付いたときには反応しない**。そこに森の別属性の魔法・武器が当たれば反応する。`reactions` を渡さないゲームでは付着しない
- 敵の兵士がいなければ、水・風は何もしない（付着もなし。`passiveSpiritActed` は `soldierIds: []` で出る）。火・土の城ダメージは、兵士がいなくても入る。忍者（見えない兵士）は対象にならない
- 精霊のダメージで城が落ちたら、そこで決着（ドローしない）
- イベント `passiveSpiritActed`、`getState().players.pX.passiveSpirit`（「ロジックとUIの約束」）。カードの精霊（`summonSpirit`）の仕組みは、ほかのモードが使うので残してある

### 魔族の死者を従える（人間の指示で足した。数値は仮）
魔族の固有能力（パッシブ）。魔族の兵士が敵の兵士を倒すと、**骸骨兵**が魔族の城の前に1体生まれる（敵そのものを奪うのではなく、固定の弱い兵士。強い敵を奪って雪だるまになるのを避けるため）。

- **置き場**：`data/factions/factions.json` の魔族の `passive.raiseOnKill`（`{ soldier: { name, hp, attack, speed, element? }, perTurn }`。今は骸骨兵 HP2・攻撃2・速さ2・闇、`perTurn` 1）。`factionDecks` がデッキに写し、Game は席のデッキの `passive` を読む（チェックは `js/game/Setup.js` の `validatePassive`。書き間違いは `new Game()` が例外）。書かない陣営・モードは今までどおり
- **起きるとき**：魔族の陣営の兵士が、**戦い（`soldiersClashed`）か射撃（弓兵・魔法使いの `soldierShot`）**で、敵の兵士のHPを0にしたとき。攻める側・守る側は問わない。魔法・毒・凍傷・やけど・天候・反応などで倒れたときと、魔物を倒したときは起きない。忍者・暗殺者は戦いも射撃も受けないので、倒して生まれることはない（骸骨兵のイベントは見えない兵士のものではなく、どちらの陣地にも送られる。位置が漏れることはない）
- **歯止め**：①1ターン（通算 `turn`）に `perTurn` 回まで ②**骸骨兵（トークン）が倒した敵では起きない**（連鎖を断つ） ③生まれた骸骨兵は、倒れても蘇生（`reviveFallen`）の「最後に倒れた兵士」の記録に残さない ④出したターンは動かない（兵士を出したときと同じ）
- **生まれる場所**：倒した魔族の兵士の道（`roadId`・`targetId`）の、魔族の城の前（position 0）。広場・チーム戦も、倒した兵士の道に合わせる（兵士を出す処理と同じ）。骸骨兵の攻撃・HP は固定（兵舎・訓練・鍛錬は乗らない）
- **イベント**：`soldierDeployed`（`raised: true`、`type: "raisedSoldier"`、`name`）。新しいイベントはない。`getState()` の兵士には、骸骨兵のときだけ `token: true`・`name`・`speed` が付く（カードではないので `type` は `cardDefs` にない。画面は `name` を出す）
- CPU：変更なし（自動で起きる。`js/game/strategies.js` は、骸骨兵の速さを兵士の `speed` から読む）
- テスト：`tests/demon-raise.test.js`

### 魔族の強化（第2弾。人間の指示。数値はすべて仮）
魔族の勝率が低い（3〜4割）ので、人間が決めた魔族のカード・特性の変更。どれも `data/factions/` に書き、書かないモード・陣営は今までどおり（通常モード・クラシックは変わらない）。CPU は `js/game/strategies.js` の smart 系で、魔族のカード（`fac_demon_*`）だけ動きを足した。テストは `tests/demon-cards.test.js`。

- **毒の霧**（`fac_demon_poison_mist`。`effect: "poisonEnemyCastle"`：`amount`・`turns`・`maxTurns`。今は 2・4・8、MP3）：相手の**城だけ**を毒にする（兵士の毒はなくした）。城の持ち主のターンの始めに `amount`（今までの城の毒 `castle.poison` / `poisonTurns` と `tickCastlePoison` を使う。城壁・土の精霊・盾・身代わり・魔の血は効かない）。**重ねがけは、量は増やさず（大きい方）、残りの回数に `turns` を足す（`maxTurns` まで。永続にはしない）**。もう `maxTurns` まで続く城は選べない（「その城の毒はもう上限まで続きます」）。霧で外れず、防御も聞かない。王国の浄化（`purifyFlare`）で治る。イベントは今までの `castlePoisoned`（`turns` が付く）・`castleDamaged`（`source.kind: "poison"`）・`castleCured`。CPU：ほかの魔法がないとき（最後の優先リストの終わり）、相手の城の毒が切れそう（残り1回以下）なら出す
- **呪いの印**（`fac_demon_curse_mark`。`weakenAttack` に `soldiers` を書く。今は `amount` 2・`turns` 2・`soldiers` 3、MP2）：兵士ではなく**相手を選び**、その相手の、まだ呪われていない見える兵士のうち**自分の城に近い順**（`position` が大きい順。同じなら先に出された方。道はまたぐ）に3体の攻撃 −2（最低1）。持ち主の進軍2回で治る（今までの呪いと同じ数え方）。**同じ兵士に重ねがけしない**（呪われている兵士は数えず、全員呪われていれば出せない）。神盾の兵士も数えない。`spellCast` は1回、兵士ごとに `statusApplied`（`weakened`）。霧で外れず、防御も聞かない。`soldiers` を書かない呪い（クラシック）は今までどおり。CPU：呪われていない相手の兵士が2体以上か、攻撃4以上の兵士がいれば出す
- **脆弱**（新カード `fac_demon_vulnerable`。魔法・`effect: "vulnerableCastle"`：`ratio`・`maxRatio`・`turns`・`maxTurns`。今は 0.25・0.5・3・6、MP3）：相手の城が**相手からの攻撃**（兵士・魔法・精霊・反応。身代わりと同じ種類）で受けるダメージが `ratio` 増える（切り上げ。増える量は `maxRatio` の割合（切り捨て）まで。1ダメージは増えない）。毒・崩壊・天候・自分で払うコストには効かない。増やしてから土の精霊・魔の血で軽くする。残りは**城の持ち主のターンの始めに1減る**（深淵侵食と同じ数え方。3なら自分の進軍2回に効く）。**重ねがけは割合を増やさず、残りに `turns` を足す（`maxTurns` まで）**。上限まで脆弱な城は選べない。霧で外れず、防御も聞かない。イベント `castleVulnerable`（`playerId`・`ratio`・`turns`）/ `castleVulnerableEnded`（`playerId`）、`castleDamaged` に `vulnerable`（増えた量。増えたときだけ）。`getState().players.pX.castleVulnerable`（`{ ratio, maxRatio, turns }` か null。このカードがあるゲームだけ）。CPU：自分の進む兵士が相手の城の手前2マス以内にいるか、相手の城HPが半分以下のとき
- **闇の侵食**（魔族の特性。`data/factions/factions.json` の魔族の `passive.darkErosion`：`{ element, ratio, turns, maxTurns? }`。今は 闇・0.25・2・4）：その陣営の **`element`（闇）の攻撃**（闇の兵士（生まれつき・シャドウサイズ）が城に着いた・闇の魔法使いの射撃・闇の魔法（撃った人は手番の人））が**敵の城に当たると**（城壁が全部受けても。身代わりが受けたら起きない）、その城の回復量が `ratio` 減る。深淵侵食（反応）と同じ `castle.healCut` を使い、残りは城の持ち主のターンの始めに1減る（`turns` 2 で相手の次の1ターンに効く）。**重ねがけは割合を増やさず、残りに `turns` を足す（`maxTurns` まで）**。もっと強い回復量減少（深淵侵食の半分）がかかっていれば、割合はそのまま、残りは長い方にそろえる（深淵侵食は強化版として残す）。イベントは `castleHealCut`（`source: "erosion"`）。チェックは `validatePassive`
- **魔の血**（魔族の特性。`passive.magicBlood`：`{ spellReduce, mpBonus }`。今は 1・1）：①魔族の兵士・城が**攻撃魔法のダメージ**（兵士は `spellHit` で当たる魔法、城は `castleDamaged` の `source.kind: "spell"`。反射された魔法も）を受けるとき −`spellReduce`（最低1。0はそのまま。土の精霊の軽減と同じ形で、脆弱・土の精霊のあと）。毒・反応・精霊・兵士同士の戦い・射撃は軽くしない（身代わりの兵士が受けるときも軽くしない）。②自分のターンの始めの MP の回復が `rules.mpPerTurn` ＋`mpBonus`（今は 3 → 魔族だけ 4）。ほかの陣営は変えない。チェックは `validatePassive`
- **血の契約**（新カード `fac_demon_blood_pact`。魔法・`effect: "bloodPact"`：`selfDamage`・`amount`・`soldiers`。今は 6・3・2、MP3）：自分の城HPを `selfDamage` 払って（城壁・土の精霊・魔の血・脆弱は通さない。`castleDamaged` の `source: { kind: "self" }`）、**自分の城に近い順**（`position` が小さい順。同じなら先に出された方）に自分の兵士 `soldiers` 体の攻撃を +`amount`（兵士の攻撃力そのものが上がるので、その兵士が消えるまで。`soldierBuffed`）。対象は自分（`{ playerId }`）。**城HPが `selfDamage`+1（7）以下・自分の兵士がいないときは出せない**（理由を返す）。CPU：自分の城HPが半分より多く、自分の兵士が2体以上いるとき（最後の優先リスト）
- **封魔**（新カード `fac_demon_mana_seal`。魔法・`effect: "sealMp"`：`amount`・`turns`・`maxTurns`。今は 1・2・4、MP2）：相手（プレイヤー）の**自分のターンの始めの MP 回復**が −`amount`（0より少なくはしない）。残りはかけられた人のターンの始め（MP の回復のあと）に1減る（`turns` 2 なら回復2回ぶん）。**重ねがけは量を増やさず、残りに `turns` を足す（`maxTurns` まで）**。上限まで封じた相手は選べない。霧で外れず、防御も聞かない。イベント `mpSealed`（`playerId`・`amount`・`turns`）/ `mpSealEnded`（`playerId`）。`getState().players.pX.mpSeal`（`{ amount, turns }` か null。このカードがあるゲームだけ）。CPU：まだ封じていない相手に（最後の優先リストの終わりのほう）
- **吸命の剣**（新カード `fac_demon_drain_blade`。武器・`attackBonus` 1・`lifesteal` 0.5・属性なし、MP2）：武器の `lifesteal`（0より大きく1以下。重ねると大きい方）。その兵士の攻撃が**敵の兵士（戦い・射撃）か城（着いた・魔法使いの射撃）に当たると**、減らしたHP（盾・城壁が受けたぶんは数えない）× `lifesteal`（切り捨て）だけ持ち主の城が回復する（回復量減少は効く）。持っていた兵士が相打ちで倒れても回復する。イベント `castleHealed`（`source: { kind: "lifesteal", soldierId }`）。CPU：ほかの武器と同じ（まだ武器のない、いちばん前の兵士）
- **混沌を使いやすく（案A）**：①**カオスロッド**（`fac_demon_chaos_rod`）に `attachRandomElement: true`（武器か兵士に書ける）：その兵士の攻撃（戦い・射撃）が当たって生き残った相手に、混沌（武器の属性）の付着・反応のあと、**火・水・風・土のうちランダムな1つも付ける**（反応は起こさない。`elementAttached` の `source: "chaos"`。同じ属性がもう付いていれば残りは長い方）。準備1手で、相手の属性（生まれつき・武器）＋混沌＋ランダムの3種類がそろい、次の攻撃で混沌反応が起きやすくなる。乱数はこのフラグの兵士が当たったときだけ使う。②混沌反応のダメージを `reactions.json` の `chaos.damagePerElement` 4 → **3**×種類（城に起きた混沌反応の `castleDamagePerElement` は4のまま）。③`chaos.attachTurnsMultiplier`（1以上の整数。省略すると1）：混沌が付着したときの残りを2倍（兵士は `attachTurns` 5 → 10、城は `castleAttachTurns` 4 → 8。城の付着（`castleAttach`）は有効にしたので、混沌の攻撃は城にも付く）。カオスパルス（`randomElementDamage`）は、当たった兵士に付くのは今までどおり混沌だけ（撃つ属性は付かない）

### 砂・凍傷（反応の継続ダメージ。人間の指示）
- 砂嵐・黒氷の「やけど」は不自然だったので、やけどとは別の状態にした：反応の `dot: { status: "sand" | "frostbite", amount, turns }`（チェックは `validateReactions`）
- 持ち主の進軍の前（やけどのあと）に `amount` ダメージ（**盾は効かない**。`soldierDamaged` の `cause` は `"sand"` / `"frostbite"`）。回数が来たら治る（`statusCleared`）。重ねがけは量・回数を大きい方にそろえる。生き残ったときだけかかる。王国の浄化（`purifyFlare`）で治る（仮）
- `getState()` の兵士の `statuses.sand` / `statuses.frostbite`（`{ amount, turns }` か null。反応に dot があるゲームだけキーを足す）。イベントは `statusApplied` / `statusCleared`（`status: "sand"` / `"frostbite"`）

### 城の付着と反応（試作。人間の案。数値はすべて仮）
兵士は2〜3ターンで消えるので、兵士の反応が勝敗にほとんど効かなかった。**残り続ける城に属性を付けて、反応を勝敗に効くものにする**ための試作（人間の案：城が燃える・水没する・風が吹く）。`data/factions/rules.json` の `castleAttach`（**今は `true`**（人間の指示で `false` → `true`。`node tests/sim/factions.js --games 20 --seed 1` で城の反応が1試合0.03〜0.42回起きることを確かめた）。切って測るときは `--rules '{"castleAttach":false}'`）。書かなければ・`false` なら今までどおり（通常・クラシックは変わらない。`reactions` を渡さないゲームでも起きない）。

- **付着**：城（チーム戦は城の持ち主の城）に属性が付く。原因：①属性つきの魔法が城に当たった（カードの `element`。城壁が全部受けても付く。霧で外れたら・身代わりが受けたら付かない。反射された魔法は撃った人の城に付く）②属性つきの兵士が城に着いた（兵士の `element`＝武器か生まれつきの属性。防御（身代わりのカード）で無効にされたら付かない）③魔法使いの射撃が城に当たった（②と同じ）。属性なしは付かない。種類ごとに1つ（同じ属性なら残りは長い方）。残りは `rules.castleAttachTurns`（仮：4）で、**城の持ち主のターンの終わりに1減り、0で消える**（`castleElementCleared` の `"expired"`）
- **反応**：城に付いている属性に、別の属性が当たると、`reactions.json` の表（兵士と同じ決まり。混沌反応も同じ）で反応する。1回の当たりで1反応。付いていた属性は消え、当たった属性は付かない。**同じ城で起きる反応は1周回に `rules.castleReactionPerRound`（仮：1。0 は上限なし）回まで**（上限のあとは反応せずに付着する）
- **効果**：反応の `castle: { damage, armorBreak? }`（仮：対消滅8・黒氷4・深淵侵食4・砕氷3・蒸発4・泥2・炎拡散3・砂嵐2・霧2・溶岩4（その前に城壁を追加で2削る）・轟雷爆炎6）、混沌反応は `chaos.castleDamagePerElement`（仮：4）× 種類。書かなければ兵士用の `damage`。ダメージは城壁が先に受け、**身代わり・土の精霊・防御カードは効かない**（`castleDamaged` の `source: { kind: "reaction", reaction }`）。`healCut`（深淵侵食）は城にも効く。兵士用の効果（凍結・やけど・鈍足・目くらまし・倍率・`castleDamage` など）は城には使わない（兵士に当たったときは今までどおり。轟雷爆炎の `castleDamage` 3 は兵士に起きたときだけ）
- **森の精霊の付着先**（`passiveSpirits.spiritAttachTo`。実験用）：`"soldiers"`（省略したとき。敵の見える兵士全員）か `"castle"`（敵の城（席順で最初の陣地）に、精霊の属性を `attachTurns` 回付ける。反応は起こさない。`castleAttach` のときだけ。兵士には付けない）
- イベント `castleElementAttached` / `castleElementCleared` / `castleReactionTriggered`、`getState().players.pX.castleAttachments`（「ロジックとUIの約束」）。オンラインでも隠さない。順番：当たりの `castleDamaged` → `castleElementAttached` か `castleReactionTriggered` → `castleElementCleared` …（→ `castleHealCut`）→ `castleDamaged`（反応）
- CPU：付着を狙う選び方は足していない（自動で起きる分だけ）
- 確かめたこと（`node tests/sim/factions.js --games 200 --seed 1 --spirit-every 2`。森の `everyTurns` を2にして測った。各組み合わせ400試合・smart 同士）：全条件で4000/4000決着。陣営の平均勝率（王国・森・魔族・竜）は、なし 56%・53%・38%・53%／あり 54%・54%・38%・55%／あり＋精霊を城に 57%・48%・39%・56%。**城の反応は1試合0〜0.63回、反応で城に入ったダメージは城への総ダメージの0〜2.4%で、勝敗をほとんど動かさない**。ほとんどが竜×竜・竜の相手の轟雷爆炎（竜は火と雷を両方持つ）。属性つきの攻撃が城に当たるのは1試合に約5回（兵士3.2・魔法2.0）だが、1つの陣営の属性は偏っていて、同じ城に別の属性が当たる組がまれなため（城への魔法は先頭の兵士に当たる `castleSpellHitsFront` も効いている）。1周回1回の歯止めに止められた反応は0回。先に城で反応した側の勝率は54〜81%（回数が少ない）
- 未決：数字だけでは効果が小さい。効かせるなら、相手の属性を城に付ける手段（精霊・魔法）、城への魔法が先頭の兵士に当たる決まりとの関係、付着を狙う CPU を人間と決める

### 未実装・人間の確認待ち
- 身代わりが魔物の城への攻撃を受けるか（今は受けない）、身代わりがいるときにも城への攻撃で防御（城壁など）を聞くか（今は聞く）：要確認

### 反応（`data/factions/reactions.json`）
| 反応 | 組 | 効果（仮） |
|---|---|---|
| 対消滅 | 光＋闇 | 追加8（王国の光が魔族の闇に当たったとき） |
| 黒氷 | 闇＋氷 | 追加3・凍結1・凍傷1×2（継続ダメージ。盾は効かない） |
| 深淵侵食 | 闇＋混沌 | 追加3・城の回復が半分×2ターン |
| 砕氷 | 氷＋混沌 | 追加2（凍結中なら+6して凍結が解ける） |
| 蒸発 | 火＋水 | 当たったダメージの1.5倍 |
| 泥 | 水＋土 | 鈍足1×2 |
| 炎拡散 | 風＋火 | やけど1×2（となりのマスの兵士にも） |
| 砂嵐 | 風＋土 | 目くらまし40%×2・砂1×2（継続ダメージ。盾は効かない） |
| 霧 | 風＋水 | 目くらまし30%×2 |
| 溶岩 | 火＋土 | 盾を全部壊して、壊した量＋2 |
| 轟雷爆炎 | 火＋雷 | 追加4・同じ道のほかの兵士に2・相手の城に3 |
| 混沌反応 | 混沌を含む3種以上 | 3×種類の数（人間の指示で4から下げた。クラシックは4のまま）。混沌の付着は残り2倍（`chaos.attachTurnsMultiplier`） |

- 森の5反応は #163 の `data/reactions.json`（a352658）の効果を、今の形に直した（`dot` はやけど、`blind` は目くらまし、`slow` は鈍足。霧の「水霧」の付着は、属性の表にないので入れない）。そのあと人間の指示で、砂嵐・黒氷のやけどを砂・凍傷に変えた（上の「砂・凍傷」）

### CPU（`js/game/strategies.js`。smart 系だけ）
- 火炎の吐息は城への魔法のあとに（道は相手の兵士がいちばん多い道）。竜血の雫は回復量以上減った兵士のうちいちばん前の兵士に。生命の雫は城HPが半分を切ったとき（ヒールと同じ）。身代わりは、相手の兵士が自分の城まであと2マス以内に来ていて、まだ身代わりがいないとき、HP＋盾のいちばん多い兵士に
- 先頭に当たる1体への魔法（シャドウ・カオスパルス）は、相手の兵士がいちばん多い道へ（`pickLane`）
- **魔族の CPU**（人間の指示ではなく、CPU の修正。数値は仮）：カードの種類（キー）が `fac_demon_` で始まるものだけ動きを変える（通常モード・クラシック・ほかの陣営の CPU は変わらない。シミュレーションが変更前と完全に一致することを確かめた）
  - 魂の欠片（`damageCastleAndHeal`）：相手の城を落とせるときだけ先に出し、それ以外は兵士などを出したあと、最後の優先リストの最後に出す（自城HPが低いときに先に出す形は、ほかの魔法の MP とメインの枠を食って勝率が下がったので採らなかった）
  - 氷の息：脅威（次の進軍で城に着く兵士）がなくても、相手の兵士が自分の城の手前2マス以内にいれば出す。毒の霧：1体でも、HP＋盾が4以上でまだ進軍で城に届かない兵士がいれば、最後の優先リストの終わりのほうで出す。血の膜：城HPが半分以下でなくても、相手の兵士が手前2マス以内にいて城壁が8未満なら出す。残響の魂：MP がコスト＋3以上あれば、最後の手段にせず出す
  - 確かめたこと（`node tests/sim/factions.js` 相当、smart 同士・各400試合・席入れ替え・森の精霊は2ターンに1回で測定）：魔族の勝率は 王国31→34%・森46→52%・竜37→39%（誤差は±5%ほど）。魂の欠片は1試合0回→3〜5回。全試合決着

### 確かめたこと
- `node --test` は全部通る（`tests/factions-mode.test.js`・`tests/forest-spirits.test.js`）。通常モード・クラシックのシミュレーション（`node tests/sim/run.js --games 100 --seed 1 --json`、`--mode classic`）は変更前と完全に一致
- **森を組み直したあと**（常時の精霊・武器4枚・魔法のMP2・砂と凍傷。`node tests/sim/factions.js --games 200`。smart 同士、各組み合わせ席を入れかえて400試合）：全4000試合が決着。行の陣営の勝率

| | 王国 | 森 | 魔族 | 竜 | 平均 |
|---|---|---|---|---|---|
| 王国 | — | 0% | 64% | 46% | 37% |
| 森 | 100% | — | 100% | 100% | 100% |
| 魔族 | 36% | 0% | — | 37% | 24% |
| 竜 | 54% | 0% | 63% | — | 39% |

  - **森が強すぎる（全勝）**。森の試合は短い（平均手番 王国×森49・森×魔族35・森×竜33・森どうし36）。常時の精霊だけで4ターンに城へ13（イフリート3＋城壁を無視するタイタン10）入り、防御も聞かないため。数値の調整はまだしていない（人間と決める）
  - 森の反応は1試合2〜5回（森どうし5.3）。ほかの組み合わせは前とほぼ同じ
- 組み直す前（`node tests/sim/factions.js --games 100 --seed 1`。各組み合わせ200試合）：全2000試合が決着。行の陣営の勝率

| | 王国 | 森 | 魔族 | 竜 | 平均 |
|---|---|---|---|---|---|
| 王国 | — | 89% | 67% | 47% | 68% |
| 森 | 11% | — | 24% | 16% | 17% |
| 魔族 | 33% | 76% | — | 37% | 49% |
| 竜 | 53% | 84% | 63% | — | 67% |

  - 平均手番 87〜133（王国どうしがいちばん長い）。崩壊の刻で決着する試合が多い（王国どうし67%・王国×竜46%）。先攻の勝率42〜53%。反応は1試合0〜9.6回（王国どうしは0、王国×竜は0.3、魔族どうしは9.6）
  - **森が弱く（17%）、竜・王国が強い**。直し方の候補（試した結果。森 vs 3陣営を各100試合）：森の攻撃魔法・精霊の MP を1ずつ下げる → 森の勝率 王国37%・魔族66%・竜57%／森の兵士を各3枚 → 15%・43%・22%／精霊を2倍・4ターン → 10%・38%・22%（同じシードで今は5%・28%・16%。上の表とはシードが違う）。長さは、城HP45で平均107→93手番、崩壊の刻を予告30・開始40にすると84手番（崩壊での決着は増える）。カードの数値・枚数は案のままなので、調整は遊んで確かめてから人間と決める。試合は10分の目安より長い
- 画面（UI担当にお願いしたいこと）：森の常時の精霊（`passiveSpiritActed` の演出・4体の精霊の絵・次に動く精霊の表示 `players.pX.passiveSpirit`）、砂・凍傷（`statuses.sand` / `frostbite`、`soldierDamaged` の `cause: "sand"` / `"frostbite"` / `"spirit"`）の表示、森の武器4枚・改名した魔法4枚の絵と説明文。56枚の絵・説明文・効果アイコン（`js/ui/art.js`・`js/ui/text.js`）、陣営を選ぶ画面、`js/main.js` / `server/server.js` が `factionDecks` のモード（`cardSet` なし）を読むこと、新しいイベント（`soldierHealed` / `castleGuardSet` / `castleGuarded` / `shieldBroken` / `castleHealCut` / `castleHealCutEnded`）と `statuses.slowed` / `blinded`・`castleGuard`・`bloodArmor`・`castleHealCut` の表示、突き（`soldierDamaged` が片方だけ）の演出

## 全体の設計（STEP 2〜5 の見通し）

STEP 2 以降で作り直しにならないよう、Game をどう広げるかを先に決めておく。**ここに書いた形は「これから作るときの約束」で、各STEPの実装PRで少しずつ入る。** 入った時点で「ロジックとUIの約束」の表に移す。
ここで決めたことのうち、ゲームの遊び方が変わるもの（道のつなぎ方・魔物の置き場所・3人以上の勝ち方）は、人間の確認を受けてから実装に入る。
**3人以上のルールは、まだ決めていない。** 下の「3人以上のルールの案（STEP 5 で遊んでから決める）」に案として書き、STEP 5 で実際に遊んでから決める。今決めて作るのは、2人の遊び方を変えない土台（席順・`opponentsOf`・対象の選び方・カードID）だけ。

### 2人専用の前提をなくす
今の Game には「2人」が決め打ちされている所がある。これを次のように直す。**席順・道・`roadId` / `targetId`・`getTargets`・カードIDの振り方は、もう入った**（「ロジックとUIの約束」に書いた）。人数を変える `rules.playerCount` と、負けた人の扱いは STEP 5 で入る。

| 今 | 直したあと |
|---|---|
| `PLAYER_IDS = ['p1', 'p2']` | 人数は `rules.playerCount`（2〜8、省略すると2）。IDは席順に `"p1"`〜`"p8"`。`getState().playerOrder` に席順（手番の順）の配列が入る |
| `opponentOf(id)`（相手は1人） | `opponentsOf(id)`（まだ負けていない相手全員）と `neighborsOf(id)`（道でつながっている相手）に分ける |
| 道は1本（`laneLength` マス） | 道は `getState().roads` の配列で表す。**2人なら道は1本（今と同じ）。** 3人以上の道の形は STEP 5 で決める（案は下の「広場」） |
| 兵士の位置は `position` だけ | 兵士は `roadId`（どの道か）と `position`（自分の城から数えたマス）を持つ。`targetId`（道の向こうの人）も入れる（`roadId` と持ち主から分かるが、UIが毎回計算しなくてすむように） |
| 道のマス番号は「p1 の城側が 0」 | 道のマス番号は「その道の `players[0]`（席順が前の人）の城側が 0」。2人なら今と同じ |
| 魔法の相手は自動で決まる（済：城への魔法の届く相手は `rules.castleSpellRange`） | 相手が2人以上いるときは `playCard(cardId, target)` の `target` で選ぶ（下の「対象の選び方」）。対象が1つなら今と同じく省略できる |
| 後攻の城ボーナス（p2 だけ） | `secondPlayerCastleBonus` はそのまま残す（2人用）。3人以上のときは別のキー（`seatCastleBonus`：席ごとのボーナスの配列）を STEP 5 で足す |

- 道の ID（`roadId`）：2人のときは `"p1-p2"`。3人以上のときの決め方は STEP 5 で道の形と一緒に決める
- 手番は席順。`getState()` に `round`（全員が1回ずつ手番を終えると1増える。1から）を足す
- **勝つ人は必ず1人**（引き分けはない）。2人のときは、城を落とされた方の負け（相手の兵士・魔法だけでなく、**魔物に落とされても負け**。下の「魔物」）。城へのダメージは1つずつ順に処理し、どこかの城HPが0以下になった時点でゲームを止める

### 3人以上のルールの案（STEP 5 で遊んでから決める）

ここは**案**。STEP 5 で実際に遊んでから決める。決まるまで、ここに書いたことを前提にした実装を他のSTEPに入れない。

#### 道：真ん中に広場を置く（済：STEP 5 の「真ん中の広場を通る道」。下は最初の案）
輪（となりどうし）ではなく、真ん中に広場を置く形にする。

```
     城A     城B
       ＼   ／
        広場（魔物）
       ／   ＼
     城D     城C
```

- 各城から真ん中の広場へ1本ずつ道がある（8人なら8本）。広場を通って、どの城へも行ける
- 兵士は「自分の城 → 広場 → 狙った城」と進む。狙う城は兵士を出すときに選ぶ（2人なら選ばなくてよい）
- 魔物は広場に1体。いる間は、倒すまで広場の手前で足止め（2人のときのルールと同じ）。どの席からでも同じ条件で狙える
- 魔物のHPや攻撃は、プレイヤーの人数に応じて強くする
- 広場では、他の人の兵士ともぶつかって戦う
- 人数が多いときは、画面をズームアウトできるようにする
- 2人なら「城A ─ 広場 ─ 城B」で、今の1本道とまったく同じ（広場 ＝ 真ん中のマス）
- 広場での乱戦の決まり（誰と誰が戦うか）や、集中攻撃への対策は、STEP 5 で遊びながら決める

#### チーム戦：チームで1つの城を共有し、城HPを増やす（済：STEP 5 の「チーム戦」。下は最初の案。城HPと手番は変えた）
- チームの城は1つ。広場から見た城の数はチーム数になる（2対2なら城2つで、2人戦と同じ形の盤面）
- 勝ち方は「相手チームの城を落とした方の勝ち」
- 城HPは、まず「1人ぶんのHP × チームの人数」から試す
- 手番はチームを交互に回す（チームA → チームB → チームA …）
- 手札は1人ずつ別。チーム内の相談はできる
- 細かい数値は STEP 5 で遊びながら調整する

#### まだ決めていないこと（STEP 5 で決める）
- 3人以上の個人戦の勝ち方（最初に城を落とした人の勝ち／最後の1人まで、など）と、決着しないときの決まり（周回の上限など）
- 魔物が城を落としたときの扱い（2人のときは落とされた方の負け）
- 負けた人が出たときの、その人の道と兵士の扱い
- 3人以上のときの席ごとの城ボーナス
- ファイアボール（すぐ効く・防げない）が誰にでも撃てると、いちばん弱い城に集まりやすい。対象を絞るかは、シミュレーションして決める

### 対象の選び方（済）
- `game.getTargets(cardId)` を足す：そのカードを今出せる対象の一覧を返す（読むだけ。出せないときは空の配列）。UIはこれでタップできる場所を光らせる。対象が1つだけなら `target` を省略してよい
- `target` の形は4つ。キーと値がちょうど一致するものだけ受け付ける（値が `undefined` のキーは無いものとみなす）。違うときは `{ ok: false, reason: "そこには出せません" }`
  - プレイヤー：`{ playerId: "p2" }`（城への魔法・回復・兵士を送る相手）
  - 兵士：`{ soldierId: "s03" }`（武器・盾など、兵士につけるカード）
  - 道のマス：`{ roadId: "p1-p2", square: 1 }`（今は使うカードがない。形だけ残す）
  - 魔物：`{ monsterId: "m01" }`（STEP 3）
- 今のカードの対象

| カード | 対象 | 2人のとき |
|---|---|---|
| 歩兵・騎士 | 送り込む相手 `{ playerId }`（となりの人だけ） | 1人なので省略できる |
| ファイアボール | 城を攻める相手 `{ playerId }`（まだ負けていない相手なら誰でも） | 省略できる |
| サンダー | 兵士を攻める相手 `{ playerId }`。**その人の兵士全員**（どの道にいても）に効く | 省略できる |
| ヒール | 自分 `{ playerId }` | 省略できる |

- `canPlayCard(cardId, target)` も同じ `target` を受け取る。`target` を省略して、対象が2つ以上あるときは `{ ok: true, needsTarget: true }`（出せるけど選ぶ必要がある）。そのまま `playCard(cardId)` を呼ぶと `{ ok: false, reason: "対象を選んでください", needsTarget: true }`

### 1ターンに出せる枚数（STEP 2 から。のちに変更：下の「出せる枚数を増やした」）
- カードは `kind` から決まる `slot` で3つに分かれる（`cards.json` に `slot` は書かない）
  - `"main"`（メイン）：1ターン1枚。兵士・城や兵士を攻める魔法・**ヒール**（回復が何枚も重なって決着しなくならないように、メインにする）
  - `"addon"`（付加）：自分の兵士につける（武器など）。メインと一緒に、何枚でも出せる。**その兵士の次の進軍・戦いから効く**。「この攻撃にこの付加をつける」形にはせず、兵士につける形にする（1枚ずつ `playCard` で出せて、画面も「兵士をタップ」だけで分かるため）
  - `"defense"`（防御）：何枚でも出せる（兵士の盾・城の守り）
- `getState().players.pX.playedThisTurn` は「このターンにメインのカードを出したか」の意味のまま残す。ほかに `cardsPlayedThisTurn`（出した枚数）を足す
- ドローは `drawPerTurn` 枚が最低で、`drawPerPlayed` なら前のターンに出した枚数ぶん（STEP 2 の「ドロー」）

### 出せる枚数を増やした（人間の指示：試合が遅いため）
カードを出せる枚数が少なく試合が遅かったので、出し方（`slot`）を5つにした。**数値は仮**（`data/rules.json`）。
- `soldier`（兵士）：1ターンに `rules.soldiersPerTurn` 枚まで（仮：3。省略すると1。1以上の整数）。`getState().players.pX.soldiersPlayedThisTurn` に出した枚数
- `main`（攻撃の魔法：城・兵士へのダメージ、毒、凍結、天の恵み、神頼み、盗賊。**回復（`healOwnCastle`）もここ**）：1ターン1枚。兵士とは別枠（兵士を出したあとでも1枚出せる）。`playedThisTurn` は「この枠を使ったか」
- `support`（精霊・コインを増やすカード＝`summonSpirit` / `gainCoins`）：メインを使わず何枚でも。回復は、何枚でも使えると決着しなくなるので1枠のまま（人間の指示）
- `addon`（武器）・`defense`（防御）：今までどおり何枚でも
- 出した枚数ぶん次のターンに引く（`drawPerPlayed`）ので、たくさん出すと手札もすぐ戻る
- 確かめたこと（`node tests/sim/run.js --games 200`）：smart 同士は平均手番が58→43、全組み合わせが決着。CPU は smart 系が出せなくなるまで続けて出し、aggro・rush・defensive も兵士・城への魔法を続けて出す。**短くなりすぎていないか、遊んで確かめる**

### カードID（済）
- カードIDはシャッフルしたあとの順に振る（IDから種類が分からないように）。ただし捨て札から山札を作り直すときは同じIDのまま戻るので、一度見たカードはIDで分かる。オンライン（STEP 4）では、相手の `cardDrawn` に `cardIds` を見せない

### 魔物（STEP 3）
- 2人なら道は1本で、魔物は真ん中のマスに1体まで（3人以上は、上の案のとおり広場に1体。STEP 5 で決める）
- `getState().monsters`：魔物の配列（いなければ空の配列）。それぞれ `{ monsterId, type, roadId, square, hp, maxHp, attack, ... }`
- 魔物の攻撃（放置したとき）で城HPが0以下になってもよい。2人のときは、落とされた方の負け（3人以上のときの扱いは STEP 5 で決める）

### 山札（STEP 5 のデッキ対戦。済：「STEP 5」の節）
- `rules.deckMode`：`"shared"`（今の2人共通の山札）か `"own"`（1人1つずつ山札を持つ）
- `"own"` のとき、山札・捨て札・使い切り置き場はプレイヤーごと。`players.pX.deckCount` / `discardCount` / `exhaustedCount` に入る（`"shared"` のときは `null`）。いちばん上の `deckCount` などは、`"own"` のときは `getState(viewerId)` の viewer 本人の数（viewer がいなければ `null`）

### getState() に増えるもの（予定）
今あるキーは、意味を変えずに足すだけにする（UIを作り直さなくてすむように）。上の「山札」の `"own"` のときだけは、いちばん上の `deckCount` が「自分の山札」の意味になる。

```js
{
  playerOrder: ["p1", "p2"],     // 席順（手番の順）
  round: 1,                      // STEP 5：何周目か
  roads: [{ roadId: "p1-p2", players: ["p1", "p2"], length: 5 }],  // length はいつも laneLength
  monsters: [],                  // STEP 3：魔物
  players: {
    p1: {
      eliminated: false,         // 負けて抜けたか（3人以上）
      coins: 0,                  // STEP 3：コイン
      soldiers: [{ /* 今のキー */ roadId: "p1-p2", targetId: "p2" }],
    },
  },
}
```

### イベントに増えるもの（予定）
- 今あるイベントのペイロードには、キーを足すだけにする（`soldierDeployed` / `soldierMoved` / `soldiersClashed` に `roadId` など）
- 新しいイベントは、そのSTEPの実装PRで「Gameが出すイベント」の表に足す（例：`playerEliminated`、`monsterAppeared`）

### オンライン対戦（STEP 4）で守ること
- Game はブラウザでもサーバー（Node.js）でも同じコードで動く。DOM・`window`・`fetch`・ファイルを Game の中で使わない（今もそうなっている）
- 乱数はサーバーだけが持つ（`new Game({ rng })` に渡す）。ブラウザは結果だけを受け取る
- 見えてはいけない情報（相手の手札の中身・山札の順番）は、**どのイベントのどのキーを誰に見せるかを `js/game/` の中の1か所（表）にまとめ**、サーバーはその表を使ってプレイヤーごとに隠してから送る（知識をロジック側の1か所に置くため）
- ブラウザから見ると、呼び出しは非同期になる（送ってから返事が届く）。UIは Game と同じ名前のメソッドを持つ「クライアント」越しに呼び、返事は Promise で受け取る。出せない理由を前もって出すために、サーバーは状態と一緒に「手札の各カードを今出せるか（`canPlayCard` の結果）と対象の一覧」を送る

### 決まっている方針について
- 「ドラゴンのブレスは合計 50 + 15×(相手の人数−1)」は、城HPが100だったころの数値。今の城HP（40）に合わせて、**数値は `cards.json` で決める**（STEP 2〜3 で、人数に応じて増える形だけを守る）

## 今後の予定（まだ作らない）

STEP 2 以降で追加する。今のSTEPで頼まれていないものは先回りして作らない。作り方の見通しは上の「全体の設計」に書いた。

1. カード拡張：武器・防御・属性・状態異常（STEP 2 で作った。トラップは入れない）
2. 魔物とコイン：中央に出る魔物（ランダム）、とどめボーナス、コインでの強化（STEP 3 で作った）
3. 見た目：イラスト、演出、城が壊れていく表現、効果音
4. オンライン対戦：合言葉で部屋に入る（STEP 4 で作った。上の「STEP 4」）
5. 拡張：最大8人、デッキ対戦、城の種類、勝利条件の設定画面（STEP 5 でロジックを作った。設定画面は画面側）

決まっている方針：
- 防御カードは何枚でも出せる。攻撃は1ターン1枚（付加効果のカードは一緒に出せる）
- ドローは `drawPerTurn` が最低で、`drawPerPlayed` が `true` なら前のターンに出した枚数ぶん引く（人間の指示で変更。以前は1枚固定だった）
- 魔物は放置するとランダムな城を攻撃する
- ドラゴンのブレスは、合計 50 + 15×(相手の人数−1) のダメージを相手全員で分ける
