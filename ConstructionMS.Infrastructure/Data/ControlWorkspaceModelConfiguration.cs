namespace ConstructionMS.Infrastructure.Data;

using ConstructionMS.Domain.Entities;
using Microsoft.EntityFrameworkCore;

internal static class ControlWorkspaceModelConfiguration
{
    public static void ConfigureControlWorkspaces(this ModelBuilder modelBuilder)
    {
        ConfigureOpeningPositions(modelBuilder);
        ConfigureCustodyCloseout(modelBuilder);
        ConfigureOperationalPeriods(modelBuilder);
        ConfigureControlledCorrections(modelBuilder);
        ConfigureCashLedger(modelBuilder);
    }

    private static void ConfigureOpeningPositions(ModelBuilder modelBuilder)
    {
        var batches = modelBuilder.Entity<OpeningPositionBatch>();
        batches.Property(item => item.BatchNumber).HasMaxLength(30);
        batches.Property(item => item.PositionType).HasMaxLength(20);
        batches.Property(item => item.Notes).HasMaxLength(1_000);
        batches.Property(item => item.EvidenceReference).HasMaxLength(500);
        batches.Property(item => item.Status).HasMaxLength(30);
        batches.HasIndex(item => item.BatchNumber).IsUnique();
        batches.HasIndex(item => new { item.ProjectId, item.PositionType, item.SubmittedAt });
        batches.ToTable(table =>
        {
            table.HasCheckConstraint("CK_OpeningPositionBatches_Type", "\"PositionType\" IN ('Inventory', 'Cash')");
            table.HasCheckConstraint("CK_OpeningPositionBatches_Status", "\"Status\" IN ('AwaitingVerification', 'AwaitingApproval', 'Approved', 'Rejected')");
        });
        batches.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        batches.HasOne(item => item.SubmittedByUser).WithMany().HasForeignKey(item => item.SubmittedByUserId).OnDelete(DeleteBehavior.Restrict);

        var inventoryLines = modelBuilder.Entity<OpeningInventoryLine>();
        inventoryLines.Property(item => item.Quantity).HasPrecision(18, 3);
        inventoryLines.Property(item => item.UnitCost).HasPrecision(18, 2);
        inventoryLines.HasIndex(item => new { item.OpeningPositionBatchId, item.MaterialId }).IsUnique();
        inventoryLines.ToTable(table => table.HasCheckConstraint(
            "CK_OpeningInventoryLines_Values", "\"Quantity\" > 0 AND (\"UnitCost\" IS NULL OR \"UnitCost\" >= 0)"));
        inventoryLines.HasOne(item => item.OpeningPositionBatch).WithMany(item => item.InventoryLines)
            .HasForeignKey(item => item.OpeningPositionBatchId).OnDelete(DeleteBehavior.Restrict);
        inventoryLines.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);

        var cashLines = modelBuilder.Entity<OpeningCashLine>();
        cashLines.Property(item => item.AccountName).HasMaxLength(100);
        cashLines.Property(item => item.Amount).HasPrecision(18, 2);
        cashLines.HasIndex(item => new { item.OpeningPositionBatchId, item.AccountName }).IsUnique();
        cashLines.ToTable(table => table.HasCheckConstraint("CK_OpeningCashLines_Amount", "\"Amount\" >= 0"));
        cashLines.HasOne(item => item.OpeningPositionBatch).WithMany(item => item.CashLines)
            .HasForeignKey(item => item.OpeningPositionBatchId).OnDelete(DeleteBehavior.Restrict);

        var verifications = modelBuilder.Entity<OpeningPositionVerification>();
        verifications.Property(item => item.Outcome).HasMaxLength(20);
        verifications.Property(item => item.Notes).HasMaxLength(1_000);
        verifications.HasIndex(item => item.OpeningPositionBatchId).IsUnique();
        verifications.ToTable(table => table.HasCheckConstraint("CK_OpeningPositionVerifications_Outcome", "\"Outcome\" IN ('Verified', 'Rejected')"));
        verifications.HasOne(item => item.OpeningPositionBatch).WithOne(item => item.Verification)
            .HasForeignKey<OpeningPositionVerification>(item => item.OpeningPositionBatchId).OnDelete(DeleteBehavior.Restrict);
        verifications.HasOne(item => item.VerifiedByUser).WithMany().HasForeignKey(item => item.VerifiedByUserId).OnDelete(DeleteBehavior.Restrict);

        var decisions = modelBuilder.Entity<OpeningPositionDecision>();
        decisions.Property(item => item.Outcome).HasMaxLength(20);
        decisions.Property(item => item.Notes).HasMaxLength(1_000);
        decisions.HasIndex(item => item.OpeningPositionBatchId).IsUnique();
        decisions.ToTable(table => table.HasCheckConstraint("CK_OpeningPositionDecisions_Outcome", "\"Outcome\" IN ('Approved', 'Rejected')"));
        decisions.HasOne(item => item.OpeningPositionBatch).WithOne(item => item.Decision)
            .HasForeignKey<OpeningPositionDecision>(item => item.OpeningPositionBatchId).OnDelete(DeleteBehavior.Restrict);
        decisions.HasOne(item => item.DecidedByUser).WithMany().HasForeignKey(item => item.DecidedByUserId).OnDelete(DeleteBehavior.Restrict);

        var postings = modelBuilder.Entity<OpeningPositionPosting>();
        postings.HasIndex(item => item.OpeningPositionBatchId).IsUnique();
        postings.HasOne(item => item.OpeningPositionBatch).WithOne(item => item.Posting)
            .HasForeignKey<OpeningPositionPosting>(item => item.OpeningPositionBatchId).OnDelete(DeleteBehavior.Restrict);
        postings.HasOne(item => item.PostedByUser).WithMany().HasForeignKey(item => item.PostedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureCustodyCloseout(ModelBuilder modelBuilder)
    {
        var disputeResolutions = modelBuilder.Entity<MaterialIssueDisputeResolution>();
        disputeResolutions.Property(item => item.ResolutionNumber).HasMaxLength(30);
        disputeResolutions.Property(item => item.IssuedQuantity).HasPrecision(18, 3);
        disputeResolutions.Property(item => item.ForemanReceivedQuantity).HasPrecision(18, 3);
        disputeResolutions.Property(item => item.ReturnedToStoreQuantity).HasPrecision(18, 3);
        disputeResolutions.Property(item => item.Notes).HasMaxLength(1_000);
        disputeResolutions.Property(item => item.EvidenceReference).HasMaxLength(500);
        disputeResolutions.HasIndex(item => item.ResolutionNumber).IsUnique();
        disputeResolutions.HasIndex(item => item.MaterialIssueId).IsUnique();
        disputeResolutions.ToTable(table => table.HasCheckConstraint(
            "CK_MaterialIssueDisputeResolutions_Quantities",
            "\"IssuedQuantity\" > 0 AND \"ForemanReceivedQuantity\" >= 0 AND \"ReturnedToStoreQuantity\" > 0 AND \"IssuedQuantity\" = \"ForemanReceivedQuantity\" + \"ReturnedToStoreQuantity\""));
        disputeResolutions.HasOne(item => item.MaterialIssue).WithOne(item => item.DisputeResolution)
            .HasForeignKey<MaterialIssueDisputeResolution>(item => item.MaterialIssueId).OnDelete(DeleteBehavior.Restrict);
        disputeResolutions.HasOne(item => item.ResolvedByUser).WithMany()
            .HasForeignKey(item => item.ResolvedByUserId).OnDelete(DeleteBehavior.Restrict);

        var returns = modelBuilder.Entity<MaterialReturn>();
        returns.Property(item => item.ReturnNumber).HasMaxLength(30);
        returns.Property(item => item.QuantityOffered).HasPrecision(18, 3);
        returns.Property(item => item.QuantityAccepted).HasPrecision(18, 3);
        returns.Property(item => item.Condition).HasMaxLength(30);
        returns.Property(item => item.Notes).HasMaxLength(1_000);
        returns.Property(item => item.EvidenceReference).HasMaxLength(500);
        returns.Property(item => item.ReceiptNotes).HasMaxLength(1_000);
        returns.Property(item => item.ReceiptEvidenceReference).HasMaxLength(500);
        returns.Property(item => item.Status).HasMaxLength(30);
        returns.HasIndex(item => item.ReturnNumber).IsUnique();
        returns.HasIndex(item => new { item.MaterialIssueId, item.Status, item.ReturnedAt });
        returns.ToTable(table =>
        {
            table.HasCheckConstraint("CK_MaterialReturns_Quantity", "\"QuantityOffered\" > 0 AND (\"QuantityAccepted\" IS NULL OR \"QuantityAccepted\" >= 0)");
            table.HasCheckConstraint("CK_MaterialReturns_Status", "\"Status\" IN ('AwaitingReceipt', 'Received', 'Rejected')");
            table.HasCheckConstraint("CK_MaterialReturns_Receipt", "(\"Status\" = 'AwaitingReceipt' AND \"ReceivedByUserId\" IS NULL AND \"ReceivedAt\" IS NULL AND \"QuantityAccepted\" IS NULL) OR (\"Status\" = 'Received' AND \"ReceivedByUserId\" IS NOT NULL AND \"ReceivedAt\" IS NOT NULL AND \"QuantityAccepted\" = \"QuantityOffered\") OR (\"Status\" = 'Rejected' AND \"ReceivedByUserId\" IS NOT NULL AND \"ReceivedAt\" IS NOT NULL AND \"QuantityAccepted\" = 0)");
        });
        returns.HasOne(item => item.MaterialIssue).WithMany(item => item.Returns)
            .HasForeignKey(item => item.MaterialIssueId).OnDelete(DeleteBehavior.Restrict);
        returns.HasOne(item => item.ReturnedByUser).WithMany().HasForeignKey(item => item.ReturnedByUserId).OnDelete(DeleteBehavior.Restrict);
        returns.HasOne(item => item.ReceivedByUser).WithMany().HasForeignKey(item => item.ReceivedByUserId).OnDelete(DeleteBehavior.Restrict);

        var closeouts = modelBuilder.Entity<MaterialCustodyCloseout>();
        closeouts.Property(item => item.CloseoutNumber).HasMaxLength(30);
        closeouts.Property(item => item.ConfirmedQuantity).HasPrecision(18, 3);
        closeouts.Property(item => item.UsedQuantity).HasPrecision(18, 3);
        closeouts.Property(item => item.WastedQuantity).HasPrecision(18, 3);
        closeouts.Property(item => item.ReturnedQuantity).HasPrecision(18, 3);
        closeouts.Property(item => item.UnaccountedQuantity).HasPrecision(18, 3);
        closeouts.Property(item => item.Notes).HasMaxLength(1_000);
        closeouts.Property(item => item.EvidenceReference).HasMaxLength(500);
        closeouts.Property(item => item.Status).HasMaxLength(30);
        closeouts.HasIndex(item => item.CloseoutNumber).IsUnique();
        closeouts.HasIndex(item => new { item.MaterialIssueId, item.Revision }).IsUnique();
        closeouts.HasIndex(item => item.MaterialIssueId)
            .HasFilter("\"Status\" IN ('AwaitingReview', 'Approved')").IsUnique();
        closeouts.ToTable(table =>
        {
            table.HasCheckConstraint("CK_MaterialCustodyCloseouts_Revision", "\"Revision\" > 0");
            table.HasCheckConstraint("CK_MaterialCustodyCloseouts_Quantities", "\"ConfirmedQuantity\" >= 0 AND \"UsedQuantity\" >= 0 AND \"WastedQuantity\" >= 0 AND \"ReturnedQuantity\" >= 0 AND \"UnaccountedQuantity\" >= 0 AND \"ConfirmedQuantity\" = \"UsedQuantity\" + \"WastedQuantity\" + \"ReturnedQuantity\" + \"UnaccountedQuantity\"");
            table.HasCheckConstraint("CK_MaterialCustodyCloseouts_Status", "\"Status\" IN ('AwaitingReview', 'Approved', 'Returned')");
        });
        closeouts.HasOne(item => item.MaterialIssue).WithMany(item => item.MaterialCustodyCloseouts)
            .HasForeignKey(item => item.MaterialIssueId).OnDelete(DeleteBehavior.Restrict);
        closeouts.HasOne(item => item.SubmittedByUser).WithMany().HasForeignKey(item => item.SubmittedByUserId).OnDelete(DeleteBehavior.Restrict);

        var decisions = modelBuilder.Entity<MaterialCustodyCloseoutDecision>();
        decisions.Property(item => item.Outcome).HasMaxLength(20);
        decisions.Property(item => item.Notes).HasMaxLength(1_000);
        decisions.HasIndex(item => item.MaterialCustodyCloseoutId).IsUnique();
        decisions.ToTable(table => table.HasCheckConstraint("CK_MaterialCustodyCloseoutDecisions_Outcome", "\"Outcome\" IN ('Approved', 'Returned')"));
        decisions.HasOne(item => item.MaterialCustodyCloseout).WithOne(item => item.Decision)
            .HasForeignKey<MaterialCustodyCloseoutDecision>(item => item.MaterialCustodyCloseoutId).OnDelete(DeleteBehavior.Restrict);
        decisions.HasOne(item => item.DecidedByUser).WithMany().HasForeignKey(item => item.DecidedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureOperationalPeriods(ModelBuilder modelBuilder)
    {
        var periods = modelBuilder.Entity<OperationalPeriod>();
        periods.Property(item => item.PeriodNumber).HasMaxLength(30);
        periods.Property(item => item.Scope).HasMaxLength(20);
        periods.Property(item => item.Name).HasMaxLength(100);
        periods.Property(item => item.Status).HasMaxLength(30);
        periods.HasIndex(item => item.PeriodNumber).IsUnique();
        periods.HasIndex(item => new { item.ProjectId, item.Scope, item.StartDate, item.EndDate });
        periods.ToTable(table =>
        {
            table.HasCheckConstraint("CK_OperationalPeriods_Scope", "\"Scope\" IN ('Inventory', 'Finance')");
            table.HasCheckConstraint("CK_OperationalPeriods_Dates", "\"StartDate\" <= \"EndDate\"");
            table.HasCheckConstraint("CK_OperationalPeriods_Status", "\"Status\" IN ('Open', 'AwaitingClose', 'Closed', 'Returned')");
        });
        periods.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        periods.HasOne(item => item.CreatedByUser).WithMany().HasForeignKey(item => item.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);

        var events = modelBuilder.Entity<OperationalPeriodEvent>();
        events.Property(item => item.EventType).HasMaxLength(30);
        events.Property(item => item.Notes).HasMaxLength(1_000);
        events.Property(item => item.ActorRole).HasMaxLength(80);
        events.HasIndex(item => new { item.OperationalPeriodId, item.SequenceNumber }).IsUnique();
        events.ToTable(table =>
        {
            table.HasCheckConstraint("CK_OperationalPeriodEvents_Sequence", "\"SequenceNumber\" > 0");
            table.HasCheckConstraint("CK_OperationalPeriodEvents_Type", "\"EventType\" IN ('Opened', 'CloseSubmitted', 'Closed', 'CloseReturned')");
        });
        events.HasOne(item => item.OperationalPeriod).WithMany(item => item.Events)
            .HasForeignKey(item => item.OperationalPeriodId).OnDelete(DeleteBehavior.Restrict);
        events.HasOne(item => item.ActorUser).WithMany().HasForeignKey(item => item.ActorUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureControlledCorrections(ModelBuilder modelBuilder)
    {
        var corrections = modelBuilder.Entity<ControlledCorrection>();
        corrections.Property(item => item.CorrectionNumber).HasMaxLength(30);
        corrections.Property(item => item.CorrectionType).HasMaxLength(20);
        corrections.Property(item => item.CashAccountName).HasMaxLength(100);
        corrections.Property(item => item.QuantityDelta).HasPrecision(18, 3);
        corrections.Property(item => item.AmountDelta).HasPrecision(18, 2);
        corrections.Property(item => item.Reason).HasMaxLength(1_000);
        corrections.Property(item => item.EvidenceReference).HasMaxLength(500);
        corrections.Property(item => item.Status).HasMaxLength(30);
        corrections.HasIndex(item => item.CorrectionNumber).IsUnique();
        corrections.HasIndex(item => new { item.ProjectId, item.Status, item.SubmittedAt });
        corrections.ToTable(table =>
        {
            table.HasCheckConstraint("CK_ControlledCorrections_Type", "\"CorrectionType\" IN ('Inventory', 'Finance')");
            table.HasCheckConstraint("CK_ControlledCorrections_Status", "\"Status\" IN ('AwaitingApproval', 'Approved', 'Rejected')");
            table.HasCheckConstraint("CK_ControlledCorrections_Values", "(\"CorrectionType\" = 'Inventory' AND \"MaterialId\" IS NOT NULL AND \"CashAccountName\" IS NULL AND \"QuantityDelta\" <> 0 AND \"AmountDelta\" = 0) OR (\"CorrectionType\" = 'Finance' AND \"MaterialId\" IS NULL AND \"CashAccountName\" IS NOT NULL AND \"QuantityDelta\" = 0 AND \"AmountDelta\" <> 0)");
        });
        corrections.HasOne(item => item.OperationalPeriod).WithMany().HasForeignKey(item => item.OperationalPeriodId).OnDelete(DeleteBehavior.Restrict);
        corrections.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        corrections.HasOne(item => item.Material).WithMany().HasForeignKey(item => item.MaterialId).OnDelete(DeleteBehavior.Restrict);
        corrections.HasOne(item => item.SubmittedByUser).WithMany().HasForeignKey(item => item.SubmittedByUserId).OnDelete(DeleteBehavior.Restrict);

        var decisions = modelBuilder.Entity<ControlledCorrectionDecision>();
        decisions.Property(item => item.Outcome).HasMaxLength(20);
        decisions.Property(item => item.Notes).HasMaxLength(1_000);
        decisions.HasIndex(item => item.ControlledCorrectionId).IsUnique();
        decisions.ToTable(table => table.HasCheckConstraint("CK_ControlledCorrectionDecisions_Outcome", "\"Outcome\" IN ('Approved', 'Rejected')"));
        decisions.HasOne(item => item.ControlledCorrection).WithOne(item => item.Decision)
            .HasForeignKey<ControlledCorrectionDecision>(item => item.ControlledCorrectionId).OnDelete(DeleteBehavior.Restrict);
        decisions.HasOne(item => item.DecidedByUser).WithMany().HasForeignKey(item => item.DecidedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    private static void ConfigureCashLedger(ModelBuilder modelBuilder)
    {
        var accounts = modelBuilder.Entity<CashAccount>();
        accounts.Property(item => item.Name).HasMaxLength(100);
        accounts.Property(item => item.Balance).HasPrecision(18, 2);
        accounts.HasIndex(item => new { item.ProjectId, item.Name }).IsUnique();
        accounts.ToTable(table => table.HasCheckConstraint("CK_CashAccounts_Balance", "\"Balance\" >= 0"));
        accounts.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);

        var entries = modelBuilder.Entity<CashLedgerEntry>();
        entries.Property(item => item.EntryNumber).HasMaxLength(30);
        entries.Property(item => item.AmountDelta).HasPrecision(18, 2);
        entries.Property(item => item.BalanceAfter).HasPrecision(18, 2);
        entries.Property(item => item.EntryType).HasMaxLength(30);
        entries.Property(item => item.ReferenceType).HasMaxLength(40);
        entries.Property(item => item.ReferenceNumber).HasMaxLength(40);
        entries.Property(item => item.Notes).HasMaxLength(1_000);
        entries.HasIndex(item => item.EntryNumber).IsUnique();
        entries.HasIndex(item => new { item.CashAccountId, item.PostedAt });
        entries.HasIndex(item => new
            { item.CashAccountId, item.ReferenceType, item.ReferenceId, item.EntryType })
            .IsUnique();
        entries.ToTable(table =>
        {
            table.HasCheckConstraint("CK_CashLedgerEntries_Balance", "\"BalanceAfter\" >= 0");
            table.HasCheckConstraint("CK_CashLedgerEntries_Type", "\"EntryType\" IN ('OpeningBalance', 'ControlledCorrection', 'SupplierPayment', 'PettyCashDisbursement', 'CashReturn')");
        });
        entries.HasOne(item => item.CashAccount).WithMany().HasForeignKey(item => item.CashAccountId).OnDelete(DeleteBehavior.Restrict);
        entries.HasOne(item => item.Project).WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        entries.HasOne(item => item.PostedByUser).WithMany().HasForeignKey(item => item.PostedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
