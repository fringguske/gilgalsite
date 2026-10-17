export const OpeningPositionTypes = Object.freeze({
  Inventory: 'Inventory',
  Cash: 'Cash',
})

export const OpeningPositionStatuses = Object.freeze({
  AwaitingVerification: 'AwaitingVerification',
  AwaitingApproval: 'AwaitingApproval',
  Approved: 'Approved',
  Rejected: 'Rejected',
})

export const MaterialReturnStatuses = Object.freeze({
  AwaitingReceipt: 'AwaitingReceipt',
  Received: 'Received',
  Rejected: 'Rejected',
})

export const CustodyCloseoutStatuses = Object.freeze({
  AwaitingReview: 'AwaitingReview',
  Approved: 'Approved',
  Returned: 'Returned',
})

export const OperationalPeriodScopes = Object.freeze({
  Inventory: 'Inventory',
  Finance: 'Finance',
})

export const OperationalPeriodStatuses = Object.freeze({
  Open: 'Open',
  AwaitingClose: 'AwaitingClose',
  Closed: 'Closed',
  Returned: 'Returned',
})

export const ControlledCorrectionTypes = Object.freeze({
  Inventory: 'Inventory',
  Finance: 'Finance',
})

export const ControlledCorrectionStatuses = Object.freeze({
  AwaitingApproval: 'AwaitingApproval',
  Approved: 'Approved',
  Rejected: 'Rejected',
})
