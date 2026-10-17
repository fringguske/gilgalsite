import { dto, f, utf8ByteCount, validationResult, type InferDto, type ValidationResult } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'
import { EmailAddressMessage, EmailAddressPattern } from '../Auth/RegisterAccessRequestDto'

/**
 * [Phone]: digits (at least one), whitespace and "-.()" with optional leading/embedded '+',
 * optionally followed by an extension ("ext.", "ext" or "x" plus digits).
 */
export const PhonePattern = '(?=[\\d\\s\\-.()+]*\\d)[\\d\\s\\-.()+]*(?:(?:[eE][xX][tT]\\.?|[xX])\\s*\\d+)?\\s*'
export const PhoneMessage = (name: string) => `The ${name} field is not a valid phone number.`

/** Request body for POST /api/users. The caller supplies a password that is securely hashed. */
export const CreateUserRequestDto = dto({
  username: f.string().required().stringLength(50, 3).regex('^[a-zA-Z0-9][a-zA-Z0-9._-]*$'),
  fullName: f.string().required().stringLength(150, 2),
  email: f.string().required().stringLength(254).regex(EmailAddressPattern, EmailAddressMessage('Email')),
  phoneNumber: f.string().required().stringLength(30).regex(PhonePattern, PhoneMessage('PhoneNumber')),
  password: f.string().required().stringLength(72, 12),
  roleId: f.int().range(1, INT_MAX),
}, (v) => {
  const results: ValidationResult[] = []
  if (v.password !== null && utf8ByteCount(v.password) > 72) {
    results.push(validationResult('Password cannot exceed 72 UTF-8 bytes.', ['Password']))
  }
  return results
})
export type CreateUserRequestDto = InferDto<typeof CreateUserRequestDto>
