import type { PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CreateUserRequestDto } from '@/ConstructionMS.Application/DTOs/Users/CreateUserRequestDto'
import type { UpdateUserRequestDto } from '@/ConstructionMS.Application/DTOs/Users/UpdateUserRequestDto'
import type { UserResponseDto } from '@/ConstructionMS.Application/DTOs/Users/UserResponseDto'

/**
 * Business operations for Users.
 * Hard deletion is deliberately unsupported so transaction history retains its actor references.
 */
export interface IUserService {
  /** Returns a paginated list of all users with their role names. */
  getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<UserResponseDto>>
  /** Returns a single user by ID, or null if not found. */
  getByIdAsync(id: number): Promise<UserResponseDto | null>
  /** Creates a new user. The password is hashed before persistence and the hash is never returned. */
  createAsync(dto: CreateUserRequestDto, administratorUserId?: number | null): Promise<UserResponseDto>
  /** Updates user profile fields (not password). Returns null if not found. */
  updateAsync(id: number, dto: UpdateUserRequestDto, administratorUserId: number): Promise<UserResponseDto | null>
  /** Sets the user's active state explicitly. Returns false if not found. */
  setActiveStatusAsync(id: number, isActive: boolean, administratorUserId: number): Promise<boolean>
}
