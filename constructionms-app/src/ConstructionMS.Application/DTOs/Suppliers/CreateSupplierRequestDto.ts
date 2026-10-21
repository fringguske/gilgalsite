import { CreateSupplierOnboardingRequestDto } from './SupplierOnboardingDtos'

/**
 * Adds a supplier straight to the register, with no separate approval step. It asks for the
 * same details, and applies the same checks, as the supplier application it replaces.
 */
export const CreateSupplierRequestDto = CreateSupplierOnboardingRequestDto
export type CreateSupplierRequestDto = CreateSupplierOnboardingRequestDto
