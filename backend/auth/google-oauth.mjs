import { OAuth2Client } from 'google-auth-library'

export const GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE =
  'https://www.googleapis.com/auth/classroom.courses.readonly'
export const GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE =
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly'
export const GOOGLE_CLASSROOM_STUDENT_SUBMISSIONS_ME_READONLY_SCOPE =
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly'
export const GOOGLE_GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly'

export const GOOGLE_OAUTH_SCOPES = [
  GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
  GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
]

function normalizeGrantedScopes(scope) {
  if (typeof scope !== 'string') {
    return []
  }

  return [...new Set(scope.split(/\s+/).filter(Boolean))]
}

export function createGoogleOAuthService(config) {
  const oauthClient = new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.googleRedirectUri,
  )

  return {
    createAuthorizationUrl(state) {
      return oauthClient.generateAuthUrl({
        access_type: 'online',
        include_granted_scopes: true,
        scope: GOOGLE_OAUTH_SCOPES,
        state,
      })
    },

    async exchangeCode(code) {
      const { tokens } = await oauthClient.getToken(code)
      const safeTokens =
        tokens !== null && typeof tokens === 'object' ? tokens : {}

      return {
        accessToken: safeTokens.access_token,
        expiresAt: safeTokens.expiry_date,
        grantedScopes: normalizeGrantedScopes(safeTokens.scope),
      }
    },

    async revokeAccessToken(accessToken) {
      await oauthClient.revokeToken(accessToken)
    },
  }
}
