export const SecurityAuditEventTypes = Object.freeze({
  UsernameChanged: 'UsernameChanged',
  PasswordChanged: 'PasswordChanged',
  AdministratorPasswordReset: 'AdministratorPasswordReset',
  UserCreated: 'UserCreated',
  UserProfileUpdated: 'UserProfileUpdated',
  UserRoleChanged: 'UserRoleChanged',
  UserActivated: 'UserActivated',
  UserDeactivated: 'UserDeactivated',
  EmailVerified: 'EmailVerified',
  PasswordReset: 'PasswordReset',
})

export const SecurityAuditSources = Object.freeze({
  SelfService: 'SelfService',
  ServerRecovery: 'ServerRecovery',
  Administrator: 'Administrator',
})
