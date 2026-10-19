import { dto, f, utf8ByteCount, validationResult, type InferDto, type ValidationResult } from '@/ConstructionMS.Application/Common/Validation'

export const VerificationCodePattern = '[0-9]{6}'
export const VerificationCodeMessage = 'Enter the 6-digit code from the SMS.'

function currentPasswordBytes(v: { currentPassword: string }): ValidationResult[] {
  return v.currentPassword !== null && utf8ByteCount(v.currentPassword) > 72
    ? [validationResult('Current password cannot exceed 72 UTF-8 bytes.', ['CurrentPassword'])]
    : []
}

/** Step 1 of a password change: proves the current password, then texts a code to the account's phone. */
export const SendPasswordChangeCodeRequestDto = dto({
  currentPassword: f.string().required().stringLength(72, 1),
}, currentPasswordBytes)
export type SendPasswordChangeCodeRequestDto = InferDto<typeof SendPasswordChangeCodeRequestDto>

/** Step 1 of adding a phone number: texts a code to the new number. */
export const ChangePhoneNumberRequestDto = dto({
  phoneNumber: f.string().required().stringLength(30),
  currentPassword: f.string().required().stringLength(72, 1),
}, currentPasswordBytes)
export type ChangePhoneNumberRequestDto = InferDto<typeof ChangePhoneNumberRequestDto>

/** Step 2 of adding a phone number: the code proves the person holds the phone. */
export const ConfirmPhoneNumberRequestDto = dto({
  verificationCode: f.string().required().regex(VerificationCodePattern, VerificationCodeMessage),
})
export type ConfirmPhoneNumberRequestDto = InferDto<typeof ConfirmPhoneNumberRequestDto>

export interface VerificationCodeSentDto {
  /** The number the code went to, masked (+254••••••678). */
  sentTo: string
  expiresAt: Date
  /** Another code cannot be requested before this time. */
  resendAvailableAt: Date
}
