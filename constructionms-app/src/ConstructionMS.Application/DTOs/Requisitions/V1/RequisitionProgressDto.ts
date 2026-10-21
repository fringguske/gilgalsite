/**
 * Where a material request has reached on its whole journey: approval, buying, delivery,
 * issue to site and custody close-out. Derived from the workflow records on every read,
 * so it never drifts from them.
 */
export interface RequisitionProgressDto {
  /** InProgress until the journey ends; Completed when it finished, Stopped when it was rejected. */
  state: 'InProgress' | 'Completed' | 'Stopped'
  /** One line describing the current position, e.g. "In stock, waiting for the Storekeeper to issue it". */
  headline: string
  /** Who has to act next (a role, or "Supplier"), or null when nothing is waiting. */
  waitingOn: string | null
  /** When the request reached its current position. */
  since: Date
  steps: RequisitionProgressStepDto[]
}

export interface RequisitionProgressStepDto {
  key: string
  label: string
  status: 'Done' | 'Current' | 'Upcoming' | 'Stopped'
  /** The role that carries out this step, or the role being waited on while it is current. */
  role: string
  detail: string | null
  /** Purchase order, delivery, issue or close-out number. */
  reference: string | null
  /** Shown to the CEO and Auditor only, matching the approval history. */
  actorName: string | null
  at: Date | null
  /** Quote deadline or expected delivery: an ISO date (YYYY-MM-DD) or date-time. */
  expectedBy: string | null
}
