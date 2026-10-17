/** Provides the authenticated identity and effective role from the current request. */
export interface ICurrentActorContext {
  readonly userId: number | null
  readonly effectiveRole: string | null
}
