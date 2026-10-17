/**
 * Enables a named Administrator account to inspect operational workspaces during the
 * development period. The option is disabled by default and never contains a
 * password; credentials remain normal user records protected by BCrypt.
 */
export interface ItVerificationOptions {
  enabled: boolean
  testerUserId: number | null
  testerUsername: string
}

export const ItVerificationOptions = Object.freeze({
  SectionName: 'ItVerification',

  /** Env: IT_VERIFICATION_ENABLED, IT_VERIFICATION_TESTER_USER_ID, IT_VERIFICATION_TESTER_USERNAME */
  fromEnvironment(env: NodeJS.ProcessEnv = process.env): ItVerificationOptions {
    const enabled = (env.IT_VERIFICATION_ENABLED ?? '').trim().toLowerCase() === 'true'
    const testerUserId = env.IT_VERIFICATION_TESTER_USER_ID ? Number(env.IT_VERIFICATION_TESTER_USER_ID) : null
    const testerUsername = env.IT_VERIFICATION_TESTER_USERNAME ?? ''
    if (enabled && testerUsername.trim() === '') {
      throw new Error('ItVerification:TesterUsername is required when IT verification is enabled.')
    }
    return {
      enabled,
      testerUserId: testerUserId !== null && Number.isInteger(testerUserId) ? testerUserId : null,
      testerUsername,
    }
  },
})
