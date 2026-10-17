import { dto, f, type InferDto } from '../../Common/Validation'

/**
 * [Phone] (System.ComponentModel.DataAnnotations.PhoneAttribute): digits, whitespace and
 * "-.()+" with at least one digit, optionally followed by an extension ("x", "ext", "ext.").
 */
export const PhonePattern = '[\\d\\s\\-.()+]*\\d[\\d\\s\\-.()+]*(?:(?:[eE][xX][tT]\\.?|[xX])\\s*\\d+)?'
/** [EmailAddress]: exactly one '@', neither first nor last. */
export const EmailAddressPattern = '[^@]+@[^@]+'

export const phoneMessage = (name: string) => `The ${name} field is not a valid phone number.`
export const emailMessage = (name: string) => `The ${name} field is not a valid e-mail address.`

export const CreateSupplierOnboardingRequestDto = dto({
  name: f.string().required().stringLength(200, 2),
  contactPerson: f.string().required().stringLength(150, 2),
  phoneNumber: f.string().required().stringLength(30, 7).regex(PhonePattern, phoneMessage('PhoneNumber')),
  email: f.string().nullable().stringLength(254).regex(EmailAddressPattern, emailMessage('Email')),
  kraPin: f.string().required().stringLength(20, 5),
  mpesaNumber: f.string().nullable().stringLength(30).regex(PhonePattern, phoneMessage('MpesaNumber')),
  category: f.string().required().stringLength(100, 2),
})
export type CreateSupplierOnboardingRequestDto = InferDto<typeof CreateSupplierOnboardingRequestDto>

export const ReviewSupplierOnboardingRequestDto = dto({
  approve: f.bool(),
  notes: f.string().required().stringLength(1_000, 3),
})
export type ReviewSupplierOnboardingRequestDto = InferDto<typeof ReviewSupplierOnboardingRequestDto>

export interface SupplierOnboardingResponseDto {
  id: number
  requestNumber: string
  name: string
  contactPerson: string
  phoneNumber: string
  email: string | null
  kraPin: string
  mpesaNumber: string | null
  category: string
  status: string
  submittedByUserId: number
  submittedByName: string
  submittedAt: Date
  reviewedByUserId: number | null
  reviewedByName: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
  approvedSupplierId: number | null
}
