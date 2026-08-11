import { describe, expect, it } from 'vitest'

import {
  OAuthConfigurationError,
  loadGoogleOAuthConfig,
  loadServerConfig,
} from './config.mjs'

describe('OAuth configuration', () => {
  it('uses local development URLs by default', () => {
    expect(loadServerConfig({})).toEqual({
      frontendOrigin: 'http://localhost:5173',
      googleRedirectUri: 'http://localhost:3000/api/auth/google/callback',
    })
  })

  it('loads credentials and explicit URLs from the environment', () => {
    expect(
      loadGoogleOAuthConfig({
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
        GOOGLE_REDIRECT_URI: 'https://example.com/api/auth/google/callback',
        FRONTEND_ORIGIN: 'https://example.com',
      }),
    ).toEqual({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      googleRedirectUri: 'https://example.com/api/auth/google/callback',
      frontendOrigin: 'https://example.com',
    })
  })

  it('reports missing credential names without exposing configured values', () => {
    expect(() =>
      loadGoogleOAuthConfig({
        GOOGLE_CLIENT_ID: 'configured-client-id',
        GOOGLE_CLIENT_SECRET: ' ',
      }),
    ).toThrow(new OAuthConfigurationError(['GOOGLE_CLIENT_SECRET']))
  })
})
