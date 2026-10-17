import { pgTable, integer, varchar, timestamp, numeric, date, boolean, bigint, jsonb, text, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// Column map of database/supabase-schema.sql (the authoritative DDL, including constraints,
// filtered unique indexes and append-only triggers). Introspected with drizzle-kit and then
// normalized: timestamps are JS Dates (UTC), numerics are JS numbers. Use
// ConstructionMS.Application/Common/Money for exact decimal arithmetic on them.

export const roles = pgTable("Roles", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	roleName: varchar("RoleName", { length: 80 }).notNull(),
	description: varchar("Description", { length: 300 }),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const projects = pgTable("Projects", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	name: varchar("Name", { length: 150 }).notNull(),
	location: varchar("Location", { length: 300 }),
	budget: numeric("Budget", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	startDate: date("StartDate").notNull(),
	endDate: date("EndDate"),
	status: varchar("Status", { length: 30 }).notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const costCodes = pgTable("CostCodes", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	projectId: integer("ProjectId").notNull(),
	code: varchar("Code", { length: 30 }).notNull(),
	name: varchar("Name", { length: 150 }).notNull(),
	isActive: boolean("IsActive").notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const engineerTechnicalChecks = pgTable("EngineerTechnicalChecks", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	requisitionId: integer("RequisitionId").notNull(),
	engineerUserId: integer("EngineerUserId").notNull(),
	outcome: varchar("Outcome", { length: 30 }).notNull(),
	comments: varchar("Comments", { length: 1000 }),
	checkedAt: timestamp("CheckedAt", { withTimezone: true, mode: 'date' }).notNull(),
	requisitionRevision: integer("RequisitionRevision").notNull(),
});

export const projectBudgets = pgTable("ProjectBudgets", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	projectId: integer("ProjectId").notNull(),
	approvedAmount: numeric("ApprovedAmount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	approvedByUserId: integer("ApprovedByUserId"),
	approvalSource: varchar("ApprovalSource", { length: 30 }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const projectProgressVerifications = pgTable("ProjectProgressVerifications", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	projectId: integer("ProjectId").notNull(),
	percentageComplete: numeric("PercentageComplete", { precision: 5, scale: 2, mode: 'number' }).notNull(),
	workSummary: varchar("WorkSummary", { length: 2000 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	verifiedByUserId: integer("VerifiedByUserId").notNull(),
	verifiedAt: timestamp("VerifiedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const requisitionApprovalEvents = pgTable("RequisitionApprovalEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	requisitionId: integer("RequisitionId").notNull(),
	sequenceNumber: integer("SequenceNumber").notNull(),
	eventType: varchar("EventType", { length: 50 }).notNull(),
	actorUserId: integer("ActorUserId").notNull(),
	actorRole: varchar("ActorRole", { length: 80 }).notNull(),
	fromStatus: varchar("FromStatus", { length: 40 }),
	toStatus: varchar("ToStatus", { length: 40 }).notNull(),
	comments: varchar("Comments", { length: 1000 }),
	eventDataJson: jsonb("EventDataJson").notNull(),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
	previousEventHash: varchar("PreviousEventHash", { length: 64 }),
	eventHash: varchar("EventHash", { length: 64 }).notNull(),
});

export const sourcingRounds = pgTable("SourcingRounds", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	requisitionId: integer("RequisitionId").notNull(),
	createdByUserId: integer("CreatedByUserId").notNull(),
	status: varchar("Status", { length: 30 }).notNull(),
	quoteDueAt: timestamp("QuoteDueAt", { withTimezone: true, mode: 'date' }),
	notes: varchar("Notes", { length: 1000 }),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	closedAt: timestamp("ClosedAt", { withTimezone: true, mode: 'date' }),
});

export const sourcingRoundEvents = pgTable("SourcingRoundEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	sourcingRoundId: integer("SourcingRoundId").notNull(),
	actorUserId: integer("ActorUserId").notNull(),
	actorRole: varchar("ActorRole", { length: 80 }).notNull(),
	eventType: varchar("EventType", { length: 50 }).notNull(),
	fromStatus: varchar("FromStatus", { length: 30 }),
	toStatus: varchar("ToStatus", { length: 30 }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const userProjectAssignments = pgTable("UserProjectAssignments", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	userId: integer("UserId").notNull(),
	projectId: integer("ProjectId").notNull(),
	assignedByUserId: integer("AssignedByUserId"),
	isActive: boolean("IsActive").notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	endedAt: timestamp("EndedAt", { withTimezone: true, mode: 'date' }),
});

export const projectBudgetAllocations = pgTable("ProjectBudgetAllocations", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	projectBudgetId: integer("ProjectBudgetId").notNull(),
	costCodeId: integer("CostCodeId").notNull(),
	allocatedAmount: numeric("AllocatedAmount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
});

export const supplierQuotes = pgTable("SupplierQuotes", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	sourcingRoundId: integer("SourcingRoundId").notNull(),
	supplierId: integer("SupplierId").notNull(),
	recordedByUserId: integer("RecordedByUserId").notNull(),
	quoteReference: varchar("QuoteReference", { length: 100 }).notNull(),
	quantityOffered: numeric("QuantityOffered", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	unitPrice: numeric("UnitPrice", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	standardPriceSnapshot: numeric("StandardPriceSnapshot", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	validUntil: date("ValidUntil"),
	notes: varchar("Notes", { length: 1000 }),
	recordedAt: timestamp("RecordedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const suppliers = pgTable("Suppliers", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	name: varchar("Name", { length: 200 }).notNull(),
	contactPerson: varchar("ContactPerson", { length: 150 }),
	phoneNumber: varchar("PhoneNumber", { length: 30 }),
	email: varchar("Email", { length: 254 }),
	kraPin: varchar("KraPin", { length: 20 }),
	mpesaNumber: varchar("MpesaNumber", { length: 30 }),
	category: varchar("Category", { length: 100 }),
	isBlacklisted: boolean("IsBlacklisted").notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	normalizedKraPin: text("NormalizedKraPin").generatedAlwaysAs(sql`NULLIF(upper(btrim(("KraPin")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13)))), ''::text)`),
});

export const purchaseOrderEvents = pgTable("PurchaseOrderEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	purchaseOrderId: integer("PurchaseOrderId").notNull(),
	actorUserId: integer("ActorUserId").notNull(),
	actorRole: varchar("ActorRole", { length: 80 }).notNull(),
	eventType: varchar("EventType", { length: 50 }).notNull(),
	fromStatus: varchar("FromStatus", { length: 30 }),
	toStatus: varchar("ToStatus", { length: 30 }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
	detailsJson: varchar("DetailsJson", { length: 4000 }),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const accessRequests = pgTable("AccessRequests", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	username: varchar("Username", { length: 50 }).notNull(),
	email: varchar("Email", { length: 254 }).notNull(),
	passwordHash: varchar("PasswordHash", { length: 255 }).notNull(),
	status: varchar("Status", { length: 20 }).notNull(),
	requestedAt: timestamp("RequestedAt", { withTimezone: true, mode: 'date' }).notNull(),
	reviewedAt: timestamp("ReviewedAt", { withTimezone: true, mode: 'date' }),
	reviewedByUserId: integer("ReviewedByUserId"),
	approvedUserId: integer("ApprovedUserId"),
	decisionNote: varchar("DecisionNote", { length: 500 }),
	normalizedUsername: text("NormalizedUsername").generatedAlwaysAs(sql`lower(btrim(("Username")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13))))`),
});

export const controlEvents = pgTable("ControlEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	chainKey: varchar("ChainKey", { length: 80 }).notNull(),
	sequenceNumber: integer("SequenceNumber").notNull(),
	requisitionId: integer("RequisitionId"),
	projectId: integer("ProjectId").notNull(),
	entityType: varchar("EntityType", { length: 50 }).notNull(),
	entityId: bigint("EntityId", { mode: "number" }).notNull(),
	referenceNumber: varchar("ReferenceNumber", { length: 100 }).notNull(),
	eventType: varchar("EventType", { length: 60 }).notNull(),
	actorUserId: integer("ActorUserId").notNull(),
	actorRole: varchar("ActorRole", { length: 80 }).notNull(),
	detailsJson: jsonb("DetailsJson"),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
	previousEventHash: varchar("PreviousEventHash", { length: 64 }),
	eventHash: varchar("EventHash", { length: 64 }).notNull(),
});

export const materialIssues = pgTable("MaterialIssues", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	issueNumber: varchar("IssueNumber", { length: 30 }).notNull(),
	requisitionId: integer("RequisitionId").notNull(),
	projectId: integer("ProjectId").notNull(),
	materialId: integer("MaterialId").notNull(),
	quantityIssued: numeric("QuantityIssued", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	issuedByUserId: integer("IssuedByUserId").notNull(),
	issuedToUserId: integer("IssuedToUserId").notNull(),
	status: varchar("Status", { length: 30 }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
	issuedAt: timestamp("IssuedAt", { withTimezone: true, mode: 'date' }).notNull(),
	confirmedByUserId: integer("ConfirmedByUserId"),
	confirmedQuantity: numeric("ConfirmedQuantity", { precision: 18, scale: 3, mode: 'number' }),
	confirmationNotes: varchar("ConfirmationNotes", { length: 1000 }),
	confirmedAt: timestamp("ConfirmedAt", { withTimezone: true, mode: 'date' }),
});

export const stockBalances = pgTable("StockBalances", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	projectId: integer("ProjectId").notNull(),
	materialId: integer("MaterialId").notNull(),
	quantityOnHand: numeric("QuantityOnHand", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	updatedAt: timestamp("UpdatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const stockCounts = pgTable("StockCounts", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	countNumber: varchar("CountNumber", { length: 30 }).notNull(),
	projectId: integer("ProjectId").notNull(),
	materialId: integer("MaterialId").notNull(),
	systemQuantity: numeric("SystemQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	countedQuantity: numeric("CountedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	variance: numeric("Variance", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	status: varchar("Status", { length: 30 }).notNull(),
	countedByUserId: integer("CountedByUserId").notNull(),
	countedAt: timestamp("CountedAt", { withTimezone: true, mode: 'date' }).notNull(),
	reviewedByUserId: integer("ReviewedByUserId"),
	reviewNotes: varchar("ReviewNotes", { length: 1000 }),
	reviewedAt: timestamp("ReviewedAt", { withTimezone: true, mode: 'date' }),
});

export const supplierInvoices = pgTable("SupplierInvoices", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	invoiceNumber: varchar("InvoiceNumber", { length: 100 }).notNull(),
	purchaseOrderId: integer("PurchaseOrderId").notNull(),
	projectId: integer("ProjectId").notNull(),
	supplierId: integer("SupplierId").notNull(),
	quantity: numeric("Quantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	unitPrice: numeric("UnitPrice", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	amount: numeric("Amount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	documentReference: varchar("DocumentReference", { length: 500 }),
	capturedByUserId: integer("CapturedByUserId").notNull(),
	capturedAt: timestamp("CapturedAt", { withTimezone: true, mode: 'date' }).notNull(),
	status: varchar("Status", { length: 30 }).notNull(),
	receivedQuantitySnapshot: numeric("ReceivedQuantitySnapshot", { precision: 18, scale: 3, mode: 'number' }),
	matchNotes: varchar("MatchNotes", { length: 1000 }),
	reviewedByUserId: integer("ReviewedByUserId"),
	reviewedAt: timestamp("ReviewedAt", { withTimezone: true, mode: 'date' }),
	ceoDecisionByUserId: integer("CeoDecisionByUserId"),
	ceoDecision: varchar("CeoDecision", { length: 20 }),
	ceoDecisionNotes: varchar("CeoDecisionNotes", { length: 1000 }),
	ceoDecisionAt: timestamp("CeoDecisionAt", { withTimezone: true, mode: 'date' }),
});

export const paymentAuthorizations = pgTable("PaymentAuthorizations", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	authorizationNumber: varchar("AuthorizationNumber", { length: 30 }).notNull(),
	supplierInvoiceId: bigint("SupplierInvoiceId", { mode: "number" }).notNull(),
	amount: numeric("Amount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	authorizedByUserId: integer("AuthorizedByUserId").notNull(),
	notes: varchar("Notes", { length: 1000 }),
	authorizedAt: timestamp("AuthorizedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const payments = pgTable("Payments", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	paymentNumber: varchar("PaymentNumber", { length: 30 }).notNull(),
	paymentAuthorizationId: bigint("PaymentAuthorizationId", { mode: "number" }).notNull(),
	amount: numeric("Amount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	method: varchar("Method", { length: 30 }).notNull(),
	externalReference: varchar("ExternalReference", { length: 100 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	paidByUserId: integer("PaidByUserId").notNull(),
	paidAt: timestamp("PaidAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const paymentReceipts = pgTable("PaymentReceipts", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	receiptNumber: varchar("ReceiptNumber", { length: 30 }).notNull(),
	paymentId: bigint("PaymentId", { mode: "number" }).notNull(),
	amount: numeric("Amount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	issuedByUserId: integer("IssuedByUserId").notNull(),
	issuedAt: timestamp("IssuedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const supplierOnboardingRequests = pgTable("SupplierOnboardingRequests", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	requestNumber: varchar("RequestNumber", { length: 40 }).notNull(),
	name: varchar("Name", { length: 200 }).notNull(),
	contactPerson: varchar("ContactPerson", { length: 150 }).notNull(),
	phoneNumber: varchar("PhoneNumber", { length: 30 }).notNull(),
	email: varchar("Email", { length: 254 }),
	kraPin: varchar("KraPin", { length: 20 }).notNull(),
	mpesaNumber: varchar("MpesaNumber", { length: 30 }),
	category: varchar("Category", { length: 100 }).notNull(),
	status: varchar("Status", { length: 20 }).notNull(),
	submittedByUserId: integer("SubmittedByUserId").notNull(),
	submittedAt: timestamp("SubmittedAt", { withTimezone: true, mode: 'date' }).notNull(),
	reviewedByUserId: integer("ReviewedByUserId"),
	reviewedAt: timestamp("ReviewedAt", { withTimezone: true, mode: 'date' }),
	reviewNotes: varchar("ReviewNotes", { length: 1000 }),
	approvedSupplierId: integer("ApprovedSupplierId"),
	normalizedKraPin: text("NormalizedKraPin").generatedAlwaysAs(sql`NULLIF(upper(btrim(("KraPin")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13)))), ''::text)`),
});

export const pettyCashRequests = pgTable("PettyCashRequests", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	requestNumber: varchar("RequestNumber", { length: 30 }).notNull(),
	projectId: integer("ProjectId").notNull(),
	costCodeId: integer("CostCodeId").notNull(),
	purpose: varchar("Purpose", { length: 500 }).notNull(),
	amountRequested: numeric("AmountRequested", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	neededByDate: date("NeededByDate").notNull(),
	requestedByUserId: integer("RequestedByUserId").notNull(),
	requestedAt: timestamp("RequestedAt", { withTimezone: true, mode: 'date' }).notNull(),
	status: varchar("Status", { length: 40 }).notNull(),
	amountApproved: numeric("AmountApproved", { precision: 18, scale: 2, mode: 'number' }),
	financeApprovedByUserId: integer("FinanceApprovedByUserId"),
	financeDecisionAt: timestamp("FinanceDecisionAt", { withTimezone: true, mode: 'date' }),
	financeDecisionNotes: varchar("FinanceDecisionNotes", { length: 1000 }),
	amountCommitted: numeric("AmountCommitted", { precision: 18, scale: 2, mode: 'number' }),
});

export const pettyCashDisbursements = pgTable("PettyCashDisbursements", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	disbursementNumber: varchar("DisbursementNumber", { length: 30 }).notNull(),
	pettyCashRequestId: bigint("PettyCashRequestId", { mode: "number" }).notNull(),
	amount: numeric("Amount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	method: varchar("Method", { length: 30 }).notNull(),
	externalReference: varchar("ExternalReference", { length: 100 }).notNull(),
	recipientName: varchar("RecipientName", { length: 150 }).notNull(),
	recipientAcknowledgementReference: varchar("RecipientAcknowledgementReference", { length: 500 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }).notNull(),
	disbursedByUserId: integer("DisbursedByUserId").notNull(),
	disbursedAt: timestamp("DisbursedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const pettyCashReconciliations = pgTable("PettyCashReconciliations", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	reconciliationNumber: varchar("ReconciliationNumber", { length: 30 }).notNull(),
	pettyCashRequestId: bigint("PettyCashRequestId", { mode: "number" }).notNull(),
	amountSpent: numeric("AmountSpent", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	amountReturned: numeric("AmountReturned", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }).notNull(),
	returnReference: varchar("ReturnReference", { length: 100 }),
	notes: varchar("Notes", { length: 1000 }),
	submittedByUserId: integer("SubmittedByUserId").notNull(),
	submittedAt: timestamp("SubmittedAt", { withTimezone: true, mode: 'date' }).notNull(),
	status: varchar("Status", { length: 30 }).notNull(),
	reviewedByUserId: integer("ReviewedByUserId"),
	reviewedAt: timestamp("ReviewedAt", { withTimezone: true, mode: 'date' }),
	reviewNotes: varchar("ReviewNotes", { length: 1000 }),
	amountExpensed: numeric("AmountExpensed", { precision: 18, scale: 2, mode: 'number' }),
});

export const pettyCashReconciliationEvents = pgTable("PettyCashReconciliationEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	pettyCashReconciliationId: bigint("PettyCashReconciliationId", { mode: "number" }).notNull(),
	eventType: varchar("EventType", { length: 40 }).notNull(),
	actorUserId: integer("ActorUserId").notNull(),
	actorRole: varchar("ActorRole", { length: 80 }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const requisitions = pgTable("Requisitions", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	projectId: integer("ProjectId").notNull(),
	materialId: integer("MaterialId").notNull(),
	quantity: numeric("Quantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	requestedByUserId: integer("RequestedByUserId").notNull(),
	approvedByUserId: integer("ApprovedByUserId"),
	status: varchar("Status", { length: 40 }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	approvedAt: timestamp("ApprovedAt", { withTimezone: true, mode: 'date' }),
	neededByDate: date("NeededByDate").notNull(),
	purpose: varchar("Purpose", { length: 500 }).notNull(),
	updatedAt: timestamp("UpdatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	workflowRevision: integer("WorkflowRevision").notNull(),
	costCodeId: integer("CostCodeId").notNull(),
	requestType: varchar("RequestType", { length: 30 }).notNull(),
});

export const users = pgTable("Users", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	fullName: varchar("FullName", { length: 150 }).notNull(),
	phoneNumber: varchar("PhoneNumber", { length: 30 }).notNull(),
	email: varchar("Email", { length: 254 }).notNull(),
	passwordHash: varchar("PasswordHash", { length: 255 }).notNull(),
	isActive: boolean("IsActive").notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	roleId: integer("RoleId").notNull(),
	normalizedEmail: text("NormalizedEmail").generatedAlwaysAs(sql`lower(btrim(("Email")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13))))`),
	username: varchar("Username", { length: 50 }).notNull(),
	normalizedUsername: text("NormalizedUsername").generatedAlwaysAs(sql`lower(btrim(("Username")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13))))`),
	credentialVersion: integer("CredentialVersion").default(1).notNull(),
});

export const pettyCashReceiptConfirmations = pgTable("PettyCashReceiptConfirmations", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	confirmationNumber: varchar("ConfirmationNumber", { length: 30 }).notNull(),
	pettyCashRequestId: bigint("PettyCashRequestId", { mode: "number" }).notNull(),
	pettyCashDisbursementId: bigint("PettyCashDisbursementId", { mode: "number" }).notNull(),
	amountReceived: numeric("AmountReceived", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	notes: varchar("Notes", { length: 500 }),
	confirmedByUserId: integer("ConfirmedByUserId").notNull(),
	confirmedAt: timestamp("ConfirmedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const purchaseOrderLines = pgTable("PurchaseOrderLines", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	purchaseOrderId: integer("PurchaseOrderId").notNull(),
	requisitionId: integer("RequisitionId").notNull(),
	materialId: integer("MaterialId").notNull(),
	quantity: numeric("Quantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	unitPrice: numeric("UnitPrice", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	requiresTechnicalAcceptance: boolean("RequiresTechnicalAcceptance").default(true).notNull(),
});

export const goodsReceiptTechnicalAcceptances = pgTable("GoodsReceiptTechnicalAcceptances", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	goodsReceiptId: bigint("GoodsReceiptId", { mode: "number" }).notNull(),
	reviewSequence: integer("ReviewSequence").notNull(),
	engineerUserId: integer("EngineerUserId").notNull(),
	outcome: varchar("Outcome", { length: 20 }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	reviewedAt: timestamp("ReviewedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const materialTechnicalAcceptancePolicyEvents = pgTable("MaterialTechnicalAcceptancePolicyEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	materialId: integer("MaterialId").notNull(),
	previousRequired: boolean("PreviousRequired").notNull(),
	required: boolean("Required").notNull(),
	changedByUserId: integer("ChangedByUserId").notNull(),
	changedAt: timestamp("ChangedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const inAppNotifications = pgTable("InAppNotifications", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	idempotencyKey: varchar("IdempotencyKey", { length: 260 }).notNull(),
	recipientUserId: integer("RecipientUserId").notNull(),
	projectId: integer("ProjectId"),
	taskKey: varchar("TaskKey", { length: 180 }).notNull(),
	taskType: varchar("TaskType", { length: 60 }).notNull(),
	title: varchar("Title", { length: 180 }).notNull(),
	message: varchar("Message", { length: 1000 }).notNull(),
	targetPath: varchar("TargetPath", { length: 200 }).notNull(),
	taskOpenedAt: timestamp("TaskOpenedAt", { withTimezone: true, mode: 'date' }).notNull(),
	taskDueAt: timestamp("TaskDueAt", { withTimezone: true, mode: 'date' }).notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const materialCustodyCloseouts = pgTable("MaterialCustodyCloseouts", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	closeoutNumber: varchar("CloseoutNumber", { length: 30 }).notNull(),
	materialIssueId: bigint("MaterialIssueId", { mode: "number" }).notNull(),
	revision: integer("Revision").notNull(),
	confirmedQuantity: numeric("ConfirmedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	usedQuantity: numeric("UsedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	wastedQuantity: numeric("WastedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	returnedQuantity: numeric("ReturnedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	unaccountedQuantity: numeric("UnaccountedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	status: varchar("Status", { length: 30 }).notNull(),
	submittedByUserId: integer("SubmittedByUserId").notNull(),
	submittedAt: timestamp("SubmittedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const materialIssueDisputeResolutions = pgTable("MaterialIssueDisputeResolutions", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	resolutionNumber: varchar("ResolutionNumber", { length: 30 }).notNull(),
	materialIssueId: bigint("MaterialIssueId", { mode: "number" }).notNull(),
	issuedQuantity: numeric("IssuedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	foremanReceivedQuantity: numeric("ForemanReceivedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	returnedToStoreQuantity: numeric("ReturnedToStoreQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	resolvedByUserId: integer("ResolvedByUserId").notNull(),
	resolvedAt: timestamp("ResolvedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const materialReturns = pgTable("MaterialReturns", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	returnNumber: varchar("ReturnNumber", { length: 30 }).notNull(),
	materialIssueId: bigint("MaterialIssueId", { mode: "number" }).notNull(),
	quantityOffered: numeric("QuantityOffered", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	condition: varchar("Condition", { length: 30 }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	status: varchar("Status", { length: 30 }).notNull(),
	returnedByUserId: integer("ReturnedByUserId").notNull(),
	returnedAt: timestamp("ReturnedAt", { withTimezone: true, mode: 'date' }).notNull(),
	quantityAccepted: numeric("QuantityAccepted", { precision: 18, scale: 3, mode: 'number' }),
	receivedByUserId: integer("ReceivedByUserId"),
	receiptNotes: varchar("ReceiptNotes", { length: 1000 }),
	receiptEvidenceReference: varchar("ReceiptEvidenceReference", { length: 500 }),
	receivedAt: timestamp("ReceivedAt", { withTimezone: true, mode: 'date' }),
});

export const openingPositionBatches = pgTable("OpeningPositionBatches", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	batchNumber: varchar("BatchNumber", { length: 30 }).notNull(),
	positionType: varchar("PositionType", { length: 20 }).notNull(),
	projectId: integer("ProjectId").notNull(),
	asOfDate: date("AsOfDate").notNull(),
	notes: varchar("Notes", { length: 1000 }),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	status: varchar("Status", { length: 30 }).notNull(),
	submittedByUserId: integer("SubmittedByUserId").notNull(),
	submittedAt: timestamp("SubmittedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const operationalPeriods = pgTable("OperationalPeriods", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	periodNumber: varchar("PeriodNumber", { length: 30 }).notNull(),
	projectId: integer("ProjectId").notNull(),
	scope: varchar("Scope", { length: 20 }).notNull(),
	name: varchar("Name", { length: 100 }).notNull(),
	startDate: date("StartDate").notNull(),
	endDate: date("EndDate").notNull(),
	status: varchar("Status", { length: 30 }).notNull(),
	createdByUserId: integer("CreatedByUserId").notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const cashLedgerEntries = pgTable("CashLedgerEntries", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	entryNumber: varchar("EntryNumber", { length: 30 }).notNull(),
	cashAccountId: bigint("CashAccountId", { mode: "number" }).notNull(),
	projectId: integer("ProjectId").notNull(),
	amountDelta: numeric("AmountDelta", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	balanceAfter: numeric("BalanceAfter", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	entryType: varchar("EntryType", { length: 30 }).notNull(),
	referenceType: varchar("ReferenceType", { length: 40 }).notNull(),
	referenceId: bigint("ReferenceId", { mode: "number" }).notNull(),
	referenceNumber: varchar("ReferenceNumber", { length: 40 }).notNull(),
	postedByUserId: integer("PostedByUserId").notNull(),
	postedAt: timestamp("PostedAt", { withTimezone: true, mode: 'date' }).notNull(),
	notes: varchar("Notes", { length: 1000 }),
});

export const evidenceAttachments = pgTable("EvidenceAttachments", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	evidenceDocumentId: uuid("EvidenceDocumentId").notNull(),
	projectId: integer("ProjectId").notNull(),
	sourceType: varchar("SourceType", { length: 60 }).notNull(),
	sourceId: bigint("SourceId", { mode: "number" }).notNull(),
	evidenceKind: varchar("EvidenceKind", { length: 30 }).notNull(),
	linkedByUserId: integer("LinkedByUserId").notNull(),
	linkedAt: timestamp("LinkedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const inAppNotificationReadReceipts = pgTable("InAppNotificationReadReceipts", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	inAppNotificationId: bigint("InAppNotificationId", { mode: "number" }).notNull(),
	recipientUserId: integer("RecipientUserId").notNull(),
	readAt: timestamp("ReadAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const inAppNotificationResolutionReceipts = pgTable("InAppNotificationResolutionReceipts", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	inAppNotificationId: bigint("InAppNotificationId", { mode: "number" }).notNull(),
	reason: varchar("Reason", { length: 60 }).notNull(),
	resolvedAt: timestamp("ResolvedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const materialCustodyCloseoutDecisions = pgTable("MaterialCustodyCloseoutDecisions", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	materialCustodyCloseoutId: bigint("MaterialCustodyCloseoutId", { mode: "number" }).notNull(),
	outcome: varchar("Outcome", { length: 20 }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	decidedByUserId: integer("DecidedByUserId").notNull(),
	decidedAt: timestamp("DecidedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const openingInventoryLines = pgTable("OpeningInventoryLines", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	openingPositionBatchId: bigint("OpeningPositionBatchId", { mode: "number" }).notNull(),
	materialId: integer("MaterialId").notNull(),
	quantity: numeric("Quantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	unitCost: numeric("UnitCost", { precision: 18, scale: 2, mode: 'number' }),
});

export const openingPositionDecisions = pgTable("OpeningPositionDecisions", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	openingPositionBatchId: bigint("OpeningPositionBatchId", { mode: "number" }).notNull(),
	outcome: varchar("Outcome", { length: 20 }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	decidedByUserId: integer("DecidedByUserId").notNull(),
	decidedAt: timestamp("DecidedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const openingPositionPostings = pgTable("OpeningPositionPostings", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	openingPositionBatchId: bigint("OpeningPositionBatchId", { mode: "number" }).notNull(),
	postedByUserId: integer("PostedByUserId").notNull(),
	postedAt: timestamp("PostedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const openingPositionVerifications = pgTable("OpeningPositionVerifications", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	openingPositionBatchId: bigint("OpeningPositionBatchId", { mode: "number" }).notNull(),
	outcome: varchar("Outcome", { length: 20 }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	verifiedByUserId: integer("VerifiedByUserId").notNull(),
	verifiedAt: timestamp("VerifiedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const controlledCorrections = pgTable("ControlledCorrections", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	correctionNumber: varchar("CorrectionNumber", { length: 30 }).notNull(),
	operationalPeriodId: bigint("OperationalPeriodId", { mode: "number" }).notNull(),
	projectId: integer("ProjectId").notNull(),
	correctionType: varchar("CorrectionType", { length: 20 }).notNull(),
	materialId: integer("MaterialId"),
	cashAccountName: varchar("CashAccountName", { length: 100 }),
	quantityDelta: numeric("QuantityDelta", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	amountDelta: numeric("AmountDelta", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	reason: varchar("Reason", { length: 1000 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	status: varchar("Status", { length: 30 }).notNull(),
	submittedByUserId: integer("SubmittedByUserId").notNull(),
	submittedAt: timestamp("SubmittedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const operationalPeriodEvents = pgTable("OperationalPeriodEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	operationalPeriodId: bigint("OperationalPeriodId", { mode: "number" }).notNull(),
	sequenceNumber: integer("SequenceNumber").notNull(),
	eventType: varchar("EventType", { length: 30 }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	actorUserId: integer("ActorUserId").notNull(),
	actorRole: varchar("ActorRole", { length: 80 }).notNull(),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const controlledCorrectionDecisions = pgTable("ControlledCorrectionDecisions", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	controlledCorrectionId: bigint("ControlledCorrectionId", { mode: "number" }).notNull(),
	outcome: varchar("Outcome", { length: 20 }).notNull(),
	notes: varchar("Notes", { length: 1000 }).notNull(),
	decidedByUserId: integer("DecidedByUserId").notNull(),
	decidedAt: timestamp("DecidedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const cashAccounts = pgTable("CashAccounts", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	projectId: integer("ProjectId").notNull(),
	name: varchar("Name", { length: 100 }).notNull(),
	balance: numeric("Balance", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	updatedAt: timestamp("UpdatedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const openingCashLines = pgTable("OpeningCashLines", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	openingPositionBatchId: bigint("OpeningPositionBatchId", { mode: "number" }).notNull(),
	accountName: varchar("AccountName", { length: 100 }).notNull(),
	amount: numeric("Amount", { precision: 18, scale: 2, mode: 'number' }).notNull(),
});

export const evidenceDocuments = pgTable("EvidenceDocuments", {
	id: uuid("Id").primaryKey().notNull(),
	projectId: integer("ProjectId").notNull(),
	storageKey: varchar("StorageKey", { length: 64 }).notNull(),
	originalFileName: varchar("OriginalFileName", { length: 200 }).notNull(),
	contentType: varchar("ContentType", { length: 100 }).notNull(),
	sizeBytes: bigint("SizeBytes", { mode: "number" }).notNull(),
	sha256Hash: varchar("Sha256Hash", { length: 64 }).notNull(),
	uploadedByUserId: integer("UploadedByUserId").notNull(),
	uploadedAt: timestamp("UploadedAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const materialUsageRecords = pgTable("MaterialUsageRecords", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	materialIssueId: bigint("MaterialIssueId", { mode: "number" }).notNull(),
	usageType: varchar("UsageType", { length: 20 }).notNull(),
	quantity: numeric("Quantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	purposeOrReason: varchar("PurposeOrReason", { length: 500 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	recordedByUserId: integer("RecordedByUserId").notNull(),
	recordedAt: timestamp("RecordedAt", { withTimezone: true, mode: 'date' }).notNull(),
	idempotencyKey: varchar("IdempotencyKey", { length: 100 }),
});

export const stockTransfers = pgTable("StockTransfers", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	transferNumber: varchar("TransferNumber", { length: 30 }).notNull(),
	fromProjectId: integer("FromProjectId").notNull(),
	toProjectId: integer("ToProjectId").notNull(),
	materialId: integer("MaterialId").notNull(),
	quantity: numeric("Quantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	reason: varchar("Reason", { length: 500 }).notNull(),
	status: varchar("Status", { length: 30 }).notNull(),
	requestedByUserId: integer("RequestedByUserId").notNull(),
	requestedAt: timestamp("RequestedAt", { withTimezone: true, mode: 'date' }).notNull(),
	dispatchedByUserId: integer("DispatchedByUserId"),
	dispatchedAt: timestamp("DispatchedAt", { withTimezone: true, mode: 'date' }),
	receivedByUserId: integer("ReceivedByUserId"),
	receivedQuantity: numeric("ReceivedQuantity", { precision: 18, scale: 3, mode: 'number' }),
	receiptNotes: varchar("ReceiptNotes", { length: 1000 }),
	receivedAt: timestamp("ReceivedAt", { withTimezone: true, mode: 'date' }),
	resolutionDisposition: varchar("ResolutionDisposition", { length: 30 }),
	resolutionEvidenceReference: varchar("ResolutionEvidenceReference", { length: 500 }),
	resolutionNotes: varchar("ResolutionNotes", { length: 1000 }),
	resolutionQuantity: numeric("ResolutionQuantity", { precision: 18, scale: 3, mode: 'number' }),
	resolvedAt: timestamp("ResolvedAt", { withTimezone: true, mode: 'date' }),
	resolvedByUserId: integer("ResolvedByUserId"),
});

export const securityAuditEvents = pgTable("SecurityAuditEvents", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	eventType: varchar("EventType", { length: 60 }).notNull(),
	source: varchar("Source", { length: 40 }).notNull(),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
	targetUserId: integer("TargetUserId").notNull(),
	actorUserId: integer("ActorUserId"),
});

export const stockLedgerEntries = pgTable("StockLedgerEntries", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	projectId: integer("ProjectId").notNull(),
	materialId: integer("MaterialId").notNull(),
	movementType: varchar("MovementType", { length: 30 }).notNull(),
	quantityDelta: numeric("QuantityDelta", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	balanceAfter: numeric("BalanceAfter", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	referenceType: varchar("ReferenceType", { length: 40 }).notNull(),
	referenceId: bigint("ReferenceId", { mode: "number" }).notNull(),
	referenceNumber: varchar("ReferenceNumber", { length: 40 }).notNull(),
	actorUserId: integer("ActorUserId").notNull(),
	notes: varchar("Notes", { length: 1000 }),
	occurredAt: timestamp("OccurredAt", { withTimezone: true, mode: 'date' }).notNull(),
});

export const goodsReceipts = pgTable("GoodsReceipts", {
	id: bigint("Id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
	receiptNumber: varchar("ReceiptNumber", { length: 30 }).notNull(),
	purchaseOrderId: integer("PurchaseOrderId").notNull(),
	purchaseOrderLineId: integer("PurchaseOrderLineId").notNull(),
	projectId: integer("ProjectId").notNull(),
	materialId: integer("MaterialId").notNull(),
	deliveredQuantity: numeric("DeliveredQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	acceptedQuantity: numeric("AcceptedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	rejectedQuantity: numeric("RejectedQuantity", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	condition: varchar("Condition", { length: 30 }).notNull(),
	deliveryNoteReference: varchar("DeliveryNoteReference", { length: 100 }).notNull(),
	evidenceReference: varchar("EvidenceReference", { length: 500 }),
	discrepancyNotes: varchar("DiscrepancyNotes", { length: 1000 }),
	receivedByUserId: integer("ReceivedByUserId").notNull(),
	receivedAt: timestamp("ReceivedAt", { withTimezone: true, mode: 'date' }).notNull(),
	supplierId: integer("SupplierId").notNull(),
});

export const materials = pgTable("Materials", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	name: varchar("Name", { length: 150 }).notNull(),
	category: varchar("Category", { length: 100 }),
	unit: varchar("Unit", { length: 30 }).notNull(),
	standardPrice: numeric("StandardPrice", { precision: 18, scale: 2, mode: 'number' }).notNull(),
	reorderLevel: numeric("ReorderLevel", { precision: 18, scale: 3, mode: 'number' }).notNull(),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	requiresTechnicalAcceptance: boolean("RequiresTechnicalAcceptance").default(true).notNull(),
	normalizedName: text("NormalizedName").generatedAlwaysAs(sql`lower(btrim(("Name")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13))))`),
	normalizedUnit: text("NormalizedUnit").generatedAlwaysAs(sql`lower(btrim(("Unit")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13))))`),
});

export const materialCatalogRequests = pgTable("MaterialCatalogRequests", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	requestNumber: varchar("RequestNumber", { length: 40 }).notNull(),
	projectId: integer("ProjectId").notNull(),
	name: varchar("Name", { length: 150 }).notNull(),
	category: varchar("Category", { length: 100 }),
	unit: varchar("Unit", { length: 30 }).notNull(),
	purpose: varchar("Purpose", { length: 500 }).notNull(),
	status: varchar("Status", { length: 20 }).notNull(),
	submittedByUserId: integer("SubmittedByUserId").notNull(),
	submittedAt: timestamp("SubmittedAt", { withTimezone: true, mode: 'date' }).notNull(),
	reviewedByUserId: integer("ReviewedByUserId"),
	reviewedAt: timestamp("ReviewedAt", { withTimezone: true, mode: 'date' }),
	reviewNotes: varchar("ReviewNotes", { length: 1000 }),
	approvedMaterialId: integer("ApprovedMaterialId"),
	normalizedName: text("NormalizedName").generatedAlwaysAs(sql`lower(btrim(("Name")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13))))`),
	normalizedUnit: text("NormalizedUnit").generatedAlwaysAs(sql`lower(btrim(("Unit")::text, (((((' '::text || chr(9)) || chr(10)) || chr(11)) || chr(12)) || chr(13))))`),
});

export const purchaseOrders = pgTable("PurchaseOrders", {
	id: integer("Id").primaryKey().generatedByDefaultAsIdentity(),
	purchaseOrderNumber: varchar("PurchaseOrderNumber", { length: 20 }).notNull(),
	projectId: integer("ProjectId").notNull(),
	requisitionId: integer("RequisitionId").notNull(),
	supplierId: integer("SupplierId").notNull(),
	supplierQuoteId: integer("SupplierQuoteId").notNull(),
	createdByUserId: integer("CreatedByUserId").notNull(),
	approvedByUserId: integer("ApprovedByUserId"),
	issuedByUserId: integer("IssuedByUserId"),
	rejectedByUserId: integer("RejectedByUserId"),
	cancelledByUserId: integer("CancelledByUserId"),
	status: varchar("Status", { length: 30 }).notNull(),
	expectedDeliveryDate: date("ExpectedDeliveryDate"),
	deliveryLocation: varchar("DeliveryLocation", { length: 300 }),
	notes: varchar("Notes", { length: 1000 }),
	createdAt: timestamp("CreatedAt", { withTimezone: true, mode: 'date' }).notNull(),
	submittedAt: timestamp("SubmittedAt", { withTimezone: true, mode: 'date' }),
	approvedAt: timestamp("ApprovedAt", { withTimezone: true, mode: 'date' }),
	issuedAt: timestamp("IssuedAt", { withTimezone: true, mode: 'date' }),
	rejectedAt: timestamp("RejectedAt", { withTimezone: true, mode: 'date' }),
	cancelledAt: timestamp("CancelledAt", { withTimezone: true, mode: 'date' }),
});
