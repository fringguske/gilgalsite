import type { ICurrentActorContext } from '@/ConstructionMS.Application/Services/Auth/ICurrentActorContext'
import { ClaimTypes } from '@/ConstructionMS.Application/Security/ApplicationClaimTypes'
import type { HttpContext } from './HttpContext'

export class HttpCurrentActorContext implements ICurrentActorContext {
  constructor(private readonly httpContext: HttpContext | null) {}

  get userId(): number | null {
    const raw = this.httpContext?.user?.findFirstValue(ClaimTypes.NameIdentifier)
    const userId = raw && /^\d+$/.test(raw) ? Number(raw) : NaN
    return Number.isInteger(userId) && userId > 0 ? userId : null
  }

  get effectiveRole(): string | null {
    return this.httpContext?.user?.findFirstValue(ClaimTypes.Role) ?? null
  }
}
