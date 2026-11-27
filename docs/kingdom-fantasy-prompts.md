# 王国ファンタジー画像制作プロンプト

> 第1段階の記録です。追加実装・画像制作・現在の検証結果は [第2レビュー対応](kingdom-fantasy-v2.md) を参照してください。旧不足候補61件は現在、生成画像または意味の一致する既存絵へ対応済みです。

最優先は `assets/STYLE.md`。`assets/style-reference.png` と、対応する既存カードを必ず添付する。新規画像をこの変更では生成していない。既存素材を流用して画面は動作する。

## 共通接頭辞

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
Warm cheerful colors, clean silhouettes readable at small sizes.
```

カード絵は枠・文字・陣営を示すだけの宝石や紋章を足さない。武器と魔法は人物を足さない。p1はSKY BLUE、p2はSUNSET ORANGE。王国UIはロイヤルブルー・金・クリーム・茶。宇宙、惑星、HUD、回路、ネオンは使わない。

## クラシック拡張の候補（先に既存絵との対応表を作る）

| 題材 | 直接添付する既存絵 | 共通接頭辞の後ろに付ける文 |
|---|---|---|
| 歩兵 | `cards/card-infantry.png` | Square card illustration, a brave two-head-tall foot soldier holding a short sword, same pose and warm palette as reference, simple soft background vignette, no frame. |
| 騎兵 | `cards/card-knight.png` | Square card illustration, a chibi knight riding a small chubby horse, clearly readable lance and shield, simple soft background vignette, no frame. |
| 火球 | `cards/card-fireball.png` | Square card illustration, one lively swirling orange fireball, flame as the main subject, no caster, no dragon, simple soft background vignette, no frame. |
| 回復 | `cards/card-heal.png` | Square card illustration, a pink heart with a few soft green healing sparkles, effect only, no healer, simple soft background vignette, no frame. |
| 防壁・盾 | `cards/card-shield.png` | Square card illustration, a single sturdy round wooden shield with steel rim, warm wood and simple rivets, no bearer, simple soft background vignette, no frame. |

上記の既存絵がカード内容に一致する場合は新規制作しない。不足候補の32種とIDは `kingdom-fantasy-assets.md` を参照。

## スキルツリーUI（P2）

128×128透明PNG、中央単体。実使用は22〜40pxなので模様は省く。文字やノード番号はHTML/SVG側で重ねる。

| 保存先候補 | 共通接頭辞に続ける文 |
|---|---|
| `ui/skill-cross.png` | A small stone bridge where two warm dirt paths meet, one simple royal-blue pennant, chunky silhouette, no landscape background, no glow. |
| `ui/skill-information.png` | A small brass spyglass resting on a folded cream parchment map, simple bold silhouette, no writing or symbols on the map. |
| `ui/skill-grave.png` | A small rounded gray stone grave marker with a tiny violet flower at its base, friendly fantasy tone, no skull, no letters. |
| `ui/skill-hand.png` | Three overlapping cream playing cards with wooden-brown edges, one simple blue diamond on the front, no text. |
| `ui/skill-ultimate.png` | A small gold crown with one royal-blue jewel and two short cream ribbon tails, no light rays, no frame or lettering. |

通常枠は円、奥義は大菱形、横断は六角形を維持。枠と線はCSS/SVGで十分なので背景付き画像にしない。

## 作戦図背景（必要になった場合のみ）

背景は透過の共通接頭辞を使わず、次を使う。

```
Bright cartoon fantasy game UI background matching the supplied reference.
Warm plain cream parchment, subtle soft paper grain, thick dark-brown wooden
border only at the outer edge, a small royal-blue banner and gold rivets at
corners. Large completely blank central area for a 200-node skill tree.
No text, no map markings, no lines, no characters, no stars or planets,
no neon, opaque background. Keep texture contrast very low.
```

採用時は `assets/CREDITS.md` に出どころを記録し、必要に応じてmanifest・対応コードを追加、`node js/ui/build-precache.js` を実行する。人物、道具、魔法の主役が混ざっていないか既存カードと横並びで確認する。
