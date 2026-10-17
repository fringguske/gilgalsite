import type { ChangePasswordRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangePasswordRequestDto'
import type { ChangeUsernameRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/ChangeUsernameRequestDto'

export interface ICredentialService {
  changeUsernameAsync(userId: number, request: ChangeUsernameRequestDto): Promise<void>
  changePasswordAsync(userId: number, request: ChangePasswordRequestDto): Promise<void>
  resetAdministratorPasswordAsync(username: string, newPassword: string): Promise<void>
}
