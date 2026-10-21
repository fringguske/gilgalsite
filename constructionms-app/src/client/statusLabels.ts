/**
 * Status text that says who has to act next ("Waiting for Supervisor") instead of a bare
 * "Awaiting review". Finished states fall back to their own name, split into words.
 */
const waitingLabels = {
  OpeningPosition: {
    AwaitingVerification: 'Waiting for Supervisor',
    AwaitingApproval: 'Waiting for CEO',
  },
  OperationalPeriod: {
    AwaitingClose: 'Waiting for CEO',
  },
  ControlledCorrection: {
    AwaitingApproval: 'Waiting for CEO',
  },
  SupplierInvoice: {
    PendingReview: 'Waiting for Finance Officer',
    Mismatch: 'Mismatch, back to Procurement Officer',
    AwaitingCeoApproval: 'Waiting for CEO',
    ReadyForAuthorization: 'Waiting for Supervisor',
    Authorized: 'Waiting for Finance Officer to pay',
    Returned: 'Returned to Procurement Officer',
  },
  PettyCash: {
    PendingFinanceApproval: 'Waiting for Finance Officer',
    Approved: 'Waiting for Finance Officer to pay out',
    Disbursed: 'Waiting for Supervisor',
    ReconciliationSubmitted: 'Waiting for Finance Officer',
    Reconciled: 'Accounted for',
  },
  MaterialCatalogRequest: {
    Pending: 'Waiting for Procurement Officer',
  },
} satisfies Record<string, Record<string, string>>

export type StatusRecord = keyof typeof waitingLabels

export function statusText(record: StatusRecord, status: string): string {
  const labels: Record<string, string> = waitingLabels[record]
  return labels[status] ?? status.replaceAll(/([A-Z])/g, ' $1').trim()
}

/** A returned period goes back to whoever submitted it: the Supervisor for stock, Finance for money. */
export function periodStatusText(status: string, scope: string): string {
  if (status === 'Returned') return `Returned to ${scope === 'Inventory' ? 'Supervisor' : 'Finance Officer'}`
  return statusText('OperationalPeriod', status)
}
