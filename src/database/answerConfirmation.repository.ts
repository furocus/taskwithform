import { isFormReferenceKey } from './database.types'
import type {
  AnswerConfirmationInput,
  AnswerConfirmationRecord,
  AnswerConfirmationStatus,
  FormReferenceKey,
} from './database.types'
import { database as defaultDatabase, type TaskWithFormDatabase } from './db'

/** Form回答確認結果（AnswerConfirmation）のデータ操作を行うリポジトリクラス */
export class AnswerConfirmationRepository {
  constructor(
    private readonly database: TaskWithFormDatabase = defaultDatabase,
  ) {}

  private assertFormReferenceKey(
    value: string,
  ): asserts value is FormReferenceKey {
    if (!isFormReferenceKey(value)) {
      throw new Error(
        'formReferenceKey must be a canonical standard:<id> or published:<id> key.',
      )
    }
  }

  /**
   * 回答確認結果を保存・更新します。
   *
   * 「配布項目 × Form参照」を1件の現在状態として扱うため、
   * 同じ対象を再確認してもレコードを追加せず更新します。
   */
  async save(input: AnswerConfirmationInput): Promise<void> {
    this.assertFormReferenceKey(input.formReferenceKey)
    await this.database.answerConfirmations.put(input)
  }

  /**
   * 「配布項目 × Form参照」に該当する現在の状態を取得します。
   */
  async get(
    taskExternalKey: string,
    formReferenceKey: string,
  ): Promise<AnswerConfirmationRecord | undefined> {
    this.assertFormReferenceKey(formReferenceKey)
    return this.database.answerConfirmations.get([
      taskExternalKey,
      formReferenceKey,
    ])
  }

  /**
   * 指定した配布項目に紐づく回答確認結果を取得します。
   */
  async getByTaskExternalKey(
    taskExternalKey: string,
  ): Promise<AnswerConfirmationRecord[]> {
    return this.database.answerConfirmations
      .where('taskExternalKey')
      .equals(taskExternalKey)
      .toArray()
  }

  /**
   * 指定したForm参照に紐づく回答確認結果を取得します。
   */
  async getByFormReferenceKey(
    formReferenceKey: string,
  ): Promise<AnswerConfirmationRecord[]> {
    return this.database.answerConfirmations
      .where('formReferenceKey')
      .equals(formReferenceKey)
      .toArray()
  }

  /**
   * 指定した回答確認状態のレコードを取得します。
   */
  async getByStatus(
    status: AnswerConfirmationStatus,
  ): Promise<AnswerConfirmationRecord[]> {
    return this.database.answerConfirmations
      .where('status')
      .equals(status)
      .toArray()
  }

  /**
   * 「配布項目 × Form参照」の回答確認結果を削除します。
   */
  async delete(
    taskExternalKey: string,
    formReferenceKey: string,
  ): Promise<void> {
    this.assertFormReferenceKey(formReferenceKey)
    await this.database.answerConfirmations.delete([
      taskExternalKey,
      formReferenceKey,
    ])
  }

  /**
   * ローカル保存データ全消去機能用。
   */
  async clearAll(): Promise<void> {
    await this.database.answerConfirmations.clear()
  }
}

export const answerConfirmationRepository = new AnswerConfirmationRepository()
