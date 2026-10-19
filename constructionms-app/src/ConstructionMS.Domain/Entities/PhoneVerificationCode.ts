/** What a one-time SMS code authorises. A code is only accepted for the purpose it was sent for. */
export const PhoneVerificationPurposes = Object.freeze({
  ChangePassword: 'ChangePassword',
  VerifyPhoneNumber: 'VerifyPhoneNumber',
  /** Forgotten password: the code alone authorises a new password, so it only goes to confirmed numbers. */
  ResetPassword: 'ResetPassword',
})

export type PhoneVerificationPurpose = typeof PhoneVerificationPurposes[keyof typeof PhoneVerificationPurposes]
