export const InvoiceStatuses = Object.freeze({
  PendingReview: 'PendingReview',
  Matched: 'Matched',
  Mismatch: 'Mismatch',
  AwaitingCeoApproval: 'AwaitingCeoApproval',
  ReadyForAuthorization: 'ReadyForAuthorization',
  Authorized: 'Authorized',
  Paid: 'Paid',
  Returned: 'Returned',
  Rejected: 'Rejected',
})

export const PettyCashStatuses = Object.freeze({
  PendingFinanceApproval: 'PendingFinanceApproval',
  Rejected: 'Rejected',
  Approved: 'Approved',
  Disbursed: 'Disbursed',
  ReconciliationSubmitted: 'ReconciliationSubmitted',
  Reconciled: 'Reconciled',
})

export const PettyCashReconciliationStatuses = Object.freeze({
  PendingReview: 'PendingReview',
  Approved: 'Approved',
  Returned: 'Returned',
})
