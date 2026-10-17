import { dto, f, utf8ByteCount, validationResult, type InferDto, type ValidationResult } from '@/ConstructionMS.Application/Common/Validation'

export const ChangeUsernameRequestDto = dto({
  newUsername: f.string().required().stringLength(50, 3),
  currentPassword: f.string().required().stringLength(72, 1),
}, (v) => {
  const results: ValidationResult[] = []
  if (v.currentPassword !== null && utf8ByteCount(v.currentPassword) > 72) {
    results.push(validationResult('Current password cannot exceed 72 UTF-8 bytes.', ['CurrentPassword']))
  }
  return results
})
export type ChangeUsernameRequestDto = InferDto<typeof ChangeUsernameRequestDto>
