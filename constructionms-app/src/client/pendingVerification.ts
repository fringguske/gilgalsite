/**
 * Remembers, for this browser tab only, that an SMS code was sent and which step it unlocks.
 * Phones often reload a background tab while its owner reads the code in their messages app;
 * without this they come back to the first step and have to ask for another code. Only what
 * was already on screen is kept: never a password, and never the code.
 */
export type PendingVerification =
  | { flow: 'ResetPasswordSignIn'; username: string; expiresAt: string }
  | { flow: 'ChangePassword'; username: string; forgotCurrentPassword: boolean; sentTo: string; expiresAt: string }
  | { flow: 'ConfirmPhoneNumber'; username: string; sentTo: string; expiresAt: string }

type Flow = PendingVerification['flow']

const StorageKey = 'constructionms:pending-verification'
// Matches CodeLifetimeMs in PhoneVerificationService. The server still decides whether a code works.
const CodeLifetimeMs = 10 * 60_000
const timeFormat = new Intl.DateTimeFormat('en-KE', { hour: '2-digit', minute: '2-digit' })

export const PendingVerification = Object.freeze({
  save(value: PendingVerification): void {
    try { sessionStorage.setItem(StorageKey, JSON.stringify(value)) } catch { /* storage blocked: the step just won't survive a reload */ }
  },

  /** The pending step for this flow, if its code has not expired; for a signed-in flow, only the same account's. */
  read<F extends Flow>(flow: F, username?: string): Extract<PendingVerification, { flow: F }> | null {
    let value: PendingVerification | null = null
    try { value = JSON.parse(sessionStorage.getItem(StorageKey) ?? 'null') as PendingVerification | null } catch { return null }
    if (!value || value.flow !== flow || (username !== undefined && value.username !== username)) return null
    if (!(new Date(value.expiresAt).getTime() > Date.now())) {
      PendingVerification.clear()
      return null
    }
    return value as Extract<PendingVerification, { flow: F }>
  },

  clear(): void {
    try { sessionStorage.removeItem(StorageKey) } catch { /* nothing was stored */ }
  },

  /** For requests whose response does not say when the code expires. */
  expiresAtFromNow(): string {
    return new Date(Date.now() + CodeLifetimeMs).toISOString()
  },

  formatExpiry(expiresAt: string): string {
    return timeFormat.format(new Date(expiresAt))
  },
})
