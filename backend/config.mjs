const DEFAULT_GOOGLE_REDIRECT_URI =
  'http://localhost:3000/api/auth/google/callback'
const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:5173'

export class OAuthConfigurationError extends Error {
  constructor(missingKeys) {
    super(
      `Missing required OAuth environment variables: ${missingKeys.join(', ')}`,
    )
    this.name = 'OAuthConfigurationError'
    this.code = 'oauth_configuration_error'
  }
}

function readOptionalEnvironmentValue(environment, key, fallback) {
  const value = environment[key]?.trim()
  return value === undefined || value === '' ? fallback : value
}

export function loadServerConfig(environment = process.env) {
  return {
    frontendOrigin: readOptionalEnvironmentValue(
      environment,
      'FRONTEND_ORIGIN',
      DEFAULT_FRONTEND_ORIGIN,
    ),
    googleRedirectUri: readOptionalEnvironmentValue(
      environment,
      'GOOGLE_REDIRECT_URI',
      DEFAULT_GOOGLE_REDIRECT_URI,
    ),
  }
}

export function loadGoogleOAuthConfig(environment = process.env) {
  const missingKeys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter(
    (key) => {
      const value = environment[key]
      return value === undefined || value.trim() === ''
    },
  )

  if (missingKeys.length > 0) {
    throw new OAuthConfigurationError(missingKeys)
  }

  return {
    ...loadServerConfig(environment),
    clientId: environment.GOOGLE_CLIENT_ID.trim(),
    clientSecret: environment.GOOGLE_CLIENT_SECRET.trim(),
  }
}
