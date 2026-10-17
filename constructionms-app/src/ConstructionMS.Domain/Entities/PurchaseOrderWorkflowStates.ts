export const PurchaseOrderWorkflowStates = Object.freeze({
  Draft: 'Draft',
  Submitted: 'Submitted',
  Approved: 'Approved',
  Issued: 'Issued',
  Rejected: 'Rejected',
  Cancelled: 'Cancelled',
  All: new Set<string>(['Draft', 'Submitted', 'Approved', 'Issued', 'Rejected', 'Cancelled']) as ReadonlySet<string>,
  Live: new Set<string>(['Draft', 'Submitted', 'Approved', 'Issued']) as ReadonlySet<string>,
})

export const SourcingRoundWorkflowStates = Object.freeze({
  Open: 'Open',
  Awarded: 'Awarded',
  Closed: 'Closed',
  Cancelled: 'Cancelled',
  All: new Set<string>(['Open', 'Awarded', 'Closed', 'Cancelled']) as ReadonlySet<string>,
})
