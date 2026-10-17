import { dto, f, type InferDto } from '../../Common/Validation'

/** Explicitly sets whether a supplier is blocked from procurement. */
export const SetSupplierBlacklistRequestDto = dto({
  isBlacklisted: f.bool(),
})
export type SetSupplierBlacklistRequestDto = InferDto<typeof SetSupplierBlacklistRequestDto>
