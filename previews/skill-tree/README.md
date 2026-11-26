# Castle Field スキルツリー 独立UIプレビュー

作業ブランチ: `feature/skill-tree-preview`。本体main `b97255f4` から専用worktreeで作成。
変更はこのディレクトリのみ。ゲームのホーム・戦闘・効果・取得条件・既存CSS・サービスワーカー・セーブ領域は変更していない。

**仕様書待ち**: この会話で確認できる添付は前回のQA ZIPのみ。200ノード仕様書は未受領のため、現在の名称・19系統・配線・コスト・取得状態は明示的なレイアウト用フィクスチャ。本番仕様と一致するとは主張しない。仕様書の正確な接続・条件の反映は未完了。

## 開く

リポジトリルートから:

```sh
python3 -m http.server 3000 --bind 127.0.0.1
# http://localhost:3000/previews/skill-tree/
```

追加npmパッケージ・ビルド不要。ES ModulesのためHTTPで開く。

## 既存アートとの対応

- `css/home-reborn.css`: 最新ホームの深い青緑 `#102631` / 面 `#193742` / 水色 `#8ad7de` / 橙 `#f2a347`、角ゴシック、主ボタンの枠・押し込み、シートの装飾を参照。
- `css/tokens.css` をそのまま読込。プレビューCSSはこのディレクトリに分離し、本体のCSSは編集しない。
- `assets/ui/kingdom-crest.png`: ヘッダーと中央ルートの紋章。
- `assets/ui/icon-*.png`、`assets/ui/factions/crest-*.png`、`assets/ui/home/*.png`: 系統・ノード・サイドメニュー。系統の意味付けは仕様書で確定する。
- `assets/cards/frame-rare.png` / `frame-legendary.png`: 詳細カード。奥義に既存の王冠・金縁フレーム。
- ノードは通常の円形と奥義の大型菱形を区別。取得済みは水色＋チェック、取得可能は金色の輪郭、未解放は低彩度。色だけに依存しない。
- 画像は既存素材への相対参照。素材の複製・生成・改変なし。既存ゲームと異なる書体やアイコンライブラリを導入しない。

## 操作・性能設計

- 200ノード・19クラスター。系統一覧で移動、全体表示、ミニマップで移動。
- ドラッグ移動、ホイールズーム、Pointer Eventsによる2本指ピンチ。
- キーボードで移動・ズーム、ノードをTab/Enterで操作。縮小率18〜180%、ズーム中心を保持。
- PCは系統一覧・マップ・詳細の3ペイン。モバイルは横スクロール系統一覧と詳細ボトムシート。
- SVGは初期構築、移動時は単一カメラtransformのみ。requestAnimationFrameで更新を集約、範囲外ノードを非表示、ミニマップはCanvas。常時アニメーションなし。
- ノード詳細、残SP、表示サンプル取得、振り直し確認、名前付きビルド保存・読込（最大20件）。
- localStorageキー `castle-field.skill-preview.builds.v1` のみ使用。仕様IDごとに保存を分離。本体の保存データには触れない。
- モバイルでは操作方法「?」から振り直し・保存済みビルドを開ける。

## 本番仕様の受け渡し

UIの「仕様データ読込」から、以下のスキーマのJSONをローカル読込できる。アップロード通信は行わない。
仕様書がPDFや文書の場合は受領後にID・接続を照合してJSONへ変換する。この読込口だけで仕様書を反映済みとは扱わない。

```js
{
 version: 1,
 id: 'production-spec-revision', // 仕様リビジョンの一意ID
 title: 'スキルツリー',
 maxPoints: 40,                 // 本番から提供。40は例示
 groups: [                     // 必ず19系統
  {id: 'group-id', name: '仕様書の系統名', icon: 'ui/icon-fire.png'}
 ],
 nodes: [                      // 必ず200ノード
  {
   id: 'node-id', name: '仕様書の名称', group: 'group-id', // 中央はnullも可
   kind: 'normal',             // normal / ultimate / root
   state: 'locked',            // acquired / available / locked（本体が提供）
   cost: 1,                   // 本体・仕様書が提供。例示値
   description: '仕様書の効果説明',
   condition: '本番APIが提供する取得条件の説明',
   icon: 'ui/icon-fire.png',
   position: {x: 0, y: 0}      // 任意。未指定時のみクラスター自動配置
  }
 ],
 edges: [{source: 'node-id', target: 'another-node-id'}]
}
```

- JSONは接続端点、重複ID、200件・19系統、型、数値の整合性を検証。
- 接続関係は自動追加・補正・推測せず、渡されたedge配列をそのまま描画する。系統間の接続も保持する。
- 本番データを読むと取得ボタンは無効になり「取得判定API未接続」と表示。本番の合法性をUIで再定義しない。
- サンプルの「取得」は見た目を取得済みにするだけ。他ノードの解放・条件判定・効果適用はしない。
- `Game` のimportや戦闘API呼出しは一切ない。Claude側の実装完了後、提供される状態・取得APIを接続できる。

## 検証結果・残件

```sh
node previews/skill-tree/data.test.mjs
node --check previews/skill-tree/app.mjs
```

データ契約テスト3件成功。200ノード/19系統、供給された接続線・座標の不変性、不正データの拒否を確認。
構文チェック成功。

管理プレビュー `sites-preview start` はリレー接続が `relay could not open browser port 4173: timed out waiting for relay readiness` となり、ブラウザ表示を開始できなかった。**ブラウザ実機、モバイルピンチ、描画速度の実測は未検証**。UI実装を動作確認済みとは扱わない。
残件は仕様書の受領・照合と、ブラウザ上での操作・表示検証。共有プレビューURLの公開・mainへのマージは行っていない。
