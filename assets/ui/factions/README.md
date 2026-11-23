# 4陣営のUI用陣営章

`crest-kingdom.png` / `crest-forest.png` / `crest-demon.png` / `crest-dragon.png` は256×256の透過PNG。陣営選択・デッキ一覧・対戦者の陣営表示用。32〜96pxで使用し、名前を横に表示する。色だけで区別せず、王冠付きの盾・生命樹・角と紫水晶・翼と紅玉の形で区別する。

```html
<span class="faction-label">
  <img src="assets/ui/factions/crest-dragon.png" width="32" height="32" alt="">
  <span>竜族帝国</span>
</span>
```

アイコンの横に陣営名がある場合は `alt=""`、アイコン単独なら `alt="竜族帝国"` などを指定する。選択状態は枠とチェック、キーボードフォーカスはCSSのoutlineで重ね、画像に焼き込まない。プレイヤーの青・オレンジは別の席表示として扱う。

描画例と原画は [素材集](../../review/modeling-kit/index.html)。ゲーム本体の陣営選択画面への接続は、UI実装側で行う。
