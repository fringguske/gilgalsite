/** Source records that may own uploaded evidence. The allowlist is deliberately closed so a client cannot invent an entity name and bypass source-level access. */
export const EvidenceSourceTypes = Object.freeze({
  ProjectProgressVerification: 'ProjectProgressVerification',
  GoodsReceipt: 'GoodsReceipt',
  GoodsReceiptTechnicalAcceptance: 'GoodsReceiptTechnicalAcceptance',
  MaterialUsageRecord: 'MaterialUsageRecord',
  SupplierInvoice: 'SupplierInvoice',
  Payment: 'Payment',
  PettyCashDisbursement: 'PettyCashDisbursement',
  PettyCashReconciliation: 'PettyCashReconciliation',
  OpeningPositionBatch: 'OpeningPositionBatch',
  MaterialReturn: 'MaterialReturn',
  MaterialReturnReceipt: 'MaterialReturnReceipt',
  MaterialIssueDisputeResolution: 'MaterialIssueDisputeResolution',
  MaterialCustodyCloseout: 'MaterialCustodyCloseout',
  ControlledCorrection: 'ControlledCorrection',
  All: new Set<string>(['ProjectProgressVerification', 'GoodsReceipt', 'GoodsReceiptTechnicalAcceptance', 'MaterialUsageRecord', 'SupplierInvoice', 'Payment', 'PettyCashDisbursement', 'PettyCashReconciliation', 'OpeningPositionBatch', 'MaterialReturn', 'MaterialReturnReceipt', 'MaterialIssueDisputeResolution', 'MaterialCustodyCloseout', 'ControlledCorrection']) as ReadonlySet<string>,
})

export const EvidenceKinds = Object.freeze({
  Photo: 'Photo',
  DeliveryNote: 'DeliveryNote',
  Inspection: 'Inspection',
  Invoice: 'Invoice',
  PaymentProof: 'PaymentProof',
  Receipt: 'Receipt',
  Other: 'Other',
  All: new Set<string>(['Photo', 'DeliveryNote', 'Inspection', 'Invoice', 'PaymentProof', 'Receipt', 'Other']) as ReadonlySet<string>,
})
