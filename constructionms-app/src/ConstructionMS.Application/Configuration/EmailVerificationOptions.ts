/**
 * Verification codes are emailed through Resend (https://resend.com). When no API key is set the
 * feature is off: password changes need only the current password, as before.
 */
export interface EmailVerificationOptions {
  enabled: boolean
  /** Env: RESEND_API_KEY (Resend dashboard -> API Keys). */
  apiKey: string
  /**
   * Env: EMAIL_FROM, an address on a domain verified in Resend, optionally with a display name:
   * "Construction Management System <no-reply@example.co.ke>".
   */
  from: string
}

// A bare address, or a display name followed by the address in angle brackets.
const FromPattern = /^(?:[^<>@]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/

export const EmailVerificationOptions = Object.freeze({
  SectionName: 'EmailVerification',
  ApiBaseUrl: 'https://api.resend.com',

  fromEnvironment(env: NodeJS.ProcessEnv = process.env): EmailVerificationOptions {
    const apiKey = env.RESEND_API_KEY?.trim() ?? ''
    const from = env.EMAIL_FROM?.trim() ?? ''
    if (apiKey === '' && from === '') {
      return { enabled: false, apiKey, from }
    }
    if (apiKey === '' || from === '') {
      throw new Error('EmailVerification: set both RESEND_API_KEY and EMAIL_FROM, or neither.')
    }
    if (!FromPattern.test(from)) {
      throw new Error('EmailVerification: EMAIL_FROM must be an address such as "Construction Management System <no-reply@example.co.ke>".')
    }
    return { enabled: true, apiKey, from }
  },
})
