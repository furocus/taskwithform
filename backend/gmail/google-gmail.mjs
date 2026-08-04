const GMAIL_PROFILE_URL =
  'https://gmail.googleapis.com/gmail/v1/users/me/profile'

export class GmailRequestError extends Error {
  constructor(code, { status, cause } = {}) {
    super('Gmail request failed.', { cause })
    this.name = 'GmailRequestError'
    this.code = code
    this.status = status
  }
}

export function createGoogleGmailService({ fetchImplementation = fetch } = {}) {
  return {
    async checkConnection(accessToken) {
      const requestUrl = new URL(GMAIL_PROFILE_URL)
      requestUrl.searchParams.set('fields', 'historyId')

      let response
      try {
        response = await fetchImplementation(requestUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
      } catch (error) {
        throw new GmailRequestError('network_error', { cause: error })
      }

      if (!response.ok) {
        throw new GmailRequestError('upstream_error', {
          status: response.status,
        })
      }

      let responseBody
      try {
        responseBody = await response.json()
      } catch (error) {
        throw new GmailRequestError('invalid_response', { cause: error })
      }

      if (
        responseBody === null ||
        typeof responseBody !== 'object' ||
        Array.isArray(responseBody) ||
        typeof responseBody.historyId !== 'string' ||
        responseBody.historyId === ''
      ) {
        throw new GmailRequestError('invalid_response')
      }
    },
  }
}
