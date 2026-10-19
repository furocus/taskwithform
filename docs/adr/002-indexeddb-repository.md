# ADR-002：ブラウザのIndexedDBをDexieのRepository経由で扱う

- 状態：草案／未レビュー
- 記録日：2026-10-17
- 記録区分：現状から復元

## 背景・課題

取得した課題、同期状態、回答確認結果をローカルで扱う。[DB引き継ぎ資料](../database-handoff.md)はブラウザ側のIndexedDBをDB担当の対象とし、UIから直接Dexieを操作せずRepositoryなどを経由する責務を記録している。

## 決定／確認できた現状

`TaskWithFormDatabase`がDexieのスキーマを定義し、課題は`TaskRepository`、回答確認結果は`AnswerConfirmationRepository`を通して保存・検索する。現在はVersion 2まであり、`tasks`、`syncStates`、`answerConfirmations`を持つ。

UI向けの`useTasks`はRepositoryと同期関数を受け取り、取得結果を表示用の型へ変換している。バックエンドのセッション保存とは別の保存領域である。

## 理由

Repositoryを境界とする役割分担はDB引き継ぎ資料に記載されている。IndexedDB・Dexieを他の保存方式より選んだ当時の比較と選定理由は、今回確認した資料だけでは未確認。

## 影響・制約

- DB構造・移行とUI表示の変更を区別する。DB型やRepository契約を変える場合は利用側との調整が必要。
- ブラウザ側のデータであり、バックエンドの永続DBや複数端末同期として扱わない。
- `answerConfirmations`は課題同期用の`syncTables`に含まれず、課題削除との連携まで完了しているとは扱わない。

## 確認根拠

- [db.ts](../../src/database/db.ts)：`TaskWithFormDatabase`のVersion 1・2。
- [task.repository.ts](../../src/database/task.repository.ts)、[answerConfirmation.repository.ts](../../src/database/answerConfirmation.repository.ts)：保存・検索の境界。
- [database.types.ts](../../src/database/database.types.ts)：保存する型。
- [useTasks.ts](../../src/features/tasks/useTasks.ts)：Repositoryの注入と`toTask`による表示用変換。
- [task.repository.test.ts](../../src/database/task.repository.test.ts)：保存・検索・トランザクションのテスト定義。

## 検証項目・実施状況

コードとテスト定義を確認。テスト実行、実ブラウザでの保存・マイグレーション確認は今回未実施。

## 未確認事項

- IndexedDB・Dexieの当時の選定理由と比較候補は何か。
- 引き継ぎ資料はVersion 1や未実装項目を記載するが、現行コードにはVersion 2、回答確認結果Repository、`useTasks`の同期接続がある。担当者が資料の適用範囲を確認する必要がある。

## 関連・置換するADR

- [ADR-004](004-atomic-course-synchronization.md)：同期のトランザクション範囲。置換関係ではない。
