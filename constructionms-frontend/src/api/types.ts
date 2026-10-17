export type IsoDate = string
export type IsoDateTime = string

export type ConstructionRole =
  | 'Administrator'
  | 'CEO'
  | 'Supervisor'
  | 'Engineer'
  | 'Foreman'
  | 'Storekeeper'
  | 'Procurement Officer'
  | 'Finance Officer'
  | 'Auditor'

export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
}

export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PageQuery {
  page?: number
  pageSize?: number
}

export interface AssignedProject {
  id: number
  name: string
}

export interface CurrentUser {
  id: number
  username: string
  fullName: string
  email: string
  role: ConstructionRole
  actualRole: ConstructionRole
  canSwitchRoles: boolean
  availableRoles: ConstructionRole[]
  projects: AssignedProject[]
}

export interface UserAccount {
  id: number
  username: string
  fullName: string
  email: string
  phoneNumber: string
  isActive: boolean
  createdAt: IsoDateTime
  roleId: number
  roleName: ConstructionRole
}

export interface SetUserActiveRequest {
  isActive: boolean
}

export interface LoginRequest {
  username: string
  password: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

export interface ChangeUsernameRequest {
  newUsername: string
  currentPassword: string
}

export interface RegisterAccessRequest {
  email: string
  username: string
  password: string
  confirmPassword: string
}

export interface AccessRequest {
  id: number
  username: string
  email: string
  status: 'Pending' | 'Approved' | 'Rejected'
  requestedAt: IsoDateTime
  reviewedAt: IsoDateTime | null
  reviewedByName: string | null
  approvedUserId: number | null
  decisionNote: string | null
}

export interface ApproveAccessRequest {
  roleId: number
  projectIds: number[]
}

export interface RoleRecord {
  id: number
  roleName: ConstructionRole
  description: string | null
  createdAt: IsoDateTime
}

export interface SwitchRoleRequest {
  role: ConstructionRole
}

export interface UpdateProjectAssignmentsRequest {
  projectIds: number[]
}

export interface DashboardResponse {
  user: CurrentUser
  visibleProjectCount: number
  pendingRequisitionCount: number
  approvedRequisitionCount: number
  pendingAccessRequestCount: number
  pendingSupplierOnboardingCount: number
  pendingGoodsReceiptCount: number
  pendingMaterialIssueCount: number
  pendingMaterialConfirmationCount: number
  pendingStockCountReviewCount: number
  pendingInvoiceCaptureCount: number
  pendingInvoiceReviewCount: number
  pendingCeoDecisionCount: number
  pendingPaymentAuthorizationCount: number
  pendingPaymentCount: number
  completedPaymentCount: number
}

export interface Material {
  id: number
  name: string
  category: string | null
  unit: string
  standardPrice: number
  reorderLevel: number
  requiresTechnicalAcceptance: boolean
  createdAt: IsoDateTime
}

export interface MaterialWriteRequest {
  name: string
  category?: string | null
  unit: string
  standardPrice: number
  reorderLevel: number
}

export type CreateMaterialRequest = MaterialWriteRequest
export type UpdateMaterialRequest = MaterialWriteRequest

export type MaterialCatalogRequestStatus = 'Pending' | 'Approved' | 'Rejected'

export interface MaterialCatalogRequest {
  id: number
  requestNumber: string
  projectId: number
  projectName: string
  name: string
  category: string | null
  unit: string
  purpose: string
  status: MaterialCatalogRequestStatus
  submittedByUserId: number
  submittedByName: string
  submittedAt: IsoDateTime
  reviewedByUserId: number | null
  reviewedByName: string | null
  reviewedAt: IsoDateTime | null
  reviewNotes: string | null
  approvedMaterialId: number | null
}

export interface CreateMaterialCatalogRequest {
  projectId: number
  name: string
  category?: string | null
  unit: string
  purpose: string
}

export interface ReviewMaterialCatalogRequest {
  approve: boolean
  notes: string
}

export interface SupplierSummary {
  id: number
  name: string
  category: string | null
  isBlacklisted: boolean
  createdAt: IsoDateTime
}

export type SupplierOnboardingStatus = 'Pending' | 'Approved' | 'Rejected'

export interface SupplierOnboardingRequest {
  id: number
  requestNumber: string
  name: string
  contactPerson: string
  phoneNumber: string
  email: string | null
  kraPin: string
  mpesaNumber: string | null
  category: string
  status: SupplierOnboardingStatus
  submittedByUserId: number
  submittedByName: string
  submittedAt: IsoDateTime
  reviewedByUserId: number | null
  reviewedByName: string | null
  reviewedAt: IsoDateTime | null
  reviewNotes: string | null
  approvedSupplierId: number | null
}

export interface CreateSupplierOnboardingRequest {
  name: string
  contactPerson: string
  phoneNumber: string
  email?: string | null
  kraPin: string
  mpesaNumber?: string | null
  category: string
}

export interface ReviewSupplierOnboardingRequest {
  approve: boolean
  notes: string
}

export interface Supplier extends SupplierSummary {
  contactPerson: string | null
  phoneNumber: string | null
  email: string | null
  kraPin: string | null
  mpesaNumber: string | null
}

export interface SupplierWriteRequest {
  name: string
  contactPerson?: string | null
  phoneNumber?: string | null
  email?: string | null
  kraPin?: string | null
  mpesaNumber?: string | null
  category?: string | null
}

export type UpdateSupplierRequest = SupplierWriteRequest

export type ProjectStatus = 'Active' | 'On Hold' | 'Completed' | 'Cancelled'

export interface Project {
  id: number
  name: string
  location: string | null
  budget: number | null
  startDate: IsoDate
  endDate: IsoDate | null
  status: ProjectStatus
  createdAt: IsoDateTime
}

export interface ProjectWriteRequest {
  name: string
  location?: string | null
  budget: number
  startDate: IsoDate
  endDate?: IsoDate | null
  status: ProjectStatus
}

export type CreateProjectRequest = ProjectWriteRequest
export type UpdateProjectRequest = ProjectWriteRequest

export interface CostCode {
  id: number
  projectId: number
  code: string
  name: string
  isActive: boolean
  currentAllocation: number | null
  pendingCommitmentAmount: number | null
  approvedCommitmentAmount: number | null
  remainingAfterCommitments: number | null
}

export interface CreateCostCodeRequest {
  code: string
  name: string
}

export interface BudgetAllocation {
  costCodeId: number
  costCode: string
  costCodeName: string
  amount: number
}

export interface ProjectBudget {
  id: number
  projectId: number
  approvedAmount: number
  allocatedAmount: number
  unallocatedAmount: number
  approvedByUserId: number | null
  approvedByUserName: string | null
  approvalSource: string
  notes: string | null
  createdAt: IsoDateTime
  allocations: BudgetAllocation[]
}

export interface SetProjectBudgetRequest {
  approvedAmount: number
  notes?: string | null
  allocations: Array<{
    costCodeId: number
    amount: number
  }>
}

export interface ProjectProgressVerification {
  id: number
  projectId: number
  percentageComplete: number
  workSummary: string
  evidenceReference: string | null
  verifiedByUserId: number
  verifiedByUserName: string
  verifiedAt: IsoDateTime
}

export interface CreateProjectProgressVerificationRequest {
  percentageComplete: number
  workSummary: string
  evidenceReference?: string | null
}

export interface ProjectSummary {
  canViewFinancials: boolean
  project: Project
  currentBudget: ProjectBudget | null
  costCodes: CostCode[]
  latestProgress: ProjectProgressVerification | null
  progressVerificationCount: number
  pendingCommitmentAmount: number | null
  approvedCommitmentAmount: number | null
  remainingAfterCommitments: number | null
}

export type RequisitionStatus =
  | 'AwaitingTechnicalCheck'
  | 'AwaitingSupervisorDecision'
  | 'ReturnedForRevision'
  | 'Approved'
  | 'Rejected'

export type TechnicalCheckOutcome = 'Verified' | 'RevisionRequired'
export type SupervisorDecision = 'Approve' | 'Reject' | 'ReturnForRevision'

export interface TechnicalCheck {
  id: number
  outcome: TechnicalCheckOutcome
  comments: string | null
  engineerUserId: number | null
  engineerName: string | null
  checkedAt: IsoDateTime
  requisitionRevision: number
}

export interface RequisitionWorkflowEvent {
  sequenceNumber: number
  eventType: string
  actorName: string
  actorRole: ConstructionRole
  fromStatus: RequisitionStatus | null
  toStatus: RequisitionStatus
  comments: string | null
  eventDataJson: string
  occurredAt: IsoDateTime
  eventHash: string
}

export interface Requisition {
  id: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  costCodeId: number
  costCode: string
  costCodeName: string
  requestType: 'SiteUse' | 'StockReplenishment'
  quantity: number
  neededByDate: IsoDate
  purpose: string
  notes: string | null
  status: RequisitionStatus
  workflowRevision: number
  requestedByUserId: number | null
  requestedByUserName: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  approvedAt: IsoDateTime | null
  latestTechnicalCheck: TechnicalCheck | null
  decidedByUserId: number | null
  decidedByUserName: string | null
  currentActionMessage: string | null
  history: RequisitionWorkflowEvent[]
}

export interface RequisitionListQuery extends PageQuery {
  status?: RequisitionStatus
  projectId?: number
}

export interface CreateRequisitionRequest {
  projectId: number
  materialId: number
  costCodeId: number
  quantity: number
  neededByDate: IsoDate
  purpose: string
  notes?: string | null
}

export interface CreateStockReplenishmentRequest {
  projectId: number
  materialId: number
  costCodeId: number
  quantity: number
  neededByDate: IsoDate
  reason: string
  notes?: string | null
}

export interface UpdateRequisitionRequest {
  costCodeId: number
  quantity: number
  neededByDate: IsoDate
  purpose: string
  notes?: string | null
  expectedRevision: number
}

export interface TechnicalCheckRequest {
  outcome: TechnicalCheckOutcome
  comments?: string | null
  expectedRevision: number
}

export interface SupervisorDecisionRequest {
  decision: SupervisorDecision
  comments?: string | null
  expectedRevision: number
}

export type SourcingRoundStatus = 'Open' | 'Awarded' | 'Closed' | 'Cancelled'

export interface SupplierQuote {
  id: number
  sourcingRoundId: number
  supplierId: number
  supplierName: string
  quoteReference: string
  quantityOffered: number
  unitPrice: number
  standardPriceSnapshot: number
  priceVariancePercentage: number | null
  priceAboveStandard?: boolean | null
  totalPrice: number
  validUntil: IsoDate | null
  recordedByUserId: number
  recordedByUserName: string
  notes: string | null
  recordedAt: IsoDateTime
}

export interface SourcingRoundEvent {
  id: number
  eventType: string
  fromStatus: SourcingRoundStatus | null
  toStatus: SourcingRoundStatus
  actorUserId: number
  actorUserName: string
  actorRole: ConstructionRole
  notes: string | null
  occurredAt: IsoDateTime
}

export interface SourcingRound {
  id: number
  requisitionId: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  requestedQuantity: number
  createdByUserId: number
  createdByUserName: string
  status: SourcingRoundStatus
  quoteDueAt: IsoDateTime | null
  notes: string | null
  createdAt: IsoDateTime
  closedAt: IsoDateTime | null
  quotes: SupplierQuote[]
  events: SourcingRoundEvent[]
}

export interface SourcingRoundListQuery extends PageQuery {
  projectId?: number
  status?: SourcingRoundStatus
}

export interface CreateSourcingRoundRequest {
  requisitionId: number
  quoteDueAt?: IsoDateTime | null
  notes?: string | null
}

export interface RecordSupplierQuoteRequest {
  supplierId: number
  quoteReference: string
  quantityOffered: number
  unitPrice: number
  validUntil?: IsoDate | null
  notes?: string | null
}

export interface WorkflowReasonRequest {
  reason: string
}

export interface ReopenSourcingRoundRequest extends WorkflowReasonRequest {
  quoteDueAt?: IsoDateTime | null
}

export type PurchaseOrderStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Issued'
  | 'Rejected'
  | 'Cancelled'

export interface PurchaseOrderLine {
  id: number
  requisitionId: number
  materialId: number
  materialName: string
  materialUnit: string
  quantity: number
  requiresTechnicalAcceptance: boolean
  unitPrice?: number | null
  lineTotal?: number | null
}

export interface PurchaseOrderEvent {
  id: number
  eventType: string
  fromStatus: PurchaseOrderStatus | null
  toStatus: PurchaseOrderStatus
  actorUserId: number
  actorUserName: string
  actorRole: ConstructionRole
  notes: string | null
  detailsJson?: string | null
  occurredAt: IsoDateTime
}

export interface PurchaseOrder {
  id: number
  purchaseOrderNumber: string
  projectId: number
  projectName: string
  requisitionId: number
  supplierId: number
  supplierName: string
  supplierQuoteId?: number | null
  status: PurchaseOrderStatus
  totalAmount?: number | null
  expectedDeliveryDate: IsoDate | null
  deliveryLocation: string | null
  notes?: string | null
  createdByUserId?: number | null
  createdByUserName?: string | null
  approvedByUserId?: number | null
  approvedByUserName?: string | null
  issuedByUserId?: number | null
  issuedByUserName?: string | null
  rejectedByUserId?: number | null
  rejectedByUserName?: string | null
  cancelledByUserId?: number | null
  cancelledByUserName?: string | null
  createdAt?: IsoDateTime | null
  submittedAt?: IsoDateTime | null
  approvedAt?: IsoDateTime | null
  issuedAt?: IsoDateTime | null
  rejectedAt?: IsoDateTime | null
  cancelledAt?: IsoDateTime | null
  lines: PurchaseOrderLine[]
  events: PurchaseOrderEvent[]
}

export interface PurchaseOrderListQuery extends PageQuery {
  projectId?: number
  status?: PurchaseOrderStatus
}

export interface CreatePurchaseOrderRequest {
  requisitionId: number
  supplierQuoteId: number
  expectedDeliveryDate: IsoDate
  deliveryLocation?: string | null
  notes?: string | null
}

export interface PurchaseOrderActionRequest {
  notes?: string | null
}

export interface CorrectPurchaseOrderRequest {
  expectedDeliveryDate: IsoDate
  deliveryLocation?: string | null
  notes?: string | null
  reason: string
}

export interface GoodsReceipt {
  id: number; receiptNumber: string; purchaseOrderId: number; purchaseOrderNumber: string
  supplierName: string; requisitionId: number; projectId: number; projectName: string; materialId: number
  materialName: string; materialUnit: string; orderedQuantity: number; deliveredQuantity: number
  acceptedQuantity: number; rejectedQuantity: number; condition: 'Good' | 'Damaged' | 'Mixed'
  deliveryNoteReference: string; evidenceReference: string | null; discrepancyNotes: string | null
  receivedByName: string; receivedAt: IsoDateTime
  requiresTechnicalAcceptance: boolean
  technicalAcceptanceStatus: TechnicalAcceptanceStatus
  technicalAcceptanceReviewedByName: string | null
  technicalAcceptanceReviewedAt: IsoDateTime | null
}

export type TechnicalAcceptanceOutcome = 'Accepted' | 'Rejected'
export type TechnicalAcceptanceStatus = 'NotRequired' | 'Pending' | TechnicalAcceptanceOutcome

export interface TechnicalAcceptanceWorkItem {
  goodsReceiptId: number
  technicalAcceptanceId: number | null
  receiptNumber: string
  purchaseOrderId: number
  purchaseOrderNumber: string
  supplierName: string
  requisitionId: number
  projectId: number
  projectName: string
  materialId: number
  materialName: string
  materialUnit: string
  orderedQuantity: number
  deliveredQuantity: number
  acceptedQuantity: number
  condition: 'Good' | 'Damaged' | 'Mixed'
  deliveryNoteReference: string
  receiptEvidenceReference: string | null
  receivedByName: string
  receivedAt: IsoDateTime
  requiresTechnicalAcceptance: boolean
  status: Exclude<TechnicalAcceptanceStatus, 'NotRequired'>
  outcome: TechnicalAcceptanceOutcome | null
  reviewSequence: number | null
  reviewedByUserId: number | null
  reviewedByName: string | null
  reviewedAt: IsoDateTime | null
  notes: string | null
  reviewEvidenceReference: string | null
}

export interface StockBalance {
  id: number; projectId: number; projectName: string; materialId: number; materialName: string
  category: string; unit: string; quantityOnHand: number; reorderLevel: number; updatedAt: IsoDateTime
}

export interface StockLedgerEntry {
  id: number; projectId: number; projectName: string; materialId: number; materialName: string
  unit: string; movementType: string; quantityDelta: number; balanceAfter: number
  referenceType: string; referenceId: number; referenceNumber: string
  actorName: string; notes: string | null; occurredAt: IsoDateTime
}

export interface MaterialUsage {
  id: number; usageType: 'Used' | 'Wastage'; quantity: number; purposeOrReason: string
  evidenceReference: string | null; recordedByName: string; recordedAt: IsoDateTime
}

export interface MaterialIssue {
  id: number; issueNumber: string; requisitionId: number; projectId: number; projectName: string
  materialId: number; materialName: string; materialUnit: string; requestedQuantity: number
  quantityIssued: number; status: 'AwaitingConfirmation' | 'Confirmed' | 'Disputed'
  issuedByName: string; issuedToUserId: number; issuedToName: string; notes: string | null
  issuedAt: IsoDateTime; confirmedQuantity: number | null; confirmationNotes: string | null
  confirmedAt: IsoDateTime | null; usedQuantity: number; wastedQuantity: number
  returnedQuantity: number; unaccountedQuantity: number; custodyStatus: string; usage: MaterialUsage[]
}

export interface StockTransfer {
  id: number; transferNumber: string; fromProjectId: number; fromProjectName: string
  toProjectId: number; toProjectName: string; materialId: number; materialName: string
  materialUnit: string; quantity: number; reason: string
  status: 'PendingDispatch' | 'InTransit' | 'Received' | 'Disputed' | 'Resolved'
  requestedByName: string; requestedAt: IsoDateTime; dispatchedByUserId: number | null; dispatchedByName: string | null
  dispatchedAt: IsoDateTime | null; receivedByName: string | null; receivedQuantity: number | null
  receiptNotes: string | null; receivedAt: IsoDateTime | null
  resolvedByName: string | null; resolutionDisposition: 'AcceptedLoss' | 'RecoveredAtDestination' | 'ReturnedToSource' | null
  resolutionQuantity: number | null; resolutionNotes: string | null
  resolutionEvidenceReference: string | null; resolvedAt: IsoDateTime | null
}

export interface StockCount {
  id: number; countNumber: string; projectId: number; projectName: string; materialId: number
  materialName: string; materialUnit: string; systemQuantity: number; countedQuantity: number
  variance: number; notes: string; status: 'AwaitingReview' | 'Approved' | 'Rejected'
  countedByName: string; countedAt: IsoDateTime; reviewedByName: string | null
  reviewNotes: string | null; reviewedAt: IsoDateTime | null
}

export interface SupplierInvoice {
  id: number; invoiceNumber: string; purchaseOrderId: number; purchaseOrderNumber: string
  requisitionId: number; projectId: number; projectName: string; supplierId: number
  supplierName: string; materialName: string; materialUnit: string; orderedQuantity: number
  orderedUnitPrice: number; acceptedQuantity: number; quantity: number; unitPrice: number; amount: number
  documentReference: string | null; status: string; quantityMatches: boolean; priceMatches: boolean
  amountMatches: boolean; requiresCeoApproval: boolean; matchNotes: string | null
  capturedByName: string; capturedAt: IsoDateTime; reviewedByUserId: number | null; reviewedByName: string | null
  reviewedAt: IsoDateTime | null; ceoDecision: string | null; ceoDecisionNotes: string | null
  ceoDecisionAt: IsoDateTime | null; authorization: PaymentAuthorization | null; payment: Payment | null
  requiresTechnicalAcceptance: boolean
  technicalAcceptanceStatus: TechnicalAcceptanceStatus
  technicalAcceptanceRequiredCount: number
  technicalAcceptanceAcceptedCount: number
  technicalAcceptanceRejectedCount: number
  latestTechnicalReviewerName: string | null
  latestTechnicalReviewAt: IsoDateTime | null
}

export interface PaymentAuthorization {
  id: number; authorizationNumber: string; supplierInvoiceId: number; projectId: number; amount: number
  supplierName: string; projectName: string; authorizedByUserId: number; authorizedByName: string; notes: string | null
  authorizedAt: IsoDateTime; isPaid: boolean
}

export interface Payment {
  id: number; paymentNumber: string; displayNumber: string; paymentAuthorizationId: number; amount: number; method: string
  externalReference: string; evidenceReference: string | null; paidByName: string
  paidAt: IsoDateTime; receiptNumber: string
}

export interface CashBookEntry {
  entryType: 'Supplier payment' | 'Petty cash'
  title: string
  detail: string
  amount: number
  state: 'Used' | 'Awaiting accountability'
  occurredAt: IsoDateTime
}

export interface CashBookProject {
  projectId: number
  projectName: string
  allocatedBudget: number
  supplierPayments: number
  pettyCashSpent: number
  openCommitments: number
  cashAwaitingAccountability: number
  totalUsed: number
  budgetAvailable: number
  entryCount: number
  recentEntries: CashBookEntry[]
}

export interface CashBook {
  generatedAt: IsoDateTime
  projects: CashBookProject[]
}

export interface CashAccount {
  id: number
  projectId: number
  projectName: string
  name: string
  balance: number
  updatedAt: IsoDateTime
}

export type PettyCashStatus =
  | 'PendingFinanceApproval'
  | 'Rejected'
  | 'Approved'
  | 'Disbursed'
  | 'ReconciliationSubmitted'
  | 'Reconciled'

export interface PettyCashDisbursement {
  id: number; disbursementNumber: string; amount: number; method: string
  externalReference: string; recipientName: string; recipientAcknowledgementReference: string
  evidenceReference: string; disbursedByUserId: number; disbursedByName: string; disbursedAt: IsoDateTime
}

export interface PettyCashReceiptConfirmation {
  id: number; confirmationNumber: string; amountReceived: number; notes: string | null
  confirmedByUserId: number; confirmedByName: string; confirmedAt: IsoDateTime
}

export interface PettyCashReconciliation {
  id: number; reconciliationNumber: string; amountSpent: number; amountReturned: number
  amountUnaccounted: number; amountExpensed: number | null; evidenceReference: string; returnReference: string | null
  notes: string | null; submittedByName: string; submittedAt: IsoDateTime
  status: 'PendingReview' | 'Approved' | 'Returned'; reviewedByName: string | null
  reviewedAt: IsoDateTime | null; reviewNotes: string | null
}

export interface PettyCashRequest {
  id: number; requestNumber: string; projectId: number; projectName: string
  costCodeId: number; costCode: string; costCodeName: string; purpose: string
  amountRequested: number; amountApproved: number | null; amountCommitted: number | null; neededByDate: IsoDate
  status: PettyCashStatus; requestedByName: string; requestedByUserId: number
  requestedAt: IsoDateTime; financeApprovedByUserId: number | null; financeApprovedByName: string | null
  financeDecisionAt: IsoDateTime | null; financeDecisionNotes: string | null
  disbursement: PettyCashDisbursement | null
  receiptConfirmation: PettyCashReceiptConfirmation | null
  latestReconciliation: PettyCashReconciliation | null
}

export interface ControlEvent {
  chainKey: string; sequenceNumber: number; requisitionId: number | null; projectId: number
  projectName: string; entityType: string; entityId: number; referenceNumber: string
  eventType: string; actorName: string; actorRole: ConstructionRole; detailsJson: string | null
  materialName: string | null; materialUnit: string | null; requestedQuantity: number | null; eventQuantity: number | null
  occurredAt: IsoDateTime; eventHash: string
}

export interface AppNotification {
  id: number
  taskKey: string
  taskType: string
  title: string
  message: string
  projectId: number | null
  projectName: string | null
  targetPath: string
  taskDueAt: IsoDateTime
  createdAt: IsoDateTime
  isRead: boolean
  readAt: IsoDateTime | null
}

export interface NotificationCount {
  unreadCount: number
}

export interface NotificationReadResult {
  markedReadCount: number
}

export interface MyTask {
  taskKey: string
  taskType: string
  title: string
  detail: string
  requiredRole: string
  projectId: number | null
  projectName: string | null
  sourceEntityType: string
  sourceEntityId: number
  targetPath: string
  openedAt: IsoDateTime
  dueAt: IsoDateTime
  isOverdue: boolean
  priority: string
}

export interface MyTasksResponse {
  generatedAt: IsoDateTime
  actualRole: string
  totalCount: number
  overdueCount: number
  items: MyTask[]
}

export interface EvidenceDocument {
  id: string
  projectId: number
  projectName: string
  sourceType: string
  sourceId: number
  evidenceKind: string
  originalFileName: string
  contentType: string
  sizeBytes: number
  sha256Hash: string
  uploadedByUserId: number
  uploadedByName: string
  uploadedAt: IsoDateTime
}

export type OpeningPositionType = 'Inventory' | 'Cash'
export type OpeningPositionStatus = 'AwaitingVerification' | 'AwaitingApproval' | 'Approved' | 'Rejected'

export interface OpeningInventoryLine {
  materialId: number
  materialName: string
  unit: string
  quantity: number
  unitCost: number | null
}

export interface OpeningCashLine {
  accountName: string
  amount: number
}

export interface OpeningPosition {
  id: number
  batchNumber: string
  positionType: OpeningPositionType
  projectId: number
  projectName: string
  asOfDate: IsoDate
  notes: string | null
  evidenceReference: string | null
  status: OpeningPositionStatus
  submittedByName: string
  submittedAt: IsoDateTime
  verifiedByName: string | null
  verificationNotes: string | null
  verifiedAt: IsoDateTime | null
  decidedByName: string | null
  decisionNotes: string | null
  decidedAt: IsoDateTime | null
  inventoryLines: OpeningInventoryLine[]
  cashLines: OpeningCashLine[]
}

export interface CreateOpeningPositionRequest {
  projectId: number
  positionType: OpeningPositionType
  asOfDate: IsoDate
  notes?: string | null
  evidenceReference?: string | null
  inventoryLines: Array<{ materialId: number; quantity: number; unitCost?: number | null }>
  cashLines: Array<{ accountName: string; amount: number }>
}

export type MaterialReturnStatus = 'AwaitingReceipt' | 'Received' | 'Rejected'

export interface MaterialReturn {
  id: number
  returnNumber: string
  materialIssueId: number
  projectId: number
  projectName: string
  materialName: string
  unit: string
  quantityOffered: number
  quantityAccepted: number | null
  condition: string
  status: MaterialReturnStatus
  returnedByName: string
  returnedAt: IsoDateTime
  receivedByName: string | null
  receivedAt: IsoDateTime | null
  notes: string | null
  evidenceReference: string | null
}

export interface MaterialIssueDisputeResolution {
  id: number
  resolutionNumber: string
  materialIssueId: number
  projectId: number
  projectName: string
  materialName: string
  unit: string
  issuedQuantity: number
  foremanReceivedQuantity: number
  returnedToStoreQuantity: number
  notes: string
  evidenceReference: string | null
  resolvedByName: string
  resolvedAt: IsoDateTime
}

export interface CreateMaterialReturnRequest {
  materialIssueId: number
  quantity: number
  condition: string
  notes?: string | null
  evidenceReference?: string | null
}

export interface CustodyCloseout {
  id: number
  closeoutNumber: string
  materialIssueId: number
  revision: number
  projectId: number
  projectName: string
  materialName: string
  unit: string
  confirmedQuantity: number
  usedQuantity: number
  wastedQuantity: number
  returnedQuantity: number
  unaccountedQuantity: number
  status: 'AwaitingReview' | 'Approved' | 'Returned'
  submittedByName: string
  submittedAt: IsoDateTime
  notes: string | null
  evidenceReference: string | null
  decidedByName: string | null
  decisionNotes: string | null
  decidedAt: IsoDateTime | null
}

export type OperationalPeriodScope = 'Inventory' | 'Finance'
export type OperationalPeriodStatus = 'Open' | 'AwaitingClose' | 'Closed' | 'Returned'

export interface OperationalPeriod {
  id: number
  periodNumber: string
  projectId: number
  projectName: string
  scope: OperationalPeriodScope
  name: string
  startDate: IsoDate
  endDate: IsoDate
  status: OperationalPeriodStatus
  createdByName: string
  createdAt: IsoDateTime
  latestEventType: string | null
  latestEventNotes: string | null
  latestActorName: string | null
  latestEventAt: IsoDateTime | null
}

export interface CreateOperationalPeriodRequest {
  projectId: number
  scope: OperationalPeriodScope
  name: string
  startDate: IsoDate
  endDate: IsoDate
}

export interface ControlledCorrection {
  id: number
  correctionNumber: string
  operationalPeriodId: number
  periodName: string
  projectId: number
  projectName: string
  correctionType: OperationalPeriodScope
  materialId: number | null
  materialName: string | null
  unit: string | null
  cashAccountName: string | null
  quantityDelta: number
  amountDelta: number
  reason: string
  evidenceReference: string | null
  status: 'AwaitingApproval' | 'Approved' | 'Rejected'
  submittedByName: string
  submittedAt: IsoDateTime
  decidedByName: string | null
  decisionNotes: string | null
  decidedAt: IsoDateTime | null
}

export interface CreateControlledCorrectionRequest {
  operationalPeriodId: number
  correctionType: OperationalPeriodScope
  materialId?: number | null
  cashAccountName?: string | null
  quantityDelta: number
  amountDelta: number
  reason: string
  evidenceReference?: string | null
}
