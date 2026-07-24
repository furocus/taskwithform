# アーキテクチャ

## MVP

```text
Vue UI
  ↓
Composable
  ↓
Repository
  ↓
Dexie / IndexedDB
```

課題のダミーデータとローカル進捗を分離する。

```text
mockTasks
└─ 課題名・教科・期限・URL

IndexedDB
└─ 課題ID・完了日時・更新日時
```

## Responsibilities

### Vue Components

- 表示
- ユーザー操作の受付
- イベントの通知

DBやGoogle APIを直接操作しない。

### Composables

- 画面状態
- フィルター
- 課題の選択
- Repositoryの呼び出し

### Repository

- Dexie操作を隠蔽
- 進捗の保存・取得・削除
- 完了記録の保存・取得・取り消し
- 将来のDB変更に備えた境界

### Dexie

- IndexedDBのスキーマ
- マイグレーション
- トランザクション

## Future Google Integration

```text
ユーザー操作
  ↓
Google Identity Services Token Model
  ↓ 短期Access Token
Classroom REST API
  ↓
Zodで検証
  ↓
課題データへ変換
  ↓
画面表示
```

Access Tokenはメモリ上だけで扱い、同期終了後または期限切れ時に破棄する。

Google固有処理は次の境界へ隔離する。

```text
integrations/google/
├─ google-auth.client.ts
├─ classroom.client.ts
└─ classroom.mapper.ts
```

## Future PWA

- `vite-plugin-pwa`
- Web App Manifest
- Service Worker
- 静的アプリシェルのキャッシュ
- オフライン状態表示
- 更新通知

Service WorkerはMVPの画面とDBが安定してから追加する。

## Security Boundaries

- 外部データはDB保存前に検証する
- Google APIレスポンスを直接UI型として扱わない
- 外部URLはHTTPSと許可ホストを検証する
- HTML文字列を直接描画しない
- トークンをログ・Pinia・IndexedDBへ入れない
- 本番ではCSPとセキュリティヘッダーを設定する
