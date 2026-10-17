// Navigation map introspected from the foreign keys in database/supabase-schema.sql.
import { relations } from 'drizzle-orm/relations';
import { projects, costCodes, requisitions, engineerTechnicalChecks, users, projectBudgets, projectProgressVerifications, requisitionApprovalEvents, sourcingRounds, sourcingRoundEvents, userProjectAssignments, projectBudgetAllocations, supplierQuotes, suppliers, purchaseOrders, purchaseOrderEvents, accessRequests, controlEvents, materials, materialIssues, stockBalances, stockCounts, supplierInvoices, paymentAuthorizations, payments, paymentReceipts, supplierOnboardingRequests, pettyCashRequests, pettyCashDisbursements, pettyCashReconciliations, pettyCashReconciliationEvents, roles, pettyCashReceiptConfirmations, purchaseOrderLines, goodsReceipts, goodsReceiptTechnicalAcceptances, materialTechnicalAcceptancePolicyEvents, inAppNotifications, materialCustodyCloseouts, materialIssueDisputeResolutions, materialReturns, openingPositionBatches, operationalPeriods, cashAccounts, cashLedgerEntries, evidenceDocuments, evidenceAttachments, inAppNotificationReadReceipts, inAppNotificationResolutionReceipts, materialCustodyCloseoutDecisions, openingInventoryLines, openingPositionDecisions, openingPositionPostings, openingPositionVerifications, controlledCorrections, operationalPeriodEvents, controlledCorrectionDecisions, openingCashLines, materialUsageRecords, stockTransfers, securityAuditEvents, stockLedgerEntries, materialCatalogRequests } from './schema';

export const costCodesRelations = relations(costCodes, ({one, many}) => ({
	project: one(projects, {
		fields: [costCodes.projectId],
		references: [projects.id]
	}),
	projectBudgetAllocations: many(projectBudgetAllocations),
	pettyCashRequests: many(pettyCashRequests),
	requisitions: many(requisitions),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	costCodes: many(costCodes),
	projectBudgets: many(projectBudgets),
	projectProgressVerifications: many(projectProgressVerifications),
	userProjectAssignments: many(userProjectAssignments),
	controlEvents: many(controlEvents),
	materialIssues: many(materialIssues),
	stockBalances: many(stockBalances),
	stockCounts: many(stockCounts),
	supplierInvoices: many(supplierInvoices),
	pettyCashRequests: many(pettyCashRequests),
	requisitions: many(requisitions),
	inAppNotifications: many(inAppNotifications),
	openingPositionBatches: many(openingPositionBatches),
	operationalPeriods: many(operationalPeriods),
	cashLedgerEntries: many(cashLedgerEntries),
	evidenceAttachments: many(evidenceAttachments),
	controlledCorrections: many(controlledCorrections),
	cashAccounts: many(cashAccounts),
	evidenceDocuments: many(evidenceDocuments),
	stockTransfers_fromProjectId: many(stockTransfers, {
		relationName: "stockTransfers_fromProjectId_projects_id"
	}),
	stockTransfers_toProjectId: many(stockTransfers, {
		relationName: "stockTransfers_toProjectId_projects_id"
	}),
	stockLedgerEntries: many(stockLedgerEntries),
	goodsReceipts: many(goodsReceipts),
	materialCatalogRequests: many(materialCatalogRequests),
	purchaseOrders: many(purchaseOrders),
}));

export const engineerTechnicalChecksRelations = relations(engineerTechnicalChecks, ({one}) => ({
	requisition: one(requisitions, {
		fields: [engineerTechnicalChecks.requisitionId],
		references: [requisitions.id]
	}),
	user: one(users, {
		fields: [engineerTechnicalChecks.engineerUserId],
		references: [users.id]
	}),
}));

export const requisitionsRelations = relations(requisitions, ({one, many}) => ({
	engineerTechnicalChecks: many(engineerTechnicalChecks),
	requisitionApprovalEvents: many(requisitionApprovalEvents),
	sourcingRounds: many(sourcingRounds),
	controlEvents: many(controlEvents),
	materialIssues: many(materialIssues),
	costCode: one(costCodes, {
		fields: [requisitions.costCodeId],
		references: [costCodes.id]
	}),
	material: one(materials, {
		fields: [requisitions.materialId],
		references: [materials.id]
	}),
	project: one(projects, {
		fields: [requisitions.projectId],
		references: [projects.id]
	}),
	user_approvedByUserId: one(users, {
		fields: [requisitions.approvedByUserId],
		references: [users.id],
		relationName: "requisitions_approvedByUserId_users_id"
	}),
	user_requestedByUserId: one(users, {
		fields: [requisitions.requestedByUserId],
		references: [users.id],
		relationName: "requisitions_requestedByUserId_users_id"
	}),
	purchaseOrderLines: many(purchaseOrderLines),
	purchaseOrders: many(purchaseOrders),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	engineerTechnicalChecks: many(engineerTechnicalChecks),
	projectBudgets: many(projectBudgets),
	projectProgressVerifications: many(projectProgressVerifications),
	requisitionApprovalEvents: many(requisitionApprovalEvents),
	sourcingRounds: many(sourcingRounds),
	sourcingRoundEvents: many(sourcingRoundEvents),
	userProjectAssignments_assignedByUserId: many(userProjectAssignments, {
		relationName: "userProjectAssignments_assignedByUserId_users_id"
	}),
	userProjectAssignments_userId: many(userProjectAssignments, {
		relationName: "userProjectAssignments_userId_users_id"
	}),
	supplierQuotes: many(supplierQuotes),
	purchaseOrderEvents: many(purchaseOrderEvents),
	accessRequests_approvedUserId: many(accessRequests, {
		relationName: "accessRequests_approvedUserId_users_id"
	}),
	accessRequests_reviewedByUserId: many(accessRequests, {
		relationName: "accessRequests_reviewedByUserId_users_id"
	}),
	controlEvents: many(controlEvents),
	materialIssues_confirmedByUserId: many(materialIssues, {
		relationName: "materialIssues_confirmedByUserId_users_id"
	}),
	materialIssues_issuedByUserId: many(materialIssues, {
		relationName: "materialIssues_issuedByUserId_users_id"
	}),
	materialIssues_issuedToUserId: many(materialIssues, {
		relationName: "materialIssues_issuedToUserId_users_id"
	}),
	stockCounts_countedByUserId: many(stockCounts, {
		relationName: "stockCounts_countedByUserId_users_id"
	}),
	stockCounts_reviewedByUserId: many(stockCounts, {
		relationName: "stockCounts_reviewedByUserId_users_id"
	}),
	supplierInvoices_capturedByUserId: many(supplierInvoices, {
		relationName: "supplierInvoices_capturedByUserId_users_id"
	}),
	supplierInvoices_ceoDecisionByUserId: many(supplierInvoices, {
		relationName: "supplierInvoices_ceoDecisionByUserId_users_id"
	}),
	supplierInvoices_reviewedByUserId: many(supplierInvoices, {
		relationName: "supplierInvoices_reviewedByUserId_users_id"
	}),
	paymentAuthorizations: many(paymentAuthorizations),
	payments: many(payments),
	paymentReceipts: many(paymentReceipts),
	supplierOnboardingRequests_reviewedByUserId: many(supplierOnboardingRequests, {
		relationName: "supplierOnboardingRequests_reviewedByUserId_users_id"
	}),
	supplierOnboardingRequests_submittedByUserId: many(supplierOnboardingRequests, {
		relationName: "supplierOnboardingRequests_submittedByUserId_users_id"
	}),
	pettyCashRequests_financeApprovedByUserId: many(pettyCashRequests, {
		relationName: "pettyCashRequests_financeApprovedByUserId_users_id"
	}),
	pettyCashRequests_requestedByUserId: many(pettyCashRequests, {
		relationName: "pettyCashRequests_requestedByUserId_users_id"
	}),
	pettyCashDisbursements: many(pettyCashDisbursements),
	pettyCashReconciliations_reviewedByUserId: many(pettyCashReconciliations, {
		relationName: "pettyCashReconciliations_reviewedByUserId_users_id"
	}),
	pettyCashReconciliations_submittedByUserId: many(pettyCashReconciliations, {
		relationName: "pettyCashReconciliations_submittedByUserId_users_id"
	}),
	pettyCashReconciliationEvents: many(pettyCashReconciliationEvents),
	requisitions_approvedByUserId: many(requisitions, {
		relationName: "requisitions_approvedByUserId_users_id"
	}),
	requisitions_requestedByUserId: many(requisitions, {
		relationName: "requisitions_requestedByUserId_users_id"
	}),
	role: one(roles, {
		fields: [users.roleId],
		references: [roles.id]
	}),
	pettyCashReceiptConfirmations: many(pettyCashReceiptConfirmations),
	goodsReceiptTechnicalAcceptances: many(goodsReceiptTechnicalAcceptances),
	materialTechnicalAcceptancePolicyEvents: many(materialTechnicalAcceptancePolicyEvents),
	inAppNotifications: many(inAppNotifications),
	materialCustodyCloseouts: many(materialCustodyCloseouts),
	materialIssueDisputeResolutions: many(materialIssueDisputeResolutions),
	materialReturns_receivedByUserId: many(materialReturns, {
		relationName: "materialReturns_receivedByUserId_users_id"
	}),
	materialReturns_returnedByUserId: many(materialReturns, {
		relationName: "materialReturns_returnedByUserId_users_id"
	}),
	openingPositionBatches: many(openingPositionBatches),
	operationalPeriods: many(operationalPeriods),
	cashLedgerEntries: many(cashLedgerEntries),
	evidenceAttachments: many(evidenceAttachments),
	inAppNotificationReadReceipts: many(inAppNotificationReadReceipts),
	materialCustodyCloseoutDecisions: many(materialCustodyCloseoutDecisions),
	openingPositionDecisions: many(openingPositionDecisions),
	openingPositionPostings: many(openingPositionPostings),
	openingPositionVerifications: many(openingPositionVerifications),
	controlledCorrections: many(controlledCorrections),
	operationalPeriodEvents: many(operationalPeriodEvents),
	controlledCorrectionDecisions: many(controlledCorrectionDecisions),
	evidenceDocuments: many(evidenceDocuments),
	materialUsageRecords: many(materialUsageRecords),
	stockTransfers_dispatchedByUserId: many(stockTransfers, {
		relationName: "stockTransfers_dispatchedByUserId_users_id"
	}),
	stockTransfers_receivedByUserId: many(stockTransfers, {
		relationName: "stockTransfers_receivedByUserId_users_id"
	}),
	stockTransfers_requestedByUserId: many(stockTransfers, {
		relationName: "stockTransfers_requestedByUserId_users_id"
	}),
	stockTransfers_resolvedByUserId: many(stockTransfers, {
		relationName: "stockTransfers_resolvedByUserId_users_id"
	}),
	securityAuditEvents_actorUserId: many(securityAuditEvents, {
		relationName: "securityAuditEvents_actorUserId_users_id"
	}),
	securityAuditEvents_targetUserId: many(securityAuditEvents, {
		relationName: "securityAuditEvents_targetUserId_users_id"
	}),
	stockLedgerEntries: many(stockLedgerEntries),
	goodsReceipts: many(goodsReceipts),
	materialCatalogRequests_reviewedByUserId: many(materialCatalogRequests, {
		relationName: "materialCatalogRequests_reviewedByUserId_users_id"
	}),
	materialCatalogRequests_submittedByUserId: many(materialCatalogRequests, {
		relationName: "materialCatalogRequests_submittedByUserId_users_id"
	}),
	purchaseOrders_approvedByUserId: many(purchaseOrders, {
		relationName: "purchaseOrders_approvedByUserId_users_id"
	}),
	purchaseOrders_cancelledByUserId: many(purchaseOrders, {
		relationName: "purchaseOrders_cancelledByUserId_users_id"
	}),
	purchaseOrders_createdByUserId: many(purchaseOrders, {
		relationName: "purchaseOrders_createdByUserId_users_id"
	}),
	purchaseOrders_issuedByUserId: many(purchaseOrders, {
		relationName: "purchaseOrders_issuedByUserId_users_id"
	}),
	purchaseOrders_rejectedByUserId: many(purchaseOrders, {
		relationName: "purchaseOrders_rejectedByUserId_users_id"
	}),
}));

export const projectBudgetsRelations = relations(projectBudgets, ({one, many}) => ({
	project: one(projects, {
		fields: [projectBudgets.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [projectBudgets.approvedByUserId],
		references: [users.id]
	}),
	projectBudgetAllocations: many(projectBudgetAllocations),
}));

export const projectProgressVerificationsRelations = relations(projectProgressVerifications, ({one}) => ({
	project: one(projects, {
		fields: [projectProgressVerifications.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [projectProgressVerifications.verifiedByUserId],
		references: [users.id]
	}),
}));

export const requisitionApprovalEventsRelations = relations(requisitionApprovalEvents, ({one}) => ({
	requisition: one(requisitions, {
		fields: [requisitionApprovalEvents.requisitionId],
		references: [requisitions.id]
	}),
	user: one(users, {
		fields: [requisitionApprovalEvents.actorUserId],
		references: [users.id]
	}),
}));

export const sourcingRoundsRelations = relations(sourcingRounds, ({one, many}) => ({
	requisition: one(requisitions, {
		fields: [sourcingRounds.requisitionId],
		references: [requisitions.id]
	}),
	user: one(users, {
		fields: [sourcingRounds.createdByUserId],
		references: [users.id]
	}),
	sourcingRoundEvents: many(sourcingRoundEvents),
	supplierQuotes: many(supplierQuotes),
}));

export const sourcingRoundEventsRelations = relations(sourcingRoundEvents, ({one}) => ({
	sourcingRound: one(sourcingRounds, {
		fields: [sourcingRoundEvents.sourcingRoundId],
		references: [sourcingRounds.id]
	}),
	user: one(users, {
		fields: [sourcingRoundEvents.actorUserId],
		references: [users.id]
	}),
}));

export const userProjectAssignmentsRelations = relations(userProjectAssignments, ({one}) => ({
	project: one(projects, {
		fields: [userProjectAssignments.projectId],
		references: [projects.id]
	}),
	user_assignedByUserId: one(users, {
		fields: [userProjectAssignments.assignedByUserId],
		references: [users.id],
		relationName: "userProjectAssignments_assignedByUserId_users_id"
	}),
	user_userId: one(users, {
		fields: [userProjectAssignments.userId],
		references: [users.id],
		relationName: "userProjectAssignments_userId_users_id"
	}),
}));

export const projectBudgetAllocationsRelations = relations(projectBudgetAllocations, ({one}) => ({
	costCode: one(costCodes, {
		fields: [projectBudgetAllocations.costCodeId],
		references: [costCodes.id]
	}),
	projectBudget: one(projectBudgets, {
		fields: [projectBudgetAllocations.projectBudgetId],
		references: [projectBudgets.id]
	}),
}));

export const supplierQuotesRelations = relations(supplierQuotes, ({one, many}) => ({
	sourcingRound: one(sourcingRounds, {
		fields: [supplierQuotes.sourcingRoundId],
		references: [sourcingRounds.id]
	}),
	supplier: one(suppliers, {
		fields: [supplierQuotes.supplierId],
		references: [suppliers.id]
	}),
	user: one(users, {
		fields: [supplierQuotes.recordedByUserId],
		references: [users.id]
	}),
	purchaseOrders: many(purchaseOrders),
}));

export const suppliersRelations = relations(suppliers, ({many}) => ({
	supplierQuotes: many(supplierQuotes),
	supplierInvoices: many(supplierInvoices),
	supplierOnboardingRequests: many(supplierOnboardingRequests),
	goodsReceipts: many(goodsReceipts),
	purchaseOrders: many(purchaseOrders),
}));

export const purchaseOrderEventsRelations = relations(purchaseOrderEvents, ({one}) => ({
	purchaseOrder: one(purchaseOrders, {
		fields: [purchaseOrderEvents.purchaseOrderId],
		references: [purchaseOrders.id]
	}),
	user: one(users, {
		fields: [purchaseOrderEvents.actorUserId],
		references: [users.id]
	}),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({one, many}) => ({
	purchaseOrderEvents: many(purchaseOrderEvents),
	supplierInvoices: many(supplierInvoices),
	purchaseOrderLines: many(purchaseOrderLines),
	goodsReceipts: many(goodsReceipts),
	project: one(projects, {
		fields: [purchaseOrders.projectId],
		references: [projects.id]
	}),
	requisition: one(requisitions, {
		fields: [purchaseOrders.requisitionId],
		references: [requisitions.id]
	}),
	supplierQuote: one(supplierQuotes, {
		fields: [purchaseOrders.supplierQuoteId],
		references: [supplierQuotes.id]
	}),
	supplier: one(suppliers, {
		fields: [purchaseOrders.supplierId],
		references: [suppliers.id]
	}),
	user_approvedByUserId: one(users, {
		fields: [purchaseOrders.approvedByUserId],
		references: [users.id],
		relationName: "purchaseOrders_approvedByUserId_users_id"
	}),
	user_cancelledByUserId: one(users, {
		fields: [purchaseOrders.cancelledByUserId],
		references: [users.id],
		relationName: "purchaseOrders_cancelledByUserId_users_id"
	}),
	user_createdByUserId: one(users, {
		fields: [purchaseOrders.createdByUserId],
		references: [users.id],
		relationName: "purchaseOrders_createdByUserId_users_id"
	}),
	user_issuedByUserId: one(users, {
		fields: [purchaseOrders.issuedByUserId],
		references: [users.id],
		relationName: "purchaseOrders_issuedByUserId_users_id"
	}),
	user_rejectedByUserId: one(users, {
		fields: [purchaseOrders.rejectedByUserId],
		references: [users.id],
		relationName: "purchaseOrders_rejectedByUserId_users_id"
	}),
}));

export const accessRequestsRelations = relations(accessRequests, ({one}) => ({
	user_approvedUserId: one(users, {
		fields: [accessRequests.approvedUserId],
		references: [users.id],
		relationName: "accessRequests_approvedUserId_users_id"
	}),
	user_reviewedByUserId: one(users, {
		fields: [accessRequests.reviewedByUserId],
		references: [users.id],
		relationName: "accessRequests_reviewedByUserId_users_id"
	}),
}));

export const controlEventsRelations = relations(controlEvents, ({one}) => ({
	project: one(projects, {
		fields: [controlEvents.projectId],
		references: [projects.id]
	}),
	requisition: one(requisitions, {
		fields: [controlEvents.requisitionId],
		references: [requisitions.id]
	}),
	user: one(users, {
		fields: [controlEvents.actorUserId],
		references: [users.id]
	}),
}));

export const materialIssuesRelations = relations(materialIssues, ({one, many}) => ({
	material: one(materials, {
		fields: [materialIssues.materialId],
		references: [materials.id]
	}),
	project: one(projects, {
		fields: [materialIssues.projectId],
		references: [projects.id]
	}),
	requisition: one(requisitions, {
		fields: [materialIssues.requisitionId],
		references: [requisitions.id]
	}),
	user_confirmedByUserId: one(users, {
		fields: [materialIssues.confirmedByUserId],
		references: [users.id],
		relationName: "materialIssues_confirmedByUserId_users_id"
	}),
	user_issuedByUserId: one(users, {
		fields: [materialIssues.issuedByUserId],
		references: [users.id],
		relationName: "materialIssues_issuedByUserId_users_id"
	}),
	user_issuedToUserId: one(users, {
		fields: [materialIssues.issuedToUserId],
		references: [users.id],
		relationName: "materialIssues_issuedToUserId_users_id"
	}),
	materialCustodyCloseouts: many(materialCustodyCloseouts),
	materialIssueDisputeResolutions: many(materialIssueDisputeResolutions),
	materialReturns: many(materialReturns),
	materialUsageRecords: many(materialUsageRecords),
}));

export const materialsRelations = relations(materials, ({many}) => ({
	materialIssues: many(materialIssues),
	stockBalances: many(stockBalances),
	stockCounts: many(stockCounts),
	requisitions: many(requisitions),
	purchaseOrderLines: many(purchaseOrderLines),
	materialTechnicalAcceptancePolicyEvents: many(materialTechnicalAcceptancePolicyEvents),
	openingInventoryLines: many(openingInventoryLines),
	controlledCorrections: many(controlledCorrections),
	stockTransfers: many(stockTransfers),
	stockLedgerEntries: many(stockLedgerEntries),
	goodsReceipts: many(goodsReceipts),
	materialCatalogRequests: many(materialCatalogRequests),
}));

export const stockBalancesRelations = relations(stockBalances, ({one}) => ({
	material: one(materials, {
		fields: [stockBalances.materialId],
		references: [materials.id]
	}),
	project: one(projects, {
		fields: [stockBalances.projectId],
		references: [projects.id]
	}),
}));

export const stockCountsRelations = relations(stockCounts, ({one}) => ({
	material: one(materials, {
		fields: [stockCounts.materialId],
		references: [materials.id]
	}),
	project: one(projects, {
		fields: [stockCounts.projectId],
		references: [projects.id]
	}),
	user_countedByUserId: one(users, {
		fields: [stockCounts.countedByUserId],
		references: [users.id],
		relationName: "stockCounts_countedByUserId_users_id"
	}),
	user_reviewedByUserId: one(users, {
		fields: [stockCounts.reviewedByUserId],
		references: [users.id],
		relationName: "stockCounts_reviewedByUserId_users_id"
	}),
}));

export const supplierInvoicesRelations = relations(supplierInvoices, ({one, many}) => ({
	project: one(projects, {
		fields: [supplierInvoices.projectId],
		references: [projects.id]
	}),
	purchaseOrder: one(purchaseOrders, {
		fields: [supplierInvoices.purchaseOrderId],
		references: [purchaseOrders.id]
	}),
	supplier: one(suppliers, {
		fields: [supplierInvoices.supplierId],
		references: [suppliers.id]
	}),
	user_capturedByUserId: one(users, {
		fields: [supplierInvoices.capturedByUserId],
		references: [users.id],
		relationName: "supplierInvoices_capturedByUserId_users_id"
	}),
	user_ceoDecisionByUserId: one(users, {
		fields: [supplierInvoices.ceoDecisionByUserId],
		references: [users.id],
		relationName: "supplierInvoices_ceoDecisionByUserId_users_id"
	}),
	user_reviewedByUserId: one(users, {
		fields: [supplierInvoices.reviewedByUserId],
		references: [users.id],
		relationName: "supplierInvoices_reviewedByUserId_users_id"
	}),
	paymentAuthorizations: many(paymentAuthorizations),
}));

export const paymentAuthorizationsRelations = relations(paymentAuthorizations, ({one, many}) => ({
	supplierInvoice: one(supplierInvoices, {
		fields: [paymentAuthorizations.supplierInvoiceId],
		references: [supplierInvoices.id]
	}),
	user: one(users, {
		fields: [paymentAuthorizations.authorizedByUserId],
		references: [users.id]
	}),
	payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({one, many}) => ({
	paymentAuthorization: one(paymentAuthorizations, {
		fields: [payments.paymentAuthorizationId],
		references: [paymentAuthorizations.id]
	}),
	user: one(users, {
		fields: [payments.paidByUserId],
		references: [users.id]
	}),
	paymentReceipts: many(paymentReceipts),
}));

export const paymentReceiptsRelations = relations(paymentReceipts, ({one}) => ({
	payment: one(payments, {
		fields: [paymentReceipts.paymentId],
		references: [payments.id]
	}),
	user: one(users, {
		fields: [paymentReceipts.issuedByUserId],
		references: [users.id]
	}),
}));

export const supplierOnboardingRequestsRelations = relations(supplierOnboardingRequests, ({one}) => ({
	supplier: one(suppliers, {
		fields: [supplierOnboardingRequests.approvedSupplierId],
		references: [suppliers.id]
	}),
	user_reviewedByUserId: one(users, {
		fields: [supplierOnboardingRequests.reviewedByUserId],
		references: [users.id],
		relationName: "supplierOnboardingRequests_reviewedByUserId_users_id"
	}),
	user_submittedByUserId: one(users, {
		fields: [supplierOnboardingRequests.submittedByUserId],
		references: [users.id],
		relationName: "supplierOnboardingRequests_submittedByUserId_users_id"
	}),
}));

export const pettyCashRequestsRelations = relations(pettyCashRequests, ({one, many}) => ({
	costCode: one(costCodes, {
		fields: [pettyCashRequests.costCodeId],
		references: [costCodes.id]
	}),
	project: one(projects, {
		fields: [pettyCashRequests.projectId],
		references: [projects.id]
	}),
	user_financeApprovedByUserId: one(users, {
		fields: [pettyCashRequests.financeApprovedByUserId],
		references: [users.id],
		relationName: "pettyCashRequests_financeApprovedByUserId_users_id"
	}),
	user_requestedByUserId: one(users, {
		fields: [pettyCashRequests.requestedByUserId],
		references: [users.id],
		relationName: "pettyCashRequests_requestedByUserId_users_id"
	}),
	pettyCashDisbursements: many(pettyCashDisbursements),
	pettyCashReconciliations: many(pettyCashReconciliations),
	pettyCashReceiptConfirmations: many(pettyCashReceiptConfirmations),
}));

export const pettyCashDisbursementsRelations = relations(pettyCashDisbursements, ({one, many}) => ({
	pettyCashRequest: one(pettyCashRequests, {
		fields: [pettyCashDisbursements.pettyCashRequestId],
		references: [pettyCashRequests.id]
	}),
	user: one(users, {
		fields: [pettyCashDisbursements.disbursedByUserId],
		references: [users.id]
	}),
	pettyCashReceiptConfirmations: many(pettyCashReceiptConfirmations),
}));

export const pettyCashReconciliationsRelations = relations(pettyCashReconciliations, ({one, many}) => ({
	pettyCashRequest: one(pettyCashRequests, {
		fields: [pettyCashReconciliations.pettyCashRequestId],
		references: [pettyCashRequests.id]
	}),
	user_reviewedByUserId: one(users, {
		fields: [pettyCashReconciliations.reviewedByUserId],
		references: [users.id],
		relationName: "pettyCashReconciliations_reviewedByUserId_users_id"
	}),
	user_submittedByUserId: one(users, {
		fields: [pettyCashReconciliations.submittedByUserId],
		references: [users.id],
		relationName: "pettyCashReconciliations_submittedByUserId_users_id"
	}),
	pettyCashReconciliationEvents: many(pettyCashReconciliationEvents),
}));

export const pettyCashReconciliationEventsRelations = relations(pettyCashReconciliationEvents, ({one}) => ({
	pettyCashReconciliation: one(pettyCashReconciliations, {
		fields: [pettyCashReconciliationEvents.pettyCashReconciliationId],
		references: [pettyCashReconciliations.id]
	}),
	user: one(users, {
		fields: [pettyCashReconciliationEvents.actorUserId],
		references: [users.id]
	}),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	users: many(users),
}));

export const pettyCashReceiptConfirmationsRelations = relations(pettyCashReceiptConfirmations, ({one}) => ({
	pettyCashDisbursement: one(pettyCashDisbursements, {
		fields: [pettyCashReceiptConfirmations.pettyCashDisbursementId],
		references: [pettyCashDisbursements.id]
	}),
	pettyCashRequest: one(pettyCashRequests, {
		fields: [pettyCashReceiptConfirmations.pettyCashRequestId],
		references: [pettyCashRequests.id]
	}),
	user: one(users, {
		fields: [pettyCashReceiptConfirmations.confirmedByUserId],
		references: [users.id]
	}),
}));

export const purchaseOrderLinesRelations = relations(purchaseOrderLines, ({one, many}) => ({
	material: one(materials, {
		fields: [purchaseOrderLines.materialId],
		references: [materials.id]
	}),
	purchaseOrder: one(purchaseOrders, {
		fields: [purchaseOrderLines.purchaseOrderId],
		references: [purchaseOrders.id]
	}),
	requisition: one(requisitions, {
		fields: [purchaseOrderLines.requisitionId],
		references: [requisitions.id]
	}),
	goodsReceipts: many(goodsReceipts),
}));

export const goodsReceiptTechnicalAcceptancesRelations = relations(goodsReceiptTechnicalAcceptances, ({one}) => ({
	goodsReceipt: one(goodsReceipts, {
		fields: [goodsReceiptTechnicalAcceptances.goodsReceiptId],
		references: [goodsReceipts.id]
	}),
	user: one(users, {
		fields: [goodsReceiptTechnicalAcceptances.engineerUserId],
		references: [users.id]
	}),
}));

export const goodsReceiptsRelations = relations(goodsReceipts, ({one, many}) => ({
	goodsReceiptTechnicalAcceptances: many(goodsReceiptTechnicalAcceptances),
	material: one(materials, {
		fields: [goodsReceipts.materialId],
		references: [materials.id]
	}),
	project: one(projects, {
		fields: [goodsReceipts.projectId],
		references: [projects.id]
	}),
	purchaseOrderLine: one(purchaseOrderLines, {
		fields: [goodsReceipts.purchaseOrderLineId],
		references: [purchaseOrderLines.id]
	}),
	purchaseOrder: one(purchaseOrders, {
		fields: [goodsReceipts.purchaseOrderId],
		references: [purchaseOrders.id]
	}),
	supplier: one(suppliers, {
		fields: [goodsReceipts.supplierId],
		references: [suppliers.id]
	}),
	user: one(users, {
		fields: [goodsReceipts.receivedByUserId],
		references: [users.id]
	}),
}));

export const materialTechnicalAcceptancePolicyEventsRelations = relations(materialTechnicalAcceptancePolicyEvents, ({one}) => ({
	material: one(materials, {
		fields: [materialTechnicalAcceptancePolicyEvents.materialId],
		references: [materials.id]
	}),
	user: one(users, {
		fields: [materialTechnicalAcceptancePolicyEvents.changedByUserId],
		references: [users.id]
	}),
}));

export const inAppNotificationsRelations = relations(inAppNotifications, ({one, many}) => ({
	project: one(projects, {
		fields: [inAppNotifications.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [inAppNotifications.recipientUserId],
		references: [users.id]
	}),
	inAppNotificationReadReceipts: many(inAppNotificationReadReceipts),
	inAppNotificationResolutionReceipts: many(inAppNotificationResolutionReceipts),
}));

export const materialCustodyCloseoutsRelations = relations(materialCustodyCloseouts, ({one, many}) => ({
	materialIssue: one(materialIssues, {
		fields: [materialCustodyCloseouts.materialIssueId],
		references: [materialIssues.id]
	}),
	user: one(users, {
		fields: [materialCustodyCloseouts.submittedByUserId],
		references: [users.id]
	}),
	materialCustodyCloseoutDecisions: many(materialCustodyCloseoutDecisions),
}));

export const materialIssueDisputeResolutionsRelations = relations(materialIssueDisputeResolutions, ({one}) => ({
	materialIssue: one(materialIssues, {
		fields: [materialIssueDisputeResolutions.materialIssueId],
		references: [materialIssues.id]
	}),
	user: one(users, {
		fields: [materialIssueDisputeResolutions.resolvedByUserId],
		references: [users.id]
	}),
}));

export const materialReturnsRelations = relations(materialReturns, ({one}) => ({
	materialIssue: one(materialIssues, {
		fields: [materialReturns.materialIssueId],
		references: [materialIssues.id]
	}),
	user_receivedByUserId: one(users, {
		fields: [materialReturns.receivedByUserId],
		references: [users.id],
		relationName: "materialReturns_receivedByUserId_users_id"
	}),
	user_returnedByUserId: one(users, {
		fields: [materialReturns.returnedByUserId],
		references: [users.id],
		relationName: "materialReturns_returnedByUserId_users_id"
	}),
}));

export const openingPositionBatchesRelations = relations(openingPositionBatches, ({one, many}) => ({
	project: one(projects, {
		fields: [openingPositionBatches.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [openingPositionBatches.submittedByUserId],
		references: [users.id]
	}),
	openingInventoryLines: many(openingInventoryLines),
	openingPositionDecisions: many(openingPositionDecisions),
	openingPositionPostings: many(openingPositionPostings),
	openingPositionVerifications: many(openingPositionVerifications),
	openingCashLines: many(openingCashLines),
}));

export const operationalPeriodsRelations = relations(operationalPeriods, ({one, many}) => ({
	project: one(projects, {
		fields: [operationalPeriods.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [operationalPeriods.createdByUserId],
		references: [users.id]
	}),
	controlledCorrections: many(controlledCorrections),
	operationalPeriodEvents: many(operationalPeriodEvents),
}));

export const cashLedgerEntriesRelations = relations(cashLedgerEntries, ({one}) => ({
	cashAccount: one(cashAccounts, {
		fields: [cashLedgerEntries.cashAccountId],
		references: [cashAccounts.id]
	}),
	project: one(projects, {
		fields: [cashLedgerEntries.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [cashLedgerEntries.postedByUserId],
		references: [users.id]
	}),
}));

export const cashAccountsRelations = relations(cashAccounts, ({one, many}) => ({
	cashLedgerEntries: many(cashLedgerEntries),
	project: one(projects, {
		fields: [cashAccounts.projectId],
		references: [projects.id]
	}),
}));

export const evidenceAttachmentsRelations = relations(evidenceAttachments, ({one}) => ({
	evidenceDocument: one(evidenceDocuments, {
		fields: [evidenceAttachments.evidenceDocumentId],
		references: [evidenceDocuments.id]
	}),
	project: one(projects, {
		fields: [evidenceAttachments.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [evidenceAttachments.linkedByUserId],
		references: [users.id]
	}),
}));

export const evidenceDocumentsRelations = relations(evidenceDocuments, ({one, many}) => ({
	evidenceAttachments: many(evidenceAttachments),
	project: one(projects, {
		fields: [evidenceDocuments.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [evidenceDocuments.uploadedByUserId],
		references: [users.id]
	}),
}));

export const inAppNotificationReadReceiptsRelations = relations(inAppNotificationReadReceipts, ({one}) => ({
	inAppNotification: one(inAppNotifications, {
		fields: [inAppNotificationReadReceipts.inAppNotificationId],
		references: [inAppNotifications.id]
	}),
	user: one(users, {
		fields: [inAppNotificationReadReceipts.recipientUserId],
		references: [users.id]
	}),
}));

export const inAppNotificationResolutionReceiptsRelations = relations(inAppNotificationResolutionReceipts, ({one}) => ({
	inAppNotification: one(inAppNotifications, {
		fields: [inAppNotificationResolutionReceipts.inAppNotificationId],
		references: [inAppNotifications.id]
	}),
}));

export const materialCustodyCloseoutDecisionsRelations = relations(materialCustodyCloseoutDecisions, ({one}) => ({
	materialCustodyCloseout: one(materialCustodyCloseouts, {
		fields: [materialCustodyCloseoutDecisions.materialCustodyCloseoutId],
		references: [materialCustodyCloseouts.id]
	}),
	user: one(users, {
		fields: [materialCustodyCloseoutDecisions.decidedByUserId],
		references: [users.id]
	}),
}));

export const openingInventoryLinesRelations = relations(openingInventoryLines, ({one}) => ({
	material: one(materials, {
		fields: [openingInventoryLines.materialId],
		references: [materials.id]
	}),
	openingPositionBatch: one(openingPositionBatches, {
		fields: [openingInventoryLines.openingPositionBatchId],
		references: [openingPositionBatches.id]
	}),
}));

export const openingPositionDecisionsRelations = relations(openingPositionDecisions, ({one}) => ({
	openingPositionBatch: one(openingPositionBatches, {
		fields: [openingPositionDecisions.openingPositionBatchId],
		references: [openingPositionBatches.id]
	}),
	user: one(users, {
		fields: [openingPositionDecisions.decidedByUserId],
		references: [users.id]
	}),
}));

export const openingPositionPostingsRelations = relations(openingPositionPostings, ({one}) => ({
	openingPositionBatch: one(openingPositionBatches, {
		fields: [openingPositionPostings.openingPositionBatchId],
		references: [openingPositionBatches.id]
	}),
	user: one(users, {
		fields: [openingPositionPostings.postedByUserId],
		references: [users.id]
	}),
}));

export const openingPositionVerificationsRelations = relations(openingPositionVerifications, ({one}) => ({
	openingPositionBatch: one(openingPositionBatches, {
		fields: [openingPositionVerifications.openingPositionBatchId],
		references: [openingPositionBatches.id]
	}),
	user: one(users, {
		fields: [openingPositionVerifications.verifiedByUserId],
		references: [users.id]
	}),
}));

export const controlledCorrectionsRelations = relations(controlledCorrections, ({one, many}) => ({
	material: one(materials, {
		fields: [controlledCorrections.materialId],
		references: [materials.id]
	}),
	operationalPeriod: one(operationalPeriods, {
		fields: [controlledCorrections.operationalPeriodId],
		references: [operationalPeriods.id]
	}),
	project: one(projects, {
		fields: [controlledCorrections.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [controlledCorrections.submittedByUserId],
		references: [users.id]
	}),
	controlledCorrectionDecisions: many(controlledCorrectionDecisions),
}));

export const operationalPeriodEventsRelations = relations(operationalPeriodEvents, ({one}) => ({
	operationalPeriod: one(operationalPeriods, {
		fields: [operationalPeriodEvents.operationalPeriodId],
		references: [operationalPeriods.id]
	}),
	user: one(users, {
		fields: [operationalPeriodEvents.actorUserId],
		references: [users.id]
	}),
}));

export const controlledCorrectionDecisionsRelations = relations(controlledCorrectionDecisions, ({one}) => ({
	controlledCorrection: one(controlledCorrections, {
		fields: [controlledCorrectionDecisions.controlledCorrectionId],
		references: [controlledCorrections.id]
	}),
	user: one(users, {
		fields: [controlledCorrectionDecisions.decidedByUserId],
		references: [users.id]
	}),
}));

export const openingCashLinesRelations = relations(openingCashLines, ({one}) => ({
	openingPositionBatch: one(openingPositionBatches, {
		fields: [openingCashLines.openingPositionBatchId],
		references: [openingPositionBatches.id]
	}),
}));

export const materialUsageRecordsRelations = relations(materialUsageRecords, ({one}) => ({
	materialIssue: one(materialIssues, {
		fields: [materialUsageRecords.materialIssueId],
		references: [materialIssues.id]
	}),
	user: one(users, {
		fields: [materialUsageRecords.recordedByUserId],
		references: [users.id]
	}),
}));

export const stockTransfersRelations = relations(stockTransfers, ({one}) => ({
	material: one(materials, {
		fields: [stockTransfers.materialId],
		references: [materials.id]
	}),
	project_fromProjectId: one(projects, {
		fields: [stockTransfers.fromProjectId],
		references: [projects.id],
		relationName: "stockTransfers_fromProjectId_projects_id"
	}),
	project_toProjectId: one(projects, {
		fields: [stockTransfers.toProjectId],
		references: [projects.id],
		relationName: "stockTransfers_toProjectId_projects_id"
	}),
	user_dispatchedByUserId: one(users, {
		fields: [stockTransfers.dispatchedByUserId],
		references: [users.id],
		relationName: "stockTransfers_dispatchedByUserId_users_id"
	}),
	user_receivedByUserId: one(users, {
		fields: [stockTransfers.receivedByUserId],
		references: [users.id],
		relationName: "stockTransfers_receivedByUserId_users_id"
	}),
	user_requestedByUserId: one(users, {
		fields: [stockTransfers.requestedByUserId],
		references: [users.id],
		relationName: "stockTransfers_requestedByUserId_users_id"
	}),
	user_resolvedByUserId: one(users, {
		fields: [stockTransfers.resolvedByUserId],
		references: [users.id],
		relationName: "stockTransfers_resolvedByUserId_users_id"
	}),
}));

export const securityAuditEventsRelations = relations(securityAuditEvents, ({one}) => ({
	user_actorUserId: one(users, {
		fields: [securityAuditEvents.actorUserId],
		references: [users.id],
		relationName: "securityAuditEvents_actorUserId_users_id"
	}),
	user_targetUserId: one(users, {
		fields: [securityAuditEvents.targetUserId],
		references: [users.id],
		relationName: "securityAuditEvents_targetUserId_users_id"
	}),
}));

export const stockLedgerEntriesRelations = relations(stockLedgerEntries, ({one}) => ({
	material: one(materials, {
		fields: [stockLedgerEntries.materialId],
		references: [materials.id]
	}),
	project: one(projects, {
		fields: [stockLedgerEntries.projectId],
		references: [projects.id]
	}),
	user: one(users, {
		fields: [stockLedgerEntries.actorUserId],
		references: [users.id]
	}),
}));

export const materialCatalogRequestsRelations = relations(materialCatalogRequests, ({one}) => ({
	material: one(materials, {
		fields: [materialCatalogRequests.approvedMaterialId],
		references: [materials.id]
	}),
	project: one(projects, {
		fields: [materialCatalogRequests.projectId],
		references: [projects.id]
	}),
	user_reviewedByUserId: one(users, {
		fields: [materialCatalogRequests.reviewedByUserId],
		references: [users.id],
		relationName: "materialCatalogRequests_reviewedByUserId_users_id"
	}),
	user_submittedByUserId: one(users, {
		fields: [materialCatalogRequests.submittedByUserId],
		references: [users.id],
		relationName: "materialCatalogRequests_submittedByUserId_users_id"
	}),
}));