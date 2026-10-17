using Microsoft.EntityFrameworkCore;
using ConstructionMS.Domain.Entities;

namespace ConstructionMS.Infrastructure.Data;

public class AppDbContext : DbContext
{
    private const string NormalizedEmailSql =
        "lower(btrim(\"Email\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))";
    private const string NormalizedUsernameSql =
        "lower(btrim(\"Username\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))";

    private const string NormalizedKraPinSql =
        "nullif(upper(btrim(\"KraPin\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))), '')";
    private const string NormalizedMaterialNameSql =
        "lower(btrim(\"Name\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))";
    private const string NormalizedMaterialUnitSql =
        "lower(btrim(\"Unit\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))";

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        GuardAppendOnlyEvidence();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(
        bool acceptAllChangesOnSuccess,
        CancellationToken cancellationToken = default)
    {
        GuardAppendOnlyEvidence();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public DbSet<Role> Roles => Set<Role>();
    public DbSet<User> Users => Set<User>();
    public DbSet<AccessRequest> AccessRequests => Set<AccessRequest>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Material> Materials => Set<Material>();
    public DbSet<MaterialCatalogRequest> MaterialCatalogRequests => Set<MaterialCatalogRequest>();
    public DbSet<MaterialTechnicalAcceptancePolicyEvent> MaterialTechnicalAcceptancePolicyEvents => Set<MaterialTechnicalAcceptancePolicyEvent>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<SupplierOnboardingRequest> SupplierOnboardingRequests => Set<SupplierOnboardingRequest>();
    public DbSet<Requisition> Requisitions => Set<Requisition>();
    public DbSet<UserProjectAssignment> UserProjectAssignments => Set<UserProjectAssignment>();
    public DbSet<EngineerTechnicalCheck> EngineerTechnicalChecks => Set<EngineerTechnicalCheck>();
    public DbSet<RequisitionApprovalEvent> RequisitionApprovalEvents => Set<RequisitionApprovalEvent>();
    public DbSet<CostCode> CostCodes => Set<CostCode>();
    public DbSet<ProjectBudget> ProjectBudgets => Set<ProjectBudget>();
    public DbSet<ProjectBudgetAllocation> ProjectBudgetAllocations => Set<ProjectBudgetAllocation>();
    public DbSet<ProjectProgressVerification> ProjectProgressVerifications => Set<ProjectProgressVerification>();
    public DbSet<SourcingRound> SourcingRounds => Set<SourcingRound>();
    public DbSet<SourcingRoundEvent> SourcingRoundEvents => Set<SourcingRoundEvent>();
    public DbSet<SupplierQuote> SupplierQuotes => Set<SupplierQuote>();
    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();
    public DbSet<PurchaseOrderLine> PurchaseOrderLines => Set<PurchaseOrderLine>();
    public DbSet<PurchaseOrderEvent> PurchaseOrderEvents => Set<PurchaseOrderEvent>();
    public DbSet<GoodsReceipt> GoodsReceipts => Set<GoodsReceipt>();
    public DbSet<GoodsReceiptTechnicalAcceptance> GoodsReceiptTechnicalAcceptances => Set<GoodsReceiptTechnicalAcceptance>();
    public DbSet<StockBalance> StockBalances => Set<StockBalance>();
    public DbSet<StockLedgerEntry> StockLedgerEntries => Set<StockLedgerEntry>();
    public DbSet<MaterialIssue> MaterialIssues => Set<MaterialIssue>();
    public DbSet<MaterialUsageRecord> MaterialUsageRecords => Set<MaterialUsageRecord>();
    public DbSet<StockTransfer> StockTransfers => Set<StockTransfer>();
    public DbSet<StockCount> StockCounts => Set<StockCount>();
    public DbSet<SupplierInvoice> SupplierInvoices => Set<SupplierInvoice>();
    public DbSet<PaymentAuthorization> PaymentAuthorizations => Set<PaymentAuthorization>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<PaymentReceipt> PaymentReceipts => Set<PaymentReceipt>();
    public DbSet<PettyCashRequest> PettyCashRequests => Set<PettyCashRequest>();
    public DbSet<PettyCashDisbursement> PettyCashDisbursements => Set<PettyCashDisbursement>();
    public DbSet<PettyCashReceiptConfirmation> PettyCashReceiptConfirmations => Set<PettyCashReceiptConfirmation>();
    public DbSet<PettyCashReconciliation> PettyCashReconciliations => Set<PettyCashReconciliation>();
    public DbSet<PettyCashReconciliationEvent> PettyCashReconciliationEvents => Set<PettyCashReconciliationEvent>();
    public DbSet<ControlEvent> ControlEvents => Set<ControlEvent>();
    public DbSet<SecurityAuditEvent> SecurityAuditEvents => Set<SecurityAuditEvent>();
    public DbSet<InAppNotification> InAppNotifications => Set<InAppNotification>();
    public DbSet<InAppNotificationReadReceipt> InAppNotificationReadReceipts => Set<InAppNotificationReadReceipt>();
    public DbSet<InAppNotificationResolutionReceipt> InAppNotificationResolutionReceipts => Set<InAppNotificationResolutionReceipt>();
    public DbSet<EvidenceDocument> EvidenceDocuments => Set<EvidenceDocument>();
    public DbSet<EvidenceAttachment> EvidenceAttachments => Set<EvidenceAttachment>();
    public DbSet<OpeningPositionBatch> OpeningPositionBatches => Set<OpeningPositionBatch>();
    public DbSet<OpeningInventoryLine> OpeningInventoryLines => Set<OpeningInventoryLine>();
    public DbSet<OpeningCashLine> OpeningCashLines => Set<OpeningCashLine>();
    public DbSet<OpeningPositionVerification> OpeningPositionVerifications => Set<OpeningPositionVerification>();
    public DbSet<OpeningPositionDecision> OpeningPositionDecisions => Set<OpeningPositionDecision>();
    public DbSet<OpeningPositionPosting> OpeningPositionPostings => Set<OpeningPositionPosting>();
    public DbSet<MaterialReturn> MaterialReturns => Set<MaterialReturn>();
    public DbSet<MaterialIssueDisputeResolution> MaterialIssueDisputeResolutions => Set<MaterialIssueDisputeResolution>();
    public DbSet<MaterialCustodyCloseout> MaterialCustodyCloseouts => Set<MaterialCustodyCloseout>();
    public DbSet<MaterialCustodyCloseoutDecision> MaterialCustodyCloseoutDecisions => Set<MaterialCustodyCloseoutDecision>();
    public DbSet<OperationalPeriod> OperationalPeriods => Set<OperationalPeriod>();
    public DbSet<OperationalPeriodEvent> OperationalPeriodEvents => Set<OperationalPeriodEvent>();
    public DbSet<ControlledCorrection> ControlledCorrections => Set<ControlledCorrection>();
    public DbSet<ControlledCorrectionDecision> ControlledCorrectionDecisions => Set<ControlledCorrectionDecision>();
    public DbSet<CashAccount> CashAccounts => Set<CashAccount>();
    public DbSet<CashLedgerEntry> CashLedgerEntries => Set<CashLedgerEntry>();

    private void GuardAppendOnlyEvidence()
    {
        GuardAssignmentHistory();
        GuardPurchaseOrderCommercialFields();
        GuardOperationalSourceFields();
        GuardSupplierOnboarding();
        GuardMaterialCatalogRequests();

        var changedEvidence = ChangeTracker.Entries()
            .FirstOrDefault(entry =>
                entry.State is EntityState.Modified or EntityState.Deleted
                && entry.Entity is EngineerTechnicalCheck
                    or MaterialTechnicalAcceptancePolicyEvent
                    or RequisitionApprovalEvent
                    or ProjectBudget
                    or ProjectBudgetAllocation
                    or ProjectProgressVerification
                    or SupplierQuote
                    or SourcingRoundEvent
                    or PurchaseOrderLine
                    or PurchaseOrderEvent
                    or GoodsReceipt
                    or GoodsReceiptTechnicalAcceptance
                    or StockLedgerEntry
                    or MaterialUsageRecord
                    or PaymentAuthorization
                    or Payment
                    or PaymentReceipt
                    or PettyCashDisbursement
                    or PettyCashReceiptConfirmation
                    or PettyCashReconciliationEvent
                    or ControlEvent
                    or SecurityAuditEvent
                    or InAppNotification
                    or InAppNotificationReadReceipt
                    or InAppNotificationResolutionReceipt
                    or EvidenceDocument
                    or EvidenceAttachment
                    or OpeningInventoryLine
                    or OpeningCashLine
                    or OpeningPositionVerification
                    or OpeningPositionDecision
                    or OpeningPositionPosting
                    or MaterialIssueDisputeResolution
                    or MaterialCustodyCloseoutDecision
                    or OperationalPeriodEvent
                    or ControlledCorrectionDecision
                    or CashLedgerEntry);

        if (changedEvidence is not null)
        {
            throw new InvalidOperationException(
                $"{changedEvidence.Metadata.ClrType.Name} is append-only and cannot be modified or deleted.");
        }
    }

    private void GuardSupplierOnboarding()
    {
        var allowedDecisionProperties = new HashSet<string>(StringComparer.Ordinal)
        {
            nameof(SupplierOnboardingRequest.Status),
            nameof(SupplierOnboardingRequest.ReviewedByUserId),
            nameof(SupplierOnboardingRequest.ReviewedAt),
            nameof(SupplierOnboardingRequest.ReviewNotes),
            nameof(SupplierOnboardingRequest.ApprovedSupplierId)
        };

        foreach (var entry in ChangeTracker.Entries<SupplierOnboardingRequest>())
        {
            if (entry.State == EntityState.Deleted)
            {
                throw new InvalidOperationException(
                    "Supplier onboarding requests cannot be deleted.");
            }

            if (entry.State != EntityState.Modified)
            {
                continue;
            }

            if (!string.Equals(
                    entry.OriginalValues.GetValue<string>(nameof(SupplierOnboardingRequest.Status)),
                    SupplierOnboardingStatuses.Pending,
                    StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "A reviewed supplier onboarding request is immutable.");
            }

            if (entry.Properties.Any(property =>
                    property.IsModified && !allowedDecisionProperties.Contains(property.Metadata.Name)))
            {
                throw new InvalidOperationException(
                    "Supplier proposal fields are immutable; submit a new onboarding request instead.");
            }
        }
    }

    private void GuardMaterialCatalogRequests()
    {
        var allowedDecisionProperties = new HashSet<string>(StringComparer.Ordinal)
        {
            nameof(MaterialCatalogRequest.Status),
            nameof(MaterialCatalogRequest.ReviewedByUserId),
            nameof(MaterialCatalogRequest.ReviewedAt),
            nameof(MaterialCatalogRequest.ReviewNotes),
            nameof(MaterialCatalogRequest.ApprovedMaterialId)
        };

        foreach (var entry in ChangeTracker.Entries<MaterialCatalogRequest>())
        {
            if (entry.State == EntityState.Deleted)
            {
                throw new InvalidOperationException("Material catalog requests cannot be deleted.");
            }

            if (entry.State != EntityState.Modified)
            {
                continue;
            }

            if (!string.Equals(
                    entry.OriginalValues.GetValue<string>(nameof(MaterialCatalogRequest.Status)),
                    MaterialCatalogRequestStatuses.Pending,
                    StringComparison.Ordinal))
            {
                throw new InvalidOperationException("A reviewed material catalog request is immutable.");
            }

            if (entry.Properties.Any(property =>
                    property.IsModified && !allowedDecisionProperties.Contains(property.Metadata.Name)))
            {
                throw new InvalidOperationException(
                    "Material proposal fields are immutable; submit a new request instead.");
            }
        }
    }

    private void GuardPurchaseOrderCommercialFields()
    {
        var protectedProperties = new[]
        {
            nameof(PurchaseOrder.PurchaseOrderNumber),
            nameof(PurchaseOrder.ProjectId),
            nameof(PurchaseOrder.RequisitionId),
            nameof(PurchaseOrder.SupplierId),
            nameof(PurchaseOrder.SupplierQuoteId),
            nameof(PurchaseOrder.CreatedByUserId),
            nameof(PurchaseOrder.CreatedAt)
        };

        foreach (var entry in ChangeTracker.Entries<PurchaseOrder>()
                     .Where(entry => entry.State == EntityState.Modified))
        {
            if (protectedProperties.Any(property => entry.Property(property).IsModified))
            {
                throw new InvalidOperationException(
                    "Purchase-order commercial source fields are immutable; cancel and create a replacement PO.");
            }
        }
    }

    private void GuardOperationalSourceFields()
    {
        var deletedControlRecord = ChangeTracker.Entries()
            .FirstOrDefault(entry => entry.State == EntityState.Deleted
                && entry.Entity is MaterialIssue or StockTransfer or StockCount or SupplierInvoice
                    or PettyCashRequest or PettyCashReconciliation or OpeningPositionBatch
                    or MaterialReturn or MaterialCustodyCloseout or OperationalPeriod
                    or ControlledCorrection or CashAccount);
        if (deletedControlRecord is not null)
        {
            throw new InvalidOperationException(
                $"{deletedControlRecord.Metadata.ClrType.Name} cannot be deleted; use its controlled workflow state instead.");
        }

        RejectProtectedChanges<MaterialIssue>(
            nameof(MaterialIssue.IssueNumber), nameof(MaterialIssue.RequisitionId),
            nameof(MaterialIssue.ProjectId), nameof(MaterialIssue.MaterialId),
            nameof(MaterialIssue.QuantityIssued), nameof(MaterialIssue.IssuedByUserId),
            nameof(MaterialIssue.IssuedToUserId), nameof(MaterialIssue.Notes), nameof(MaterialIssue.IssuedAt));
        RejectProtectedChanges<StockTransfer>(
            nameof(StockTransfer.TransferNumber), nameof(StockTransfer.FromProjectId),
            nameof(StockTransfer.ToProjectId), nameof(StockTransfer.MaterialId),
            nameof(StockTransfer.Quantity), nameof(StockTransfer.Reason),
            nameof(StockTransfer.RequestedByUserId), nameof(StockTransfer.RequestedAt));
        RejectProtectedChanges<StockCount>(
            nameof(StockCount.CountNumber), nameof(StockCount.ProjectId), nameof(StockCount.MaterialId),
            nameof(StockCount.SystemQuantity), nameof(StockCount.CountedQuantity), nameof(StockCount.Variance),
            nameof(StockCount.Notes), nameof(StockCount.CountedByUserId), nameof(StockCount.CountedAt));
        RejectProtectedChanges<SupplierInvoice>(
            nameof(SupplierInvoice.InvoiceNumber), nameof(SupplierInvoice.PurchaseOrderId),
            nameof(SupplierInvoice.ProjectId), nameof(SupplierInvoice.SupplierId),
            nameof(SupplierInvoice.Quantity), nameof(SupplierInvoice.UnitPrice), nameof(SupplierInvoice.Amount),
            nameof(SupplierInvoice.DocumentReference), nameof(SupplierInvoice.CapturedByUserId),
            nameof(SupplierInvoice.CapturedAt));
        RejectProtectedChanges<PettyCashRequest>(
            nameof(PettyCashRequest.RequestNumber), nameof(PettyCashRequest.ProjectId),
            nameof(PettyCashRequest.CostCodeId), nameof(PettyCashRequest.Purpose),
            nameof(PettyCashRequest.AmountRequested), nameof(PettyCashRequest.NeededByDate),
            nameof(PettyCashRequest.RequestedByUserId), nameof(PettyCashRequest.RequestedAt));
        RejectProtectedChanges<PettyCashReconciliation>(
            nameof(PettyCashReconciliation.ReconciliationNumber),
            nameof(PettyCashReconciliation.PettyCashRequestId),
            nameof(PettyCashReconciliation.AmountSpent),
            nameof(PettyCashReconciliation.AmountReturned),
            nameof(PettyCashReconciliation.EvidenceReference),
            nameof(PettyCashReconciliation.ReturnReference),
            nameof(PettyCashReconciliation.Notes),
            nameof(PettyCashReconciliation.SubmittedByUserId),
            nameof(PettyCashReconciliation.SubmittedAt));
        RejectProtectedChanges<Requisition>(nameof(Requisition.RequestType));
        RejectProtectedChanges<OpeningPositionBatch>(
            nameof(OpeningPositionBatch.BatchNumber), nameof(OpeningPositionBatch.PositionType),
            nameof(OpeningPositionBatch.ProjectId), nameof(OpeningPositionBatch.AsOfDate),
            nameof(OpeningPositionBatch.Notes), nameof(OpeningPositionBatch.EvidenceReference),
            nameof(OpeningPositionBatch.SubmittedByUserId), nameof(OpeningPositionBatch.SubmittedAt));
        RejectProtectedChanges<MaterialReturn>(
            nameof(MaterialReturn.ReturnNumber), nameof(MaterialReturn.MaterialIssueId),
            nameof(MaterialReturn.QuantityOffered), nameof(MaterialReturn.Condition),
            nameof(MaterialReturn.Notes), nameof(MaterialReturn.EvidenceReference),
            nameof(MaterialReturn.ReturnedByUserId), nameof(MaterialReturn.ReturnedAt));
        RejectProtectedChanges<MaterialCustodyCloseout>(
            nameof(MaterialCustodyCloseout.CloseoutNumber), nameof(MaterialCustodyCloseout.MaterialIssueId),
            nameof(MaterialCustodyCloseout.Revision), nameof(MaterialCustodyCloseout.ConfirmedQuantity),
            nameof(MaterialCustodyCloseout.UsedQuantity), nameof(MaterialCustodyCloseout.WastedQuantity),
            nameof(MaterialCustodyCloseout.ReturnedQuantity), nameof(MaterialCustodyCloseout.UnaccountedQuantity),
            nameof(MaterialCustodyCloseout.Notes), nameof(MaterialCustodyCloseout.EvidenceReference),
            nameof(MaterialCustodyCloseout.SubmittedByUserId), nameof(MaterialCustodyCloseout.SubmittedAt));
        RejectProtectedChanges<OperationalPeriod>(
            nameof(OperationalPeriod.PeriodNumber), nameof(OperationalPeriod.ProjectId),
            nameof(OperationalPeriod.Scope), nameof(OperationalPeriod.Name),
            nameof(OperationalPeriod.StartDate), nameof(OperationalPeriod.EndDate),
            nameof(OperationalPeriod.CreatedByUserId), nameof(OperationalPeriod.CreatedAt));
        RejectProtectedChanges<ControlledCorrection>(
            nameof(ControlledCorrection.CorrectionNumber), nameof(ControlledCorrection.OperationalPeriodId),
            nameof(ControlledCorrection.ProjectId), nameof(ControlledCorrection.CorrectionType),
            nameof(ControlledCorrection.MaterialId), nameof(ControlledCorrection.CashAccountName),
            nameof(ControlledCorrection.QuantityDelta), nameof(ControlledCorrection.AmountDelta),
            nameof(ControlledCorrection.Reason), nameof(ControlledCorrection.EvidenceReference),
            nameof(ControlledCorrection.SubmittedByUserId), nameof(ControlledCorrection.SubmittedAt));
        RejectProtectedChanges<CashAccount>(nameof(CashAccount.ProjectId), nameof(CashAccount.Name));
    }

    private void RejectProtectedChanges<TEntity>(params string[] propertyNames)
        where TEntity : class
    {
        foreach (var entry in ChangeTracker.Entries<TEntity>().Where(item => item.State == EntityState.Modified))
        {
            if (propertyNames.Any(property => entry.Property(property).IsModified))
            {
                throw new InvalidOperationException(
                    $"{typeof(TEntity).Name} source fields are immutable; record a new workflow event instead.");
            }
        }
    }

    private void GuardAssignmentHistory()
    {
        foreach (var entry in ChangeTracker.Entries<UserProjectAssignment>())
        {
            if (entry.State == EntityState.Deleted)
            {
                throw new InvalidOperationException(
                    "Project-assignment periods cannot be deleted.");
            }

            if (entry.State != EntityState.Modified)
            {
                continue;
            }

            var original = entry.OriginalValues;
            var current = entry.CurrentValues;
            var isValidClosure = original.GetValue<bool>(nameof(UserProjectAssignment.IsActive))
                && !current.GetValue<bool>(nameof(UserProjectAssignment.IsActive))
                && original.GetValue<DateTime?>(nameof(UserProjectAssignment.EndedAt)) is null
                && current.GetValue<DateTime?>(nameof(UserProjectAssignment.EndedAt)) is not null
                && original.GetValue<int>(nameof(UserProjectAssignment.UserId))
                    == current.GetValue<int>(nameof(UserProjectAssignment.UserId))
                && original.GetValue<int>(nameof(UserProjectAssignment.ProjectId))
                    == current.GetValue<int>(nameof(UserProjectAssignment.ProjectId))
                && original.GetValue<int?>(nameof(UserProjectAssignment.AssignedByUserId))
                    == current.GetValue<int?>(nameof(UserProjectAssignment.AssignedByUserId))
                && original.GetValue<DateTime>(nameof(UserProjectAssignment.CreatedAt))
                    == current.GetValue<DateTime>(nameof(UserProjectAssignment.CreatedAt));

            if (!isValidClosure)
            {
                throw new InvalidOperationException(
                    "An assignment period may only transition once from active to ended.");
            }
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        var seedDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var seedProjectDate = new DateOnly(2026, 1, 1);

        ConfigureRoles(modelBuilder, seedDate);
        ConfigureUsers(modelBuilder);
        ConfigureAccessRequests(modelBuilder);
        ConfigureProjects(modelBuilder, seedDate, seedProjectDate);
        ConfigureMaterials(modelBuilder);
        ConfigureMaterialCatalogRequests(modelBuilder);
        ConfigureMaterialTechnicalAcceptancePolicyEvents(modelBuilder);
        ConfigureSuppliers(modelBuilder);
        ConfigureSupplierOnboardingRequests(modelBuilder);
        ConfigureRequisitions(modelBuilder);
        ConfigureUserProjectAssignments(modelBuilder);
        ConfigureEngineerTechnicalChecks(modelBuilder);
        ConfigureRequisitionApprovalEvents(modelBuilder);
        ConfigureCostCodes(modelBuilder);
        ConfigureProjectBudgets(modelBuilder);
        ConfigureProjectBudgetAllocations(modelBuilder);
        ConfigureProjectProgressVerifications(modelBuilder);
        ConfigureSourcingRounds(modelBuilder);
        ConfigureSourcingRoundEvents(modelBuilder);
        ConfigureSupplierQuotes(modelBuilder);
        ConfigurePurchaseOrders(modelBuilder);
        ConfigurePurchaseOrderLines(modelBuilder);
        ConfigurePurchaseOrderEvents(modelBuilder);
        ConfigureGoodsReceipts(modelBuilder);
        ConfigureGoodsReceiptTechnicalAcceptances(modelBuilder);
        ConfigureStockBalances(modelBuilder);
        ConfigureStockLedgerEntries(modelBuilder);
        ConfigureMaterialIssues(modelBuilder);
        ConfigureMaterialUsageRecords(modelBuilder);
        ConfigureStockTransfers(modelBuilder);
        ConfigureStockCounts(modelBuilder);
        ConfigureSupplierInvoices(modelBuilder);
        ConfigurePaymentAuthorizations(modelBuilder);
        ConfigurePayments(modelBuilder);
        ConfigurePaymentReceipts(modelBuilder);
        ConfigurePettyCashRequests(modelBuilder);
        ConfigurePettyCashDisbursements(modelBuilder);
        ConfigurePettyCashReceiptConfirmations(modelBuilder);
        ConfigurePettyCashReconciliations(modelBuilder);
        ConfigurePettyCashReconciliationEvents(modelBuilder);
        ConfigureControlEvents(modelBuilder);
        ConfigureSecurityAuditEvents(modelBuilder);
        ConfigureInAppNotifications(modelBuilder);
        ConfigureInAppNotificationReadReceipts(modelBuilder);
        ConfigureInAppNotificationResolutionReceipts(modelBuilder);
        ConfigureEvidenceDocuments(modelBuilder);
        ConfigureEvidenceAttachments(modelBuilder);
        modelBuilder.ConfigureControlWorkspaces();
    }

    private static void ConfigureRoles(ModelBuilder modelBuilder, DateTime seedDate)
    {
        var roles = modelBuilder.Entity<Role>();

        roles.Property(role => role.RoleName).HasMaxLength(80);
        roles.Property(role => role.Description).HasMaxLength(300);
        roles.HasIndex(role => role.RoleName).IsUnique();

        roles.HasData(
            new Role
            {
                Id = 1,
                RoleName = "CEO",
                Description = "Executive oversight and high-value approvals; no routine transaction entry",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 2,
                RoleName = "Supervisor",
                Description = "Coordinates assigned projects and approves work within delegated limits",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 3,
                RoleName = "Engineer",
                Description = "Verifies technical requirements and construction progress",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 4,
                RoleName = "Foreman",
                Description = "Requests materials and records their use on site",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 6,
                RoleName = "Storekeeper",
                Description = "Receives, safeguards, issues and counts inventory",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 7,
                RoleName = "Procurement Officer",
                Description = "Sources suppliers and prepares purchase orders",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 8,
                RoleName = "Auditor",
                Description = "Read-only oversight of transactions and audit evidence",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 9,
                RoleName = "Finance Officer",
                Description = "Matches invoices, executes Supervisor-authorized payments, and controls petty cash evidence",
                CreatedAt = seedDate
            },
            new Role
            {
                Id = 10,
                RoleName = "Administrator",
                Description = "Approves access requests and manages user roles and project scope",
                CreatedAt = seedDate
            });
    }

    private static void ConfigureUsers(ModelBuilder modelBuilder)
    {
        var users = modelBuilder.Entity<User>();

        users.Property(user => user.Username).HasMaxLength(50);
        users.Property(user => user.FullName).HasMaxLength(150);
        users.Property(user => user.PhoneNumber).HasMaxLength(30);
        users.Property(user => user.Email).HasMaxLength(254);
        users.Property(user => user.PasswordHash).HasMaxLength(255);
        users.Property(user => user.CredentialVersion)
            .HasDefaultValue(1)
            .IsConcurrencyToken();
        users.Property<string>("NormalizedEmail")
            .HasComputedColumnSql(NormalizedEmailSql, stored: true);
        users.HasIndex("NormalizedEmail")
            .IsUnique(false);
        users.Property<string>("NormalizedUsername")
            .HasComputedColumnSql(NormalizedUsernameSql, stored: true);
        users.HasIndex("NormalizedUsername").IsUnique();
        users.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_Users_Username_Format",
                "\"Username\" ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}$'");
            table.HasCheckConstraint(
                "CK_Users_CredentialVersion_Positive",
                "\"CredentialVersion\" >= 1");
        });

        users.HasOne(user => user.Role)
            .WithMany()
            .HasForeignKey(user => user.RoleId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureAccessRequests(ModelBuilder modelBuilder)
    {
        var requests = modelBuilder.Entity<AccessRequest>();
        requests.Property(request => request.Username).HasMaxLength(50);
        requests.Property(request => request.Email).HasMaxLength(254);
        requests.Property(request => request.PasswordHash).HasMaxLength(255);
        requests.Property(request => request.Status).HasMaxLength(20);
        requests.Property(request => request.DecisionNote).HasMaxLength(500);
        requests.Property<string>("NormalizedUsername")
            .HasComputedColumnSql(NormalizedUsernameSql, stored: true);
        requests.HasIndex("NormalizedUsername")
            .IsUnique()
            .HasFilter("\"Status\" = 'Pending'");
        requests.HasIndex(request => new { request.Status, request.RequestedAt });
        requests.ToTable(table => table.HasCheckConstraint(
            "CK_AccessRequests_Status",
            "\"Status\" IN ('Pending', 'Approved', 'Rejected')"));
        requests.ToTable(table => table.HasCheckConstraint(
            "CK_AccessRequests_Username_Format",
            "\"Username\" ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}$'"));
        requests.HasOne(request => request.ReviewedByUser)
            .WithMany()
            .HasForeignKey(request => request.ReviewedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(request => request.ApprovedUser)
            .WithMany()
            .HasForeignKey(request => request.ApprovedUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureProjects(
        ModelBuilder modelBuilder,
        DateTime seedDate,
        DateOnly seedProjectDate)
    {
        var projects = modelBuilder.Entity<Project>();

        projects.Property(project => project.Name).HasMaxLength(150);
        projects.Property(project => project.Location).HasMaxLength(300);
        projects.Property(project => project.Budget).HasPrecision(18, 2);
        projects.Property(project => project.Status).HasMaxLength(30);
        projects.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_Projects_Budget_NonNegative",
                "\"Budget\" <> 'NaN'::numeric AND \"Budget\" >= 0");
            table.HasCheckConstraint(
                "CK_Projects_DateRange",
                "\"EndDate\" IS NULL OR \"EndDate\" >= \"StartDate\"");
        });

        projects.HasData(
            new Project { Id = 1, Name = "Gilgal 2", Budget = 0, StartDate = seedProjectDate, Status = "Active", CreatedAt = seedDate },
            new Project { Id = 2, Name = "Gilgal 3", Budget = 0, StartDate = seedProjectDate, Status = "Active", CreatedAt = seedDate },
            new Project { Id = 3, Name = "SNEP HQ", Budget = 0, StartDate = seedProjectDate, Status = "Active", CreatedAt = seedDate },
            new Project { Id = 4, Name = "Church", Budget = 0, StartDate = seedProjectDate, Status = "Active", CreatedAt = seedDate }
        );
    }

    private static void ConfigureMaterials(ModelBuilder modelBuilder)
    {
        var materials = modelBuilder.Entity<Material>();

        materials.Property(material => material.Name).HasMaxLength(150);
        materials.Property(material => material.Category).HasMaxLength(100);
        materials.Property(material => material.Unit).HasMaxLength(30);
        materials.Property(material => material.StandardPrice).HasPrecision(18, 2);
        materials.Property(material => material.ReorderLevel).HasPrecision(18, 3);
        materials.Property(material => material.RequiresTechnicalAcceptance).HasDefaultValue(true);
        materials.Property<string>("NormalizedName")
            .HasComputedColumnSql(NormalizedMaterialNameSql, stored: true);
        materials.Property<string>("NormalizedUnit")
            .HasComputedColumnSql(NormalizedMaterialUnitSql, stored: true);
        materials.HasIndex("NormalizedName", "NormalizedUnit").IsUnique();
        materials.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_Materials_StandardPrice_NonNegative",
                "\"StandardPrice\" <> 'NaN'::numeric AND \"StandardPrice\" >= 0");
            table.HasCheckConstraint(
                "CK_Materials_ReorderLevel_NonNegative",
                "\"ReorderLevel\" <> 'NaN'::numeric AND \"ReorderLevel\" >= 0");
        });
    }

    private static void ConfigureMaterialCatalogRequests(ModelBuilder modelBuilder)
    {
        var requests = modelBuilder.Entity<MaterialCatalogRequest>();

        requests.Property(request => request.RequestNumber).HasMaxLength(40);
        requests.Property(request => request.Name).HasMaxLength(150);
        requests.Property(request => request.Category).HasMaxLength(100);
        requests.Property(request => request.Unit).HasMaxLength(30);
        requests.Property(request => request.Purpose).HasMaxLength(500);
        requests.Property(request => request.Status).HasMaxLength(20).IsConcurrencyToken();
        requests.Property(request => request.ReviewNotes).HasMaxLength(1_000);
        requests.Property<string>("NormalizedName")
            .HasComputedColumnSql(NormalizedMaterialNameSql, stored: true);
        requests.Property<string>("NormalizedUnit")
            .HasComputedColumnSql(NormalizedMaterialUnitSql, stored: true);

        requests.HasIndex(request => request.RequestNumber).IsUnique();
        requests.HasIndex(request => request.Status);
        requests.HasIndex(request => new { request.ProjectId, request.Status, request.SubmittedAt });
        requests.HasIndex("NormalizedName", "NormalizedUnit")
            .IsUnique()
            .HasFilter("\"Status\" = 'Pending'");

        requests.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_MaterialCatalogRequests_Status_Valid",
                "\"Status\" IN ('Pending', 'Approved', 'Rejected')");
            table.HasCheckConstraint(
                "CK_MaterialCatalogRequests_Decision_Consistent",
                "(\"Status\" = 'Pending' AND \"ReviewedByUserId\" IS NULL " +
                "AND \"ReviewedAt\" IS NULL AND \"ReviewNotes\" IS NULL " +
                "AND \"ApprovedMaterialId\" IS NULL) OR " +
                "(\"Status\" = 'Approved' AND \"ReviewedByUserId\" IS NOT NULL " +
                "AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 " +
                "AND \"ApprovedMaterialId\" IS NOT NULL) OR " +
                "(\"Status\" = 'Rejected' AND \"ReviewedByUserId\" IS NOT NULL " +
                "AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 " +
                "AND \"ApprovedMaterialId\" IS NULL)");
            table.HasCheckConstraint(
                "CK_MaterialCatalogRequests_Actors_Distinct",
                "\"ReviewedByUserId\" IS NULL OR \"ReviewedByUserId\" <> \"SubmittedByUserId\"");
            table.HasCheckConstraint(
                "CK_MaterialCatalogRequests_Review_After_Submission",
                "\"ReviewedAt\" IS NULL OR \"ReviewedAt\" >= \"SubmittedAt\"");
        });

        requests.HasOne(request => request.Project)
            .WithMany()
            .HasForeignKey(request => request.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(request => request.SubmittedByUser)
            .WithMany()
            .HasForeignKey(request => request.SubmittedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(request => request.ReviewedByUser)
            .WithMany()
            .HasForeignKey(request => request.ReviewedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(request => request.ApprovedMaterial)
            .WithMany()
            .HasForeignKey(request => request.ApprovedMaterialId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSuppliers(ModelBuilder modelBuilder)
    {
        var suppliers = modelBuilder.Entity<Supplier>();

        suppliers.Property(supplier => supplier.Name).HasMaxLength(200);
        suppliers.Property(supplier => supplier.ContactPerson).HasMaxLength(150);
        suppliers.Property(supplier => supplier.PhoneNumber).HasMaxLength(30);
        suppliers.Property(supplier => supplier.Email).HasMaxLength(254);
        suppliers.Property(supplier => supplier.KraPin).HasMaxLength(20);
        suppliers.Property(supplier => supplier.MpesaNumber).HasMaxLength(30);
        suppliers.Property(supplier => supplier.Category).HasMaxLength(100);
        suppliers.Property<string>("NormalizedKraPin")
            .HasComputedColumnSql(NormalizedKraPinSql, stored: true)
            .IsRequired(false);
        suppliers.HasIndex("NormalizedKraPin").IsUnique();
    }

    private static void ConfigureMaterialTechnicalAcceptancePolicyEvents(ModelBuilder modelBuilder)
    {
        var events = modelBuilder.Entity<MaterialTechnicalAcceptancePolicyEvent>();
        events.HasIndex(item => new { item.MaterialId, item.ChangedAt });
        events.ToTable(table => table.HasCheckConstraint(
            "CK_MaterialTechnicalAcceptancePolicyEvents_Changed",
            "\"PreviousRequired\" <> \"Required\""));
        events.HasOne(item => item.Material)
            .WithMany()
            .HasForeignKey(item => item.MaterialId)
            .OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.ChangedByUser)
            .WithMany()
            .HasForeignKey(item => item.ChangedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSupplierOnboardingRequests(ModelBuilder modelBuilder)
    {
        var requests = modelBuilder.Entity<SupplierOnboardingRequest>();

        requests.Property(request => request.RequestNumber).HasMaxLength(40);
        requests.Property(request => request.Name).HasMaxLength(200);
        requests.Property(request => request.ContactPerson).HasMaxLength(150);
        requests.Property(request => request.PhoneNumber).HasMaxLength(30);
        requests.Property(request => request.Email).HasMaxLength(254);
        requests.Property(request => request.KraPin).HasMaxLength(20);
        requests.Property(request => request.MpesaNumber).HasMaxLength(30);
        requests.Property(request => request.Category).HasMaxLength(100);
        requests.Property(request => request.Status).HasMaxLength(20).IsConcurrencyToken();
        requests.Property(request => request.ReviewNotes).HasMaxLength(1_000);
        requests.Property<string>("NormalizedKraPin")
            .HasComputedColumnSql(NormalizedKraPinSql, stored: true);

        requests.HasIndex(request => request.RequestNumber).IsUnique();
        requests.HasIndex(request => request.Status);
        requests.HasIndex("NormalizedKraPin")
            .IsUnique()
            .HasFilter("\"Status\" = 'Pending'");
        requests.HasIndex(request => request.ApprovedSupplierId)
            .IsUnique()
            .HasFilter("\"ApprovedSupplierId\" IS NOT NULL");

        requests.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_SupplierOnboardingRequests_Status_Valid",
                "\"Status\" IN ('Pending', 'Approved', 'Rejected')");
            table.HasCheckConstraint(
                "CK_SupplierOnboardingRequests_Decision_Consistent",
                "(\"Status\" = 'Pending' AND \"ReviewedByUserId\" IS NULL " +
                "AND \"ReviewedAt\" IS NULL AND \"ReviewNotes\" IS NULL " +
                "AND \"ApprovedSupplierId\" IS NULL) OR " +
                "(\"Status\" = 'Approved' AND \"ReviewedByUserId\" IS NOT NULL " +
                "AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 " +
                "AND \"ApprovedSupplierId\" IS NOT NULL) OR " +
                "(\"Status\" = 'Rejected' AND \"ReviewedByUserId\" IS NOT NULL " +
                "AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 " +
                "AND \"ApprovedSupplierId\" IS NULL)");
            table.HasCheckConstraint(
                "CK_SupplierOnboardingRequests_Actors_Distinct",
                "\"ReviewedByUserId\" IS NULL OR \"ReviewedByUserId\" <> \"SubmittedByUserId\"");
            table.HasCheckConstraint(
                "CK_SupplierOnboardingRequests_Review_After_Submission",
                "\"ReviewedAt\" IS NULL OR \"ReviewedAt\" >= \"SubmittedAt\"");
        });

        requests.HasOne(request => request.SubmittedByUser)
            .WithMany()
            .HasForeignKey(request => request.SubmittedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(request => request.ReviewedByUser)
            .WithMany()
            .HasForeignKey(request => request.ReviewedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(request => request.ApprovedSupplier)
            .WithMany()
            .HasForeignKey(request => request.ApprovedSupplierId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureRequisitions(ModelBuilder modelBuilder)
    {
        var requisitions = modelBuilder.Entity<Requisition>();

        requisitions.Property(requisition => requisition.Status).HasMaxLength(40);
        requisitions.Property(requisition => requisition.RequestType).HasMaxLength(30);
        requisitions.Property(requisition => requisition.Notes).HasMaxLength(1_000);
        requisitions.Property(requisition => requisition.Purpose).HasMaxLength(500);
        requisitions.Property(requisition => requisition.Quantity).HasPrecision(18, 3);
        requisitions.Property(requisition => requisition.WorkflowRevision).IsConcurrencyToken();
        requisitions.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_Requisitions_Quantity_Positive",
                "\"Quantity\" <> 'NaN'::numeric AND \"Quantity\" > 0");
            table.HasCheckConstraint(
                "CK_Requisitions_Status_Valid",
                "\"Status\" IN ('AwaitingTechnicalCheck', 'AwaitingSupervisorDecision', " +
                "'ReturnedForRevision', 'Approved', 'Rejected')");
            table.HasCheckConstraint(
                "CK_Requisitions_RequestType_Valid",
                "\"RequestType\" IN ('SiteUse', 'StockReplenishment')");
            table.HasCheckConstraint(
                "CK_Requisitions_ActionFields_Consistent",
                "(\"Status\" IN ('AwaitingTechnicalCheck', 'AwaitingSupervisorDecision', " +
                "'ReturnedForRevision') AND \"ApprovedByUserId\" IS NULL AND \"ApprovedAt\" IS NULL) " +
                "OR (\"Status\" IN ('Approved', 'Rejected') AND \"ApprovedByUserId\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL)");
            table.HasCheckConstraint(
                "CK_Requisitions_Actors_Distinct",
                "\"ApprovedByUserId\" IS NULL OR \"ApprovedByUserId\" <> \"RequestedByUserId\"");
            table.HasCheckConstraint(
                "CK_Requisitions_Purpose_NotBlank",
                "length(btrim(\"Purpose\")) > 0");
            table.HasCheckConstraint(
                "CK_Requisitions_WorkflowRevision_Positive",
                "\"WorkflowRevision\" >= 1");
        });

        requisitions.HasOne(requisition => requisition.Project)
            .WithMany()
            .HasForeignKey(requisition => requisition.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);

        requisitions.HasOne(requisition => requisition.Material)
            .WithMany()
            .HasForeignKey(requisition => requisition.MaterialId)
            .OnDelete(DeleteBehavior.Restrict);

        requisitions.HasOne(requisition => requisition.CostCode)
            .WithMany()
            .HasForeignKey(requisition => requisition.CostCodeId)
            .OnDelete(DeleteBehavior.Restrict);

        requisitions.HasOne(requisition => requisition.RequestedByUser)
            .WithMany()
            .HasForeignKey(requisition => requisition.RequestedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        requisitions.HasOne(requisition => requisition.ApprovedByUser)
            .WithMany()
            .HasForeignKey(requisition => requisition.ApprovedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureEngineerTechnicalChecks(ModelBuilder modelBuilder)
    {
        var checks = modelBuilder.Entity<EngineerTechnicalCheck>();

        checks.Property(check => check.Outcome).HasMaxLength(30);
        checks.Property(check => check.Comments).HasMaxLength(1_000);
        checks.HasIndex(check => new { check.RequisitionId, check.RequisitionRevision })
            .IsUnique();
        checks.ToTable(table => table.HasCheckConstraint(
            "CK_EngineerTechnicalChecks_Outcome",
            "\"Outcome\" IN ('Verified', 'RevisionRequired')"));

        checks.HasOne(check => check.Requisition)
            .WithMany(requisition => requisition.TechnicalChecks)
            .HasForeignKey(check => check.RequisitionId)
            .OnDelete(DeleteBehavior.Restrict);

        checks.HasOne(check => check.EngineerUser)
            .WithMany()
            .HasForeignKey(check => check.EngineerUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureRequisitionApprovalEvents(ModelBuilder modelBuilder)
    {
        var events = modelBuilder.Entity<RequisitionApprovalEvent>();

        events.Property(item => item.EventType).HasMaxLength(50);
        events.Property(item => item.ActorRole).HasMaxLength(80);
        events.Property(item => item.FromStatus).HasMaxLength(40);
        events.Property(item => item.ToStatus).HasMaxLength(40);
        events.Property(item => item.Comments).HasMaxLength(1_000);
        events.Property(item => item.EventDataJson).HasColumnType("jsonb");
        events.Property(item => item.PreviousEventHash).HasMaxLength(64);
        events.Property(item => item.EventHash).HasMaxLength(64);
        events.HasIndex(item => new { item.RequisitionId, item.SequenceNumber })
            .IsUnique();
        events.HasIndex(item => item.EventHash).IsUnique();

        events.HasOne(item => item.Requisition)
            .WithMany(requisition => requisition.ApprovalEvents)
            .HasForeignKey(item => item.RequisitionId)
            .OnDelete(DeleteBehavior.Restrict);

        events.HasOne(item => item.ActorUser)
            .WithMany()
            .HasForeignKey(item => item.ActorUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureCostCodes(ModelBuilder modelBuilder)
    {
        var costCodes = modelBuilder.Entity<CostCode>();

        costCodes.Property(costCode => costCode.Code).HasMaxLength(30);
        costCodes.Property(costCode => costCode.Name).HasMaxLength(150);
        costCodes.HasIndex(costCode => new { costCode.ProjectId, costCode.Code }).IsUnique();

        costCodes.HasOne(costCode => costCode.Project)
            .WithMany()
            .HasForeignKey(costCode => costCode.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureProjectBudgets(ModelBuilder modelBuilder)
    {
        var budgets = modelBuilder.Entity<ProjectBudget>();

        budgets.Property(budget => budget.ApprovedAmount).HasPrecision(18, 2);
        budgets.Property(budget => budget.ApprovalSource).HasMaxLength(30);
        budgets.Property(budget => budget.Notes).HasMaxLength(1_000);
        budgets.HasIndex(budget => new { budget.ProjectId, budget.CreatedAt });
        budgets.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_ProjectBudgets_ApprovedAmount_NonNegative",
                "\"ApprovedAmount\" <> 'NaN'::numeric AND \"ApprovedAmount\" >= 0");
            table.HasCheckConstraint(
                "CK_ProjectBudgets_ApprovalSource",
                "(\"ApprovalSource\" = 'CEOApproval' AND \"ApprovedByUserId\" IS NOT NULL) OR " +
                "(\"ApprovalSource\" = 'LegacyImport' AND \"ApprovedByUserId\" IS NULL)");
        });

        budgets.HasOne(budget => budget.Project)
            .WithMany()
            .HasForeignKey(budget => budget.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);

        budgets.HasOne(budget => budget.ApprovedByUser)
            .WithMany()
            .HasForeignKey(budget => budget.ApprovedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureProjectBudgetAllocations(ModelBuilder modelBuilder)
    {
        var allocations = modelBuilder.Entity<ProjectBudgetAllocation>();

        allocations.Property(allocation => allocation.AllocatedAmount).HasPrecision(18, 2);
        allocations.HasIndex(allocation => new
        {
            allocation.ProjectBudgetId,
            allocation.CostCodeId
        }).IsUnique();
        allocations.ToTable(table => table.HasCheckConstraint(
            "CK_ProjectBudgetAllocations_Amount_NonNegative",
            "\"AllocatedAmount\" <> 'NaN'::numeric AND \"AllocatedAmount\" >= 0"));

        allocations.HasOne(allocation => allocation.ProjectBudget)
            .WithMany(budget => budget.Allocations)
            .HasForeignKey(allocation => allocation.ProjectBudgetId)
            .OnDelete(DeleteBehavior.Restrict);

        allocations.HasOne(allocation => allocation.CostCode)
            .WithMany()
            .HasForeignKey(allocation => allocation.CostCodeId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureProjectProgressVerifications(ModelBuilder modelBuilder)
    {
        var verifications = modelBuilder.Entity<ProjectProgressVerification>();

        verifications.Property(verification => verification.PercentageComplete).HasPrecision(5, 2);
        verifications.Property(verification => verification.WorkSummary).HasMaxLength(2_000);
        verifications.Property(verification => verification.EvidenceReference).HasMaxLength(500);
        verifications.HasIndex(verification => new
        {
            verification.ProjectId,
            verification.VerifiedAt
        });
        verifications.ToTable(table => table.HasCheckConstraint(
            "CK_ProjectProgressVerifications_Percentage",
            "\"PercentageComplete\" <> 'NaN'::numeric AND " +
            "\"PercentageComplete\" >= 0 AND \"PercentageComplete\" <= 100"));

        verifications.HasOne(verification => verification.Project)
            .WithMany()
            .HasForeignKey(verification => verification.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);

        verifications.HasOne(verification => verification.VerifiedByUser)
            .WithMany()
            .HasForeignKey(verification => verification.VerifiedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSourcingRounds(ModelBuilder modelBuilder)
    {
        var rounds = modelBuilder.Entity<SourcingRound>();

        rounds.Property(round => round.Status).HasMaxLength(30);
        rounds.Property(round => round.Notes).HasMaxLength(1_000);
        rounds.HasIndex(round => round.RequisitionId)
            .HasDatabaseName("UX_SourcingRounds_Current_Requisition")
            .HasFilter("\"Status\" IN ('Open', 'Awarded')")
            .IsUnique();
        rounds.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_SourcingRounds_Status",
                "\"Status\" IN ('Open', 'Awarded', 'Closed', 'Cancelled')");
            table.HasCheckConstraint(
                "CK_SourcingRounds_ClosedAt",
                "(\"Status\" = 'Open' AND \"ClosedAt\" IS NULL) OR " +
                "(\"Status\" <> 'Open' AND \"ClosedAt\" IS NOT NULL)");
        });

        rounds.HasOne(round => round.Requisition)
            .WithMany()
            .HasForeignKey(round => round.RequisitionId)
            .OnDelete(DeleteBehavior.Restrict);

        rounds.HasOne(round => round.CreatedByUser)
            .WithMany()
            .HasForeignKey(round => round.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSourcingRoundEvents(ModelBuilder modelBuilder)
    {
        var events = modelBuilder.Entity<SourcingRoundEvent>();

        events.Property(item => item.ActorRole).HasMaxLength(80);
        events.Property(item => item.EventType).HasMaxLength(50);
        events.Property(item => item.FromStatus).HasMaxLength(30);
        events.Property(item => item.ToStatus).HasMaxLength(30);
        events.Property(item => item.Notes).HasMaxLength(1_000);
        events.HasIndex(item => new { item.SourcingRoundId, item.OccurredAt });

        events.HasOne(item => item.SourcingRound)
            .WithMany(round => round.Events)
            .HasForeignKey(item => item.SourcingRoundId)
            .OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.ActorUser)
            .WithMany()
            .HasForeignKey(item => item.ActorUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSupplierQuotes(ModelBuilder modelBuilder)
    {
        var quotes = modelBuilder.Entity<SupplierQuote>();

        quotes.Property(quote => quote.QuoteReference).HasMaxLength(100);
        quotes.Property(quote => quote.QuantityOffered).HasPrecision(18, 3);
        quotes.Property(quote => quote.UnitPrice).HasPrecision(18, 2);
        quotes.Property(quote => quote.StandardPriceSnapshot).HasPrecision(18, 2);
        quotes.Property(quote => quote.Notes).HasMaxLength(1_000);
        quotes.HasIndex(quote => new { quote.SourcingRoundId, quote.SupplierId }).IsUnique();
        quotes.HasIndex(quote => new { quote.SourcingRoundId, quote.QuoteReference }).IsUnique();
        quotes.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_SupplierQuotes_Quantity_Positive",
                "\"QuantityOffered\" <> 'NaN'::numeric AND \"QuantityOffered\" > 0");
            table.HasCheckConstraint(
                "CK_SupplierQuotes_UnitPrice_Positive",
                "\"UnitPrice\" <> 'NaN'::numeric AND \"UnitPrice\" > 0");
            table.HasCheckConstraint(
                "CK_SupplierQuotes_StandardPriceSnapshot_NonNegative",
                "\"StandardPriceSnapshot\" <> 'NaN'::numeric AND \"StandardPriceSnapshot\" >= 0");
        });

        quotes.HasOne(quote => quote.SourcingRound)
            .WithMany(round => round.Quotes)
            .HasForeignKey(quote => quote.SourcingRoundId)
            .OnDelete(DeleteBehavior.Restrict);

        quotes.HasOne(quote => quote.Supplier)
            .WithMany()
            .HasForeignKey(quote => quote.SupplierId)
            .OnDelete(DeleteBehavior.Restrict);

        quotes.HasOne(quote => quote.RecordedByUser)
            .WithMany()
            .HasForeignKey(quote => quote.RecordedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePurchaseOrders(ModelBuilder modelBuilder)
    {
        var orders = modelBuilder.Entity<PurchaseOrder>();

        orders.Property(order => order.PurchaseOrderNumber).HasMaxLength(20);
        orders.Property(order => order.Status).HasMaxLength(30);
        orders.Property(order => order.DeliveryLocation).HasMaxLength(300);
        orders.Property(order => order.Notes).HasMaxLength(1_000);
        orders.HasIndex(order => order.PurchaseOrderNumber).IsUnique();
        orders.HasIndex(order => order.SupplierQuoteId)
            .HasDatabaseName("UX_PurchaseOrders_Live_SupplierQuote")
            .HasFilter("\"Status\" IN ('Draft', 'Submitted', 'Approved', 'Issued')")
            .IsUnique();
        orders.HasIndex(order => order.RequisitionId)
            .HasDatabaseName("UX_PurchaseOrders_Live_Requisition")
            .HasFilter("\"Status\" IN ('Draft', 'Submitted', 'Approved', 'Issued')")
            .IsUnique();
        orders.HasIndex(order => new { order.ProjectId, order.Status });
        orders.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_PurchaseOrders_Status",
                "\"Status\" IN ('Draft', 'Submitted', 'Approved', 'Issued', 'Rejected', 'Cancelled')");
            table.HasCheckConstraint(
                "CK_PurchaseOrders_Actors_Distinct",
                // Self-approval is allowed: Procurement submits and approves its own PO. Rejection stays independent.
                "(\"RejectedByUserId\" IS NULL OR \"RejectedByUserId\" <> \"CreatedByUserId\")");
            table.HasCheckConstraint(
                "CK_PurchaseOrders_CancellationActor",
                "\"Status\" <> 'Cancelled' OR " +
                "((\"ApprovedAt\" IS NOT NULL OR (\"SubmittedAt\" IS NOT NULL AND \"RejectedAt\" IS NULL)) " +
                "AND \"CancelledByUserId\" <> \"CreatedByUserId\") OR " +
                "((\"ApprovedAt\" IS NULL AND (\"SubmittedAt\" IS NULL OR \"RejectedAt\" IS NOT NULL)) " +
                "AND \"CancelledByUserId\" = \"CreatedByUserId\") OR " +
                // The creator may cancel an order they self-approved before it is issued.
                "(\"ApprovedByUserId\" = \"CreatedByUserId\" AND \"CancelledByUserId\" = \"CreatedByUserId\")");
            table.HasCheckConstraint(
                "CK_PurchaseOrders_WorkflowFields",
                "(\"Status\" = 'Draft' AND \"SubmittedAt\" IS NULL AND \"ApprovedAt\" IS NULL " +
                "AND \"ApprovedByUserId\" IS NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL " +
                "AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL " +
                "AND \"CancelledByUserId\" IS NULL) OR " +
                "(\"Status\" = 'Submitted' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NULL " +
                "AND \"ApprovedByUserId\" IS NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL " +
                "AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL " +
                "AND \"CancelledByUserId\" IS NULL) OR " +
                "(\"Status\" = 'Approved' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL " +
                "AND \"ApprovedByUserId\" IS NOT NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL " +
                "AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL " +
                "AND \"CancelledByUserId\" IS NULL) OR " +
                "(\"Status\" = 'Issued' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL " +
                "AND \"ApprovedByUserId\" IS NOT NULL AND \"IssuedAt\" IS NOT NULL AND \"IssuedByUserId\" IS NOT NULL " +
                "AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL " +
                "AND \"CancelledByUserId\" IS NULL) OR " +
                "(\"Status\" = 'Rejected' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NULL " +
                "AND \"ApprovedByUserId\" IS NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL " +
                "AND \"RejectedAt\" IS NOT NULL AND \"RejectedByUserId\" IS NOT NULL AND \"CancelledAt\" IS NULL " +
                "AND \"CancelledByUserId\" IS NULL) OR " +
                "(\"Status\" = 'Cancelled' AND \"CancelledAt\" IS NOT NULL " +
                "AND \"CancelledByUserId\" IS NOT NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL)"
            );
        });

        orders.HasOne(order => order.Project)
            .WithMany()
            .HasForeignKey(order => order.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.Requisition)
            .WithMany()
            .HasForeignKey(order => order.RequisitionId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.Supplier)
            .WithMany()
            .HasForeignKey(order => order.SupplierId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.SupplierQuote)
            .WithMany()
            .HasForeignKey(order => order.SupplierQuoteId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.CreatedByUser)
            .WithMany()
            .HasForeignKey(order => order.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.ApprovedByUser)
            .WithMany()
            .HasForeignKey(order => order.ApprovedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.IssuedByUser)
            .WithMany()
            .HasForeignKey(order => order.IssuedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.RejectedByUser)
            .WithMany()
            .HasForeignKey(order => order.RejectedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        orders.HasOne(order => order.CancelledByUser)
            .WithMany()
            .HasForeignKey(order => order.CancelledByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePurchaseOrderLines(ModelBuilder modelBuilder)
    {
        var lines = modelBuilder.Entity<PurchaseOrderLine>();

        lines.Property(line => line.Quantity).HasPrecision(18, 3);
        lines.Property(line => line.UnitPrice).HasPrecision(18, 2);
        lines.Property(line => line.RequiresTechnicalAcceptance).HasDefaultValue(true);
        lines.HasIndex(line => line.PurchaseOrderId).IsUnique();
        lines.HasIndex(line => line.RequisitionId);
        lines.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_PurchaseOrderLines_Quantity_Positive",
                "\"Quantity\" <> 'NaN'::numeric AND \"Quantity\" > 0");
            table.HasCheckConstraint(
                "CK_PurchaseOrderLines_UnitPrice_Positive",
                "\"UnitPrice\" <> 'NaN'::numeric AND \"UnitPrice\" > 0");
        });

        lines.HasOne(line => line.PurchaseOrder)
            .WithMany(order => order.Lines)
            .HasForeignKey(line => line.PurchaseOrderId)
            .OnDelete(DeleteBehavior.Restrict);
        lines.HasOne(line => line.Requisition)
            .WithMany()
            .HasForeignKey(line => line.RequisitionId)
            .OnDelete(DeleteBehavior.Restrict);
        lines.HasOne(line => line.Material)
            .WithMany()
            .HasForeignKey(line => line.MaterialId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePurchaseOrderEvents(ModelBuilder modelBuilder)
    {
        var events = modelBuilder.Entity<PurchaseOrderEvent>();

        events.Property(item => item.ActorRole).HasMaxLength(80);
        events.Property(item => item.EventType).HasMaxLength(50);
        events.Property(item => item.FromStatus).HasMaxLength(30);
        events.Property(item => item.ToStatus).HasMaxLength(30);
        events.Property(item => item.Notes).HasMaxLength(1_000);
        events.Property(item => item.DetailsJson).HasMaxLength(4_000);
        events.HasIndex(item => new { item.PurchaseOrderId, item.OccurredAt });

        events.HasOne(item => item.PurchaseOrder)
            .WithMany(order => order.Events)
            .HasForeignKey(item => item.PurchaseOrderId)
            .OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.ActorUser)
            .WithMany()
            .HasForeignKey(item => item.ActorUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureUserProjectAssignments(ModelBuilder modelBuilder)
    {
        var assignments = modelBuilder.Entity<UserProjectAssignment>();

        assignments.HasIndex(assignment => new { assignment.UserId, assignment.ProjectId })
            .IsUnique()
            .HasFilter("\"IsActive\" = TRUE");
        assignments.HasIndex(assignment => new { assignment.ProjectId, assignment.IsActive });
        assignments.ToTable(table => table.HasCheckConstraint(
            "CK_UserProjectAssignments_ActivePeriod",
            "(\"IsActive\" = TRUE AND \"EndedAt\" IS NULL) OR " +
            "(\"IsActive\" = FALSE AND \"EndedAt\" IS NOT NULL)"));

        assignments.HasOne(assignment => assignment.User)
            .WithMany()
            .HasForeignKey(assignment => assignment.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        assignments.HasOne(assignment => assignment.Project)
            .WithMany()
            .HasForeignKey(assignment => assignment.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);

        assignments.HasOne(assignment => assignment.AssignedByUser)
            .WithMany()
            .HasForeignKey(assignment => assignment.AssignedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureGoodsReceipts(ModelBuilder modelBuilder)
    {
        var receipts = modelBuilder.Entity<GoodsReceipt>();
        receipts.Property(item => item.ReceiptNumber).HasMaxLength(30);
        receipts.Property(item => item.DeliveredQuantity).HasPrecision(18, 3);
        receipts.Property(item => item.AcceptedQuantity).HasPrecision(18, 3);
        receipts.Property(item => item.RejectedQuantity).HasPrecision(18, 3);
        receipts.Property(item => item.Condition).HasMaxLength(30);
        receipts.Property(item => item.DeliveryNoteReference).HasMaxLength(100);
        receipts.Property(item => item.EvidenceReference).HasMaxLength(500);
        receipts.Property(item => item.DiscrepancyNotes).HasMaxLength(1_000);
        receipts.HasIndex(item => item.ReceiptNumber).IsUnique();
        receipts.HasIndex(item => new { item.SupplierId, item.DeliveryNoteReference }).IsUnique();
        receipts.HasIndex(item => new { item.PurchaseOrderLineId, item.ReceivedAt });
        receipts.ToTable(table =>
        {
            table.HasCheckConstraint("CK_GoodsReceipts_Quantities",
                "\"DeliveredQuantity\" > 0 AND \"AcceptedQuantity\" >= 0 AND \"RejectedQuantity\" >= 0 " +
                "AND \"DeliveredQuantity\" = \"AcceptedQuantity\" + \"RejectedQuantity\"");
            table.HasCheckConstraint("CK_GoodsReceipts_Condition",
                "\"Condition\" IN ('Good', 'Damaged', 'Mixed')");
            table.HasCheckConstraint("CK_GoodsReceipts_DeliveryNoteReference",
                "length(btrim(\"DeliveryNoteReference\")) > 0 " +
                "AND \"DeliveryNoteReference\" = upper(btrim(\"DeliveryNoteReference\"))");
        });
        receipts.HasOne(item => item.PurchaseOrder).WithMany(item => item.GoodsReceipts).HasForeignKey(item => item.PurchaseOrderId).OnDelete(DeleteBehavior.Restrict);
        receipts.HasOne(item => item.PurchaseOrderLine).WithMany().HasForeignKey(item => item.PurchaseOrderLineId).OnDelete(DeleteBehavior.Restrict);
        receipts.HasOne(item => item.Supplier).WithMany().HasForeignKey(item => item.SupplierId).OnDelete(DeleteBehavior.Restrict);
        receipts.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        receipts.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);
        receipts.HasOne(item => item.ReceivedByUser).WithMany().HasForeignKey(item => item.ReceivedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureGoodsReceiptTechnicalAcceptances(ModelBuilder modelBuilder)
    {
        var acceptances = modelBuilder.Entity<GoodsReceiptTechnicalAcceptance>();
        acceptances.Property(item => item.Outcome).HasMaxLength(20);
        acceptances.Property(item => item.Notes).HasMaxLength(1_000);
        acceptances.Property(item => item.EvidenceReference).HasMaxLength(500);
        acceptances.HasIndex(item => new { item.GoodsReceiptId, item.ReviewSequence }).IsUnique();
        acceptances.HasIndex(item => new { item.EngineerUserId, item.ReviewedAt });
        acceptances.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_GoodsReceiptTechnicalAcceptances_Outcome",
                "\"Outcome\" IN ('Accepted', 'Rejected')");
            table.HasCheckConstraint(
                "CK_GoodsReceiptTechnicalAcceptances_ReviewSequence",
                "\"ReviewSequence\" > 0");
            table.HasCheckConstraint(
                "CK_GoodsReceiptTechnicalAcceptances_Notes",
                "length(btrim(\"Notes\")) >= 3");
        });
        acceptances.HasOne(item => item.GoodsReceipt)
            .WithMany(item => item.TechnicalAcceptances)
            .HasForeignKey(item => item.GoodsReceiptId)
            .OnDelete(DeleteBehavior.Restrict);
        acceptances.HasOne(item => item.EngineerUser)
            .WithMany()
            .HasForeignKey(item => item.EngineerUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureStockBalances(ModelBuilder modelBuilder)
    {
        var balances = modelBuilder.Entity<StockBalance>();
        balances.Property(item => item.QuantityOnHand).HasPrecision(18, 3);
        balances.HasIndex(item => new { item.ProjectId, item.MaterialId }).IsUnique();
        balances.ToTable(table => table.HasCheckConstraint(
            "CK_StockBalances_NonNegative", "\"QuantityOnHand\" >= 0"));
        balances.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        balances.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureStockLedgerEntries(ModelBuilder modelBuilder)
    {
        var ledger = modelBuilder.Entity<StockLedgerEntry>();
        ledger.Property(item => item.MovementType).HasMaxLength(30);
        ledger.Property(item => item.QuantityDelta).HasPrecision(18, 3);
        ledger.Property(item => item.BalanceAfter).HasPrecision(18, 3);
        ledger.Property(item => item.ReferenceType).HasMaxLength(40);
        ledger.Property(item => item.ReferenceNumber).HasMaxLength(40);
        ledger.Property(item => item.Notes).HasMaxLength(1_000);
        ledger.HasIndex(item => new { item.ProjectId, item.MaterialId, item.OccurredAt });
        ledger.ToTable(table =>
        {
            table.HasCheckConstraint("CK_StockLedgerEntries_Movement",
                "\"MovementType\" IN ('Receipt', 'TechnicalAcceptance', 'Issue', 'TransferOut', 'TransferIn', 'TransferVarianceRecovered', 'TransferVarianceReturned', 'CountAdjustment', 'OpeningBalance', 'ReturnToStore', 'HandoverCorrection', 'ControlledCorrection')");
            table.HasCheckConstraint("CK_StockLedgerEntries_Balance", "\"BalanceAfter\" >= 0");
            table.HasCheckConstraint("CK_StockLedgerEntries_Delta", "\"QuantityDelta\" <> 0");
        });
        ledger.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        ledger.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);
        ledger.HasOne(item => item.ActorUser).WithMany().HasForeignKey(item => item.ActorUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureMaterialIssues(ModelBuilder modelBuilder)
    {
        var issues = modelBuilder.Entity<MaterialIssue>();
        issues.Property(item => item.IssueNumber).HasMaxLength(30);
        issues.Property(item => item.QuantityIssued).HasPrecision(18, 3);
        issues.Property(item => item.ConfirmedQuantity).HasPrecision(18, 3);
        issues.Property(item => item.Status).HasMaxLength(30);
        issues.Property(item => item.Notes).HasMaxLength(1_000);
        issues.Property(item => item.ConfirmationNotes).HasMaxLength(1_000);
        issues.HasIndex(item => item.IssueNumber).IsUnique();
        issues.HasIndex(item => item.RequisitionId).IsUnique();
        issues.ToTable(table =>
        {
            table.HasCheckConstraint("CK_MaterialIssues_Quantity", "\"QuantityIssued\" > 0");
            table.HasCheckConstraint("CK_MaterialIssues_Status",
                "\"Status\" IN ('AwaitingConfirmation', 'Confirmed', 'Disputed')");
            table.HasCheckConstraint("CK_MaterialIssues_Confirmation",
                "(\"Status\" = 'AwaitingConfirmation' AND \"ConfirmedByUserId\" IS NULL AND \"ConfirmedAt\" IS NULL AND \"ConfirmedQuantity\" IS NULL) OR " +
                "(\"Status\" <> 'AwaitingConfirmation' AND \"ConfirmedByUserId\" IS NOT NULL AND \"ConfirmedAt\" IS NOT NULL AND \"ConfirmedQuantity\" IS NOT NULL)");
        });
        issues.HasOne(item => item.Requisition).WithMany().HasForeignKey(item => item.RequisitionId).OnDelete(DeleteBehavior.Restrict);
        issues.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        issues.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);
        issues.HasOne(item => item.IssuedByUser).WithMany().HasForeignKey(item => item.IssuedByUserId).OnDelete(DeleteBehavior.Restrict);
        issues.HasOne(item => item.IssuedToUser).WithMany().HasForeignKey(item => item.IssuedToUserId).OnDelete(DeleteBehavior.Restrict);
        issues.HasOne(item => item.ConfirmedByUser).WithMany().HasForeignKey(item => item.ConfirmedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureMaterialUsageRecords(ModelBuilder modelBuilder)
    {
        var usage = modelBuilder.Entity<MaterialUsageRecord>();
        usage.Property(item => item.UsageType).HasMaxLength(20);
        usage.Property(item => item.Quantity).HasPrecision(18, 3);
        usage.Property(item => item.PurposeOrReason).HasMaxLength(500);
        usage.Property(item => item.EvidenceReference).HasMaxLength(500);
        usage.Property(item => item.IdempotencyKey).HasMaxLength(100);
        usage.HasIndex(item => new { item.MaterialIssueId, item.IdempotencyKey })
            .IsUnique()
            .HasFilter("\"IdempotencyKey\" IS NOT NULL");
        usage.HasIndex(item => new { item.MaterialIssueId, item.RecordedAt });
        usage.ToTable(table =>
        {
            table.HasCheckConstraint("CK_MaterialUsageRecords_Type", "\"UsageType\" IN ('Used', 'Wastage')");
            table.HasCheckConstraint("CK_MaterialUsageRecords_Quantity", "\"Quantity\" > 0");
        });
        usage.HasOne(item => item.MaterialIssue).WithMany(item => item.UsageRecords).HasForeignKey(item => item.MaterialIssueId).OnDelete(DeleteBehavior.Restrict);
        usage.HasOne(item => item.RecordedByUser).WithMany().HasForeignKey(item => item.RecordedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureStockTransfers(ModelBuilder modelBuilder)
    {
        var transfers = modelBuilder.Entity<StockTransfer>();
        transfers.Property(item => item.TransferNumber).HasMaxLength(30);
        transfers.Property(item => item.Quantity).HasPrecision(18, 3);
        transfers.Property(item => item.ReceivedQuantity).HasPrecision(18, 3);
        transfers.Property(item => item.Reason).HasMaxLength(500);
        transfers.Property(item => item.Status).HasMaxLength(30);
        transfers.Property(item => item.ReceiptNotes).HasMaxLength(1_000);
        transfers.Property(item => item.ResolutionDisposition).HasMaxLength(30);
        transfers.Property(item => item.ResolutionQuantity).HasPrecision(18, 3);
        transfers.Property(item => item.ResolutionNotes).HasMaxLength(1_000);
        transfers.Property(item => item.ResolutionEvidenceReference).HasMaxLength(500);
        transfers.HasIndex(item => item.TransferNumber).IsUnique();
        transfers.ToTable(table =>
        {
            table.HasCheckConstraint("CK_StockTransfers_Projects", "\"FromProjectId\" <> \"ToProjectId\"");
            table.HasCheckConstraint("CK_StockTransfers_Quantity", "\"Quantity\" > 0");
            table.HasCheckConstraint("CK_StockTransfers_Status",
                "\"Status\" IN ('PendingDispatch', 'InTransit', 'Received', 'Disputed', 'Resolved')");
            table.HasCheckConstraint("CK_StockTransfers_Resolution",
                "(\"Status\" = 'Resolved' AND \"ResolvedByUserId\" IS NOT NULL AND \"ResolvedAt\" IS NOT NULL " +
                "AND \"ResolutionDisposition\" IN ('AcceptedLoss', 'RecoveredAtDestination', 'ReturnedToSource') " +
                "AND \"ResolutionQuantity\" > 0 AND length(btrim(\"ResolutionNotes\")) >= 3) OR " +
                "(\"Status\" <> 'Resolved' AND \"ResolvedByUserId\" IS NULL AND \"ResolvedAt\" IS NULL " +
                "AND \"ResolutionDisposition\" IS NULL AND \"ResolutionQuantity\" IS NULL " +
                "AND \"ResolutionNotes\" IS NULL AND \"ResolutionEvidenceReference\" IS NULL)");
        });
        transfers.HasOne(item => item.FromProject).WithMany().HasForeignKey(item => item.FromProjectId).OnDelete(DeleteBehavior.Restrict);
        transfers.HasOne(item => item.ToProject).WithMany().HasForeignKey(item => item.ToProjectId).OnDelete(DeleteBehavior.Restrict);
        transfers.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);
        transfers.HasOne(item => item.RequestedByUser).WithMany().HasForeignKey(item => item.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        transfers.HasOne(item => item.DispatchedByUser).WithMany().HasForeignKey(item => item.DispatchedByUserId).OnDelete(DeleteBehavior.Restrict);
        transfers.HasOne(item => item.ReceivedByUser).WithMany().HasForeignKey(item => item.ReceivedByUserId).OnDelete(DeleteBehavior.Restrict);
        transfers.HasOne(item => item.ResolvedByUser).WithMany().HasForeignKey(item => item.ResolvedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureStockCounts(ModelBuilder modelBuilder)
    {
        var counts = modelBuilder.Entity<StockCount>();
        counts.Property(item => item.CountNumber).HasMaxLength(30);
        counts.Property(item => item.SystemQuantity).HasPrecision(18, 3);
        counts.Property(item => item.CountedQuantity).HasPrecision(18, 3);
        counts.Property(item => item.Variance).HasPrecision(18, 3);
        counts.Property(item => item.Notes).HasMaxLength(1_000);
        counts.Property(item => item.Status).HasMaxLength(30);
        counts.Property(item => item.ReviewNotes).HasMaxLength(1_000);
        counts.HasIndex(item => item.CountNumber).IsUnique();
        counts.HasIndex(item => new { item.ProjectId, item.MaterialId })
            .HasFilter("\"Status\" = 'AwaitingReview'").IsUnique();
        counts.ToTable(table =>
        {
            table.HasCheckConstraint("CK_StockCounts_Quantities", "\"SystemQuantity\" >= 0 AND \"CountedQuantity\" >= 0");
            table.HasCheckConstraint("CK_StockCounts_Variance", "\"Variance\" = \"CountedQuantity\" - \"SystemQuantity\"");
            table.HasCheckConstraint("CK_StockCounts_Status", "\"Status\" IN ('AwaitingReview', 'Approved', 'Rejected')");
        });
        counts.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        counts.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);
        counts.HasOne(item => item.CountedByUser).WithMany().HasForeignKey(item => item.CountedByUserId).OnDelete(DeleteBehavior.Restrict);
        counts.HasOne(item => item.ReviewedByUser).WithMany().HasForeignKey(item => item.ReviewedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSupplierInvoices(ModelBuilder modelBuilder)
    {
        var invoices = modelBuilder.Entity<SupplierInvoice>();
        invoices.Property(item => item.InvoiceNumber).HasMaxLength(100);
        invoices.Property(item => item.Quantity).HasPrecision(18, 3);
        invoices.Property(item => item.UnitPrice).HasPrecision(18, 2);
        invoices.Property(item => item.Amount).HasPrecision(18, 2);
        invoices.Property(item => item.ReceivedQuantitySnapshot).HasPrecision(18, 3);
        invoices.Property(item => item.DocumentReference).HasMaxLength(500);
        invoices.Property(item => item.Status).HasMaxLength(30);
        invoices.Property(item => item.MatchNotes).HasMaxLength(1_000);
        invoices.Property(item => item.CeoDecision).HasMaxLength(20);
        invoices.Property(item => item.CeoDecisionNotes).HasMaxLength(1_000);
        invoices.HasIndex(item => item.PurchaseOrderId)
            .HasFilter("\"Status\" IN ('PendingReview', 'Matched', 'AwaitingCeoApproval', 'ReadyForAuthorization', 'Authorized', 'Paid')")
            .IsUnique();
        invoices.HasIndex(item => new { item.SupplierId, item.InvoiceNumber }).IsUnique();
        invoices.ToTable(table =>
        {
            table.HasCheckConstraint("CK_SupplierInvoices_Amounts", "\"Quantity\" > 0 AND \"UnitPrice\" > 0 AND \"Amount\" > 0");
            table.HasCheckConstraint("CK_SupplierInvoices_Status",
                "\"Status\" IN ('PendingReview', 'Matched', 'Mismatch', 'AwaitingCeoApproval', 'ReadyForAuthorization', 'Authorized', 'Paid', 'Returned', 'Rejected')");
        });
        invoices.HasOne(item => item.PurchaseOrder).WithMany().HasForeignKey(item => item.PurchaseOrderId).OnDelete(DeleteBehavior.Restrict);
        invoices.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        invoices.HasOne(item => item.Supplier).WithMany().HasForeignKey(item => item.SupplierId).OnDelete(DeleteBehavior.Restrict);
        invoices.HasOne(item => item.CapturedByUser).WithMany().HasForeignKey(item => item.CapturedByUserId).OnDelete(DeleteBehavior.Restrict);
        invoices.HasOne(item => item.ReviewedByUser).WithMany().HasForeignKey(item => item.ReviewedByUserId).OnDelete(DeleteBehavior.Restrict);
        invoices.HasOne(item => item.CeoDecisionByUser).WithMany().HasForeignKey(item => item.CeoDecisionByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePaymentAuthorizations(ModelBuilder modelBuilder)
    {
        var authorizations = modelBuilder.Entity<PaymentAuthorization>();
        authorizations.Property(item => item.AuthorizationNumber).HasMaxLength(30);
        authorizations.Property(item => item.Amount).HasPrecision(18, 2);
        authorizations.Property(item => item.Notes).HasMaxLength(1_000);
        authorizations.HasIndex(item => item.AuthorizationNumber).IsUnique();
        authorizations.HasIndex(item => item.SupplierInvoiceId).IsUnique();
        authorizations.ToTable(table => table.HasCheckConstraint("CK_PaymentAuthorizations_Amount", "\"Amount\" > 0"));
        authorizations.HasOne(item => item.SupplierInvoice).WithMany().HasForeignKey(item => item.SupplierInvoiceId).OnDelete(DeleteBehavior.Restrict);
        authorizations.HasOne(item => item.AuthorizedByUser).WithMany().HasForeignKey(item => item.AuthorizedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePayments(ModelBuilder modelBuilder)
    {
        var payments = modelBuilder.Entity<Payment>();
        payments.Property(item => item.PaymentNumber).HasMaxLength(30);
        payments.Property(item => item.Amount).HasPrecision(18, 2);
        payments.Property(item => item.Method).HasMaxLength(30);
        payments.Property(item => item.ExternalReference).HasMaxLength(100);
        payments.Property(item => item.EvidenceReference).HasMaxLength(500);
        payments.HasIndex(item => item.PaymentNumber).IsUnique();
        payments.HasIndex(item => item.PaymentAuthorizationId).IsUnique();
        payments.HasIndex(item => item.ExternalReference).IsUnique();
        payments.ToTable(table =>
        {
            table.HasCheckConstraint("CK_Payments_Amount", "\"Amount\" > 0");
            table.HasCheckConstraint("CK_Payments_Method", "\"Method\" IN ('BankTransfer', 'MPesa', 'Cheque', 'Cash')");
        });
        payments.HasOne(item => item.PaymentAuthorization).WithMany().HasForeignKey(item => item.PaymentAuthorizationId).OnDelete(DeleteBehavior.Restrict);
        payments.HasOne(item => item.PaidByUser).WithMany().HasForeignKey(item => item.PaidByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePaymentReceipts(ModelBuilder modelBuilder)
    {
        var receipts = modelBuilder.Entity<PaymentReceipt>();
        receipts.Property(item => item.ReceiptNumber).HasMaxLength(30);
        receipts.Property(item => item.Amount).HasPrecision(18, 2);
        receipts.HasIndex(item => item.ReceiptNumber).IsUnique();
        receipts.HasIndex(item => item.PaymentId).IsUnique();
        receipts.ToTable(table => table.HasCheckConstraint("CK_PaymentReceipts_Amount", "\"Amount\" > 0"));
        receipts.HasOne(item => item.Payment).WithOne(item => item.Receipt).HasForeignKey<PaymentReceipt>(item => item.PaymentId).OnDelete(DeleteBehavior.Restrict);
        receipts.HasOne(item => item.IssuedByUser).WithMany().HasForeignKey(item => item.IssuedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePettyCashRequests(ModelBuilder modelBuilder)
    {
        var requests = modelBuilder.Entity<PettyCashRequest>();
        requests.Property(item => item.RequestNumber).HasMaxLength(30);
        requests.Property(item => item.Purpose).HasMaxLength(500);
        requests.Property(item => item.AmountRequested).HasPrecision(18, 2);
        requests.Property(item => item.AmountApproved).HasPrecision(18, 2);
        requests.Property(item => item.AmountCommitted).HasPrecision(18, 2);
        requests.Property(item => item.Status).HasMaxLength(40);
        requests.Property(item => item.FinanceDecisionNotes).HasMaxLength(1_000);
        requests.HasIndex(item => item.RequestNumber).IsUnique();
        requests.HasIndex(item => new { item.ProjectId, item.Status, item.RequestedAt });
        requests.HasIndex(item => item.RequestedByUserId)
            .HasFilter("\"Status\" NOT IN ('Reconciled', 'Rejected')")
            .IsUnique();
        requests.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_PettyCashRequests_Amounts",
                "\"AmountRequested\" > 0 AND \"AmountRequested\" <= 100000 AND (\"AmountApproved\" IS NULL OR (\"AmountApproved\" > 0 AND \"AmountApproved\" <= \"AmountRequested\")) AND (\"AmountCommitted\" IS NULL OR \"AmountCommitted\" > 0)");
            table.HasCheckConstraint(
                "CK_PettyCashRequests_Status",
                "\"Status\" IN ('PendingFinanceApproval', 'Rejected', 'Approved', 'Disbursed', 'ReconciliationSubmitted', 'Reconciled')");
        });
        requests.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(item => item.CostCode).WithMany().HasForeignKey(item => item.CostCodeId).OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(item => item.RequestedByUser).WithMany().HasForeignKey(item => item.RequestedByUserId).OnDelete(DeleteBehavior.Restrict);
        requests.HasOne(item => item.FinanceApprovedByUser).WithMany().HasForeignKey(item => item.FinanceApprovedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePettyCashDisbursements(ModelBuilder modelBuilder)
    {
        var disbursements = modelBuilder.Entity<PettyCashDisbursement>();
        disbursements.Property(item => item.DisbursementNumber).HasMaxLength(30);
        disbursements.Property(item => item.Amount).HasPrecision(18, 2);
        disbursements.Property(item => item.Method).HasMaxLength(30);
        disbursements.Property(item => item.ExternalReference).HasMaxLength(100);
        disbursements.Property(item => item.RecipientName).HasMaxLength(150);
        disbursements.Property(item => item.RecipientAcknowledgementReference).HasMaxLength(500);
        disbursements.Property(item => item.EvidenceReference).HasMaxLength(500);
        disbursements.HasIndex(item => item.DisbursementNumber).IsUnique();
        disbursements.HasIndex(item => item.PettyCashRequestId).IsUnique();
        disbursements.HasIndex(item => item.ExternalReference).IsUnique();
        disbursements.ToTable(table =>
        {
            table.HasCheckConstraint("CK_PettyCashDisbursements_Amount", "\"Amount\" > 0");
            table.HasCheckConstraint(
                "CK_PettyCashDisbursements_Method",
                "\"Method\" IN ('MPesa', 'BankTransfer', 'Cheque', 'Cash')");
        });
        disbursements.HasOne(item => item.PettyCashRequest).WithOne(item => item.Disbursement)
            .HasForeignKey<PettyCashDisbursement>(item => item.PettyCashRequestId).OnDelete(DeleteBehavior.Restrict);
        disbursements.HasOne(item => item.DisbursedByUser).WithMany().HasForeignKey(item => item.DisbursedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePettyCashReceiptConfirmations(ModelBuilder modelBuilder)
    {
        var confirmations = modelBuilder.Entity<PettyCashReceiptConfirmation>();
        confirmations.Property(item => item.ConfirmationNumber).HasMaxLength(30);
        confirmations.Property(item => item.AmountReceived).HasPrecision(18, 2);
        confirmations.Property(item => item.Notes).HasMaxLength(500);
        confirmations.HasIndex(item => item.ConfirmationNumber).IsUnique();
        confirmations.HasIndex(item => item.PettyCashRequestId).IsUnique();
        confirmations.HasIndex(item => item.PettyCashDisbursementId).IsUnique();
        confirmations.ToTable(table => table.HasCheckConstraint(
            "CK_PettyCashReceiptConfirmations_Amount", "\"AmountReceived\" > 0"));
        confirmations.HasOne(item => item.PettyCashRequest).WithOne(item => item.ReceiptConfirmation)
            .HasForeignKey<PettyCashReceiptConfirmation>(item => item.PettyCashRequestId).OnDelete(DeleteBehavior.Restrict);
        confirmations.HasOne(item => item.PettyCashDisbursement).WithMany()
            .HasForeignKey(item => item.PettyCashDisbursementId).OnDelete(DeleteBehavior.Restrict);
        confirmations.HasOne(item => item.ConfirmedByUser).WithMany()
            .HasForeignKey(item => item.ConfirmedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePettyCashReconciliations(ModelBuilder modelBuilder)
    {
        var reconciliations = modelBuilder.Entity<PettyCashReconciliation>();
        reconciliations.Property(item => item.ReconciliationNumber).HasMaxLength(30);
        reconciliations.Property(item => item.AmountSpent).HasPrecision(18, 2);
        reconciliations.Property(item => item.AmountReturned).HasPrecision(18, 2);
        reconciliations.Property(item => item.AmountExpensed).HasPrecision(18, 2);
        reconciliations.Property(item => item.EvidenceReference).HasMaxLength(500);
        reconciliations.Property(item => item.ReturnReference).HasMaxLength(100);
        reconciliations.Property(item => item.Notes).HasMaxLength(1_000);
        reconciliations.Property(item => item.Status).HasMaxLength(30);
        reconciliations.Property(item => item.ReviewNotes).HasMaxLength(1_000);
        reconciliations.HasIndex(item => item.ReconciliationNumber).IsUnique();
        reconciliations.HasIndex(item => new { item.PettyCashRequestId, item.Status });
        reconciliations.HasIndex(item => item.PettyCashRequestId)
            .HasFilter("\"Status\" = 'PendingReview'").IsUnique();
        reconciliations.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_PettyCashReconciliations_Amounts",
                "\"AmountSpent\" >= 0 AND \"AmountReturned\" >= 0 AND (\"AmountExpensed\" IS NULL OR \"AmountExpensed\" >= 0)");
            table.HasCheckConstraint(
                "CK_PettyCashReconciliations_Status",
                "\"Status\" IN ('PendingReview', 'Approved', 'Returned')");
        });
        reconciliations.HasOne(item => item.PettyCashRequest).WithMany(item => item.Reconciliations)
            .HasForeignKey(item => item.PettyCashRequestId).OnDelete(DeleteBehavior.Restrict);
        reconciliations.HasOne(item => item.SubmittedByUser).WithMany().HasForeignKey(item => item.SubmittedByUserId).OnDelete(DeleteBehavior.Restrict);
        reconciliations.HasOne(item => item.ReviewedByUser).WithMany().HasForeignKey(item => item.ReviewedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigurePettyCashReconciliationEvents(ModelBuilder modelBuilder)
    {
        var events = modelBuilder.Entity<PettyCashReconciliationEvent>();
        events.Property(item => item.EventType).HasMaxLength(40);
        events.Property(item => item.ActorRole).HasMaxLength(80);
        events.Property(item => item.Notes).HasMaxLength(1_000);
        events.HasIndex(item => new { item.PettyCashReconciliationId, item.OccurredAt });
        events.ToTable(table => table.HasCheckConstraint(
            "CK_PettyCashReconciliationEvents_Type",
            "\"EventType\" IN ('Approved', 'Returned')"));
        events.HasOne(item => item.PettyCashReconciliation).WithMany(item => item.Events)
            .HasForeignKey(item => item.PettyCashReconciliationId).OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.ActorUser).WithMany().HasForeignKey(item => item.ActorUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureControlEvents(ModelBuilder modelBuilder)
    {
        var events = modelBuilder.Entity<ControlEvent>();
        events.Property(item => item.ChainKey).HasMaxLength(80);
        events.Property(item => item.EntityType).HasMaxLength(50);
        events.Property(item => item.ReferenceNumber).HasMaxLength(100);
        events.Property(item => item.EventType).HasMaxLength(60);
        events.Property(item => item.ActorRole).HasMaxLength(80);
        events.Property(item => item.DetailsJson).HasColumnType("jsonb");
        events.Property(item => item.PreviousEventHash).HasMaxLength(64);
        events.Property(item => item.EventHash).HasMaxLength(64);
        events.HasIndex(item => new { item.ChainKey, item.SequenceNumber }).IsUnique();
        events.HasIndex(item => item.EventHash).IsUnique();
        events.HasIndex(item => new { item.ProjectId, item.OccurredAt });
        events.HasOne(item => item.Requisition).WithMany().HasForeignKey(item => item.RequisitionId).OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.ActorUser).WithMany().HasForeignKey(item => item.ActorUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureSecurityAuditEvents(ModelBuilder modelBuilder)
    {
        var events = modelBuilder.Entity<SecurityAuditEvent>();

        events.Property(item => item.EventType).HasMaxLength(60);
        events.Property(item => item.Source).HasMaxLength(40);
        events.HasIndex(item => new { item.TargetUserId, item.OccurredAt });
        events.HasIndex(item => item.ActorUserId);
        events.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_SecurityAuditEvents_EventType",
                "\"EventType\" IN ('UsernameChanged', 'PasswordChanged', 'AdministratorPasswordReset', " +
                "'UserCreated', 'UserProfileUpdated', 'UserRoleChanged', 'UserActivated', 'UserDeactivated')");
            table.HasCheckConstraint(
                "CK_SecurityAuditEvents_Source",
                "\"Source\" IN ('SelfService', 'ServerRecovery', 'Administrator')");
        });

        events.HasOne(item => item.TargetUser)
            .WithMany()
            .HasForeignKey(item => item.TargetUserId)
            .OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.ActorUser)
            .WithMany()
            .HasForeignKey(item => item.ActorUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureInAppNotifications(ModelBuilder modelBuilder)
    {
        var notifications = modelBuilder.Entity<InAppNotification>();

        notifications.Property(item => item.IdempotencyKey).HasMaxLength(260);
        notifications.Property(item => item.TaskKey).HasMaxLength(180);
        notifications.Property(item => item.TaskType).HasMaxLength(60);
        notifications.Property(item => item.Title).HasMaxLength(180);
        notifications.Property(item => item.Message).HasMaxLength(1_000);
        notifications.Property(item => item.TargetPath).HasMaxLength(200);
        notifications.HasIndex(item => item.IdempotencyKey).IsUnique();
        notifications.HasIndex(item => new { item.RecipientUserId, item.CreatedAt });
        notifications.HasIndex(item => new { item.RecipientUserId, item.TaskDueAt });
        notifications.HasIndex(item => item.ProjectId);
        notifications.ToTable(table => table.HasCheckConstraint(
            "CK_InAppNotifications_Timestamps",
            "\"TaskDueAt\" >= \"TaskOpenedAt\" AND \"CreatedAt\" >= \"TaskDueAt\""));

        notifications.HasOne(item => item.RecipientUser)
            .WithMany()
            .HasForeignKey(item => item.RecipientUserId)
            .OnDelete(DeleteBehavior.Restrict);
        notifications.HasOne(item => item.Project)
            .WithMany()
            .HasForeignKey(item => item.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureInAppNotificationReadReceipts(ModelBuilder modelBuilder)
    {
        var receipts = modelBuilder.Entity<InAppNotificationReadReceipt>();

        receipts.HasIndex(item => item.InAppNotificationId).IsUnique();
        receipts.HasIndex(item => new { item.RecipientUserId, item.ReadAt });
        receipts.HasOne(item => item.InAppNotification)
            .WithOne(item => item.ReadReceipt)
            .HasForeignKey<InAppNotificationReadReceipt>(item => item.InAppNotificationId)
            .OnDelete(DeleteBehavior.Restrict);
        receipts.HasOne(item => item.RecipientUser)
            .WithMany()
            .HasForeignKey(item => item.RecipientUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureEvidenceDocuments(ModelBuilder modelBuilder)
    {
        var documents = modelBuilder.Entity<EvidenceDocument>();

        documents.Property(item => item.StorageKey).HasMaxLength(64);
        documents.Property(item => item.OriginalFileName).HasMaxLength(200);
        documents.Property(item => item.ContentType).HasMaxLength(100);
        documents.Property(item => item.Sha256Hash).HasMaxLength(64);
        documents.HasIndex(item => item.StorageKey).IsUnique();
        documents.HasIndex(item => new { item.ProjectId, item.UploadedAt });
        documents.HasIndex(item => item.Sha256Hash);
        documents.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_EvidenceDocuments_SizeBytes",
                "\"SizeBytes\" > 0 AND \"SizeBytes\" <= 10485760");
            table.HasCheckConstraint(
                "CK_EvidenceDocuments_ContentType",
                "\"ContentType\" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')");
        });
        documents.HasOne(item => item.Project)
            .WithMany()
            .HasForeignKey(item => item.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
        documents.HasOne(item => item.UploadedByUser)
            .WithMany()
            .HasForeignKey(item => item.UploadedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
        documents.HasOne(item => item.Attachment)
            .WithOne(item => item.EvidenceDocument)
            .HasForeignKey<EvidenceAttachment>(item => item.EvidenceDocumentId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureEvidenceAttachments(ModelBuilder modelBuilder)
    {
        var attachments = modelBuilder.Entity<EvidenceAttachment>();

        attachments.Property(item => item.SourceType).HasMaxLength(60);
        attachments.Property(item => item.EvidenceKind).HasMaxLength(30);
        attachments.HasIndex(item => item.EvidenceDocumentId).IsUnique();
        attachments.HasIndex(item => new { item.SourceType, item.SourceId, item.LinkedAt });
        attachments.HasIndex(item => item.ProjectId);
        attachments.ToTable(table =>
        {
            table.HasCheckConstraint(
                "CK_EvidenceAttachments_SourceId",
                "\"SourceId\" > 0");
            table.HasCheckConstraint(
                "CK_EvidenceAttachments_SourceType",
                "\"SourceType\" IN ('ProjectProgressVerification', 'GoodsReceipt', 'GoodsReceiptTechnicalAcceptance', 'MaterialUsageRecord', 'SupplierInvoice', 'Payment', 'PettyCashDisbursement', 'PettyCashReconciliation', 'OpeningPositionBatch', 'MaterialReturn', 'MaterialReturnReceipt', 'MaterialIssueDisputeResolution', 'MaterialCustodyCloseout', 'ControlledCorrection')");
            table.HasCheckConstraint(
                "CK_EvidenceAttachments_EvidenceKind",
                "\"EvidenceKind\" IN ('Photo', 'DeliveryNote', 'Inspection', 'Invoice', 'PaymentProof', 'Receipt', 'Other')");
        });
        attachments.HasOne(item => item.Project)
            .WithMany()
            .HasForeignKey(item => item.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
        attachments.HasOne(item => item.LinkedByUser)
            .WithMany()
            .HasForeignKey(item => item.LinkedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureInAppNotificationResolutionReceipts(ModelBuilder modelBuilder)
    {
        var receipts = modelBuilder.Entity<InAppNotificationResolutionReceipt>();

        receipts.Property(item => item.Reason).HasMaxLength(60);
        receipts.HasIndex(item => item.InAppNotificationId).IsUnique();
        receipts.HasIndex(item => item.ResolvedAt);
        receipts.ToTable(table => table.HasCheckConstraint(
            "CK_InAppNotificationResolutionReceipts_Reason",
            "\"Reason\" = 'TaskNoLongerOverdue'"));
        receipts.HasOne(item => item.InAppNotification)
            .WithOne(item => item.ResolutionReceipt)
            .HasForeignKey<InAppNotificationResolutionReceipt>(item => item.InAppNotificationId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
