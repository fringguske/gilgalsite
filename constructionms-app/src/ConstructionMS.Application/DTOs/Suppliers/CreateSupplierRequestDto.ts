import { dto, f, type InferDto } from '../../Common/Validation'
import { EmailAddressPattern, PhonePattern, emailMessage, phoneMessage } from './SupplierOnboardingDtos'

/** Adds a supplier straight to the register, with no approval step. The KRA PIN is optional. */
export const CreateSupplierRequestDto = dto({
  name: f.string().required().stringLength(200, 2),
  contactPerson: f.string().required().stringLength(150, 2),
  phoneNumber: f.string().required().stringLength(30, 7).regex(PhonePattern, phoneMessage('PhoneNumber')),
  email: f.string().nullable().stringLength(254).regex(EmailAddressPattern, emailMessage('Email')),
  kraPin: f.string().nullable().stringLength(20),
  mpesaNumber: f.string().nullable().stringLength(30).regex(PhonePattern, phoneMessage('MpesaNumber')),
  category: f.string().required().stringLength(100, 2),
})
export type CreateSupplierRequestDto = InferDto<typeof CreateSupplierRequestDto>
