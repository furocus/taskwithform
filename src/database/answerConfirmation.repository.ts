import type {
  AnswerConfirmationInput,
  AnswerConfirmationRecord,
  AnswerConfirmationStatus,
  TaskFormReference,
} from './database.types'
import { database as defaultDatabase, type TaskWithFormDatabase } from './db'
import { createFormReferenceKey } from './formReference'

/**
 * Stores the current Gmail answer confirmation state of one Form inside one
 * distribution item.
 *
 * The table holds current state, not history: `[taskExternalKey +
 * formReferenceKey]` is the primary key and every write is a `put`, so
 * re-checking the same Form replaces the row instead of appending to it.
 */
export class AnswerConfirmationRepository {
  constructor(
    private readonly database: TaskWithFormDatabase = defaultDatabase,
  ) {}

  /**
   * Builds the storage key for a Form reference. Throws for an unresolved
   * reference, which has no Form identity to attach a result to.
   */
  static createKey(reference: TaskFormReference): string {
    return createFormReferenceKey(reference)
  }

  /** Saves the current state, replacing any previous result for the same Form. */
  async upsert(input: AnswerConfirmationInput): Promise<void> {
    const record: AnswerConfirmationRecord = {
      taskExternalKey: input.taskExternalKey,
      formReferenceKey: input.formReferenceKey,
      status: input.status,
      confirmedAt: input.confirmedAt,
    }

    await this.database.answerConfirmations.put(record)
  }

  /** Returns the single current state, or undefined when never confirmed. */
  async get(
    taskExternalKey: string,
    formReferenceKey: string,
  ): Promise<AnswerConfirmationRecord | undefined> {
    return this.database.answerConfirmations.get([
      taskExternalKey,
      formReferenceKey,
    ])
  }

  /** Every confirmed Form of one distribution item, for per-Form cards. */
  async getByTask(
    taskExternalKey: string,
  ): Promise<AnswerConfirmationRecord[]> {
    return this.database.answerConfirmations
      .where('taskExternalKey')
      .equals(taskExternalKey)
      .toArray()
  }

  /** Reverse lookup: the same Form can be distributed by several items. */
  async getByFormReferenceKey(
    formReferenceKey: string,
  ): Promise<AnswerConfirmationRecord[]> {
    return this.database.answerConfirmations
      .where('formReferenceKey')
      .equals(formReferenceKey)
      .toArray()
  }

  async listByStatus(
    status: AnswerConfirmationStatus,
  ): Promise<AnswerConfirmationRecord[]> {
    return this.database.answerConfirmations
      .where('status')
      .equals(status)
      .toArray()
  }

  async delete(
    taskExternalKey: string,
    formReferenceKey: string,
  ): Promise<void> {
    await this.database.answerConfirmations.delete([
      taskExternalKey,
      formReferenceKey,
    ])
  }

  /** Used by the local data reset. */
  async clearAll(): Promise<void> {
    await this.database.answerConfirmations.clear()
  }
}

// アプリ全体で使い回すシングルトンインスタンス
export const answerConfirmationRepository = new AnswerConfirmationRepository()
