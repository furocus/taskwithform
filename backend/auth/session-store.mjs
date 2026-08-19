import { randomBytes, timingSafeEqual } from 'node:crypto'

const DEFAULT_PENDING_SESSION_TTL_MS = 10 * 60 * 1000

function createRandomId() {
  return randomBytes(32).toString('base64url')
}

function safelyCompare(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export class MemorySessionStore {
  constructor({
    now = () => Date.now(),
    createId = createRandomId,
    pendingSessionTtlMs = DEFAULT_PENDING_SESSION_TTL_MS,
  } = {}) {
    this.now = now
    this.createId = createId
    this.pendingSessionTtlMs = pendingSessionTtlMs
    this.sessions = new Map()
  }

  createPending(state) {
    const sessionId = this.createId()
    this.sessions.set(sessionId, {
      kind: 'pending',
      state,
      expiresAt: this.now() + this.pendingSessionTtlMs,
    })
    return sessionId
  }

  consumePending(sessionId, state) {
    const session = this.sessions.get(sessionId)
    this.sessions.delete(sessionId)

    if (
      session?.kind !== 'pending' ||
      session.expiresAt <= this.now() ||
      !safelyCompare(session.state, state)
    ) {
      return false
    }

    return true
  }

  createAuthenticated({ accessToken, expiresAt, grantedScopes }) {
    const sessionId = this.createId()
    this.sessions.set(sessionId, {
      kind: 'authenticated',
      accessToken,
      expiresAt,
      grantedScopes: Array.isArray(grantedScopes)
        ? [
            ...new Set(
              grantedScopes.filter(
                (scope) => typeof scope === 'string' && scope.length > 0,
              ),
            ),
          ]
        : [],
    })
    return sessionId
  }

  getAuthenticated(sessionId) {
    const session = this.sessions.get(sessionId)

    if (session?.kind !== 'authenticated' || session.expiresAt <= this.now()) {
      this.sessions.delete(sessionId)
      return undefined
    }

    return session
  }

  delete(sessionId) {
    this.sessions.delete(sessionId)
  }
}
