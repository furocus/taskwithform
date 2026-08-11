const CLASSROOM_COURSES_URL = 'https://classroom.googleapis.com/v1/courses'

export class ClassroomRequestError extends Error {
  constructor(code, { status, cause } = {}) {
    super('Google Classroom request failed.', { cause })
    this.name = 'ClassroomRequestError'
    this.code = code
    this.status = status
  }
}

export function createGoogleClassroomService({
  fetchImplementation = fetch,
} = {}) {
  return {
    async countActiveCourses(accessToken) {
      let count = 0
      let pageToken
      const visitedPageTokens = new Set()

      do {
        const requestUrl = new URL(CLASSROOM_COURSES_URL)
        requestUrl.searchParams.set('courseStates', 'ACTIVE')
        requestUrl.searchParams.set('pageSize', '100')
        requestUrl.searchParams.set('fields', 'nextPageToken,courses(id)')

        if (pageToken !== undefined) {
          requestUrl.searchParams.set('pageToken', pageToken)
        }

        let response
        try {
          response = await fetchImplementation(requestUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
        } catch (error) {
          throw new ClassroomRequestError('network_error', {
            cause: error,
          })
        }

        if (!response.ok) {
          throw new ClassroomRequestError('upstream_error', {
            status: response.status,
          })
        }

        let responseBody
        try {
          responseBody = await response.json()
        } catch (error) {
          throw new ClassroomRequestError('invalid_response', {
            cause: error,
          })
        }

        if (
          responseBody === null ||
          typeof responseBody !== 'object' ||
          Array.isArray(responseBody)
        ) {
          throw new ClassroomRequestError('invalid_response')
        }

        if (
          responseBody.courses !== undefined &&
          !Array.isArray(responseBody.courses)
        ) {
          throw new ClassroomRequestError('invalid_response')
        }

        if (
          responseBody.nextPageToken !== undefined &&
          typeof responseBody.nextPageToken !== 'string'
        ) {
          throw new ClassroomRequestError('invalid_response')
        }

        count += responseBody.courses?.length ?? 0
        pageToken =
          typeof responseBody.nextPageToken === 'string' &&
          responseBody.nextPageToken !== ''
            ? responseBody.nextPageToken
            : undefined

        if (pageToken !== undefined) {
          if (visitedPageTokens.has(pageToken)) {
            throw new ClassroomRequestError('invalid_response')
          }
          visitedPageTokens.add(pageToken)
        }
      } while (pageToken !== undefined)

      return count
    },
  }
}
