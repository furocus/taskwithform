# Issue #35 実Googleアカウント・DB連携検証ランブック

更新日: 2026-08-31  
対象: GitHub Issue #35「Googleアカウント実データでDB連携を検証」  
対象ブランチ: `issue-35-real-account-db-validation`

## 1. この文書の扱い

この文書は、実GoogleアカウントでClassroom課題、添付Form、Gmailの回答控え、ブラウザのIndexedDBを結合確認するための再現手順と、秘密情報を残さない結果記録テンプレートです。

このコミットでは実Googleアカウントを使った確認を実施していません。検証用の認証情報が提供されておらず、Classroom APIレスポンスをCourseTaskSnapshotへ変換してコース単位で同期するIssue #27も未完了だからです。以下の手順を実施していない状態を、成功または完了として記録してはいけません。

Issue #35の完了判定は、実測結果に次のすべてが記録され、再現できることを条件とします。

- ClassroomのFormなし課題、Formが1件の課題、複数Formの課題を取得できる
- `submitted`、`unreviewable`、`needsReview`の3状態を、判定・保存・再取得できる
- 同じ課題または同じFormを再同期・再確認しても重複レコードが増えない
- 課題またはFormを削除したとき、関連する回答確認結果も残らない
- ページ再読込後も、対象アカウントのデータだけを再取得できる
- ログアウト、アクセストークン期限切れ、別アカウントへの切替でデータが漏れない
- IndexedDB、HTTPレスポンス、ブラウザストレージ、バックエンドログにトークン、メール本文、回答内容、メールアドレスなどが残らない

## 2. 実装済み範囲と責務境界

### バックエンドのHTTP境界

| 操作           | エンドポイント                          | 成功時の確認対象                                 | 機密情報の扱い                                       |
| -------------- | --------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| OAuth開始      | `GET /api/auth/google`                  | GoogleへのリダイレクトとHttpOnlyセッションCookie | stateとCookie値を記録しない                          |
| OAuth callback | `GET /api/auth/google/callback`         | セッション作成後にフロントへ戻る                 | code、アクセストークン、Googleレスポンスを記録しない |
| セッション     | `GET /api/auth/session`                 | `authenticated`、期限切れ時の`false`             | token、付与スコープ一覧を返さない                    |
| コース件数     | `GET /api/classroom/courses/count`      | ACTIVEコース件数                                 | コース一覧や個人情報を返さない                       |
| 課題/Form一覧  | `GET /api/classroom/coursework/forms`   | PUBLISHED課題とForm URL由来のID・形式            | Classroom生レスポンスを返さない                      |
| Gmail接続      | `GET /api/gmail/connection`             | `{ "connected": true }`                          | メールアドレス、一覧、本文を返さない                 |
| Form回答確認   | `GET /api/gmail/forms/:formId/response` | `status`と、submitted時だけ`receiptReceivedAt`   | 本文、回答、message IDを返さない                     |
| ログアウト     | `POST /api/auth/logout`                 | 204、Cookie削除、Google token revoke試行         | token値とrevokeエラー本文を記録しない                |

OAuthはClassroom courses、Classroom coursework、Gmailの読み取り専用スコープを要求します。Googleがcourseworkの付与スコープを`classroom.student-submissions.me.readonly`として返す場合も、現行バックエンドは同等の表記として扱います。スコープ値自体は結果記録へ貼り付けません。

### ブラウザ側のDB境界

現在のDexie Version 2には、次のストアがあります。

- `tasks`: Classroom課題とForm URLのスナップショット
- `syncStates`: コースごとの取得日
- `answerConfirmations`: Form URL、確認状態、確認日時

`TaskRepository.replaceCourseSnapshot()`は`courseId + courseWorkId`を外部同一性として課題スナップショットを置換し、同じ課題の内部IDを維持します。`TaskRepository.clearLocalData()`は現時点では`tasks`と`syncStates`を消去します。`AnswerConfirmationRepository.clearAll()`は別メソッドであり、ログアウトや同期処理にはまだ接続されていません。

### 現時点で実データ検証を阻む事項

- `/api/classroom/coursework/forms`の結果をCourseTaskSnapshotへ変換してIndexedDBへコース単位で同期する実装がない（Issue #27）。
- `/api/gmail/forms/:formId/response`の回答確認結果をIndexedDBへ保存・再取得する実装がない（別途必要なDB/UI後続Issue。現時点で未作成または未完了）。
- バックエンドにDB保存用エンドポイントはなく、DBはブラウザ内だけで動く。
- `AnswerConfirmationRecord`は自動採番IDだけで、`taskExternalKey + formId`の一意制約やupsertがない。再確認による重複防止は別途必要なDB後続Issue（現時点で未作成または未完了）である。
- 現行の`replaceCourseSnapshot()`は回答確認結果を課題削除と連動して削除しない。回答確認結果の削除連携は別途必要なDB/UI後続Issue（現時点で未作成または未完了）である。
- DB名は全ユーザー共通で、GoogleユーザーIDによる分離がない。ログアウト時の`clearLocalData()`接続も未実装である。
- `src/features/tasks/useTasks.ts`は現状`mockTasks`を表示しており、実Classroom同期結果を画面へ接続していない。
- `src/features/tasks/answerConfirmation.api.ts`のURLからForm IDを取り出す処理は、標準URLでは末尾の`viewform`を取り出すため、Form ID契約は別途必要なUI/API後続Issue（現時点で未作成または未完了）で再確認する必要がある。

回答確認結果の3状態のDB表現、`taskExternalKey + formId`の一意保存/upsert、Form/課題削除、ログアウト・期限切れ時の全消去、Form ID抽出契約は、Issue #27（Classroom APIレスポンスのCourseTaskSnapshot変換・コース単位同期）の対象外です。これらは別途必要なDB/UI/API後続Issueとして扱い、担当Issueが作成・完了するまでBlockedとします。

これらを満たさないまま、バックエンドの実Google API応答だけを確認してIssue #35完了とはしません。

## 3. 前提、依存、実行環境

### 必須の依存

1. Issue #36で用意された検証用Google Cloud設定、OAuth同意画面、テストアカウント、API利用ガイド
2. Issue #27で実装されたClassroom APIレスポンス→CourseTaskSnapshot変換とコース単位のIndexedDB同期
3. Google Classroom APIとGmail APIを有効にした、検証専用のGoogle Cloudプロジェクト
4. 実データを個人用プロフィールから分離する専用ブラウザプロフィール

実アカウントのメールアドレス、クライアントシークレット、OAuth code、アクセストークン、メール本文は、この文書・Issue・コミット・スクリーンショット・チャットへ記録しません。

### ローカル起動

プロジェクトの標準起動方法に従ってバックエンドとフロントエンドを起動します。Dockerを使う場合のCompose状態変更は、実施者が明示的に許可された環境で行います。本Issueの準備作業ではコンテナを起動、停止、再構築していません。

環境変数はローカルの`.env`だけへ設定し、値を表示するコマンドを実行しません。

```dotenv
GOOGLE_CLIENT_ID=<検証用クライアントID>
GOOGLE_CLIENT_SECRET=<検証用クライアントシークレット>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
FRONTEND_ORIGIN=http://localhost:5173
```

起動後、機密情報を含まないヘルスチェックだけを行います。

```bash
curl --silent --show-error http://localhost:3000/api/health
```

期待値は`{"status":"ok"}`です。認証後の`curl -v`や、Cookieを含むリクエストのログ保存は行いません。ブラウザでは`http://localhost:5173/login`を専用プロフィールで開きます。

### 事前確認

- Google CloudのリダイレクトURIが`http://localhost:3000/api/auth/google/callback`と一致する。
- テスト用ブラウザプロフィールに、個人アカウントのGoogleセッション、拡張機能、保存パスワードがない。
- 作業ツリーに`.env`、HAR、スクリーンショット、DevToolsのエクスポート、メール本文のファイルがない。
- 実施者は、後述のエイリアスだけを結果欄へ記入できる状態である。
- 開始前のIndexedDB、Local Storage、Session Storage、Cookieの件数を記録する。値は記録しない。

## 4. 匿名化fixture設計

fixtureの別名は、実アカウントのコース名、課題名、Form名、メールアドレスを置き換えるための記号です。fixtureのIDやURLを結果欄へ貼り付けません。次表の`form-A`などは説明上の別名であり、Google APIへ送る値ではありません。

| fixture別名                      | Classroom構成                              | Gmailの状態                                        | APIで期待する状態                               | DBで期待する扱い                     |
| -------------------------------- | ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| `course-A/work-no-form`          | Formなし課題1件                            | Gmailを検索しない                                  | Gmail API応答なし。UI集約状態は`unreviewed`     | `formUrls`空、回答確認行なし         |
| `course-A/work-one-submitted`    | Form 1件（`form-A`）                       | 対象Formの回答控えが一意に1件                      | `submitted`、`receiptReceivedAt`あり            | Form単位で1行、回答内容なし          |
| `course-A/work-one-unreviewable` | Form 1件（`form-B`）                       | 対象候補なし、または判定材料不足                   | `unreviewable`                                  | 未回答と断定しない状態へ写像         |
| `course-A/work-one-needs-review` | Form 1件（`form-C`）                       | 同一Formの候補重複、別Form混在、解析不能のいずれか | `needsReview`                                   | 3状態を失わず保存                    |
| `course-A/work-two-forms`        | Form 2件（`form-A`、`form-B`）             | 一方がsubmitted、他方がunreviewable等              | Formごとの結果。混在時の課題集約は`needsReview` | `taskExternalKey + formId`ごとに1行  |
| `course-B/work-same-work-id`     | course-Aと同じcourseWorkId文字列を持つ課題 | account/courseをまたいだ混同を確認                 | 別コースの課題として返る                        | `courseId`を含む外部キーで別レコード |

### 3状態の作り方

- `submitted`: 検証用Formへ1回だけ送信し、回答控えが届いた後に確認する。返却された日時の実値は記録せず、ISO 8601形式であることだけを確認する。
- `unreviewable`: Formを送信していない状態、または対象Formを一意に判定できる候補がない状態で確認する。これは「未回答」と同義に記録しない。
- `needsReview`: 検証用Formを意図的に2回送信する、または判定材料が混在するfixtureを用意し、保守的に要確認となることを確認する。メール本文を証拠として保存しない。

実Googleアカウントでfixtureを作る場合も、コース名・課題名・Form名には実在の氏名、学校名、メールアドレスを入れず、Issue #36の命名規則に従った無意味な別名を使います。

## 5. 実行手順

### 5.1 OAuth、Classroom、Gmailの境界確認

1. 専用プロフィールでログインを開始する。
2. Googleの同意画面に表示されるのが読み取り専用のClassroom/Gmail権限だけであることを確認する。画面のメールアドレスやOAuth codeは撮影しない。
3. `/api/auth/session`相当の認証状態が`authenticated: true`になり、期限だけが返ることを確認する。
4. Classroomコース件数を取得し、ACTIVEコースだけが数えられることを確認する。
5. 課題/Form一覧を取得し、fixtureの課題とFormの個数だけを照合する。レスポンス本文を結果へ貼り付けない。
6. Gmail接続確認を実行し、`connected: true`だけが返ることを確認する。メール一覧や本文が取得されないことをNetworkとログで確認する。
7. Formなし、Form 1件、複数Formの各fixtureについて、Classroom側のForm IDとGmail確認側の対象が一致することを別名で照合する。

この段階で失敗した場合は、後続のDB確認を実施せず、HTTPステータス、固定エラーコード、再試行可否だけを記録します。Googleのレスポンス本文やアカウント識別情報は記録しません。

### 5.2 Form回答確認と3状態

各Formについて次を行います。

1. 回答確認を1回実行する。
2. Networkのレスポンスに、`status`と必要な場合の`receiptReceivedAt`以外がないことを確認する。
3. UI接続後は、課題カードの表示が`submitted`、`unreviewable`、`needsReview`のいずれかとして状態を失わず表示されることを確認する。
4. Formなし課題では、Form確認リクエストが発生せず、課題が`unreviewed`のままであることを確認する。
5. 複数Form課題では各Formを個別に確認し、全件submittedなら集約状態submitted、一部submittedまたはneedsReviewを含む場合は保守的にneedsReviewとなることを確認する。

### 5.3 保存、再取得、再確認

Issue #27のClassroom APIレスポンス→CourseTaskSnapshot変換・コース単位同期と、別途必要な回答確認DB/UI後続実装がそろった環境で、同一fixtureについて次を順に行います。

1. Classroom同期を1回実行し、課題件数、コースごとの同期状態、Form URL数を記録する。
2. 回答確認を実行し、Formごとの3状態と保存件数を記録する。
3. 同じ回答確認をもう一度実行する。保存件数が増えず、同じ論理レコードが更新されることを確認する。確認日時の実値は記録せず、更新されたかだけを記録する。
4. ブラウザを再読込し、課題、Form数、状態、同期状態が一致することを確認する。
5. 同じClassroom同期を再実行する。課題の内部ID、回答確認の論理ID、Form単位の件数が増えないことを確認する。
6. Formを課題から外して再同期する。対象Formの回答確認結果が残らず、残りの課題・Formだけが再取得されることを確認する。
7. 課題を削除またはPUBLISHED対象外にして再同期する。課題、同期状態、紐づく回答確認結果がまとめて削除されることを確認する。

現在のmainでは4〜7を満たす再読込・回答確認保存・再同期重複防止・削除連携が未実装です。Classroom同期以外は#27の対象外であり、別途必要なDB/UI後続Issue（現時点で未作成または未完了）が必要です。未実装環境で行った確認は「Blocked」とし、Passにはしません。

### 5.4 ログアウト、期限切れ、別アカウント

#### ログアウト

1. 課題と回答確認結果が保存された状態で、UIのログアウトを実行する。
2. HTTP 204、セッションCookie削除、再度のセッション確認で`authenticated: false`を確認する。
3. Google token revokeが失敗しても、ローカルセッションとローカルDBが消えることを確認する。
4. IndexedDBの`tasks`、`syncStates`、`answerConfirmations`の件数が0になることを確認する。
5. ログにtoken値、revokeのエラー本文、メール本文がないことを確認する。

#### アクセストークン期限切れ

実アカウントで1時間待つことが現実的でない場合、バックエンドの`MemorySessionStore`にテスト用の時刻を注入する自動テストで期限切れ経路を確認します。実運用相当の確認では、期限切れまたはGoogle側401を発生させ、次を確認します。

- セッション確認が未認証になる。
- Classroom/Gmail APIは再利用されず、401と固定コード`session_expired`になる。
- Cookieが削除される。
- 別途必要なDB/UI後続実装後はIndexedDB全ストアが消える。
- エラー本文やアクセストークンがレスポンス・ログに出ない。

#### 別アカウント

1. アカウントAでfixture-Aだけを同期し、ブラウザの値は別名と件数だけ記録する。
2. ログアウトしてローカルデータ消去を確認する。
3. 同じ専用プロフィール、または消去済みの別プロフィールでアカウントBへログインし、fixture-Bだけを同期する。
4. アカウントBの一覧とIndexedDBにfixture-Aが存在しないことを確認する。
5. アカウントAへ戻り、アカウントBの課題が見えないことを確認する。

現行DBはユーザー単位に分離されておらずログアウト削除も未接続のため、この手順は別途必要なDB/UI後続の削除・分離設計が入るまでBlockedです。ブラウザプロフィールを分けただけでPassにしてはいけません。

## 6. IndexedDB、ブラウザストレージ、ログの秘密情報監査

### IndexedDB

DevToolsのApplication > IndexedDB > `taskwithform`を開き、値のコピーやエクスポートをせず、ストア名、レコード件数、キー項目だけを確認します。

保存してよい項目は次の業務データに限ります。

- `tasks`: 外部課題キー、courseId、課題の表示用項目、Form URL、提出状態、期限
- `syncStates`: courseId、fetchedDate
- `answerConfirmations`: 課題とFormを一意に識別するキー、3状態、confirmedAt、必要最小限の受信時刻

次の項目がキー名、値、ネストしたオブジェクト、文字列の一部として存在したらFailです。

- `access_token`、`refresh_token`、OAuth code、`Authorization: Bearer ...`
- Googleアカウントのメールアドレス、氏名、ユーザーIDなどの識別情報
- Gmailのmessage ID、メールヘッダー、差出人以外のメールメタデータ、生レスポンス
- メール本文、Form回答内容、添付ファイル、自由記述の回答
- ClassroomまたはGmail APIレスポンス全体

課題タイトルやコース名は画面表示に必要な範囲であり得ますが、結果記録には値を記載せず、保存の可否と件数だけを記録します。

### Local Storage、Session Storage、Cookie

- Local Storage、Session Storageにtoken、OAuth code、メール本文、回答内容がない。
- セッションCookieはHttpOnly、SameSite=Lax、Path=/であり、production相当ではSecureである。
- Cookie値を結果欄、スクリーンショット、HAR、ログへ保存しない。
- ログアウトまたは期限切れ後にCookieが削除される。

### バックエンドログとNetwork

開発者ツールまたは標準ログを目視し、機密文字列が「ない」ことだけを確認します。検索や確認後の出力をファイルへ保存しません。少なくとも次の語句を検索対象にします。

`access_token`、`refresh_token`、`Bearer`、`Authorization`、`client_secret`、`messageId`、`emailAddress`、`@`、メール本文に含まれる固有語、Form回答の固有語

期待結果は、起動メッセージと、固定文面の警告・エラーだけです。Googleのエラー本文、Gmail本文、tokenをloggerへ渡さないことを確認します。HTTP成功レスポンスも、Form確認では`status`と`receiptReceivedAt`だけ、Gmail接続では`connected`だけであることを確認します。

## 7. エラー、再試行、権限の期待結果

| 条件                             | HTTP/コード                     | セッション | 記録してよい実測値                 |
| -------------------------------- | ------------------------------- | ---------- | ---------------------------------- |
| 未ログイン                       | 401 / `unauthenticated`         | 未認証     | HTTPと固定コード                   |
| Classroomスコープ不足            | 403 / `classroom_scope_missing` | 維持       | HTTPと固定コード                   |
| Gmailスコープ不足・拒否          | 403 / `gmail_forbidden`         | 維持       | HTTPと固定コード                   |
| Google token期限切れ             | 401 / `session_expired`         | 削除       | HTTP、固定コード、Cookie削除の有無 |
| Google Classroom/Gmailの一時障害 | 502 / `*_unavailable`           | 維持       | HTTP、固定コード                   |
| Gmailレート制限                  | 503 / `gmail_rate_limited`      | 維持       | HTTP、固定コード、再試行可否       |
| Form ID不正                      | 400 / `invalid_form_id`         | 維持       | HTTP、固定コード                   |
| 想定外バックエンド例外           | 500 / `internal_error`          | 維持       | HTTP、固定コード、機密値非露出     |

エラー本文を貼らず、再試行可能か、ログアウトして再認証が必要かだけを記録します。既存のバックエンドテストは、upstream本文を読まないこと、ネットワーク詳細を包まないこと、Form回答の余計なフィールドを返さないこと、401/403/429/502/503の変換を確認しています。今回、想定外サービス例外の最終フォールバックが機密メッセージを返さないことを1件追加で確認します。

## 8. 結果記録テンプレート

この章をコピーして実施結果を記入します。`Pass`は実測した場合だけ使い、未実施は`Not run`、依存未完了は`Blocked`とします。実データ、メール本文、URL、メールアドレス、token、Cookie値を記入しません。

### 実施メタデータ

| 項目                  | 記録                                                   |
| --------------------- | ------------------------------------------------------ |
| 実施日・タイムゾーン  | `YYYY-MM-DD HH:mm JST`                                 |
| リポジトリcommit      | `<SHA>`                                                |
| 実施者                | `<匿名の担当者ID>`                                     |
| Googleアカウント      | `<account-A / account-B の別名だけ>`                   |
| Cloudプロジェクト     | `<project-fixture の別名だけ>`                         |
| ブラウザプロフィール  | `<profile-fixture の別名だけ>`                         |
| #27 Classroom同期実装 | `未実装 / 実装済み（commit: <SHA>）`                   |
| #36手順・アカウント   | `未提供 / 利用可能（秘密値は記録しない）`              |
| 開始前のDB件数        | `tasks: __ / syncStates: __ / answerConfirmations: __` |

### シナリオ結果

| ID  | シナリオ                              | 結果      | 観測（値でなく件数・状態）                          | 秘密情報監査 | 備考/Issue               |
| --- | ------------------------------------- | --------- | --------------------------------------------------- | ------------ | ------------------------ |
| A1  | OAuth、Classroomコース件数            | `Not run` | `HTTP: __ / count: __`                              | `未実施`     |                          |
| A2  | Formなし課題                          | `Not run` | `forms: 0 / Gmail request: 0 / UI: unreviewed`      | `未実施`     |                          |
| A3  | Form 1件・submitted                   | `Not run` | `status: __ / receipt時刻形式: __ / 保存件数: __`   | `未実施`     |                          |
| A4  | Form 1件・unreviewable                | `Not run` | `status: __ / 保存件数: __`                         | `未実施`     | 未回答と断定していないか |
| A5  | Form 1件・needsReview                 | `Not run` | `status: __ / 保存件数: __`                         | `未実施`     |                          |
| A6  | 複数Form                              | `Not run` | `Form数: __ / 個別状態: __ / 集約状態: __`          | `未実施`     |                          |
| A7  | 回答確認の再実行                      | `Not run` | `前後の論理レコード件数: __ → __`                   | `未実施`     | 重複なしが条件           |
| A8  | ページ再読込                          | `Not run` | `課題数・状態・同期状態の一致: __`                  | `未実施`     |                          |
| A9  | Classroom再同期                       | `Not run` | `内部ID維持: __ / 件数: __ → __`                    | `未実施`     |                          |
| A10 | Form/課題削除後の再同期               | `Not run` | `対象課題・回答確認の削除: __`                      | `未実施`     |                          |
| A11 | ログアウト                            | `Not run` | `204: __ / session false: __ / DB各件数: __`        | `未実施`     |                          |
| A12 | token期限切れまたは401                | `Not run` | `session_expired: __ / Cookie削除: __ / DB削除: __` | `未実施`     |                          |
| A13 | 別アカウント切替                      | `Not run` | `A→B漏洩: __ / B→A漏洩: __`                         | `未実施`     |                          |
| A14 | IndexedDB・Storage・ログ・Network監査 | `Not run` | `秘密情報なし: __`                                  | `Not run`    | raw dataは保存しない     |
| A15 | 権限不足・障害・不正Form ID           | `Not run` | `固定コードのみ: __ / 再試行要否: __`               | `未実施`     |                          |

### 現時点の結果

| 項目                               | 結果                     | 根拠                                                                       |
| ---------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| 実Google OAuth                     | `Not run`                | 検証用認証情報が提供されていない                                           |
| Classroom実データ                  | `Not run`                | 実アカウントがなく、実データを取得していない                               |
| Gmail実データ・3状態               | `Not run`                | 実アカウントがなく、メール本文を扱っていない                               |
| IndexedDBへのClassroom実同期       | `Blocked`                | Issue #27（Classroom同期）が未完了                                         |
| 回答確認の保存・重複防止・削除連携 | `Blocked`                | #27の対象外。別途必要なDB/UI後続Issueが未作成または未完了                  |
| 別アカウント分離                   | `Blocked`                | 現行DBがユーザー単位で分離されず、ログアウト消去も未接続                   |
| 秘密情報を残さない設計の単体確認   | `Pass`（自動テスト範囲） | バックエンド既存テストと追加フォールバックテスト。ただし実環境監査は未実施 |

## 9. クリーンアップ

1. Googleからログアウトし、アプリのログアウトを実行する。
2. 専用ブラウザプロフィールのCookie、Local Storage、Session Storage、IndexedDBを消去する。
3. 検証用Classroomの課題、Form、回答控えメールをIssue #36の廃棄手順に従って削除する。
4. ローカル`.env`、HAR、スクリーンショット、DevToolsエクスポート、テストメモを確認し、秘密情報を含む一時ファイルを残さない。
5. `git status --short`と`git diff --check`を実行し、認証情報や実データが作業ツリーへ入っていないことを確認する。

クリーンアップの実施結果も値ではなく、`完了 / 未完了 / 該当なし`だけを記録します。

## 10. 未解決事項と後続作業

| 事項                     | 担当/依存                       | 完了条件                                                                   |
| ------------------------ | ------------------------------- | -------------------------------------------------------------------------- |
| Classroom→IndexedDB同期  | #27 / Classroom同期担当         | APIレスポンスをCourseTaskSnapshotへ変換し、コース単位で原子的に置換できる  |
| 3状態のDB表現            | 別途DB後続（未作成/未完了）     | `submitted`、`unreviewable`、`needsReview`を失わず保存・再取得できる       |
| 回答確認の一意性         | 別途DB後続（未作成/未完了）     | `taskExternalKey + formId`でupsertし、再確認・再同期で重複しない           |
| Form/課題削除            | 別途DB/UI後続（未作成/未完了）  | 対象課題と回答確認結果を同じ削除方針で消せる                               |
| ログアウト・期限切れ消去 | 別途DB/UI後続（未作成/未完了）  | 全ローカルストアを消し、次アカウントへデータが漏れない                     |
| Form ID抽出契約          | 別途UI/API後続（未作成/未完了） | Classroom producerのIDをGmail endpointへ正しく渡す                         |
| 検証用アカウント/API手順 | #36                             | 秘密値を公開せず、実アカウントで再現可能な手順がある                       |
| 想定外例外の運用監視     | backend担当                     | 固定エラーだけを返し、ログ基盤にも機密値を記録しないことを実環境で確認する |

実アカウント、#27（Classroom同期）、#36、または別途必要なDB/UI/API後続Issueのいずれかが未完了の場合、Issue #35の実データ完了条件は未達です。次の実施者はこの文書の結果欄を更新し、成功したシナリオだけを根拠付きでPassにしてください。
