using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOperationalControlsTasksAndEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries");

            migrationBuilder.CreateTable(
                name: "CashAccounts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Balance = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashAccounts", x => x.Id);
                    table.CheckConstraint("CK_CashAccounts_Balance", "\"Balance\" >= 0");
                    table.ForeignKey(
                        name: "FK_CashAccounts_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EvidenceDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    OriginalFileName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Sha256Hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UploadedByUserId = table.Column<int>(type: "integer", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvidenceDocuments", x => x.Id);
                    table.CheckConstraint("CK_EvidenceDocuments_ContentType", "\"ContentType\" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')");
                    table.CheckConstraint("CK_EvidenceDocuments_SizeBytes", "\"SizeBytes\" > 0 AND \"SizeBytes\" <= 10485760");
                    table.ForeignKey(
                        name: "FK_EvidenceDocuments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvidenceDocuments_Users_UploadedByUserId",
                        column: x => x.UploadedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InAppNotifications",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    IdempotencyKey = table.Column<string>(type: "character varying(260)", maxLength: 260, nullable: false),
                    RecipientUserId = table.Column<int>(type: "integer", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: true),
                    TaskKey = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    TaskType = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Title = table.Column<string>(type: "character varying(180)", maxLength: 180, nullable: false),
                    Message = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    TargetPath = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TaskOpenedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TaskDueAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InAppNotifications", x => x.Id);
                    table.CheckConstraint("CK_InAppNotifications_Timestamps", "\"TaskDueAt\" >= \"TaskOpenedAt\" AND \"CreatedAt\" >= \"TaskDueAt\"");
                    table.ForeignKey(
                        name: "FK_InAppNotifications_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InAppNotifications_Users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MaterialCustodyCloseouts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CloseoutNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MaterialIssueId = table.Column<long>(type: "bigint", nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    ConfirmedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UsedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    WastedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    ReturnedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnaccountedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SubmittedByUserId = table.Column<int>(type: "integer", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialCustodyCloseouts", x => x.Id);
                    table.CheckConstraint("CK_MaterialCustodyCloseouts_Quantities", "\"ConfirmedQuantity\" >= 0 AND \"UsedQuantity\" >= 0 AND \"WastedQuantity\" >= 0 AND \"ReturnedQuantity\" >= 0 AND \"UnaccountedQuantity\" >= 0 AND \"ConfirmedQuantity\" = \"UsedQuantity\" + \"WastedQuantity\" + \"ReturnedQuantity\" + \"UnaccountedQuantity\"");
                    table.CheckConstraint("CK_MaterialCustodyCloseouts_Revision", "\"Revision\" > 0");
                    table.CheckConstraint("CK_MaterialCustodyCloseouts_Status", "\"Status\" IN ('AwaitingReview', 'Approved', 'Returned')");
                    table.ForeignKey(
                        name: "FK_MaterialCustodyCloseouts_MaterialIssues_MaterialIssueId",
                        column: x => x.MaterialIssueId,
                        principalTable: "MaterialIssues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialCustodyCloseouts_Users_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MaterialIssueDisputeResolutions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ResolutionNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MaterialIssueId = table.Column<long>(type: "bigint", nullable: false),
                    IssuedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    ForemanReceivedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    ReturnedToStoreQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ResolvedByUserId = table.Column<int>(type: "integer", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialIssueDisputeResolutions", x => x.Id);
                    table.CheckConstraint("CK_MaterialIssueDisputeResolutions_Quantities", "\"IssuedQuantity\" > 0 AND \"ForemanReceivedQuantity\" >= 0 AND \"ReturnedToStoreQuantity\" > 0 AND \"IssuedQuantity\" = \"ForemanReceivedQuantity\" + \"ReturnedToStoreQuantity\"");
                    table.ForeignKey(
                        name: "FK_MaterialIssueDisputeResolutions_MaterialIssues_MaterialIssu~",
                        column: x => x.MaterialIssueId,
                        principalTable: "MaterialIssues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialIssueDisputeResolutions_Users_ResolvedByUserId",
                        column: x => x.ResolvedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MaterialReturns",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReturnNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    MaterialIssueId = table.Column<long>(type: "bigint", nullable: false),
                    QuantityOffered = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Condition = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ReturnedByUserId = table.Column<int>(type: "integer", nullable: false),
                    ReturnedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    QuantityAccepted = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    ReceivedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ReceiptNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReceiptEvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialReturns", x => x.Id);
                    table.CheckConstraint("CK_MaterialReturns_Quantity", "\"QuantityOffered\" > 0 AND (\"QuantityAccepted\" IS NULL OR \"QuantityAccepted\" >= 0)");
                    table.CheckConstraint("CK_MaterialReturns_Receipt", "(\"Status\" = 'AwaitingReceipt' AND \"ReceivedByUserId\" IS NULL AND \"ReceivedAt\" IS NULL AND \"QuantityAccepted\" IS NULL) OR (\"Status\" = 'Received' AND \"ReceivedByUserId\" IS NOT NULL AND \"ReceivedAt\" IS NOT NULL AND \"QuantityAccepted\" = \"QuantityOffered\") OR (\"Status\" = 'Rejected' AND \"ReceivedByUserId\" IS NOT NULL AND \"ReceivedAt\" IS NOT NULL AND \"QuantityAccepted\" = 0)");
                    table.CheckConstraint("CK_MaterialReturns_Status", "\"Status\" IN ('AwaitingReceipt', 'Received', 'Rejected')");
                    table.ForeignKey(
                        name: "FK_MaterialReturns_MaterialIssues_MaterialIssueId",
                        column: x => x.MaterialIssueId,
                        principalTable: "MaterialIssues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialReturns_Users_ReceivedByUserId",
                        column: x => x.ReceivedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialReturns_Users_ReturnedByUserId",
                        column: x => x.ReturnedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OpeningPositionBatches",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    BatchNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PositionType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    AsOfDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SubmittedByUserId = table.Column<int>(type: "integer", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningPositionBatches", x => x.Id);
                    table.CheckConstraint("CK_OpeningPositionBatches_Status", "\"Status\" IN ('AwaitingVerification', 'AwaitingApproval', 'Approved', 'Rejected')");
                    table.CheckConstraint("CK_OpeningPositionBatches_Type", "\"PositionType\" IN ('Inventory', 'Cash')");
                    table.ForeignKey(
                        name: "FK_OpeningPositionBatches_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OpeningPositionBatches_Users_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OperationalPeriods",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PeriodNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    Scope = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CreatedByUserId = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalPeriods", x => x.Id);
                    table.CheckConstraint("CK_OperationalPeriods_Dates", "\"StartDate\" <= \"EndDate\"");
                    table.CheckConstraint("CK_OperationalPeriods_Scope", "\"Scope\" IN ('Inventory', 'Finance')");
                    table.CheckConstraint("CK_OperationalPeriods_Status", "\"Status\" IN ('Open', 'AwaitingClose', 'Closed', 'Returned')");
                    table.ForeignKey(
                        name: "FK_OperationalPeriods_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OperationalPeriods_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CashLedgerEntries",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EntryNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CashAccountId = table.Column<long>(type: "bigint", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    AmountDelta = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    BalanceAfter = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    EntryType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ReferenceType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ReferenceId = table.Column<long>(type: "bigint", nullable: false),
                    ReferenceNumber = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    PostedByUserId = table.Column<int>(type: "integer", nullable: false),
                    PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashLedgerEntries", x => x.Id);
                    table.CheckConstraint("CK_CashLedgerEntries_Balance", "\"BalanceAfter\" >= 0");
                    table.CheckConstraint("CK_CashLedgerEntries_Type", "\"EntryType\" IN ('OpeningBalance', 'ControlledCorrection', 'SupplierPayment', 'PettyCashDisbursement', 'CashReturn')");
                    table.ForeignKey(
                        name: "FK_CashLedgerEntries_CashAccounts_CashAccountId",
                        column: x => x.CashAccountId,
                        principalTable: "CashAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CashLedgerEntries_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CashLedgerEntries_Users_PostedByUserId",
                        column: x => x.PostedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EvidenceAttachments",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EvidenceDocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    SourceType = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    SourceId = table.Column<long>(type: "bigint", nullable: false),
                    EvidenceKind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    LinkedByUserId = table.Column<int>(type: "integer", nullable: false),
                    LinkedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EvidenceAttachments", x => x.Id);
                    table.CheckConstraint("CK_EvidenceAttachments_EvidenceKind", "\"EvidenceKind\" IN ('Photo', 'DeliveryNote', 'Inspection', 'Invoice', 'PaymentProof', 'Receipt', 'Other')");
                    table.CheckConstraint("CK_EvidenceAttachments_SourceId", "\"SourceId\" > 0");
                    table.CheckConstraint("CK_EvidenceAttachments_SourceType", "\"SourceType\" IN ('ProjectProgressVerification', 'GoodsReceipt', 'GoodsReceiptTechnicalAcceptance', 'MaterialUsageRecord', 'SupplierInvoice', 'Payment', 'PettyCashDisbursement', 'PettyCashReconciliation', 'OpeningPositionBatch', 'MaterialReturn', 'MaterialReturnReceipt', 'MaterialIssueDisputeResolution', 'MaterialCustodyCloseout', 'ControlledCorrection')");
                    table.ForeignKey(
                        name: "FK_EvidenceAttachments_EvidenceDocuments_EvidenceDocumentId",
                        column: x => x.EvidenceDocumentId,
                        principalTable: "EvidenceDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvidenceAttachments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EvidenceAttachments_Users_LinkedByUserId",
                        column: x => x.LinkedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InAppNotificationReadReceipts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    InAppNotificationId = table.Column<long>(type: "bigint", nullable: false),
                    RecipientUserId = table.Column<int>(type: "integer", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InAppNotificationReadReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InAppNotificationReadReceipts_InAppNotifications_InAppNotif~",
                        column: x => x.InAppNotificationId,
                        principalTable: "InAppNotifications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InAppNotificationReadReceipts_Users_RecipientUserId",
                        column: x => x.RecipientUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InAppNotificationResolutionReceipts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    InAppNotificationId = table.Column<long>(type: "bigint", nullable: false),
                    Reason = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InAppNotificationResolutionReceipts", x => x.Id);
                    table.CheckConstraint("CK_InAppNotificationResolutionReceipts_Reason", "\"Reason\" = 'TaskNoLongerOverdue'");
                    table.ForeignKey(
                        name: "FK_InAppNotificationResolutionReceipts_InAppNotifications_InAp~",
                        column: x => x.InAppNotificationId,
                        principalTable: "InAppNotifications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MaterialCustodyCloseoutDecisions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MaterialCustodyCloseoutId = table.Column<long>(type: "bigint", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    DecidedByUserId = table.Column<int>(type: "integer", nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialCustodyCloseoutDecisions", x => x.Id);
                    table.CheckConstraint("CK_MaterialCustodyCloseoutDecisions_Outcome", "\"Outcome\" IN ('Approved', 'Returned')");
                    table.ForeignKey(
                        name: "FK_MaterialCustodyCloseoutDecisions_MaterialCustodyCloseouts_M~",
                        column: x => x.MaterialCustodyCloseoutId,
                        principalTable: "MaterialCustodyCloseouts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialCustodyCloseoutDecisions_Users_DecidedByUserId",
                        column: x => x.DecidedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OpeningCashLines",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OpeningPositionBatchId = table.Column<long>(type: "bigint", nullable: false),
                    AccountName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningCashLines", x => x.Id);
                    table.CheckConstraint("CK_OpeningCashLines_Amount", "\"Amount\" >= 0");
                    table.ForeignKey(
                        name: "FK_OpeningCashLines_OpeningPositionBatches_OpeningPositionBatc~",
                        column: x => x.OpeningPositionBatchId,
                        principalTable: "OpeningPositionBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OpeningInventoryLines",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OpeningPositionBatchId = table.Column<long>(type: "bigint", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitCost = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningInventoryLines", x => x.Id);
                    table.CheckConstraint("CK_OpeningInventoryLines_Values", "\"Quantity\" > 0 AND (\"UnitCost\" IS NULL OR \"UnitCost\" >= 0)");
                    table.ForeignKey(
                        name: "FK_OpeningInventoryLines_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OpeningInventoryLines_OpeningPositionBatches_OpeningPositio~",
                        column: x => x.OpeningPositionBatchId,
                        principalTable: "OpeningPositionBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OpeningPositionDecisions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OpeningPositionBatchId = table.Column<long>(type: "bigint", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    DecidedByUserId = table.Column<int>(type: "integer", nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningPositionDecisions", x => x.Id);
                    table.CheckConstraint("CK_OpeningPositionDecisions_Outcome", "\"Outcome\" IN ('Approved', 'Rejected')");
                    table.ForeignKey(
                        name: "FK_OpeningPositionDecisions_OpeningPositionBatches_OpeningPosi~",
                        column: x => x.OpeningPositionBatchId,
                        principalTable: "OpeningPositionBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OpeningPositionDecisions_Users_DecidedByUserId",
                        column: x => x.DecidedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OpeningPositionPostings",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OpeningPositionBatchId = table.Column<long>(type: "bigint", nullable: false),
                    PostedByUserId = table.Column<int>(type: "integer", nullable: false),
                    PostedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningPositionPostings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OpeningPositionPostings_OpeningPositionBatches_OpeningPosit~",
                        column: x => x.OpeningPositionBatchId,
                        principalTable: "OpeningPositionBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OpeningPositionPostings_Users_PostedByUserId",
                        column: x => x.PostedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OpeningPositionVerifications",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OpeningPositionBatchId = table.Column<long>(type: "bigint", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    VerifiedByUserId = table.Column<int>(type: "integer", nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OpeningPositionVerifications", x => x.Id);
                    table.CheckConstraint("CK_OpeningPositionVerifications_Outcome", "\"Outcome\" IN ('Verified', 'Rejected')");
                    table.ForeignKey(
                        name: "FK_OpeningPositionVerifications_OpeningPositionBatches_Opening~",
                        column: x => x.OpeningPositionBatchId,
                        principalTable: "OpeningPositionBatches",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OpeningPositionVerifications_Users_VerifiedByUserId",
                        column: x => x.VerifiedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ControlledCorrections",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CorrectionNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    OperationalPeriodId = table.Column<long>(type: "bigint", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    CorrectionType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: true),
                    CashAccountName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    QuantityDelta = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    AmountDelta = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Reason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SubmittedByUserId = table.Column<int>(type: "integer", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ControlledCorrections", x => x.Id);
                    table.CheckConstraint("CK_ControlledCorrections_Status", "\"Status\" IN ('AwaitingApproval', 'Approved', 'Rejected')");
                    table.CheckConstraint("CK_ControlledCorrections_Type", "\"CorrectionType\" IN ('Inventory', 'Finance')");
                    table.CheckConstraint("CK_ControlledCorrections_Values", "(\"CorrectionType\" = 'Inventory' AND \"MaterialId\" IS NOT NULL AND \"CashAccountName\" IS NULL AND \"QuantityDelta\" <> 0 AND \"AmountDelta\" = 0) OR (\"CorrectionType\" = 'Finance' AND \"MaterialId\" IS NULL AND \"CashAccountName\" IS NOT NULL AND \"QuantityDelta\" = 0 AND \"AmountDelta\" <> 0)");
                    table.ForeignKey(
                        name: "FK_ControlledCorrections_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ControlledCorrections_OperationalPeriods_OperationalPeriodId",
                        column: x => x.OperationalPeriodId,
                        principalTable: "OperationalPeriods",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ControlledCorrections_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ControlledCorrections_Users_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OperationalPeriodEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OperationalPeriodId = table.Column<long>(type: "bigint", nullable: false),
                    SequenceNumber = table.Column<int>(type: "integer", nullable: false),
                    EventType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OperationalPeriodEvents", x => x.Id);
                    table.CheckConstraint("CK_OperationalPeriodEvents_Sequence", "\"SequenceNumber\" > 0");
                    table.CheckConstraint("CK_OperationalPeriodEvents_Type", "\"EventType\" IN ('Opened', 'CloseSubmitted', 'Closed', 'CloseReturned')");
                    table.ForeignKey(
                        name: "FK_OperationalPeriodEvents_OperationalPeriods_OperationalPerio~",
                        column: x => x.OperationalPeriodId,
                        principalTable: "OperationalPeriods",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OperationalPeriodEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ControlledCorrectionDecisions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ControlledCorrectionId = table.Column<long>(type: "bigint", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    DecidedByUserId = table.Column<int>(type: "integer", nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ControlledCorrectionDecisions", x => x.Id);
                    table.CheckConstraint("CK_ControlledCorrectionDecisions_Outcome", "\"Outcome\" IN ('Approved', 'Rejected')");
                    table.ForeignKey(
                        name: "FK_ControlledCorrectionDecisions_ControlledCorrections_Control~",
                        column: x => x.ControlledCorrectionId,
                        principalTable: "ControlledCorrections",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ControlledCorrectionDecisions_Users_DecidedByUserId",
                        column: x => x.DecidedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries",
                sql: "\"MovementType\" IN ('Receipt', 'TechnicalAcceptance', 'Issue', 'TransferOut', 'TransferIn', 'CountAdjustment', 'OpeningBalance', 'ReturnToStore', 'HandoverCorrection', 'ControlledCorrection')");

            migrationBuilder.CreateIndex(
                name: "IX_CashAccounts_ProjectId_Name",
                table: "CashAccounts",
                columns: new[] { "ProjectId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CashLedgerEntries_CashAccountId_PostedAt",
                table: "CashLedgerEntries",
                columns: new[] { "CashAccountId", "PostedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_CashLedgerEntries_EntryNumber",
                table: "CashLedgerEntries",
                column: "EntryNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CashLedgerEntries_PostedByUserId",
                table: "CashLedgerEntries",
                column: "PostedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CashLedgerEntries_ProjectId",
                table: "CashLedgerEntries",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_CashLedgerEntries_CashAccountId_ReferenceType_ReferenceId_E~",
                table: "CashLedgerEntries",
                columns: new[] { "CashAccountId", "ReferenceType", "ReferenceId", "EntryType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ControlledCorrectionDecisions_ControlledCorrectionId",
                table: "ControlledCorrectionDecisions",
                column: "ControlledCorrectionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ControlledCorrectionDecisions_DecidedByUserId",
                table: "ControlledCorrectionDecisions",
                column: "DecidedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ControlledCorrections_CorrectionNumber",
                table: "ControlledCorrections",
                column: "CorrectionNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ControlledCorrections_MaterialId",
                table: "ControlledCorrections",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_ControlledCorrections_OperationalPeriodId",
                table: "ControlledCorrections",
                column: "OperationalPeriodId");

            migrationBuilder.CreateIndex(
                name: "IX_ControlledCorrections_ProjectId_Status_SubmittedAt",
                table: "ControlledCorrections",
                columns: new[] { "ProjectId", "Status", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ControlledCorrections_SubmittedByUserId",
                table: "ControlledCorrections",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceAttachments_EvidenceDocumentId",
                table: "EvidenceAttachments",
                column: "EvidenceDocumentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceAttachments_LinkedByUserId",
                table: "EvidenceAttachments",
                column: "LinkedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceAttachments_ProjectId",
                table: "EvidenceAttachments",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceAttachments_SourceType_SourceId_LinkedAt",
                table: "EvidenceAttachments",
                columns: new[] { "SourceType", "SourceId", "LinkedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceDocuments_ProjectId_UploadedAt",
                table: "EvidenceDocuments",
                columns: new[] { "ProjectId", "UploadedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceDocuments_Sha256Hash",
                table: "EvidenceDocuments",
                column: "Sha256Hash");

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceDocuments_StorageKey",
                table: "EvidenceDocuments",
                column: "StorageKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EvidenceDocuments_UploadedByUserId",
                table: "EvidenceDocuments",
                column: "UploadedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotificationReadReceipts_InAppNotificationId",
                table: "InAppNotificationReadReceipts",
                column: "InAppNotificationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotificationReadReceipts_RecipientUserId_ReadAt",
                table: "InAppNotificationReadReceipts",
                columns: new[] { "RecipientUserId", "ReadAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotificationResolutionReceipts_InAppNotificationId",
                table: "InAppNotificationResolutionReceipts",
                column: "InAppNotificationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotificationResolutionReceipts_ResolvedAt",
                table: "InAppNotificationResolutionReceipts",
                column: "ResolvedAt");

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotifications_IdempotencyKey",
                table: "InAppNotifications",
                column: "IdempotencyKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotifications_ProjectId",
                table: "InAppNotifications",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotifications_RecipientUserId_CreatedAt",
                table: "InAppNotifications",
                columns: new[] { "RecipientUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InAppNotifications_RecipientUserId_TaskDueAt",
                table: "InAppNotifications",
                columns: new[] { "RecipientUserId", "TaskDueAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCustodyCloseoutDecisions_DecidedByUserId",
                table: "MaterialCustodyCloseoutDecisions",
                column: "DecidedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCustodyCloseoutDecisions_MaterialCustodyCloseoutId",
                table: "MaterialCustodyCloseoutDecisions",
                column: "MaterialCustodyCloseoutId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCustodyCloseouts_CloseoutNumber",
                table: "MaterialCustodyCloseouts",
                column: "CloseoutNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCustodyCloseouts_MaterialIssueId",
                table: "MaterialCustodyCloseouts",
                column: "MaterialIssueId",
                unique: true,
                filter: "\"Status\" IN ('AwaitingReview', 'Approved')");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCustodyCloseouts_MaterialIssueId_Revision",
                table: "MaterialCustodyCloseouts",
                columns: new[] { "MaterialIssueId", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCustodyCloseouts_SubmittedByUserId",
                table: "MaterialCustodyCloseouts",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssueDisputeResolutions_MaterialIssueId",
                table: "MaterialIssueDisputeResolutions",
                column: "MaterialIssueId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssueDisputeResolutions_ResolutionNumber",
                table: "MaterialIssueDisputeResolutions",
                column: "ResolutionNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssueDisputeResolutions_ResolvedByUserId",
                table: "MaterialIssueDisputeResolutions",
                column: "ResolvedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialReturns_MaterialIssueId_Status_ReturnedAt",
                table: "MaterialReturns",
                columns: new[] { "MaterialIssueId", "Status", "ReturnedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MaterialReturns_ReceivedByUserId",
                table: "MaterialReturns",
                column: "ReceivedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialReturns_ReturnedByUserId",
                table: "MaterialReturns",
                column: "ReturnedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialReturns_ReturnNumber",
                table: "MaterialReturns",
                column: "ReturnNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningCashLines_OpeningPositionBatchId_AccountName",
                table: "OpeningCashLines",
                columns: new[] { "OpeningPositionBatchId", "AccountName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningInventoryLines_MaterialId",
                table: "OpeningInventoryLines",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_OpeningInventoryLines_OpeningPositionBatchId_MaterialId",
                table: "OpeningInventoryLines",
                columns: new[] { "OpeningPositionBatchId", "MaterialId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionBatches_BatchNumber",
                table: "OpeningPositionBatches",
                column: "BatchNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionBatches_ProjectId_PositionType_SubmittedAt",
                table: "OpeningPositionBatches",
                columns: new[] { "ProjectId", "PositionType", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionBatches_SubmittedByUserId",
                table: "OpeningPositionBatches",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionDecisions_DecidedByUserId",
                table: "OpeningPositionDecisions",
                column: "DecidedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionDecisions_OpeningPositionBatchId",
                table: "OpeningPositionDecisions",
                column: "OpeningPositionBatchId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionPostings_OpeningPositionBatchId",
                table: "OpeningPositionPostings",
                column: "OpeningPositionBatchId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionPostings_PostedByUserId",
                table: "OpeningPositionPostings",
                column: "PostedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionVerifications_OpeningPositionBatchId",
                table: "OpeningPositionVerifications",
                column: "OpeningPositionBatchId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OpeningPositionVerifications_VerifiedByUserId",
                table: "OpeningPositionVerifications",
                column: "VerifiedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OperationalPeriodEvents_ActorUserId",
                table: "OperationalPeriodEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OperationalPeriodEvents_OperationalPeriodId_SequenceNumber",
                table: "OperationalPeriodEvents",
                columns: new[] { "OperationalPeriodId", "SequenceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OperationalPeriods_CreatedByUserId",
                table: "OperationalPeriods",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_OperationalPeriods_PeriodNumber",
                table: "OperationalPeriods",
                column: "PeriodNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OperationalPeriods_ProjectId_Scope_StartDate_EndDate",
                table: "OperationalPeriods",
                columns: new[] { "ProjectId", "Scope", "StartDate", "EndDate" });

            migrationBuilder.Sql(
                """
                ALTER TABLE "CashAccounts"
                    ADD CONSTRAINT "CK_CashAccounts_Name"
                    CHECK (length(btrim("Name")) > 0);
                ALTER TABLE "OpeningCashLines"
                    ADD CONSTRAINT "CK_OpeningCashLines_AccountName"
                    CHECK (length(btrim("AccountName")) > 0);
                CREATE UNIQUE INDEX "UX_CashAccounts_Project_NormalizedName"
                    ON "CashAccounts" ("ProjectId", lower(btrim("Name")));
                CREATE UNIQUE INDEX "UX_OpeningCashLines_Batch_NormalizedName"
                    ON "OpeningCashLines" ("OpeningPositionBatchId", lower(btrim("AccountName")));
                """);

            // The application rejects mutation of these records, and these triggers
            // preserve the same guarantee for direct SQL clients and future services.
            migrationBuilder.Sql(
                """
                CREATE TRIGGER "TR_EvidenceDocuments_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "EvidenceDocuments"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_EvidenceAttachments_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "EvidenceAttachments"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_InAppNotifications_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "InAppNotifications"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_InAppNotificationReadReceipts_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "InAppNotificationReadReceipts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_InAppNotificationResolutionReceipts_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "InAppNotificationResolutionReceipts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_OpeningInventoryLines_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "OpeningInventoryLines"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_OpeningCashLines_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "OpeningCashLines"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_OpeningPositionVerifications_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "OpeningPositionVerifications"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_OpeningPositionDecisions_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "OpeningPositionDecisions"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_OpeningPositionPostings_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "OpeningPositionPostings"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_MaterialIssueDisputeResolutions_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "MaterialIssueDisputeResolutions"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_MaterialCustodyCloseoutDecisions_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "MaterialCustodyCloseoutDecisions"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_OperationalPeriodEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "OperationalPeriodEvents"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_ControlledCorrectionDecisions_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "ControlledCorrectionDecisions"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_CashLedgerEntries_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "CashLedgerEntries"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE OR REPLACE FUNCTION constructionms_validate_notification_read_receipt()
                RETURNS trigger AS $$
                DECLARE
                    expected_recipient_id integer;
                BEGIN
                    SELECT "RecipientUserId" INTO expected_recipient_id
                    FROM "InAppNotifications"
                    WHERE "Id" = NEW."InAppNotificationId";

                    IF NOT FOUND OR expected_recipient_id <> NEW."RecipientUserId" THEN
                        RAISE EXCEPTION 'Notification read receipt recipient does not match the notification';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_InAppNotificationReadReceipts_Validate"
                    BEFORE INSERT ON "InAppNotificationReadReceipts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_notification_read_receipt();
                """);

            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_actor_has_project_role(
                    actor_user_id integer,
                    expected_role text,
                    project_id integer)
                RETURNS boolean AS $$
                    SELECT EXISTS (
                        SELECT 1
                        FROM "Users" actor
                        JOIN "Roles" role ON role."Id" = actor."RoleId"
                        WHERE actor."Id" = actor_user_id
                          AND actor."IsActive"
                          AND (
                            role."RoleName" = 'Administrator'
                            OR (
                                role."RoleName" = expected_role
                                AND (
                                    expected_role = 'CEO'
                                    OR EXISTS (
                                        SELECT 1
                                        FROM "UserProjectAssignments" assignment
                                        WHERE assignment."UserId" = actor_user_id
                                          AND assignment."ProjectId" = project_id
                                          AND assignment."IsActive"
                                    )
                                )
                            )
                          )
                    );
                $$ LANGUAGE sql STABLE;

                CREATE OR REPLACE FUNCTION constructionms_guard_opening_position_batch()
                RETURNS trigger AS $$
                DECLARE
                    expected_role text;
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Opening-position batches cannot be deleted';
                    END IF;

                    IF TG_OP = 'INSERT' THEN
                        IF (NEW."PositionType" = 'Inventory' AND NEW."Status" <> 'AwaitingVerification')
                           OR (NEW."PositionType" = 'Cash' AND NEW."Status" <> 'AwaitingApproval') THEN
                            RAISE EXCEPTION 'Opening-position initial status does not match its type';
                        END IF;
                        expected_role := CASE NEW."PositionType"
                            WHEN 'Inventory' THEN 'Storekeeper'
                            WHEN 'Cash' THEN 'Finance Officer'
                        END;
                        IF NOT constructionms_actor_has_project_role(
                            NEW."SubmittedByUserId", expected_role, NEW."ProjectId") THEN
                            RAISE EXCEPTION 'Opening-position submitter is not active in the required project role';
                        END IF;
                        RETURN NEW;
                    END IF;

                    IF NEW."BatchNumber" IS DISTINCT FROM OLD."BatchNumber"
                       OR NEW."PositionType" IS DISTINCT FROM OLD."PositionType"
                       OR NEW."ProjectId" IS DISTINCT FROM OLD."ProjectId"
                       OR NEW."AsOfDate" IS DISTINCT FROM OLD."AsOfDate"
                       OR NEW."Notes" IS DISTINCT FROM OLD."Notes"
                       OR NEW."EvidenceReference" IS DISTINCT FROM OLD."EvidenceReference"
                       OR NEW."SubmittedByUserId" IS DISTINCT FROM OLD."SubmittedByUserId"
                       OR NEW."SubmittedAt" IS DISTINCT FROM OLD."SubmittedAt" THEN
                        RAISE EXCEPTION 'Opening-position source fields are immutable';
                    END IF;

                    IF NOT (
                        (OLD."PositionType" = 'Inventory'
                            AND OLD."Status" = 'AwaitingVerification'
                            AND NEW."Status" IN ('AwaitingApproval', 'Rejected'))
                        OR (OLD."Status" = 'AwaitingApproval'
                            AND NEW."Status" IN ('Approved', 'Rejected'))
                    ) THEN
                        RAISE EXCEPTION 'Opening-position status transition is invalid';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_OpeningPositionBatches_Controlled"
                    BEFORE INSERT OR UPDATE OR DELETE ON "OpeningPositionBatches"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_opening_position_batch();

                CREATE OR REPLACE FUNCTION constructionms_validate_opening_position_line()
                RETURNS trigger AS $$
                DECLARE
                    batch_type text;
                BEGIN
                    SELECT "PositionType" INTO batch_type
                    FROM "OpeningPositionBatches"
                    WHERE "Id" = NEW."OpeningPositionBatchId";

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Opening-position batch was not found';
                    END IF;
                    IF (TG_TABLE_NAME = 'OpeningInventoryLines' AND batch_type <> 'Inventory')
                       OR (TG_TABLE_NAME = 'OpeningCashLines' AND batch_type <> 'Cash') THEN
                        RAISE EXCEPTION 'Opening-position line type does not match its batch';
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM "ControlEvents"
                        WHERE "EntityType" = 'OpeningPosition'
                          AND "EntityId" = NEW."OpeningPositionBatchId"
                          AND "EventType" = 'OpeningPositionSubmitted'
                    ) THEN
                        RAISE EXCEPTION 'Opening-position lines are sealed after submission';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_OpeningInventoryLines_Validate"
                    BEFORE INSERT ON "OpeningInventoryLines"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_line();
                CREATE TRIGGER "TR_OpeningCashLines_Validate"
                    BEFORE INSERT ON "OpeningCashLines"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_line();

                CREATE OR REPLACE FUNCTION constructionms_guard_material_return()
                RETURNS trigger AS $$
                DECLARE
                    issue_project_id integer;
                    issue_recipient_id integer;
                    issue_status text;
                    issue_confirmed_quantity numeric(18,3);
                    accounted_quantity numeric(18,3);
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Material returns cannot be deleted';
                    END IF;

                    PERFORM pg_advisory_xact_lock(NEW."MaterialIssueId");
                    SELECT "ProjectId", "IssuedToUserId", "Status", "ConfirmedQuantity"
                    INTO issue_project_id, issue_recipient_id, issue_status, issue_confirmed_quantity
                    FROM "MaterialIssues"
                    WHERE "Id" = NEW."MaterialIssueId";
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Material issue for return was not found';
                    END IF;

                    IF TG_OP = 'INSERT' THEN
                        IF NEW."Status" <> 'AwaitingReceipt' THEN
                            RAISE EXCEPTION 'A material return must begin awaiting receipt';
                        END IF;
                        IF issue_status <> 'Confirmed'
                           OR issue_confirmed_quantity IS NULL
                           OR NEW."ReturnedByUserId" <> issue_recipient_id THEN
                            RAISE EXCEPTION 'Only the confirmed material recipient can create a return';
                        END IF;
                        IF NOT constructionms_actor_has_project_role(
                            NEW."ReturnedByUserId", 'Foreman', issue_project_id) THEN
                            RAISE EXCEPTION 'Material-return submitter is not active in the Foreman project role';
                        END IF;
                        IF EXISTS (
                            SELECT 1 FROM "MaterialCustodyCloseouts"
                            WHERE "MaterialIssueId" = NEW."MaterialIssueId"
                              AND "Status" IN ('AwaitingReview', 'Approved')
                        ) THEN
                            RAISE EXCEPTION 'Material cannot be returned after custody close-out is submitted';
                        END IF;
                        SELECT
                            COALESCE((
                                SELECT SUM(usage."Quantity")
                                FROM "MaterialUsageRecords" usage
                                WHERE usage."MaterialIssueId" = NEW."MaterialIssueId"
                            ), 0)
                            + COALESCE((
                                SELECT SUM(COALESCE(material_return."QuantityAccepted", 0))
                                FROM "MaterialReturns" material_return
                                WHERE material_return."MaterialIssueId" = NEW."MaterialIssueId"
                                  AND material_return."Status" = 'Received'
                            ), 0)
                            + COALESCE((
                                SELECT SUM(material_return."QuantityOffered")
                                FROM "MaterialReturns" material_return
                                WHERE material_return."MaterialIssueId" = NEW."MaterialIssueId"
                                  AND material_return."Status" = 'AwaitingReceipt'
                            ), 0)
                        INTO accounted_quantity;
                        IF accounted_quantity + NEW."QuantityOffered" > issue_confirmed_quantity THEN
                            RAISE EXCEPTION 'Material return exceeds the quantity remaining in custody';
                        END IF;
                        RETURN NEW;
                    END IF;

                    IF NEW."ReturnNumber" IS DISTINCT FROM OLD."ReturnNumber"
                       OR NEW."MaterialIssueId" IS DISTINCT FROM OLD."MaterialIssueId"
                       OR NEW."QuantityOffered" IS DISTINCT FROM OLD."QuantityOffered"
                       OR NEW."Condition" IS DISTINCT FROM OLD."Condition"
                       OR NEW."Notes" IS DISTINCT FROM OLD."Notes"
                       OR NEW."EvidenceReference" IS DISTINCT FROM OLD."EvidenceReference"
                       OR NEW."ReturnedByUserId" IS DISTINCT FROM OLD."ReturnedByUserId"
                       OR NEW."ReturnedAt" IS DISTINCT FROM OLD."ReturnedAt" THEN
                        RAISE EXCEPTION 'Material-return source fields are immutable';
                    END IF;
                    IF OLD."Status" <> 'AwaitingReceipt'
                       OR NEW."Status" NOT IN ('Received', 'Rejected') THEN
                        RAISE EXCEPTION 'Material-return status transition is invalid';
                    END IF;
                    IF NEW."ReceivedByUserId" = NEW."ReturnedByUserId" THEN
                        RAISE EXCEPTION 'The person returning material cannot receive it into Stores';
                    END IF;
                    IF NEW."ReceivedByUserId" IS NULL
                       OR NOT constructionms_actor_has_project_role(
                            NEW."ReceivedByUserId", 'Storekeeper', issue_project_id) THEN
                        RAISE EXCEPTION 'Material-return receiver is not active in the Storekeeper project role';
                    END IF;
                    IF NEW."ReceivedAt" < NEW."ReturnedAt" THEN
                        RAISE EXCEPTION 'Material-return receipt cannot predate the return';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_MaterialReturns_Controlled"
                    BEFORE INSERT OR UPDATE OR DELETE ON "MaterialReturns"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_material_return();

                CREATE OR REPLACE FUNCTION constructionms_guard_material_usage()
                RETURNS trigger AS $$
                DECLARE
                    issue_project_id integer;
                    issue_recipient_id integer;
                    issue_status text;
                    issue_confirmed_quantity numeric(18,3);
                    accounted_quantity numeric(18,3);
                BEGIN
                    PERFORM pg_advisory_xact_lock(NEW."MaterialIssueId");
                    SELECT "ProjectId", "IssuedToUserId", "Status", "ConfirmedQuantity"
                    INTO issue_project_id, issue_recipient_id, issue_status, issue_confirmed_quantity
                    FROM "MaterialIssues"
                    WHERE "Id" = NEW."MaterialIssueId";
                    IF NOT FOUND
                       OR issue_status <> 'Confirmed'
                       OR issue_confirmed_quantity IS NULL
                       OR NEW."RecordedByUserId" <> issue_recipient_id THEN
                        RAISE EXCEPTION 'Only the confirmed material recipient can record its use';
                    END IF;
                    IF NOT constructionms_actor_has_project_role(
                        NEW."RecordedByUserId", 'Foreman', issue_project_id) THEN
                        RAISE EXCEPTION 'Material-use recorder is not active in the Foreman project role';
                    END IF;
                    IF EXISTS (
                        SELECT 1 FROM "MaterialCustodyCloseouts"
                        WHERE "MaterialIssueId" = NEW."MaterialIssueId"
                          AND "Status" IN ('AwaitingReview', 'Approved')
                    ) THEN
                        RAISE EXCEPTION 'Material use cannot be added after custody close-out is submitted';
                    END IF;
                    SELECT
                        COALESCE((
                            SELECT SUM(usage."Quantity")
                            FROM "MaterialUsageRecords" usage
                            WHERE usage."MaterialIssueId" = NEW."MaterialIssueId"
                        ), 0)
                        + COALESCE((
                            SELECT SUM(COALESCE(material_return."QuantityAccepted", 0))
                            FROM "MaterialReturns" material_return
                            WHERE material_return."MaterialIssueId" = NEW."MaterialIssueId"
                              AND material_return."Status" = 'Received'
                        ), 0)
                        + COALESCE((
                            SELECT SUM(material_return."QuantityOffered")
                            FROM "MaterialReturns" material_return
                            WHERE material_return."MaterialIssueId" = NEW."MaterialIssueId"
                              AND material_return."Status" = 'AwaitingReceipt'
                        ), 0)
                    INTO accounted_quantity;
                    IF accounted_quantity + NEW."Quantity" > issue_confirmed_quantity THEN
                        RAISE EXCEPTION 'Material use exceeds the quantity remaining in custody';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_MaterialUsageRecords_Controlled"
                    BEFORE INSERT ON "MaterialUsageRecords"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_material_usage();

                CREATE OR REPLACE FUNCTION constructionms_guard_material_issue_status()
                RETURNS trigger AS $$
                BEGIN
                    IF NOT (
                        (OLD."Status" = 'AwaitingConfirmation'
                            AND NEW."Status" IN ('Confirmed', 'Disputed'))
                        OR (OLD."Status" = 'Disputed' AND NEW."Status" = 'Confirmed')
                    ) THEN
                        RAISE EXCEPTION 'Material-issue status transition is invalid';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_MaterialIssues_StatusControlled"
                    BEFORE UPDATE OF "Status" ON "MaterialIssues"
                    FOR EACH ROW
                    WHEN (OLD."Status" IS DISTINCT FROM NEW."Status")
                    EXECUTE FUNCTION constructionms_guard_material_issue_status();

                CREATE OR REPLACE FUNCTION constructionms_validate_material_issue_dispute_source()
                RETURNS trigger AS $$
                DECLARE
                    issue_project_id integer;
                    issue_status text;
                    issued_quantity numeric(18,3);
                    confirmed_quantity numeric(18,3);
                    issuer_id integer;
                    recipient_id integer;
                    confirmer_id integer;
                    confirmed_at timestamp with time zone;
                BEGIN
                    PERFORM pg_advisory_xact_lock(NEW."MaterialIssueId");
                    SELECT "ProjectId", "Status", "QuantityIssued", "ConfirmedQuantity",
                           "IssuedByUserId", "IssuedToUserId", "ConfirmedByUserId", "ConfirmedAt"
                    INTO issue_project_id, issue_status, issued_quantity, confirmed_quantity,
                         issuer_id, recipient_id, confirmer_id, confirmed_at
                    FROM "MaterialIssues"
                    WHERE "Id" = NEW."MaterialIssueId";
                    IF NOT FOUND
                       OR issue_status NOT IN ('Disputed', 'Confirmed')
                       OR confirmed_quantity IS NULL
                       OR confirmed_quantity >= issued_quantity
                       OR confirmer_id IS DISTINCT FROM recipient_id THEN
                        RAISE EXCEPTION 'Material dispute resolution does not match a disputed handover';
                    END IF;
                    IF NEW."IssuedQuantity" <> issued_quantity
                       OR NEW."ForemanReceivedQuantity" <> confirmed_quantity
                       OR NEW."ReturnedToStoreQuantity" <> issued_quantity - confirmed_quantity THEN
                        RAISE EXCEPTION 'Material dispute quantities do not match the handover';
                    END IF;
                    IF NEW."ResolvedByUserId" IN (issuer_id, confirmer_id)
                       OR NOT constructionms_actor_has_project_role(
                            NEW."ResolvedByUserId", 'Supervisor', issue_project_id) THEN
                        RAISE EXCEPTION 'Material dispute must be resolved by an independent project Supervisor';
                    END IF;
                    IF NEW."ResolvedAt" < confirmed_at THEN
                        RAISE EXCEPTION 'Material dispute resolution cannot predate the handover confirmation';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_MaterialIssueDisputeResolutions_Validate"
                    BEFORE INSERT ON "MaterialIssueDisputeResolutions"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_material_issue_dispute_source();

                CREATE OR REPLACE FUNCTION constructionms_guard_custody_closeout()
                RETURNS trigger AS $$
                DECLARE
                    issue_project_id integer;
                    issue_recipient_id integer;
                    issue_status text;
                    issue_confirmed_quantity numeric(18,3);
                    actual_used numeric(18,3);
                    actual_wasted numeric(18,3);
                    actual_returned numeric(18,3);
                    pending_returns integer;
                    expected_revision integer;
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Material custody close-outs cannot be deleted';
                    END IF;
                    IF TG_OP = 'INSERT' THEN
                        IF NEW."Status" <> 'AwaitingReview' THEN
                            RAISE EXCEPTION 'A custody close-out must begin awaiting review';
                        END IF;
                        PERFORM pg_advisory_xact_lock(NEW."MaterialIssueId");
                        SELECT "ProjectId", "IssuedToUserId", "Status", "ConfirmedQuantity"
                        INTO issue_project_id, issue_recipient_id, issue_status, issue_confirmed_quantity
                        FROM "MaterialIssues"
                        WHERE "Id" = NEW."MaterialIssueId";
                        IF NOT FOUND
                           OR issue_status <> 'Confirmed'
                           OR issue_confirmed_quantity IS NULL
                           OR NEW."SubmittedByUserId" <> issue_recipient_id THEN
                            RAISE EXCEPTION 'Custody close-out must be submitted by the confirmed material recipient';
                        END IF;
                        IF NOT constructionms_actor_has_project_role(
                            NEW."SubmittedByUserId", 'Foreman', issue_project_id) THEN
                            RAISE EXCEPTION 'Custody close-out submitter is not active in the Foreman project role';
                        END IF;
                        SELECT
                            COALESCE(SUM(usage."Quantity") FILTER (WHERE usage."UsageType" = 'Used'), 0),
                            COALESCE(SUM(usage."Quantity") FILTER (WHERE usage."UsageType" = 'Wastage'), 0)
                        INTO actual_used, actual_wasted
                        FROM "MaterialUsageRecords" usage
                        WHERE usage."MaterialIssueId" = NEW."MaterialIssueId";
                        SELECT
                            COALESCE(SUM(COALESCE(material_return."QuantityAccepted", 0))
                                FILTER (WHERE material_return."Status" = 'Received'), 0),
                            COUNT(*) FILTER (WHERE material_return."Status" = 'AwaitingReceipt')
                        INTO actual_returned, pending_returns
                        FROM "MaterialReturns" material_return
                        WHERE material_return."MaterialIssueId" = NEW."MaterialIssueId";
                        SELECT COALESCE(MAX(closeout."Revision"), 0) + 1
                        INTO expected_revision
                        FROM "MaterialCustodyCloseouts" closeout
                        WHERE closeout."MaterialIssueId" = NEW."MaterialIssueId";
                        IF pending_returns <> 0
                           OR NEW."Revision" <> expected_revision
                           OR NEW."ConfirmedQuantity" <> issue_confirmed_quantity
                           OR NEW."UsedQuantity" <> actual_used
                           OR NEW."WastedQuantity" <> actual_wasted
                           OR NEW."ReturnedQuantity" <> actual_returned
                           OR NEW."UnaccountedQuantity"
                                <> issue_confirmed_quantity - actual_used - actual_wasted - actual_returned THEN
                            RAISE EXCEPTION 'Custody close-out snapshot does not match the material record';
                        END IF;
                        RETURN NEW;
                    END IF;
                    IF NEW."CloseoutNumber" IS DISTINCT FROM OLD."CloseoutNumber"
                       OR NEW."MaterialIssueId" IS DISTINCT FROM OLD."MaterialIssueId"
                       OR NEW."Revision" IS DISTINCT FROM OLD."Revision"
                       OR NEW."ConfirmedQuantity" IS DISTINCT FROM OLD."ConfirmedQuantity"
                       OR NEW."UsedQuantity" IS DISTINCT FROM OLD."UsedQuantity"
                       OR NEW."WastedQuantity" IS DISTINCT FROM OLD."WastedQuantity"
                       OR NEW."ReturnedQuantity" IS DISTINCT FROM OLD."ReturnedQuantity"
                       OR NEW."UnaccountedQuantity" IS DISTINCT FROM OLD."UnaccountedQuantity"
                       OR NEW."Notes" IS DISTINCT FROM OLD."Notes"
                       OR NEW."EvidenceReference" IS DISTINCT FROM OLD."EvidenceReference"
                       OR NEW."SubmittedByUserId" IS DISTINCT FROM OLD."SubmittedByUserId"
                       OR NEW."SubmittedAt" IS DISTINCT FROM OLD."SubmittedAt" THEN
                        RAISE EXCEPTION 'Custody close-out source fields are immutable';
                    END IF;
                    IF OLD."Status" <> 'AwaitingReview'
                       OR NEW."Status" NOT IN ('Approved', 'Returned') THEN
                        RAISE EXCEPTION 'Custody close-out status transition is invalid';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_MaterialCustodyCloseouts_Controlled"
                    BEFORE INSERT OR UPDATE OR DELETE ON "MaterialCustodyCloseouts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_custody_closeout();

                CREATE OR REPLACE FUNCTION constructionms_guard_operational_period()
                RETURNS trigger AS $$
                DECLARE
                    expected_role text;
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Operational periods cannot be deleted';
                    END IF;
                    PERFORM pg_advisory_xact_lock(NEW."ProjectId", hashtext(NEW."Scope"));
                    IF TG_OP = 'INSERT' THEN
                        IF NEW."Status" <> 'Open' THEN
                            RAISE EXCEPTION 'An operational period must begin open';
                        END IF;
                        expected_role := CASE NEW."Scope"
                            WHEN 'Inventory' THEN 'Supervisor'
                            WHEN 'Finance' THEN 'Finance Officer'
                        END;
                        IF NOT constructionms_actor_has_project_role(
                            NEW."CreatedByUserId", expected_role, NEW."ProjectId") THEN
                            RAISE EXCEPTION 'Operational-period creator is not active in the required project role';
                        END IF;
                        RETURN NEW;
                    END IF;
                    IF NEW."PeriodNumber" IS DISTINCT FROM OLD."PeriodNumber"
                       OR NEW."ProjectId" IS DISTINCT FROM OLD."ProjectId"
                       OR NEW."Scope" IS DISTINCT FROM OLD."Scope"
                       OR NEW."Name" IS DISTINCT FROM OLD."Name"
                       OR NEW."StartDate" IS DISTINCT FROM OLD."StartDate"
                       OR NEW."EndDate" IS DISTINCT FROM OLD."EndDate"
                       OR NEW."CreatedByUserId" IS DISTINCT FROM OLD."CreatedByUserId"
                       OR NEW."CreatedAt" IS DISTINCT FROM OLD."CreatedAt" THEN
                        RAISE EXCEPTION 'Operational-period source fields are immutable';
                    END IF;
                    IF NOT (
                        (OLD."Status" IN ('Open', 'Returned') AND NEW."Status" = 'AwaitingClose')
                        OR (OLD."Status" = 'AwaitingClose' AND NEW."Status" IN ('Closed', 'Returned'))
                    ) THEN
                        RAISE EXCEPTION 'Operational-period status transition is invalid';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_OperationalPeriods_Controlled"
                    BEFORE INSERT OR UPDATE OR DELETE ON "OperationalPeriods"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_operational_period();

                CREATE OR REPLACE FUNCTION constructionms_guard_controlled_correction()
                RETURNS trigger AS $$
                DECLARE
                    period_project_id integer;
                    period_scope text;
                    period_status text;
                    expected_role text;
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Controlled corrections cannot be deleted';
                    END IF;
                    IF TG_OP = 'INSERT' THEN
                        IF NEW."Status" <> 'AwaitingApproval' THEN
                            RAISE EXCEPTION 'A controlled correction must begin awaiting approval';
                        END IF;
                        SELECT "ProjectId", "Scope", "Status"
                        INTO period_project_id, period_scope, period_status
                        FROM "OperationalPeriods"
                        WHERE "Id" = NEW."OperationalPeriodId";
                        IF NOT FOUND
                           OR period_project_id <> NEW."ProjectId"
                           OR period_scope <> NEW."CorrectionType"
                           OR period_status <> 'Closed' THEN
                            RAISE EXCEPTION 'Controlled correction must match a closed project period';
                        END IF;
                        expected_role := CASE NEW."CorrectionType"
                            WHEN 'Inventory' THEN 'Storekeeper'
                            WHEN 'Finance' THEN 'Finance Officer'
                        END;
                        IF NOT constructionms_actor_has_project_role(
                            NEW."SubmittedByUserId", expected_role, NEW."ProjectId") THEN
                            RAISE EXCEPTION 'Controlled-correction submitter is not active in the required project role';
                        END IF;
                        RETURN NEW;
                    END IF;
                    IF NEW."CorrectionNumber" IS DISTINCT FROM OLD."CorrectionNumber"
                       OR NEW."OperationalPeriodId" IS DISTINCT FROM OLD."OperationalPeriodId"
                       OR NEW."ProjectId" IS DISTINCT FROM OLD."ProjectId"
                       OR NEW."CorrectionType" IS DISTINCT FROM OLD."CorrectionType"
                       OR NEW."MaterialId" IS DISTINCT FROM OLD."MaterialId"
                       OR NEW."CashAccountName" IS DISTINCT FROM OLD."CashAccountName"
                       OR NEW."QuantityDelta" IS DISTINCT FROM OLD."QuantityDelta"
                       OR NEW."AmountDelta" IS DISTINCT FROM OLD."AmountDelta"
                       OR NEW."Reason" IS DISTINCT FROM OLD."Reason"
                       OR NEW."EvidenceReference" IS DISTINCT FROM OLD."EvidenceReference"
                       OR NEW."SubmittedByUserId" IS DISTINCT FROM OLD."SubmittedByUserId"
                       OR NEW."SubmittedAt" IS DISTINCT FROM OLD."SubmittedAt" THEN
                        RAISE EXCEPTION 'Controlled-correction source fields are immutable';
                    END IF;
                    IF OLD."Status" <> 'AwaitingApproval'
                       OR NEW."Status" NOT IN ('Approved', 'Rejected') THEN
                        RAISE EXCEPTION 'Controlled-correction status transition is invalid';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_ControlledCorrections_Controlled"
                    BEFORE INSERT OR UPDATE OR DELETE ON "ControlledCorrections"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_controlled_correction();

                CREATE OR REPLACE FUNCTION constructionms_guard_cash_account()
                RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Cash accounts cannot be deleted';
                    END IF;
                    IF TG_OP = 'UPDATE' THEN
                        IF NEW."ProjectId" IS DISTINCT FROM OLD."ProjectId"
                           OR NEW."Name" IS DISTINCT FROM OLD."Name" THEN
                            RAISE EXCEPTION 'Cash-account identity is immutable';
                        END IF;
                        IF NEW."UpdatedAt" < OLD."UpdatedAt" THEN
                            RAISE EXCEPTION 'Cash-account update time cannot move backwards';
                        END IF;
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_CashAccounts_Controlled"
                    BEFORE UPDATE OR DELETE ON "CashAccounts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_cash_account();
                """);

            // Deferred checks see the complete transaction, so a state change and
            // its independently authored decision/posting must commit together.
            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_validate_opening_position_consistency()
                RETURNS trigger AS $$
                DECLARE
                    batch_id bigint;
                    batch_record record;
                    inventory_line_count integer;
                    cash_line_count integer;
                    verification_outcome text;
                    verification_actor integer;
                    verification_at timestamp with time zone;
                    decision_outcome text;
                    decision_actor integer;
                    decision_at timestamp with time zone;
                    posting_actor integer;
                    posting_at timestamp with time zone;
                    opening_ledger_count integer;
                BEGIN
                    IF TG_TABLE_NAME = 'OpeningPositionBatches' THEN
                        batch_id := NEW."Id";
                    ELSIF TG_TABLE_NAME IN (
                        'OpeningPositionVerifications',
                        'OpeningPositionDecisions',
                        'OpeningPositionPostings') THEN
                        batch_id := NEW."OpeningPositionBatchId";
                    ELSIF TG_TABLE_NAME = 'StockLedgerEntries'
                          AND NEW."MovementType" = 'OpeningBalance'
                          AND NEW."ReferenceType" = 'OpeningPosition' THEN
                        batch_id := NEW."ReferenceId";
                    ELSIF TG_TABLE_NAME = 'CashLedgerEntries'
                          AND NEW."EntryType" = 'OpeningBalance'
                          AND NEW."ReferenceType" = 'OpeningPosition' THEN
                        batch_id := NEW."ReferenceId";
                    ELSE
                        RETURN NULL;
                    END IF;

                    SELECT * INTO batch_record
                    FROM "OpeningPositionBatches"
                    WHERE "Id" = batch_id;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Opening-position source for control record was not found';
                    END IF;

                    SELECT COUNT(*) INTO inventory_line_count
                    FROM "OpeningInventoryLines"
                    WHERE "OpeningPositionBatchId" = batch_id;
                    SELECT COUNT(*) INTO cash_line_count
                    FROM "OpeningCashLines"
                    WHERE "OpeningPositionBatchId" = batch_id;

                    IF (batch_record."PositionType" = 'Inventory'
                            AND (inventory_line_count = 0 OR cash_line_count <> 0))
                       OR (batch_record."PositionType" = 'Cash'
                            AND (cash_line_count = 0 OR inventory_line_count <> 0)) THEN
                        RAISE EXCEPTION 'Opening-position lines do not match the batch type';
                    END IF;

                    SELECT "Outcome", "VerifiedByUserId", "VerifiedAt"
                    INTO verification_outcome, verification_actor, verification_at
                    FROM "OpeningPositionVerifications"
                    WHERE "OpeningPositionBatchId" = batch_id;
                    SELECT "Outcome", "DecidedByUserId", "DecidedAt"
                    INTO decision_outcome, decision_actor, decision_at
                    FROM "OpeningPositionDecisions"
                    WHERE "OpeningPositionBatchId" = batch_id;
                    SELECT "PostedByUserId", "PostedAt"
                    INTO posting_actor, posting_at
                    FROM "OpeningPositionPostings"
                    WHERE "OpeningPositionBatchId" = batch_id;

                    IF NOT constructionms_actor_has_project_role(
                        batch_record."SubmittedByUserId",
                        CASE batch_record."PositionType"
                            WHEN 'Inventory' THEN 'Storekeeper'
                            ELSE 'Finance Officer'
                        END,
                        batch_record."ProjectId") THEN
                        RAISE EXCEPTION 'Opening-position submitter is not active in the required project role';
                    END IF;
                    IF verification_actor IS NOT NULL
                       AND (
                            verification_actor = batch_record."SubmittedByUserId"
                            OR NOT constructionms_actor_has_project_role(
                                verification_actor, 'Supervisor', batch_record."ProjectId")
                            OR verification_at < batch_record."SubmittedAt"
                       ) THEN
                        RAISE EXCEPTION 'Opening-position verification is not independent or authorized';
                    END IF;
                    IF decision_actor IS NOT NULL
                       AND (
                            decision_actor = batch_record."SubmittedByUserId"
                            OR decision_actor = verification_actor
                            OR NOT constructionms_actor_has_project_role(
                                decision_actor, 'CEO', batch_record."ProjectId")
                            OR decision_at < COALESCE(verification_at, batch_record."SubmittedAt")
                       ) THEN
                        RAISE EXCEPTION 'Opening-position submitter cannot verify or approve the same batch';
                    END IF;

                    IF batch_record."Status" = 'AwaitingVerification' THEN
                        IF batch_record."PositionType" <> 'Inventory'
                           OR verification_outcome IS NOT NULL
                           OR decision_outcome IS NOT NULL
                           OR posting_actor IS NOT NULL THEN
                            RAISE EXCEPTION 'Opening-position verification state is inconsistent';
                        END IF;
                    ELSIF batch_record."Status" = 'AwaitingApproval' THEN
                        IF decision_outcome IS NOT NULL OR posting_actor IS NOT NULL
                           OR (batch_record."PositionType" = 'Inventory' AND verification_outcome IS DISTINCT FROM 'Verified')
                           OR (batch_record."PositionType" = 'Cash' AND verification_outcome IS NOT NULL) THEN
                            RAISE EXCEPTION 'Opening-position approval state is inconsistent';
                        END IF;
                    ELSIF batch_record."Status" = 'Approved' THEN
                        IF decision_outcome IS DISTINCT FROM 'Approved'
                           OR posting_actor IS DISTINCT FROM decision_actor
                           OR posting_at IS DISTINCT FROM decision_at
                           OR (batch_record."PositionType" = 'Inventory' AND verification_outcome IS DISTINCT FROM 'Verified')
                           OR (batch_record."PositionType" = 'Cash' AND verification_outcome IS NOT NULL) THEN
                            RAISE EXCEPTION 'Approved opening position is missing its verification, decision, or posting';
                        END IF;
                    ELSIF batch_record."Status" = 'Rejected' THEN
                        IF posting_actor IS NOT NULL OR NOT COALESCE((
                            (batch_record."PositionType" = 'Inventory' AND (
                                verification_outcome = 'Rejected'
                                OR (verification_outcome = 'Verified' AND decision_outcome = 'Rejected')
                            ))
                            OR (batch_record."PositionType" = 'Cash' AND decision_outcome = 'Rejected')
                        ), FALSE) THEN
                            RAISE EXCEPTION 'Rejected opening position is missing its matching decision';
                        END IF;
                    END IF;

                    IF batch_record."PositionType" = 'Inventory' THEN
                        SELECT COUNT(*) INTO opening_ledger_count
                        FROM "StockLedgerEntries"
                        WHERE "MovementType" = 'OpeningBalance'
                          AND "ReferenceType" = 'OpeningPosition'
                          AND "ReferenceId" = batch_id;
                        IF batch_record."Status" = 'Approved' AND (
                            opening_ledger_count <> inventory_line_count
                            OR EXISTS (
                                SELECT 1
                                FROM "OpeningInventoryLines" line
                                WHERE line."OpeningPositionBatchId" = batch_id
                                  AND 1 <> (
                                    SELECT COUNT(*)
                                    FROM "StockLedgerEntries" ledger
                                    WHERE ledger."MovementType" = 'OpeningBalance'
                                      AND ledger."ReferenceType" = 'OpeningPosition'
                                      AND ledger."ReferenceId" = batch_id
                                      AND ledger."ProjectId" = batch_record."ProjectId"
                                      AND ledger."MaterialId" = line."MaterialId"
                                      AND ledger."QuantityDelta" = line."Quantity"
                                      AND ledger."BalanceAfter" = line."Quantity"
                                      AND ledger."ReferenceNumber" = batch_record."BatchNumber"
                                      AND ledger."ActorUserId" = decision_actor
                                      AND ledger."OccurredAt" = decision_at
                                  )
                            )
                        ) THEN
                            RAISE EXCEPTION 'Approved opening stock is missing an exact ledger posting';
                        ELSIF batch_record."Status" <> 'Approved' AND opening_ledger_count <> 0 THEN
                            RAISE EXCEPTION 'Unapproved opening stock cannot have ledger postings';
                        END IF;
                    ELSE
                        SELECT COUNT(*) INTO opening_ledger_count
                        FROM "CashLedgerEntries"
                        WHERE "EntryType" = 'OpeningBalance'
                          AND "ReferenceType" = 'OpeningPosition'
                          AND "ReferenceId" = batch_id;
                        IF batch_record."Status" = 'Approved' AND (
                            opening_ledger_count <> cash_line_count
                            OR EXISTS (
                                SELECT 1
                                FROM "OpeningCashLines" line
                                WHERE line."OpeningPositionBatchId" = batch_id
                                  AND 1 <> (
                                    SELECT COUNT(*)
                                    FROM "CashLedgerEntries" ledger
                                    JOIN "CashAccounts" account
                                      ON account."Id" = ledger."CashAccountId"
                                    WHERE ledger."EntryType" = 'OpeningBalance'
                                      AND ledger."ReferenceType" = 'OpeningPosition'
                                      AND ledger."ReferenceId" = batch_id
                                      AND ledger."ProjectId" = batch_record."ProjectId"
                                      AND account."ProjectId" = batch_record."ProjectId"
                                      AND lower(btrim(account."Name")) = lower(btrim(line."AccountName"))
                                      AND ledger."AmountDelta" = line."Amount"
                                      AND ledger."BalanceAfter" = line."Amount"
                                      AND ledger."ReferenceNumber" = batch_record."BatchNumber"
                                      AND ledger."PostedByUserId" = decision_actor
                                      AND ledger."PostedAt" = decision_at
                                  )
                            )
                        ) THEN
                            RAISE EXCEPTION 'Approved opening cash is missing an exact ledger posting';
                        ELSIF batch_record."Status" <> 'Approved' AND opening_ledger_count <> 0 THEN
                            RAISE EXCEPTION 'Unapproved opening cash cannot have ledger postings';
                        END IF;
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_OpeningPositionBatches_Consistent"
                    AFTER INSERT OR UPDATE ON "OpeningPositionBatches"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_consistency();

                CREATE CONSTRAINT TRIGGER "TR_OpeningPositionVerifications_Consistent"
                    AFTER INSERT ON "OpeningPositionVerifications"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_consistency();
                CREATE CONSTRAINT TRIGGER "TR_OpeningPositionDecisions_Consistent"
                    AFTER INSERT ON "OpeningPositionDecisions"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_consistency();
                CREATE CONSTRAINT TRIGGER "TR_OpeningPositionPostings_Consistent"
                    AFTER INSERT ON "OpeningPositionPostings"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_consistency();

                CREATE OR REPLACE FUNCTION constructionms_validate_material_return_consistency()
                RETURNS trigger AS $$
                DECLARE
                    material_return_id bigint;
                    material_return_record record;
                    project_id integer;
                    material_id integer;
                    posting_count integer;
                BEGIN
                    IF TG_TABLE_NAME = 'MaterialReturns' THEN
                        material_return_id := NEW."Id";
                    ELSIF TG_TABLE_NAME = 'StockLedgerEntries'
                          AND NEW."MovementType" = 'ReturnToStore'
                          AND NEW."ReferenceType" = 'MaterialReturn' THEN
                        material_return_id := NEW."ReferenceId";
                    ELSE
                        RETURN NULL;
                    END IF;

                    SELECT * INTO material_return_record
                    FROM "MaterialReturns"
                    WHERE "Id" = material_return_id;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Material-return source for stock posting was not found';
                    END IF;

                    SELECT "ProjectId", "MaterialId" INTO project_id, material_id
                    FROM "MaterialIssues"
                    WHERE "Id" = material_return_record."MaterialIssueId";
                    SELECT COUNT(*) INTO posting_count
                    FROM "StockLedgerEntries"
                    WHERE "MovementType" = 'ReturnToStore'
                      AND "ReferenceType" = 'MaterialReturn'
                      AND "ReferenceId" = material_return_id;

                    IF material_return_record."Status" = 'Received' THEN
                        IF posting_count <> 1 OR NOT EXISTS (
                            SELECT 1 FROM "StockLedgerEntries"
                            WHERE "ProjectId" = project_id
                              AND "MaterialId" = material_id
                              AND "MovementType" = 'ReturnToStore'
                              AND "ReferenceType" = 'MaterialReturn'
                              AND "ReferenceId" = material_return_id
                              AND "ReferenceNumber" = material_return_record."ReturnNumber"
                              AND "QuantityDelta" = material_return_record."QuantityAccepted"
                              AND "ActorUserId" = material_return_record."ReceivedByUserId"
                              AND "OccurredAt" = material_return_record."ReceivedAt"
                        ) THEN
                            RAISE EXCEPTION 'Received material return is missing its exact stock-ledger posting';
                        END IF;
                    ELSIF posting_count <> 0 THEN
                        RAISE EXCEPTION 'Unreceived material return cannot have a stock-ledger posting';
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_MaterialReturns_Consistent"
                    AFTER INSERT OR UPDATE ON "MaterialReturns"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_material_return_consistency();

                CREATE CONSTRAINT TRIGGER "TR_StockLedgerEntries_MaterialReturnConsistent"
                    AFTER INSERT ON "StockLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_material_return_consistency();

                CREATE OR REPLACE FUNCTION constructionms_validate_material_issue_dispute_consistency()
                RETURNS trigger AS $$
                DECLARE
                    issue_id bigint;
                    resolution_record record;
                    issue_record record;
                    posting_count integer;
                BEGIN
                    IF TG_TABLE_NAME = 'MaterialIssueDisputeResolutions' THEN
                        issue_id := NEW."MaterialIssueId";
                    ELSIF TG_TABLE_NAME = 'MaterialIssues' THEN
                        IF NEW."Status" <> 'Confirmed'
                           OR NEW."ConfirmedQuantity" IS NULL
                           OR NEW."ConfirmedQuantity" >= NEW."QuantityIssued" THEN
                            RETURN NULL;
                        END IF;
                        issue_id := NEW."Id";
                    ELSIF TG_TABLE_NAME = 'StockLedgerEntries'
                          AND NEW."MovementType" = 'HandoverCorrection'
                          AND NEW."ReferenceType" = 'MaterialIssueDisputeResolution' THEN
                        SELECT "MaterialIssueId" INTO issue_id
                        FROM "MaterialIssueDisputeResolutions"
                        WHERE "Id" = NEW."ReferenceId";
                        IF NOT FOUND THEN
                            RAISE EXCEPTION 'Material-dispute source for stock posting was not found';
                        END IF;
                    ELSE
                        RETURN NULL;
                    END IF;

                    SELECT * INTO issue_record
                    FROM "MaterialIssues"
                    WHERE "Id" = issue_id;
                    SELECT * INTO resolution_record
                    FROM "MaterialIssueDisputeResolutions"
                    WHERE "MaterialIssueId" = issue_id;
                    IF NOT FOUND
                       OR issue_record."Status" <> 'Confirmed'
                       OR issue_record."ConfirmedQuantity" IS NULL
                       OR issue_record."ConfirmedQuantity" >= issue_record."QuantityIssued"
                       OR issue_record."ConfirmedByUserId" IS DISTINCT FROM issue_record."IssuedToUserId"
                       OR resolution_record."IssuedQuantity" <> issue_record."QuantityIssued"
                       OR resolution_record."ForemanReceivedQuantity" <> issue_record."ConfirmedQuantity"
                       OR resolution_record."ReturnedToStoreQuantity"
                            <> issue_record."QuantityIssued" - issue_record."ConfirmedQuantity"
                       OR resolution_record."ResolvedByUserId" IN (
                            issue_record."IssuedByUserId", issue_record."ConfirmedByUserId")
                       OR NOT constructionms_actor_has_project_role(
                            resolution_record."ResolvedByUserId", 'Supervisor', issue_record."ProjectId") THEN
                        RAISE EXCEPTION 'Material handover dispute resolution is missing or inconsistent';
                    END IF;

                    SELECT COUNT(*) INTO posting_count
                    FROM "StockLedgerEntries"
                    WHERE "MovementType" = 'HandoverCorrection'
                      AND "ReferenceType" = 'MaterialIssueDisputeResolution'
                      AND "ReferenceId" = resolution_record."Id";
                    IF posting_count <> 1 OR NOT EXISTS (
                        SELECT 1 FROM "StockLedgerEntries"
                        WHERE "MovementType" = 'HandoverCorrection'
                          AND "ReferenceType" = 'MaterialIssueDisputeResolution'
                          AND "ReferenceId" = resolution_record."Id"
                          AND "ReferenceNumber" = resolution_record."ResolutionNumber"
                          AND "ProjectId" = issue_record."ProjectId"
                          AND "MaterialId" = issue_record."MaterialId"
                          AND "QuantityDelta" = resolution_record."ReturnedToStoreQuantity"
                          AND "ActorUserId" = resolution_record."ResolvedByUserId"
                          AND "OccurredAt" = resolution_record."ResolvedAt"
                    ) THEN
                        RAISE EXCEPTION 'Material handover dispute is missing its exact stock-ledger correction';
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_MaterialIssueDisputeResolutions_Consistent"
                    AFTER INSERT ON "MaterialIssueDisputeResolutions"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_material_issue_dispute_consistency();
                CREATE CONSTRAINT TRIGGER "TR_MaterialIssues_DisputeResolutionConsistent"
                    AFTER UPDATE OF "Status" ON "MaterialIssues"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_material_issue_dispute_consistency();
                CREATE CONSTRAINT TRIGGER "TR_StockLedgerEntries_DisputeResolutionConsistent"
                    AFTER INSERT ON "StockLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_material_issue_dispute_consistency();

                CREATE OR REPLACE FUNCTION constructionms_validate_custody_closeout_consistency()
                RETURNS trigger AS $$
                DECLARE
                    closeout_id bigint;
                    closeout_record record;
                    issue_record record;
                    decision_outcome text;
                    decision_actor integer;
                    decision_at timestamp with time zone;
                    actual_used numeric(18,3);
                    actual_wasted numeric(18,3);
                    actual_returned numeric(18,3);
                    pending_returns integer;
                    revision_count integer;
                    maximum_revision integer;
                BEGIN
                    IF TG_TABLE_NAME = 'MaterialCustodyCloseouts' THEN
                        closeout_id := NEW."Id";
                    ELSIF TG_TABLE_NAME = 'MaterialCustodyCloseoutDecisions' THEN
                        closeout_id := NEW."MaterialCustodyCloseoutId";
                    ELSE
                        RETURN NULL;
                    END IF;

                    SELECT * INTO closeout_record
                    FROM "MaterialCustodyCloseouts"
                    WHERE "Id" = closeout_id;
                    SELECT * INTO issue_record
                    FROM "MaterialIssues"
                    WHERE "Id" = closeout_record."MaterialIssueId";
                    IF NOT FOUND
                       OR issue_record."Status" <> 'Confirmed'
                       OR issue_record."ConfirmedQuantity" IS NULL
                       OR closeout_record."SubmittedByUserId" <> issue_record."IssuedToUserId"
                       OR NOT constructionms_actor_has_project_role(
                            closeout_record."SubmittedByUserId", 'Foreman', issue_record."ProjectId") THEN
                        RAISE EXCEPTION 'Custody close-out source is not a confirmed recipient handover';
                    END IF;

                    SELECT
                        COALESCE(SUM(usage."Quantity") FILTER (WHERE usage."UsageType" = 'Used'), 0),
                        COALESCE(SUM(usage."Quantity") FILTER (WHERE usage."UsageType" = 'Wastage'), 0)
                    INTO actual_used, actual_wasted
                    FROM "MaterialUsageRecords" usage
                    WHERE usage."MaterialIssueId" = closeout_record."MaterialIssueId";
                    SELECT
                        COALESCE(SUM(COALESCE(material_return."QuantityAccepted", 0))
                            FILTER (WHERE material_return."Status" = 'Received'), 0),
                        COUNT(*) FILTER (WHERE material_return."Status" = 'AwaitingReceipt')
                    INTO actual_returned, pending_returns
                    FROM "MaterialReturns" material_return
                    WHERE material_return."MaterialIssueId" = closeout_record."MaterialIssueId";
                    IF pending_returns <> 0
                       OR closeout_record."ConfirmedQuantity" <> issue_record."ConfirmedQuantity"
                       OR closeout_record."UsedQuantity" <> actual_used
                       OR closeout_record."WastedQuantity" <> actual_wasted
                       OR closeout_record."ReturnedQuantity" <> actual_returned
                       OR closeout_record."UnaccountedQuantity"
                            <> issue_record."ConfirmedQuantity" - actual_used - actual_wasted - actual_returned THEN
                        RAISE EXCEPTION 'Custody close-out snapshot does not match issue, usage, and received returns';
                    END IF;

                    SELECT COUNT(*), MAX("Revision")
                    INTO revision_count, maximum_revision
                    FROM "MaterialCustodyCloseouts"
                    WHERE "MaterialIssueId" = closeout_record."MaterialIssueId";
                    IF maximum_revision <> revision_count
                       OR closeout_record."Revision" > maximum_revision THEN
                        RAISE EXCEPTION 'Custody close-out revision sequence is invalid';
                    END IF;

                    SELECT "Outcome", "DecidedByUserId", "DecidedAt"
                    INTO decision_outcome, decision_actor, decision_at
                    FROM "MaterialCustodyCloseoutDecisions"
                    WHERE "MaterialCustodyCloseoutId" = closeout_id;
                    IF closeout_record."Status" = 'AwaitingReview' THEN
                        IF decision_outcome IS NOT NULL THEN
                            RAISE EXCEPTION 'Awaiting custody close-out cannot already have a decision';
                        END IF;
                    ELSIF closeout_record."Status" IN ('Approved', 'Returned') THEN
                        IF decision_outcome IS DISTINCT FROM closeout_record."Status"
                           OR decision_actor = closeout_record."SubmittedByUserId"
                           OR NOT constructionms_actor_has_project_role(
                                decision_actor, 'Supervisor', issue_record."ProjectId")
                           OR decision_at < closeout_record."SubmittedAt"
                           OR (closeout_record."Status" = 'Approved'
                               AND closeout_record."UnaccountedQuantity" <> 0) THEN
                            RAISE EXCEPTION 'Custody close-out decision is missing or inconsistent';
                        END IF;
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_MaterialCustodyCloseouts_Consistent"
                    AFTER INSERT OR UPDATE ON "MaterialCustodyCloseouts"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_custody_closeout_consistency();

                CREATE CONSTRAINT TRIGGER "TR_MaterialCustodyCloseoutDecisions_Consistent"
                    AFTER INSERT ON "MaterialCustodyCloseoutDecisions"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_custody_closeout_consistency();

                CREATE OR REPLACE FUNCTION constructionms_validate_operational_period_consistency()
                RETURNS trigger AS $$
                DECLARE
                    period_id bigint;
                    period_record record;
                    latest_event text;
                    expected_event text;
                    event_count integer;
                    maximum_sequence integer;
                    submitter_role text;
                BEGIN
                    IF TG_TABLE_NAME = 'OperationalPeriods' THEN
                        period_id := NEW."Id";
                    ELSIF TG_TABLE_NAME = 'OperationalPeriodEvents' THEN
                        period_id := NEW."OperationalPeriodId";
                    ELSE
                        RETURN NULL;
                    END IF;

                    SELECT * INTO period_record
                    FROM "OperationalPeriods"
                    WHERE "Id" = period_id;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Operational period for event was not found';
                    END IF;
                    submitter_role := CASE period_record."Scope"
                        WHEN 'Inventory' THEN 'Supervisor'
                        ELSE 'Finance Officer'
                    END;
                    IF NOT constructionms_actor_has_project_role(
                        period_record."CreatedByUserId", submitter_role, period_record."ProjectId") THEN
                        RAISE EXCEPTION 'Operational-period creator is not active in the required project role';
                    END IF;

                    SELECT COUNT(*), MAX("SequenceNumber")
                    INTO event_count, maximum_sequence
                    FROM "OperationalPeriodEvents"
                    WHERE "OperationalPeriodId" = period_id;
                    IF event_count = 0 OR maximum_sequence <> event_count THEN
                        RAISE EXCEPTION 'Operational-period event sequence must start at one without gaps';
                    END IF;
                    IF EXISTS (
                        WITH ordered AS (
                            SELECT event."SequenceNumber", event."EventType", event."ActorUserId",
                                   event."ActorRole", event."OccurredAt",
                                   lag(event."EventType") OVER (ORDER BY event."SequenceNumber") AS prior_type,
                                   lag(event."ActorUserId") OVER (ORDER BY event."SequenceNumber") AS prior_actor,
                                   lag(event."OccurredAt") OVER (ORDER BY event."SequenceNumber") AS prior_time
                            FROM "OperationalPeriodEvents" event
                            WHERE event."OperationalPeriodId" = period_id
                        )
                        SELECT 1
                        FROM ordered event
                        WHERE (
                            event."SequenceNumber" = 1
                            AND (
                                event."EventType" <> 'Opened'
                                OR event."ActorUserId" <> period_record."CreatedByUserId"
                                OR event."ActorRole" <> submitter_role
                                OR NOT constructionms_actor_has_project_role(
                                    event."ActorUserId", submitter_role, period_record."ProjectId")
                            )
                        ) OR (
                            event."SequenceNumber" > 1
                            AND NOT (
                                (
                                    event.prior_type IN ('Opened', 'CloseReturned')
                                    AND event."EventType" = 'CloseSubmitted'
                                    AND event."ActorRole" = submitter_role
                                    AND constructionms_actor_has_project_role(
                                        event."ActorUserId", submitter_role, period_record."ProjectId")
                                ) OR (
                                    event.prior_type = 'CloseSubmitted'
                                    AND event."EventType" IN ('Closed', 'CloseReturned')
                                    AND event."ActorRole" = 'CEO'
                                    AND event."ActorUserId" <> event.prior_actor
                                    AND constructionms_actor_has_project_role(
                                        event."ActorUserId", 'CEO', period_record."ProjectId")
                                )
                            )
                        ) OR (
                            event.prior_time IS NOT NULL
                            AND event."OccurredAt" < event.prior_time
                        )
                    ) THEN
                        RAISE EXCEPTION 'Operational-period event history is invalid or violates segregation of duties';
                    END IF;

                    expected_event := CASE period_record."Status"
                        WHEN 'Open' THEN 'Opened'
                        WHEN 'AwaitingClose' THEN 'CloseSubmitted'
                        WHEN 'Closed' THEN 'Closed'
                        WHEN 'Returned' THEN 'CloseReturned'
                    END;
                    SELECT "EventType"
                    INTO latest_event
                    FROM "OperationalPeriodEvents"
                    WHERE "OperationalPeriodId" = period_id
                    ORDER BY "SequenceNumber" DESC
                    LIMIT 1;
                    IF latest_event IS DISTINCT FROM expected_event THEN
                        RAISE EXCEPTION 'Operational-period status is missing its matching latest event';
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_OperationalPeriods_Consistent"
                    AFTER INSERT OR UPDATE ON "OperationalPeriods"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_operational_period_consistency();

                CREATE CONSTRAINT TRIGGER "TR_OperationalPeriodEvents_Consistent"
                    AFTER INSERT ON "OperationalPeriodEvents"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_operational_period_consistency();

                CREATE OR REPLACE FUNCTION constructionms_validate_controlled_correction_consistency()
                RETURNS trigger AS $$
                DECLARE
                    correction_id bigint;
                    correction_record record;
                    period_record record;
                    decision_outcome text;
                    decision_actor integer;
                    decision_at timestamp with time zone;
                    posting_count integer;
                BEGIN
                    IF TG_TABLE_NAME = 'ControlledCorrections' THEN
                        correction_id := NEW."Id";
                    ELSIF TG_TABLE_NAME = 'ControlledCorrectionDecisions' THEN
                        correction_id := NEW."ControlledCorrectionId";
                    ELSIF TG_TABLE_NAME = 'StockLedgerEntries'
                          AND NEW."MovementType" = 'ControlledCorrection'
                          AND NEW."ReferenceType" = 'ControlledCorrection' THEN
                        correction_id := NEW."ReferenceId";
                    ELSIF TG_TABLE_NAME = 'CashLedgerEntries'
                          AND NEW."EntryType" = 'ControlledCorrection'
                          AND NEW."ReferenceType" = 'ControlledCorrection' THEN
                        correction_id := NEW."ReferenceId";
                    ELSE
                        RETURN NULL;
                    END IF;

                    SELECT * INTO correction_record
                    FROM "ControlledCorrections"
                    WHERE "Id" = correction_id;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Controlled-correction source for decision or posting was not found';
                    END IF;
                    SELECT * INTO period_record
                    FROM "OperationalPeriods"
                    WHERE "Id" = correction_record."OperationalPeriodId";
                    IF NOT FOUND
                       OR period_record."ProjectId" <> correction_record."ProjectId"
                       OR period_record."Scope" <> correction_record."CorrectionType"
                       OR period_record."Status" <> 'Closed' THEN
                        RAISE EXCEPTION 'Controlled correction must remain tied to its closed project period';
                    END IF;
                    IF NOT constructionms_actor_has_project_role(
                        correction_record."SubmittedByUserId",
                        CASE correction_record."CorrectionType"
                            WHEN 'Inventory' THEN 'Storekeeper'
                            ELSE 'Finance Officer'
                        END,
                        correction_record."ProjectId") THEN
                        RAISE EXCEPTION 'Controlled-correction submitter is not active in the required project role';
                    END IF;

                    SELECT "Outcome", "DecidedByUserId", "DecidedAt"
                    INTO decision_outcome, decision_actor, decision_at
                    FROM "ControlledCorrectionDecisions"
                    WHERE "ControlledCorrectionId" = correction_id;
                    IF correction_record."Status" = 'AwaitingApproval' THEN
                        IF decision_outcome IS NOT NULL THEN
                            RAISE EXCEPTION 'Pending controlled correction cannot already have a decision';
                        END IF;
                    ELSIF decision_outcome IS DISTINCT FROM correction_record."Status"
                       OR decision_actor = correction_record."SubmittedByUserId"
                       OR NOT constructionms_actor_has_project_role(
                            decision_actor, 'CEO', correction_record."ProjectId")
                       OR decision_at < correction_record."SubmittedAt" THEN
                        RAISE EXCEPTION 'Controlled-correction decision is missing, unauthorized, or not independent';
                    END IF;

                    IF correction_record."CorrectionType" = 'Inventory' THEN
                        SELECT COUNT(*) INTO posting_count
                        FROM "StockLedgerEntries"
                        WHERE "MovementType" = 'ControlledCorrection'
                          AND "ReferenceType" = 'ControlledCorrection'
                          AND "ReferenceId" = correction_id;
                        IF correction_record."Status" = 'Approved' AND (
                            posting_count <> 1 OR NOT EXISTS (
                            SELECT 1 FROM "StockLedgerEntries"
                            WHERE "ProjectId" = correction_record."ProjectId"
                              AND "MaterialId" = correction_record."MaterialId"
                              AND "MovementType" = 'ControlledCorrection'
                              AND "ReferenceType" = 'ControlledCorrection'
                              AND "ReferenceId" = correction_id
                              AND "ReferenceNumber" = correction_record."CorrectionNumber"
                              AND "QuantityDelta" = correction_record."QuantityDelta"
                              AND "ActorUserId" = decision_actor
                              AND "OccurredAt" = decision_at
                            )
                        ) THEN
                            RAISE EXCEPTION 'Approved inventory correction is missing its exact stock-ledger posting';
                        ELSIF correction_record."Status" <> 'Approved' AND posting_count <> 0 THEN
                            RAISE EXCEPTION 'Unapproved inventory correction cannot have stock-ledger postings';
                        END IF;
                    ELSE
                        SELECT COUNT(*) INTO posting_count
                        FROM "CashLedgerEntries"
                        WHERE "EntryType" = 'ControlledCorrection'
                          AND "ReferenceType" = 'ControlledCorrection'
                          AND "ReferenceId" = correction_id;
                        IF correction_record."Status" = 'Approved' AND (
                            posting_count <> 1 OR NOT EXISTS (
                            SELECT 1 FROM "CashLedgerEntries"
                            JOIN "CashAccounts" account ON account."Id" = "CashLedgerEntries"."CashAccountId"
                            WHERE "CashLedgerEntries"."ProjectId" = correction_record."ProjectId"
                              AND account."ProjectId" = correction_record."ProjectId"
                              AND lower(btrim(account."Name")) = lower(btrim(correction_record."CashAccountName"))
                              AND "EntryType" = 'ControlledCorrection'
                              AND "ReferenceType" = 'ControlledCorrection'
                              AND "ReferenceId" = correction_id
                              AND "ReferenceNumber" = correction_record."CorrectionNumber"
                              AND "AmountDelta" = correction_record."AmountDelta"
                              AND "PostedByUserId" = decision_actor
                              AND "PostedAt" = decision_at
                            )
                        ) THEN
                            RAISE EXCEPTION 'Approved finance correction is missing its exact cash-ledger posting';
                        ELSIF correction_record."Status" <> 'Approved' AND posting_count <> 0 THEN
                            RAISE EXCEPTION 'Unapproved finance correction cannot have cash-ledger postings';
                        END IF;
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_ControlledCorrections_Consistent"
                    AFTER INSERT OR UPDATE ON "ControlledCorrections"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_controlled_correction_consistency();

                CREATE CONSTRAINT TRIGGER "TR_ControlledCorrectionDecisions_Consistent"
                    AFTER INSERT ON "ControlledCorrectionDecisions"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_controlled_correction_consistency();
                CREATE CONSTRAINT TRIGGER "TR_StockLedgerEntries_ControlledCorrectionConsistent"
                    AFTER INSERT ON "StockLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_controlled_correction_consistency();
                CREATE CONSTRAINT TRIGGER "TR_CashLedgerEntries_ControlledCorrectionConsistent"
                    AFTER INSERT ON "CashLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_controlled_correction_consistency();

                CREATE OR REPLACE FUNCTION constructionms_validate_cash_account_projection()
                RETURNS trigger AS $$
                DECLARE
                    cash_account_id bigint;
                    account_record record;
                    ledger_project_id integer;
                    ledger_balance numeric(18,2);
                    ledger_posted_at timestamp with time zone;
                    source_project_id integer;
                    source_amount numeric(18,2);
                    source_actor integer;
                    source_at timestamp with time zone;
                    source_number text;
                    source_count integer;
                    source_found boolean;
                BEGIN
                    IF TG_TABLE_NAME = 'CashAccounts' THEN
                        cash_account_id := NEW."Id";
                    ELSIF TG_TABLE_NAME = 'CashLedgerEntries' THEN
                        cash_account_id := NEW."CashAccountId";
                    ELSE
                        RETURN NULL;
                    END IF;

                    SELECT * INTO account_record
                    FROM "CashAccounts"
                    WHERE "Id" = cash_account_id;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Cash account for ledger entry was not found';
                    END IF;
                    IF EXISTS (
                        WITH ordered AS (
                            SELECT ledger."Id", ledger."ProjectId", ledger."AmountDelta",
                                   ledger."BalanceAfter", ledger."PostedAt",
                                   lag(ledger."BalanceAfter") OVER (ORDER BY ledger."Id") AS prior_balance,
                                   lag(ledger."PostedAt") OVER (ORDER BY ledger."Id") AS prior_posted_at
                            FROM "CashLedgerEntries" ledger
                            WHERE ledger."CashAccountId" = cash_account_id
                        )
                        SELECT 1 FROM ordered ledger
                        WHERE ledger."ProjectId" <> account_record."ProjectId"
                           OR ledger."BalanceAfter"
                                <> COALESCE(ledger.prior_balance, 0) + ledger."AmountDelta"
                           OR (ledger.prior_posted_at IS NOT NULL
                               AND ledger."PostedAt" < ledger.prior_posted_at)
                    ) THEN
                        RAISE EXCEPTION 'Cash ledger is not a continuous project-scoped running balance';
                    END IF;

                    SELECT "ProjectId", "BalanceAfter", "PostedAt"
                    INTO ledger_project_id, ledger_balance, ledger_posted_at
                    FROM "CashLedgerEntries"
                    WHERE "CashAccountId" = cash_account_id
                    ORDER BY "Id" DESC
                    LIMIT 1;
                    IF NOT FOUND
                       OR ledger_project_id <> account_record."ProjectId"
                       OR ledger_balance <> account_record."Balance"
                       OR ledger_posted_at <> account_record."UpdatedAt" THEN
                        RAISE EXCEPTION 'Cash-account balance must equal its latest immutable ledger entry';
                    END IF;

                    IF TG_TABLE_NAME = 'CashLedgerEntries' THEN
                        IF NEW."EntryType" = 'OpeningBalance' THEN
                            IF NEW."ReferenceType" <> 'OpeningPosition' THEN
                                RAISE EXCEPTION 'Opening cash entry has an invalid source type';
                            END IF;
                        ELSIF NEW."EntryType" = 'ControlledCorrection' THEN
                            IF NEW."ReferenceType" <> 'ControlledCorrection' THEN
                                RAISE EXCEPTION 'Cash correction entry has an invalid source type';
                            END IF;
                        ELSIF NEW."EntryType" = 'SupplierPayment'
                              AND NEW."ReferenceType" = 'Payment' THEN
                            SELECT invoice."ProjectId", -payment."Amount", payment."PaidByUserId",
                                   payment."PaidAt", payment."PaymentNumber"
                            INTO source_project_id, source_amount, source_actor, source_at, source_number
                            FROM "Payments" payment
                            JOIN "PaymentAuthorizations" payment_authorization
                              ON payment_authorization."Id" = payment."PaymentAuthorizationId"
                            JOIN "SupplierInvoices" invoice
                              ON invoice."Id" = payment_authorization."SupplierInvoiceId"
                            WHERE payment."Id" = NEW."ReferenceId";
                            source_found := FOUND;
                            SELECT COUNT(*) INTO source_count
                            FROM "CashLedgerEntries"
                            WHERE "EntryType" = 'SupplierPayment'
                              AND "ReferenceType" = 'Payment'
                              AND "ReferenceId" = NEW."ReferenceId";
                            IF NOT source_found OR source_count <> 1
                               OR NEW."ProjectId" <> source_project_id
                               OR NEW."AmountDelta" <> source_amount
                               OR NEW."PostedByUserId" <> source_actor
                               OR NEW."PostedAt" <> source_at
                               OR NEW."ReferenceNumber" <> source_number THEN
                                RAISE EXCEPTION 'Supplier-payment cash entry does not match its payment';
                            END IF;
                        ELSIF NEW."EntryType" = 'PettyCashDisbursement'
                              AND NEW."ReferenceType" = 'PettyCashDisbursement' THEN
                            SELECT request."ProjectId", -disbursement."Amount",
                                   disbursement."DisbursedByUserId", disbursement."DisbursedAt",
                                   disbursement."DisbursementNumber"
                            INTO source_project_id, source_amount, source_actor, source_at, source_number
                            FROM "PettyCashDisbursements" disbursement
                            JOIN "PettyCashRequests" request
                              ON request."Id" = disbursement."PettyCashRequestId"
                            WHERE disbursement."Id" = NEW."ReferenceId";
                            source_found := FOUND;
                            SELECT COUNT(*) INTO source_count
                            FROM "CashLedgerEntries"
                            WHERE "EntryType" = 'PettyCashDisbursement'
                              AND "ReferenceType" = 'PettyCashDisbursement'
                              AND "ReferenceId" = NEW."ReferenceId";
                            IF NOT source_found OR source_count <> 1
                               OR NEW."ProjectId" <> source_project_id
                               OR NEW."AmountDelta" <> source_amount
                               OR NEW."PostedByUserId" <> source_actor
                               OR NEW."PostedAt" <> source_at
                               OR NEW."ReferenceNumber" <> source_number THEN
                                RAISE EXCEPTION 'Petty-cash entry does not match its disbursement';
                            END IF;
                        ELSIF NEW."EntryType" = 'CashReturn'
                              AND NEW."ReferenceType" = 'PettyCashReconciliation' THEN
                            SELECT request."ProjectId", reconciliation."AmountReturned",
                                   reconciliation."ReviewedByUserId", reconciliation."ReviewedAt",
                                   reconciliation."ReconciliationNumber"
                            INTO source_project_id, source_amount, source_actor, source_at, source_number
                            FROM "PettyCashReconciliations" reconciliation
                            JOIN "PettyCashRequests" request
                              ON request."Id" = reconciliation."PettyCashRequestId"
                            WHERE reconciliation."Id" = NEW."ReferenceId"
                              AND reconciliation."Status" = 'Approved'
                              AND reconciliation."AmountReturned" > 0;
                            source_found := FOUND;
                            SELECT COUNT(*) INTO source_count
                            FROM "CashLedgerEntries"
                            WHERE "EntryType" = 'CashReturn'
                              AND "ReferenceType" = 'PettyCashReconciliation'
                              AND "ReferenceId" = NEW."ReferenceId";
                            IF NOT source_found OR source_count <> 1
                               OR NEW."ProjectId" <> source_project_id
                               OR NEW."AmountDelta" <> source_amount
                               OR NEW."PostedByUserId" <> source_actor
                               OR NEW."PostedAt" <> source_at
                               OR NEW."ReferenceNumber" <> source_number THEN
                                RAISE EXCEPTION 'Cash-return entry does not match its approved petty-cash reconciliation';
                            END IF;
                        ELSE
                            RAISE EXCEPTION 'Cash-ledger entry type and source type are inconsistent';
                        END IF;
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_CashAccounts_LedgerProjection"
                    AFTER INSERT OR UPDATE ON "CashAccounts"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_cash_account_projection();

                CREATE CONSTRAINT TRIGGER "TR_CashLedgerEntries_LedgerProjection"
                    AFTER INSERT ON "CashLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_cash_account_projection();

                CREATE CONSTRAINT TRIGGER "TR_StockLedgerEntries_OpeningPositionConsistent"
                    AFTER INSERT ON "StockLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_consistency();
                CREATE CONSTRAINT TRIGGER "TR_CashLedgerEntries_OpeningPositionConsistent"
                    AFTER INSERT ON "CashLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_opening_position_consistency();

                CREATE OR REPLACE FUNCTION constructionms_validate_stock_balance_projection()
                RETURNS trigger AS $$
                DECLARE
                    project_id integer;
                    material_id integer;
                    balance_record record;
                    latest_ledger record;
                    previous_balance numeric(18,3);
                    previous_occurred_at timestamp with time zone;
                BEGIN
                    project_id := NEW."ProjectId";
                    material_id := NEW."MaterialId";
                    SELECT * INTO balance_record
                    FROM "StockBalances"
                    WHERE "ProjectId" = project_id AND "MaterialId" = material_id;
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Stock balance for ledger entry was not found';
                    END IF;
                    SELECT * INTO latest_ledger
                    FROM "StockLedgerEntries"
                    WHERE "ProjectId" = project_id AND "MaterialId" = material_id
                    ORDER BY "Id" DESC
                    LIMIT 1;
                    IF NOT FOUND
                       OR latest_ledger."BalanceAfter" <> balance_record."QuantityOnHand"
                       OR latest_ledger."OccurredAt" <> balance_record."UpdatedAt" THEN
                        RAISE EXCEPTION 'Stock balance must equal its latest immutable ledger entry';
                    END IF;

                    IF TG_TABLE_NAME = 'StockLedgerEntries' THEN
                        SELECT "BalanceAfter", "OccurredAt"
                        INTO previous_balance, previous_occurred_at
                        FROM "StockLedgerEntries"
                        WHERE "ProjectId" = project_id
                          AND "MaterialId" = material_id
                          AND "Id" < NEW."Id"
                        ORDER BY "Id" DESC
                        LIMIT 1;
                        IF NEW."BalanceAfter"
                                <> COALESCE(previous_balance, 0) + NEW."QuantityDelta"
                           OR (previous_occurred_at IS NOT NULL
                               AND NEW."OccurredAt" < previous_occurred_at) THEN
                            RAISE EXCEPTION 'Stock ledger is not a continuous chronological running balance';
                        END IF;
                        IF (NEW."MovementType" = 'OpeningBalance'
                                AND NEW."ReferenceType" <> 'OpeningPosition')
                           OR (NEW."MovementType" = 'ReturnToStore'
                                AND NEW."ReferenceType" <> 'MaterialReturn')
                           OR (NEW."MovementType" = 'HandoverCorrection'
                                AND NEW."ReferenceType" <> 'MaterialIssueDisputeResolution')
                           OR (NEW."MovementType" = 'ControlledCorrection'
                                AND NEW."ReferenceType" <> 'ControlledCorrection') THEN
                            RAISE EXCEPTION 'Stock-ledger movement type and source type are inconsistent';
                        END IF;
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_StockBalances_LedgerProjection"
                    AFTER INSERT OR UPDATE ON "StockBalances"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_stock_balance_projection();
                CREATE CONSTRAINT TRIGGER "TR_StockLedgerEntries_LedgerProjection"
                    AFTER INSERT ON "StockLedgerEntries"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_stock_balance_projection();
                """);

            migrationBuilder.Sql(
                """
                ALTER TABLE "EvidenceDocuments"
                    ADD CONSTRAINT "CK_EvidenceDocuments_StorageKeyFormat"
                        CHECK ("StorageKey" ~ '^[0-9a-f]{32}$'),
                    ADD CONSTRAINT "CK_EvidenceDocuments_Sha256Format"
                        CHECK ("Sha256Hash" ~ '^[0-9a-f]{64}$'),
                    ADD CONSTRAINT "CK_EvidenceDocuments_FileName"
                        CHECK (length(btrim("OriginalFileName")) > 0);

                CREATE OR REPLACE FUNCTION constructionms_validate_evidence_attachment()
                RETURNS trigger AS $$
                DECLARE
                    document_project_id integer;
                    document_actor_id integer;
                    document_uploaded_at timestamp with time zone;
                    source_project_id integer;
                    source_actor_id integer;
                    source_found boolean := FALSE;
                    allowed_kind boolean := FALSE;
                BEGIN
                    SELECT "ProjectId", "UploadedByUserId", "UploadedAt"
                    INTO document_project_id, document_actor_id, document_uploaded_at
                    FROM "EvidenceDocuments"
                    WHERE "Id" = NEW."EvidenceDocumentId";
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Evidence document was not found';
                    END IF;

                    IF NEW."SourceType" = 'ProjectProgressVerification' THEN
                        SELECT "ProjectId", "VerifiedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "ProjectProgressVerifications" WHERE "Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Other');
                    ELSIF NEW."SourceType" = 'GoodsReceipt' THEN
                        SELECT "ProjectId", "ReceivedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "GoodsReceipts" WHERE "Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'DeliveryNote', 'Other');
                    ELSIF NEW."SourceType" = 'GoodsReceiptTechnicalAcceptance' THEN
                        SELECT receipt."ProjectId", acceptance."EngineerUserId"
                        INTO source_project_id, source_actor_id
                        FROM "GoodsReceiptTechnicalAcceptances" acceptance
                        JOIN "GoodsReceipts" receipt ON receipt."Id" = acceptance."GoodsReceiptId"
                        WHERE acceptance."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Other');
                    ELSIF NEW."SourceType" = 'MaterialUsageRecord' THEN
                        SELECT issue."ProjectId", usage."RecordedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "MaterialUsageRecords" usage
                        JOIN "MaterialIssues" issue ON issue."Id" = usage."MaterialIssueId"
                        WHERE usage."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'SupplierInvoice' THEN
                        SELECT "ProjectId", "CapturedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "SupplierInvoices" WHERE "Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Invoice', 'Other');
                    ELSIF NEW."SourceType" = 'Payment' THEN
                        SELECT invoice."ProjectId", payment."PaidByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "Payments" payment
                        JOIN "PaymentAuthorizations" payment_authorization
                          ON payment_authorization."Id" = payment."PaymentAuthorizationId"
                        JOIN "SupplierInvoices" invoice
                          ON invoice."Id" = payment_authorization."SupplierInvoiceId"
                        WHERE payment."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('PaymentProof', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'PettyCashDisbursement' THEN
                        SELECT request."ProjectId", disbursement."DisbursedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "PettyCashDisbursements" disbursement
                        JOIN "PettyCashRequests" request
                          ON request."Id" = disbursement."PettyCashRequestId"
                        WHERE disbursement."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('PaymentProof', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'PettyCashReconciliation' THEN
                        SELECT request."ProjectId", reconciliation."SubmittedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "PettyCashReconciliations" reconciliation
                        JOIN "PettyCashRequests" request
                          ON request."Id" = reconciliation."PettyCashRequestId"
                        WHERE reconciliation."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Receipt', 'Photo', 'Other');
                    ELSIF NEW."SourceType" = 'OpeningPositionBatch' THEN
                        SELECT "ProjectId", "SubmittedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "OpeningPositionBatches" WHERE "Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'MaterialReturn' THEN
                        SELECT issue."ProjectId", material_return."ReturnedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "MaterialReturns" material_return
                        JOIN "MaterialIssues" issue ON issue."Id" = material_return."MaterialIssueId"
                        WHERE material_return."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'MaterialReturnReceipt' THEN
                        SELECT issue."ProjectId", material_return."ReceivedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "MaterialReturns" material_return
                        JOIN "MaterialIssues" issue ON issue."Id" = material_return."MaterialIssueId"
                        WHERE material_return."Id" = NEW."SourceId"
                          AND material_return."Status" <> 'AwaitingReceipt'
                          AND material_return."ReceivedByUserId" IS NOT NULL;
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'MaterialIssueDisputeResolution' THEN
                        SELECT issue."ProjectId", resolution."ResolvedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "MaterialIssueDisputeResolutions" resolution
                        JOIN "MaterialIssues" issue ON issue."Id" = resolution."MaterialIssueId"
                        WHERE resolution."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'MaterialCustodyCloseout' THEN
                        SELECT issue."ProjectId", closeout."SubmittedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "MaterialCustodyCloseouts" closeout
                        JOIN "MaterialIssues" issue ON issue."Id" = closeout."MaterialIssueId"
                        WHERE closeout."Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Receipt', 'Other');
                    ELSIF NEW."SourceType" = 'ControlledCorrection' THEN
                        SELECT "ProjectId", "SubmittedByUserId"
                        INTO source_project_id, source_actor_id
                        FROM "ControlledCorrections" WHERE "Id" = NEW."SourceId";
                        source_found := FOUND;
                        allowed_kind := NEW."EvidenceKind" IN ('Photo', 'Inspection', 'Receipt', 'Other');
                    END IF;

                    IF NOT source_found THEN
                        RAISE EXCEPTION 'Evidence source record was not found or is not attachable';
                    END IF;
                    IF NOT allowed_kind THEN
                        RAISE EXCEPTION 'Evidence kind is not allowed for this source';
                    END IF;
                    IF NEW."ProjectId" <> source_project_id
                       OR document_project_id <> source_project_id THEN
                        RAISE EXCEPTION 'Evidence project does not match its authoritative source';
                    END IF;
                    IF NEW."LinkedByUserId" <> source_actor_id
                       OR document_actor_id <> source_actor_id THEN
                        RAISE EXCEPTION 'Evidence actor does not match the user who recorded its source';
                    END IF;
                    IF NEW."LinkedAt" <> document_uploaded_at THEN
                        RAISE EXCEPTION 'Evidence document and attachment timestamps must match';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_EvidenceAttachments_Validate"
                    BEFORE INSERT ON "EvidenceAttachments"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_evidence_attachment();

                CREATE OR REPLACE FUNCTION constructionms_require_evidence_attachment()
                RETURNS trigger AS $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM "EvidenceAttachments"
                        WHERE "EvidenceDocumentId" = NEW."Id"
                    ) THEN
                        RAISE EXCEPTION 'Evidence document must be linked to exactly one source';
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_EvidenceDocuments_RequireAttachment"
                    AFTER INSERT ON "EvidenceDocuments"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_require_evidence_attachment();
                """);

            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_reject_overlapping_operational_period()
                RETURNS trigger AS $$
                BEGIN
                    PERFORM pg_advisory_xact_lock(NEW."ProjectId", hashtext(NEW."Scope"));
                    IF EXISTS (
                        SELECT 1 FROM "OperationalPeriods" period
                        WHERE period."ProjectId" = NEW."ProjectId"
                          AND period."Scope" = NEW."Scope"
                          AND period."Id" <> COALESCE(NEW."Id", 0)
                          AND period."StartDate" <= NEW."EndDate"
                          AND period."EndDate" >= NEW."StartDate"
                    ) THEN
                        RAISE EXCEPTION 'Operational period overlaps an existing project period in the same scope';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_OperationalPeriods_NoOverlap"
                    BEFORE INSERT ON "OperationalPeriods"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_overlapping_operational_period();

                CREATE OR REPLACE FUNCTION constructionms_guard_inventory_period_posting()
                RETURNS trigger AS $$
                BEGIN
                    PERFORM pg_advisory_xact_lock(NEW."ProjectId", hashtext('Inventory'));
                    IF NEW."MovementType" <> 'ControlledCorrection'
                       AND EXISTS (
                            SELECT 1 FROM "OperationalPeriods"
                            WHERE "ProjectId" = NEW."ProjectId"
                              AND "Scope" = 'Inventory'
                              AND "Status" IN ('AwaitingClose', 'Closed')
                              AND (NEW."OccurredAt" AT TIME ZONE 'Africa/Nairobi')::date
                                  BETWEEN "StartDate" AND "EndDate"
                       ) THEN
                        RAISE EXCEPTION 'Inventory posting falls inside a period awaiting close or already closed';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_StockLedgerEntries_PeriodLock"
                    BEFORE INSERT ON "StockLedgerEntries"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_inventory_period_posting();

                CREATE OR REPLACE FUNCTION constructionms_guard_cash_period_posting()
                RETURNS trigger AS $$
                BEGIN
                    PERFORM pg_advisory_xact_lock(NEW."ProjectId", hashtext('Finance'));
                    IF NEW."EntryType" <> 'ControlledCorrection'
                       AND EXISTS (
                            SELECT 1 FROM "OperationalPeriods"
                            WHERE "ProjectId" = NEW."ProjectId"
                              AND "Scope" = 'Finance'
                              AND "Status" IN ('AwaitingClose', 'Closed')
                              AND (NEW."PostedAt" AT TIME ZONE 'Africa/Nairobi')::date
                                  BETWEEN "StartDate" AND "EndDate"
                       ) THEN
                        RAISE EXCEPTION 'Cash posting falls inside a period awaiting close or already closed';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_CashLedgerEntries_PeriodLock"
                    BEFORE INSERT ON "CashLedgerEntries"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_cash_period_posting();

                CREATE OR REPLACE FUNCTION constructionms_guard_payment_period_posting()
                RETURNS trigger AS $$
                DECLARE
                    payment_project_id integer;
                BEGIN
                    SELECT invoice."ProjectId" INTO payment_project_id
                    FROM "PaymentAuthorizations" payment_authorization
                    JOIN "SupplierInvoices" invoice
                      ON invoice."Id" = payment_authorization."SupplierInvoiceId"
                    WHERE payment_authorization."Id" = NEW."PaymentAuthorizationId";
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Payment authorization project could not be resolved';
                    END IF;
                    PERFORM pg_advisory_xact_lock(payment_project_id, hashtext('Finance'));
                    IF EXISTS (
                        SELECT 1 FROM "OperationalPeriods"
                        WHERE "ProjectId" = payment_project_id
                          AND "Scope" = 'Finance'
                          AND "Status" IN ('AwaitingClose', 'Closed')
                          AND (NEW."PaidAt" AT TIME ZONE 'Africa/Nairobi')::date
                              BETWEEN "StartDate" AND "EndDate"
                    ) THEN
                        RAISE EXCEPTION 'Supplier payment falls inside a period awaiting close or already closed';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_Payments_PeriodLock"
                    BEFORE INSERT ON "Payments"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_payment_period_posting();

                CREATE OR REPLACE FUNCTION constructionms_guard_petty_cash_period_posting()
                RETURNS trigger AS $$
                DECLARE
                    payment_project_id integer;
                BEGIN
                    SELECT "ProjectId" INTO payment_project_id
                    FROM "PettyCashRequests"
                    WHERE "Id" = NEW."PettyCashRequestId";
                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'Petty-cash project could not be resolved';
                    END IF;
                    PERFORM pg_advisory_xact_lock(payment_project_id, hashtext('Finance'));
                    IF EXISTS (
                        SELECT 1 FROM "OperationalPeriods"
                        WHERE "ProjectId" = payment_project_id
                          AND "Scope" = 'Finance'
                          AND "Status" IN ('AwaitingClose', 'Closed')
                          AND (NEW."DisbursedAt" AT TIME ZONE 'Africa/Nairobi')::date
                              BETWEEN "StartDate" AND "EndDate"
                    ) THEN
                        RAISE EXCEPTION 'Petty-cash disbursement falls inside a period awaiting close or already closed';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_PettyCashDisbursements_PeriodLock"
                    BEFORE INSERT ON "PettyCashDisbursements"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_petty_cash_period_posting();

                CREATE OR REPLACE FUNCTION constructionms_guard_petty_cash_reconciliation_period()
                RETURNS trigger AS $$
                DECLARE
                    payment_project_id integer;
                BEGIN
                    IF NEW."Status" = 'Approved' AND OLD."Status" <> 'Approved' THEN
                        IF NEW."ReviewedAt" IS NULL THEN
                            RAISE EXCEPTION 'Approved petty-cash reconciliation requires its review time';
                        END IF;
                        SELECT request."ProjectId" INTO payment_project_id
                        FROM "PettyCashRequests" request
                        WHERE request."Id" = NEW."PettyCashRequestId";
                        PERFORM pg_advisory_xact_lock(payment_project_id, hashtext('Finance'));
                        IF EXISTS (
                            SELECT 1 FROM "OperationalPeriods"
                            WHERE "ProjectId" = payment_project_id
                              AND "Scope" = 'Finance'
                              AND "Status" IN ('AwaitingClose', 'Closed')
                              AND (NEW."ReviewedAt" AT TIME ZONE 'Africa/Nairobi')::date
                                  BETWEEN "StartDate" AND "EndDate"
                        ) THEN
                            RAISE EXCEPTION 'Petty-cash accountability falls inside a period awaiting close or already closed';
                        END IF;
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_PettyCashReconciliations_PeriodLock"
                    BEFORE UPDATE OF "Status" ON "PettyCashReconciliations"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_petty_cash_reconciliation_period();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "EvidenceDocuments")
                       OR EXISTS (SELECT 1 FROM "InAppNotifications")
                       OR EXISTS (SELECT 1 FROM "OpeningPositionBatches")
                       OR EXISTS (SELECT 1 FROM "MaterialReturns")
                       OR EXISTS (SELECT 1 FROM "MaterialIssueDisputeResolutions")
                       OR EXISTS (SELECT 1 FROM "MaterialCustodyCloseouts")
                       OR EXISTS (SELECT 1 FROM "OperationalPeriods")
                       OR EXISTS (SELECT 1 FROM "ControlledCorrections")
                       OR EXISTS (SELECT 1 FROM "CashAccounts")
                       OR EXISTS (
                            SELECT 1 FROM "StockLedgerEntries"
                            WHERE "MovementType" IN (
                                'OpeningBalance', 'ReturnToStore',
                                'HandoverCorrection', 'ControlledCorrection')
                       ) THEN
                        RAISE EXCEPTION 'Cannot roll back operational controls after evidence, notifications, opening positions, custody, periods, corrections, or their postings exist; restore a pre-migration backup instead';
                    END IF;
                END;
                $$;
                """);

            migrationBuilder.Sql(
                """
                DROP TRIGGER IF EXISTS "TR_InAppNotificationReadReceipts_Validate"
                    ON "InAppNotificationReadReceipts";
                DROP TRIGGER IF EXISTS "TR_OpeningInventoryLines_Validate"
                    ON "OpeningInventoryLines";
                DROP TRIGGER IF EXISTS "TR_OpeningCashLines_Validate"
                    ON "OpeningCashLines";
                DROP TRIGGER IF EXISTS "TR_OpeningPositionBatches_Controlled"
                    ON "OpeningPositionBatches";
                DROP TRIGGER IF EXISTS "TR_MaterialReturns_Controlled"
                    ON "MaterialReturns";
                DROP TRIGGER IF EXISTS "TR_MaterialUsageRecords_Controlled"
                    ON "MaterialUsageRecords";
                DROP TRIGGER IF EXISTS "TR_MaterialIssues_StatusControlled"
                    ON "MaterialIssues";
                DROP TRIGGER IF EXISTS "TR_MaterialIssueDisputeResolutions_Validate"
                    ON "MaterialIssueDisputeResolutions";
                DROP TRIGGER IF EXISTS "TR_MaterialCustodyCloseouts_Controlled"
                    ON "MaterialCustodyCloseouts";
                DROP TRIGGER IF EXISTS "TR_OperationalPeriods_Controlled"
                    ON "OperationalPeriods";
                DROP TRIGGER IF EXISTS "TR_ControlledCorrections_Controlled"
                    ON "ControlledCorrections";
                DROP TRIGGER IF EXISTS "TR_CashAccounts_Controlled"
                    ON "CashAccounts";
                DROP TRIGGER IF EXISTS "TR_OpeningPositionBatches_Consistent"
                    ON "OpeningPositionBatches";
                DROP TRIGGER IF EXISTS "TR_OpeningPositionVerifications_Consistent"
                    ON "OpeningPositionVerifications";
                DROP TRIGGER IF EXISTS "TR_OpeningPositionDecisions_Consistent"
                    ON "OpeningPositionDecisions";
                DROP TRIGGER IF EXISTS "TR_OpeningPositionPostings_Consistent"
                    ON "OpeningPositionPostings";
                DROP TRIGGER IF EXISTS "TR_MaterialReturns_Consistent"
                    ON "MaterialReturns";
                DROP TRIGGER IF EXISTS "TR_StockLedgerEntries_MaterialReturnConsistent"
                    ON "StockLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_MaterialIssueDisputeResolutions_Consistent"
                    ON "MaterialIssueDisputeResolutions";
                DROP TRIGGER IF EXISTS "TR_MaterialIssues_DisputeResolutionConsistent"
                    ON "MaterialIssues";
                DROP TRIGGER IF EXISTS "TR_StockLedgerEntries_DisputeResolutionConsistent"
                    ON "StockLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_MaterialCustodyCloseouts_Consistent"
                    ON "MaterialCustodyCloseouts";
                DROP TRIGGER IF EXISTS "TR_MaterialCustodyCloseoutDecisions_Consistent"
                    ON "MaterialCustodyCloseoutDecisions";
                DROP TRIGGER IF EXISTS "TR_OperationalPeriods_Consistent"
                    ON "OperationalPeriods";
                DROP TRIGGER IF EXISTS "TR_OperationalPeriodEvents_Consistent"
                    ON "OperationalPeriodEvents";
                DROP TRIGGER IF EXISTS "TR_ControlledCorrections_Consistent"
                    ON "ControlledCorrections";
                DROP TRIGGER IF EXISTS "TR_ControlledCorrectionDecisions_Consistent"
                    ON "ControlledCorrectionDecisions";
                DROP TRIGGER IF EXISTS "TR_StockLedgerEntries_ControlledCorrectionConsistent"
                    ON "StockLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_CashLedgerEntries_ControlledCorrectionConsistent"
                    ON "CashLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_CashAccounts_LedgerProjection"
                    ON "CashAccounts";
                DROP TRIGGER IF EXISTS "TR_CashLedgerEntries_LedgerProjection"
                    ON "CashLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_StockLedgerEntries_OpeningPositionConsistent"
                    ON "StockLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_CashLedgerEntries_OpeningPositionConsistent"
                    ON "CashLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_StockBalances_LedgerProjection"
                    ON "StockBalances";
                DROP TRIGGER IF EXISTS "TR_StockLedgerEntries_LedgerProjection"
                    ON "StockLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_EvidenceAttachments_Validate"
                    ON "EvidenceAttachments";
                DROP TRIGGER IF EXISTS "TR_EvidenceDocuments_RequireAttachment"
                    ON "EvidenceDocuments";
                DROP TRIGGER IF EXISTS "TR_OperationalPeriods_NoOverlap"
                    ON "OperationalPeriods";
                DROP TRIGGER IF EXISTS "TR_StockLedgerEntries_PeriodLock"
                    ON "StockLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_CashLedgerEntries_PeriodLock"
                    ON "CashLedgerEntries";
                DROP TRIGGER IF EXISTS "TR_Payments_PeriodLock"
                    ON "Payments";
                DROP TRIGGER IF EXISTS "TR_PettyCashDisbursements_PeriodLock"
                    ON "PettyCashDisbursements";
                DROP TRIGGER IF EXISTS "TR_PettyCashReconciliations_PeriodLock"
                    ON "PettyCashReconciliations";

                DROP FUNCTION IF EXISTS constructionms_validate_notification_read_receipt();
                DROP FUNCTION IF EXISTS constructionms_validate_opening_position_line();
                DROP FUNCTION IF EXISTS constructionms_guard_opening_position_batch();
                DROP FUNCTION IF EXISTS constructionms_guard_material_return();
                DROP FUNCTION IF EXISTS constructionms_guard_material_usage();
                DROP FUNCTION IF EXISTS constructionms_guard_material_issue_status();
                DROP FUNCTION IF EXISTS constructionms_validate_material_issue_dispute_source();
                DROP FUNCTION IF EXISTS constructionms_guard_custody_closeout();
                DROP FUNCTION IF EXISTS constructionms_guard_operational_period();
                DROP FUNCTION IF EXISTS constructionms_guard_controlled_correction();
                DROP FUNCTION IF EXISTS constructionms_guard_cash_account();
                DROP FUNCTION IF EXISTS constructionms_validate_opening_position_consistency();
                DROP FUNCTION IF EXISTS constructionms_validate_material_return_consistency();
                DROP FUNCTION IF EXISTS constructionms_validate_material_issue_dispute_consistency();
                DROP FUNCTION IF EXISTS constructionms_validate_custody_closeout_consistency();
                DROP FUNCTION IF EXISTS constructionms_validate_operational_period_consistency();
                DROP FUNCTION IF EXISTS constructionms_validate_controlled_correction_consistency();
                DROP FUNCTION IF EXISTS constructionms_validate_cash_account_projection();
                DROP FUNCTION IF EXISTS constructionms_validate_stock_balance_projection();
                DROP FUNCTION IF EXISTS constructionms_validate_evidence_attachment();
                DROP FUNCTION IF EXISTS constructionms_require_evidence_attachment();
                DROP FUNCTION IF EXISTS constructionms_reject_overlapping_operational_period();
                DROP FUNCTION IF EXISTS constructionms_guard_inventory_period_posting();
                DROP FUNCTION IF EXISTS constructionms_guard_cash_period_posting();
                DROP FUNCTION IF EXISTS constructionms_guard_payment_period_posting();
                DROP FUNCTION IF EXISTS constructionms_guard_petty_cash_period_posting();
                DROP FUNCTION IF EXISTS constructionms_guard_petty_cash_reconciliation_period();
                DROP FUNCTION IF EXISTS constructionms_actor_has_project_role(integer, text, integer);
                """);

            migrationBuilder.DropTable(
                name: "CashLedgerEntries");

            migrationBuilder.DropTable(
                name: "ControlledCorrectionDecisions");

            migrationBuilder.DropTable(
                name: "EvidenceAttachments");

            migrationBuilder.DropTable(
                name: "InAppNotificationReadReceipts");

            migrationBuilder.DropTable(
                name: "InAppNotificationResolutionReceipts");

            migrationBuilder.DropTable(
                name: "MaterialCustodyCloseoutDecisions");

            migrationBuilder.DropTable(
                name: "MaterialIssueDisputeResolutions");

            migrationBuilder.DropTable(
                name: "MaterialReturns");

            migrationBuilder.DropTable(
                name: "OpeningCashLines");

            migrationBuilder.DropTable(
                name: "OpeningInventoryLines");

            migrationBuilder.DropTable(
                name: "OpeningPositionDecisions");

            migrationBuilder.DropTable(
                name: "OpeningPositionPostings");

            migrationBuilder.DropTable(
                name: "OpeningPositionVerifications");

            migrationBuilder.DropTable(
                name: "OperationalPeriodEvents");

            migrationBuilder.DropTable(
                name: "CashAccounts");

            migrationBuilder.DropTable(
                name: "ControlledCorrections");

            migrationBuilder.DropTable(
                name: "EvidenceDocuments");

            migrationBuilder.DropTable(
                name: "InAppNotifications");

            migrationBuilder.DropTable(
                name: "MaterialCustodyCloseouts");

            migrationBuilder.DropTable(
                name: "OpeningPositionBatches");

            migrationBuilder.DropTable(
                name: "OperationalPeriods");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries",
                sql: "\"MovementType\" IN ('Receipt', 'TechnicalAcceptance', 'Issue', 'TransferOut', 'TransferIn', 'CountAdjustment')");
        }
    }
}
