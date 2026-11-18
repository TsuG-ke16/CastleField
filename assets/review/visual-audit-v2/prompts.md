# 画像生成の依頼文（v2）

この環境では画像生成ツールにつながらなかったので、作る順番と依頼文をここにまとめた。ChatGPT などで作ったら、`assets/` に入れて `CREDITS.md` に書き、`node js/ui/build-precache.js` を回す。

**毎回の決まり**
- `assets/style-reference.png` を添付し、`assets/STYLE.md` の「共通の指示文」を先頭に付ける
- 今ある絵を作り直すときは、その絵も添付して「このキャラクターのデザイン（顔・服・色・持ち物）を変えずに」と書く
- 受け取ったら：市松模様・暗い背景・明るい背景の3通りで見る／透明が本物か（市松模様が描き込まれていないか）／端で切れていないか（上下左右に1割の余白）／300KB以下か／実画面で枠の窓に入れて見る

## 1. まず直すもの（今ある絵の作り直し）

### 魔物の駒 12枚を 512×512 に（`cards/card-beast-<種類>.png`）
```
[共通の指示文]
Redraw the attached character at 512x512 with crisper detail.
Keep the exact same design, pose, colors, green sash and crest.
Full body, centered, about 10% empty margin on every side.
Transparent background, no text, no frame.
```

### マナ回復の系統（かけら・しずく）
```
[共通の指示文]
Square card illustration: a single small glowing blue mana crystal shard
(common rarity, humble and simple), with two or three tiny sparkles.
The object fills about 70% of the square. Transparent background, no text, no frame.
```
しずくは `a single glowing blue mana droplet with a swirl of light inside (uncommon, slightly richer than the shard)`。

### 端で切れている8枚
炎の王・水の王・大水の精霊・大火の精霊・大風の精霊・王の財宝・神の盾・風の精霊。今の絵を添付して：
```
Redraw the attached illustration with the whole subject and all effects inside the square,
about 8% empty margin on every side. Keep design, colors and pose unchanged.
Transparent background.
```

### 天候の呪文（512×512）と魔物の枠（512×768）
天候の呪文は今の絵を添付して512で描き直す。魔物の枠は `frame-rare.png` を添付して「窓・名前の帯・左右の丸を同じ位置に」と指定する。

## 2. 代表カードの完成版（2.5D 用に分けて作る）

最初は **勇者（レジェンド）** と **適応（スペシャル）** の2枚だけ。仕上がりを見てから広げる。1枚につき3つの画像を、同じ構図で作る。

| 層 | ファイル | 中身 |
|---|---|---|
| 背景 | `cards/layers/<種類>-bg.png`（512×512、不透明） | 景色だけ。人物・文字なし |
| 主役 | `cards/layers/<種類>-main.png`（512×512、透明） | 今のカードの絵と同じキャラクター |
| 前景 | `cards/layers/<種類>-fx.png`（512×512、透明） | 光の粒・炎・魔法陣など、手前に浮かぶもの |

勇者の背景：
```
[共通の指示文 ただし transparent background を外す]
Square background plate for a legendary card: a sunlit castle courtyard with
golden banners and soft god rays, slightly blurred, no characters, no text.
Leave the center lower half calm so a character can stand there.
```
勇者の主役は今の `card-hero.png` を添付し、「このキャラクターを、マントがなびく英雄らしい立ちポーズで。足元まで全身、透明背景」。前景は「golden light particles and a few floating sparkles only, transparent background」。

## 3. カード裏面・ガチャ・コレクション

| ファイル | 大きさ | 依頼の要点 |
|---|---|---|
| `ui/card-back.png` | 512×768、全面 | 今の裏面を添付。「同じデザインをカード全面に。角は丸く、外側は透明」 |
| `ui/gacha-burst-<レアリティ>.png` ×6 | 1080×1080、透明 | 中央から広がる光。コモン＝白い小さな光、アンコモン＝緑、レア＝青と星、エピック＝紫と火花、レジェンド＝金・王冠の形の光・大きな放射、スペシャル＝虹と真珠色。中央に文字なし |
| `ui/gacha-result-plate.png` | 1080×720、透明 | 10枚（5×2）を置く、木と金の台。カードの場所は空ける |
| `ui/badge-new.png` | 128×64、透明 | 赤いリボン型の札。文字は画面で重ねるので、絵には入れない |
| `bg/collection.png` | 1080×1920 | 本棚とカードを飾る壁。真ん中は静かに（カードを並べる） |

未所持の表示は、画像を作らず CSS（灰色・暗く）でやる。

## 4. スキン（試作は1枚×3種だけ）

歩兵だけで「黄金」「氷結」「桜」を作り、能力が変わったように見えないこと・歩兵だと分かることを確かめてから広げる。
```
[共通の指示文]
Same character as the attached infantry card, same pose and silhouette,
in a GOLDEN skin: polished gold armor with small engravings, warm glow.
Transparent background, no text.
```
`GOLDEN` を `ICE (pale blue crystal armor, frost)`・`SAKURA (pink cherry blossom motif, petals)` に変える。ファイル名 `cards/skins/<スキン>/card-infantry.png`。

## 5. 日本モードの試作（企画の確認用。能力は決めない）

足軽・侍・忍者・妖狐の4枚と、和風の枠（コモン・レジェンド）の2枚。
```
[共通の指示文]
Japanese fantasy version of the attached infantry: a chibi ASHIGARU foot soldier
with a jingasa hat, simple lamellar armor and a yari spear, SKY BLUE accents.
Full body, centered, transparent background, no text.
```
枠は `frame-common.png` / `frame-legendary.png` を添付して：
```
Redraw this card frame in a Japanese castle style (wood, lacquer, gold fittings,
cherry blossoms for legendary). Keep the art window, the name banner and the two
round medallions in exactly the same positions and sizes. Transparent window. No text.
```
