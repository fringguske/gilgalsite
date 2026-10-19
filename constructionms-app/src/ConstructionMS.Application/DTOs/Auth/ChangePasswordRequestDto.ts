import { dto, f, utf8ByteCount, validationResult, type InferDto, type ValidationResult } from '@/ConstructionMS.Application/Common/Validation'
import { VerificationCodeMessage, VerificationCodePattern } from './PhoneVerificationDtos'

export const ChangePasswordRequestDto = dto({
  currentPassword: f.string().required().stringLength(72, 1),
  newPassword: f.string().required().stringLength(72, 12),
  confirmNewPassword: f.string().required().compare('newPassword', 'Passwords do not match.'),
  /** The SMS code from POST /auth/change-password/code; required while SMS verification is configured. */
  verificationCode: f.string().nullable().regex(VerificationCodePattern, VerificationCodeMessage),
}, (v) => {
  const results: ValidationResult[] = []
  if (v.currentPassword !== null && utf8ByteCount(v.currentPassword) > 72) {
    results.push(validationResult('Current password cannot exceed 72 UTF-8 bytes.', ['CurrentPassword']))
  }
  if (v.newPassword !== null && utf8ByteCount(v.newPassword) > 72) {
    results.push(validationResult('New password cannot exceed 72 UTF-8 bytes.', ['NewPassword']))
  }
  if (v.confirmNewPassword !== null && utf8ByteCount(v.confirmNewPassword) > 72) {
    results.push(validationResult('Password confirmation cannot exceed 72 UTF-8 bytes.', ['ConfirmNewPassword']))
  }
  return results
})
export type ChangePasswordRequestDto = InferDto<typeof ChangePasswordRequestDto>
