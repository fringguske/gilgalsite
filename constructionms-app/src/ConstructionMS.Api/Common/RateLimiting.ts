import { ClaimTypes } from '@/ConstructionMS.Application/Security/ApplicationClaimTypes'
import type { HttpContext } from './HttpContext'

export type RateLimitPolicyName = 'login' | 'evidence-upload' | 'verification-code'

interface Policy {
  permitLimit: number
  windowMs: number
  partitionKey: (context: HttpContext) => string
}

const policies: Record<RateLimitPolicyName, Policy> = {
  login: {
    permitLimit: 5,
    windowMs: 60_000,
    partitionKey: context => context.remoteIpAddress,
  },
  'evidence-upload': {
    permitLimit: 10,
    windowMs: 10 * 60_000,
    partitionKey: context => context.user?.findFirstValue(ClaimTypes.NameIdentifier) ?? context.remoteIpAddress,
  },
  // Slows current-password guessing on the SMS code endpoints; SMS volume itself is capped in the database.
  'verification-code': {
    permitLimit: 10,
    windowMs: 10 * 60_000,
    partitionKey: context => context.user?.findFirstValue(ClaimTypes.NameIdentifier) ?? context.remoteIpAddress,
  },
}

const windows = new Map<string, { startedAt: number; count: number }>()

/**
 * Fixed-window limiter (same limits as the ASP.NET policies). State is per server
 * instance: on Vercel each warm lambda counts independently, so this is a
 * best-effort brake; put Vercel Firewall / Upstash in front for a hard global limit.
 * Returns true when the request is permitted.
 */
export function tryAcquire(policyName: RateLimitPolicyName, context: HttpContext, now = Date.now()): boolean {
  const policy = policies[policyName]
  const key = `${policyName}:${policy.partitionKey(context)}`
  const current = windows.get(key)
  if (!current || now - current.startedAt >= policy.windowMs) {
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (now - v.startedAt >= 600_000) windows.delete(k)
    }
    windows.set(key, { startedAt: now, count: 1 })
    return true
  }

  if (current.count >= policy.permitLimit) return false
  current.count += 1
  return true
}
