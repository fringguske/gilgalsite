import { dto, f, utf8ByteCount, validationResult, type InferDto, type ValidationResult } from '@/ConstructionMS.Application/Common/Validation'
import { EmailAddressMessage, EmailAddressPattern } from './RegisterAccessRequestDto'

export const VerificationCodePattern = '[0-9]{6}'
export const VerificationCodeMessage = 'Enter the 6-digit code from the email.'

function currentPasswordBytes(v: { currentPassword: string }): ValidationResult[] {
  return v.currentPassword !== null && utf8ByteCount(v.currentPassword) > 72
    ? [validationResult('Current password cannot exceed 72 UTF-8 bytes.', ['CurrentPassword'])]
    : []
}

/** Step 1 of a password change: proves the current password, then emails a code to the account's address. */
export const SendPasswordChangeCodeRequestDto = dto({
  currentPassword: f.string().required().stringLength(72, 1),
}, currentPasswordBytes)
export type SendPasswordChangeCodeRequestDto = InferDto<typeof SendPasswordChangeCodeRequestDto>

/** Step 1 of confirming an email address (which may correct the one on file): emails a code to it. */
export const ChangeEmailRequestDto = dto({
  email: f.string().required().stringLength(254).regex(EmailAddressPattern, EmailAddressMessage('Email')),
  currentPassword: f.string().required().stringLength(72, 1),
}, currentPasswordBytes)
export type ChangeEmailRequestDto = InferDto<typeof ChangeEmailRequestDto>

/** Step 2 of confirming an email address: the code proves the person reads that inbox. */
export const ConfirmEmailRequestDto = dto({
  verificationCode: f.string().required().regex(VerificationCodePattern, VerificationCodeMessage),
})
export type ConfirmEmailRequestDto = InferDto<typeof ConfirmEmailRequestDto>

const UsernamePattern = '^[a-zA-Z0-9][a-zA-Z0-9._-]*$'

/** Forgotten password, step 1: emails a code to the account's confirmed address, if it has one. */
export const SendPasswordResetCodeRequestDto = dto({
  username: f.string().required().stringLength(50, 3).regex(UsernamePattern),
})
export type SendPasswordResetCodeRequestDto = InferDto<typeof SendPasswordResetCodeRequestDto>

/** Forgotten password, step 2: the emailed code replaces the current password. */
export const ResetPasswordRequestDto = dto({
  username: f.string().required().stringLength(50, 3).regex(UsernamePattern),
  verificationCode: f.string().required().regex(VerificationCodePattern, VerificationCodeMessage),
  newPassword: f.string().required().stringLength(72, 12),
  confirmNewPassword: f.string().required().compare('newPassword', 'Passwords do not match.'),
}, (v) => {
  const results: ValidationResult[] = []
  if (v.newPassword !== null && utf8ByteCount(v.newPassword) > 72) {
    results.push(validationResult('New password cannot exceed 72 UTF-8 bytes.', ['NewPassword']))
  }
  if (v.confirmNewPassword !== null && utf8ByteCount(v.confirmNewPassword) > 72) {
    results.push(validationResult('Password confirmation cannot exceed 72 UTF-8 bytes.', ['ConfirmNewPassword']))
  }
  return results
})
export type ResetPasswordRequestDto = InferDto<typeof ResetPasswordRequestDto>

export interface VerificationCodeSentDto {
  /** The address the code went to. */
  sentTo: string
  expiresAt: Date
  /** Another code cannot be requested before this time. */
  resendAvailableAt: Date
}
