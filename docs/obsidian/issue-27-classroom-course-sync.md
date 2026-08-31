# Issue 27 Classroom課題のコース単位同期

Classroom課題取得結果を検証・変換し、コース単位のスナップショットとしてIndexedDBへ同期する実装の設計ノート。

## バックエンドAPIの破壊的変更

|            | 変更前                                | 変更後                                           |
| ---------- | ------------------------------------- | ------------------------------------------------ |
| パス       | `GET /api/classroom/coursework/forms` | `GET /api/classroom/courses/coursework`          |
| レスポンス | `{ courseWork: [...] }`（フラット）   | `{ courses: [{ id, name, courseWork: [...] }] }` |

旧レスポンスはコースを回してcourseWorkをフラットに連結していたため、課題0件のACTIVEコースがレスポンスから消えていた。コース一覧を返す他のエンドポイントも`GET /api/classroom/courses/count`（件数のみ）しかなく、空コースの同期と非ACTIVEコースの削除をクライアントが判定できない。

パスも実態に合わせて改名した。`courses/count`は`classroom.courses.readonly`だけで足りるが、この口はcourseWorkスコープも要求するため、`courses/`配下のサブリソースとして区別する。コース一覧だけを返す`GET /api/classroom/courses`は将来のために空けておく。

### 移行手順

旧パスの互換ハンドラは置かない。改名時点で旧パスを呼び出すクライアント実装が存在せず（フロントエンドが呼ぶのは`courses/count`、`auth/*`、`gmail/forms/:formId/response`のみ）、バックエンドはセッションをメモリだけに保持する開発用サーバーで、再起動のたびに再ログインが必要なため、移行期間を要する稼働中のクライアントがない。

旧パスを参照していたドキュメント（`README.md`、Issue 18実装ノート、Issue 35検証ランブック）は同一PRで更新した。`docs/api/http-api.md`は`main`に存在せず`feature/18-26-backend-integration`側にあるため、そのブランチをmainへ出す作業で追随する。

将来この方針を変える場合は、旧パスへ`410 Gone`を返すハンドラを追加する。リダイレクトは選ばない。レスポンス形状も変わっており、旧クライアントは新形状を解釈できないため、成功系のステータスで返すと誤動作が静かに続く。

## 未知の課題種別は同期全体を中止する

`courseWorkType`が`ASSIGNMENT` / `SHORT_ANSWER_QUESTION` / `MULTIPLE_CHOICE_QUESTION`以外だった場合、その課題を読み飛ばさずレスポンス全体を拒否し、DBを更新しない。

- Classroom APIの`workType`はこの3種と`COURSE_WORK_TYPE_UNSPECIFIED`で、`TaskRecord.courseWorkType`のunionが実質全域である。未知の値を保存するにはDB側の型変更が必要で、Issue #27の対象外。
- 読み飛ばすと、その課題が課題一覧から**黙って消える**。すでに保存済みの課題であれば、スナップショットに含まれないため削除される。課題管理アプリでは、同期が失敗して既存データが残る方が、1件が静かに欠ける状態より安全である。
- Googleが新しい種別を追加した場合は同期が止まるため、`ClassroomResponseRejection`の`unknown_course_work_type`を手がかりに型を追加する。環境変数による寛容モードは設けない。切り替え自体が検証対象になり、どちらのモードで取得した結果がDBに入っているか追跡できなくなる。

### 拒否理由の診断

`BackendApiError`の`code`は`invalid_backend_response`で固定し、`reason`に`ClassroomResponseRejection`（`unknown_course_work_type`、`invalid_due_date`、`duplicate_course`など）を載せる。呼び出し側が分岐するのは`code`だけで、`reason`は診断用である。

`reason`はクライアント側の固定語彙のみで、バックエンドの`message`、レスポンス本文、ユーザーデータを含まない。そのままログへ出してよい。

## トランザクション設計

`TaskRepository.replaceActiveCourseSnapshots()`が、全ACTIVEコースの置換と非ACTIVEコースの削除を単一トランザクションで実行する。

内部では`replaceCourseSnapshot()`と`removeInactiveCourses()`を呼ぶ。Dexieは進行中のトランザクション内で開かれた`transaction()`をsub transactionとして扱い、外側と一緒にコミット・ロールバックする。成立条件は**内側のテーブルが外側の部分集合でモードが互換**であることなので、3つのメソッドは`TaskRepository.syncTables`という単一の定義からテーブルを取る。ここへ追加せずに片方のメソッドだけへテーブルを増やすと、ネストした呼び出し側だけが実行時に失敗する。

回答確認結果の削除連携（`answerConfirmations`との連動）を実装するときは、`syncTables`へ`answerConfirmations`を追加する必要がある。

検証は`src/database/task.repository.test.ts`と`src/features/tasks/classroom.sync.test.ts`で行う。fake-indexeddbは実際のIndexedDB実装なので、トランザクションの失敗と巻き戻りをそのまま観測できる。外側のトランザクションを外すとロールバックのテストが落ちることも確認済みで、この保証がテストで守られている。

## 同期の責務分担

- **API境界の検証**（`classroom.api.ts`）: 全コース・全課題を検証してから最初の書き込みを行う。1件でも不正ならレスポンス全体を拒否する。部分的なコース一覧を「ユーザーの全コース」と誤認して非ACTIVEコース削除を走らせないため。
- **ローカル状態の維持**（`classroom.sync.ts`）: `replaceCourseSnapshot()`は入力の`status`をそのまま書くため、同期層が`externalKey`経由で既存の`status`・`submittedAt`を引き継ぐ。新規課題は`unsubmitted`で保存する。
- **`subjectName`**: Classroomに科目名の独立フィールドがなく、`src/shared/constants/subjects.ts`も空のため、コース名を流用している。導出規則を決める場合は別Issueで扱う。

## 対象外

Vueコンポーネントとの画面接続、Gmail回答判定と回答確認結果DB、DBスキーマ変更、`./dev mock`への新エンドポイント追加。
