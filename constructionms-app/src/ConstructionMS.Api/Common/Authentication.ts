import { ClaimTypes, ApplicationClaimTypes } from '@/ConstructionMS.Application/Security/ApplicationClaimTypes'
import { ClaimsPrincipal } from './ClaimsPrincipalExtensions'
import type { HttpContext } from './HttpContext'
import { SessionLifetimeSeconds, createSessionToken, readSessionToken, sessionCookieName } from './SessionCookie'

/** Issues the session cookie (HttpContext.SignInAsync). */
export async function signIn(
  context: HttpContext,
  user: { id: number; fullName: string; email: string; role: string; credentialVersion: number },
): Promise<void> {
  const principal = ClaimsPrincipal.fromUser(user)
  context.responseCookies.push({
    name: sessionCookieName(),
    value: await createSessionToken(principal),
    maxAge: undefined,
  })
  context.user = principal
}

/** Clears the session cookie (HttpContext.SignOutAsync). */
export function signOut(context: HttpContext): void {
  context.responseCookies.push({ name: sessionCookieName(), value: '', maxAge: 0 })
  context.user = null
}

/**
 * Authentication handler. Validates the cookie and then re-checks it against the database
 * on every request (Users.IsActive, actual role, IT-verification configuration and
 * credential version), so deactivation, role changes and password/username changes revoke
 * old sessions immediately. Also slides the 8-hour expiry once half of it has elapsed.
 */
export async function authenticate(context: HttpContext): Promise<void> {
  context.user = null
  const token = context.getCookie(sessionCookieName())
  if (!token) return

  const session = await readSessionToken(token)
  if (!session) return

  const idValue = session.principal.findFirstValue(ClaimTypes.NameIdentifier)
  const versionValue = session.principal.findFirstValue(ApplicationClaimTypes.CredentialVersion)
  if (!idValue || !/^\d+$/.test(idValue) || !versionValue || !/^-?\d+$/.test(versionValue)) {
    signOut(context)
    return
  }

  const userId = Number(idValue)
  const credentialVersion = Number(versionValue)
  const cookieRole = session.principal.findFirstValue(ClaimTypes.Role)
  const currentUser = await context.services.actorRoleResolver.resolveAsync(userId, cookieRole)
  if (!currentUser || currentUser.credentialVersion !== credentialVersion) {
    signOut(context)
    return
  }

  const cookieName = session.principal.findFirstValue(ClaimTypes.Name)
  const cookieEmail = session.principal.findFirstValue(ClaimTypes.Email)
  const profileChanged = cookieName !== currentUser.fullName
    || (cookieEmail ?? '').toLowerCase() !== currentUser.email.toLowerCase()
  const halfLifeElapsed = Date.now() / 1000 - session.issuedAt > SessionLifetimeSeconds / 2

  const principal = profileChanged
    ? ClaimsPrincipal.fromUser({
        id: userId,
        fullName: currentUser.fullName,
        email: currentUser.email,
        role: currentUser.effectiveRole,
        credentialVersion: currentUser.credentialVersion,
      })
    : session.principal
  context.user = principal
  if (profileChanged || halfLifeElapsed) {
    context.responseCookies.push({ name: sessionCookieName(), value: await createSessionToken(principal) })
  }
}
