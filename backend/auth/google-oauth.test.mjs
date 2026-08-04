import { describe, expect, it } from 'vitest'

import {
  GOOGLE_OAUTH_SCOPES,
  createGoogleOAuthService,
} from './google-oauth.mjs'

describe('Google OAuth service', () => {
  it('creates an online authorization URL with readonly Classroom and Gmail scopes', () => {
    const service = createGoogleOAuthService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      googleRedirectUri: 'http://localhost:3000/api/auth/google/callback',
    })

    const authorizationUrl = new URL(
      service.createAuthorizationUrl('state-value'),
    )

    expect(authorizationUrl.origin).toBe('https://accounts.google.com')
    expect(authorizationUrl.searchParams.get('access_type')).toBe('online')
    expect(authorizationUrl.searchParams.get('include_granted_scopes')).toBe(
      'true',
    )
    expect(authorizationUrl.searchParams.get('scope')?.split(' ')).toEqual(
      GOOGLE_OAUTH_SCOPES,
    )
    expect(authorizationUrl.searchParams.get('state')).toBe('state-value')
  })
})
