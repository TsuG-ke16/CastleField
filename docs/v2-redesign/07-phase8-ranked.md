# 07. Phase 8：ランクマッチ（v2）

Phase 7（#214）の上に積んだ変更。v2 のホームで「ランクマッチ」を選ぶと、相手が動かないまま止まっていた（CPU が動くのは CPU対戦のときだけ）ので、Rust サーバーでランクマッチを動かした。
ランクの数値・式は今までの `data/ranks.json`・`data/seasons.json` と旧サーバーの `server/accounts/ranking.js` のまま（数値は変えていない）。

## 遊び方

1. ホームの「対戦形式」で「ランクマッチ」を選び、「ランクマッチへ」を押す（ホーム左下の「シーズン1・…」からも開ける）
2. 待合室で「相手を探す」。近い強さ（MMR）の相手から探し、待つほど範囲が広がる（±100 → 最大±800、90秒で打ち切り）
3. 組まれたら対戦画面へ。先攻・後攻はサーバーが決める
4. 結果画面に「認定戦 あと○試合」か「+○ RP」、昇格・降格が出る。「次の相手を探す」で待合室に戻る
5. 相手が3分（`ranks.json` の `ranked.idleTurnMs`）動かないときは「勝ちを申し出る」が出る（サーバーが時間を確かめて、相手の降参にする）

- ランクマッチは**通常モードだけ**（サーバーが通常モードのカードしか持たないため）。4陣営・クラシックで選んだときは、理由と「通常モードに切り替える」を出す
- 合言葉対戦も通常モードだけ。合言葉が空のまま「出陣する！」を押したときは、合言葉を入れる画面を開く（以前は相手のいない試合で止まった）

## 本人確認（ゲスト）

- 旧サーバーのランク戦は「正会員どうし」だけだったが、v2 にはアカウントがまだない。そこで、サーバーが発行する**ゲストの userId と secret**（端末の localStorage `castlefield_v2_ranked_identity`）でランクを記録する。ゲストでランクを記録することは人間に確認して決めた（アカウントを入れるまで）
- 点数はサーバーが試合の結果からだけ変える（クライアントから点数・勝敗を送る口はない）。同じ相手から何度も RP を得すぎないよう、24時間で3回までは満額・6回までは半分・それ以上は0（`pairLimit`）
- サーバーのデータが消えて本人が分からないとき（403）は、ゲストを作り直して1回だけやり直す

## サーバー（`rust/server/`）

| URL | 送るもの | 返るもの |
|---|---|---|
| `POST /api/account/guest` | `{ name? }` | `{ ok, userId, secret, name }` |
| `POST /api/ranked/queue` | `{ userId, secret, name? }` | 状態（下） |
| `POST /api/ranked/status` | 同上 | 状態 |
| `POST /api/ranked/leave` | 同上 | `{ ok }`（成立後は `ok: false`） |
| `POST /api/ranked/summary` | 同上 | `{ season, placed, placementLeft, placementTotal, matches, wins, rank, peak, position, lastChange }` |
| `GET /api/ranked/leaderboard?limit=` | — | `{ season, entries: [{ position, name, rp, matches, wins, rank }] }`（userId は出さない） |
| `POST /api/ranked/claimIdle` | `{ token }`（席の鍵） | `{ ok, reason?, state? }` |

- 状態：`{ state: "idle" }` / `{ state: "queued", waitedMs, range, timeoutMs, queued }` / `{ state: "timeout" }`（1回だけ）/ `{ state: "matched", token, playerId, opponentName, finished, gameState }`
- 成立した試合は `ranked:<matchId>` の部屋（合言葉では入れない）。席の鍵は本人にだけ返す。決着したら1回だけ結果を反映し、両方の席に `{ type: "rankedResult", changes: { p1, p2 } }` を流す
- 保存：redb の `accounts`（userId → secret・名前）と `ranked`（userId → シーズンごとの成績・最近の相手・直近の変化）
- 計算：`castlefield_core::rank`（純 Rust。`Math.round` と同じ丸め。旧サーバーの式で計算した値と一致することを単体テストで確かめた）
- 待ち行列はメモリだけ（再起動で空になる。成立前の人は探し直し）

## シーズン報酬

- 終わったシーズンの**最高到達ランク**で、`data/seasons.json` の `rewards` の品（アイコンフレーム＋カード裏面）を1組。コインはなし。条件は、認定戦を終えて `minMatchesForReward`（5）試合以上（旧サーバーの `missions.js` と同じ）。1シーズン1回
- `POST /api/ranked/seasonRewards`（`{ userId, secret }` → `{ season, rewards: [{ season, eligible, claimed, peak, items, matches, minMatches }] }`）、`POST /api/ranked/claimSeason`（`{ userId, secret, season }` → `{ ok, items }`）。品はサーバーの所持品（`/api/economy/profile` の `ownedSkins`）に入る
- 画面：待合室に「シーズン○の報酬」と「受け取る」。受け取った品はこの端末の所持品にも入れ、ショップで装備できる（カード裏面。アイコンフレームは v2 にまだ装備する場所がない）。サーバーで受け取り済みなのに端末にない品は、待合室を開いたときに入れ直す
- 上位階級（Master・Champion）は順位で決まるので、最高到達の判定では Diamond 止まり（旧サーバーと同じ）

## 売り物でない品

- `data/shop.json` で `price` が null の品（ランク報酬16・ガチャ限定11）が、v2 のショップと Rust サーバーで**300コインで買えていた**。画面は「ランク報酬」「ガチャで入手」と出して押せなくし、サーバーの `buy` も断る。ランク報酬の品はガチャの景品からも外した

## 一緒に直したこと（サーバー）

- **相手の手札が見えていた**：WebSocket・SSE がイベントをそのまま流していて、相手の `cardDrawn` のカードID・合成の中身が届いていた。`js/game/visibility.js` と同じ決まりで席ごとに隠すようにした（`filter_event_for`）
- **相手の操作が画面に届かなかった**：サーバーはイベントしか流さず、盤面（state）はつないだときだけだったので、相手が動いても自分の盤面が変わらなかった（合言葉対戦も同じ）。操作のたびに「盤面が変わった」を流し、各接続がその席向けの state を作って送るようにした。つなぎ直したときも、取りこぼしたイベントのあと必ず state を送る
- **席の鍵が連番だった**（`cf_tok_1_p1` など。推測してほかの人の席を操作できた）→ 推測できない値にした
- **`defend`・`passDefense` を攻撃を受けていない人も送れた** → 受けている人だけにした
- **1コンテナで画面が出なかった**：`/assets` をリポジトリの `assets/` だけに割り当てていて、Vite の `/assets/index-*.js` が 404 になっていた。`web/dist` を先に配り、ないものだけリポジトリの `assets/`・`data/` から配る（リポジトリ全体は配らない）
- `rust/server` がワークスペースに入っていないためビルドできなかった（`cargo test --manifest-path rust/server/Cargo.toml` がエラー）→ `rust/Cargo.toml` の `exclude` に入れた。`rust/server/Cargo.lock` を入れた
- Dockerfile：別の段で作った wasm を `rust/target` からコピーしようとして失敗していた → 段をまたいでコピー

## 確かめたこと

- `cargo test --workspace`（rank の6件を含む）、`cargo test --manifest-path rust/server/Cargo.toml`（ランクの統合テスト5件：本人確認・1試合1回だけ反映・認定戦5試合→ランク・ランキング・待ち時間切れ・放置の申し出・手札を隠す）
- `node --test`（1073件）、`node --test rust/tests/*.mjs`（9件）、`npm run build`
- ブラウザ2つ（Playwright・390×844）で：ホーム→ランクマッチ→相手を探す→成立→ターン終了が相手の画面に届く→降参→両方の結果に認定戦→「次の相手を探す」で「認定戦 1/5」。1人で並んだときの「探しています」と「探すのをやめる」を 390×844・1280×800 で確認

## まだやっていないこと・気づいたこと

- ~~シーズン報酬（`seasons.json` の `rewards`）が v2 の所持品とつながっていない~~ → 作った（上の「シーズン報酬」）
- 接続が切れたまま戻らない相手は、「勝ちを申し出る」で決着させる（自動では決着しない）
- ~~3D のモデルが Draco の部品を外部（gstatic.com）から読んでいる~~ → 直した：three.js 0.172.0 の部品を `web/public/draco/` に置き、`web/src/scene3d/dracoPath.ts` の場所から読む（前はネットのない環境・オフラインで GLB が全部読めず、ホームの城が出なかった）
- `castlefield-core` の `cargo clippy -D warnings` は、前からある `game.rs` の5件で落ちる（今回の `rank.rs` には警告なし）
- ~~ガチャ・ショップの API が送られてきた `user` を信じていた~~ → 直した：`/api/economy/profile`（POST に変えた）・`gacha`・`buy` は `{ userId, secret }`（ゲストの本人確認）が要る。今の v2 の画面はコイン・ガチャを端末の localStorage で扱っていて、この API は使っていない（サーバーの所持品に切りかえるかは、まだ決めていない）
