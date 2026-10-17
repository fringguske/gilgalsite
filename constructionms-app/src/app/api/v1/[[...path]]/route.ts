import { handleRequest } from '@/ConstructionMS.Api/Router'

// Node runtime: bcrypt, node:crypto and the postgres driver are not available on the Edge runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
export const OPTIONS = handleRequest
