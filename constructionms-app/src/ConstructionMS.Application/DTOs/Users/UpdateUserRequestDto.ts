import { dto, f, type InferDto } from '@/ConstructionMS.Application/Common/Validation'
import { INT_MAX } from '@/ConstructionMS.Application/Common/Pagination'
import { EmailAddressMessage, EmailAddressPattern } from '../Auth/RegisterAccessRequestDto'
import { PhoneMessage, PhonePattern } from './CreateUserRequestDto'

/** User profile fields; password changes are not accepted here. */
export const UpdateUserRequestDto = dto({
  username: f.string().required().stringLength(50, 3).regex('^[a-zA-Z0-9][a-zA-Z0-9._-]*$'),
  fullName: f.string().required().stringLength(150, 2),
  email: f.string().required().stringLength(254).regex(EmailAddressPattern, EmailAddressMessage('Email')),
  phoneNumber: f.string().required().stringLength(30).regex(PhonePattern, PhoneMessage('PhoneNumber')),
  roleId: f.int().range(1, INT_MAX),
})
export type UpdateUserRequestDto = InferDto<typeof UpdateUserRequestDto>
