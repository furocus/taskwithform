import type {
  AnswerConfirmationInput,
  AnswerConfirmationRecord,
} from './database.types'
import { database as defaultDatabase, type TaskWithFormDatabase } from './db'

/** Form回答確認結果（AnswerConfirmation）のデータ操作を行うリポジトリクラス */
export class AnswerConfirmationRepository {
  constructor(
    private readonly database: TaskWithFormDatabase = defaultDatabase,
  ) {}

  /**
   * 回答確認結果を保存(新規追加)する
   * @param input　id以外の回答確認情報
   * @returns 生成されたレコードのid(number)
   */
  async save(input: AnswerConfirmationInput): Promise<number> {
    const record: AnswerConfirmationRecord = {
      formUrl: input.formUrl,
      status: input.status,
      confirmedAt: input.confirmedAt ?? new Date().toISOString(),
    }
    return this.database.answerConfirmations.add(record)
  }

  /**
   * IDによって単一の回答確認結果を取得します。
   * @param id レコードID
   */
  async getById(id: number): Promise<AnswerConfirmationRecord | undefined> {
    return this.database.answerConfirmations.get(id)
  }

  /**
   * 指定した Form URL に該当する回答確認結果のリストを取得します。
   * @param formUrl 対象のForm URL
   */
  async getByFormUrl(formUrl: string): Promise<AnswerConfirmationRecord[]> {
    return this.database.answerConfirmations
      .where('formUrl')
      .equals(formUrl)
      .toArray()
  }

  /**
   * 指定した ID の回答確認結果を更新します。
   * @param id 更新対象のレコードID
   * @param changes 更新内容
   */
  async update(
    id: number,
    changes: Partial<AnswerConfirmationInput>,
  ): Promise<void> {
    await this.database.answerConfirmations.update(id, changes)
  }

  /**
   * 指定したIDのレコードのみを削除
   * @param id 削除対象のレコードID
   */
  async delete(id: number): Promise<void> {
    await this.database.answerConfirmations.delete(id)
  }

  /**
   * ローカル保存データ全消去機能用。
   */
  async clearAll(): Promise<void> {
    await this.database.answerConfirmations.clear()
  }
}

// アプリ全体で使い回すシングルトンインスタンス
export const answerConfirmationRepository = new AnswerConfirmationRepository()
