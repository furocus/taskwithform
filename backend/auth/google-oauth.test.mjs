import { OAuth2Client } from 'google-auth-library'
import { describe, expect, it, vi } from 'vitest'

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

  it('normalizes granted scopes from the token response without retaining invalid values', async () => {
    const getToken = vi.spyOn(OAuth2Client.prototype, 'getToken')
    getToken.mockResolvedValueOnce({
      tokens: {
        access_token: 'access-token',
        expiry_date: 12345,
        scope: ` ${GOOGLE_OAUTH_SCOPES[0]}  ${GOOGLE_OAUTH_SCOPES[0]} ${GOOGLE_OAUTH_SCOPES[2]} `,
      },
    })
    const service = createGoogleOAuthService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      googleRedirectUri: 'http://localhost:3000/api/auth/google/callback',
    })

    await expect(service.exchangeCode('code-value')).resolves.toEqual({
      accessToken: 'access-token',
      expiresAt: 12345,
      grantedScopes: [GOOGLE_OAUTH_SCOPES[0], GOOGLE_OAUTH_SCOPES[2]],
    })
    getToken.mockRestore()
  })

  it('uses no granted scopes when Google omits or corrupts the scope field', async () => {
    const getToken = vi.spyOn(OAuth2Client.prototype, 'getToken')
    getToken
      .mockResolvedValueOnce({
        tokens: { access_token: 'access-token', expiry_date: 12345 },
      })
      .mockResolvedValueOnce({
        tokens: {
          access_token: 'access-token',
          expiry_date: 12345,
          scope: ['not-a-scope'],
        },
      })
    const service = createGoogleOAuthService({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      googleRedirectUri: 'http://localhost:3000/api/auth/google/callback',
    })

    await expect(service.exchangeCode('missing-scope')).resolves.toMatchObject({
      grantedScopes: [],
    })
    await expect(service.exchangeCode('invalid-scope')).resolves.toMatchObject({
      grantedScopes: [],
    })
    getToken.mockRestore()
  })
})
