import { dto, f, type InferDto } from '../../Common/Validation'
import { EmailAddressPattern, PhonePattern, emailMessage, phoneMessage } from './SupplierOnboardingDtos'

/**
 * Request body for PUT /api/suppliers/{id}.
 * Blacklist state is changed through a separate explicit operation.
 */
export const UpdateSupplierRequestDto = dto({
  name: f.string().required().stringLength(200, 2),
  contactPerson: f.string().nullable().stringLength(150),
  phoneNumber: f.string().nullable().stringLength(30).regex(PhonePattern, phoneMessage('PhoneNumber')),
  email: f.string().nullable().stringLength(254).regex(EmailAddressPattern, emailMessage('Email')),
  kraPin: f.string().nullable().stringLength(20),
  mpesaNumber: f.string().nullable().stringLength(30).regex(PhonePattern, phoneMessage('MpesaNumber')),
  category: f.string().nullable().stringLength(100),
})
export type UpdateSupplierRequestDto = InferDto<typeof UpdateSupplierRequestDto>
