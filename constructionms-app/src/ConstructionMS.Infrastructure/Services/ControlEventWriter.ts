import { createHash } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { AppDbContext, DbExecutor } from '../Data/AppDbContext'
import { controlEvents } from '../Data/schema'

export type ControlEvent = typeof controlEvents.$inferSelect

export interface AppendControlEventArgs {
  chainKey: string
  requisitionId: number | null
  projectId: number
  entityType: string
  entityId: number
  referenceNumber: string
  eventType: string
  actorUserId: number
  actorRole: string
  /** Serialized like System.Text.Json defaults: pass PascalCase keys, e.g. { Quantity: 5 }. */
  details: object | null
  occurredAt: Date
}

/** .NET DateTime.ToString("O") for a UTC value: 2026-08-09T10:15:30.1230000Z */
export function toRoundTripString(value: Date): string {
  return value.toISOString().replace(/\.(\d{3})Z$/, '.$10000Z')
}

/**
 * Appends a SHA-256-linked control event. Unlike the EF version (which added to the
 * change tracker), the row is inserted immediately, so call it with the open
 * transaction of the workflow command it belongs to.
 */
export class ControlEventWriter {
  constructor(private readonly db: AppDbContext) {}

  async appendAsync(args: AppendControlEventArgs, executor: DbExecutor = this.db): Promise<ControlEvent> {
    const [previous] = await executor
      .select({ sequenceNumber: controlEvents.sequenceNumber, eventHash: controlEvents.eventHash })
      .from(controlEvents)
      .where(eq(controlEvents.chainKey, args.chainKey))
      .orderBy(desc(controlEvents.sequenceNumber))
      .limit(1)
    const sequence = (previous?.sequenceNumber ?? 0) + 1
    const detailsJson = args.details === null ? null : JSON.stringify(args.details)
    const canonical = [
      args.chainKey,
      String(sequence),
      args.requisitionId === null ? '' : String(args.requisitionId),
      String(args.projectId),
      args.entityType,
      String(args.entityId),
      args.referenceNumber,
      args.eventType,
      String(args.actorUserId),
      args.actorRole,
      toRoundTripString(args.occurredAt),
      detailsJson ?? '',
      previous?.eventHash ?? '',
    ].join('\u001f')

    const [item] = await executor
      .insert(controlEvents)
      .values({
        chainKey: args.chainKey,
        sequenceNumber: sequence,
        requisitionId: args.requisitionId,
        projectId: args.projectId,
        entityType: args.entityType,
        entityId: args.entityId,
        referenceNumber: args.referenceNumber,
        eventType: args.eventType,
        actorUserId: args.actorUserId,
        actorRole: args.actorRole,
        detailsJson: args.details,
        occurredAt: args.occurredAt,
        previousEventHash: previous?.eventHash ?? null,
        eventHash: createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase(),
      })
      .returning()
    return item!
  }
}
