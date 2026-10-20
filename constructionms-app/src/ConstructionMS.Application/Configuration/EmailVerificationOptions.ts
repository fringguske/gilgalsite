/**
 * Verification codes are emailed over SMTP, so any provider works: Gmail with an app password,
 * Google Workspace, Resend, Brevo and so on. When none of the SMTP settings is set the feature is
 * off: password changes need only the current password, as before.
 */
export interface EmailVerificationOptions {
  enabled: boolean
  /** Env: SMTP_HOST, e.g. smtp.gmail.com. */
  host: string
  /** Env: SMTP_PORT: 465 (TLS from the start, the default) or 587 (STARTTLS). */
  port: number
  /** Env: SMTP_USER, e.g. the Gmail address. */
  user: string
  /** Env: SMTP_PASSWORD; for Gmail an app password, not the account password. */
  password: string
  /** Env: EMAIL_FROM; defaults to "Construction Management System <SMTP_USER>" when SMTP_USER is an address. */
  from: string
}

const DefaultSenderName = 'Construction Management System'
const AddressPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/
// A bare address, or a display name followed by the address in angle brackets.
const FromPattern = /^(?:[^<>@]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/

export const EmailVerificationOptions = Object.freeze({
  SectionName: 'EmailVerification',
  DefaultPort: 465,

  fromEnvironment(env: NodeJS.ProcessEnv = process.env): EmailVerificationOptions {
    const host = env.SMTP_HOST?.trim() ?? ''
    const user = env.SMTP_USER?.trim() ?? ''
    let password = env.SMTP_PASSWORD ?? ''
    const portText = env.SMTP_PORT?.trim() ?? ''
    const fromText = env.EMAIL_FROM?.trim() ?? ''
    if ([host, user, password, portText, fromText].every(value => value === '')) {
      return { enabled: false, host, port: EmailVerificationOptions.DefaultPort, user, password, from: '' }
    }
    if (host === '' || user === '' || password === '') {
      throw new Error('EmailVerification: set SMTP_HOST, SMTP_USER and SMTP_PASSWORD together, or none of the SMTP settings.')
    }

    const port = portText === '' ? EmailVerificationOptions.DefaultPort : Number(portText)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      throw new Error('EmailVerification: SMTP_PORT must be a port number such as 465 or 587.')
    }
    // Google shows app passwords in groups of four; the spaces are not part of the password.
    if (host.toLowerCase() === 'smtp.gmail.com') {
      password = password.replace(/\s+/g, '')
    }
    const from = fromText || (AddressPattern.test(user) ? `${DefaultSenderName} <${user}>` : '')
    if (!FromPattern.test(from)) {
      throw new Error('EmailVerification: set EMAIL_FROM to an address such as "Construction Management System <no-reply@example.co.ke>".')
    }
    return { enabled: true, host, port, user, password, from }
  },
})
