export interface AssignedProjectDto {
  id: number
  name: string
}

export interface CurrentUserDto {
  id: number
  username: string
  fullName: string
  email: string
  /** True once a code emailed to the address has been used, so a forgotten password can be reset. */
  emailVerified: boolean
  /** True when SMTP is configured, so password changes need an emailed code. */
  emailVerificationEnabled: boolean
  role: string
  actualRole: string
  canSwitchRoles: boolean
  availableRoles: string[]
  projects: AssignedProjectDto[]
  /** [JsonIgnore] in C#: used to issue the session cookie but never serialized. */
  credentialVersion: number
}

/** Applies [JsonIgnore] on CredentialVersion: the shape that is safe to serialize. */
export type CurrentUserJson = Omit<CurrentUserDto, 'credentialVersion'>

export function toCurrentUserJson(user: CurrentUserDto): CurrentUserJson {
  const { credentialVersion: _credentialVersion, ...json } = user
  return json
}
