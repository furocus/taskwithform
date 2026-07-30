# ローカルDB担当 引き継ぎ資料

更新日: 2026-07-30
対象: Issue #11「ローカルDBの整理」以降のIndexedDB関連実装

## 1. 現在の状態

ローカルDB基盤はPR #12で`main`へマージ済みです。Dexieを使ったスキーマ、課題型、コース単位の同期、一覧取得、カレンダー向け期間検索、全データ削除まで実装されています。

まだ実装されていないのは、Classroom APIレスポンスからDB入力への変換、実際の同期処理、Vue画面との接続、ログアウト時のDB削除、Form回答確認結果の保存です。

## 2. 担当範囲

DB担当は次の範囲を管理します。

- `src/database/**`
- Classroom APIの結果をDB入力へ変換するフロントエンド側の同期処理
- カレンダーや課題一覧へ渡すデータ取得処理
- IndexedDBのマイグレーションとテスト

Vueコンポーネント、バックエンドのGoogle API通信、OAuth処理は別担当です。UIからDexieを直接操作せず、Repositoryやデータ取得処理を経由させます。

## 3. 関連ファイル

| ファイル                                  | 役割                                       |
| ----------------------------------------- | ------------------------------------------ |
| `src/database/database.types.ts`          | DBへ保存する課題、同期状態、入力データの型 |
| `src/database/db.ts`                      | DexieのデータベースとVersion 1スキーマ     |
| `src/database/task.repository.ts`         | 保存・削除・検索・全削除を行うRepository   |
| `src/database/task.repository.test.ts`    | `fake-indexeddb`を使ったRepositoryテスト   |
| `src/features/calendar/calendar.utils.ts` | カレンダー用の日付処理を置く予定のファイル |
| `src/features/calendar/useCalendar.ts`    | カレンダー用データ取得を置く予定のファイル |

## 4. 使用している依存関係

| パッケージ              | 用途                            |
| ----------------------- | ------------------------------- |
| `dexie@^4.4.4`          | ブラウザのIndexedDB操作         |
| `fake-indexeddb@^6.2.5` | Node上でIndexedDBのテストを実行 |
| `vitest@^4.1.10`        | Repositoryの自動テスト          |

DB処理はブラウザ側だけで動きます。Docker、バックエンドDB、外部DBは使用していません。

## 5. データモデル

### TaskRecord

課題1件を表します。

| 項目             | 内容と選択理由                                          |
| ---------------- | ------------------------------------------------------- |
| `id`             | アプリ内部のUUID。外部サービスのIDとUI内部IDを分離する  |
| `externalKey`    | source、courseId、courseWorkIdから生成する一意キー      |
| `source`         | 現在は`google-classroom`固定。データ取得元を明示する    |
| `courseId`       | ClassroomのコースID                                     |
| `courseName`     | 画面表示用のコース名                                    |
| `courseWorkId`   | Classroomの課題ID                                       |
| `courseWorkType` | 課題、記述式質問、選択式質問を区別する                  |
| `subjectName`    | 科目名による表示や検索に使用する                        |
| `title`          | 課題名                                                  |
| `description`    | 説明がない課題もあるため省略可能                        |
| `alternateLink`  | Classroomを開くリンク。存在しない場合を考慮して省略可能 |
| `formUrls`       | 課題に含まれるFormリンク。複数Formを考慮して配列        |
| `dueDate`        | `YYYY-MM-DD`形式の期限。期限なし課題を考慮して省略可能  |
| `status`         | `unsubmitted`または`submitted`                          |
| `submittedAt`    | 提出済みの場合の日時。ISO 8601文字列                    |

### DateOnly

`YYYY-MM-DD`形式の文字列として扱います。文字列比較とIndexedDBの並び順が日付順と一致するため、この形式を選んでいます。

ただし、現在は単なる`string`の型エイリアスで、実行時の形式検証はありません。APIから変換する境界で形式を検証する必要があります。

### IsoDateTime

絶対時刻をISO 8601文字列で保存します。JSONとの相性がよく、タイムゾーンを含めて受け渡せるためです。

### TaskRecordInput

同期処理からRepositoryへ渡す入力型です。次の管理項目は呼び出し側から受け取りません。

- `id`
- `externalKey`
- `source`

これらはRepositoryが生成・固定します。外部入力から内部IDやデータ取得元を書き換えられないようにするためです。

### CourseTaskSnapshot

1コース分の取得結果をまとめて置き換える入力です。

- `courseId`
- `fetchedDate`
- `tasks`

差分更新ではなくコース単位のスナップショットとして扱うことで、Classroom側で削除された課題もローカルから削除できます。

### SyncState

コースごとの最終取得日を保存します。現在は日単位の`fetchedDate`だけで、取得時刻、失敗状態、リトライ回数は保持していません。

## 6. IndexedDBスキーマ

データベース名は`taskwithform`、現在のバージョンは1です。

### tasksテーブル

| インデックス       | 用途                                     |
| ------------------ | ---------------------------------------- |
| `id`               | 主キー                                   |
| `externalKey`      | 同じ外部課題の重複を防ぐ一意インデックス |
| `courseId`         | コース単位の置き換えと削除               |
| `subjectName`      | 将来の科目フィルター                     |
| `dueDate`          | 期限範囲検索                             |
| `status`           | 未提出課題の検索                         |
| `[status+dueDate]` | 状態と期限を組み合わせた検索用           |

### syncStatesテーブル

`courseId`を主キーとして、コースごとの最終取得日を1件だけ保存します。

スキーマを変更する場合はVersion 1を書き換えず、DexieのVersion 2とマイグレーションを追加してください。既存ユーザーのIndexedDBを破壊しないことが重要です。

## 7. Repositoryの動作

### replaceCourseSnapshot

1コース分の課題をトランザクション内で置き換えます。

- 同じ外部課題がすでにあれば内部UUIDを維持する
- 新しい課題には`crypto.randomUUID()`でIDを付ける
- スナップショットに存在しなくなった課題を対象コースから削除する
- 課題保存と同期日更新を同じトランザクションで行う
- snapshotのcourseIdと課題のcourseIdが違う場合は全処理をロールバックする
- 同じ外部課題がスナップショット内に重複している場合はロールバックする

`externalKey`はsource、courseId、courseWorkIdをJSON配列として文字列化しています。単純な文字連結による区切り文字の衝突を避けるためです。

### removeInactiveCourses

現在ACTIVEではないコースの課題と同期状態を同じトランザクションで削除します。

呼び出し側はClassroomから取得したACTIVEコースIDをすべて渡す必要があります。不完全な一覧を渡すと、必要なコースまで削除されます。

### getAllTasks

保存済み課題をすべて返します。並び順は保証していません。

### getUnsubmittedTasks

未提出課題を期限順で返します。

- 期限が早い課題を先にする
- 同じ期限の場合は日本語タイトル順
- 期限なし課題は最後

### getUnsubmittedTasksInDateRange

開始日と終了日を含む範囲から、期限あり・未提出の課題だけを返します。開始日が終了日より後の場合はエラーにします。

カレンダー向けの基本検索はすでに実装済みです。次の担当では、この結果を日付ごとにまとめる処理を追加します。

### getSyncStates

同期状態をcourseId順で返します。

### clearLocalData

tasksとsyncStatesを同じトランザクションですべて削除します。処理自体は実装済みですが、ログアウト処理とはまだ接続されていません。

## 8. 保存時の設計思想

### 外部入力をそのまま保存しない

Repositoryは保存可能な項目を明示的に組み立てます。テストでは、入力に`userId`や`email`を混ぜてもDBへ保存されないことを確認しています。

個人情報やGoogle APIのレスポンス全体を、そのままIndexedDBへ保存しないでください。

### 課題保存と同期状態を分離しない

課題だけ更新されて同期日が古い、または同期日だけ新しくて課題が古い状態を避けるため、同じトランザクションで更新します。

### 外部IDと内部IDを分離する

外部課題の同一性は`externalKey`で判断し、Vueなどアプリ内部ではUUIDの`id`を使用します。課題内容が更新されても内部IDは維持されます。

### 期限なしを正常な状態として扱う

Google Classroomには期限なし課題が存在するため、`dueDate`は省略可能です。課題一覧では最後、カレンダー期間検索では対象外になります。

### submittedAtの不整合を保存しない

statusが`unsubmitted`の場合は、入力にsubmittedAtが含まれていても保存しません。

## 9. 現在のテスト範囲

以下を自動テストしています。

- 外部課題更新時の内部UUID維持
- 異なるコースで同じcourseWorkIdを使用できること
- 空スナップショットによる対象コースだけの削除
- courseId不一致時のロールバック
- 非ACTIVEコースの課題と同期状態の削除
- 未提出へ戻った課題からsubmittedAtを削除
- 未提出課題の期限順並び替え
- カレンダー期間内の未提出課題取得
- 不正な日付範囲の拒否
- 重複スナップショットのロールバック
- 想定外の個人情報を保存しないこと
- 全課題と同期状態の一括削除

テストごとに異なるデータベース名を使い、終了時に削除しています。

## 10. 既知の制約と未決事項

### ユーザー単位に分離されていない

現在のDB名は全ユーザー共通です。別のGoogleアカウントでログインした場合、以前の利用者のデータが残る可能性があります。

当面はログアウトとセッション期限切れ時に`clearLocalData()`を呼ぶ必要があります。将来データを保持する場合は、GoogleユーザーIDによるDB分離を設計してください。

### 同期でローカル状態が上書きされる

`replaceCourseSnapshot()`は入力内容で課題を置き換えます。将来、ローカルだけで管理する完了状態を追加する場合、その項目を同期入力から分離しないと再同期で失われます。

Form回答、Classroom提出状態、利用者の手動完了を同じstatusにまとめるかは未決定です。情報源を決めてから型を拡張してください。

### Form回答確認は未調査

`formUrls`は保存できますが、Form回答結果の取得・保存は未実装です。学生が取得できる情報、OAuthスコープ、Classroom提出情報で代用できるかをチーム内調査後に決めます。

回答内容そのものは保存せず、必要になった場合も確認結果、確認日時、情報源だけに限定する方針です。

### リアクティブ更新は未実装

Dexieの`liveQuery`などは使用していません。Repositoryの結果をVueへ渡す方法は、DB担当とUI担当の境界を決めてから追加します。

### 実行時の日付検証がない

DateOnlyとIsoDateTimeはTypeScript上ではstringです。不正形式を防ぐには、APIレスポンスからTaskRecordInputへ変換する場所で検証が必要です。

## 11. 次に着手するIssue

次週は、バックエンドやUIを待たずに進められるカレンダー用データ取得を推奨します。

### カレンダー表示用の課題取得処理

- 指定した月・週の開始日と終了日を計算する
- `getUnsubmittedTasksInDateRange()`を利用する
- 取得した課題をdueDateごとにまとめる
- 日付順でUIへ渡せる形にする
- 月境界、年境界、うるう年、期限なし、不正な期間をテストする

このIssueではVueコンポーネント、API、DBスキーマを変更しません。

## 12. 後続候補

優先度順の候補です。

1. Classroom課題レスポンスからTaskRecordInputへの変換と同期
2. ログアウト・セッション期限切れ時のローカルデータ削除
3. 課題一覧用のデータ取得とUI表示型への変換
4. 課題の完了・未完了を更新するRepository
5. Form回答またはClassroom提出状態の保存
6. DBスキーマ変更時のVersion 2マイグレーション

## 13. 実装時の確認

変更後は次を実行します。

```bash
npm test
npm run typecheck
npm run format:check
npm run build
```

DBテストでは実ブラウザのIndexedDBを使用せず、`fake-indexeddb`を使用します。テスト間で状態を共有しないよう、データベース名を毎回変えて終了時に削除してください。

## 14. 関連コミット

| コミット  | 内容                          |
| --------- | ----------------------------- |
| `a5fb3ab` | Classroom課題のローカルDB基盤 |
| `8655830` | TaskRepositoryのテスト        |
| `411e4c7` | DB保存入力から管理項目を除外  |
| `3dd4b56` | DB境界の異常系テスト          |
| `da19a4e` | mainとのpackage競合解消       |

## 15. 引き継ぎ時に確認すること

- `src/database`のテストがすべて成功する
- 次に担当するIssueの入力と出力をUI・バックエンド担当と合意する
- DBスキーマ変更が必要か、Repository追加だけで済むかを先に判断する
- 個人情報やGoogle APIレスポンス全体を保存しない
- `MainPage.vue`やバックエンドをDB Issueへ含めない
