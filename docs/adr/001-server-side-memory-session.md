# ADR-001：アクセストークンをバックエンドのメモリセッションへ保持する

- 状態：草案／未レビュー
- 記録日：2026-10-17
- 記録区分：現状から復元

## 背景・課題

Google OAuthで取得した権限を使い、バックエンドからGoogle APIへアクセスする。Issue 10実装ノートは、単一プロセスでのローカル確認と、トークンをブラウザへ渡さない方針を記録している。

## 決定／確認できた現状

`MemorySessionStore`の`Map`にアクセストークン、有効期限、付与スコープを保持し、ブラウザにはセッションIDのCookieを渡す。認可待ちの`state`は期限付き・一度だけ検証する。

OAuth設定は`access_type: online`で、認証済みセッションの期限をトークンの期限に合わせる。refresh tokenを保存する経路や、プロセス間で共有する永続セッションは確認した実装にない。

## 理由

[Issue 10実装ノート](../obsidian/issue-10-google-oauth.md)の「追加しなかった依存関係」「セキュリティとデータ最小化の判断」は、当時のローカル確認には期限付きメモリセッションで足りること、トークンをバックエンドだけに置くことを理由としている。現在もこの条件が妥当かは確認が必要。

## 影響・制約

- バックエンド再起動でセッションが失われ、期限切れ後も再ログインが必要になる。
- 複数プロセスでの共有や再起動後の維持を要件にする場合は、新しい設計判断が必要。

## 確認根拠

- [session-store.mjs](../../backend/auth/session-store.mjs)：`MemorySessionStore`、`consumePending`、`getAuthenticatedResult`。
- [google-oauth.mjs](../../backend/auth/google-oauth.mjs)：`createAuthorizationUrl`、`exchangeCode`。
- [app.mjs](../../backend/app.mjs)：callback、Cookie設定、セッション応答、logout。
- [session-store.test.mjs](../../backend/auth/session-store.test.mjs)、[app.test.mjs](../../backend/app.test.mjs)：期限切れ、state不一致、セッション応答のテスト定義。

## 検証項目・実施状況

コードとテスト定義を確認。テスト実行と実Google OAuthの確認は今回未実施。

## 未確認事項

- 永続化や複数バックエンドを必要とする予定はあるか。
- Issue 10ノートは当時の最小スコープを記載しているが、現在の`GOOGLE_OAUTH_SCOPES`はClassroom課題とGmailも含む。過去の範囲を現行の権限一覧として使わない。
