/** Safe user projection. Password hashes are deliberately absent. */
export interface UserResponseDto {
  id: number
  username: string
  fullName: string
  email: string
  phoneNumber: string
  emailVerified: boolean
  isActive: boolean
  createdAt: Date
  roleId: number
  roleName: string
}
