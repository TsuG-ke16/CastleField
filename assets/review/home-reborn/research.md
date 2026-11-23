# 商用ゲームUI研究 — 2026-11-23

実画面を取得して目視比較した。外部の固有アート・UI画像は製品にもリポジトリにも取り込まず、以下の出典へリンクする。画面の年代を明記し、現行版すべての仕様を断定しない。タップ数や親指への配慮は画面からの設計上の推定であり、各社のユーザーテスト結果ではない。

## Clash Royale — 2025年6月の更新画面

[画面・モード切替の説明（RoyaleAPI）](https://royaleapi.com/blog/trophy-road-rework-2025-q2-update) / [確認した画像](https://cdns3.royaleapi.com/static/img/blog/2025-06-season-73/2025q2/v1-c515595b/2025q2-a-288-2.jpg)

- 優先順位：中央のアリーナ→下部のBattle。プロフィール・通貨は上端。
- CTA：下部に大きく集約。モード切替を隣接させ、開始と条件を近づける。
- モード：ホーム全面に全選択肢を出さず、切替パネルへ展開。
- デッキ：CTAの上・隣に現在の選択を出し、カード一覧は別タブ。
- プレイヤー情報：上端の帯。進行・通知は周辺に配置。
- ナビ：下部のアイコンナビ。主戦場への帰り道を固定。
- 文字・色・質感：強い明暗差と太い文字。強調色はBattleと選択状態に使う。
- 片手操作：開始、デッキ、切替を下半分へ集約する設計が参考。
- アート統合：大きなアリーナが目的地を示す。ただし通知や販促の密度は本作では採らない。

## MARVEL SNAP — 公式ヘルプ掲載の縦画面

[公式ヘルプ](https://marvelsnap.helpshift.com/hc/en/3-marvel-snap/faq/63-how-do-i-change-my-avatar-card-back-or-title/) / [確認した画像](https://d2duuy9yo5pldo.cloudfront.net/marvelsnap/e200a81b-dae0-4194-b445-37ffb4cc1484.jpg)

- 優先順位：中央の新カード・イベントと、下部のPlayが異なる役割を持つ。
- CTA：Playは下部に固定され、デッキ選択と接する。
- モード：常設機能とイベントの入口を分離。
- デッキ：Playの左で選択中のデッキを確認でき、編集へ進める。
- プレイヤー情報：上端のアバター・進行・通貨に集約。
- ナビ：下部ナビ。CollectionとMainの役割を分ける。
- 文字・色・質感：斜めの輪郭・濃色の地・明瞭な見出し。固有の紫色や形は複製しない。
- 片手操作：デッキの確認とPlayが近く、操作の移動距離を短くできる。
- アート統合：カードが宣伝と収集動機を兼ねる。本作では販促カードより「使うデッキ」を優先。

## Hearthstone — 2015年のモバイル画面（歴史的比較）

[掲載元](https://gametrends.blogspot.com/2015/04/hearthstone-mobile-phones.html) / [確認した画像](https://4.bp.blogspot.com/-fR1qOK0zTVA/VTH7pNFSlPI/AAAAAAAACAs/eYS5F0Cr1fc/s1600/Screenshot_2015-04-18-13-44-31.png) / [メニューの解説](https://hearthstone.wiki.gg/wiki/Main_menu)

- 優先順位：中央のPlay・Solo・Arenaを大きく読み分ける。
- CTA：一つの開始CTAではなく、行き先をそのまま大きなボタンにする。
- モード：縦のボタン列で選択、その先で準備する段階式。
- デッキ：My Collectionへ分離。ホームにデッキ全体を並べない。
- プレイヤー情報：通貨・フレンド等は周辺へ退避。
- ナビ：常設の端ボタンと中央モード一覧。縦画面用にそのまま縮める方法は採らない。
- 文字・色・質感：物理的な盤と操作を一体化。木や金属の量より、役割が明確な形が参考。
- 片手操作：横画面の端操作が前提。375px縦画面では下部の操作域へ再構成が必要。
- アート統合：UI自体をゲーム世界の道具として表現。羊皮紙や装飾の直接移植はしない。

## Pokémon TCG Pocket — 2024年公開のBattle / Solo画面

[画面掲載の分析](https://www.pocketgamer.biz/game-analysis-the-winning-formula-behind-pokmon-trading-card-game-pocket/) / [確認した画像](https://media.pocketgamer.biz/images/130816/85314/jakub-remiar-pokemon-tcg-pocket-feature-image-3_orig.webp) / [公式操作FAQ](https://support.pokemon.com/hc/en-us/articles/30330309361172-Pok%C3%A9mon-TCG-Pocket-Gameplay-FAQ)

- 優先順位：対戦・ソロの区別と、個々の行き先を先に示す。
- CTA：ホームから即試合ではなく、対戦形式→準備→開始の段階式。
- モード：大区分と個別マッチを異なる階層へ整理。
- デッキ：対戦画面下部にDecks。収集画面と対戦準備を接続する。
- プレイヤー情報：対戦の選択と競合させず、グローバル機能へ分離。
- ナビ：下部の常設ナビと、画面内の補助操作を分ける。
- 文字・色・質感：余白・見出し・細い境界で機能を分ける。白色を本作へ直輸入する理由にはしない。
- 片手操作：デッキ・戻る・ミッションは下部に配置。階層を増やしすぎない注意も必要。
- アート統合：イベントのカードとラベルが同じ行き先を説明。意味のない背景画像を足さない。

## Legends of Runeterra — 2020年の横画面ホーム

[レビュー掲載元](https://www.techtudo.com.br/review/review-legends-of-runeterra-lor-sem-inovar-jogo-acerta-em-cheio-na-diversao.ghtml) / [確認した画像](https://s2-techtudo.glbimg.com/ccGLpBvcvintzuSKzFyFQMnGdAo%3D/0x0%3A1599x899/984x0/smart/filters%3Astrip_icc%28%29/i.s3.glbimg.com/v1/AUTH_08fbf48bc0524877943fe86e43087e7a/internal_photos/bs/2020/H/x/ITsBjkR9yWF2rKGUzWnw/lor2.jpeg) / [Homeの機能解説](https://wiki.leagueoflegends.com/en-us/LoR:Home)

- 優先順位：中央の世界観アートと、左の機能ナビを分離。
- CTA：Playはナビ内で明確な行き先。準備は次の画面へ。
- モード：ホームに全形式を敷き詰めず、Playの配下へ置く。
- デッキ：Collectionの配下。中央のアートをカード一覧で覆わない。
- プレイヤー情報：アバターと通貨は上端。
- ナビ：左の固定列。PC対応時の原則として採用し、スマホでは下部へ移す。
- 文字・色・質感：濃い周辺部と明るい中央、少ない罫線で視線を制御。
- 片手操作：横画面が前提のため、そのまま縦画面へ移植しない。
- アート統合：世界観を一つの景色で示す。本作では城同士の戦いがわかる小さな戦場へ置き換える。

## Castle Fieldに採用する原則

1. 下部の一つの開始CTA、その直上に対戦形式と使用デッキを置く。
2. 通常／4陣営（ルールセット）と、ソロ／カジュアル／同じ端末（遊ぶ相手）を別の概念として扱う。
3. ホームのカードは識別に必要な数だけ。デッキ全枚数はデッキタブへ。
4. プロフィール・通貨は一度だけ。シーズン・ランクは同じ場所にまとめる。
5. 操作面と背景を分離し、文字の背後に細かい絵を置かない。
6. 大きな絵は「これから遊ぶ戦場」を説明するために用意する。飾りのパネルは増やさない。
