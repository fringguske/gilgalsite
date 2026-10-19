/** What a one-time SMS code authorises. A code is only accepted for the purpose it was sent for. */
export const PhoneVerificationPurposes = Object.freeze({
  ChangePassword: 'ChangePassword',
  VerifyPhoneNumber: 'VerifyPhoneNumber',
})

export type PhoneVerificationPurpose = typeof PhoneVerificationPurposes[keyof typeof PhoneVerificationPurposes]
