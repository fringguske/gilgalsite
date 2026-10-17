/** Safe user projection. Password hashes are deliberately absent. */
export interface UserResponseDto {
  id: number
  username: string
  fullName: string
  email: string
  phoneNumber: string
  isActive: boolean
  createdAt: Date
  roleId: number
  roleName: string
}
