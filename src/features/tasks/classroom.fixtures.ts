import type { ClassroomCourseListResponse } from './classroom.api'

/**
 * The agreed `GET /api/classroom/courses/coursework` response. It covers the
 * shapes the sync has to handle: a task with one Form, a task with several
 * Forms, a task without a due date, and an ACTIVE course that has no published
 * course work at all.
 */
export const activeCourseListFixture: ClassroomCourseListResponse = {
  courses: [
    {
      id: 'course-math',
      name: '数学I',
      courseWork: [
        {
          courseWorkId: 'work-quiz',
          courseWorkType: 'ASSIGNMENT',
          title: '確認テスト',
          description: 'Google Formに回答してください。',
          alternateLink:
            'https://classroom.google.com/c/course-math/a/work-quiz',
          dueDate: '2026-09-04',
          forms: [
            {
              formId: 'quiz-form-id',
              formUrl: 'https://docs.google.com/forms/d/quiz-form-id/viewform',
            },
          ],
        },
        {
          courseWorkId: 'work-two-forms',
          courseWorkType: 'ASSIGNMENT',
          title: '前期振り返り',
          dueDate: '2026-09-11',
          forms: [
            {
              formId: 'review-form-id',
              formUrl:
                'https://docs.google.com/forms/d/review-form-id/viewform',
            },
            {
              formId: 'survey-form-id',
              formUrl:
                'https://docs.google.com/forms/d/e/survey-form-id/viewform',
            },
          ],
        },
        {
          courseWorkId: 'work-no-due-date',
          courseWorkType: 'SHORT_ANSWER_QUESTION',
          title: '質問への回答',
          forms: [],
        },
      ],
    },
    {
      id: 'course-empty',
      name: '英語コミュニケーションI',
      courseWork: [],
    },
  ],
}
