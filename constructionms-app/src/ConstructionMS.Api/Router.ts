import type { ActionDefinition, ActionResult, ControllerBase, ControllerMetadata } from './Common/ControllerBase'
import { ApiResponse } from './Common/ApiResponse'
import { authenticate } from './Common/Authentication'
import { handleException } from './Common/ApiExceptionHandler'
import { HttpContext } from './Common/HttpContext'
import { tryAcquire } from './Common/RateLimiting'
import { ServiceScope } from './Program'
import { AccessRequestsController } from './Controllers/AccessRequestsController'
import { AuthController } from './Controllers/AuthController'
import { ControlWorkspaceController } from './Controllers/ControlWorkspaceController'
import { DashboardController } from './Controllers/DashboardController'
import { EvidenceController } from './Controllers/EvidenceController'
import { FinanceController } from './Controllers/FinanceController'
import { InventoryController } from './Controllers/InventoryController'
import { MaterialCatalogRequestsController } from './Controllers/MaterialCatalogRequestsController'
import { MaterialsController } from './Controllers/MaterialsController'
import { MyTasksController } from './Controllers/MyTasksController'
import { NotificationsController } from './Controllers/NotificationsController'
import { PettyCashController } from './Controllers/PettyCashController'
import { ProjectsController } from './Controllers/ProjectsController'
import { PurchaseOrdersController } from './Controllers/PurchaseOrdersController'
import { RolesController } from './Controllers/RolesController'
import { SourcingRoundsController } from './Controllers/SourcingRoundsController'
import { SuppliersController } from './Controllers/SuppliersController'
import { UserProjectAssignmentsController } from './Controllers/UserProjectAssignmentsController'
import { UsersController } from './Controllers/UsersController'
import { RequisitionsController } from './Controllers/V1/RequisitionsController'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyController = ControllerMetadata<any>

/** MapControllers(): every controller's attribute-routing metadata. */
const controllers: readonly AnyController[] = [
  AccessRequestsController, AuthController, ControlWorkspaceController, DashboardController,
  EvidenceController, FinanceController, InventoryController, MaterialCatalogRequestsController,
  MaterialsController, MyTasksController, NotificationsController, PettyCashController,
  ProjectsController, PurchaseOrdersController, RolesController, SourcingRoundsController,
  SuppliersController, UserProjectAssignmentsController,
  UsersController, RequisitionsController,
]

const constraintPatterns: Record<string, string> = {
  int: '-?\\d+',
  long: '-?\\d+',
  guid: '[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}',
}

interface CompiledRoute {
  controller: AnyController
  action: ActionDefinition<unknown>
  pattern: RegExp
  names: string[]
  literalSegments: number
}

function compile(route: string, template: string): { pattern: RegExp; names: string[]; literalSegments: number } {
  const full = [route, template].filter(Boolean).join('/')
  const names: string[] = []
  let literalSegments = 0
  const source = full.split('/').filter(Boolean).map(segment => {
    const match = /^\{(\w+)(?::(\w+))?\}$/.exec(segment)
    if (!match) {
      literalSegments += 1
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    names.push(match[1]!)
    return `(${(match[2] && constraintPatterns[match[2]]) || '[^/]+'})`
  }).join('/')
  return { pattern: new RegExp(`^/${source}/?$`, 'i'), names, literalSegments }
}

const routes: CompiledRoute[] = controllers
  .flatMap(controller => controller.actions.map(action => ({
    controller,
    action,
    ...compile(controller.route, action.template),
  })))
  // Literal segments beat route parameters (ASP.NET route precedence).
  .sort((a, b) => b.literalSegments - a.literalSegments)

const healthLive = () => ({ kind: 'json', status: 200, body: { status: 'alive' } }) as ActionResult

async function health(scope: ServiceScope): Promise<ActionResult> {
  try {
    const { sql } = await import('drizzle-orm')
    await scope.db.execute(sql`select 1`)
    const [tableCheck] = await scope.db.execute<{ present: boolean }>(
      sql`select to_regclass('public."Users"') is not null as present`)
    if (!tableCheck?.present) {
      return { kind: 'json', status: 503, body: { status: 'not_ready', reason: 'database_schema_missing' } }
    }
    return { kind: 'json', status: 200, body: { status: 'ready' } }
  } catch {
    return { kind: 'json', status: 503, body: { status: 'not_ready', reason: 'database_unavailable' } }
  }
}

function hasRole(required: readonly string[] | undefined, role: string | null): boolean {
  return !required || required.length === 0 || (role !== null && required.includes(role))
}

/** Executes the ASP.NET pipeline for one request and returns the HTTP response. */
export async function handleRequest(request: Request): Promise<Response> {
  const context = new HttpContext(request)
  const cors = corsHeaders(request)
  if (context.method === 'OPTIONS') {
    return new Response(null, { status: cors ? 204 : 404, headers: cors ?? undefined })
  }

  let result: ActionResult
  try {
    result = await dispatch(context)
  } catch (error) {
    result = handleException(context, error)
  }
  const response = toResponse(context, result)
  if (cors) for (const [name, value] of Object.entries(cors)) response.headers.set(name, value)
  return response
}

/**
 * CORS policy "Frontend": only the origins listed in CORS_ALLOWED_ORIGINS (comma separated),
 * with credentials. In production the frontend should reach this API same-origin through the
 * rewrite in constructionms-frontend/vercel.json, so the list is normally empty (no CORS).
 */
function corsHeaders(request: Request): Record<string, string> | null {
  const origin = request.headers.get('origin')
  const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map(item => item.trim()).filter(Boolean)
  if (!origin || !allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    Vary: 'Origin',
  }
}

async function dispatch(context: HttpContext): Promise<ActionResult> {
  const path = context.url.pathname.replace(/^\/api\/v1/i, '') || '/'
  context.services = new ServiceScope(context)

  if (context.method === 'GET' && path.toLowerCase() === '/health/live') return healthLive()
  if (context.method === 'GET' && path.toLowerCase() === '/health') return health(context.services)

  let pathMatched = false
  for (const route of routes) {
    const match = route.pattern.exec(path)
    if (!match) continue
    pathMatched = true
    if (route.action.method !== context.method) continue

    context.routeValues = Object.fromEntries(route.names.map((name, index) => [name, match[index + 1]!]))
    await authenticate(context)

    const anonymous = route.action.allowAnonymous ?? route.controller.allowAnonymous ?? false
    if (!anonymous) {
      if (!context.user) return { kind: 'empty', status: 401 }
      const role = context.user.findFirstValue('role')
      // Class-level and method-level [Authorize(Roles)] are both required (AND).
      if (!hasRole(route.controller.roles, role) || !hasRole(route.action.roles, role)) {
        return { kind: 'empty', status: 403 }
      }
    }

    if (route.action.rateLimit && !tryAcquire(route.action.rateLimit, context)) {
      return { kind: 'empty', status: 429 }
    }

    const controller = route.controller.create(context.services) as ControllerBase
    controller.httpContext = context
    return route.action.handler(controller)
  }

  if (pathMatched) return { kind: 'empty', status: 405 }
  // The fallback policy requires authentication before reporting unknown routes.
  await authenticate(context)
  return context.user ? { kind: 'empty', status: 404 } : { kind: 'empty', status: 401 }
}

function toResponse(context: HttpContext, result: ActionResult): Response {
  const headers = new Headers(context.responseHeaders)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Cache-Control', 'no-store')
  for (const [name, value] of Object.entries(result.headers ?? {})) headers.set(name, value)

  const secure = process.env.NODE_ENV === 'production' || context.isHttps
  for (const cookie of context.responseCookies) {
    const parts = [
      `${cookie.name}=${encodeURIComponent(cookie.value)}`,
      'Path=/', 'HttpOnly', 'SameSite=Strict',
    ]
    if (secure) parts.push('Secure')
    if (cookie.maxAge !== undefined) {
      parts.push(`Max-Age=${cookie.maxAge}`)
      if (cookie.maxAge === 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
    }
    headers.append('Set-Cookie', parts.join('; '))
  }

  switch (result.kind) {
    case 'empty':
      return new Response(null, { status: result.status, headers })
    case 'json':
      headers.set('Content-Type', 'application/json; charset=utf-8')
      return new Response(JSON.stringify(result.body, (_key, value) => (value === undefined ? null : value)), {
        status: result.status,
        headers,
      })
    case 'file':
      headers.set('Content-Type', result.contentType)
      if (result.fileName) {
        headers.set('Content-Disposition', contentDisposition(result.fileName))
      }
      return new Response(Buffer.from(result.content), { status: result.status, headers })
  }
}

/**
 * ASP.NET `File(content, type, fileName)`: `attachment; filename="…"; filename*=UTF-8''…`, where the
 * plain filename is the ASCII-safe fallback (non-ASCII characters become '_').
 */
function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, match => `\\${match}`)
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

export { ApiResponse }
