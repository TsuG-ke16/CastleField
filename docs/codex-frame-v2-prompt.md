# Codex への依頼：レアリティの枠を全部作り直す（v2・UI担当）

あなたはブラウザカードゲーム「キャッスルフィールド」の **カードの枠** を担当します。コモン・アンコモン・レア・エピック・レジェンド・スペシャルの6枠と魔物の枠を作り直し、ゲームに組み込み、実画面で確かめてください。**このゲームで今いちばん見た目が弱い所**です。枚数より品質。

## 今の問題（実画面で確認済み）

1. **レアリティが高いほど絵の窓が小さい**：レジェンドは幅67%・上から26%、コモンは幅71%・上から17%（`css/rarity-assets.css` の `--win-*`）。いちばん良いカードの絵がいちばん小さい
2. **窓の中がどのレアリティも白っぽい無地**：白い紙にアイコンを置いたように見え、集めたくなる豪華さがない
3. **下の数値の帯（攻撃・HP・速さ）が枠の下の飾りに重なる**：レジェンドは下の宝石が隠れ、右端の数字が切れる
4. **コモン・アンコモン・レアは形がほぼ同じで、違いが色だけ**

## 最初にやること

1. `CLAUDE.md`、`assets/STYLE.md`、`assets/DESIGN.md` を読む
2. 最新の main と、`feature/card-art-v2` を取り込み、`feature/card-frame-v2` を作る。main に直接コミットしない
3. 起動：`python3 -m http.server` → `http://localhost:8000/?local=1&cpu=hard&debug=1&seed=8`
4. 今の6枠を実画面で撮っておく（変更前）

## 全部の枠に共通の型（いちばん大事）

**窓・丸・名前の帯・数値の台の位置と大きさは、6枠と魔物の枠で全部同じにする。** レアリティで変えるのは、窓の外の飾りだけ。

| 部品 | 位置（512×768 の枠での %。左・上・幅・高さ） |
|---|---|
| 絵の窓（透明に抜く） | 13%・15%・74%・50%（約379×384px。ほぼ正方形） |
| 左右の丸（種類・レアリティのアイコン） | 中心が 横17%／83%、縦13%。直径は枠の幅の16%。今と同じく窓の上の角に少しかぶさる（窓の中の絵が丸で隠れすぎないよう、かぶりは丸の4分の1まで） |
| 名前の帯 | 中心が縦73%、左右14〜86%、高さ12% |
| 数値の台（無地の明るい台。文字は画面で重ねる） | 縦86〜97%、左右16〜84%。**ここには飾りを置かない** |
| レアリティの飾りを置いてよい所 | 窓より上（縦0〜15%）、左右の縁、名前の帯の両はし、数値の台の外側 |

- 最初に、この型を線で描いた **配置の型紙** を Pillow で作る（`assets/review/frame-v2/layout-guide.png`、512×768）。生成のたびに参照画像として添付し、「窓・丸・帯・台をこの位置と大きさで」と指定する。型紙は位置合わせの道具で、本番の絵には使わない
- 生成した枠は、窓・丸・帯・台が型紙と数px以内で合っているかを、アルファ値で調べる。ずれていたら作り直す（引き伸ばしで合わせない）

## レアリティごとの見た目

| レアリティ | 材質 | 窓より上の飾り | 枠の形 |
|---|---|---|---|
| コモン | 木と鉄の鋲。素朴 | 小さな鉄の留め具だけ | まっすぐな四角 |
| アンコモン | 上等な木に、つたと緑の小さな宝石 | 葉の飾りと緑の宝石 | 角に葉の飾り |
| レア | 銀に青い宝石、模様の彫り | 青い宝石と銀の翼の飾り | 角が少しとがる |
| エピック | 紫の金属に金の縁、光る紫の宝石、紋章 | 紋章と紫の宝石。少し光る | 上下に張り出し |
| レジェンド | 彫りのある金、赤い大きな宝石、王冠 | 王冠と大きな宝石。神々しい光 | 上が大きく張り出し、左右に柱 |
| スペシャル | 真珠と虹色。角度で色が変わる前提の帯 | 虹色のひし形の宝石 | ほかと違う独自の形 |
| 魔物（`frame-beast`） | 今のデザイン（木・つた・肉球の紋） | 肉球の紋 | 型だけ共通にする |

- 低いレアリティも手を抜かない。どのレアリティも、輪郭線の太さ・光の向き（左上）・塗りを `assets/style-reference.png` にそろえる
- 窓が狭くならないこと、文字（名前・数値）が読みやすいことを、どのレアリティでも同じにする

## 窓の中の背景（新しく作る）

`assets/cards/window-<レアリティ>.png`（common・uncommon・rare・epic・legendary・special・beast。512×512、不透明）を、絵の後ろに敷く背景として作る。

- コモン＝やわらかい木目と生成り、アンコモン＝草原の緑、レア＝青空と雲、エピック＝紫の夕空と星、レジェンド＝金色の光の放射、スペシャル＝虹色の淡い光、魔物＝森の緑
- **淡く、中央は明るく、絵の邪魔をしない**（絵はこの上に透明背景で乗る）。文字・キャラクターは入れない
- CSS（`css/rarity-assets.css` など）で `.card-art` と `.mini-card` の窓に敷く。今の `background`（`css/theme.css`・`css/rarity-fx.css` の白っぽいグラデーション）は、この画像で置きかえる

## 生成のしかた

- 毎回、`assets/style-reference.png`・配置の型紙・今の同じレアリティの枠を参照画像に使う
- 依頼文の先頭：
```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, warm light from the upper left.
```
- 枠の依頼の例（レジェンド）：
```
A 512x768 trading card frame for the LEGENDARY rarity: carved gold with engraved
patterns, a large red gem and a royal crown above the art window, golden pillars on both sides,
a soft divine glow. Follow the attached layout guide exactly: the art window, the two round
medallions, the name banner and the plain stats plate must be in exactly those positions and
sizes. The art window is fully transparent. Medallion faces, banner and stats plate are plain
light parchment with no text. Transparent outside the card. No text anywhere.
```
- 窓の背景の例（レア）：
```
512x512 soft painted background for inside a card's art window: a bright blue sky with
a few fluffy clouds, very light and low contrast, brighter in the center, no characters,
no objects, no text.
```
- **順番**：レジェンドとコモンを先に仕上げて、2枚を実画面で並べ、型・絵柄・読みやすさが合っているか確かめてから、残りの5枠に進む

## 書き出し

- 枠は 512×768。**アルファ付きのフルカラーPNG（RGBA。パレットPNGにしない）**：3Dの凹凸を作る `js/ui/build-card-relief.js` がパレットPNGを読めないため。300KB以下に収める（色を減らしたいときは、RGBAのまま `optimize`）
- 窓の背景は 512×512、300KB以下（パレットPNGでよい）
- 透明が本物か（市松模様が描き込まれていないか）、窓が完全に透明か、外側に薄いもや（不透明度1〜8）が残っていないかを、アルファ値で確かめる

## 組み込み

触ってよい所：`assets/cards/`、`assets/review/frame-v2/`、`assets/CREDITS.md`、`css/rarity-assets.css`・`css/beast.css`・`css/theme.css`・`css/rarity-fx.css`（窓の位置と背景）、`js/ui/build-card-relief.js`（`FRAMES` の領域）、`js/ui/precache.js`（自動生成）。

1. `css/rarity-assets.css` の `--win-*`・`--med-*`・`--name-y` を、全レアリティ同じ値（上の型）にする。`css/beast.css` も同じ
2. 数値の帯（`.card-short`）を、数値の台の位置（縦86〜97%）に合わせる
3. 3Dの凹凸：`js/ui/build-card-relief.js` の `FRAMES`（宝石・王冠の盛り上がる領域 `raised`、紙の位置 `paper`）を新しい枠に合わせて直し、`node js/ui/build-card-relief.js` で `assets/cards/relief/` を作り直す。`--debug <フォルダ>` の出力を見て、宝石と王冠が浮き、紙の部分が平らになっているか確かめる。**ほかの3Dの JS・CSS（`CardRelief.js`、`hologram.css`、`card-zoom.css` など）は変えない**。変えたくなったら、PRの説明に書く
4. `node js/ui/build-precache.js`
5. `js/game/`・`data/`・`tests/`・`server/`・`CLAUDE.md` には触らない

## 確かめること（全部やる）

- 実画面（390×844 と 360×640）：手札、図鑑の一覧と詳細、長押しの拡大（傾けて凹凸と光を見る）、合成の画面
  - 手札にカードを出すには、ブラウザのコンソールで `const g=castlefield.game(); for (const p of g.getState().playerOrder) g.debugSetHand(p, ['infantry','spearman','heavy','giant','hero','adapt','beast_slime']); castlefield.refresh();`（コモン〜レジェンド・スペシャル・魔物を1枚ずつ）
- 6枠＋魔物の枠の、名前・数値・左右のアイコンが枠の飾りと重ならず、読めること。長い名前も見る。**今は魔物の駒の名前（「ドラゴン（魔物）」など）が手札で「ラゴン（魔物」と両はしが切れ、「魔力のかけら」は名前が MP の札に隠れている**ので、新しい型で直す（文字を縮めすぎず、帯の幅と文字の大きさで収める）
- 比較画像を `assets/review/frame-v2/` に置く：変更前と変更後の手札、7枠を並べた一覧（暗い背景・明るい背景）、拡大、レアリティの順に並べたもの
- `node --test`、`node ui-tests/smoke.js`、`node ui-tests/materials.js` が通ること。通らないテストが画面の変更のせいなら、テストの意図を守って直す。変更前から落ちていたものは、そう書く
- `assets/CREDITS.md` に、ファイル名・使った画像生成ツール・ライセンス・作った日・原本のファイル名を書く

## PR

- 区切りごと（型紙とレジェンド・コモン／残りの5枠／窓の背景／CSSと3Dの地図）にコミットして push する。PRは `feature/card-frame-v2` から main へ出す
- 説明に書くこと：作ったファイル、比較画像の場所、作り直した回数と理由、うまくいかなかったもの
- 3Dカード担当への連絡として書くこと：`FRAMES` を直して `relief/` を作り直したこと
- 自分でマージしない
