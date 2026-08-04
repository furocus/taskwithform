import { OAuth2Client } from 'google-auth-library'

export const GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE =
  'https://www.googleapis.com/auth/classroom.courses.readonly'
export const GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE =
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly'
export const GOOGLE_GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly'

export const GOOGLE_OAUTH_SCOPES = [
  GOOGLE_CLASSROOM_COURSES_READONLY_SCOPE,
  GOOGLE_CLASSROOM_COURSEWORK_ME_READONLY_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
]

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

      return {
        accessToken: tokens.access_token,
        expiresAt: tokens.expiry_date,
      }
    },

    async revokeAccessToken(accessToken) {
      await oauthClient.revokeToken(accessToken)
    },
  }
}
