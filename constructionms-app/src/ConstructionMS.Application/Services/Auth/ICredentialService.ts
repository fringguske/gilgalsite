import type { ChangePasswordRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangePasswordRequestDto'
import type { ChangeUsernameRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangeUsernameRequestDto'
import type {
  ChangePhoneNumberRequestDto, ConfirmPhoneNumberRequestDto, ResetPasswordRequestDto, SendPasswordChangeCodeRequestDto,
  SendPasswordResetCodeRequestDto, VerificationCodeSentDto,
} from '@/ConstructionMS.Application/DTOs/Auth/PhoneVerificationDtos'

export interface ICredentialService {
  changeUsernameAsync(userId: number, request: ChangeUsernameRequestDto): Promise<void>
  sendPasswordChangeCodeAsync(userId: number, request: SendPasswordChangeCodeRequestDto): Promise<VerificationCodeSentDto>
  changePasswordAsync(userId: number, request: ChangePasswordRequestDto): Promise<void>
  startPhoneNumberChangeAsync(userId: number, request: ChangePhoneNumberRequestDto): Promise<VerificationCodeSentDto>
  confirmPhoneNumberAsync(userId: number, request: ConfirmPhoneNumberRequestDto): Promise<void>
  /** Anonymous; reveals nothing about whether the account exists or has a confirmed number. */
  sendPasswordResetCodeAsync(request: SendPasswordResetCodeRequestDto): Promise<void>
  resetPasswordAsync(request: ResetPasswordRequestDto): Promise<void>
  resetAdministratorPasswordAsync(username: string, newPassword: string): Promise<void>
}
