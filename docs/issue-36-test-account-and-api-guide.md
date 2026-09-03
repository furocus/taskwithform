# Issue #36 検証用Googleアカウント・API確認ガイド

この文書は、専用の検証用GoogleアカウントでClassroom課題とGoogle Forms回答控えの連携を確認し、BackendからDB・UIへ安全に結果を渡すための手順書です。実装の基準は`backend/config.mjs`、`backend/app.mjs`、`backend/auth/google-oauth.mjs`、`backend/classroom/google-classroom.mjs`、`backend/gmail/google-gmail.mjs`です。

本番・実利用アカウントでこの手順を実施してはいけません。検証用アカウントにも秘密情報、実在人物の個人情報、実際の授業・課題・回答、業務メールを入れないでください。

## 1. 実施前の責任者確認

アカウントを作成する前に、次をチームのアクセス制限された管理台帳へ記入します。パスワード、MFAの回復コード、OAuthクライアントシークレット、Cookie、トークンは、この表・Issue・Pull Request・チャットへ記入しません。

| 項目                         | 記入欄                                               |
| ---------------------------- | ---------------------------------------------------- |
| 検証責任者                   | `[氏名またはチーム内識別子]`                         |
| Google Cloud設定責任者       | `[氏名またはチーム内識別子]`                         |
| Classroomデータ準備責任者    | `[氏名またはチーム内識別子]`                         |
| アカウント保管責任者         | `[氏名またはチーム内識別子]`                         |
| 作成日                       | `[YYYY-MM-DD]`                                       |
| 次回棚卸し日                 | `[YYYY-MM-DD]`                                       |
| 利用終了・削除予定日         | `[YYYY-MM-DD]`                                       |
| 対象Google Cloudプロジェクト | `[検証用プロジェクト名。client ID/secretは書かない]` |

### アカウントとデータのルール

- 教師役と生徒役をそれぞれ専用アカウントにする。アプリへのログインとGmail確認には生徒役を使う。
- 学校・勤務先・個人が日常利用する本番アカウントは禁止する。既存の実授業へ検証アカウントを参加させない。
- 表示名、コース名、課題名、Form設問、回答には「検証用」のようなダミー値だけを使う。
- 資格情報は承認済みのパスワードマネージャーにだけ保管し、共有範囲を責任者に限定する。`.env`はローカルだけに置き、Gitへ追加しない。
- APIレスポンス、スクリーンショット、ログを共有する前に、メールアドレス、個人名、メール本文、回答内容、Cookie、アクセストークン、message IDがないことを確認する。
- Gmailの受信メール本文やmessage IDは、DB、テストfixture、Issue、Pull Request、チャットへ転記しない。Google APIの生レスポンスも保存しない。
- 検証結果として記録してよいのは、ケース名、HTTP status、`error.code`、3状態、テスト用Form ID、受信日時など、後述の受け渡しに必要な最小情報だけとする。
- 作業終了時にアプリからログアウトし、一時Cookie jarを削除する。利用終了時はOAuth連携を解除し、Classroom/Form/メールと検証アカウントを保管責任者が削除する。

## 2. 最小テストデータを準備する

### 2.1 アカウントを作る

1. 教師役と生徒役の専用Googleアカウントを作る。Gmailを利用できるアカウントを生徒役にする。
2. 必要なら検証専用の回復先とMFAを設定し、資格情報を承認済みパスワードマネージャーへ保存する。
3. OAuth同意画面がテスト公開の場合は、生徒役をテストユーザーへ登録する。
4. 教師役でClassroomデータを作り、生徒役を生徒として招待する。

アカウント作成、電話番号確認、組織管理者の許可などはGoogle上で責任者が実施します。このリポジトリのコマンドでは作成できません。

### 2.2 ClassroomとFormのケースを作る

Classroom APIは、生徒役が参加している`ACTIVE`コースと、その中の`PUBLISHED`課題だけを取得します。下書き、アーカイブ済みコース、教師としてだけ参加しているコースは、この確認データの代用になりません。

次の最小構成を作ります。タイトルにはケース番号を付け、実データと混ざらないようにします。

| ケース | 準備内容                                                       | `coursework/forms`の期待結果          |
| ------ | -------------------------------------------------------------- | ------------------------------------- |
| C0     | `ACTIVE`コースを1つ作り、課題を0件にする                       | このコース由来の`courseWork`要素は0件 |
| C1     | 別の`ACTIVE`コースに、添付なしの通常課題を`PUBLISHED`で1件作る | 課題が1件、`forms: []`                |
| C2     | 同じコースに、Form以外の資料だけを添付した課題を1件作る        | 課題が1件、`forms: []`                |
| C3     | Google Formを1件添付した課題を1件作る                          | 課題が1件、`forms`が1件               |
| C4     | 異なるGoogle Formを2件添付した課題を1件作る                    | 課題が1件、`forms`が2件               |

各課題は生徒役から閲覧できることをブラウザで確認します。`description`、期限、Classroomの課題リンクは任意ですが、省略時のAPIレスポンスも確認したい場合はC1では設定せず、C3では設定するなどケースを分けます。

Formはダミー設問1個で十分です。回答控えの検証対象にするFormでは、メールアドレス収集と回答控えメールを回答者が受け取れる設定を有効にします。Google Formsの表示文言が変わっている場合でも、生徒役が回答送信時または送信後に「回答のコピー」を受け取れる設定を選んでください。

### 2.3 Gmail回答状態を作る

生徒役でFormへ回答し、次の3ケースを用意します。回答内容は`test-1`のようなダミー値だけにします。

| ケース | 準備内容                                         | 期待状態       |
| ------ | ------------------------------------------------ | -------------- |
| G1     | 対象Formへ1回回答し、回答控えを1通受信する       | `submitted`    |
| G2     | 対象Formへ回答しない、または回答控えを受信しない | `unreviewable` |
| G3     | 同じ対象Formへ2回回答し、回答控えを2通受信する   | `needsReview`  |

Gmail実装は送信者`forms-receipts-noreply@google.com`とForm IDで候補を検索し、本文中のGoogle Form URLを安全に照合します。G1では対象Formだけを示す解析可能なメールがちょうど1通必要です。G2の`unreviewable`は「未提出」の証明ではありません。G3は一致メールが複数あるため自動判定を避けます。

回答控えメールを転送、編集、本文コピーしてケースを作らないでください。メール形式を変えると、本番相当の確認にならず、秘密情報を別の場所へ残す原因にもなります。

## 3. Google Cloud OAuthを設定する

検証専用Google Cloudプロジェクトで次を設定します。

1. Google Classroom APIとGmail APIを有効にする。
2. OAuth同意画面を構成し、テスト公開の場合は生徒役をテストユーザーにする。
3. 種類が「ウェブ アプリケーション」のOAuthクライアントを作る。
4. 承認済みリダイレクトURIへ次の値を完全一致で登録する。

   ```text
   http://localhost:3000/api/auth/google/callback
   ```

5. `.env.example`を`.env`へコピーし、検証用クライアントの値をローカルで設定する。

   ```dotenv
   GOOGLE_CLIENT_ID=your-test-client-id
   GOOGLE_CLIENT_SECRET=your-test-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   FRONTEND_ORIGIN=http://localhost:5173
   ```

`GOOGLE_CLIENT_ID`と`GOOGLE_CLIENT_SECRET`は必須です。`GOOGLE_REDIRECT_URI`と`FRONTEND_ORIGIN`を省略した場合、上記の値が既定値になります。Cloud側のURIとローカル値のscheme、host、port、path、末尾スラッシュが1文字でも違うとOAuthは成功しません。

現行OAuthが要求するscopeは、次の3つだけです。すべて読み取り専用です。

- `https://www.googleapis.com/auth/classroom.courses.readonly`
- `https://www.googleapis.com/auth/classroom.coursework.me.readonly`
- `https://www.googleapis.com/auth/gmail.readonly`

バックエンドは過去のセッションとの互換性のため`classroom.student-submissions.me.readonly`も課題取得scopeとして受け入れますが、現行の認可URLは要求しません。検証用Cloud設定に書き足す必要はありません。

本人の提出・返却・採点状態は、Classroom APIの[`courses.courseWork.studentSubmissions.list`](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.courseWork.studentSubmissions/list)を`courseWorkId=-`、`userId=me`で呼び出して取得します。これは新しいAPI呼び出しですが、現行OAuthで要求済みの`classroom.coursework.me.readonly`に含まれるため、新しいscope、Google Cloud上の追加API有効化、既存利用者の再同意は不要です。古いセッションで必要scopeが付与されていない場合だけ、後述の手順で連携を解除して再ログインします。

取得フィールドは`courseWorkId`、`state`、`assignedGrade`に限定します。提出物の添付ファイル、回答内容、ユーザー情報、Google APIの生レスポンスはアプリAPIへ返さず、課題ごとの`submissionStatus`へ正規化します。

OAuthは`access_type=online`で、リフレッシュトークンを保存しません。アクセストークンとscopeはバックエンドのメモリセッションだけに保持されます。

### scope変更後に再同意する

単に再ログインしても、Googleが以前の同意を再利用する場合があります。scope追加・削除後に同意画面を確実に確認する場合は、次の順で行います。

1. アプリでログアウトする。
2. 生徒役Googleアカウントの「サードパーティ製のアプリとサービスへの接続」から、この検証用OAuthアプリのアクセスを削除する。
3. ブラウザの検証用プロファイルだけを使い、`http://localhost:5173/login`から再ログインする。
4. 同意画面に3つのread-only権限が表示されることを確認して許可する。

## 4. ログインと安全なcurl確認

OAuthログインはブラウザ操作が必須です。`GET /api/auth/google`をcurlで追従しても、Googleの対話的ログイン、同意、OAuth途中Cookieと`state`の検証を完了できません。認証コードやアクセストークンを手作業で取得する手順も禁止します。

1. 開発環境を通常の方法で起動する。
2. ブラウザで`http://localhost:5173/login`を開き、生徒役でGoogleログインを完了する。
3. `GET /api/auth/session`が`{"authenticated":true,...}`になることをブラウザのNetworkパネルで確認する。

ブラウザ内で確認するだけなら、DevToolsのConsoleから次のように実行できます。Cookie値はJavaScriptへ公開されません。

```js
await fetch('/api/classroom/coursework/forms', {
  credentials: 'same-origin',
}).then(async (response) => ({
  httpStatus: response.status,
  body: await response.json(),
}))
```

curlが必要な場合だけ、ブラウザのStorage/Cookies画面から`taskwithform.sid`を一時的に安全なCookie jarへ移します。これはセッション資格情報です。共有端末、画面共有中、shell traceが有効な端末では実施せず、値をコマンド行、履歴、ログ、スクリーンショットへ残さないでください。

```bash
set +x
cookie_jar="$(mktemp "${TMPDIR:-/tmp}/taskwithform-cookie.XXXXXX")"
chmod 600 "$cookie_jar"
trap 'rm -f -- "$cookie_jar"' EXIT HUP INT TERM

read -rsp 'taskwithform.sid: ' test_session_id
printf '\n'
printf '# Netscape HTTP Cookie File\n' >"$cookie_jar"
printf 'localhost\tFALSE\t/\tFALSE\t0\ttaskwithform.sid\t%s\n' \
  "$test_session_id" >>"$cookie_jar"
unset test_session_id
```

以降の例は同じshellで実行します。`cookie_jar`の中身を表示せず、応答を恒久ファイルへリダイレクトしません。

```bash
curl --silent --show-error --include \
  --cookie "$cookie_jar" \
  http://localhost:3000/api/auth/session
```

作業終了時はshellを終了すれば`trap`がCookie jarを削除します。途中で終了する場合は`rm -f -- "$cookie_jar"`を実行してからshellを閉じます。

## 5. `GET /api/classroom/courses/coursework`

### 入力

- Method: `GET`
- Path: `/api/classroom/courses/coursework`
- Query/body: なし
- 認証: `taskwithform.sid` Cookie
- 必要scope: `classroom.courses.readonly`と、`classroom.coursework.me.readonly`または互換scopeの`classroom.student-submissions.me.readonly`

```bash
curl --silent --show-error --include \
  --cookie "$cookie_jar" \
  http://localhost:3000/api/classroom/courses/coursework
```

### 成功レスポンス

HTTP `200`で、対象は生徒役が参加する`ACTIVE`コース内の`PUBLISHED`課題です。Formなしの課題も返ります。

```json
{
  "courses": [
    {
      "id": "test-course-id",
      "name": "検証用コース",
      "courseWork": [
        {
          "courseWorkId": "test-work-id",
          "courseWorkType": "ASSIGNMENT",
          "title": "C3 検証用1 Form",
          "description": "dummy",
          "alternateLink": "https://classroom.google.com/c/example/a/example/details",
          "dueDate": "2026-09-30",
          "submissionStatus": "unsubmitted",
          "forms": [
            {
              "formUrl": "https://docs.google.com/forms/d/test-form-id/viewform",
              "formId": "test-form-id",
              "formIdType": "standard"
            }
          ]
        }
      ]
    }
  ]
}
```

`description`、`alternateLink`、`dueDate`はGoogle側に値がない場合は省略されます。`forms`は常に配列です。`formIdType`は標準URLの`standard`または公開URLの`published`です。`formId`はForms APIのcanonical resource IDではなく、Form URL中のopaque identifierです。

`submissionStatus`はClassroomの本人用`StudentSubmission`から次の規則で正規化します。

- `submitted`: `state`が`TURNED_IN`または`RETURNED`、あるいは`assignedGrade`が存在する
- `unsubmitted`: `state`が`NEW`、`CREATED`または`RECLAIMED_BY_STUDENT`

期限の有無や添付ファイルの有無は提出判定に使いません。期限なしでも提出済みなら一覧から除外し、ファイルを添付しただけでClassroom上の提出操作をしていない課題は未提出として残します。

未提出のまま期限を過ぎた課題は、メイン課題一覧だけ期限からの経過日数で絞り込みます。判定はローカル暦日で行い、時刻は使いません。

- 期限が今日、未来、または7日前まで: メイン課題一覧に表示する
- 期限が8日以上前: メイン課題一覧から除外する
- 期限なし: 経過日数を判定せず常に表示する

この絞り込みはフロントエンドの一覧表示だけに適用します。APIレスポンス、DBのレコード、カレンダー表示、今日締切通知は対象外で、8日以上前の未提出課題もそれらには残ります。

C0の空コースはこのAPIだけではコース要素として現れません。必要なら`GET /api/classroom/courses/count`で`ACTIVE`コース総数を併せて確認し、C0とデータ入りコースの合計件数になっていることを確認します。

### エラー

| HTTP  | `error.code`              | 意味と対応                                                                                     |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `401` | `unauthenticated`         | Cookieなし、ローカル期限切れ、バックエンド再起動によるセッション消失。ブラウザで再ログインする |
| `401` | `session_expired`         | 保存期限前にGoogle APIが401を返した。Cookieを再利用せず再ログインする                          |
| `403` | `classroom_scope_missing` | セッションに必要scopeがない。OAuth連携を解除して再同意する                                     |
| `403` | `classroom_forbidden`     | Google Classroomがアクセスを拒否した。生徒参加、API有効化、組織ポリシーを確認する              |
| `502` | `classroom_unavailable`   | ネットワーク、タイムアウト、Google 5xx/429、形式不正など。待ってから有限回だけ再試行する       |
| `500` | `internal_error`          | 想定外のバックエンド障害。秘密情報を含めずサーバーログと再現条件を確認する                     |

すべてのJSONレスポンスには`Cache-Control: private, no-store`が付きます。Google APIの生レスポンスや内部エラー本文はクライアントへ返りません。

## 6. `GET /api/gmail/forms/:formId/response`

### 入力

- Method: `GET`
- Path parameter: Classroom APIが返した`formId`
- Query/body: なし
- 認証: `taskwithform.sid` Cookie
- 必要scope: `gmail.readonly`
- 有効なForm ID: 1〜512文字の英数字、`_`、`-`

Form URL全体は渡しません。シェルでURLエンコードする処理を即席実装せず、まずClassroomレスポンスに含まれる検証用Form IDが上記の文字種だけであることを確認して使います。

```bash
form_id='test-form-id-from-classroom-response'
curl --silent --show-error --include \
  --cookie "$cookie_jar" \
  "http://localhost:3000/api/gmail/forms/${form_id}/response"
unset form_id
```

### 成功レスポンス

HTTP `200`で次のいずれかを返します。

```json
{ "status": "submitted", "receiptReceivedAt": "2026-08-31T01:23:45.000Z" }
```

```json
{ "status": "unreviewable" }
```

```json
{ "status": "needsReview" }
```

| `status`       | 意味                                                           | DB/UIでの扱い                                          |
| -------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `submitted`    | 対象Formだけを示す解析可能な回答控えを1件特定した              | `receiptReceivedAt`とともに保存・表示できる            |
| `unreviewable` | 制限内の検索は完了したが、対象回答を確認できなかった           | 「未提出」と表示しない。「回答を確認できない」とする   |
| `needsReview`  | 複数一致、曖昧・解析不能、検索上限到達などで安全に判定できない | 手動確認または再試行を案内する。メール本文は表示しない |

`receiptReceivedAt`はGmailメッセージの受信日時をISO 8601 UTCで表した値で、回答日時やAPI確認時刻ではありません。`submitted`以外には付きません。

### エラー

| HTTP  | `error.code`         | 意味と対応                                                                     |
| ----- | -------------------- | ------------------------------------------------------------------------------ |
| `400` | `invalid_form_id`    | IDの文字種、長さ、パス形式が不正。Classroomレスポンスの`formId`を使う          |
| `401` | `unauthenticated`    | Cookieなし、ローカル期限切れ、バックエンド再起動。再ログインする               |
| `401` | `session_expired`    | 保存期限前にGoogle APIが401を返した。再ログインする                            |
| `403` | `gmail_forbidden`    | scope欠落、Gmail権限、組織ポリシーによる拒否。再同意または管理者確認を行う     |
| `503` | `gmail_rate_limited` | Gmail APIのレート制限。待ってから有限回だけ再試行する                          |
| `502` | `gmail_unavailable`  | ネットワーク、タイムアウト、Google障害、レスポンス異常。時間を置いて再試行する |
| `500` | `internal_error`     | 想定外のバックエンド障害。安全な再現条件だけを共有する                         |

認証とscopeの検査がForm ID検査より先に行われるため、未認証の不正IDリクエストは`invalid_form_id`ではなく`unauthenticated`になります。

## 7. 権限・期限・レート制限の確認

### Gmail権限不足

1. 生徒役のGoogleアカウントから検証用OAuthアプリのアクセスを削除する。
2. 再ログインし、Googleの同意画面が権限ごとの選択を許す場合だけ、Classroomを許可してGmailを許可しない。
3. `GET /api/classroom/coursework/forms`が`200`、`GET /api/gmail/connection`または回答確認APIが`403 gmail_forbidden`になることを確認する。
4. 確認後は連携を再度削除し、3つのscopeすべてへ再同意する。

組織ポリシーやGoogleの同意画面仕様により部分同意を選べない場合、実アカウントの設定やトークンを改変して再現してはいけません。その環境では、管理者がGmailを禁止した専用テストユーザーで確認するか、既存の自動テスト結果で権限分岐を確認し、実環境では「再現不可」と記録します。

### セッション期限切れ

`GET /api/auth/session`の`expiresAt`まで待ち、期限後に次を確認します。

- `GET /api/auth/session`: HTTP `200`、`{"authenticated":false}`
- 保護API: HTTP `401`、`unauthenticated`
- レスポンス: セッションCookieを削除する`Set-Cookie`

バックエンドは期限切れセッションをメモリから削除します。リフレッシュトークンを持たないため自動更新しません。バックエンド再起動でも同じくセッションが失われます。一方、保存した期限より前にGoogleがアクセストークンを無効と判断して401を返した場合は`session_expired`です。この2つを同じ期待値にしないでください。

### rate limit

- GmailのHTTP 429、またはGoogleが明示する一部のquota理由は`503 gmail_rate_limited`になります。
- Classroomの429は専用コードにせず`502 classroom_unavailable`になります。
- Gmail回答確認1回は最大10検索ページ、100候補、合計110リクエスト、30秒で打ち切ります。候補を完全走査できない場合は成功レスポンスの`needsReview`になる場合があります。
- quota枯渇を意図的に起こす負荷試験は行いません。無限ループ、並列連打、自動即時再試行を禁止します。
- 受け取った側は待機し、指数バックオフと試行回数上限を設けます。現行APIは`Retry-After`を返さないため、UIで正確な再開時刻を断定しません。

## 8. トラブルシューティング

| 症状                            | 確認点                                              | 対応                                                                 |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `503 oauth_not_configured`      | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`          | `.env`の検証用値を設定し、バックエンドへ反映する。値はログへ出さない |
| Googleで`redirect_uri_mismatch` | Cloudの承認済みURIと`GOOGLE_REDIRECT_URI`           | `http://localhost:3000/api/auth/google/callback`へ完全一致させる     |
| `/login?error=invalid_state`    | OAuth開始から10分超過、別タブ、途中Cookie消失       | 同じブラウザプロファイル・1タブでログインを最初からやり直す          |
| `/login?error=access_denied`    | 利用者が同意を拒否した                              | 必要なread-only scopeを確認して再ログインする                        |
| `/login?error=oauth_failed`     | code欠落、交換失敗、期限不正                        | redirect URI、client設定、時刻を確認し、資格情報を共有せず再試行する |
| `classroom_scope_missing`       | 古い同意、部分同意                                  | OAuth連携を削除し、必要scopeへ再同意する                             |
| `classroom_forbidden`           | 生徒役がコースへ参加済みか、API・組織ポリシー       | 専用コースの所属とCloud設定を責任者が確認する                        |
| 課題が返らない                  | コースが`ACTIVE`、課題が`PUBLISHED`、生徒として参加 | 下書きを公開し、生徒役ブラウザでも閲覧できることを確認する           |
| `forms: []`                     | Classroom課題のmaterialsにGoogle Formがあるか       | URLを説明欄へ貼るだけでなく、Form資料として添付して公開する          |
| G1が`unreviewable`              | 回答控えが生徒役Gmailへ届いたか、同じForm IDか      | 送信者とFormリンクをGmail画面内だけで確認する。本文は転記しない      |
| G1が`needsReview`               | 同じFormの控えが複数、メール形式が解析不能          | 重複回答の有無をGmail画面内で確認し、必要なら専用Formを作り直す      |
| `gmail_forbidden`               | Gmail scope、Gmail API、管理ポリシー                | OAuth再同意、Cloud設定、管理者ポリシーの順に確認する                 |
| `gmail_rate_limited`            | 短時間の繰り返し確認                                | 自動再試行を止め、時間を置いて1回だけ確認する                        |
| curlだけ`unauthenticated`       | Cookie jarのdomain、Cookie期限、バックエンド再起動  | ブラウザセッションを確認し、一時jarを作り直す。Cookie値を表示しない  |

診断時にアプリログへGoogleの生レスポンス、メール本文、token、Cookie、message IDを追加してはいけません。現行実装はクライアントへ安全なコードだけを返すため、共有する診断情報もケース名、時刻、HTTP status、`error.code`までに制限します。

## 9. Backend / DB / UIの受け渡し条件

API失敗を回答状態として保存しません。永続化する回答状態は`submitted | unreviewable | needsReview`だけで、`unreviewed`と`reviewing`はUI一時状態です。

| ケース          | Backendの受け渡し                      | DBの扱い                                       | UIの扱い                                        |
| --------------- | -------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| C1/C2           | 課題、`submissionStatus`、`forms: []`  | 課題情報とClassroom提出状態を同期              | Form回答状態を表示せず、回答確認を呼ばない      |
| C3/C4           | `submissionStatus`とFormごとの識別情報 | Classroom提出状態とForm回答確認を別々に保持    | 未提出課題だけを表示し、Form回答状態も表示する  |
| 期限切れ        | 経過日数を返さず`dueDate`だけを返す    | 期限を含む課題レコードをそのまま保持           | メイン一覧は7日前までを表示し8日以上前を除外    |
| G1              | `submitted`と`receiptReceivedAt`       | `checkedAt`とともに保存                        | 回答済みと受信日時を表示                        |
| G2              | `unreviewable`                         | 正常な確認結果として保存                       | 未提出と断定せず確認不能と表示                  |
| G3              | `needsReview`                          | 正常な確認結果として保存                       | 要確認と再試行導線を表示                        |
| APIエラー       | HTTP statusと`error.code`              | 新しい回答状態を保存せず既存正常値を維持       | `reviewing`を解除し、コード別の安全な案内を表示 |
| logout/期限切れ | セッション破棄または401                | 別利用者へ残らないようユーザー固有データを削除 | ログインへ戻し、前利用者の状態を表示しない      |

受け渡し時は次を満たします。

- Backend: `formId`をClassroomレスポンスからGmail APIへそのまま接続でき、3状態と主要エラーを上記どおり返す。
- DB: `receiptReceivedAt`は`submitted`だけに保持し、API確認時刻は別の`checkedAt`にする。メール本文、回答内容、message ID、tokenをschemaへ追加しない。
- UI: `error.message`をそのまま表示せず`error.code`で分岐し、未知の値は一般エラーにする。複数Formの部分失敗を別Formの成功で上書きしない。
- 共通: レスポンスfixtureはダミー値だけで作る。実レスポンスの丸ごと保存やNetworkパネルの無加工スクリーンショットを禁止する。

## 10. Issue #35から利用する手順

Issue #35の実アカウント・DB結合確認では、次の順にこの文書を前提資料として使えます。「実アカウント」は本番アカウントではなく、この文書で作った実Google APIへ接続する専用検証アカウントを意味します。

1. 1章の責任者欄と保管・削除期限を確定する。
2. 2章のC0〜C4、G1〜G3を準備し、ケース名と期待値だけを共有する。
3. 3〜4章でOAuthとブラウザログインを完了する。
4. 5〜7章でBackendの実結果を確認する。結果はHTTP status、状態または`error.code`だけを記録する。
5. 9章の契約でDB保存、再確認、複数Form、ログアウト・期限切れ時の削除を検証する。

Issue #35側へ渡す完了条件は次のとおりです。

- 検証責任者、テストデータ責任者、保管責任者、削除予定日が記入済み。
- 生徒役でC0〜C4のClassroom期待結果を確認済み。
- G1〜G3の3状態を確認済み、またはGoogle側仕様で再現できないケースと代替自動テストを明記済み。
- scope不足、期限切れ、rate limitの扱いがBackend・DB・UIで合意済み。
- 共有物と永続データに秘密情報、個人情報、メール本文、回答内容、token、Cookie、message IDが含まれていない。

## 11. 終了チェック

- [ ] API結果と期待結果の差を、秘密情報を含まないケース単位で記録した
- [ ] ブラウザでアプリからログアウトした
- [ ] 一時Cookie jarを削除した
- [ ] shell変数にCookieやForm IDを残していない
- [ ] OAuth権限不足テスト後、不要な連携を解除した
- [ ] 検証アカウントとデータの次回棚卸し日・削除予定日を確認した
- [ ] Issue #35へ渡す資料に個人情報、メール本文、回答内容、token、Cookie、message IDがないことを再確認した
