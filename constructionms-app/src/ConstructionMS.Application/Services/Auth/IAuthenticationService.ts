import type { CurrentUserDto } from '@/ConstructionMS.Application/DTOs/Auth/CurrentUserDto'
import type { LoginRequestDto } from '@/ConstructionMS.Application/DTOs/Auth/LoginRequestDto'

export interface IAuthenticationService {
  authenticateAsync(request: LoginRequestDto): Promise<CurrentUserDto | null>
  getCurrentUserAsync(userId: number, effectiveRole?: string | null): Promise<CurrentUserDto | null>
}
