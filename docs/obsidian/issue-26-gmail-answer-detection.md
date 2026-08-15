---
project: taskwithform
issue: 26
status: implemented
updated: 2026-08-15
tags:
  - codex
  - taskwithform
  - gmail
  - answer-detection
---

# Issue #26 Gmail回答控えメール検索と回答状態判定API

## 目的

Google Formsの回答控えメールをGmail read-only APIで検索し、対象フォームの回答状態を安全な3状態で返す。

## 対象範囲

- `GET /api/gmail/forms/:formId/response` の認証・scope検査、Gmailエラー分類、キャッシュ制御
- Gmail messages.listの上限付きページ走査と重複ID排除、messages.getの最小fields取得
- MIME本文からの標準／公開Form URLの完全一致判定と受信日時（`internalDate`）のISO変換
- 回答本文、message ID、access token、Google生レスポンスをレスポンス・ログへ出さない

## 確定した設計

- Gmail検索は `from:forms-receipts-noreply@google.com` と検証済みForm IDを組み合わせ、`maxResults=100`で最大10ページ・100候補まで走査する。上限により全候補を確認できない場合は`needsReview`、ページトークン循環は`invalid_response`とする。1操作は最大110リクエスト、30秒のdeadlineで保護し、各fetch完了直後にも期限を再検査する。
- URLは本文中の各http(s)開始位置を個別走査し、`https://docs.google.com/forms/d/{id}/viewform|edit`または`/forms/d/e/{id}/viewform`のパス完全一致だけを根拠にする。query／fragment内に別URLが開始する場合も個別に収集する。開始位置は1024件、単一候補は16KiBを上限とし、超過は`needsReview`とする。http、別host、port、substringは一致させない。同一候補本文または候補集合に別の有効Form ID、またはForm形状の不正IDが混在する場合は`needsReview`とする。
- MIMEはtext/plain／text/htmlのbase64urlをstrict UTF-8でデコードし、nested multipartを反復走査する。深さ32、パート256、単一デコード512KiB、合計デコード2MiBを上限とし、超過は`needsReview`とする。`messages.get`のfieldsも同じ深さまで必要なmimeType／body／partsだけを再帰指定する。binary attachmentは判定根拠にせず、dataの有無を問わず外部text attachmentや壊れたMIMEは`needsReview`とする。
- 候補が0件、または全候補を正常解析して完全一致0件なら`unreviewable`。完全一致1件かつ他候補も解析可能で有効な`internalDate`がある場合だけ`submitted`。複数一致、解析不能候補、日時不正は`needsReview`とする。`internalDate`は回答日時そのものではなく、メール受信日時による近似値である。
- API応答は`submitted`（`receiptReceivedAt`付き）、`unreviewable`、`needsReview`の安全なフィールドに正規化する。Issue #21のUIでは回答控え受信時刻として扱い、Issue #22／DBのtask `submittedAt`や実際の回答時刻へ自動マップしない。エラーはIssue #18の`session_expired`、`gmail_forbidden`、`gmail_rate_limited`、`gmail_unavailable`分類を再利用する。

## セキュリティとデータ管理

- Form IDはURL-safe文字種と長さを検証してからGmail queryへ埋め込む。
- Gmail upstreamのエラー本文・reasonはallowlist分類後に破棄し、クライアント・ログ・DBへ保存しない。
- 全API応答は`private, no-store`。メール本文、回答内容、message ID、access tokenは外部へ返さない。

## 変更内容

- `backend/gmail/google-gmail.mjs`: Gmail検索、ページング、MIME解析、完全一致判定、エラー分類を実装。
- `backend/gmail/google-gmail.test.mjs`: 正常系、ページング、重複、循環、MIME、URL、日時、upstream形状を検証。
- `backend/app.mjs` / `backend/app.test.mjs`: API route、認証／scope、エラー境界、安全な応答を実装・検証。

## 検証

- focused: `npm test -- backend/google-form-id.test.mjs backend/classroom/google-classroom.test.mjs backend/gmail/google-gmail.test.mjs backend/app.test.mjs`（4 files / 108 tests passed、2026-08-15）
- full: `npm test`（12 files / 149 tests passed、2026-08-15）
- `npm run typecheck`、`npm run format:check`、`npm run build`、`git diff --check`（すべて成功、2026-08-15）

## 未決事項・後続作業

- Gmail実環境の実メール形式（Formsの通知テンプレート変更を含む）での統合確認は未実施。
