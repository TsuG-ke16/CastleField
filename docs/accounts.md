# アカウント・保存の基盤（Phase 1）

オンライン対戦のサーバー（`node server/server.js`）に、アカウントと永続データを足した。**サーバーが唯一の正しい情報源**。
画面のファイルだけを配る `python3 -m http.server` では、アカウント機能は出ない（今までどおり遊べる）。

## 起動と設定（環境変数）

| 名前 | 意味 |
|---|---|
| `CF_DB_PATH` | データベースのファイル（既定 `data-store/castlefield.db`。`.gitignore` 済み） |
| `CF_PUBLIC_URL` | 公開URL（例 `https://game.example.com`）。OAuth の戻り先に使う。`https://` ならクッキーに `Secure`・`__Host-` が付く |
| `CF_TRUST_PROXY=1` | リバースプロキシの後ろのとき。`X-Forwarded-For`（IP）と `X-Forwarded-Proto`（https 判定）を信じる |
| `CF_SECURE_COOKIES=1` | `CF_PUBLIC_URL` が https でなくても、クッキーを Secure にする |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google ログイン |
| `APPLE_CLIENT_ID`（Services ID）/ `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY`（PEM。改行は `\n` 可）または `APPLE_PRIVATE_KEY_PATH` | Apple ログイン |

**秘密鍵・クライアントシークレットはリポジトリに入れない**（環境変数か、ホスティングの秘密管理で渡す）。

### 外部での設定が必要なもの（このリポジトリの外）
- Google Cloud Console：OAuth クライアント（ウェブ）を作り、承認済みのリダイレクト URI に `{CF_PUBLIC_URL}/api/auth/oauth/callback/google` を登録
- Apple Developer：Sign in with Apple の Services ID を作り、Return URL に `{CF_PUBLIC_URL}/api/auth/oauth/callback/apple` を登録。Sign in with Apple の鍵（.p8）を発行
- どちらも HTTPS の公開URLが必要。未設定のサーバーでは、画面の連携ボタンは「このサーバーでは未設定」と出て押せない

## データベース

SQLite（Node.js 標準の `node:sqlite`。**Node.js 22.13 以上**。外部パッケージなし）。ファイル1つで、今の規模（デッキ・アカウント）にはこれで足りる。
複数台に増やすときは PostgreSQL へ移す（`server/accounts/db.js` の `Db` と SQL がここだけに閉じている）。

- 起動のたびに `MIGRATIONS`（`server/accounts/db.js`）を順に適用する（`schema_migrations` に記録。**適用済みは書きかえず、末尾に足す**）
- 書き込みは `tx()`（`BEGIN IMMEDIATE`）の中。同時リクエストは1つずつ処理され、二重処理にならない
- WAL・`synchronous=FULL`・外部キー有効。アカウントを消すと関連する行は `ON DELETE CASCADE` で一緒に消える
- 保存するもの：ユーザー、外部認証との紐づけ（`provider` + `subject` だけ。**メールアドレスは預からない**）、セッション（ハッシュだけ）、デッキ、設定、監査ログ

### バックアップと復元
```sh
node server/backup.js backup                # data-store/backups/ に日時つきで作る（動いているサーバーがあっても可）
node server/backup.js backup /path/out.db
node server/backup.js restore /path/out.db  # サーバーを止めてから。いまのデータは .before-restore に退避
```
定期実行は cron などで `backup` を呼ぶ（運用側の設定。毎日・世代管理は運用で決める）。

## 認証とセッション
- 初回はゲスト（`POST /api/auth/guest`）。Google/Apple を連携すると、**同じユーザーのまま** member になる（データ消失・重複登録なし）
- すでに連携済みのアカウントにゲスト（データあり）がログインしようとしたら、確認の画面（`link/resolve`）。「切りかえる」でゲストのデッキは空き枠に移り、相手のデータは消えない。ゲストにデータがなければ確認なしで切りかわる
- OAuth は認可コードフロー。`state`（1回きり・10分）・`nonce`・PKCE（Google）。ID トークンは **サーバーで** 署名（RS256・公開鍵は JWKS）・`iss`・`aud`・`exp`・`nonce` を検証（`alg: none` や別の鍵は拒否）
- セッションの値は256ビットの乱数で、DB にはハッシュだけを保存。Cookie は `HttpOnly; SameSite=Lax`（HTTPS では `Secure` と `__Host-` 付き）。有効期限は、使わなければ30日・最長90日。連携・切りかえのときは作り直し、古いものは失効
- CSRF：書き込みは `X-CF-Client: 1` と、セッションごとの `X-CF-CSRF`（`GET /api/me` で受け取る）が必要。`Origin` が違えば拒否。アカウントのAPIは CORS を許さない
- 回数の制限：IP ごと。認証系 30回/分、そのほか 240回/分（`429` と `Retry-After`）

## API（すべて同じオリジンから）
| メソッド・URL | 内容 |
|---|---|
| `GET /api/me` | `{ user, csrf, providers: { google, apple }, oauthReady }`。ログインしていなければ `user: null` |
| `POST /api/auth/guest` | ゲストを作る（すでにログイン済みならそのまま返す） |
| `POST /api/auth/oauth/start` `{ provider }` | 認証画面の URL（`{ url }`）。ログイン中のユーザーに連携する |
| `GET /api/auth/oauth/callback/{google,apple}` | 戻り先。`/?auth=linked|logged-in|created|conflict|error` へ 303 |
| `POST /api/auth/link/resolve` `{ id, action: "switch"|"cancel" }` | 連携の衝突の解決 |
| `POST /api/auth/logout` `{ confirmGuestLoss? }` | ゲストは確認が要る（409 `needsConfirm`） |
| `POST /api/account/delete` `{ confirm: "delete" }` | アカウントと関連データをすべて削除 |
| `POST /api/profile/name` `{ name }` | 表示名（1〜16文字） |
| `GET /api/decks` | `{ active, slots: [{name, list}|null ×4], revision }` |
| `PUT /api/decks` `{ active, slots, baseRevision? }` | 保存。`baseRevision` が古ければ 409（ほかの端末の変更を消さない） |
| `POST /api/decks/import` `{ active, slots }` | 端末のデッキの取り込み。持っているデッキは消さず、ないものを空き枠へ。何度送っても同じ |
| `GET /healthz` | 稼働確認 |

## 端末のデッキとの関係（`js/ui/Account.js`）
- デッキは端末（`localStorage`）にも残す（オフラインで遊べるように）。変えたらクラウドへ送る（600ms まとめて）
- このアカウントをこの端末で初めて使うとき：端末のデッキを**取り込む**（`import`）。上書きする前の端末のデッキは `cf-mydecks-backup-*` に最新3つまでとっておく
- 起動のたびにクラウドと合わせる。ほかの端末が先に変えていたら（409）、端末の内容はとっておいて、クラウドを採用し、その旨を表示する

## まだやっていないこと（Phase 1 の範囲外）
- 本物の Google / Apple での通信の確認（認証情報がないため。テストは、同じ手順・同じ署名の検証をする**テスト用の認証サーバー**で行っている）
- Apple の `form_post`（名前・メールを要求するとき）への対応。いまは `openid` だけを要求し、戻りは GET
- データ引き継ぎのコード（OAuth 連携だけで引き継ぐ）、メールアドレス・パスワードのログイン
- 古い（使われていない）ゲストの掃除、ログの外部送信、複数台構成
