import { describe, expect, it, vi } from 'vitest'

import { createGoogleGmailService } from './google-gmail.mjs'

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => body),
  }
}

describe('Google Gmail service', () => {
  it('checks the connection without requesting email addresses or messages', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({ historyId: '12345' }),
    )
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(service.checkConnection('access-token')).resolves.toBe(
      undefined,
    )

    const [requestUrl, requestOptions] = fetchImplementation.mock.calls[0]
    expect(requestUrl.toString()).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile?fields=historyId',
    )
    expect(requestOptions.headers.Authorization).toBe('Bearer access-token')
  })

  it('preserves an upstream status without reading the response body', async () => {
    const response = createJsonResponse(
      { message: 'sensitive upstream details' },
      403,
    )
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => response),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      {
        name: 'GmailRequestError',
        code: 'upstream_error',
        status: 403,
        message: 'Gmail request failed.',
      },
    )
    expect(response.json).not.toHaveBeenCalled()
  })

  it('wraps network failures without exposing their message', async () => {
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => {
        throw new Error('sensitive network details')
      }),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      {
        name: 'GmailRequestError',
        code: 'network_error',
        message: 'Gmail request failed.',
      },
    )
  })

  it('rejects a profile response without a history ID', async () => {
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () =>
        createJsonResponse({ emailAddress: 'student@example.com' }),
      ),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      {
        code: 'invalid_response',
      },
    )
  })
})
