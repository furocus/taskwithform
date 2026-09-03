import { describe, expect, it } from 'vitest'

import { MemorySessionStore } from './session-store.mjs'

const NOW = Date.parse('2026-07-30T08:00:00.000Z')

describe('MemorySessionStore authenticated sessions', () => {
  it('distinguishes an authenticated session from an unknown session', () => {
    const store = new MemorySessionStore({
      now: () => NOW,
      createId: () => 'session-id',
    })
    const sessionId = store.createAuthenticated({
      accessToken: 'access-token',
      expiresAt: NOW + 1_000,
      grantedScopes: [],
    })

    expect(store.getAuthenticatedResult(sessionId)).toMatchObject({
      status: 'authenticated',
      session: { accessToken: 'access-token' },
    })
    expect(store.getAuthenticatedResult('unknown-session')).toEqual({
      status: 'unauthenticated',
    })
  })

  it('reports pending sessions as unauthenticated for authenticated lookups', () => {
    const store = new MemorySessionStore({
      now: () => NOW,
      createId: () => 'pending-session',
    })

    const sessionId = store.createPending('oauth-state')
    expect(store.getAuthenticatedResult(sessionId)).toEqual({
      status: 'unauthenticated',
    })
    expect(store.getAuthenticatedResult(sessionId)).toEqual({
      status: 'unauthenticated',
    })
  })

  it('distinguishes and removes an authenticated session after expiry', () => {
    let now = NOW
    const store = new MemorySessionStore({
      now: () => now,
      createId: () => 'session-id',
    })
    const sessionId = store.createAuthenticated({
      accessToken: 'access-token',
      expiresAt: NOW + 1_000,
      grantedScopes: [],
    })

    now = NOW + 1_000
    expect(store.getAuthenticatedResult(sessionId)).toEqual({
      status: 'expired',
    })
    expect(store.getAuthenticatedResult(sessionId)).toEqual({
      status: 'unauthenticated',
    })
  })

  it('keeps the legacy authenticated lookup compatible for callers', () => {
    let now = NOW
    const store = new MemorySessionStore({
      now: () => now,
      createId: () => 'session-id',
    })
    const sessionId = store.createAuthenticated({
      accessToken: 'access-token',
      expiresAt: NOW + 1_000,
      grantedScopes: [],
    })

    expect(store.getAuthenticated(sessionId)).toMatchObject({
      accessToken: 'access-token',
    })
    now = NOW + 1_000
    expect(store.getAuthenticated(sessionId)).toBeUndefined()
  })
})
