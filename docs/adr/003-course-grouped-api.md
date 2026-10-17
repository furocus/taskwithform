# ADR-003：Classroom課題を空コースも含めたコース単位で返す

- 状態：草案／未レビュー
- 記録日：2026-10-17
- 記録区分：現状から復元

## 背景・課題

課題同期では、課題0件のコースと非ACTIVEになったコースを区別する必要がある。旧フラットレスポンスでは空コースが消えるという問題を、Issue 27実装ノートが記録している。

## 決定／確認できた現状

`GET /api/classroom/courses/coursework`は`{ courses: [{ id, name, courseWork: [...] }] }`を返し、空コースは`courseWork: []`で表す。受信側の`ClassroomCourse`と実行時検証もこの構造に対応する。

Issue 27ノートは、旧パス`/api/classroom/coursework/forms`からの変更と、当時互換ハンドラを置かなかった方針を記録している。

## 理由

[Issue 27実装ノート](../obsidian/issue-27-classroom-course-sync.md)の「バックエンドAPIの破壊的変更」は、空コースの同期と非ACTIVEコース削除の判定にコース単位の構造が必要だと説明する。互換ハンドラを置かなかった理由は、当時旧パスを使うクライアントがなかったこととして記録されている。

## 影響・制約

- 空コースを、同期対象から消えたコースと区別できる。
- バックエンドと受信側の型・検証・同期入力の契約を合わせる必要がある。
- 空・欠落・不正なコース一覧を同一視しない。レスポンス全体が不正な場合は[ADR-004](004-atomic-course-synchronization.md)を参照する。

## 確認根拠

- [app.mjs](../../backend/app.mjs)：コース単位のレスポンスを返すルート。
- [classroom.api.ts](../../src/features/tasks/classroom.api.ts)：`ClassroomCourse`、`parseClassroomCourseList`、`getClassroomCourses`。
- [app.test.mjs](../../backend/app.test.mjs)、[classroom.api.test.ts](../../src/features/tasks/classroom.api.test.ts)、[classroom.sync.test.ts](../../src/features/tasks/classroom.sync.test.ts)：レスポンスと空コースに関するテスト定義。

## 検証項目・実施状況

コード・既存資料・テスト定義を確認。テスト実行と実Classroomでの全コース取得確認は今回未実施。

## 未確認事項

- 今後の契約変更時、移行期間を要するクライアントが存在するか。当時の互換性判断を、そのまま将来へ適用しない。
