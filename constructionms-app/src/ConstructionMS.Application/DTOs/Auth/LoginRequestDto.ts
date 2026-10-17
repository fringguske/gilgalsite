import { dto, f, utf8ByteCount, validationResult, type InferDto, type ValidationResult } from '@/ConstructionMS.Application/Common/Validation'

export const LoginRequestDto = dto({
  username: f.string().required().stringLength(50, 3).regex('^[a-zA-Z0-9][a-zA-Z0-9._-]*$'),
  password: f.string().required().stringLength(72, 1),
}, (v) => {
  const results: ValidationResult[] = []
  if (v.password !== null && utf8ByteCount(v.password) > 72) {
    results.push(validationResult('Password cannot exceed 72 UTF-8 bytes.', ['Password']))
  }
  return results
})
export type LoginRequestDto = InferDto<typeof LoginRequestDto>
