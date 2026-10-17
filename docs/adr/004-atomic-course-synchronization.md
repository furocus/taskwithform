# ADR-004：全ACTIVEコースの置換と非ACTIVEコースの削除を一括で行う

- 状態：草案／未レビュー
- 記録日：2026-10-17
- 記録区分：現状から復元

## 背景・課題

コース一覧をスナップショットとして同期する際、途中までの取得・書き込みを成功扱いすると欠落や誤削除につながる。Issue 27ノートは、課題を黙って消すより同期を失敗させて既存データを残す方針を記録している。

## 決定／確認できた現状

受信した全コース・全課題を検証してから、`syncClassroomCourses`がスナップショットへ変換し、`replaceActiveCourseSnapshots`を呼ぶ。

`TaskRepository`は全コースの置換と非ACTIVEコースの削除を、`tasks`・`syncStates`を対象とする同じトランザクションで行う。未知の課題種別などの不正値は読み飛ばさずレスポンスを拒否する。

## 理由

[Issue 27実装ノート](../obsidian/issue-27-classroom-course-sync.md)の「未知の課題種別は同期全体を中止する」「トランザクション設計」「同期の責務分担」に記載がある。部分的なコース一覧を全件と誤認して削除すること、不正な課題を読み飛ばして既存課題を失うことを防ぐため。

## 影響・制約

- 不正データや保存失敗を成功扱いせず、以前の保存状態を残す設計になっている。
- 新しい課題種別は、受信検証とDB型の対応が済むまで同期を止める要因になる。
- テーブル追加時は`syncTables`を更新し、内外のトランザクション範囲を合わせる必要がある。
- ローカル状態の読み取りは書き込みトランザクションより前。`useTasks`のRepository単位のキューと、それ以外の書き込み経路を混同しない。

## 確認根拠

- [classroom.api.ts](../../src/features/tasks/classroom.api.ts)：全レスポンスの検証と未知種別の拒否。
- [classroom.sync.ts](../../src/features/tasks/classroom.sync.ts)：受信・変換後の一括置換、既存ローカル状態の引き継ぎ。
- [task.repository.ts](../../src/database/task.repository.ts)：`syncTables`、`replaceActiveCourseSnapshots`、`removeInactiveCourses`。
- [useTasks.ts](../../src/features/tasks/useTasks.ts)：Repository単位のキュー。
- [classroom.sync.test.ts](../../src/features/tasks/classroom.sync.test.ts)、[task.repository.test.ts](../../src/database/task.repository.test.ts)：不正レスポンス時の維持・途中失敗時の巻き戻りのテスト定義。

## 検証項目・実施状況

コード・既存資料・テスト定義を確認。テスト実行と実ブラウザでのトランザクション失敗確認は今回未実施。

## 未確認事項

- `answerConfirmations`は現在の`syncTables`に含まれていない。課題削除との連動をどこで保証するか。
- Repository単位のキューを通らない更新処理を追加する場合、ローカル状態の読み取りから書き込みまでの競合をどう扱うか。

## 関連・置換するADR

- [ADR-002](002-indexeddb-repository.md)：DBとRepositoryの境界。
- [ADR-003](003-course-grouped-api.md)：完全なコース一覧を渡すAPI契約。
