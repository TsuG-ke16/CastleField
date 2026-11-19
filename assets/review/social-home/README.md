# ホーム画面の比較

- [変更前](before.png)
- [390×797](after-390.png)、[375×667](after-375.png)、[360×640](after-360.png)、[320×568](after-320.png)
- [横向き 844×390](after-844.png)、[PC 1280×800](after-1280.png)
- [スマホでスクロールしたメニュー](after-menu.png)

ホームのボタンは44px以上。6サイズで横はみ出しがないことを確認した。リンク案内からアカウント画面を開き、ホーム情報への503応答で再試行操作が表示され、応答復旧後に情報が戻ることを確認した。

## 生成に使ったプロンプト

参照画像は `assets/style-reference.png`。どちらも先頭に次の共通指示文を付けた。

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
```

城の背景

```
Wide 3:2 landscape illustration for a welcoming royal strategy game home. Single beautiful highly readable chibi limestone castle with cobalt-blue roofs, gold flags and honey oak gates, on a hill framed by soft green trees and a winding courtyard path, sunny pastel blue sky. Castle centered in the upper-middle, no characters, no interface, no letters. Fill canvas with a landscape scene, no transparent edges needed. Warm soft daylight and strong silhouettes.
```

メニューアイコン

```
Transparent isolated sprite sheet with EXACT 4 columns and 3 rows in a 4:3 canvas, twelve distinct game menu icons, NO labels or tile backgrounds. Each icon fully inside its equal-sized cell, centered with ample empty gutters. Row 1 left to right: tournament shield with gold pennant; crossed blue steel swords; gold award podium. Row 2: three cards fanned; blue red-bound bestiary book; green and gold knight helmet cosmetic. Row 3: two friendly chibi knight heads together; single chibi adventurer portrait medallion; market stall with striped awning. Row 4 is NOT needed: instead make exactly 4 columns by 3 rows, using this definitive row-major order: row 1 shield, crossed swords, gold podium, fanned cards; row 2 blue book, green knight helmet, two knight heads, single adventurer medallion; row 3 striped market stall, magical jewel capsule, quest scroll with seal, iron gear. Keep viewing scale and stroke consistent. Actual transparent alpha, no cast background, no inter-cell connections.
```
