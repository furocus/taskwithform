# Issue 55 Form配布項目に合わせたDBスキーマの確定形

PR #52 が hotfix として入れた `version(3)` の暫定スキーマ（新旧フィールドの併存、`formUrls` と `forms[].sourceUrl` の二重表現、`TaskStatus` を流用した回答確認状態、`++id` の `answerConfirmations`）を確定形へ設計し直した記録。状態値の語彙は Issue #56 で確定した契約に合わせている。

## TaskRecord の確定形

| フィールド                             | 扱い             | 理由                                                                                |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `itemType` / `itemId` / `creationTime` | 必須             | 配布項目の同一性そのもの。optional のままでは消費側が毎回 fallback を書くことになる |
| `forms`                                | 必須（空配列可） | Form の唯一の表現                                                                   |
| `courseWorkType`                       | 任意（課題のみ） | 他のどのフィールドの複製でもない。資料・投稿には存在しない値なので optional         |
| `courseWorkId`                         | **削除**         | `itemId` と同じ値の別名。2箇所に同じIDがある状態を残す理由がない                    |
| `formUrls`                             | **削除**         | `forms[].formUrl` の複製。片方だけ更新される事故が起きる形だった                    |

`courseWorkType` だけを残したのは、「重複を消す」ことと「情報を捨てる」ことを区別したため。`courseWorkId` と `formUrls` は他のフィールドから再構成できるが、`courseWorkType`（`ASSIGNMENT` / `SHORT_ANSWER_QUESTION` / `MULTIPLE_CHOICE_QUESTION`）は Classroom 固有の情報でどこにも重複がない。

URL配列を必要とする呼び出し側（`checkTaskAnswerConfirmation`）には、`useTasks` の `toTask()` が `forms` から `resolution === 'resolved'` のものだけを射影して渡す。保存する表現は1つ、画面に渡す表現は用途ごとに作る、という分担である。

## 配布項目の identity

`createExternalKey(courseId, itemType, itemId)` が `["google-classroom", courseId, itemType, itemId]` を返す。`itemType` を含めるのは、同一コース内で課題・資料・投稿が同じ文字列IDを持ち得るためで、含めないと片方が上書きされるか、スナップショット内の重複としてコース全体の同期がロールバックされる。

## Form参照とキー設計

`TaskFormReference` は `resolved` と `unresolved` の判別可能union。`resolved` は `formId` と `formIdType`（`standard` | `published`）を必ず持つ。「解決済みなのにIDが1つもない」状態を型として作れないようにしている。

保存キーは `createFormReferenceKey()`（`src/database/formReference.ts`）が唯一の生成箇所で、形式は `standard:<id>` / `published:<id>`。

- `/forms/d/{id}/viewform`（standard）と `/forms/d/e/{id}/viewform`（published）は別のID空間であり、同一性は推測しない。ID空間をキーに含めないと、たまたま同じ文字列のIDが衝突する。
- `unresolved` な参照に対しては例外を投げる。短縮URLを解決できなかった参照には Form の同一性がなく、確認結果を結び付ける対象が存在しない。次回同期で解決されるか、参照ごと消える。

## 回答確認結果テーブル

```
answerConfirmations: '&[taskExternalKey+formReferenceKey], taskExternalKey, formReferenceKey, status, confirmedAt'
```

- 主キーは「配布項目 × Form参照」。`AnswerConfirmationRepository.upsert()` は `put` なので、同じFormを再確認しても行が増えず、現在の状態が常に1件で取得できる。
- `status` は `AnswerConfirmationStatus`（`submitted` / `needsReview` / `unreviewable`）で、`TaskStatus`（`unsubmitted` / `submitted` / `untracked`）とは別の型。Classroomの提出状態とGmailの回答控え確認は別の事実であり、片方の語彙をもう片方へ流用しない。
- index は実在するクエリに対応する。`taskExternalKey`（1配布項目のFormごとのカード）、`formReferenceKey`（同じFormが複数コースで配布された場合の逆引き）、`status`（状態での絞り込み）、`confirmedAt`（新着順）。

## マイグレーション

Dexie は既存 object store の主キーを変更できない（`UpgradeError: Not yet support for changing primary key`）。そのため store の作り直しを2つのバージョンに分けている。

| version | 内容                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 3       | `tasks` に `itemType` / `itemId` / `creationTime` / `forms` を追加。v2 の `formUrls` を解析して `forms` を作り、`externalKey` を4要素へ振り直す |
| 4       | `answerConfirmations: null` で `++id` の store を削除する                                                                                       |
| 5       | `answerConfirmations` を複合主キーで作り直し、`tasks` から `courseWorkId` と `formUrls` を削除する                                              |

v2 の回答確認結果は新スキーマへ持ち込まず破棄する。旧行のキーは `formUrl` だけで「どの配布項目のFormか」を含まないため、`[taskExternalKey+formReferenceKey]` を復元できない。復元不能な値を推測で埋めるより、Form確認をやり直して取り直すほうが安全である。課題データ側は破棄しない（`id`・`externalKey`・`status`・`submittedAt` を保持したまま移行する）。

移行は `src/database/db.migration.test.ts` で、実際に v2 のデータベースを作成・close してから現行クラスで再 open する形で検証している（v2 課題の同一性保持、旧確認結果の破棄と新 store の upsert、`itemType` 違いの同一IDが衝突しないこと）。

## 対象外・残作業

- 課題が削除されたときに、その配布項目の確認結果を連鎖削除する処理。現状は孤児行が残る。`TaskRepository.syncTables` に `answerConfirmations` を足すのが変更点になる。
- 回答確認結果を実際に保存・表示する画面側の実装（UIのカード分割を含む）。今回は保存層だけを確定させた。
- `receiptReceivedAt`（回答控えの受信日時）の永続化。backend は返すが、保存対象に含めるかは未決。
