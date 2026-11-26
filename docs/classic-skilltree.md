# クラシックモードの監査とスキルツリーの設計（数値はすべて仮）

人間（ぐらふぃ）の指示：「クラシックモードを作っておいて。スキルツリーも必須。全部考えておいて」。
質問できない状況で進めたので、人間が決めていないことは「既定」で決め、最後の「人間が決める点」に並べた。

---

## 1. クラシックの監査（いまどこまで出来ているか）

**人間の意図（確定）**：クラシック＝通常モードからレアリティをなくした版。兵士・武器・魔法・防御の普通のカードを使い、属性の反応（光・闇・氷・混沌・火水風土など）を楽しむ。全員で1つの共通の山札（上限80枚）。4陣営モードは別のモード（同じ作りで、陣営ごとのカード表）。

### 出来ている（エンジン側）
| 項目 | 場所 | 状態 |
|---|---|---|
| モードの定義 | `data/modes.json` の `classic`（`cardSet`・`rulesSet`・`elementsSet`・`reactionsSet`・`useRarities: false`） | 済 |
| 共通の山札80枚・レアリティなし | `data/classic/cards.json`（32種・80枚。`rarity`・`fuseTo` なし）、`tests/classic-mode.test.js` が上限を見張る | 済 |
| 戦闘ルール（城への魔法は先頭の兵士に／崩壊の刻で必ず決着） | `rules.castleSpellHitsFront`・`collapseStartRound` | 済 |
| MP（全カード・自然回復・後攻のマナ） | `rules.mpAllCards` など | 済 |
| 属性9種・付着と反応（対消滅・黒氷・砕氷・混沌反応） | `data/classic/elements.json`・`reactions.json` | 済 |
| ターン開始時のランダム付着 | `rules.randomAttachTurnStart`（クラシックの rules には書いていない） | 済 → スキル E01「混沌の目」で取った人だけに効く |
| CPU | `js/game/strategies.js`（smart は反応を起こせる武器を選ぶ・号砲のために城壁を貯める） | 済 |
| オンライン（サーバー） | `server/server.js` の `loadData(dir, 'classic')`・`loadModeData`、部屋に入るときの `mode`（`tests/classic-mode.test.js`） | 済 |
| 見せない情報（visibility） | クラシックの新しいイベントに隠すものはない（付着・反応は盤面の兵士なので見せてよい） | 済（スキルも見せる。下の 2） |
| シミュレーション | `node tests/sim/run.js --mode classic` | 済 |

### 今回エンジン側で足したもの
- **3人以上・チーム戦のクラシックが決着するかのテスト**（`tests/classic-mode.test.js`。4人チーム戦の広場・3人／4人のバトルロイヤル）。今まで2人しか確かめていなかった。どれも決着する（smart 20試合ずつで全部決着、平均113〜151手番）
- **スキルツリー**（下の 2。200ノードのグラフ版。エンジン・データ・CPU・サーバーの部屋）

### 足りない・仕様の穴（UI か人間の判断が要るもの）
1. **ホームでクラシックを選べない**：`modes.json` の `classic` は `available: false`・`hidden: true`。ホームの切り替え（`js/ui/HomeRuleSet.js` の `rulesetUrl`）は `kingdom` / `factions` だけ。`?mode=classic` の URL なら、ひとりで遊ぶ・同じ端末は動く（`loadHomeRuleSet` が読む）
2. **オンラインでクラシックの部屋に入れない（画面側）**：`js/main.js` の `client.join(pass, name, gameMode === 'factions' ? 'factions' : undefined)` が `classic` を送らないので、`?mode=classic` で開いても**通常モードの部屋に入ってしまう**（画面はクラシックのカード表なのに、サーバーは通常モードの試合 → カードが読めない）。サーバー側は `mode: "classic"` を受け付ける
3. **火・水・風・土の反応がない**：クラシックの山札にある属性は光・闇・氷・混沌だけ（火水風土のカードは森・竜の陣営のカード表にしかない）。反応の表（`reactions.json`）も光・闇・氷・混沌の組だけ。人間の意図「火水風土など」の反応を楽しむには、カード（80枚の中の入れ替え）と反応の表を決める必要がある（**カードの設計なので人間に確認**。仕組みは4陣営の反応（蒸発・溶岩など）がそのまま使える）
4. **城の種類とスキルツリーの役割がかぶる** → 解消（仕様 第1章）：クラシック（`skillTree` を渡したゲーム）では城の種類の補正を使わず、標準城（`rules.defaultCastle` = `standard`。補正なし）の値にする。見た目（`castleType`）は残す
5. 魔物・天候・ステージ・コインの強化は通常モードと同じデータを使っている（クラシック専用にするかは未定）
6. CPU（smart）は、ランダム付着で付いた属性を狙って魔法を撃つことはしない（武器の選び方だけ反応を見る）。人はもっと上手に使える

---


## 2. スキルツリー（200ノードのグラフ版。仕様 `docs/skilltree-200-spec.md` の要約）

旧24ノード版（7枝×3段・7pt）は置き換えた（旧版の表・測定は commit 38287fc の版のこのファイル）。数値は暫定設計値で、バランスは未測定。

### 2.1 方式
- 試合の前に **12pt**（`budget`。QA で 7/10/12/15 を比べられる）でノードを取る。**全ノード1pt**、START は0pt（ノード数に含めない）。**奥義は1個まで**（強制なし）。対戦前の振り直しは無料、対戦中は変えられない
- **200ノード**＝19系統×8（通常133＋奥義19。各系統の08が奥義）＋横断48（X01〜X48）。系統：会心C・魔法M・属性E・幸運L・魔力P・手札H・兵士U・墓地G・回復R・防御D・攻城A・時間T・状態異常S・戦術K・兵器罠F・闘志Q・召喚V・模倣I・血魔術B
- **辺**（無向）：各系統で共通の10本 START–01・01–02・01–03・02–04・03–05・04–05・04–06・05–07・06–08・07–08。横断ノードは2端点（`ends`）とそれぞれ辺を持つ。**表以外の辺はない**
- **取得条件**：未取得・START か取得済みノードと辺でつながる・残りpt・個別必須（`requires`）・奥義1個。横断は**端点のどちらか一方**があれば取れ、取ると反対側へ進める
- **個別必須**（接続とは別の AND）：M08→M02、P08→P02、G06→G02、B07→B06、B08→B01、X04→P02、X18→M02、X22→M02、X40→K02
- **解除**：外したあとに全取得ノードが START と（取得済みノードだけを通って）つながり、必須・奥義の制限を満たすときだけ。並びは取れる順に並べ直す
- **ノード内の設定**（ノード数は増えない）：E04 反応特化（対消滅+4／黒氷+4／砕氷+4／混沌反応+5。初期値 対消滅）、X25 元素砲（クラシックの属性9種から1つ。初期値 火）
- リング配置（UI用の座標 `layout`）：会心を真上に時計回りで 会心→魔法→属性→状態異常→時間→魔力→手札→模倣→召喚→墓地→血魔術→回復→防御→闘志→兵士→戦術→兵器・罠→攻城。幸運は中央（START の下）。横断は2端点の中点付近

### 2.2 データ（`data/classic/skilltree.json`。`tools/build-skilltree.mjs` が作る。手で直さない）
- `node tools/build-skilltree.mjs` で書き出し、`--check` で今のファイルと同じか確かめる（テストも確かめる）。ID・名称・効果文・横断の端点は仕様書の表をそのまま読む。数値（`params`）・必須・選択肢・色・おすすめ・座標はスクリプトに書く
- 形：`{ version: 3, budget, start, edges（テンプレート）, ring, center, nodeShapes, groups: { C: { name, ring, color, glyph } … }, crossGroup, nodes: [{ id, group（横断は "X"）, name, desc, cost, ultimate, cross, ends, requires, handler, params, config?, layout }], presets }`
- `handler` は効果ハンドラのID（今はノードIDと同じ）。`params` は仕様の数値（確率は0〜1、`perTurn`＝各自ターンn回、`perMatch`＝試合中n回）
- おすすめ（`presets`）＝仕様 第10章の4ビルド：`critMagicLuck`（会心＋魔法＋幸運）・`bloodHealDefense`（血魔術＋回復＋防御）・`elementManaMagic`（属性＋魔力＋魔法）・`graveTroopsSummon`（墓地＋兵士＋召喚）

### 2.3 API（`js/game/SkillTree.js`。DOM も Game も使わない）
`canAcquire(tree, picked, id, budget)`・`validate(tree, picked, budget)`（取得順に canAcquire を当てる。順序依存）・`cost`・`acquirableIds`（データの順）・`checkSet`（集合として）・`orderBuild`・`release`・`validateConfig`・`normalizeBuild`（配列か `{ ids, config }` → `{ ids, config }`）・`serializeBuild`（`{ version: 3, ids, config, budget }`）・`deserializeBuild`（version 3 未満＝旧24ノード版は `migrateBuild` で空ビルド＋理由。振り直し）・`skillMods`・`skillTreeApi(tree)`（QA adapter 用に `nodes / canAcquire / validate / cost / acquirableIds / release`）

### 2.4 Game との接続（クラシック限定）
- `new Game({ skillTree, setup: { skills: [ [...ids] | { ids, config }, ... ] } })`。`skillTree` を渡さないゲーム（通常・4陣営）は今までどおり（`setup.skills` を書くと例外、スキルの処理も乱数も使わない）
- 対戦開始時に両者を再検証。決まりに合わない席は**空ビルドにして**理由を `game.skillFallbacks`・`players.pX.skillError` に残す（例外にしない）。形の間違い（人数より多いなど）は例外
- getState：`players.pX.skills`（取得順のID配列。相手にも見せる）・`skillConfig`（設定値）・`maxMp`・`skillError`（あるときだけ）
- **効く効果（段階A）**：単純な初期値系だけ既存の適用に接続（`STATIC_HANDLERS`）：P01 初期MP+2・P07 MP上限+2・D01 初期城壁+4・D05 城壁が2未満なら2まで（ターン開始）・U01 出撃枚数+1・U04 射程+1・R01 城回復魔法+1・E01 ターン開始のランダム付着・E04 選んだ反応+4/+5・E06 反応ダメージ+2
- **ほかの190ノードは「新ハンドラ未実装」**（データに handler・params はあるが戦闘では効かない。段階B/C で接続）。旧24ノード版の効果キー（城HP・手札・兵士の攻撃・城への魔法・MP回復・コイン・城HP回復・兵士HP・魔物のコイン など）の Game 側の処理は削除せず休眠（どのノードも使わない）
- クラシックの城：城の種類の補正（`hpBonus` など）は使わず標準城の値（今は補正なし）。見た目の `castleType` は残す。通常モードの城は変えない

### 2.5 CPU・オンライン
- `chooseSkillBuild(tree, rng, style, budget)` → `{ ids, config }`：`none`／`random`（取れるノードを安定順に並べ、注入した rng で選ぶ。予算を使い切る・奥義1個・横断を含む）／プリセットのID／戦い方の名前（`SKILL_STYLE_OF`：aggro→会心魔法幸運・rush→墓地兵士召喚・smart→属性魔力魔法・defensive/guard→血魔術回復防御）／`"C01+C02"`
- 部屋：`setSeat({ skills })` は配列か `{ ids, config }` を本番の `normalizeBuild` で確かめる。席の `skills` と `roomInfo().players[].skills` は `{ ids, config }`、`choices.skillTree` はツリーの公開用の形（版・予算・系統・辺・ノード・おすすめ）
- シミュレーション：`node tests/sim/skills.js --builds none,random,critMagicLuck`（12pt）、`node tests/sim/run.js --mode classic --skills critMagicLuck,random`

### 2.6 未実装・後工程
- 戦闘効果ハンドラ（段階B：共通イベント・幸運・会心・資源・予約・連鎖制限、段階C：190ノード）、UI（ツリー画面・任意行動）、QA の observe/verify。進捗は `docs/skilltree-200-progress.md`
