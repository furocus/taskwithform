# ブラウザRepository API 利用ガイド

この文書は、`src/database`が公開するIndexedDB Repository APIの動作要件と利用方法をまとめたものです。カレンダー向けAPIはPR #31で`main`へ追加された契約を記載しています。

## 基本方針

- データはブラウザのIndexedDBへDexieを使って保存する
- VueコンポーネントからDexieのテーブルを直接操作しない
- 通常はエクスポート済みのシングルトンRepositoryを使用する
- `TaskRepository`の直接生成は、独立したDBを使うテストなどに限定する
- Google APIの生レスポンス、OAuthトークン、メール本文、回答内容は保存しない

```ts
import { taskRepository } from './database/task.repository'
import { answerConfirmationRepository } from './database/answerConfirmation.repository'
```

これらはブラウザAPIに依存するため、バックエンドのNode.jsプロセスからは使用しません。

この文書のimport例は`src`直下のモジュールから呼ぶ場合の相対パスです。実際の呼び出し元に合わせて相対パスを調整してください。このプロジェクトには`@`などのパスエイリアスは設定されていません。

## 日付と状態の規約

### 日付

- `DateOnly`: `YYYY-MM-DD`形式のカレンダー日付
- `IsoDateTime`: ISO 8601の絶対日時。新規作成時は`new Date().toISOString()`形式を使用する

`DateOnly`と`IsoDateTime`はTypeScript上では単なる`string`です。PR #31で追加された期間検索は`startDate`と`endDate`を実行時検証しますが、保存APIの全フィールドを実行時検証するわけではありません。HTTPレスポンスから`TaskRecordInput`へ変換する境界で検証してください。

### 課題状態

```ts
type TaskStatus = 'unsubmitted' | 'submitted' | 'untracked'
```

- `unsubmitted`: 未提出として扱う
- `submitted`: 提出済みとして扱う
- `untracked`: 提出状態を追跡しない

`getUnsubmittedTasks*`が返すのは、厳密に`status === 'unsubmitted'`の課題だけです。

## TaskRepository

### データ入力型

課題同期では`TaskRecordInput`を使用します。`id`、`externalKey`、`source`はRepositoryが管理するため入力しません。

```ts
import type { TaskRecordInput } from './database/database.types'

const task: TaskRecordInput = {
  courseId: 'course-1',
  courseName: '数学I',
  courseWorkId: 'work-1',
  courseWorkType: 'ASSIGNMENT',
  subjectName: '数学',
  title: '一次方程式',
  formUrls: ['https://docs.google.com/forms/d/example-form-id/viewform'],
  dueDate: '2026-08-31',
  status: 'unsubmitted',
}
```

`courseWorkType`は次のいずれかです。

- `ASSIGNMENT`
- `SHORT_ANSWER_QUESTION`
- `MULTIPLE_CHOICE_QUESTION`

### `replaceCourseSnapshot(snapshot)`

1コース分の取得結果で、そのコースのローカル課題を原子的に置き換えます。

```ts
await taskRepository.replaceCourseSnapshot({
  courseId: 'course-1',
  fetchedDate: '2026-08-20',
  tasks: [task],
})
```

動作契約:

- 同じ`courseId`と`courseWorkId`の課題は、更新後も内部`id`を維持する
- 新規課題の内部`id`はRepositoryがUUIDで生成する
- 入力に存在しなくなった対象コースの課題は削除する
- 他コースの課題には影響しない
- 課題更新と`SyncState`更新は同じトランザクションで行う
- `snapshot.courseId`と各課題の`courseId`が異なる場合は全体をロールバックする
- 同じ外部課題が入力内で重複した場合は全体をロールバックする
- `status !== 'submitted'`の場合、入力に`submittedAt`があっても保存しない
- 型外の余分なフィールドは保存しない

このAPIは差分更新ではありません。`tasks`に不完全な一覧を渡すと、渡さなかった対象コースの課題が削除されます。Google Classroomの対象コースについて全ページ取得が完了した後だけ呼び出してください。

### `removeInactiveCourses(activeCourseIds)`

ACTIVEではないコースの課題と同期状態を削除します。

```ts
await taskRepository.removeInactiveCourses(['course-1', 'course-2'])
```

引数は、Google Classroomから完全に取得できたACTIVEコースIDの全件です。不完全な配列や空配列を渡すと、必要なローカルデータまで削除します。上流APIの取得失敗時には呼び出さないでください。

### `getAllTasks()`

保存済み課題をすべて返します。

```ts
const tasks = await taskRepository.getAllTasks()
```

返却順は保証されません。UIで順序が必要な場合は、用途別のRepositoryメソッドを使うか、呼び出し側で明示的に並べ替えてください。

### `getUnsubmittedTasks()`

未提出課題をすべて返します。期限なし課題も含みます。

```ts
const tasks = await taskRepository.getUnsubmittedTasks()
```

並び順は次の契約です。

1. `dueDate`昇順
2. 同一期限では`title`の日本語ロケール順
3. 同一タイトルでは`courseName`の日本語ロケール順
4. さらに同じ場合は`courseWorkId`、`externalKey`順
5. 期限なし課題は期限あり課題の後

### `getUnsubmittedTasksInDateRange(startDate, endDate)`

開始日と終了日を含む期間から、期限あり・未提出の課題だけを返します。

```ts
const tasks = await taskRepository.getUnsubmittedTasksInDateRange(
  '2026-08-01',
  '2026-08-31',
)
```

動作契約:

- 範囲は両端を含む
- `status === 'unsubmitted'`だけを返す
- `dueDate`がない課題は返さない
- 月境界、年境界、うるう日をまたぐ範囲を扱える
- 並び順は`getUnsubmittedTasks()`と同じ

入力エラー:

| 条件                   | Error message                                     |
| ---------------------- | ------------------------------------------------- |
| `YYYY-MM-DD`形式でない | `startDate/endDate must be in YYYY-MM-DD format.` |
| 実在しない日付         | `startDate/endDate must be a valid date.`         |
| 開始日が終了日より後   | `startDate must not be after endDate.`            |

これらのメッセージをUI表示文言として直接使わないでください。現行実装は専用Error型を持たないため、呼び出し側では入力生成時点で有効な日付を保証するのが基本です。

### `getTasksGroupedByDueDate(startDate, endDate)`

PR #31で追加されたカレンダー向けAPIです。期間内の期限あり・未提出課題を、期限日をキーにして返します。

```ts
const grouped = await taskRepository.getTasksGroupedByDueDate(
  '2026-08-01',
  '2026-08-31',
)

const tasksForAugust20 = grouped['2026-08-20'] ?? []
```

返却例:

```ts
{
  '2026-08-20': [taskA, taskB],
  '2026-08-25': [taskC],
}
```

動作契約:

- 検索条件、日付検証、配列内の並び順は`getUnsubmittedTasksInDateRange()`と同じ
- 課題が0件の日付のキーは作らない
- 期間内に対象課題がなければ`{}`を返す
- UIは`grouped[date] ?? []`として空日を処理する

### `getSyncStates()`

コースごとの最終取得日を`courseId`順で返します。

```ts
const syncStates = await taskRepository.getSyncStates()
// [{ courseId: 'course-1', fetchedDate: '2026-08-20' }]
```

`fetchedDate`は取得時刻ではなく日付です。失敗状態、リトライ回数、取得途中状態は保持しません。

### `clearLocalData()`

`tasks`と`syncStates`を同じトランザクションですべて削除します。

```ts
await taskRepository.clearLocalData()
```

このメソッドは`answerConfirmations`を削除しません。ログアウト時に利用者データを完全削除する場合は、回答確認Repositoryの`clearAll()`も呼ぶ必要があります。

## AnswerConfirmationRepository

Form回答確認結果を`answerConfirmations`テーブルへ保存します。

### `save(input)`

新規レコードを追加し、自動採番された`id`を返します。

```ts
const id = await answerConfirmationRepository.save({
  formUrl: 'https://docs.google.com/forms/d/example-form-id/viewform',
  status: 'submitted',
  confirmedAt: new Date().toISOString(),
})
```

`confirmedAt`を省略すると、保存時の`new Date().toISOString()`が設定されます。同じ`formUrl`の重複保存は禁止されていません。

### `getById(id)`

IDが一致するレコードを返します。存在しない場合は`undefined`です。

```ts
const record = await answerConfirmationRepository.getById(id)
```

### `getByFormUrl(formUrl)`

Form URLが完全一致するレコードを配列で返します。存在しない場合は空配列です。返却順は保証されません。

```ts
const records = await answerConfirmationRepository.getByFormUrl(formUrl)
```

### `update(id, changes)`

指定IDのフィールドを部分更新します。

```ts
await answerConfirmationRepository.update(id, {
  status: 'submitted',
  confirmedAt: new Date().toISOString(),
})
```

戻り値はありません。指定IDが存在しない場合も例外や更新件数を返さないため、存在確認が必要な処理では先に`getById()`を使用してください。

### `delete(id)` / `clearAll()`

```ts
await answerConfirmationRepository.delete(id)
await answerConfirmationRepository.clearAll()
```

- `delete(id)`: 指定IDを削除する。存在しない場合も完了する
- `clearAll()`: 回答確認結果をすべて削除する。課題と同期状態には影響しない

### 現行の契約上の制約

HTTP APIの回答確認状態は`submitted | unreviewable | needsReview`ですが、現行の`AnswerConfirmationRecord.status`は課題用の`TaskStatus`を再利用しており、`unreviewable`と`needsReview`を保存できません。また、HTTP APIは`formId`を入力に使い、Repositoryは`formUrl`をキーにしています。

このままではHTTP APIの結果を損失なく保存できません。連携実装前に、回答確認専用の状態型とForm識別子を決め、スキーママイグレーションを追加する必要があります。型キャストで回避すると不正な状態がDBへ入るため禁止です。

## 開発用seed

PR #31の`src/database/dev-seed.ts`は、開発環境で課題データを手動投入するためのユーティリティです。

```js
const { seedLocalDatabase } = await import('/src/database/dev-seed.ts')
await seedLocalDatabase()
```

削除:

```js
const { clearSeededDatabase } = await import('/src/database/dev-seed.ts')
await clearSeededDatabase()
```

どちらも`import.meta.env.DEV`以外ではエラーになります。`seedLocalDatabase()`は実行前に既存の`tasks`と`syncStates`を全削除します。`clearSeededDatabase()`もseedだけを識別して削除するのではなく、同じ2テーブルを全削除します。保持したいローカルデータがある環境では実行しないでください。

`answerConfirmations`はseed投入・削除の対象外です。

## テストでの利用

Repositoryテストでは、本番用シングルトンを使わず、テストごとに異なるDB名を使用します。

```ts
import 'fake-indexeddb/auto'

import { TaskWithFormDatabase } from './database/db'
import { TaskRepository } from './database/task.repository'

const database = new TaskWithFormDatabase(
  `taskwithform-test-${crypto.randomUUID()}`,
)
const repository = new TaskRepository(database)

// テスト後
await database.delete()
```

テスト間でDBを共有しないでください。保存・更新・削除を変更した場合は、正常系だけでなくロールバック、境界日、空結果、不正入力も自動テストへ追加します。
