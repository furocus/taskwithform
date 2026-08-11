---
tags:
  - issue/10
  - google-oauth
  - google-classroom
  - implementation-note
status: completed
---

# Issue 10 Google OAuth実装ノート

## 実装の目的

Google OAuthでログインし、許可されたユーザーのGoogle ClassroomからACTIVEなコースの合計件数を取得する。今回の範囲では認証と接続確認までを扱い、課題の取得・保存・進捗管理は扱わない。

## コミット単位の作業内容

1. `61884fb chore: Google OAuthの設定基盤を追加`
   - Google OAuth用の環境変数と設定読み込みを追加
   - 必須設定が不足した場合のエラーを追加
   - `google-auth-library`を追加
2. `c22ee29 feat: Google OAuthセッションを実装`
   - Google認可画面への遷移、コールバック、セッション確認、ログアウトを追加
   - OAuth `state`を一度だけ検証するメモリセッションを追加
   - アクセストークンをブラウザへ渡さず、バックエンドのメモリ上に保持
3. `142a8ee feat: Classroomコース件数取得を追加`
   - Google Classroom APIのページネーションに対応
   - ACTIVEなコースの件数だけを返すAPIを追加
   - Google APIの401、403、その他の失敗を安全なアプリケーションエラーへ変換
4. `21f0875 feat: Googleログイン画面を接続`
   - ログイン画面をGoogle OAuthへ接続
   - 認証が必要な画面へルートガードを追加
   - メイン画面にコース件数とログアウトボタンを追加
   - フロントエンド用APIクライアントとレスポンス検証を追加
   - Vite開発サーバーからバックエンドへの`/api`プロキシを追加
5. `docs: Google OAuthの設定と設計判断を記録`
   - READMEへGoogle Cloudとローカル環境の設定手順を追加
   - このノートへ作業内容、依存関係、型の選択理由、セキュリティ判断、制約を記録

## APIと画面の流れ

1. フロントエンドが`GET /api/auth/session`で認証状態を確認する
2. 未認証の場合は`/login`を表示する
3. 「Googleでログイン」から`GET /api/auth/google`へ画面全体で遷移する
4. バックエンドがGoogleの認可画面へリダイレクトする
5. `GET /api/auth/google/callback`で認可コードと`state`を検証する
6. バックエンドがアクセストークンをメモリへ保存し、ブラウザにはHttpOnlyなセッションCookieだけを返す
7. `GET /api/classroom/courses/count`がACTIVEなコースを全ページ取得し、合計件数だけを返す
8. `POST /api/auth/logout`がGoogleトークンの失効を試み、メモリセッションとCookieを破棄する

## 追加したnpm依存関係

### `google-auth-library@^10.9.1`

実行時に必要な直接依存関係。Googleの認可URL生成、認可コードとトークンの交換、アクセストークンの失効に使用する。

自前でOAuthリクエストの署名やGoogle固有のパラメータ処理を実装せず、Google公式ライブラリへ責務を寄せるために選択した。`package-lock.json`へ追加された関連パッケージは、このライブラリの推移的依存関係であり、アプリケーションコードから直接使用しない。

### 追加しなかった依存関係

- ExpressなどのWebフレームワーク
  - 現在必要なAPIが小さく、既存の`node:http`でルーティングとレスポンスを明示的に管理できるため
- セッションストア用パッケージ
  - 今回は単一プロセスでのローカル確認を対象にし、期限付きメモリセッションで要件を満たすため
- Google API全体のクライアント
  - Classroom APIで必要なのはコース一覧の読み取りだけなので、標準の`fetch`で最小限のリクエストを行うため

### Dockerへの影響

DockerfileやCompose設定は変更していない。既存の依存関係インストール工程が`npm ci`を実行する構成であれば、`package.json`と`package-lock.json`から`google-auth-library`も同時にインストールされる。イメージを再構築する際に追加のOSパッケージや個別のインストールコマンドは不要。

## 型を選んだ理由

### フロントエンド

| 型                                        | 選択理由                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AuthSession`インターフェース             | APIから受け取るセッションの構造を名前付きで共有し、将来フィールドを追加しやすくするため                   |
| `authenticated: boolean`                  | 認証状態は二値であり、文字列や数値による曖昧な状態を許可しないため                                        |
| `expiresAt?: string`                      | 未認証時には期限が存在しないため省略可能とし、JSONで扱いやすいISO 8601文字列をAPI境界に採用した           |
| `BackendApiError extends Error`           | 通常の例外として扱いつつ、`instanceof`で通信エラーを識別し、`code`とHTTP `status`で画面表示を分岐するため |
| `type FetchImplementation = typeof fetch` | 本番と同じFetch APIの引数・戻り値を維持しながら、テストではモック関数を注入できるようにするため           |
| コース件数の`number`                      | UIが必要とする値は合計件数だけであり、取得後に非負の整数であることを実行時検証してから使用するため        |

TypeScriptの型注釈は実行時には消える。バックエンドレスポンスは外部入力なので、`authenticated`、`expiresAt`、`count`を受信時にも検証し、不正な値は`invalid_backend_response`として扱う。

### バックエンド

バックエンドは既存構成に合わせてJavaScriptのES Modulesを使用する。セッションには`kind: 'pending'`と`kind: 'authenticated'`を持たせ、OAuth認可待ちと認証済みを同じ保存先で判別できる形にした。

- 認可待ちセッション: `state`と`expiresAt`
- 認証済みセッション: `accessToken`と`expiresAt`
- 内部の`expiresAt`: 期限比較とCookieの`Max-Age`計算を直接行えるUNIX時刻のミリ秒
- APIの`expiresAt`: 言語やタイムゾーンに依存せず受け渡せるISO 8601文字列

## セキュリティとデータ最小化の判断

- OAuthスコープは`classroom.courses.readonly`だけに限定する
- `access_type: online`を指定し、refresh tokenを要求・保存しない
- アクセストークンはバックエンドのメモリだけに保存する
- ブラウザには推測困難なセッションIDだけを`HttpOnly`、`SameSite=Lax`、`Path=/`のCookieで渡す
- 本番環境ではセッションCookieへ`Secure`を付ける
- OAuth `state`は暗号学的乱数で生成し、期限付きかつ一度だけ使用する
- ログアウトAPIは`Origin`を確認し、Googleトークンの失効を試みる
- Classroom APIには`fields=nextPageToken,courses(id)`を指定し、件数計算に不要な情報を取得しない
- フロントエンドへ返すのは`count`だけで、コース名やコースIDは返さない
- Googleや内部処理の詳細をそのまま画面へ出さず、理由別の安定したエラーコードへ変換する

## 現在の制約

- セッションはプロセスメモリ上にあるため、バックエンド再起動後は再ログインが必要
- 複数バックエンドインスタンス間でセッションを共有できない
- refresh tokenを保持しないため、アクセストークン期限切れ後は再ログインが必要
- Google Classroomへの権限がないユーザーはコース件数を取得できない
- 永続セッションや複数インスタンス対応が必要になった場合は、保存先・暗号化・失効方法を改めて設計する

## 設定と確認

必要な環境変数:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
FRONTEND_ORIGIN=http://localhost:5173
```

確認コマンド:

```bash
npm test
npm run format:check
npm run typecheck
npm run build
```

実際のGoogle OAuthを確認するときは、Google Cloud側の承認済みリダイレクトURIと`GOOGLE_REDIRECT_URI`を完全に一致させる。
