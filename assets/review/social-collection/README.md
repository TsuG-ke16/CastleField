# ショップ・ガチャ・スキンの比較

- [ショップ・変更前](before-shop.jpg)／[変更後](shop-390.png)
- [所持品・変更前](before-collection.jpg)／[変更後](after-collection.jpg)
- [ガチャ結果・変更前](before-gacha-result.jpg)／[開封前](sealed-390.png)／[10連開封後](reveal-390.png)
- [城を装備した対戦盤面・変更前](before-skin-in-game.jpg)／[変更後](after-skin-in-game.jpg)
- [320×568](shop-320.png)・[844×390](shop-844.png)の見本

景品33種をすべて収録した。指示書には城6種とあるが、対象ブランチの景品データには城5種が定義されている。兵士の専用画は歩兵に使い、兵種が分かるよう、ほかの兵士には既存の色替えを使う。城の専用画は標準城の無傷状態で使い、損傷後や種類の異なる城には既存の色替えを使う。称号の図柄はショップや所持品の見本に表示する。

## ImageGen の指示

各生成の参照は `assets/style-reference.png`。

### unit

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
A production asset sheet, landscape 3:2 canvas containing exactly 3 columns by 2 rows, one sprite per cell, six sprites total. Consistent small-scale game asset composition, fully transparent outside each sprite, generous 10% blank padding on each cell edge, no labels or gridlines. The sprites are six different armored two-head-tall infantry skins of one original kingdom swordsman, each standing with sword visible, facing camera slightly left. Cell order: 1 furnace-iron armor with flame-shaped crimson helmet, 2 green forest leather armor with leaf brooch and antler crest, 3 frosted steel with icy shoulder plates and white fur, 4 royal purple armor with embroidered gold surcoat and plume, 5 elaborate gold sun armor, 6 shadow obsidian knight with silver eyes and dark purple wrap. Strong recognizable shapes with same height, matching the illustration reference.
```

### castle

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
A production asset sheet, landscape 3:2 canvas containing exactly 3 columns by 2 rows, one sprite per cell, six sprites total. Consistent small-scale game asset composition, fully transparent outside each sprite, generous 10% blank padding on each cell edge, no labels or gridlines. Six fully distinct front-facing three-towered chibi castle skins with central readable gate and flags. In order: 1 crimson lava fortress with brass roofs and carved fire motifs; 2 forest refuge of mossy stone, timber and climbing vines; 3 sapphire ice castle with white snow and clear frosted roofs; 4 ivory stone royal purple castle with lavender turrets and gold banners; 5 elaborate sun-gold palace with bronze dome and ivory pillars; 6 purple-black obsidian castle with jagged roofs and violet glow in the gateway. Silhouettes stay comparable to reference castle. No landscape, only each building.
```

### ornaments

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
Exactly 4 columns by 4 rows (sixteen isolated items), true transparent gutters, equal square cells. Row 1 four vertical flat card backs with distinct dark outlines and gold borders: red dragon heraldry, green leaf knot, purple star, gold crown. Row 2 four directional isolated magical flame projectiles: emerald green, violet lightning, azure icy swirl, gold sunburst. Row 3 golden confetti burst, blossom petals burst, pastel aurora streamers, small silver key heraldic medal. Row 4 forest hunter beast claw medal, steel defensive tower medal, lucky gold clover medal, crowned castle legend medal. No text or letters and no scenery; all items centered isolated and comfortably within each cell.
```

### portrait

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
Exactly three columns by two rows, six circular profile portraits on transparent background, original chibi fantasy faces in small round gold frames. Row 1 holy paladin with ivory helm, friendly giant with beard, blue youthful mounted scout. Row 2 green-cloaked marksman, mature arcane sage with turban and staff, purple armored dragon rider with drake crest. No lettering, generous clear separation.
```
