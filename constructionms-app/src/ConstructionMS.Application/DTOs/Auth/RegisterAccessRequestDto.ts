import { dto, f, utf8ByteCount, validationResult, type InferDto, type ValidationResult } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'

/** [EmailAddress]: .NET 8 accepts one '@' that is neither first nor last. */
export const EmailAddressPattern = '[^@]+@[^@]+'
export const EmailAddressMessage = (name: string) => `The ${name} field is not a valid e-mail address.`

export const RegisterAccessRequestDto = dto({
  email: f.string().required().stringLength(254).regex(EmailAddressPattern, EmailAddressMessage('Email')),
  /** Normalised to E.164 by the service, which explains the accepted formats when it is not a mobile number. */
  phoneNumber: f.string().required().stringLength(30),
  username: f.string().required().stringLength(50, 3).regex('^[a-zA-Z0-9][a-zA-Z0-9._-]*$'),
  password: f.string().required().stringLength(72, 12),
  confirmPassword: f.string().required().compare('password', 'Passwords do not match.'),
}, (v) => {
  const results: ValidationResult[] = []
  if (v.password !== null && utf8ByteCount(v.password) > 72) {
    results.push(validationResult('Password cannot exceed 72 UTF-8 bytes.', ['Password']))
  }
  if (v.confirmPassword !== null && utf8ByteCount(v.confirmPassword) > 72) {
    results.push(validationResult('Password confirmation cannot exceed 72 UTF-8 bytes.', ['ConfirmPassword']))
  }
  return results
})
export type RegisterAccessRequestDto = InferDto<typeof RegisterAccessRequestDto>

export interface AccessRequestResponseDto {
  id: number
  username: string
  email: string
  /** Null for requests made before phone numbers were collected. */
  phoneNumber: string | null
  status: string
  requestedAt: Date
  reviewedAt: Date | null
  reviewedByName: string | null
  approvedUserId: number | null
  decisionNote: string | null
}

export const ApproveAccessRequestDto = dto({
  roleId: f.int().range(1, INT_MAX),
  projectIds: f.list(f.int()),
})
export type ApproveAccessRequestDto = InferDto<typeof ApproveAccessRequestDto>

export const RejectAccessRequestDto = dto({
  reason: f.string().required().stringLength(500, 3),
})
export type RejectAccessRequestDto = InferDto<typeof RejectAccessRequestDto>
