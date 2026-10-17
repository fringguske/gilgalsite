using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CompleteInventoryAndFinanceWorkflows : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ControlEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ChainKey = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    SequenceNumber = table.Column<int>(type: "integer", nullable: false),
                    RequisitionId = table.Column<int>(type: "integer", nullable: true),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    EntityType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    EntityId = table.Column<long>(type: "bigint", nullable: false),
                    ReferenceNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    EventType = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    DetailsJson = table.Column<string>(type: "jsonb", nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PreviousEventHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    EventHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ControlEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ControlEvents_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ControlEvents_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ControlEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "GoodsReceipts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReceiptNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PurchaseOrderId = table.Column<int>(type: "integer", nullable: false),
                    PurchaseOrderLineId = table.Column<int>(type: "integer", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    DeliveredQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    AcceptedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    RejectedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Condition = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    DeliveryNoteReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DiscrepancyNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReceivedByUserId = table.Column<int>(type: "integer", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GoodsReceipts", x => x.Id);
                    table.CheckConstraint("CK_GoodsReceipts_Condition", "\"Condition\" IN ('Good', 'Damaged', 'Mixed')");
                    table.CheckConstraint("CK_GoodsReceipts_Quantities", "\"DeliveredQuantity\" > 0 AND \"AcceptedQuantity\" >= 0 AND \"RejectedQuantity\" >= 0 AND \"DeliveredQuantity\" = \"AcceptedQuantity\" + \"RejectedQuantity\"");
                    table.ForeignKey(
                        name: "FK_GoodsReceipts_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GoodsReceipts_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GoodsReceipts_PurchaseOrderLines_PurchaseOrderLineId",
                        column: x => x.PurchaseOrderLineId,
                        principalTable: "PurchaseOrderLines",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GoodsReceipts_PurchaseOrders_PurchaseOrderId",
                        column: x => x.PurchaseOrderId,
                        principalTable: "PurchaseOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GoodsReceipts_Users_ReceivedByUserId",
                        column: x => x.ReceivedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MaterialIssues",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    IssueNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    RequisitionId = table.Column<int>(type: "integer", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    QuantityIssued = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    IssuedByUserId = table.Column<int>(type: "integer", nullable: false),
                    IssuedToUserId = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IssuedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ConfirmedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ConfirmedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    ConfirmationNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ConfirmedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialIssues", x => x.Id);
                    table.CheckConstraint("CK_MaterialIssues_Confirmation", "(\"Status\" = 'AwaitingConfirmation' AND \"ConfirmedByUserId\" IS NULL AND \"ConfirmedAt\" IS NULL AND \"ConfirmedQuantity\" IS NULL) OR (\"Status\" <> 'AwaitingConfirmation' AND \"ConfirmedByUserId\" IS NOT NULL AND \"ConfirmedAt\" IS NOT NULL AND \"ConfirmedQuantity\" IS NOT NULL)");
                    table.CheckConstraint("CK_MaterialIssues_Quantity", "\"QuantityIssued\" > 0");
                    table.CheckConstraint("CK_MaterialIssues_Status", "\"Status\" IN ('AwaitingConfirmation', 'Confirmed', 'Disputed')");
                    table.ForeignKey(
                        name: "FK_MaterialIssues_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialIssues_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialIssues_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialIssues_Users_ConfirmedByUserId",
                        column: x => x.ConfirmedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialIssues_Users_IssuedByUserId",
                        column: x => x.IssuedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialIssues_Users_IssuedToUserId",
                        column: x => x.IssuedToUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockBalances",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    QuantityOnHand = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockBalances", x => x.Id);
                    table.CheckConstraint("CK_StockBalances_NonNegative", "\"QuantityOnHand\" >= 0");
                    table.ForeignKey(
                        name: "FK_StockBalances_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockBalances_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockCounts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CountNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    SystemQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    CountedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Variance = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CountedByUserId = table.Column<int>(type: "integer", nullable: false),
                    CountedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ReviewNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockCounts", x => x.Id);
                    table.CheckConstraint("CK_StockCounts_Quantities", "\"SystemQuantity\" >= 0 AND \"CountedQuantity\" >= 0");
                    table.CheckConstraint("CK_StockCounts_Status", "\"Status\" IN ('AwaitingReview', 'Approved', 'Rejected')");
                    table.CheckConstraint("CK_StockCounts_Variance", "\"Variance\" = \"CountedQuantity\" - \"SystemQuantity\"");
                    table.ForeignKey(
                        name: "FK_StockCounts_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockCounts_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockCounts_Users_CountedByUserId",
                        column: x => x.CountedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockCounts_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockLedgerEntries",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    MovementType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    QuantityDelta = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    BalanceAfter = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    ReferenceType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ReferenceId = table.Column<long>(type: "bigint", nullable: false),
                    ReferenceNumber = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockLedgerEntries", x => x.Id);
                    table.CheckConstraint("CK_StockLedgerEntries_Balance", "\"BalanceAfter\" >= 0");
                    table.CheckConstraint("CK_StockLedgerEntries_Delta", "\"QuantityDelta\" <> 0");
                    table.CheckConstraint("CK_StockLedgerEntries_Movement", "\"MovementType\" IN ('Receipt', 'Issue', 'TransferOut', 'TransferIn', 'CountAdjustment')");
                    table.ForeignKey(
                        name: "FK_StockLedgerEntries_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockLedgerEntries_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockLedgerEntries_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StockTransfers",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TransferNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    FromProjectId = table.Column<int>(type: "integer", nullable: false),
                    ToProjectId = table.Column<int>(type: "integer", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    RequestedByUserId = table.Column<int>(type: "integer", nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispatchedByUserId = table.Column<int>(type: "integer", nullable: true),
                    DispatchedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReceivedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ReceivedQuantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    ReceiptNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StockTransfers", x => x.Id);
                    table.CheckConstraint("CK_StockTransfers_Projects", "\"FromProjectId\" <> \"ToProjectId\"");
                    table.CheckConstraint("CK_StockTransfers_Quantity", "\"Quantity\" > 0");
                    table.CheckConstraint("CK_StockTransfers_Status", "\"Status\" IN ('PendingDispatch', 'InTransit', 'Received', 'Disputed')");
                    table.ForeignKey(
                        name: "FK_StockTransfers_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockTransfers_Projects_FromProjectId",
                        column: x => x.FromProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockTransfers_Projects_ToProjectId",
                        column: x => x.ToProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockTransfers_Users_DispatchedByUserId",
                        column: x => x.DispatchedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockTransfers_Users_ReceivedByUserId",
                        column: x => x.ReceivedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StockTransfers_Users_RequestedByUserId",
                        column: x => x.RequestedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupplierInvoices",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    InvoiceNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    PurchaseOrderId = table.Column<int>(type: "integer", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    SupplierId = table.Column<int>(type: "integer", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DocumentReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CapturedByUserId = table.Column<int>(type: "integer", nullable: false),
                    CapturedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ReceivedQuantitySnapshot = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: true),
                    MatchNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ReviewedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CeoDecisionByUserId = table.Column<int>(type: "integer", nullable: true),
                    CeoDecision = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CeoDecisionNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CeoDecisionAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierInvoices", x => x.Id);
                    table.CheckConstraint("CK_SupplierInvoices_Amounts", "\"Quantity\" > 0 AND \"UnitPrice\" > 0 AND \"Amount\" > 0");
                    table.CheckConstraint("CK_SupplierInvoices_Status", "\"Status\" IN ('PendingReview', 'Matched', 'Mismatch', 'AwaitingCeoApproval', 'ReadyForAuthorization', 'Authorized', 'Paid', 'Returned', 'Rejected')");
                    table.ForeignKey(
                        name: "FK_SupplierInvoices_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierInvoices_PurchaseOrders_PurchaseOrderId",
                        column: x => x.PurchaseOrderId,
                        principalTable: "PurchaseOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierInvoices_Suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalTable: "Suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierInvoices_Users_CapturedByUserId",
                        column: x => x.CapturedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierInvoices_Users_CeoDecisionByUserId",
                        column: x => x.CeoDecisionByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierInvoices_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MaterialUsageRecords",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MaterialIssueId = table.Column<long>(type: "bigint", nullable: false),
                    UsageType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    PurposeOrReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    RecordedByUserId = table.Column<int>(type: "integer", nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialUsageRecords", x => x.Id);
                    table.CheckConstraint("CK_MaterialUsageRecords_Quantity", "\"Quantity\" > 0");
                    table.CheckConstraint("CK_MaterialUsageRecords_Type", "\"UsageType\" IN ('Used', 'Wastage')");
                    table.ForeignKey(
                        name: "FK_MaterialUsageRecords_MaterialIssues_MaterialIssueId",
                        column: x => x.MaterialIssueId,
                        principalTable: "MaterialIssues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialUsageRecords_Users_RecordedByUserId",
                        column: x => x.RecordedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentAuthorizations",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AuthorizationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SupplierInvoiceId = table.Column<long>(type: "bigint", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    AuthorizedByUserId = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AuthorizedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentAuthorizations", x => x.Id);
                    table.CheckConstraint("CK_PaymentAuthorizations_Amount", "\"Amount\" > 0");
                    table.ForeignKey(
                        name: "FK_PaymentAuthorizations_SupplierInvoices_SupplierInvoiceId",
                        column: x => x.SupplierInvoiceId,
                        principalTable: "SupplierInvoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentAuthorizations_Users_AuthorizedByUserId",
                        column: x => x.AuthorizedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Payments",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PaymentNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PaymentAuthorizationId = table.Column<long>(type: "bigint", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Method = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ExternalReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PaidByUserId = table.Column<int>(type: "integer", nullable: false),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payments", x => x.Id);
                    table.CheckConstraint("CK_Payments_Amount", "\"Amount\" > 0");
                    table.CheckConstraint("CK_Payments_Method", "\"Method\" IN ('BankTransfer', 'MPesa', 'Cheque', 'Cash')");
                    table.ForeignKey(
                        name: "FK_Payments_PaymentAuthorizations_PaymentAuthorizationId",
                        column: x => x.PaymentAuthorizationId,
                        principalTable: "PaymentAuthorizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Payments_Users_PaidByUserId",
                        column: x => x.PaidByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PaymentReceipts",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReceiptNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PaymentId = table.Column<long>(type: "bigint", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    IssuedByUserId = table.Column<int>(type: "integer", nullable: false),
                    IssuedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentReceipts", x => x.Id);
                    table.CheckConstraint("CK_PaymentReceipts_Amount", "\"Amount\" > 0");
                    table.ForeignKey(
                        name: "FK_PaymentReceipts_Payments_PaymentId",
                        column: x => x.PaymentId,
                        principalTable: "Payments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PaymentReceipts_Users_IssuedByUserId",
                        column: x => x.IssuedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ControlEvents_ActorUserId",
                table: "ControlEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ControlEvents_ChainKey_SequenceNumber",
                table: "ControlEvents",
                columns: new[] { "ChainKey", "SequenceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ControlEvents_EventHash",
                table: "ControlEvents",
                column: "EventHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ControlEvents_ProjectId_OccurredAt",
                table: "ControlEvents",
                columns: new[] { "ProjectId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ControlEvents_RequisitionId",
                table: "ControlEvents",
                column: "RequisitionId");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_MaterialId",
                table: "GoodsReceipts",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_ProjectId",
                table: "GoodsReceipts",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_PurchaseOrderId",
                table: "GoodsReceipts",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_PurchaseOrderLineId_ReceivedAt",
                table: "GoodsReceipts",
                columns: new[] { "PurchaseOrderLineId", "ReceivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_ReceiptNumber",
                table: "GoodsReceipts",
                column: "ReceiptNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_ReceivedByUserId",
                table: "GoodsReceipts",
                column: "ReceivedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssues_ConfirmedByUserId",
                table: "MaterialIssues",
                column: "ConfirmedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssues_IssuedByUserId",
                table: "MaterialIssues",
                column: "IssuedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssues_IssuedToUserId",
                table: "MaterialIssues",
                column: "IssuedToUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssues_IssueNumber",
                table: "MaterialIssues",
                column: "IssueNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssues_MaterialId",
                table: "MaterialIssues",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssues_ProjectId",
                table: "MaterialIssues",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialIssues_RequisitionId",
                table: "MaterialIssues",
                column: "RequisitionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialUsageRecords_MaterialIssueId_RecordedAt",
                table: "MaterialUsageRecords",
                columns: new[] { "MaterialIssueId", "RecordedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MaterialUsageRecords_RecordedByUserId",
                table: "MaterialUsageRecords",
                column: "RecordedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuthorizations_AuthorizationNumber",
                table: "PaymentAuthorizations",
                column: "AuthorizationNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuthorizations_AuthorizedByUserId",
                table: "PaymentAuthorizations",
                column: "AuthorizedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentAuthorizations_SupplierInvoiceId",
                table: "PaymentAuthorizations",
                column: "SupplierInvoiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_IssuedByUserId",
                table: "PaymentReceipts",
                column: "IssuedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_PaymentId",
                table: "PaymentReceipts",
                column: "PaymentId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_ReceiptNumber",
                table: "PaymentReceipts",
                column: "ReceiptNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ExternalReference",
                table: "Payments",
                column: "ExternalReference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PaidByUserId",
                table: "Payments",
                column: "PaidByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PaymentAuthorizationId",
                table: "Payments",
                column: "PaymentAuthorizationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PaymentNumber",
                table: "Payments",
                column: "PaymentNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_MaterialId",
                table: "StockBalances",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_StockBalances_ProjectId_MaterialId",
                table: "StockBalances",
                columns: new[] { "ProjectId", "MaterialId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockCounts_CountedByUserId",
                table: "StockCounts",
                column: "CountedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockCounts_CountNumber",
                table: "StockCounts",
                column: "CountNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockCounts_MaterialId",
                table: "StockCounts",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_StockCounts_ProjectId_MaterialId",
                table: "StockCounts",
                columns: new[] { "ProjectId", "MaterialId" },
                unique: true,
                filter: "\"Status\" = 'AwaitingReview'");

            migrationBuilder.CreateIndex(
                name: "IX_StockCounts_ReviewedByUserId",
                table: "StockCounts",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockLedgerEntries_ActorUserId",
                table: "StockLedgerEntries",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockLedgerEntries_MaterialId",
                table: "StockLedgerEntries",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_StockLedgerEntries_ProjectId_MaterialId_OccurredAt",
                table: "StockLedgerEntries",
                columns: new[] { "ProjectId", "MaterialId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_DispatchedByUserId",
                table: "StockTransfers",
                column: "DispatchedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_FromProjectId",
                table: "StockTransfers",
                column: "FromProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_MaterialId",
                table: "StockTransfers",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_ReceivedByUserId",
                table: "StockTransfers",
                column: "ReceivedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_RequestedByUserId",
                table: "StockTransfers",
                column: "RequestedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_ToProjectId",
                table: "StockTransfers",
                column: "ToProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_TransferNumber",
                table: "StockTransfers",
                column: "TransferNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoices_CapturedByUserId",
                table: "SupplierInvoices",
                column: "CapturedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoices_CeoDecisionByUserId",
                table: "SupplierInvoices",
                column: "CeoDecisionByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoices_ProjectId",
                table: "SupplierInvoices",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoices_PurchaseOrderId",
                table: "SupplierInvoices",
                column: "PurchaseOrderId",
                unique: true,
                filter: "\"Status\" IN ('PendingReview', 'Matched', 'AwaitingCeoApproval', 'ReadyForAuthorization', 'Authorized', 'Paid')");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoices_ReviewedByUserId",
                table: "SupplierInvoices",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoices_SupplierId_InvoiceNumber",
                table: "SupplierInvoices",
                columns: new[] { "SupplierId", "InvoiceNumber" },
                unique: true);

            // Give a new installation a useful, categorized construction catalog.
            // Names are inserted only when absent so existing production catalog
            // records, prices, units and IDs are never overwritten.
            migrationBuilder.Sql(
                """
                INSERT INTO "Materials" ("Name", "Category", "Unit", "StandardPrice", "ReorderLevel", "CreatedAt")
                SELECT seed."Name", seed."Category", seed."Unit", 0, seed."ReorderLevel", TIMESTAMPTZ '2026-08-09 00:00:00+00'
                FROM (VALUES
                    ('Cement 50kg', 'Cement & concrete', 'bags', 100),
                    ('River Sand', 'Aggregates & masonry', 'tonnes', 10),
                    ('Ballast ', 'Aggregates & masonry', 'tonnes', 10),
                    ('Hardcore', 'Aggregates & masonry', 'tonnes', 10),
                    ('B.BLOCKS', 'Aggregates & masonry', 'tonnes', 10),
                    ('D8 Metal Bars', 'Reinforcement steel', 'lengths', 50),
                    ('D10 Metal Bars', 'Reinforcement steel', 'lengths', 50),
                    ('D12 Metal Bars', 'Reinforcement steel', 'lengths', 50),
                    ('D16 Metal Bars', 'Reinforcement steel', 'lengths', 30),
                    ('D20 Metal Bars', 'Reinforcement steel', 'lengths', 20),
                    ('Binding Wire', 'Reinforcement steel', 'rolls', 10),
                    ('Timber 2x2', 'Timber & formwork', 'pieces', 30),
                    ('Timber 3x2', 'Timber & formwork', 'pieces', 30),
                    ('Timber 4x2', 'Timber & formwork', 'pieces', 30),
                    ('SHATTA', 'Timber & formwork', 'pieces', 30),
                    ('Marine Board', 'Timber & formwork', 'sheets', 10),
                    ('Iron sheets', 'Roofing', 'sheets', 10),
                    ('Gypsum Board', 'Finishes', 'sheets', 20),
                    ('SIKA bar', 'Waterproofing', 'rolls', 5),
                    ('SIKA-control, 'Waterproofing', 'Litres', 5),
                    ('3" General Purpose Nails', 'General hardware', 'packets', 20),
                    ('4" General Purpose Nails', 'General hardware', 'packets', 20),
                ) AS seed("Name", "Category", "Unit", "ReorderLevel")
                WHERE NOT EXISTS (
                    SELECT 1 FROM "Materials" existing
                    WHERE lower(btrim(existing."Name")) = lower(btrim(seed."Name"))
                );

                CREATE TRIGGER "TR_GoodsReceipts_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "GoodsReceipts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_StockLedgerEntries_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "StockLedgerEntries"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_MaterialUsageRecords_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "MaterialUsageRecords"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_PaymentAuthorizations_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "PaymentAuthorizations"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_Payments_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "Payments"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_PaymentReceipts_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "PaymentReceipts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_ControlEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "ControlEvents"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE TRIGGER "TR_MaterialIssues_NoDelete"
                    BEFORE DELETE ON "MaterialIssues"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_MaterialIssues_SourceImmutable"
                    BEFORE UPDATE OF "IssueNumber", "RequisitionId", "ProjectId", "MaterialId",
                        "QuantityIssued", "IssuedByUserId", "IssuedToUserId", "Notes", "IssuedAt"
                    ON "MaterialIssues"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE TRIGGER "TR_StockTransfers_NoDelete"
                    BEFORE DELETE ON "StockTransfers"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_StockTransfers_SourceImmutable"
                    BEFORE UPDATE OF "TransferNumber", "FromProjectId", "ToProjectId", "MaterialId",
                        "Quantity", "Reason", "RequestedByUserId", "RequestedAt"
                    ON "StockTransfers"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE TRIGGER "TR_StockCounts_NoDelete"
                    BEFORE DELETE ON "StockCounts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_StockCounts_SourceImmutable"
                    BEFORE UPDATE OF "CountNumber", "ProjectId", "MaterialId", "SystemQuantity",
                        "CountedQuantity", "Variance", "Notes", "CountedByUserId", "CountedAt"
                    ON "StockCounts"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE TRIGGER "TR_SupplierInvoices_NoDelete"
                    BEFORE DELETE ON "SupplierInvoices"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_SupplierInvoices_SourceImmutable"
                    BEFORE UPDATE OF "InvoiceNumber", "PurchaseOrderId", "ProjectId", "SupplierId",
                        "Quantity", "UnitPrice", "Amount", "DocumentReference", "CapturedByUserId", "CapturedAt"
                    ON "SupplierInvoices"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ControlEvents");

            migrationBuilder.DropTable(
                name: "GoodsReceipts");

            migrationBuilder.DropTable(
                name: "MaterialUsageRecords");

            migrationBuilder.DropTable(
                name: "PaymentReceipts");

            migrationBuilder.DropTable(
                name: "StockBalances");

            migrationBuilder.DropTable(
                name: "StockCounts");

            migrationBuilder.DropTable(
                name: "StockLedgerEntries");

            migrationBuilder.DropTable(
                name: "StockTransfers");

            migrationBuilder.DropTable(
                name: "MaterialIssues");

            migrationBuilder.DropTable(
                name: "Payments");

            migrationBuilder.DropTable(
                name: "PaymentAuthorizations");

            migrationBuilder.DropTable(
                name: "SupplierInvoices");
        }
    }
}
