import { describe, expect, it, vi } from 'vitest'

import { createGoogleGmailService } from './google-gmail.mjs'

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: vi.fn(async () => body),
  }
}

function createStreamBody(text) {
  const bytes = new TextEncoder().encode(text)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

const FORM_ID = '1FAIpQLSabcdefghijklmnopqrstuvwxyz12345'
const OTHER_FORM_ID = '1FAIpQLSzyxwvutsrqponmlkjihgfedcba54321'

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function createReceiptMessage({
  id = 'message-1',
  formId = FORM_ID,
  internalDate = '1785888000000',
  data,
} = {}) {
  return {
    id,
    internalDate,
    payload: {
      mimeType: 'text/plain',
      body: {
        data: encodeBase64Url(
          data ??
            `Thanks for your response. https://docs.google.com/forms/d/${formId}/viewform`,
        ),
      },
    },
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

  it('classifies an allowlisted Gmail permission reason without retaining the reason or body', async () => {
    const response = createJsonResponse(undefined, 403)
    response.body = createStreamBody(
      JSON.stringify({
        error: {
          errors: [
            {
              reason: 'insufficientPermissions',
              message: 'secret upstream message',
            },
          ],
        },
      }),
    )
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => response),
    })

    const error = await service
      .checkConnection('access-token')
      .catch((requestError) => requestError)

    expect(error).toMatchObject({
      name: 'GmailRequestError',
      code: 'permission_denied',
      status: 403,
      message: 'Gmail request failed.',
    })
    expect(error.message).not.toContain('secret')
    expect(JSON.stringify(error)).not.toContain('insufficientPermissions')
    expect(response.json).not.toHaveBeenCalled()
  })

  it('classifies quota and rate-limit reasons separately from permission errors', async () => {
    const response = createJsonResponse(undefined, 403)
    response.body = createStreamBody(
      JSON.stringify({
        error: { errors: [{ reason: 'userRateLimitExceeded' }] },
      }),
    )
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => response),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      {
        code: 'rate_limited',
        status: 403,
        message: 'Gmail request failed.',
      },
    )
  })

  it('classifies HTTP 429 without reading the response body and cancels it', async () => {
    const cancel = vi.fn(async () => {})
    const response = createJsonResponse(
      { message: 'sensitive rate-limit details' },
      429,
    )
    response.body = { cancel }
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => response),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      {
        code: 'rate_limited',
        status: 429,
        message: 'Gmail request failed.',
      },
    )
    expect(cancel).toHaveBeenCalledOnce()
    expect(response.json).not.toHaveBeenCalled()
  })

  it('uses a generic upstream error for unknown or malformed reasons', async () => {
    const response = createJsonResponse(undefined, 403)
    response.body = createStreamBody(
      JSON.stringify({
        error: { errors: [{ reason: 'sensitiveNewReason' }] },
      }),
    )
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => response),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      {
        code: 'upstream_error',
        status: 403,
        message: 'Gmail request failed.',
      },
    )
  })

  it('cancels a 403 body rejected by an oversized Content-Length', async () => {
    const cancel = vi.fn(async () => {})
    const response = createJsonResponse(undefined, 403)
    response.headers.set('content-length', '8193')
    response.body = { cancel }
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => response),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      { code: 'upstream_error', status: 403 },
    )
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('cancels a streaming 403 body when it exceeds the byte limit', async () => {
    const cancel = vi.fn(async () => {})
    const response = createJsonResponse(undefined, 403)
    response.body = {
      getReader: () => ({
        read: vi.fn(async () => ({
          done: false,
          value: new Uint8Array(8193),
        })),
        cancel,
        releaseLock: vi.fn(),
      }),
    }
    const service = createGoogleGmailService({
      fetchImplementation: vi.fn(async () => response),
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      { code: 'upstream_error', status: 403 },
    )
    expect(cancel).toHaveBeenCalledOnce()
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

  it('aborts a stalled request and maps it to a network failure', async () => {
    const fetchImplementation = vi.fn(
      (_requestUrl, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }),
    )
    const service = createGoogleGmailService({
      fetchImplementation,
      requestTimeoutMs: 1,
    })

    await expect(service.checkConnection('access-token')).rejects.toMatchObject(
      {
        name: 'GmailRequestError',
        code: 'network_error',
        message: 'Gmail request failed.',
      },
    )
    expect(fetchImplementation.mock.calls[0][1].signal.aborted).toBe(true)
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

  it('finds an exact receipt with bounded fields and returns safe data only', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(createJsonResponse(createReceiptMessage()))
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({
      status: 'submitted',
      receiptReceivedAt: '2026-08-05T00:00:00.000Z',
    })

    const [listUrl, listOptions] = fetchImplementation.mock.calls[0]
    expect(listUrl.searchParams.get('q')).toBe(
      `from:forms-receipts-noreply@google.com "${FORM_ID}"`,
    )
    expect(listUrl.searchParams.get('maxResults')).toBe('100')
    expect(listUrl.searchParams.get('fields')).toBe(
      'nextPageToken,messages(id)',
    )
    expect(listOptions.headers).toEqual({
      Authorization: 'Bearer access-token',
    })

    const [getUrl] = fetchImplementation.mock.calls[1]
    expect(getUrl.searchParams.get('format')).toBe('full')
    const fields = getUrl.searchParams.get('fields')
    expect(fields).toContain('internalDate')
    expect(fields).not.toContain('headers')
    expect(fields).toContain('parts(mimeType,body(data,attachmentId),parts(')
    expect(fields.match(/parts\(/g)).toHaveLength(32)
    expect(fields.length).toBeLessThan(4096)
    expect(encodeURIComponent(fields).length).toBeLessThan(4096)
    expect(getUrl.toString().length).toBeLessThan(8192)
  })

  it('returns unreviewable when there are no receipt candidates', async () => {
    const fetchImplementation = vi.fn(async () => createJsonResponse({}))
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'unreviewable' })
  })

  it('follows every search page, deduplicating message IDs', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: [{ id: 'message-1' }, { id: 'message-1' }],
          nextPageToken: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: [{ id: 'message-1' }, { id: 'message-2' }],
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(createReceiptMessage()))
      .mockResolvedValueOnce(
        createJsonResponse(
          createReceiptMessage({
            id: 'message-2',
            data: 'A receipt without a Form URL.',
          }),
        ),
      )
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toMatchObject({ status: 'submitted' })
    expect(fetchImplementation).toHaveBeenCalledTimes(4)
    expect(
      fetchImplementation.mock.calls[1][0].searchParams.get('pageToken'),
    ).toBe('page-2')
  })

  it('rejects a page-token loop as an invalid upstream response', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: [{ id: 'message-1' }],
          nextPageToken: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: [{ id: 'message-2' }],
          nextPageToken: 'page-2',
        }),
      )
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).rejects.toMatchObject({ code: 'invalid_response' })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('returns needsReview for duplicate exact receipts or an unparseable candidate', async () => {
    const duplicateFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: [{ id: 'message-1' }, { id: 'message-2' }],
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(createReceiptMessage()))
      .mockResolvedValueOnce(
        createJsonResponse(createReceiptMessage({ id: 'message-2' })),
      )
    const duplicateService = createGoogleGmailService({
      fetchImplementation: duplicateFetch,
    })
    await expect(
      duplicateService.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })

    const malformedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: [{ id: 'message-1' }, { id: 'message-2' }],
        }),
      )
      .mockResolvedValueOnce(createJsonResponse(createReceiptMessage()))
      .mockResolvedValueOnce(
        createJsonResponse({
          id: 'message-2',
          payload: { mimeType: 'text/plain', body: { data: '%%%bad%%%' } },
        }),
      )
    const malformedService = createGoogleGmailService({
      fetchImplementation: malformedFetch,
    })
    await expect(
      malformedService.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
  })

  it('requires a valid internalDate for a submitted result', async () => {
    for (const internalDate of [undefined, 'not-a-date', '-1', '1.5']) {
      const message = createReceiptMessage({ internalDate })
      if (internalDate === undefined) {
        delete message.internalDate
      }
      const fetchImplementation = vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ messages: [{ id: 'message-1' }] }),
        )
        .mockResolvedValueOnce(createJsonResponse(message))
      const service = createGoogleGmailService({ fetchImplementation })

      await expect(
        service.checkFormResponse('access-token', FORM_ID),
      ).resolves.toEqual({ status: 'needsReview' })
    }
  })

  it('accepts standard and published URLs but rejects unsafe near-matches', async () => {
    const candidateData = [
      `https://docs.google.com/forms/d/${FORM_ID}/edit`,
      `https://docs.google.com/forms/d/e/${FORM_ID}/viewform?usp=sf_link`,
      `http://docs.google.com/forms/d/${FORM_ID}/viewform`,
      `https://docs.google.com.evil/forms/d/${FORM_ID}/viewform`,
      `https://docs.google.com/forms/d/not-${FORM_ID}/viewform`,
      `https://docs.google.com:444/forms/d/${FORM_ID}/viewform`,
      `https://docs.google.com/forms//d/${FORM_ID}/viewform`,
      `https://docs.google.com/forms/d/${FORM_ID}/viewform/`,
      `https://docs.google.com/forms/d/${FORM_ID}/viewform/extra`,
    ]
    for (const [index, data] of candidateData.entries()) {
      const fetchImplementation = vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ messages: [{ id: 'message-1' }] }),
        )
        .mockResolvedValueOnce(
          createJsonResponse(createReceiptMessage({ id: 'message-1', data })),
        )
      const service = createGoogleGmailService({ fetchImplementation })

      await expect(
        service.checkFormResponse('access-token', FORM_ID),
      ).resolves.toEqual(
        index < 2
          ? {
              status: 'submitted',
              receiptReceivedAt: '2026-08-05T00:00:00.000Z',
            }
          : index === 4
            ? { status: 'needsReview' }
            : { status: 'unreviewable' },
      )
    }
  })

  it('does not treat standard id=e as a valid Form URL', async () => {
    const malformedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReceiptMessage({
            data: 'https://docs.google.com/forms/d/e/viewform',
          }),
        ),
      )
    const malformedService = createGoogleGmailService({
      fetchImplementation: malformedFetch,
    })
    await expect(
      malformedService.checkFormResponse('access-token', 'e'),
    ).resolves.toEqual({ status: 'needsReview' })

    const publishedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReceiptMessage({
            data: 'https://docs.google.com/forms/d/e/e/viewform',
          }),
        ),
      )
    const publishedService = createGoogleGmailService({
      fetchImplementation: publishedFetch,
    })
    await expect(
      publishedService.checkFormResponse('access-token', 'e'),
    ).resolves.toMatchObject({ status: 'submitted' })
  })

  it('collects nested Form URLs that begin inside a query value', async () => {
    const data = `https://docs.google.com/forms/d/${FORM_ID}/viewform?next=https://docs.google.com/forms/d/${OTHER_FORM_ID}/viewform`
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(createJsonResponse(createReceiptMessage({ data })))
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
  })

  it('returns needsReview when a body exceeds the URL start-count limit', async () => {
    const data = [
      `https://docs.google.com/forms/d/${FORM_ID}/viewform`,
      ...Array.from({ length: 1025 }, () => 'https://example.com/'),
    ].join(' ')
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(createJsonResponse(createReceiptMessage({ data })))
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
  })

  it('returns needsReview when a single URL candidate exceeds its length limit', async () => {
    const data = `https://docs.google.com/forms/d/${FORM_ID}/viewform?next=${'a'.repeat(16 * 1024)}`
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(createJsonResponse(createReceiptMessage({ data })))
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
  })

  it('handles nested MIME text and never uses binary attachment content', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          id: 'message-1',
          internalDate: '1785888000000',
          payload: {
            mimeType: 'multipart/mixed',
            parts: [
              {
                mimeType: 'multipart/alternative',
                parts: [
                  {
                    mimeType: 'text/plain',
                    body: { data: encodeBase64Url('A receipt.') },
                  },
                  {
                    mimeType: 'text/html',
                    body: {
                      data: encodeBase64Url(
                        `https://docs.google.com/forms/d/${FORM_ID}/viewform`,
                      ),
                    },
                  },
                ],
              },
              {
                mimeType: 'application/pdf',
                body: {
                  data: encodeBase64Url(
                    `https://docs.google.com/forms/d/${FORM_ID}/viewform`,
                  ),
                },
              },
            ],
          },
        }),
      )
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({
      status: 'submitted',
      receiptReceivedAt: '2026-08-05T00:00:00.000Z',
    })
  })

  it('marks an external text attachment unclear even beside an inline target URL', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          id: 'message-1',
          payload: {
            mimeType: 'multipart/mixed',
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: encodeBase64Url(
                    `https://docs.google.com/forms/d/${FORM_ID}/viewform`,
                  ),
                },
              },
              {
                mimeType: 'text/plain',
                body: { data: '', attachmentId: 'external-text-1' },
              },
            ],
          },
        }),
      )
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
  })

  it('returns needsReview when target and another Form ID are mixed', async () => {
    const mixedData = `https://docs.google.com/forms/d/${OTHER_FORM_ID}/viewform
      Answer value: https://docs.google.com/forms/d/${FORM_ID}/viewform`
    const mixedFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(createReceiptMessage({ data: mixedData })),
      )
    const mixedService = createGoogleGmailService({
      fetchImplementation: mixedFetch,
    })
    await expect(
      mixedService.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })

    const separateFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: [{ id: 'message-1' }, { id: 'message-2' }],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(createReceiptMessage({ id: 'message-1' })),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          createReceiptMessage({
            id: 'message-2',
            formId: OTHER_FORM_ID,
          }),
        ),
      )
    const separateService = createGoogleGmailService({
      fetchImplementation: separateFetch,
    })
    await expect(
      separateService.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
  })

  it('stops at the search page limit and returns needsReview', async () => {
    let pageCount = 0
    const fetchImplementation = vi.fn(async () => {
      pageCount += 1
      return createJsonResponse({
        messages: [],
        nextPageToken: `page-${pageCount + 1}`,
      })
    })
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
    expect(fetchImplementation).toHaveBeenCalledTimes(10)
  })

  it('stops before fetching messages when the candidate limit is exceeded', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          messages: Array.from({ length: 100 }, (_, index) => ({
            id: `message-${index}`,
          })),
          nextPageToken: 'page-2',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-100' }] }),
      )
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it('does not retain a malicious single page containing more than 100 IDs', async () => {
    const fetchImplementation = vi.fn(async () =>
      createJsonResponse({
        messages: Array.from({ length: 1000 }, (_, index) => ({
          id: `message-${index}`,
        })),
      }),
    )
    const service = createGoogleGmailService({ fetchImplementation })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).resolves.toEqual({ status: 'needsReview' })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    expect(
      fetchImplementation.mock.calls.every(
        ([requestUrl]) => !requestUrl.pathname.includes('/message-'),
      ),
    ).toBe(true)
  })

  it('fails safely when the operation deadline has already elapsed', async () => {
    const times = [100, 200]
    const fetchImplementation = vi.fn()
    const service = createGoogleGmailService({
      fetchImplementation,
      now: () => times.shift() ?? 200,
      operationTimeoutMs: 50,
    })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).rejects.toMatchObject({
      name: 'GmailRequestError',
      code: 'operation_timeout',
    })
    expect(fetchImplementation).not.toHaveBeenCalled()
  })

  it('checks the operation deadline after a fetch completes', async () => {
    let nowCallCount = 0
    const fetchImplementation = vi.fn(async () => createJsonResponse({}))
    const service = createGoogleGmailService({
      fetchImplementation,
      now: () => {
        nowCallCount += 1
        return nowCallCount < 3 ? 0 : 100
      },
      operationTimeoutMs: 50,
    })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).rejects.toMatchObject({
      name: 'GmailRequestError',
      code: 'operation_timeout',
    })
    expect(fetchImplementation).toHaveBeenCalledOnce()
  })

  it.each([
    ['upstream error', () => createJsonResponse({}, 503)],
    ['network rejection', () => Promise.reject(new Error('network'))],
  ])(
    'prioritizes operation timeout over a %s after fetchJson rejects',
    async (_label, responseFactory) => {
      let nowCallCount = 0
      const fetchImplementation = vi.fn(async () => responseFactory())
      const service = createGoogleGmailService({
        fetchImplementation,
        now: () => {
          nowCallCount += 1
          return nowCallCount < 3 ? 0 : 100
        },
        operationTimeoutMs: 50,
      })

      await expect(
        service.checkFormResponse('access-token', FORM_ID),
      ).rejects.toMatchObject({ code: 'operation_timeout' })
    },
  )

  it('preserves an upstream error when fetchJson rejects before the deadline', async () => {
    let nowCallCount = 0
    const fetchImplementation = vi.fn(async () => createJsonResponse({}, 503))
    const service = createGoogleGmailService({
      fetchImplementation,
      now: () => {
        nowCallCount += 1
        return 0
      },
      operationTimeoutMs: 50,
    })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).rejects.toMatchObject({ code: 'upstream_error', status: 503 })
  })

  it('preserves a network error when fetchJson rejects before the deadline', async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new Error('network')
    })
    const service = createGoogleGmailService({
      fetchImplementation,
      now: () => 0,
      operationTimeoutMs: 50,
    })

    await expect(
      service.checkFormResponse('access-token', FORM_ID),
    ).rejects.toMatchObject({ code: 'network_error' })
  })

  it('allows an empty multipart body while enforcing MIME resource bounds', async () => {
    const withinLimitFetch = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({ messages: [{ id: 'message-1' }] }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          id: 'message-1',
          internalDate: '1785888000000',
          payload: {
            mimeType: 'multipart/mixed',
            body: {},
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: encodeBase64Url(
                    `https://docs.google.com/forms/d/${FORM_ID}/viewform`,
                  ),
                },
              },
            ],
          },
        }),
      )
    const withinLimitService = createGoogleGmailService({
      fetchImplementation: withinLimitFetch,
    })
    await expect(
      withinLimitService.checkFormResponse('access-token', FORM_ID),
    ).resolves.toMatchObject({ status: 'submitted' })

    const cases = [
      (() => {
        let part = {
          mimeType: 'text/plain',
          body: { data: encodeBase64Url('normal text') },
        }
        for (let depth = 0; depth < 34; depth += 1) {
          part = { mimeType: 'multipart/mixed', parts: [part] }
        }
        return part
      })(),
      {
        mimeType: 'multipart/mixed',
        parts: Array.from({ length: 257 }, () => ({
          mimeType: 'application/octet-stream',
          body: {},
        })),
      },
      {
        mimeType: 'text/plain',
        body: { data: encodeBase64Url('a'.repeat(512 * 1024 + 1)) },
      },
      {
        mimeType: 'multipart/mixed',
        parts: Array.from({ length: 5 }, () => ({
          mimeType: 'text/plain',
          body: { data: encodeBase64Url('a'.repeat(512 * 1024)) },
        })),
      },
    ]

    for (const payload of cases) {
      const fetchImplementation = vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ messages: [{ id: 'message-1' }] }),
        )
        .mockResolvedValueOnce(createJsonResponse({ id: 'message-1', payload }))
      const service = createGoogleGmailService({ fetchImplementation })
      await expect(
        service.checkFormResponse('access-token', FORM_ID),
      ).resolves.toEqual({ status: 'needsReview' })
    }
  })

  it('returns needsReview for invalid base64url, UTF-8, or external text data', async () => {
    for (const body of [
      { data: 'not-valid-base64!' },
      { data: '__8' },
      { attachmentId: 'attachment-1' },
    ]) {
      const fetchImplementation = vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ messages: [{ id: 'message-1' }] }),
        )
        .mockResolvedValueOnce(
          createJsonResponse({
            id: 'message-1',
            payload: { mimeType: 'text/plain', body },
          }),
        )
      const service = createGoogleGmailService({ fetchImplementation })

      await expect(
        service.checkFormResponse('access-token', FORM_ID),
      ).resolves.toEqual({ status: 'needsReview' })
    }
  })

  it('rejects Form ID injection and malformed upstream list/get shapes', async () => {
    const fetchImplementation = vi.fn()
    const service = createGoogleGmailService({ fetchImplementation })
    for (const formId of [
      'form-id" OR from:attacker@example.com',
      'form id',
      'form/id',
      'a'.repeat(513),
    ]) {
      await expect(
        service.checkFormResponse('access-token', formId),
      ).rejects.toMatchObject({ code: 'invalid_form_id' })
    }
    expect(fetchImplementation).not.toHaveBeenCalled()

    const malformedListService = createGoogleGmailService({
      fetchImplementation: vi.fn(async () =>
        createJsonResponse({ messages: [{ id: 42 }] }),
      ),
    })
    await expect(
      malformedListService.checkFormResponse('access-token', FORM_ID),
    ).rejects.toMatchObject({ code: 'invalid_response' })

    const malformedGetService = createGoogleGmailService({
      fetchImplementation: vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ messages: [{ id: 'message-1' }] }),
        )
        .mockResolvedValueOnce(createJsonResponse({ id: 'other-message' })),
    })
    await expect(
      malformedGetService.checkFormResponse('access-token', FORM_ID),
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })
})
