import { SignJWT, jwtVerify } from 'jose'
import { ClaimsPrincipal } from './ClaimsPrincipalExtensions'

/**
 * Replacement for ASP.NET cookie authentication. The principal's claims are stored
 * in an HTTP-only, SameSite=Strict JWT (HS256) signed with AUTH_SECRET; 8-hour
 * sliding expiry. Per-request revalidation against the database lives in
 * Authentication.ts (the OnValidatePrincipal equivalent).
 */
export const SessionLifetimeSeconds = 8 * 60 * 60

export function sessionCookieName(): string {
  // __Host- prefix requires Secure + Path=/ + no Domain; used everywhere except local dev.
  return process.env.NODE_ENV === 'production' ? '__Host-ConstructionMS.Auth' : 'ConstructionMS.Auth'
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set to a random value of at least 32 characters.')
  }
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(principal: ClaimsPrincipal): Promise<string> {
  return new SignJWT({ ...principal.claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SessionLifetimeSeconds}s`)
    .sign(secretKey())
}

export async function readSessionToken(token: string): Promise<{ principal: ClaimsPrincipal; issuedAt: number } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    const claims: Record<string, string> = {}
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string') claims[key] = value
    }
    return { principal: new ClaimsPrincipal(claims), issuedAt: payload.iat ?? 0 }
  } catch {
    return null
  }
}
