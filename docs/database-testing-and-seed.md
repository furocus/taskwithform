# ローカルDBのテスト・seed導入手順

対象: `src/database/**`を担当する開発者  
対象DB: ブラウザのIndexedDB（Dexie）

## 1. 目的

ローカルDBは、次の2段階で確認します。

1. Repositoryの保存・更新・削除が正しいことを自動テストで確認する
2. 必要に応じて開発用seedをブラウザへ投入し、実際のIndexedDBを確認する

通常のDBロジック確認では自動テストが最速です。seedは、ブラウザ上の保存内容やUIとの結合を手動確認するときに使用します。

現在、課題一覧とカレンダーはRepositoryへ接続されていません。そのため、seedを投入しても画面には自動表示されません。接続前はブラウザのDevToolsでIndexedDBを確認します。

## 2. 初回セットアップ

リポジトリルートで依存関係をインストールします。

```bash
npm ci
```

DB関連で使用する主なパッケージは次のとおりです。

| パッケージ       | 用途                       |
| ---------------- | -------------------------- |
| `dexie`          | IndexedDBの操作            |
| `fake-indexeddb` | Node.js上でIndexedDBを再現 |
| `vitest`         | 自動テストの実行           |

既に`npm ci`を実行済みなら、追加インストールは不要です。

## 3. 既存の自動テストを実行する

DBのRepositoryテストだけを実行します。

```bash
npm test -- src/database/task.repository.test.ts
```

全テストを実行する場合は次のコマンドを使います。

```bash
npm test
```

型エラーとビルドも確認します。

```bash
npm run typecheck
npm run build
```

Repositoryテストでは、テストごとに専用のIndexedDBを作成し、終了後に削除します。開発用の`taskwithform`データベースには影響しません。

現在の主なテスト対象は次のとおりです。

- 同じ外部課題を更新しても内部UUIDが維持される
- コース単位のスナップショット置換と削除
- 不正なスナップショットのロールバック
- 未提出課題の期限順取得
- カレンダー期間内の未提出課題取得
- 非ACTIVEコースの削除
- 課題と同期状態の一括削除
- 想定外の個人情報を保存しない

新しいスキーマやRepositoryメソッドを追加した場合は、seedだけで済ませず、このテストへ正常系と異常系を追加してください。

## 4. 開発用seedを導入する

### 4.1 seedファイルを追加する

`src/database/dev-seed.ts`を作成し、次の内容を追加します。

```ts
import type { TaskRecordInput } from './database.types'
import { taskRepository } from './task.repository'

function toDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateFromToday(offsetDays: number): string {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + offsetDays)
  return toDateOnly(date)
}

function createTask(overrides: Partial<TaskRecordInput> = {}): TaskRecordInput {
  return {
    courseId: 'seed-course-1',
    courseName: '数学I',
    courseWorkId: 'seed-work-1',
    courseWorkType: 'ASSIGNMENT',
    subjectName: '数学',
    title: 'seed: 一次方程式',
    formUrls: [],
    status: 'unsubmitted',
    ...overrides,
  }
}

export async function seedLocalDatabase(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('The database seed is available only in development.')
  }

  await taskRepository.clearLocalData()

  await taskRepository.replaceCourseSnapshot({
    courseId: 'seed-course-1',
    fetchedDate: dateFromToday(0),
    tasks: [
      createTask({
        courseWorkId: 'seed-work-due-today',
        title: 'seed: 今日が期限の課題',
        dueDate: dateFromToday(0),
        formUrls: ['https://docs.google.com/forms/d/seed-form-1/viewform'],
      }),
      createTask({
        courseWorkId: 'seed-work-due-later',
        title: 'seed: 3日後が期限の課題',
        dueDate: dateFromToday(3),
      }),
      createTask({
        courseWorkId: 'seed-work-no-due-date',
        title: 'seed: 期限なしの課題',
      }),
      createTask({
        courseWorkId: 'seed-work-submitted',
        title: 'seed: 提出済みの課題',
        dueDate: dateFromToday(-1),
        status: 'submitted',
        submittedAt: new Date().toISOString(),
      }),
    ],
  })

  await taskRepository.replaceCourseSnapshot({
    courseId: 'seed-course-2',
    fetchedDate: dateFromToday(0),
    tasks: [
      createTask({
        courseId: 'seed-course-2',
        courseName: '英語',
        courseWorkId: 'seed-work-english',
        subjectName: '英語',
        title: 'seed: 英作文',
        dueDate: dateFromToday(7),
      }),
    ],
  })
}

export async function clearSeededDatabase(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('The database seed is available only in development.')
  }

  await taskRepository.clearLocalData()
}
```

このseedは実行のたびに既存のローカルデータを全削除してから投入します。開発用データを残したい場合は実行しないでください。

### 4.2 seedを投入する

フロントエンドを起動します。

```bash
npm run dev:frontend
```

ブラウザで`http://localhost:5173`を開き、DevToolsのConsoleで次を実行します。

```js
const { seedLocalDatabase } = await import('/src/database/dev-seed.ts')
await seedLocalDatabase()
```

`undefined`が返り、エラーが表示されなければ投入完了です。

seedを削除する場合は次を実行します。

```js
const { clearSeededDatabase } = await import('/src/database/dev-seed.ts')
await clearSeededDatabase()
```

### 4.3 IndexedDBの内容を確認する

ChromeまたはEdgeのDevToolsで次を開きます。

1. `Application`
2. `Storage`内の`IndexedDB`
3. `taskwithform`
4. `tasks`または`syncStates`

`tasks`には5件、`syncStates`には2件保存されます。表示が更新されない場合は、IndexedDBの一覧を右クリックしてRefreshするか、ページを再読み込みします。

## 5. seedで確認する項目

| 確認項目     | 期待結果                                           |
| ------------ | -------------------------------------------------- |
| 複数コース   | `seed-course-1`と`seed-course-2`が別々に保存される |
| Formあり課題 | `formUrls`にURLが保存される                        |
| 期限なし課題 | `dueDate`が存在しない                              |
| 提出済み課題 | `status`が`submitted`で`submittedAt`が存在する     |
| 未提出課題   | `status`が`unsubmitted`で`submittedAt`が存在しない |
| 同期状態     | コースごとに1件保存される                          |
| 再実行       | データが重複せず、同じ5件になる                    |

画面をRepositoryへ接続した後は、課題一覧で期限順、カレンダーで期限ありの未提出課題、フィルターで科目ごとの表示も確認します。

## 6. スキーマ変更時の確認

既存のVersion 1スキーマは書き換えず、`src/database/db.ts`へ新しいVersionとマイグレーションを追加します。

最低限、次の2パターンを確認します。

1. 空のDBを新しいバージョンで作成できる
2. 旧バージョンのデータを保持したまま新しいバージョンへ更新できる

マイグレーション確認では、旧スキーマのDBをテスト内で作成し、データ投入後に新しい`TaskWithFormDatabase`で開き直します。既存データが消えていないことと、新しい項目・インデックスが利用できることを自動テストで検証します。

## 7. 運用上の注意

- seedはGoogle Classroom APIの実データ確認を置き換えるものではありません。
- Google APIレスポンス全体、メール本文、回答内容、OAuthトークンは保存しません。
- seedデータにも実在する氏名、メールアドレス、コース名を使用しません。
- DBへの投入はDexieテーブルを直接操作せず、原則としてRepositoryを経由します。
- seedをアプリ起動時に自動実行しません。
- `import.meta.env.DEV`による制限を外しません。
- 手動確認後も、期待する動作は自動テストへ残します。

## 8. 関連ファイル

| ファイル                               | 役割                             |
| -------------------------------------- | -------------------------------- |
| `src/database/database.types.ts`       | DBへ保存する型                   |
| `src/database/db.ts`                   | DexieのDB定義とスキーマ          |
| `src/database/task.repository.ts`      | 保存・削除・検索処理             |
| `src/database/task.repository.test.ts` | `fake-indexeddb`による自動テスト |
| `docs/database-handoff.md`             | 現在のDB設計と引き継ぎ情報       |
