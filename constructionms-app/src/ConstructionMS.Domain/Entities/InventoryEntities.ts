export const MaterialIssueStatuses = Object.freeze({
  AwaitingConfirmation: 'AwaitingConfirmation',
  Confirmed: 'Confirmed',
  Disputed: 'Disputed',
})

export const StockTransferStatuses = Object.freeze({
  PendingDispatch: 'PendingDispatch',
  InTransit: 'InTransit',
  Received: 'Received',
  Disputed: 'Disputed',
  Resolved: 'Resolved',
})

export const StockTransferResolutionDispositions = Object.freeze({
  AcceptedLoss: 'AcceptedLoss',
  RecoveredAtDestination: 'RecoveredAtDestination',
  ReturnedToSource: 'ReturnedToSource',
})

export const StockCountStatuses = Object.freeze({
  AwaitingReview: 'AwaitingReview',
  Approved: 'Approved',
  Rejected: 'Rejected',
})

export const TechnicalAcceptanceOutcomes = Object.freeze({
  Accepted: 'Accepted',
  Rejected: 'Rejected',
})
