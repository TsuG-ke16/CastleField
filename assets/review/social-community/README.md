# フレンド・プロフィール・ミッション・結果

| 画面 | 変更前 | 変更後 |
|---|---|---|
| フレンド一覧 | [前](before-social-friends.jpg) | [後](after-social-friends.jpg) |
| 対戦招待 | [前](before-social-invite.jpg) | [後](after-social-invite.jpg) |
| プロフィール | [前](before-profile.jpg) | [後](profile-390.png) |
| デイリーミッション | [前](before-missions-daily.jpg) | [後](missions-390.png) |
| ミッション報酬受け取り | [前](before-missions-weekly.jpg) | [後](after-missions-weekly.jpg) |
| 対戦結果 | [前](before-ranked-result.jpg) | [後](after-ranked-result.jpg) |

[パーティー](party-390.png)も確認した。小画面は [プロフィール](profile-320.png)・[ミッション](missions-320.png)・[フレンド](social-320.png)、横向きは [プロフィール](profile-844.png)・[ミッション](missions-844.png)・[フレンド](social-844.png)。

## ImageGen の指示

参照画像は `assets/style-reference.png`。

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
One transparent sprite sheet, three columns, two rows, six separate circular stained parchment portrait medallions. Row 1: smiling infantry in a blue cap and silver helm; lancer with red plume and spear shaft; knight in a blue plumed helm. Row 2: green hooded archer; gentle young purple robed wizard; sunny gold-crowned heroic adventurer. Front-facing face-and-shoulders compositions, original art, framed in thin brass rims, abundant transparent gutters, no text. All six independently centered.
```

## 検証

指定6画面サイズでフレンド・プロフィール・ミッションの横はみ出しがなく、一人のパーティーでは開始理由が表示されることを確認した。対戦結果は通常の認定戦に加え、[昇格時の演出](promotion-example.jpg)をテスト用のAPI応答で表示し、押すと演出を閉じられることを確認した。

`node --test` 349件と、`smoke.js`、`account.js`、`ranked.js`、`social.js`、`collection.js`、`missions.js` が成功した。
