/** Canonical states for the material requisition workflow. */
export const RequisitionWorkflowStates = Object.freeze({
  AwaitingTechnicalCheck: 'AwaitingTechnicalCheck',
  AwaitingSupervisorDecision: 'AwaitingSupervisorDecision',
  ReturnedForRevision: 'ReturnedForRevision',
  Approved: 'Approved',
  Rejected: 'Rejected',
  All: new Set<string>(['AwaitingTechnicalCheck', 'AwaitingSupervisorDecision', 'ReturnedForRevision', 'Approved', 'Rejected']) as ReadonlySet<string>,
})
