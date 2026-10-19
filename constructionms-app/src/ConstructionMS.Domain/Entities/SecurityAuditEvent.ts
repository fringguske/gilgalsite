export const SecurityAuditEventTypes = Object.freeze({
  UsernameChanged: 'UsernameChanged',
  PasswordChanged: 'PasswordChanged',
  AdministratorPasswordReset: 'AdministratorPasswordReset',
  UserCreated: 'UserCreated',
  UserProfileUpdated: 'UserProfileUpdated',
  UserRoleChanged: 'UserRoleChanged',
  UserActivated: 'UserActivated',
  UserDeactivated: 'UserDeactivated',
  PhoneNumberVerified: 'PhoneNumberVerified',
})

export const SecurityAuditSources = Object.freeze({
  SelfService: 'SelfService',
  ServerRecovery: 'ServerRecovery',
  Administrator: 'Administrator',
})
