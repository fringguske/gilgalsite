import { UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import { ApplicationClaimTypes, ClaimTypes } from '@/ConstructionMS.Application/Security/ApplicationClaimTypes'

/** The authenticated cookie principal: a flat claim map, like ClaimsPrincipal.FindFirstValue. */
export class ClaimsPrincipal {
  constructor(readonly claims: Readonly<Record<string, string>>) {}

  findFirstValue(type: string): string | null {
    return this.claims[type] ?? null
  }

  isInRole(role: string): boolean {
    return this.claims[ClaimTypes.Role] === role
  }

  static fromUser(user: { id: number; fullName: string; email: string; role: string; credentialVersion: number }): ClaimsPrincipal {
    return new ClaimsPrincipal({
      [ClaimTypes.NameIdentifier]: String(user.id),
      [ClaimTypes.Name]: user.fullName,
      [ClaimTypes.Email]: user.email,
      [ClaimTypes.Role]: user.role,
      [ApplicationClaimTypes.CredentialVersion]: String(user.credentialVersion),
    })
  }
}

export function getRequiredUserId(principal: ClaimsPrincipal | null): number {
  const rawUserId = principal?.findFirstValue(ClaimTypes.NameIdentifier)
  const userId = rawUserId && /^\d+$/.test(rawUserId) ? Number(rawUserId) : NaN
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new UnauthorizedAccessError('The authenticated user identity is invalid.')
  }

  return userId
}

export function getRequiredRole(principal: ClaimsPrincipal | null): string {
  const role = principal?.findFirstValue(ClaimTypes.Role)
  if (!role || role.trim() === '') {
    throw new UnauthorizedAccessError('The authenticated role is invalid.')
  }

  return role
}
