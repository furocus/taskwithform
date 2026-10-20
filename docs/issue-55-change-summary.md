# Issue #55 変更内容と残存問題

## 変更内容

### 回答確認状態のDBスキーマ

- `answerConfirmations` の現在値を、`taskExternalKey` と `formReferenceKey` の複合主キーで1件だけ保持する設計に変更しました。
- 既存の `answerConfirmations` store は主キー変更せず、DB version 5で削除します。
- version 5では `answerConfirmationsV5` を新規作成し、旧回答確認結果は移行せず破棄します。
- 旧回答確認結果は `taskExternalKey` を復元できないため、再同期後に回答確認を再実行して復旧する方針です。

### IndexedDB migration

- v2/v3の `++id` 主キーを持つ `answerConfirmations` から、複合主キーへの直接変更を避けました。
- v5のschemaで旧storeを明示的に削除し、新storeを作成します。
- v2/v3のtaskについて、`itemType`、`itemId`、`creationTime`、`forms` を補完し、旧フィールドを削除します。
- taskの内部 `id` は保持します。
- legacy形式のexternal keyを、`source + courseId + itemType + itemId` の4要素形式へ更新します。

### Task identity

- `createExternalKey()` が `itemType` を含むexternal keyを生成するよう変更しました。
- 旧2引数呼び出しとの互換性を保つため、2引数の場合は `courseWork` として扱います。
- 同一course内で同じ `itemId` を持つ `courseWork` と `courseWorkMaterial` を別taskとして保持できるテストを追加しました。

### Form reference key

- Form参照から次のcanonical keyを生成する関数を追加しました。
  - `standard:<standardFormId>`
  - `published:<publishedFormId>`
- standard IDとpublished IDが両方ある場合はstandard IDを優先します。
- `resolved` でIDがないForm、または `unresolved` のFormは回答確認用keyを生成できません。
- Repositoryの保存・取得・削除では、canonical形式以外の `formReferenceKey` を拒否します。

## 検証結果

- `npx vitest run src/database`
  - 3 test files passed
  - 31 tests passed
- v2/v3の旧DBからのupgradeテストを追加し、次を確認済みです。
  - DBを開ける
  - taskの内部 `id` が保持される
  - external keyが4要素形式へ更新される
  - 旧回答確認結果が破棄される
  - 旧 `answerConfirmations` storeが削除される
- `git diff --check` は成功しています。

## 残存問題

### 1. 全体の通常同期・UIが新契約へ未接続

変更許可を `src/database` 内に限定したため、次の利用側は旧フィールドを参照したままです。

- `classroom.sync.ts` は `courseWorkId`、`courseWorkType`、`formUrls` を `TaskRecordInput` に渡しています。
- `useTasks.ts` は `record.formUrls` を参照しています。
- 関連テストとmockも旧フィールドを参照しています。

そのため現在の `npm run typecheck` は、旧フィールド参照により12件のエラーになります。同期変換、UI projection、mock、関連テストを新しい `itemType`、`itemId`、`forms` 契約へ変更する必要があります。

### 2. buildは全体typecheckの修正後に再確認が必要

`npm run build` は最初に `vue-tsc --noEmit` を実行するため、上記の型エラーを解消するまで成功しません。今回の許可範囲ではDB外の利用側を修正していないため、buildの成功は未確認です。

### 3. Form参照の型レベルの不変条件は未達

`ResolvedTaskFormReference` の `standardFormId` と `publishedFormId` は現在optionalのままです。実行時の `createFormReferenceKey()` は不正状態を拒否しますが、TypeScript型だけでは次の状態を禁止できません。

- IDを両方持たない `resolved`
- standard IDまたはpublished IDが空文字

型レベルでも保証するには、resolvedを「standard IDあり」「published IDあり」「両方あり」のunionへ分割する必要があります。

### 4. migration失敗時のrollbackは専用テスト未追加

通常のtask同期トランザクションのrollbackテストは既存します。一方、v2/v3からv5へのDB upgrade途中でエラーが発生した場合に、IndexedDB transaction全体がrollbackされることを確認する専用テストはまだありません。

## 次に必要な作業

1. Classroom同期を新しい `TaskRecordInput` 契約へ接続する。
2. `useTasks`、ページ、mock、関連テストのForm projectionを `forms` へ移行する。
3. Form参照のresolved unionを型定義へ反映する。
4. migration途中の失敗とtransaction rollbackをテストする。
5. `npm test`、`npm run typecheck`、`npm run build` を全体で再実行する。
