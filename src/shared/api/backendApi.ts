/** An error the backend reported, or a stable stand-in when it cannot be read. */
export class BackendApiError extends Error {
  /**
   * `code` is the stable value callers branch on. `reason` is an optional
   * diagnostic from a fixed client-side vocabulary; it never carries backend
   * text, response bodies or user data, so it is safe to log.
   */
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly reason?: string,
  ) {
    super(reason === undefined ? code : `${code} (${reason})`)
    this.name = 'BackendApiError'
  }
}

export type FetchImplementation = typeof fetch

/**
 * Reads the backend error code from a failed response. The backend `message` is
 * never surfaced, so an unknown payload becomes a generic error instead.
 */
export async function readBackendError(
  response: Response,
): Promise<BackendApiError> {
  try {
    const responseBody = (await response.json()) as {
      error?: { code?: unknown }
    }
    if (typeof responseBody.error?.code === 'string') {
      return new BackendApiError(responseBody.error.code, response.status)
    }
  } catch {
    // Fall back to a stable application error when the backend is unavailable.
  }

  return new BackendApiError('backend_error', response.status)
}
