import {
  BackendApiError,
  readBackendError,
  type FetchImplementation,
} from '../../shared/api/backendApi'

export { BackendApiError } from '../../shared/api/backendApi'

export interface AuthSession {
  authenticated: boolean
  expiresAt?: string
}

export async function getAuthSession(
  fetchImplementation: FetchImplementation = fetch,
): Promise<AuthSession> {
  const response = await fetchImplementation('/api/auth/session', {
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw await readBackendError(response)
  }

  const responseBody = (await response.json()) as {
    authenticated?: unknown
    expiresAt?: unknown
  }

  if (typeof responseBody.authenticated !== 'boolean') {
    throw new BackendApiError('invalid_backend_response', response.status)
  }

  if (
    responseBody.expiresAt !== undefined &&
    typeof responseBody.expiresAt !== 'string'
  ) {
    throw new BackendApiError('invalid_backend_response', response.status)
  }

  return {
    authenticated: responseBody.authenticated,
    ...(responseBody.expiresAt === undefined
      ? {}
      : { expiresAt: responseBody.expiresAt }),
  }
}

export async function getClassroomCourseCount(
  fetchImplementation: FetchImplementation = fetch,
): Promise<number> {
  const response = await fetchImplementation('/api/classroom/courses/count', {
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw await readBackendError(response)
  }

  const responseBody = (await response.json()) as { count?: unknown }
  if (
    typeof responseBody.count !== 'number' ||
    !Number.isInteger(responseBody.count) ||
    responseBody.count < 0
  ) {
    throw new BackendApiError('invalid_backend_response', response.status)
  }

  return responseBody.count
}

export async function logoutSession(
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  const response = await fetchImplementation('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw await readBackendError(response)
  }
}
