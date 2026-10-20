/** What a one-time emailed code authorises. A code is only accepted for the purpose it was sent for. */
export const EmailVerificationPurposes = Object.freeze({
  ChangePassword: 'ChangePassword',
  VerifyEmail: 'VerifyEmail',
  /** Forgotten password: the code alone authorises a new password, so it only goes to confirmed addresses. */
  ResetPassword: 'ResetPassword',
})

export type EmailVerificationPurpose = typeof EmailVerificationPurposes[keyof typeof EmailVerificationPurposes]
