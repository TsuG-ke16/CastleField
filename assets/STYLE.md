# 絵柄の決まり

キャッスルフィールドの画像は、すべてこの決まりでそろえる。

## 絵柄

- 明るいカートゥーン調のファンタジー（スマホゲームのような、くっきりした絵）
- 太めのこげ茶の輪郭線、やわらかいアニメ塗りの影
- 2頭身のちびキャラ。小さく表示しても形がわかる、シンプルな形
- あたたかく明るい色
- プレイヤーの色：p1 は空色（SKY BLUE）、p2 は夕焼けオレンジ（SUNSET ORANGE）
- 文字は絵に入れない（文字は画面側で重ねる）

## 画像生成AIの使い方

1. 最初に「絵柄の見本」を作り、気に入ったものを `assets/style-reference.png` として保存する
2. 2枚目以降は、見本の画像を添付して「この絵柄で」と伝え、下の「共通の指示文」を先頭に付ける
3. 背景は透明にする。できないAIなら白背景で作り、あとで背景を消す

### 絵柄の見本（最初に1回だけ）

```
Style reference sheet for a 2D fantasy mobile card battle game.
Bright cartoon fantasy style, thick dark-brown outlines, soft cel shading,
warm and cheerful colors, cute chibi proportions, clean shapes readable at small sizes.
On one sheet: a small stone castle with a blue flag, a chibi foot soldier with a sword,
a chibi knight on a small horse, a fireball, a small green meadow tile with a dirt path.
Plain light background, no text.
```

### 共通の指示文（2枚目以降は毎回、先頭に付ける）

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
```

## 素材ごとの指示文

### 背景（`bg/board.png`、9:16）

```
Vertical 9:16 game board background. A sunny fantasy meadow seen from 3/4 top-down view.
One winding dirt road runs from the top edge to the bottom edge through the center.
On the road, 5 evenly spaced round stepping stones. The middle (3rd) stone is larger,
surrounded by a ring of small flowers and mushrooms, like a special spot.
Trees, bushes and flowers only near the left and right edges. Leave empty space at the
top and bottom for castles. No castles, no characters, no text.
```

### 城（`castles/castle-blue.png`、`castles/castle-orange.png`）

```
A cute chubby fantasy stone castle, front view, round towers on both sides,
a tall center tower, pointed roofs and a waving flag in SKY BLUE.
Small arched wooden gate. Transparent background.
```

オレンジ版は `SKY BLUE` を `SUNSET ORANGE` に変える。壊れ具合は「with a few cracks」「half collapsed, broken towers」を足して作る。

### 兵士（`units/infantry-blue.png` など）

```
Chibi foot soldier, big round head with a metal helmet and a SKY BLUE plume,
SKY BLUE tunic, holding a short sword raised, brave cute expression,
full body, facing the viewer. Transparent background.
```

```
Chibi knight riding a small chubby horse, metal helmet with a SKY BLUE plume,
holding a SKY BLUE shield and a lance, full body, facing the viewer.
Transparent background.
```

### カードの絵（`cards/card-<カード種類>.png`、1:1）

```
Square card illustration for a fantasy card game, [内容], centered,
simple soft background vignette, no text, no frame.
```

| ファイル | [内容] |
|---|---|
| `card-infantry.png` | a chibi foot soldier charging with a sword |
| `card-knight.png` | a chibi knight galloping on a small horse |
| `card-fireball.png` | a big swirling fireball with a cheeky face |
| `card-thunder.png` | a dark cloud shooting a bright yellow lightning bolt |
| `card-heal.png` | a glowing pink heart surrounded by green sparkles |

### カードの枠（`cards/frame-<レアリティ>.png`、2:3）

```
Empty card frame for a fantasy card game, 2:3 portrait. [種類].
Square window in the upper half for an illustration, blank banner area below for a name,
small round medallion slots in the top-left and top-right corners. No text.
```

- 兵士：Sturdy wooden frame with metal corner rivets
- 魔法：Lavender magic scroll frame with small gold stars

### 魔物のカード（ルビー色。`cards/frame-beast.png`・`cards/window-beast.png`）

魔物の駒のカードは、**「魔物＝ビースト＝赤」なので、ルビーのような赤い宝石の見た目**にする（いまは翡翠色＝緑。人間の指示で作り替え）。枠と窓の2枚。窓・帯・メダルの位置は、いまの `frame-beast.png` と同じにする（`js/ui/config.js` の `card.layout` を変えなくてすむように）。

```
[共通の指示文] Empty card frame for a fantasy card game, 2:3 portrait, 512x768, transparent background.
Ruby-red beast card: the frame looks carved from a deep crimson ruby with gold trim,
faceted red gemstones set at the top and in the corners, a gold paw-print medallion at the top center,
dark wine-red carved wood-and-crystal border, sharp claw-like ornaments, a faint glowing red light from the gems.
Square window in the upper half for an illustration, blank cream banner area below for a name,
small round medallion slots in the top-left and top-right corners. No text.
```
- `cards/frame-beast.png`（512×768、透過）：上の指示文。いまの緑の枠と同じ配置で、色だけでなく**宝石らしい面の反射・金のふち・爪の飾り**で「ルビー」だと分かるようにする
- `cards/window-beast.png`（512×512。絵の窓の背景。不透明）：

```
[共通の指示文] A square background for a card illustration window, 512x512,
deep ruby-red glowing mist with dark crimson crystal shards and faint ember sparkles at the edges,
bright soft red-orange glow in the center, the center area plain and empty, no text, no characters.
```
- 絵ができたら：`assets/CREDITS.md` に出どころを書き、`node js/ui/build-card-relief.js` で `cards/relief/frame-beast-*.png` を作り直す（先に `js/ui/build-card-relief.js` の `beast` の `organic` / `gemHue` を緑（70〜140・120〜170）から赤（335〜15）に直す）。画面側の緑の色（`css/beast.css` の枠・駒の影・仲間になる演出の `recruit-*`・`.beast-insignia` の `#1f624e` など）も赤に直す。最後に `node js/ui/build-precache.js` を回す
- 魔物そのものの絵（`cards/card-beast-<魔物>.png`、`units/monster-<魔物>.png`）は、いまのまま使う

### 解毒薬の絵（`cards/card-antidote.png`、1:1）
いまは仮の絵（`js/ui/art.js` の `antidote`）が出ている。カードの絵と同じ共通の指示文で作る：

```
Square card illustration for a fantasy card game, a small round glass potion bottle with a cork stopper
filled with glowing green antidote liquid, a few green sparkles and a tiny white cross-shaped leaf sprig floating around it,
a faint curl of purple poison smoke being dispelled behind it, centered,
simple soft background vignette, no text, no frame.
```
- 解毒薬はスペシャル（虹色の枠）のカードなので、絵は**緑の薬びん**で、枠から浮かないようにする
- 絵ができたら `assets/cards/card-antidote.png` に置き、`assets/CREDITS.md` に出どころを書く。画像の一覧（`js/ui/art.js` の `CARD_TYPES`）に `antidote` が入っているか確かめ、`node js/ui/build-precache.js` を回す

### 演出（`fx/`）

```
Cartoon game effect sprite, [内容], bright colors, transparent background.
```

| ファイル | [内容] |
|---|---|
| `explosion.png` | a round explosion burst with orange flames and white sparks |
| `lightning.png` | a jagged yellow lightning strike hitting the ground |
| `heal.png` | a green healing sparkle burst with small hearts |
| `dust.png` | a puffy brown dust cloud from a clash |
| `fireball.png` | a flying round fireball with a short flame tail, cheeky face, seen from the side |

- `fireball.png` ができるまでは、画面側（`js/ui/assets.js` の `OVERRIDES`）で `cards/card-fireball.png` を丸く切り抜いて代わりに飛ばしている。ファイルを置けば自動で本物に替わる

### ランクの絵（`ranks/`・`frames/`・`skins/back-rank-*.png`）

階級が上がるほど**飾りが増え、光り、豪華になる**ようにそろえる（Iron は素朴な金属 → Champion は王冠・多色の光・羽）。**他作品のランク図柄は参考にしても、形・配色・モチーフを写さない**（オリジナルのモチーフで描く）。階級は 8つ：Iron・Bronze・Silver・Gold・Platinum・Diamond・Master・Champion。

豪華さの目安（全部の絵で同じ段階をそろえる）：

| 階級 | 素材・色 | 飾りの量 | 光 |
|---|---|---|---|
| Iron | くすんだ鉄・灰 | ほとんどなし。リベットだけ | なし |
| Bronze | 銅・茶 | 小さな葉・ふちの彫り | ごく弱い |
| Silver | 銀・青みの白 | 旗・つばさの飾り | 弱い |
| Gold | 金 | 宝石・太陽の輪 | 金のにじみ |
| Platinum | 白金・青緑 | 左右のつばさ・角 | 青緑の光 |
| Diamond | 水晶・青 | 結晶の城・多面の宝石 | 青い反射と火花 |
| Master | 深紅・黒金 | 大きなつばさ・炎・宝玉 | 赤い炎の光 |
| Champion | 白金＋虹色 | 王冠・光の輪・雲・たくさんの宝石 | 虹色の光・きらめき |

`[階級の素材・飾り・光]` には上の表の行を入れる。

```
[共通の指示文] A rank emblem for a ranked ladder tier, [階級の素材・飾り・光],
symmetrical, front view, ornate level matches the tier (higher tier = more ornate), no text.
```
- エンブレム：`ranks/rank-<階級>.png`（256×256 以上の正方形。いまの8枚が仮）

```
[共通の指示文] A circular profile icon frame (ring only, empty transparent center), [階級の素材・飾り・光],
ornament grows with the tier (Iron: plain ring; Champion: crown on top and rainbow glow), no text.
```
- アイコンフレーム：`frames/frame-<階級>.png`（256×256、真ん中は透明。リングは外側 12% に収める）。できたら `css/rank-frames.css` の仮の見た目をやめて画像に差しかえる

```
[共通の指示文] The back of a fantasy playing card, 2:3 portrait, [階級の素材・飾り・光],
the same layout for every tier (border, center emblem), the border and emblem get richer with the tier, no text.
```
- カード裏面：`skins/back-rank-<階級>.png`（512×768。`js/ui/skinArt.js` の一覧に足すと色替えの代わりに出る）
- 絵を足すときは `assets/CREDITS.md` に出どころを書く

### キャラ・魔法のスキン（`skins/char-<キャラ>.png`・`skins/fx-<魔法>.png`）

全キャラ（兵士20・魔物12）と全魔法（53）に、専用スキンが1つずつある（`data/shop.json` の `skin_<キャラ>`・`fxskin_<魔法>`）。いまは色替えだけの仮の見た目。専用の絵は、元の絵と**同じ姿・同じ大きさ・同じ向き**で、色・服・飾り・光だけを変える。

```
[共通の指示文] The same character as the reference image (same pose, size and silhouette), redrawn as an alternate skin:
[スキン名の雰囲気（例：黄金の鎧・氷の結晶・影の装束）], keep the face and role readable at small size, no text.
```
- キャラ：兵士は 256×256（青・オレンジの2色）、魔物は元の `monster-*.png` と同じ大きさ
- 魔法：元の演出（`fx/`）と同じ大きさで、光・弾・雷の色と形だけ変える
- 絵ができたら `js/ui/skinArt.js` の一覧に足して、色替えから差しかえる。足したら `assets/CREDITS.md` に出どころを書く

### 画面の部品（`ui/`）

```
Fantasy mobile game UI element, [内容], cartoon style, transparent background, no text.
```

| ファイル | [内容] |
|---|---|
| `button-end-turn.png` | a wooden plank button with notched ends |
| `sign-hp.png` | a small wooden signboard on a post |
| `banner-win.png` | a red ribbon banner with a gold crown above it |
| `page-handover.png` | an old parchment page with a slightly curled corner |
| `panel-parchment.png` | a horizontal parchment panel with a simple brown border. The border pattern is uniform all around (same thickness and pattern on every side, plain rounded corners), and the center area is completely plain parchment with no marks, so it can be stretched as a 9-slice |
| `icon-heart.png` | a small chubby red heart icon, simple and bold, readable at 16px |
| `icon-sword.png` | a small short sword icon pointing up-right, silver blade and gold guard, simple and bold, readable at 16px |
| `card-back.png` | the back of a fantasy playing card, 2:3 portrait, warm wooden-brown with a gold star emblem in the center and a gold border |

#### 画面の部品の大きさと、文字が乗る場所

画面側で文字や数字を重ねるので、次の場所はあけておく。

| ファイル | 大きさの目安 | 文字が乗る場所・注意 |
|---|---|---|
| `button-end-turn.png` | 512×192 | 板の真ん中に「ターン終了」「もう1回」「使う」などを重ねる |
| `sign-hp.png` | 256×256 | 看板の板（上から 15〜60% あたり）にHPの数字を重ねる |
| `page-handover.png` | 768×1024 | 内側（上下左右 12% より内側）に文字と城の絵を重ねる |
| `banner-win.png` | 1024×512 | 帯の部分（上から 45〜80% あたり）に「プレイヤー1の勝ち！」を重ねる。王冠は帯の上 |
| `panel-parchment.png` | 512×256 | 9分割で伸ばす。ふちの幅は 56px 以内に収め、真ん中は無地にする（`js/ui/config.js` の `panel.slice` と合わせる） |
| `icon-heart.png`、`icon-sword.png` | 128×128 | 兵士の足元とカードのメダルに 13〜16px で出す。細かい模様は入れない |
| `card-back.png` | 512×768 | 相手の手札・山札・捨て札の束に、小さく（幅 21px ほど）出す |

- カードの枠（`frame-*.png`）は、絵の窓・名前の帯・左右のメダルの位置を `js/ui/config.js` の `card.layout` に合わせる（窓：左 12%・上 13%・幅 76%・高さ 50%、名前の帯：上から 75% を中心に高さ 14%、メダル：左右とも上から 10%・横 14% と 86%）。位置が違う枠を作ったら、`card.layout` の数値を直す
- 背景（`bg/board.png`）の飛び石は、画面のマスとぴったり合わなくてよい。マスの位置は `js/ui/config.js` の `board.road` で背景に合わせる

### カード裏のスキンを3Dにする手順（拡大表示で裏を見たとき）
- 絵は 512×768、背景が透明の PNG（カードの形がそのまま絵の形）。置き場所は `assets/skins/back-<名前>.png`（`js/ui/skinArt.js` の一覧に足す）
- 手前に浮かせる部分（金の飾り・紋章）の形を切り抜いたマスク `assets/skins/back-<名前>-raised.png`（同じ大きさ。アルファが形）を一緒に置き、`skinArt.js` の `raised` の一覧に足す。マスクがない裏は、浮かない（平らな絵＋つやの光だけ）

## ステージの背景（`bg/stage-<ステージ>.png`、9:16）

ステージ（`data/stages.json`）ごとの盤面の背景。`stage-lava.png`・`stage-ice.png`・`stage-ruins.png`・`stage-dark-forest.png`・`stage-desert.png`（草原はいつもの `board` の絵）。
置いて `assets/asset-manifest.json` に足せば、`js/ui/Renderer.js` の `setStage` が自動で使う（ないあいだは `css/stage.css` のグラデーションで描く）。
1080×1920、不透明、300KB 以下。真ん中を縦に3本の道が通り、上下に城が立つ前提で、**城・飛び石・文字は描かない**（画面側で重ねる）。左右の端に景色の飾りを寄せ、真ん中は落ち着いた色にする。

共通の指示文のあとに：

```
Vertical 9:16 battlefield background for a mobile card game, 3/4 top-down view,
an open central area for three vertical lanes, decorations only near the left and right edges,
no castles, no stepping stones, no characters, no text, opaque background.
```

- 溶岩：`A volcanic field of dark red basalt with glowing orange lava cracks and small lava pools, drifting smoke near the edges.`
- 氷：`A frozen glacier field of pale blue ice with white cracks, snow drifts and ice crystals near the edges, light snowfall.`
- 古代遺跡：`Ancient ruins on sandy stone paving, broken pillars and fallen stone blocks near the edges, faint purple magic glow in the center.`
- 闇の森：`A dark enchanted forest clearing with mossy teal ground, twisted trees and glowing purple mushrooms near the edges, soft teal light in the center.`
- 砂漠：`A sunny desert with golden sand dunes and wind ripples, small rocks and dry plants near the edges.`
