---
tags:
  - issue/18
  - google-classroom
  - google-forms
  - gmail
  - implementation-note
status: completed
---

# Issue 18 Classroom課題・Form ID取得とGmail接続基盤

## 実装範囲

- ACTIVEなClassroomコースからPUBLISHEDな課題を取得する
- 課題の`materials.form.formUrl`からForm IDを抽出する
- Gmail読み取り権限をOAuthへ追加する
- メールを取得せずにGmail APIへの接続を確認する
- Google APIの認証・権限・通信エラーを安全なエラーへ変換する

回答控えメールの検索、回答済み判定、DB保存、UI表示はこのIssueに含めない。

## OAuth権限

- `classroom.courses.readonly`: ACTIVEなコースの取得
- `classroom.coursework.me.readonly`: ログインユーザーが閲覧できる課題の取得
- `gmail.readonly`: 次のIssueで回答控えメールを読み取るための権限

すべて読み取り専用とし、アクセストークンは既存のメモリセッションだけに保持する。

認証・Classroom・Gmailを含むJSONレスポンスには`Cache-Control: private, no-store`を付け、ユーザー固有データやエラーをブラウザ・共有キャッシュへ保存しない。

## バックエンドAPI

### `GET /api/classroom/coursework/forms`

ACTIVEな各コースのPUBLISHEDな課題をページングして取得する。レスポンスにはコースID・コース名・課題ID・課題種別・タイトル・任意の説明、リンク、期限と、添付FormのID・URL・URL形式の種別（`standard`または`published`）を含める。

Form IDはGoogle Classroom APIが返す`docs.google.com/forms/d/{id}`または`docs.google.com/forms/d/e/{id}`形式から抽出する。`formId`はForms APIのcanonical resource IDを保証する値ではなく、Form URL中のopaque identifierである。認識できないURLを推測して返さず、上流レスポンス異常として扱う。

### `GET /api/gmail/connection`

Gmailの`users.getProfile`へ`fields=historyId`を指定して接続を確認し、成功時は`{"connected":true}`だけを返す。メールアドレス、メール一覧、メール本文は取得しない。

## エラー処理

- セッションなし: `401 unauthenticated`
- Googleの認証期限切れ: `401 session_expired`としてセッションとCookieを破棄
- Classroom権限不足: `403 classroom_forbidden`
- Gmail権限不足: `403 gmail_forbidden`
- Gmailのquota/rate limit: `503 gmail_rate_limited`
- 通信失敗、不正レスポンス、その他の上流エラー: `502 classroom_unavailable`または`502 gmail_unavailable`

Googleのレスポンス本文、トークン、内部例外メッセージはクライアントやログへ出さない。
