# バックエンドHTTP API 利用ガイド

この文書は、`backend/app.mjs`が公開するHTTP APIの動作要件とフロントエンドからの利用方法をまとめたものです。

## 基本情報

- ローカルのバックエンドURL: `http://localhost:3000`
- フロントエンドから使用するベースパス: `/api`
- 認証方式: Google OAuth 2.0とHTTP-onlyセッションCookie
- レスポンス中の日時: ISO 8601 UTC形式（例: `2026-08-05T00:00:00.000Z`）
- 日付のみの値: `YYYY-MM-DD`形式

ブラウザからは`http://localhost:3000`を直接指定せず、Vite proxyを通して`/api/...`へアクセスします。バックエンドはCORSレスポンスヘッダーを返さないため、別オリジンからの直接呼び出しはサポート対象外です。

すべてのJSONレスポンスには`Cache-Control: private, no-store`が付きます。バックエンドの未定義パスは、JSONではなく`404 Not Found`を返します。

## 動作要件

### ローカル環境

正規の起動方法はリポジトリルートでの`./dev up`です。起動後は次のURLを使用します。

- フロントエンド: `http://localhost:5173`
- バックエンド: `http://localhost:3000`

### Google Cloudと環境変数

Classroom・Gmail APIを利用するには、Google Cloudプロジェクトで次を準備します。

1. Google Classroom APIとGmail APIを有効にする
2. OAuth同意画面を設定する
3. 種類が「ウェブ アプリケーション」のOAuthクライアントを作成する
4. 承認済みリダイレクトURIに`GOOGLE_REDIRECT_URI`と同じ値を登録する
5. `.env.example`を`.env`へコピーし、値を設定する

```dotenv
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
FRONTEND_ORIGIN=http://localhost:5173
```

`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`はOAuth開始時に必須です。未設定の場合、`GET /api/auth/google`は`503 oauth_not_configured`を返します。

OAuthでは次の読み取り専用スコープを要求します。

- `https://www.googleapis.com/auth/classroom.courses.readonly`
- `https://www.googleapis.com/auth/classroom.coursework.me.readonly`
- `https://www.googleapis.com/auth/gmail.readonly`

スコープを追加する前にログインしていた場合は、ログアウト後に再ログインしてください。

## セッションと呼び出し規約

セッションCookie名は`taskwithform.sid`です。Cookieには`HttpOnly`、`SameSite=Lax`、`Path=/`が設定され、本番環境では`Secure`も設定されます。

認証情報はバックエンドプロセスのメモリだけに保持されます。次の場合は再ログインが必要です。

- Googleアクセストークンの有効期限が切れた
- バックエンドプロセスまたはコンテナを再起動した
- ログアウトした

フロントエンドの`fetch`では、相対URLと`credentials: 'same-origin'`を使用します。

```ts
const response = await fetch('/api/classroom/coursework/forms', {
  credentials: 'same-origin',
})
```

エラーレスポンスの基本形は次のとおりです。

```json
{
  "error": {
    "code": "unauthenticated",
    "message": "Authentication is required."
  }
}
```

フロントエンドの分岐には、表示文言の`message`ではなく安定した`error.code`を使用してください。

## エンドポイント一覧

| Method | Path                                | 認証            | 用途                               |
| ------ | ----------------------------------- | --------------- | ---------------------------------- |
| `GET`  | `/api/health`                       | 不要            | バックエンドの生存確認             |
| `GET`  | `/api/auth/google`                  | 不要            | Google OAuthを開始                 |
| `GET`  | `/api/auth/google/callback`         | OAuth途中Cookie | Google OAuthコールバック           |
| `GET`  | `/api/auth/session`                 | 任意            | 現在の認証状態を取得               |
| `POST` | `/api/auth/logout`                  | 任意            | セッション破棄とトークン失効       |
| `GET`  | `/api/classroom/courses/count`      | 必要            | ACTIVEなClassroomコース数を取得    |
| `GET`  | `/api/classroom/coursework/forms`   | 必要            | PUBLISHEDな課題とForm情報を取得    |
| `GET`  | `/api/gmail/connection`             | 必要            | Gmail APIへの接続を確認            |
| `GET`  | `/api/gmail/forms/:formId/response` | 必要            | Form回答受領メールの確認結果を取得 |

## ヘルスチェック

### `GET /api/health`

バックエンドプロセスがHTTPリクエストを処理できることを確認します。Google APIやOAuth設定、IndexedDBの状態は確認しません。

```json
{
  "status": "ok"
}
```

```bash
curl -i http://localhost:3000/api/health
```

## 認証API

### `GET /api/auth/google`

Google OAuthを開始し、Googleの認可画面へ`302`リダイレクトします。通常は`fetch`せず、ブラウザ遷移で使用します。

```ts
window.location.assign('/api/auth/google')
```

OAuth途中状態の有効時間は10分です。成功時はOAuth途中Cookieを発行します。

| Status | 条件                                          |
| ------ | --------------------------------------------- |
| `302`  | Google認可画面へリダイレクト                  |
| `503`  | OAuth環境変数が未設定。`oauth_not_configured` |

### `GET /api/auth/google/callback`

Googleが呼び出すコールバックです。アプリコードから直接呼び出しません。OAuth途中Cookieと`state`が一致した場合だけ認証コードを交換します。

処理後は常にフロントエンドへ`302`リダイレクトします。

| 結果                    | リダイレクト先               |
| ----------------------- | ---------------------------- |
| 認証成功                | `/`                          |
| `state`不一致・期限切れ | `/login?error=invalid_state` |
| 利用者が拒否            | `/login?error=access_denied` |
| コードなし・交換失敗    | `/login?error=oauth_failed`  |

### `GET /api/auth/session`

現在のセッション状態を返します。未認証でもHTTPステータスは`200`です。

認証済み:

```json
{
  "authenticated": true,
  "expiresAt": "2026-08-20T08:00:00.000Z"
}
```

未認証または期限切れ:

```json
{
  "authenticated": false
}
```

```ts
import { getAuthSession } from './features/auth/auth.api'

const session = await getAuthSession()
if (!session.authenticated) {
  // ログイン画面へ遷移する
}
```

### `POST /api/auth/logout`

Googleアクセストークンの失効を試み、結果にかかわらずローカルセッションを破棄します。成功レスポンスに本文はありません。

CSRF対策として、ブラウザが送る`Origin`ヘッダーが`FRONTEND_ORIGIN`と完全一致する必要があります。`FRONTEND_ORIGIN`にはパスや末尾スラッシュを含めず、実際のオリジンを設定してください。

```ts
import { logoutSession } from './features/auth/auth.api'

await logoutSession()
```

curlで直接確認する場合は`Origin`を明示します。

```bash
curl -i -X POST \
  -H 'Origin: http://localhost:5173' \
  -b cookies.txt \
  http://localhost:3000/api/auth/logout
```

| Status | 条件                                         |
| ------ | -------------------------------------------- |
| `204`  | セッション破棄完了。未認証時も同じ           |
| `403`  | `Origin`が不一致または欠落。`invalid_origin` |

## Classroom API

### `GET /api/classroom/courses/count`

利用者がアクセスできる`ACTIVE`状態のコース総数を、Google APIの全ページを取得して返します。

```json
{
  "count": 3
}
```

フロントエンドには検証済みのラッパーがあります。

```ts
import { getClassroomCourseCount } from './features/auth/auth.api'

const count = await getClassroomCourseCount()
```

### `GET /api/classroom/coursework/forms`

利用者が生徒として参加する`ACTIVE`コースを対象に、`PUBLISHED`状態の課題を全ページ取得します。Google Formが付いていない課題も返り、その場合の`forms`は空配列です。

```json
{
  "courseWork": [
    {
      "courseId": "course-1",
      "courseName": "数学I",
      "courseWorkId": "work-1",
      "courseWorkType": "ASSIGNMENT",
      "title": "一次方程式",
      "description": "教科書の問題を解く",
      "alternateLink": "https://classroom.google.com/c/example/a/example/details",
      "dueDate": "2026-08-31",
      "forms": [
        {
          "formUrl": "https://docs.google.com/forms/d/example-form-id/viewform",
          "formId": "example-form-id",
          "formIdType": "standard"
        }
      ]
    }
  ]
}
```

`description`、`alternateLink`、`dueDate`はGoogle Classroom側に値がない場合は省略されます。`formIdType`は次のどちらかです。

- `standard`: `/forms/d/:formId/edit`または`/forms/d/:formId/viewform`
- `published`: `/forms/d/e/:formId/viewform`

`formId`はForms APIのcanonical resource IDではなく、Form URL内のopaque identifierです。後述のGmail回答確認APIには、このレスポンスの`formId`を渡してください。

### Classroom API共通エラー

| Status | `error.code`            | 意味・対応                                                                     |
| ------ | ----------------------- | ------------------------------------------------------------------------------ |
| `401`  | `unauthenticated`       | セッションなし。ログインする                                                   |
| `401`  | `session_expired`       | Googleセッション失効。再ログインする                                           |
| `403`  | `classroom_forbidden`   | 必要スコープなし、権限拒否、管理ポリシーによる拒否                             |
| `502`  | `classroom_unavailable` | Google API、ネットワーク、タイムアウト、レスポンス異常。時間をおいて再試行する |

## Gmail API

### `GET /api/gmail/connection`

Gmail profileの最小フィールドだけを取得し、Gmail APIへ接続できることを確認します。メール一覧やメール本文は取得しません。

```json
{
  "connected": true
}
```

`connected: false`は返しません。接続できない場合はエラーレスポンスになります。

### `GET /api/gmail/forms/:formId/response`

Google Formsの回答受領メールをGmailから検索し、指定Formへの回答を確認します。

`formId`は`encodeURIComponent`でパスへ埋め込んでください。

```ts
const formId = courseWork.forms[0].formId
const response = await fetch(
  `/api/gmail/forms/${encodeURIComponent(formId)}/response`,
  { credentials: 'same-origin' },
)

if (!response.ok) {
  throw new Error(`response check failed: ${response.status}`)
}

const result = await response.json()
```

有効な`formId`は、1〜512文字の英数字、`_`、`-`だけで構成されます。Form URL全体は渡しません。

成功時の`status`は次の3種類です。

| `status`       | 追加フィールド      | 意味                                                                         |
| -------------- | ------------------- | ---------------------------------------------------------------------------- |
| `submitted`    | `receiptReceivedAt` | 対象Formだけを示す回答受領メールを1件確認できた                              |
| `unreviewable` | なし                | 制限内の検索を完了したが、対象Formへの回答を確認できなかった                 |
| `needsReview`  | なし                | 複数候補、曖昧・解析不能なメール、検索上限到達などにより自動判定できなかった |

`submitted`の例:

```json
{
  "status": "submitted",
  "receiptReceivedAt": "2026-08-05T00:00:00.000Z"
}
```

`unreviewable`は「未提出が証明された」という意味ではありません。回答受領メールが削除済み、受領メール送信が無効、別アカウントで回答した場合などは確認できないため、UIでは「未提出」ではなく「回答を確認できない」として扱ってください。

プライバシー保護のため、APIはメールID、件名、送信者、本文、回答内容を返しません。

### Gmail API共通エラー

| Status | `error.code`         | 意味・対応                                                                    |
| ------ | -------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_form_id`    | `formId`の文字種、長さ、パス形式が不正                                        |
| `401`  | `unauthenticated`    | セッションなし。ログインする                                                  |
| `401`  | `session_expired`    | Googleセッション失効。再ログインする                                          |
| `403`  | `gmail_forbidden`    | Gmailスコープまたはアクセス権限がない                                         |
| `503`  | `gmail_rate_limited` | Gmail APIのレート制限。待って再試行する                                       |
| `502`  | `gmail_unavailable`  | Gmail API、ネットワーク、タイムアウト、レスポンス異常。時間をおいて再試行する |

## フロントエンドのエラー処理例

`src/features/auth/auth.api.ts`の既存ラッパーは、失敗時に`BackendApiError`を投げます。

```ts
import {
  BackendApiError,
  getClassroomCourseCount,
} from './features/auth/auth.api'

try {
  const count = await getClassroomCourseCount()
  console.log(count)
} catch (error) {
  if (error instanceof BackendApiError) {
    if (error.code === 'unauthenticated' || error.code === 'session_expired') {
      window.location.assign('/login')
    }
  }
  throw error
}
```

`coursework/forms`、`gmail/connection`、`gmail/forms/:formId/response`には、現時点で同等のフロントエンドラッパーがありません。利用箇所ごとにレスポンス検証を重複させず、`src/features`配下に型検証付きのAPI関数を追加してからUIで使用してください。

この節のimport例は`src`直下のモジュールから呼ぶ場合の相対パスです。実際の呼び出し元に合わせて相対パスを調整してください。このプロジェクトには`@`などのパスエイリアスは設定されていません。

## 共通エラー

ハンドラー内で想定外の例外が発生した場合は、内部情報を隠して次を返します。

```json
{
  "error": {
    "code": "internal_error",
    "message": "An unexpected error occurred."
  }
}
```

HTTPステータスは`500`です。クライアント側で同じリクエストを無制限に再試行せず、ログを確認して原因を修正してください。

## 実装上の制約

- セッションストアはメモリ実装であり、複数バックエンドインスタンス間では共有されません。
- リフレッシュトークンを保存しないため、アクセストークンの自動更新は行いません。
- 本番で`NODE_ENV=production`の場合、セッションCookieは`Secure`になるためHTTPSが必要です。
- Google APIの生レスポンスや内部エラー本文はクライアントへ返しません。
- Gmail回答確認は回答内容を取得・保存するAPIではありません。
