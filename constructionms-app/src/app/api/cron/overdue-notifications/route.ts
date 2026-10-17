import { timingSafeEqual } from 'node:crypto'
import { OverdueNotificationWorker } from '@/ConstructionMS.Api/Workers/OverdueNotificationWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; any other scheduler must do the same. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new Response(null, { status: 401 })
  }

  try {
    const inserted = await OverdueNotificationWorker.runSweepAsync()
    return Response.json({ inserted }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Overdue in-app notification generation failed.' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
