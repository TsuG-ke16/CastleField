# Codex への依頼：カードの絵の描き直し（v2・UI担当）

あなたはブラウザカードゲーム「キャッスルフィールド」の **カードの絵** を担当します。画像生成ツールで絵を作り、ゲームに組み込み、実画面で確かめてください。**枚数より品質**です。

## 最初にやること

1. `CLAUDE.md`、`assets/STYLE.md`、`assets/DESIGN.md` を読む。監査の結果は `assets/review/visual-audit-v2/README.md` にある
2. ブランチ `claude/castlefield-card-visual-v2-4tbi0k`（PR #114）を取り込み、その上に `feature/card-art-v2` を作る。main に直接コミットしない
3. 起動：`python3 -m http.server` → `http://localhost:8000/?local=1&cpu=hard&debug=1&seed=8`

## 触っていい範囲

- 触る：`assets/cards/`、`assets/CREDITS.md`、`assets/review/visual-art-v2/`（新しく作る）、`js/ui/precache.js`（自動生成）
- **触らない**：`js/game/`、`data/`、`tests/`、`server/`、`CLAUDE.md`、CSS・JS（3Dカードの別チームが作業中）、`assets/review/card-materials/`
- 新しい絵を画面で使うのに `js/ui/art.js` などの変更が要るときは、変えずにPRの説明に書く

## 作るもの（この順に。1つの区切りごとに確かめてコミット）

| 順 | ファイル（`assets/cards/`） | 大きさ | 何をするか |
|---|---|---|---|
| 1 | `card-beast-<種類>.png` ×12（bat・slime・goblin・skeleton・golem・demon・dragon・ghost・treant・mimic・vampire・demon-king） | 512×512 | 今は256pxで粗い。**デザイン・色・ポーズ・緑のたすきと紋章を変えずに**描き直す。まず slime 1枚で絵柄を確かめてから残りへ |
| 2 | `card-fire-king`、`card-water-king`、`card-great-water-spirit`、`card-great-fire-spirit`、`card-great-wind-spirit`、`card-king-treasure`、`card-god-shield`、`card-wind-spirit` | 512×512 | 絵が画像の端で切れている。上下左右に8%の余白をとって、同じデザインで描き直す |
| 3 | `card-mana-shard`（コモン）、`card-mana-drop`（アンコモン） | 512×512 | 今は小さい絵を拡大した暫定版。描き直す |
| 4 | `card-weather-call` | 512×512 | 今は448px。同じデザインで描き直す |
| 5 | `frame-beast.png` | 512×768 | 今は448×672。デザインはそのまま、窓・名前の帯・左右の丸を `frame-rare.png` と同じ位置・大きさに |

ここまで終わったら報告して止める（勇者・適応の2.5D版、ガチャ、スキン、日本モードは、次に頼むまで作らない。依頼文は `assets/review/visual-audit-v2/prompts.md`）。

## 生成のしかた

- 毎回 `assets/style-reference.png` を参照画像に使い、描き直しでは**今の絵も参照画像に使う**
- 依頼文の先頭に必ず付ける：
```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
```
- 描き直し（1・2・4）：
```
Redraw the attached illustration at 512x512 with crisper detail.
Keep the exact same design, pose, colors and accessories.
The whole subject and all effects stay inside the square, about 8-10% empty margin
on every side. Transparent background, no text, no frame.
```
- マナのかけら：
```
Square card illustration, 512x512: a single small glowing blue mana crystal shard
(common rarity, humble and simple), with two or three tiny sparkles.
The object fills about 70% of the square. Transparent background, no text, no frame.
```
  しずくは `a single glowing blue mana droplet with a swirl of light inside (slightly richer than the shard)`

## 受け取った画像の確かめ方（全部やる。合わなければ作り直す）

1. **本当に透明か**：アルファ値を調べる（市松模様が描き込まれていないか、四隅が透明か）。白背景で出てきたら、外側の背景だけを消す（絵の中の白い部分を消さない）
2. **薄いもやが残っていないか**：不透明度1〜8のピクセルが画像に広く残っていたら0にする（前回28枚で見つかった不良）
3. **端で切れていないか、手足・武器が欠けていないか**
4. **元の絵と同じキャラクターか**（顔・色・持ち物）。絵柄・線の太さが他のカードとそろっているか
5. 市松模様・暗い背景・明るい背景の3通りに並べて目で見る
6. 1枚300KB以下。今のカードと同じく **256色パレットのPNG**（アルファ付き）で保存する。半透明のふちに色が残らないよう、透明なピクセルの色は0にする

## 組み込みと確認

- 同じファイル名で置き換える（画像の割り当て `js/ui/art.js` は変えなくてよい）
- 実画面で見る：ブラウザのコンソールで
  `const g=castlefield.game(); for (const p of g.getState().playerOrder) g.debugSetHand(p, ['beast_slime','beast_dragon','fireKing','manaShard']); castlefield.refresh();`
  （魔物の駒の種類は `beast_<魔物の種類>`、ほかは `data/cards.json` のキー）。手札・図鑑の詳細・長押しの拡大で見る。390×844 で撮る
- 比較画像を `assets/review/visual-art-v2/` に置く：変更前／変更後、手札の大きさ、拡大、暗い背景・明るい背景
- `assets/CREDITS.md` に、ファイル名・使った画像生成ツール・ライセンス・作った日・原本のファイル名を書く
- `node js/ui/build-precache.js` で PWA の一覧を作り直す
- `node --test` と `node ui-tests/smoke.js` が通ることを確かめる

## PR

- 区切りごと（例：魔物の駒12枚）にコミットして push。PRは `feature/card-art-v2` から main へ。PR #114 の続きであることを書く
- 説明には、作ったファイル、比較画像の場所、作り直した回数と理由、うまくいかなかったものを書く
- 自分でマージしない
