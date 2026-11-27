# オンライン対戦のスキル操作（feature/online-skills）

土台：main `9521ab2`（200ノードのクラシック スキルツリー）。オンライン（`server/rooms.js`）でスキル操作が使えなかったのを直した。Game（`js/game/`）は変えていない。

## 変更点
| ファイル | 内容 | なぜ |
|---|---|---|
| `server/rooms.js` | `GAME_ACTIONS` に `skillAction` / `listSkillActions` / `previewSkillCost` / `setSkillPrefs` | ローカルと同じ Game の API をサーバー経由で呼べるように |
| 〃 | `skillAction`：既存の playCard と同じ経路（CPU 席の拒否 → 自分の番か → try/catch → 状態の送り直し → CPU を動かす）。だれが使うかは席で決め、args に playerId を入れさせない。返事は `{ ok }` / `{ ok:false, reason }` だけ | ハンドラの返り値（兵士のオブジェクトなど）を送らない・相手の席を名指しできないように |
| 〃 | `listSkillActions`：自分の席の一覧だけ（いつでも。読むだけ） | 本人用の情報なので本人だけ |
| 〃 | `previewSkillCost`：自分の番・自分の手札だけ（手札にないときは playCard と同じ文）。`{ ok, reason, mp, hp }` だけ返す。状態を送り直さない・CPU を動かさない | 見積もりは読むだけ。相手の手札の有無が文から分からないように |
| 〃 | `setSkillPrefs`：自分の席だけ。自分の番でなくても変えられる | 設定なので手番に関係ない |
| 〃 | `cleanSkillOptions`（playCard の第3引数・見積もり）：キーは `hpForMp`（真偽値か0〜999の整数）・`bloodBlade`・`bloodEcho`・`deferHp`（真偽値）・`diceChoice`（high/low/first/second）だけ。ふつうのオブジェクト以外・知らないキー・形の違う値は拒否し、新しいオブジェクトに詰め直す | これまで playCard の args はそのまま Game に渡っていた。知っているものだけを通すのがいちばん安全 |
| 〃 | `cleanActionArgs`（任意スキルの args）：JSON の値だけ・深さ3・値64個・文字列64字・配列16個・キーは英数字（`__proto__`・`constructor`・`prototype` は拒否）。`cleanSkillPrefs`：`{ X35: { autoDefer: true } }` の形だけ | 中身の正しさは Game の check が確かめる。サーバーは大きさと形（プロトタイプ汚染）だけを見る |
| 〃 | 発動ログ：`game.observeSkills` で、本人の `trigger`・`diagnostic` だけを `{ type: "skillLog", entries }` で本人に送る。中身は `kind, turn, playerId, skillId, count, code` だけ | ログには対象・カード・乱数の内訳が入るので、画面の表示に使うキーだけにした |
| 〃 | つないだとき（再接続）：状態のあとに最近40件のログを `replace: true` で送る | 回数・資源は状態（getState の skillState）に入っているので、ログだけ送り直す |
| `js/ui/OnlineClient.js` | `skillAction` を本物に、`previewCardCost`（Promise）・`setSkillPrefs`・`onSkillLog` | LocalSession と同じ呼び方にして、画面のロジックを1つにする |
| `js/ui/Session.js` | `setSkillPrefs` | 両方のセッションで同じメソッドを持つ |
| `js/ui/SkillBattleView.js` | 見積もりが Promise でも動く（オンラインは150ms待ってから聞く・古い答えは捨てる）。発動ログをオンラインでも出す（`receiveLog`）。実行後に選択を閉じた表示に描き直す | 接続の差（同期／非同期・ログの出どころ）だけをここで吸収 |
| `js/ui/skillTreeModel.js` | 上限の知らせの文に `code` を使う | 実際のログは `type` ではなく `code` を持っていたので、文が空だった |
| `js/main.js` | OnlineClient に `onSkillLog` をつなぐ（2か所） | |
| `js/ui/precache.js` | `node js/ui/build-precache.js` で作り直し（版の文字列だけ変わる） | |
| `tests/online-skills.test.js` | 部屋のスモーク6件 | |

## 判断メモ
- **相手の発動ログは送らない**。画面（`skillLogText`）も本人の分しか出していないため。「両席に公開してよい範囲」を広げるなら、`skillLogFor` に相手向けの形を足す（何を見せるかは仕様の判断が要る）
- **相手の `skillState` の `resources`（貯蔵MP・血気など）・`debt`・`tokens`・`scheduledCount`・`graveCount`・`public` は、今の getState の決まりどおり相手にも見える**。本人だけのもの（`uses`・`scheduled`・`grave`・`peek`・`prefs`・`counters`・`actions` など）は見えない（テストで確認）。貯蔵や債務も隠すべきなら、`js/game/skills/Runtime.js` の `stateFor` を変える（ロジック側の判断なので今回は変えていない）
- skillAction の Game 側の失敗（回数・支払い・対象）はそのまま `reason` を返す。ハンドラが例外を投げたときは既存どおり「操作の形が正しくありません」でサーバーは落ちない（ただし Runtime の runAction は支払いのあとに run が投げると支払いが戻らない。Game 側の既存の性質）
- 同時操作・順序：Node の1スレッドで1操作ずつ同期で処理する既存の仕組みのまま（新しいロックは作っていない）
- ランク戦は通常モード（スキルツリーなし）なので、スキルの操作は「スキルがありません」で断られるだけ

## 確かめたこと
- `node --test`：1043件 pass / 0 fail（新規 `tests/online-skills.test.js` 6件を含む）
- `node tests/sim/run.js --games 20 --seed 1 --json`・`--mode factions`・`--mode classic --games 10`：main（9521ab2）と出力が完全一致（cmp）
- Playwright（2つのブラウザで同じ部屋。`CF_DB_PATH` を /tmp にして data-store を書き換えない）：手番の側がスキルパネルから P03（等価交換）を実行 → 発動ログに「等価交換（P03）が発動」・ページエラーなし。スクリプトはリポジトリの外（一度だけの確認）

## 未確認
- カード使用前のダイアログ（B03・B08 など）での見積もりの表示をオンラインの実ブラウザでは見ていない（サーバーの previewSkillCost はテスト済み）
- 試合が変わった直後に届いたログが、画面の `reset()` で消える場合がある（ログは即時、状態は演出の後に届くため）。最初の手番の発動だけが対象で、実害は小さい
- 設定（setSkillPrefs）を切り替える画面はない（API だけ。UI の刷新 PR #202 とぶつからないよう足していない）
- 相手のスキルの発動を演出・ログで見せるかは未定
