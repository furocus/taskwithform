import type { ClassroomItemsResponse } from './classroom.api'

/**
 * The agreed `GET /api/classroom/courses/items` response. It covers the
 * shapes the sync has to handle: a task with one Form, a task with several
 * Forms, a task without a due date, and an ACTIVE course that has no published
 * course work at all.
 */
export const activeCourseListFixture: ClassroomItemsResponse = {
  courses: [
    {
      id: 'course-math',
      name: '数学I',
      items: [
        {
          itemId: 'work-quiz',
          itemType: 'courseWork',
          courseWorkType: 'ASSIGNMENT',
          creationTime: '2026-08-30T00:00:00Z',
          title: '確認テスト',
          description: 'Google Formに回答してください。',
          alternateLink:
            'https://classroom.google.com/c/course-math/a/work-quiz',
          dueDate: '2026-09-04',
          submissionStatus: 'unsubmitted',
          forms: [
            {
              resolution: 'resolved',
              sourceUrl:
                'https://docs.google.com/forms/d/quiz-form-id/viewform',
              formId: 'quiz-form-id',
              formIdType: 'standard',
              formUrl: 'https://docs.google.com/forms/d/quiz-form-id/viewform',
            },
          ],
        },
        {
          itemId: 'work-two-forms',
          itemType: 'courseWork',
          courseWorkType: 'ASSIGNMENT',
          creationTime: '2026-08-29T00:00:00Z',
          title: '前期振り返り',
          dueDate: '2026-09-11',
          submissionStatus: 'unsubmitted',
          forms: [
            {
              resolution: 'resolved',
              sourceUrl:
                'https://docs.google.com/forms/d/review-form-id/viewform',
              formId: 'review-form-id',
              formIdType: 'standard',
              formUrl:
                'https://docs.google.com/forms/d/review-form-id/viewform',
            },
            {
              resolution: 'resolved',
              sourceUrl:
                'https://docs.google.com/forms/d/e/survey-form-id/viewform',
              formId: 'survey-form-id',
              formIdType: 'published',
              formUrl:
                'https://docs.google.com/forms/d/e/survey-form-id/viewform',
            },
          ],
        },
        {
          itemId: 'work-no-due-date',
          itemType: 'courseWork',
          courseWorkType: 'SHORT_ANSWER_QUESTION',
          creationTime: '2026-08-28T00:00:00Z',
          title: '質問への回答',
          submissionStatus: 'unsubmitted',
          forms: [],
        },
      ],
    },
    {
      id: 'course-empty',
      name: '英語コミュニケーションI',
      items: [],
    },
  ],
}
