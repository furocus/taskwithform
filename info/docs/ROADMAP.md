# ロードマップ

## Phase 1: UI Mock

- Vue 3・TypeScript・Viteの初期化
- Tailwind CSSの導入
- ダミー課題
- PC向け未完了課題一覧
- スマートフォン向け課題一覧
- 課題詳細シート
- 7日間タイムライン

完了条件:

- ダミーデータで主要画面を操作できる
- PC・スマートフォンでレイアウトが崩れない

## Phase 2: Local Progress

- Dexie導入
- 課題の完了記録を保存
- 完了課題を通常画面から除外
- 完了直後の「元に戻す」
- 再読み込み時の復元
- ローカルデータ全削除

完了条件:

- ブラウザを閉じても進捗が残る
- Googleの認証情報を一切保存していない

## Phase 3: Google Classroom

- Google Cloudプロジェクト設定
- Google Identity Services Token Model
- Classroom読み取りスコープ
- APIレスポンスのZod検証
- ダミーデータとの差し替え
- 認可拒否・期限切れ処理

完了条件:

- ユーザー操作時だけ同期する
- Access Tokenを永続化しない
- 学校アカウントで課題を取得できる

## Phase 4: PWA

- Manifest
- アプリアイコン
- Service Worker
- オフライン起動
- 更新通知
- Android・iPhone確認

完了条件:

- ホーム画面へ追加できる
- オフラインで前回データを表示できる

## Phase 5: Hosting and Security

- Cloudflare Pages
- OAuth許可オリジン
- CSP
- セキュリティヘッダー
- Preview環境の保護

完了条件:

- サーバーへ個人データを保存しない
- 本番ビルドに秘密情報が含まれない

## Phase 6: Optional Features

- Gmail回答確認
- Google Calendar連携
- 暗号化バックアップ
- インポート・エクスポート
- 本格的な自動テスト
