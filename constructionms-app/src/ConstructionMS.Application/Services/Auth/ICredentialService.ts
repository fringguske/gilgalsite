import type { ChangePasswordRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangePasswordRequestDto'
import type { ChangeUsernameRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangeUsernameRequestDto'
import type {
  ChangeEmailRequestDto, ConfirmEmailRequestDto, ResetPasswordRequestDto, SendPasswordChangeCodeRequestDto,
  SendPasswordResetCodeRequestDto, VerificationCodeSentDto,
} from '@/ConstructionMS.Application/DTOs/Auth/EmailVerificationDtos'

export interface ICredentialService {
  changeUsernameAsync(userId: number, request: ChangeUsernameRequestDto): Promise<void>
  sendPasswordChangeCodeAsync(userId: number, request: SendPasswordChangeCodeRequestDto): Promise<VerificationCodeSentDto>
  changePasswordAsync(userId: number, request: ChangePasswordRequestDto): Promise<void>
  startEmailConfirmationAsync(userId: number, request: ChangeEmailRequestDto): Promise<VerificationCodeSentDto>
  confirmEmailAsync(userId: number, request: ConfirmEmailRequestDto): Promise<void>
  /** Anonymous; reveals nothing about whether the account exists or has a confirmed address. */
  sendPasswordResetCodeAsync(request: SendPasswordResetCodeRequestDto): Promise<void>
  resetPasswordAsync(request: ResetPasswordRequestDto): Promise<void>
  resetAdministratorPasswordAsync(username: string, newPassword: string): Promise<void>
}
