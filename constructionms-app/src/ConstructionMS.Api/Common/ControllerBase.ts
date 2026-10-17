import Decimal from 'decimal.js'
import { OperationErrorKind, type OperationResult } from '@/ConstructionMS.Application/Common/OperationResult'
import { ModelValidationError, type DtoSchema } from '@/ConstructionMS.Application/Common/Validation'
import { ApiResponse } from './ApiResponse'
import { getRequiredRole, getRequiredUserId, type ClaimsPrincipal } from './ClaimsPrincipalExtensions'
import type { HttpContext, HttpMethod } from './HttpContext'
import type { RateLimitPolicyName } from './RateLimiting'
import type { ServiceScope } from '../Program'

/** What an action returns (IActionResult). */
export type ActionResult =
  | { kind: 'json'; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: 'empty'; status: number; headers?: Record<string, string> }
  | { kind: 'file'; status: number; content: Uint8Array; contentType: string; fileName?: string; headers?: Record<string, string> }

/**
 * Attribute-routing metadata for one action ([HttpGet("{id:int}")], [Authorize(Roles = ...)],
 * [AllowAnonymous], [EnableRateLimiting(...)]). The template is relative to the controller route.
 * Supported constraints: {x:int}, {x:long}, {x:guid}; unconstrained {x} matches one segment.
 */
export interface ActionDefinition<TController> {
  method: HttpMethod
  template: string
  handler: (controller: TController) => Promise<ActionResult>
  /** Roles allowed for this action (in addition to the controller-level requirement). */
  roles?: readonly string[]
  allowAnonymous?: boolean
  rateLimit?: RateLimitPolicyName
}

/** Controller-level metadata ([Route], [Authorize(Roles = ...)], [AllowAnonymous]). */
export interface ControllerMetadata<TController> {
  route: string
  /** Constructor injection: pick this controller's services from the request scope. */
  create: (services: ServiceScope) => TController
  roles?: readonly string[]
  allowAnonymous?: boolean
  actions: readonly ActionDefinition<TController>[]
}

interface QueryNumberOptions<T> {
  defaultValue: T
  /** [Range(min, max)] */
  range?: readonly [number | string, number | string]
}

interface QueryStringOptions {
  /** [StringLength(max)] / [StringLength(max, MinimumLength = min)] */
  stringLength?: readonly [number, number?]
}

function displayRangeError(name: string, range: readonly [number | string, number | string]) {
  return `The field ${name} must be between ${range[0]} and ${range[1]}.`
}

/** Shared base for API controllers (Microsoft.AspNetCore.Mvc.ControllerBase equivalent). */
export abstract class ControllerBase {
  /** Set by the router before the action runs. */
  httpContext!: HttpContext

  protected get user(): ClaimsPrincipal | null {
    return this.httpContext.user
  }

  /** User.GetRequiredUserId() */
  protected currentUserId(): number {
    return getRequiredUserId(this.httpContext.user)
  }

  /** User.GetRequiredRole() */
  protected currentRole(): string {
    return getRequiredRole(this.httpContext.user)
  }

  // ---------------------------------------------------------------- binding

  /** [FromBody] binding + DataAnnotations validation; throws ModelValidationError (400). */
  protected async fromBody<T>(schema: DtoSchema<T>): Promise<T> {
    let raw: unknown
    try {
      raw = await this.httpContext.readJsonAsync()
    } catch {
      throw new ModelValidationError({
        $: ['The JSON value could not be converted to the request type.'],
        request: ['The request field is required.'],
      })
    }
    return schema.bind(raw)
  }

  /** Route value with an {x:int} or {x:long} constraint (already checked by the router). */
  protected routeInt(name: string): number {
    return Number(this.httpContext.routeValues[name])
  }

  protected routeString(name: string): string {
    return this.httpContext.routeValues[name] ?? ''
  }

  /** Route value with a {x:guid} constraint, normalized to lowercase "D" format. */
  protected routeGuid(name: string): string {
    return (this.httpContext.routeValues[name] ?? '').toLowerCase()
  }

  /** [FromQuery] int with an optional default and [Range]. */
  protected queryInt(name: string, options: QueryNumberOptions<number>): number
  protected queryInt(name: string, options: QueryNumberOptions<number | null>): number | null
  protected queryInt(name: string, options: QueryNumberOptions<number | null>): number | null {
    return this.queryNumber(name, options, /^-?\d+$/, 2_147_483_647)
  }

  /** [FromQuery] long with an optional default and [Range]. */
  protected queryLong(name: string, options: QueryNumberOptions<number>): number
  protected queryLong(name: string, options: QueryNumberOptions<number | null>): number | null
  protected queryLong(name: string, options: QueryNumberOptions<number | null>): number | null {
    return this.queryNumber(name, options, /^-?\d+$/, Number.MAX_SAFE_INTEGER)
  }

  /** [FromQuery] decimal with an optional default and [Range]. */
  protected queryDecimal(name: string, options: QueryNumberOptions<number | null>): number | null {
    return this.queryNumber(name, options, /^-?\d+(\.\d+)?$/, Number.MAX_VALUE)
  }

  /** [FromQuery] string with optional [StringLength]. Empty values bind to the default (null). */
  protected queryString(name: string, options: QueryStringOptions & { defaultValue?: string | null } = {}): string | null {
    const raw = this.httpContext.query.get(name)
    if (raw === null || raw === '') return options.defaultValue ?? null
    if (options.stringLength) {
      const [max, min = 0] = options.stringLength
      if (raw.length > max || raw.length < min) {
        throw new ModelValidationError({
          [name]: [min > 0
            ? `The field ${name} must be a string with a minimum length of ${min} and a maximum length of ${max}.`
            : `The field ${name} must be a string with a maximum length of ${max}.`],
        })
      }
    }
    return raw
  }

  /** [FromQuery] bool. */
  protected queryBool(name: string, defaultValue: boolean): boolean
  protected queryBool(name: string, defaultValue: boolean | null): boolean | null
  protected queryBool(name: string, defaultValue: boolean | null): boolean | null {
    const raw = this.httpContext.query.get(name)
    if (raw === null || raw === '') return defaultValue
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
    throw new ModelValidationError({ [name]: [`The value '${raw}' is not valid.`] })
  }

  /** [FromQuery] DateOnly ("YYYY-MM-DD"). */
  protected queryDateOnly(name: string): string | null {
    const raw = this.httpContext.query.get(name)
    if (raw === null || raw === '') return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
      throw new ModelValidationError({ [name]: [`The value '${raw}' is not valid.`] })
    }
    return raw
  }

  /** [FromQuery] DateTime. */
  protected queryDateTime(name: string): Date | null {
    const raw = this.httpContext.query.get(name)
    if (raw === null || raw === '') return null
    const parsed = Date.parse(raw)
    if (Number.isNaN(parsed)) {
      throw new ModelValidationError({ [name]: [`The value '${raw}' is not valid.`] })
    }
    return new Date(parsed)
  }

  private queryNumber(
    name: string,
    options: QueryNumberOptions<number | null>,
    pattern: RegExp,
    limit: number,
  ): number | null {
    const raw = this.httpContext.query.get(name)
    if (raw === null || raw === '') return options.defaultValue
    const trimmed = raw.trim()
    const value = pattern.test(trimmed) ? Number(trimmed) : NaN
    if (!Number.isFinite(value) || Math.abs(value) > limit) {
      throw new ModelValidationError({ [name]: [`The value '${raw}' is not valid.`] })
    }
    if (options.range) {
      const [min, max] = options.range
      if (new Decimal(value).lt(min) || new Decimal(value).gt(max)) {
        throw new ModelValidationError({ [name]: [displayRangeError(name, options.range)] })
      }
    }
    return value
  }

  // ---------------------------------------------------------------- results

  protected ok(body: unknown): ActionResult {
    return { kind: 'json', status: 200, body }
  }

  protected created(location: string | null, body: unknown): ActionResult {
    return { kind: 'json', status: 201, body, headers: location ? { Location: location } : undefined }
  }

  protected noContent(): ActionResult {
    return { kind: 'empty', status: 204 }
  }

  protected badRequest(body: unknown): ActionResult {
    return { kind: 'json', status: 400, body }
  }

  protected unauthorized(body?: unknown): ActionResult {
    return body === undefined ? { kind: 'empty', status: 401 } : { kind: 'json', status: 401, body }
  }

  protected notFound(body?: unknown): ActionResult {
    return body === undefined ? { kind: 'empty', status: 404 } : { kind: 'json', status: 404, body }
  }

  protected conflict(body: unknown): ActionResult {
    return { kind: 'json', status: 409, body }
  }

  protected statusCode(status: number, body?: unknown): ActionResult {
    return body === undefined ? { kind: 'empty', status } : { kind: 'json', status, body }
  }

  protected file(content: Uint8Array, contentType: string, fileName?: string, headers?: Record<string, string>): ActionResult {
    return { kind: 'file', status: 200, content, contentType, fileName, headers }
  }

  /**
   * The ToActionResult(OperationResult<T>) helper that each C# controller declared:
   * Validation → 400, NotFound → 404, Forbidden → 403, Conflict → 409.
   */
  protected toActionResult<T>(result: OperationResult<T>, successStatus = 200): ActionResult {
    if (result.succeeded) {
      return { kind: 'json', status: successStatus, body: ApiResponse.ok(result.value as T) }
    }

    const body = ApiResponse.fail<T>(result.error ?? 'The request could not be completed.')
    switch (result.errorKind) {
      case OperationErrorKind.Validation:
        return this.badRequest(body)
      case OperationErrorKind.NotFound:
        return this.notFound(body)
      case OperationErrorKind.Forbidden:
        return this.statusCode(403, body)
      case OperationErrorKind.Conflict:
        return this.conflict(body)
      default:
        return this.statusCode(500, body)
    }
  }
}
