using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ImplementFirstFourApiPaths : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_ActionFields_Consistent",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_Status_Valid",
                table: "Requisitions");

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                table: "Requisitions",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(30)",
                oldMaxLength: 30);

            migrationBuilder.AddColumn<DateOnly>(
                name: "NeededByDate",
                table: "Requisitions",
                type: "date",
                nullable: false,
                defaultValue: new DateOnly(1, 1, 1));

            migrationBuilder.AddColumn<string>(
                name: "Purpose",
                table: "Requisitions",
                type: "character varying(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Requisitions",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<int>(
                name: "WorkflowRevision",
                table: "Requisitions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Preserve legacy decision metadata before open rows are quarantined for
            // a fresh technical check. No pre-workflow "Approved" row may bypass the
            // new Engineer -> Supervisor control chain.
            migrationBuilder.Sql(
                """
                CREATE TEMP TABLE constructionms_legacy_requisition_state
                    ON COMMIT DROP
                    AS
                    SELECT "Id", "Status", "ApprovedByUserId", "ApprovedAt"
                    FROM "Requisitions";

                UPDATE "Requisitions"
                SET "Status" = CASE
                        WHEN "Status" IN ('Pending', 'Approved') THEN 'AwaitingTechnicalCheck'
                        ELSE "Status"
                    END,
                    "ApprovedByUserId" = CASE
                        WHEN "Status" IN ('Pending', 'Approved') THEN NULL
                        ELSE "ApprovedByUserId"
                    END,
                    "ApprovedAt" = CASE
                        WHEN "Status" IN ('Pending', 'Approved') THEN NULL
                        ELSE "ApprovedAt"
                    END,
                    "NeededByDate" = ("CreatedAt" AT TIME ZONE 'UTC')::date,
                    "Purpose" = left(
                        COALESCE(NULLIF(btrim("Notes"), ''), 'Imported legacy requisition'),
                        500),
                    "UpdatedAt" = "CreatedAt",
                    "WorkflowRevision" = 1;
                """);

            // The generated defaults exist only to make the legacy-column backfill
            // possible. New records must provide real workflow values rather than
            // silently receiving sentinel dates, blank purpose, or revision zero.
            migrationBuilder.Sql(
                """
                ALTER TABLE "Requisitions"
                    ALTER COLUMN "NeededByDate" DROP DEFAULT,
                    ALTER COLUMN "Purpose" DROP DEFAULT,
                    ALTER COLUMN "UpdatedAt" DROP DEFAULT,
                    ALTER COLUMN "WorkflowRevision" DROP DEFAULT;
                """);

            migrationBuilder.CreateTable(
                name: "CostCodes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    Code = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CostCodes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CostCodes_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EngineerTechnicalChecks",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RequisitionId = table.Column<int>(type: "integer", nullable: false),
                    EngineerUserId = table.Column<int>(type: "integer", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Comments = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CheckedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RequisitionRevision = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EngineerTechnicalChecks", x => x.Id);
                    table.CheckConstraint("CK_EngineerTechnicalChecks_Outcome", "\"Outcome\" IN ('Verified', 'RevisionRequired')");
                    table.ForeignKey(
                        name: "FK_EngineerTechnicalChecks_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_EngineerTechnicalChecks_Users_EngineerUserId",
                        column: x => x.EngineerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProjectBudgets",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    ApprovedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ApprovedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ApprovalSource = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectBudgets", x => x.Id);
                    table.CheckConstraint("CK_ProjectBudgets_ApprovedAmount_NonNegative", "\"ApprovedAmount\" <> 'NaN'::numeric AND \"ApprovedAmount\" >= 0");
                    table.CheckConstraint("CK_ProjectBudgets_ApprovalSource", "(\"ApprovalSource\" = 'CEOApproval' AND \"ApprovedByUserId\" IS NOT NULL) OR (\"ApprovalSource\" = 'LegacyImport' AND \"ApprovedByUserId\" IS NULL)");
                    table.ForeignKey(
                        name: "FK_ProjectBudgets_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProjectBudgets_Users_ApprovedByUserId",
                        column: x => x.ApprovedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.Sql(
                """
                INSERT INTO "ProjectBudgets" (
                    "ProjectId", "ApprovedAmount", "ApprovedByUserId",
                    "ApprovalSource", "Notes", "CreatedAt")
                SELECT
                    "Id", "Budget", NULL,
                    'LegacyImport',
                    'Imported baseline from Projects.Budget; no historical approver was asserted.',
                    "CreatedAt"
                FROM "Projects";
                """);

            migrationBuilder.CreateTable(
                name: "ProjectProgressVerifications",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    PercentageComplete = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    WorkSummary = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    VerifiedByUserId = table.Column<int>(type: "integer", nullable: false),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectProgressVerifications", x => x.Id);
                    table.CheckConstraint("CK_ProjectProgressVerifications_Percentage", "\"PercentageComplete\" <> 'NaN'::numeric AND \"PercentageComplete\" >= 0 AND \"PercentageComplete\" <= 100");
                    table.ForeignKey(
                        name: "FK_ProjectProgressVerifications_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProjectProgressVerifications_Users_VerifiedByUserId",
                        column: x => x.VerifiedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RequisitionApprovalEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RequisitionId = table.Column<int>(type: "integer", nullable: false),
                    SequenceNumber = table.Column<int>(type: "integer", nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    ToStatus = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Comments = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EventDataJson = table.Column<string>(type: "jsonb", nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PreviousEventHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    EventHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RequisitionApprovalEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RequisitionApprovalEvents_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_RequisitionApprovalEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            // Start every imported record with an explicit SHA-256 fingerprint.
            // Subsequent application events chain to this hash. The original status
            // and approver are retained inside the immutable JSON evidence even when
            // an old approval is quarantined for re-review.
            migrationBuilder.Sql(
                """
                INSERT INTO "RequisitionApprovalEvents" (
                    "RequisitionId",
                    "SequenceNumber",
                    "EventType",
                    "ActorUserId",
                    "ActorRole",
                    "FromStatus",
                    "ToStatus",
                    "Comments",
                    "EventDataJson",
                    "OccurredAt",
                    "PreviousEventHash",
                    "EventHash")
                SELECT
                    requisition."Id",
                    1,
                    'LegacyRecordImported',
                    requisition."RequestedByUserId",
                    role."RoleName",
                    legacy."Status",
                    requisition."Status",
                    'Imported from the controlled pre-workflow requisition table.',
                    jsonb_build_object(
                        'source', 'pre-workflow migration',
                        'originalStatus', legacy."Status",
                        'originalApproverUserId', legacy."ApprovedByUserId",
                        'originalApprovedAt', legacy."ApprovedAt",
                        'requiresFreshApproval', legacy."Status" = 'Approved'),
                    requisition."CreatedAt",
                    NULL,
                    upper(encode(sha256(convert_to(
                        concat_ws('|',
                            requisition."Id"::text,
                            legacy."Status",
                            requisition."Status",
                            requisition."RequestedByUserId"::text,
                            requisition."CreatedAt"::text),
                        'UTF8')), 'hex'))
                FROM "Requisitions" AS requisition
                INNER JOIN constructionms_legacy_requisition_state AS legacy
                    ON legacy."Id" = requisition."Id"
                INNER JOIN "Users" AS actor
                    ON actor."Id" = requisition."RequestedByUserId"
                INNER JOIN "Roles" AS role
                    ON role."Id" = actor."RoleId";
                """);

            migrationBuilder.CreateTable(
                name: "SourcingRounds",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RequisitionId = table.Column<int>(type: "integer", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    QuoteDueAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SourcingRounds", x => x.Id);
                    table.CheckConstraint("CK_SourcingRounds_ClosedAt", "(\"Status\" = 'Open' AND \"ClosedAt\" IS NULL) OR (\"Status\" <> 'Open' AND \"ClosedAt\" IS NOT NULL)");
                    table.CheckConstraint("CK_SourcingRounds_Status", "\"Status\" IN ('Open', 'Awarded', 'Closed', 'Cancelled')");
                    table.ForeignKey(
                        name: "FK_SourcingRounds_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SourcingRounds_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SourcingRoundEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SourcingRoundId = table.Column<int>(type: "integer", nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ToStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SourcingRoundEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SourcingRoundEvents_SourcingRounds_SourcingRoundId",
                        column: x => x.SourcingRoundId,
                        principalTable: "SourcingRounds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SourcingRoundEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserProjectAssignments",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    AssignedByUserId = table.Column<int>(type: "integer", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserProjectAssignments", x => x.Id);
                    table.CheckConstraint("CK_UserProjectAssignments_ActivePeriod", "(\"IsActive\" = TRUE AND \"EndedAt\" IS NULL) OR (\"IsActive\" = FALSE AND \"EndedAt\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_UserProjectAssignments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserProjectAssignments_Users_AssignedByUserId",
                        column: x => x.AssignedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UserProjectAssignments_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ProjectBudgetAllocations",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProjectBudgetId = table.Column<int>(type: "integer", nullable: false),
                    CostCodeId = table.Column<int>(type: "integer", nullable: false),
                    AllocatedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectBudgetAllocations", x => x.Id);
                    table.CheckConstraint("CK_ProjectBudgetAllocations_Amount_NonNegative", "\"AllocatedAmount\" <> 'NaN'::numeric AND \"AllocatedAmount\" >= 0");
                    table.ForeignKey(
                        name: "FK_ProjectBudgetAllocations_CostCodes_CostCodeId",
                        column: x => x.CostCodeId,
                        principalTable: "CostCodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ProjectBudgetAllocations_ProjectBudgets_ProjectBudgetId",
                        column: x => x.ProjectBudgetId,
                        principalTable: "ProjectBudgets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "SupplierQuotes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SourcingRoundId = table.Column<int>(type: "integer", nullable: false),
                    SupplierId = table.Column<int>(type: "integer", nullable: false),
                    RecordedByUserId = table.Column<int>(type: "integer", nullable: false),
                    QuoteReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    QuantityOffered = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    StandardPriceSnapshot = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    ValidUntil = table.Column<DateOnly>(type: "date", nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RecordedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierQuotes", x => x.Id);
                    table.CheckConstraint("CK_SupplierQuotes_Quantity_Positive", "\"QuantityOffered\" <> 'NaN'::numeric AND \"QuantityOffered\" > 0");
                    table.CheckConstraint("CK_SupplierQuotes_StandardPriceSnapshot_NonNegative", "\"StandardPriceSnapshot\" <> 'NaN'::numeric AND \"StandardPriceSnapshot\" >= 0");
                    table.CheckConstraint("CK_SupplierQuotes_UnitPrice_Positive", "\"UnitPrice\" <> 'NaN'::numeric AND \"UnitPrice\" > 0");
                    table.ForeignKey(
                        name: "FK_SupplierQuotes_SourcingRounds_SourcingRoundId",
                        column: x => x.SourcingRoundId,
                        principalTable: "SourcingRounds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierQuotes_Suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalTable: "Suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierQuotes_Users_RecordedByUserId",
                        column: x => x.RecordedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrders",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PurchaseOrderNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    RequisitionId = table.Column<int>(type: "integer", nullable: false),
                    SupplierId = table.Column<int>(type: "integer", nullable: false),
                    SupplierQuoteId = table.Column<int>(type: "integer", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "integer", nullable: false),
                    ApprovedByUserId = table.Column<int>(type: "integer", nullable: true),
                    IssuedByUserId = table.Column<int>(type: "integer", nullable: true),
                    RejectedByUserId = table.Column<int>(type: "integer", nullable: true),
                    CancelledByUserId = table.Column<int>(type: "integer", nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ExpectedDeliveryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DeliveryLocation = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ApprovedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IssuedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RejectedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CancelledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrders", x => x.Id);
                    table.CheckConstraint("CK_PurchaseOrders_Actors_Distinct", "(\"ApprovedByUserId\" IS NULL OR \"ApprovedByUserId\" <> \"CreatedByUserId\") AND (\"RejectedByUserId\" IS NULL OR \"RejectedByUserId\" <> \"CreatedByUserId\")");
                    table.CheckConstraint("CK_PurchaseOrders_CancellationActor", "\"Status\" <> 'Cancelled' OR ((\"ApprovedAt\" IS NOT NULL OR (\"SubmittedAt\" IS NOT NULL AND \"RejectedAt\" IS NULL)) AND \"CancelledByUserId\" <> \"CreatedByUserId\") OR ((\"ApprovedAt\" IS NULL AND (\"SubmittedAt\" IS NULL OR \"RejectedAt\" IS NOT NULL)) AND \"CancelledByUserId\" = \"CreatedByUserId\")");
                    table.CheckConstraint("CK_PurchaseOrders_Status", "\"Status\" IN ('Draft', 'Submitted', 'Approved', 'Issued', 'Rejected', 'Cancelled')");
                    table.CheckConstraint("CK_PurchaseOrders_WorkflowFields", "(\"Status\" = 'Draft' AND \"SubmittedAt\" IS NULL AND \"ApprovedAt\" IS NULL AND \"ApprovedByUserId\" IS NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL AND \"CancelledByUserId\" IS NULL) OR (\"Status\" = 'Submitted' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NULL AND \"ApprovedByUserId\" IS NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL AND \"CancelledByUserId\" IS NULL) OR (\"Status\" = 'Approved' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL AND \"ApprovedByUserId\" IS NOT NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL AND \"CancelledByUserId\" IS NULL) OR (\"Status\" = 'Issued' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL AND \"ApprovedByUserId\" IS NOT NULL AND \"IssuedAt\" IS NOT NULL AND \"IssuedByUserId\" IS NOT NULL AND \"RejectedAt\" IS NULL AND \"RejectedByUserId\" IS NULL AND \"CancelledAt\" IS NULL AND \"CancelledByUserId\" IS NULL) OR (\"Status\" = 'Rejected' AND \"SubmittedAt\" IS NOT NULL AND \"ApprovedAt\" IS NULL AND \"ApprovedByUserId\" IS NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL AND \"RejectedAt\" IS NOT NULL AND \"RejectedByUserId\" IS NOT NULL AND \"CancelledAt\" IS NULL AND \"CancelledByUserId\" IS NULL) OR (\"Status\" = 'Cancelled' AND \"CancelledAt\" IS NOT NULL AND \"CancelledByUserId\" IS NOT NULL AND \"IssuedAt\" IS NULL AND \"IssuedByUserId\" IS NULL)");
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_SupplierQuotes_SupplierQuoteId",
                        column: x => x.SupplierQuoteId,
                        principalTable: "SupplierQuotes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalTable: "Suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Users_ApprovedByUserId",
                        column: x => x.ApprovedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Users_IssuedByUserId",
                        column: x => x.IssuedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Users_RejectedByUserId",
                        column: x => x.RejectedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrders_Users_CancelledByUserId",
                        column: x => x.CancelledByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PurchaseOrderId = table.Column<int>(type: "integer", nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ToStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    DetailsJson = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderEvents_PurchaseOrders_PurchaseOrderId",
                        column: x => x.PurchaseOrderId,
                        principalTable: "PurchaseOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PurchaseOrderLines",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PurchaseOrderId = table.Column<int>(type: "integer", nullable: false),
                    RequisitionId = table.Column<int>(type: "integer", nullable: false),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(18,3)", precision: 18, scale: 3, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PurchaseOrderLines", x => x.Id);
                    table.CheckConstraint("CK_PurchaseOrderLines_Quantity_Positive", "\"Quantity\" <> 'NaN'::numeric AND \"Quantity\" > 0");
                    table.CheckConstraint("CK_PurchaseOrderLines_UnitPrice_Positive", "\"UnitPrice\" <> 'NaN'::numeric AND \"UnitPrice\" > 0");
                    table.ForeignKey(
                        name: "FK_PurchaseOrderLines_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderLines_PurchaseOrders_PurchaseOrderId",
                        column: x => x.PurchaseOrderId,
                        principalTable: "PurchaseOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PurchaseOrderLines_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            // These rows are evidence, not mutable master data. Application guards
            // provide a useful error before SaveChanges, while database triggers keep
            // the rule intact for every SQL client and future application version.
            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_reject_evidence_mutation()
                RETURNS trigger AS $$
                BEGIN
                    RAISE EXCEPTION '% is append-only; UPDATE and DELETE are not allowed', TG_TABLE_NAME;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_EngineerTechnicalChecks_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "EngineerTechnicalChecks"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_RequisitionApprovalEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "RequisitionApprovalEvents"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_ProjectBudgets_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "ProjectBudgets"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_ProjectBudgetAllocations_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "ProjectBudgetAllocations"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_ProjectProgressVerifications_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "ProjectProgressVerifications"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_SupplierQuotes_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "SupplierQuotes"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_SourcingRoundEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "SourcingRoundEvents"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_PurchaseOrderLines_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "PurchaseOrderLines"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_PurchaseOrderEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "PurchaseOrderEvents"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE OR REPLACE FUNCTION constructionms_close_assignment_period_only()
                RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Project assignment periods cannot be deleted';
                    END IF;

                    IF OLD."IsActive" = TRUE
                       AND NEW."IsActive" = FALSE
                       AND OLD."EndedAt" IS NULL
                       AND NEW."EndedAt" IS NOT NULL
                       AND NEW."UserId" = OLD."UserId"
                       AND NEW."ProjectId" = OLD."ProjectId"
                       AND NEW."AssignedByUserId" IS NOT DISTINCT FROM OLD."AssignedByUserId"
                       AND NEW."CreatedAt" = OLD."CreatedAt" THEN
                        RETURN NEW;
                    END IF;

                    RAISE EXCEPTION 'An assignment period may only transition once from active to ended';
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_UserProjectAssignments_History"
                    BEFORE UPDATE OR DELETE ON "UserProjectAssignments"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_close_assignment_period_only();

                CREATE OR REPLACE FUNCTION constructionms_preserve_po_commercial_source()
                RETURNS trigger AS $$
                BEGIN
                    IF NEW."PurchaseOrderNumber" IS DISTINCT FROM OLD."PurchaseOrderNumber"
                       OR NEW."ProjectId" IS DISTINCT FROM OLD."ProjectId"
                       OR NEW."RequisitionId" IS DISTINCT FROM OLD."RequisitionId"
                       OR NEW."SupplierId" IS DISTINCT FROM OLD."SupplierId"
                       OR NEW."SupplierQuoteId" IS DISTINCT FROM OLD."SupplierQuoteId"
                       OR NEW."CreatedByUserId" IS DISTINCT FROM OLD."CreatedByUserId"
                       OR NEW."CreatedAt" IS DISTINCT FROM OLD."CreatedAt" THEN
                        RAISE EXCEPTION 'Purchase-order commercial source fields are immutable';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_PurchaseOrders_ImmutableCommercialSource"
                    BEFORE UPDATE ON "PurchaseOrders"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_preserve_po_commercial_source();

                CREATE OR REPLACE FUNCTION constructionms_validate_po_commercial_source()
                RETURNS trigger AS $$
                DECLARE
                    expected_project_id integer;
                    expected_supplier_id integer;
                    offered_quantity numeric;
                    required_quantity numeric;
                    supplier_blacklisted boolean;
                    quote_valid_until date;
                    requisition_status text;
                    sourcing_status text;
                BEGIN
                    SELECT
                        requisition."ProjectId",
                        quote."SupplierId",
                        quote."QuantityOffered",
                        requisition."Quantity",
                        supplier."IsBlacklisted",
                        quote."ValidUntil",
                        requisition."Status",
                        round."Status"
                    INTO
                        expected_project_id,
                        expected_supplier_id,
                        offered_quantity,
                        required_quantity,
                        supplier_blacklisted,
                        quote_valid_until,
                        requisition_status,
                        sourcing_status
                    FROM "SupplierQuotes" AS quote
                    INNER JOIN "SourcingRounds" AS round
                        ON round."Id" = quote."SourcingRoundId"
                    INNER JOIN "Requisitions" AS requisition
                        ON requisition."Id" = round."RequisitionId"
                    INNER JOIN "Suppliers" AS supplier
                        ON supplier."Id" = quote."SupplierId"
                    WHERE quote."Id" = NEW."SupplierQuoteId"
                      AND requisition."Id" = NEW."RequisitionId";

                    IF NOT FOUND
                       OR NEW."ProjectId" <> expected_project_id
                       OR NEW."SupplierId" <> expected_supplier_id THEN
                        RAISE EXCEPTION 'Purchase-order project, requisition, quote and supplier must describe one commercial source';
                    END IF;

                    IF offered_quantity < required_quantity THEN
                        RAISE EXCEPTION 'The selected supplier quote does not cover the requisition quantity';
                    END IF;

                    IF requisition_status <> 'Approved' OR sourcing_status <> 'Open' THEN
                        RAISE EXCEPTION 'A purchase order requires an approved requisition and an open sourcing round';
                    END IF;

                    IF supplier_blacklisted THEN
                        RAISE EXCEPTION 'A purchase order cannot use a blacklisted supplier';
                    END IF;

                    IF quote_valid_until IS NOT NULL AND quote_valid_until < CURRENT_DATE THEN
                        RAISE EXCEPTION 'A purchase order cannot use an expired supplier quote';
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_PurchaseOrders_ValidateCommercialSource"
                    BEFORE INSERT ON "PurchaseOrders"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_po_commercial_source();

                CREATE OR REPLACE FUNCTION constructionms_validate_po_line_source()
                RETURNS trigger AS $$
                DECLARE
                    expected_requisition_id integer;
                    expected_material_id integer;
                    expected_quantity numeric;
                    expected_unit_price numeric;
                BEGIN
                    SELECT
                        purchase_order."RequisitionId",
                        requisition."MaterialId",
                        requisition."Quantity",
                        quote."UnitPrice"
                    INTO
                        expected_requisition_id,
                        expected_material_id,
                        expected_quantity,
                        expected_unit_price
                    FROM "PurchaseOrders" AS purchase_order
                    INNER JOIN "Requisitions" AS requisition
                        ON requisition."Id" = purchase_order."RequisitionId"
                    INNER JOIN "SupplierQuotes" AS quote
                        ON quote."Id" = purchase_order."SupplierQuoteId"
                    WHERE purchase_order."Id" = NEW."PurchaseOrderId";

                    IF NOT FOUND
                       OR NEW."RequisitionId" <> expected_requisition_id
                       OR NEW."MaterialId" <> expected_material_id
                       OR NEW."Quantity" <> expected_quantity
                       OR NEW."UnitPrice" <> expected_unit_price THEN
                        RAISE EXCEPTION 'Purchase-order lines must match the selected requisition and supplier quote';
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_PurchaseOrderLines_ValidateCommercialSource"
                    BEFORE INSERT ON "PurchaseOrderLines"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_po_line_source();
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_ActionFields_Consistent",
                table: "Requisitions",
                sql: "(\"Status\" IN ('AwaitingTechnicalCheck', 'AwaitingSupervisorDecision', 'ReturnedForRevision') AND \"ApprovedByUserId\" IS NULL AND \"ApprovedAt\" IS NULL) OR (\"Status\" IN ('Approved', 'Rejected') AND \"ApprovedByUserId\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_Status_Valid",
                table: "Requisitions",
                sql: "\"Status\" IN ('AwaitingTechnicalCheck', 'AwaitingSupervisorDecision', 'ReturnedForRevision', 'Approved', 'Rejected')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_Purpose_NotBlank",
                table: "Requisitions",
                sql: "length(btrim(\"Purpose\")) > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_WorkflowRevision_Positive",
                table: "Requisitions",
                sql: "\"WorkflowRevision\" >= 1");

            migrationBuilder.CreateIndex(
                name: "IX_CostCodes_ProjectId_Code",
                table: "CostCodes",
                columns: new[] { "ProjectId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EngineerTechnicalChecks_EngineerUserId",
                table: "EngineerTechnicalChecks",
                column: "EngineerUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EngineerTechnicalChecks_RequisitionId_RequisitionRevision",
                table: "EngineerTechnicalChecks",
                columns: new[] { "RequisitionId", "RequisitionRevision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectBudgetAllocations_CostCodeId",
                table: "ProjectBudgetAllocations",
                column: "CostCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectBudgetAllocations_ProjectBudgetId_CostCodeId",
                table: "ProjectBudgetAllocations",
                columns: new[] { "ProjectBudgetId", "CostCodeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProjectBudgets_ApprovedByUserId",
                table: "ProjectBudgets",
                column: "ApprovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProjectBudgets_ProjectId_CreatedAt",
                table: "ProjectBudgets",
                columns: new[] { "ProjectId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectProgressVerifications_ProjectId_VerifiedAt",
                table: "ProjectProgressVerifications",
                columns: new[] { "ProjectId", "VerifiedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectProgressVerifications_VerifiedByUserId",
                table: "ProjectProgressVerifications",
                column: "VerifiedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderEvents_ActorUserId",
                table: "PurchaseOrderEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderEvents_PurchaseOrderId_OccurredAt",
                table: "PurchaseOrderEvents",
                columns: new[] { "PurchaseOrderId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_MaterialId",
                table: "PurchaseOrderLines",
                column: "MaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_PurchaseOrderId",
                table: "PurchaseOrderLines",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_RequisitionId",
                table: "PurchaseOrderLines",
                column: "RequisitionId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_ApprovedByUserId",
                table: "PurchaseOrders",
                column: "ApprovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_CreatedByUserId",
                table: "PurchaseOrders",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_CancelledByUserId",
                table: "PurchaseOrders",
                column: "CancelledByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_IssuedByUserId",
                table: "PurchaseOrders",
                column: "IssuedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_ProjectId_Status",
                table: "PurchaseOrders",
                columns: new[] { "ProjectId", "Status" });

            migrationBuilder.CreateIndex(
                name: "UX_PurchaseOrders_Live_Requisition",
                table: "PurchaseOrders",
                column: "RequisitionId",
                unique: true,
                filter: "\"Status\" IN ('Draft', 'Submitted', 'Approved', 'Issued')");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_PurchaseOrderNumber",
                table: "PurchaseOrders",
                column: "PurchaseOrderNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_SupplierId",
                table: "PurchaseOrders",
                column: "SupplierId");

            migrationBuilder.CreateIndex(
                name: "UX_PurchaseOrders_Live_SupplierQuote",
                table: "PurchaseOrders",
                column: "SupplierQuoteId",
                unique: true,
                filter: "\"Status\" IN ('Draft', 'Submitted', 'Approved', 'Issued')");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrders_RejectedByUserId",
                table: "PurchaseOrders",
                column: "RejectedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_RequisitionApprovalEvents_ActorUserId",
                table: "RequisitionApprovalEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_RequisitionApprovalEvents_EventHash",
                table: "RequisitionApprovalEvents",
                column: "EventHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RequisitionApprovalEvents_RequisitionId_SequenceNumber",
                table: "RequisitionApprovalEvents",
                columns: new[] { "RequisitionId", "SequenceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SourcingRounds_CreatedByUserId",
                table: "SourcingRounds",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "UX_SourcingRounds_Current_Requisition",
                table: "SourcingRounds",
                column: "RequisitionId",
                unique: true,
                filter: "\"Status\" IN ('Open', 'Awarded')");

            migrationBuilder.CreateIndex(
                name: "IX_SourcingRoundEvents_ActorUserId",
                table: "SourcingRoundEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SourcingRoundEvents_SourcingRoundId_OccurredAt",
                table: "SourcingRoundEvents",
                columns: new[] { "SourcingRoundId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierQuotes_RecordedByUserId",
                table: "SupplierQuotes",
                column: "RecordedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierQuotes_SourcingRoundId_QuoteReference",
                table: "SupplierQuotes",
                columns: new[] { "SourcingRoundId", "QuoteReference" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierQuotes_SourcingRoundId_SupplierId",
                table: "SupplierQuotes",
                columns: new[] { "SourcingRoundId", "SupplierId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierQuotes_SupplierId",
                table: "SupplierQuotes",
                column: "SupplierId");

            migrationBuilder.CreateIndex(
                name: "IX_UserProjectAssignments_AssignedByUserId",
                table: "UserProjectAssignments",
                column: "AssignedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserProjectAssignments_ProjectId_IsActive",
                table: "UserProjectAssignments",
                columns: new[] { "ProjectId", "IsActive" });

            migrationBuilder.CreateIndex(
                name: "IX_UserProjectAssignments_UserId_ProjectId",
                table: "UserProjectAssignments",
                columns: new[] { "UserId", "ProjectId" },
                unique: true,
                filter: "\"IsActive\" = TRUE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "DROP FUNCTION IF EXISTS constructionms_reject_evidence_mutation() CASCADE;");
            migrationBuilder.Sql(
                "DROP FUNCTION IF EXISTS constructionms_close_assignment_period_only() CASCADE;");
            migrationBuilder.Sql(
                "DROP FUNCTION IF EXISTS constructionms_preserve_po_commercial_source() CASCADE;");
            migrationBuilder.Sql(
                "DROP FUNCTION IF EXISTS constructionms_validate_po_commercial_source() CASCADE;");
            migrationBuilder.Sql(
                "DROP FUNCTION IF EXISTS constructionms_validate_po_line_source() CASCADE;");

            migrationBuilder.Sql(
                """
                UPDATE "Requisitions" AS requisition
                SET "Status" = workflow."EventDataJson" ->> 'originalStatus',
                    "ApprovedByUserId" = CASE
                        WHEN workflow."EventDataJson" ->> 'originalApproverUserId' IS NULL THEN NULL
                        ELSE (workflow."EventDataJson" ->> 'originalApproverUserId')::integer
                    END,
                    "ApprovedAt" = CASE
                        WHEN workflow."EventDataJson" ->> 'originalApprovedAt' IS NULL THEN NULL
                        ELSE (workflow."EventDataJson" ->> 'originalApprovedAt')::timestamp with time zone
                    END
                FROM "RequisitionApprovalEvents" AS workflow
                WHERE workflow."RequisitionId" = requisition."Id"
                  AND workflow."SequenceNumber" = 1
                  AND workflow."EventType" = 'LegacyRecordImported';
                """);

            migrationBuilder.DropTable(
                name: "EngineerTechnicalChecks");

            migrationBuilder.DropTable(
                name: "ProjectBudgetAllocations");

            migrationBuilder.DropTable(
                name: "ProjectProgressVerifications");

            migrationBuilder.DropTable(
                name: "PurchaseOrderEvents");

            migrationBuilder.DropTable(
                name: "SourcingRoundEvents");

            migrationBuilder.DropTable(
                name: "PurchaseOrderLines");

            migrationBuilder.DropTable(
                name: "RequisitionApprovalEvents");

            migrationBuilder.DropTable(
                name: "UserProjectAssignments");

            migrationBuilder.DropTable(
                name: "CostCodes");

            migrationBuilder.DropTable(
                name: "ProjectBudgets");

            migrationBuilder.DropTable(
                name: "PurchaseOrders");

            migrationBuilder.DropTable(
                name: "SupplierQuotes");

            migrationBuilder.DropTable(
                name: "SourcingRounds");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_ActionFields_Consistent",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_Status_Valid",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_Purpose_NotBlank",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_WorkflowRevision_Positive",
                table: "Requisitions");

            migrationBuilder.Sql(
                """
                UPDATE "Requisitions"
                SET "Status" = 'Pending',
                    "ApprovedByUserId" = NULL,
                    "ApprovedAt" = NULL
                WHERE "Status" IN (
                    'AwaitingTechnicalCheck',
                    'AwaitingSupervisorDecision',
                    'ReturnedForRevision');
                """);

            migrationBuilder.DropColumn(
                name: "NeededByDate",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "Purpose",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "WorkflowRevision",
                table: "Requisitions");

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                table: "Requisitions",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(40)",
                oldMaxLength: 40);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_ActionFields_Consistent",
                table: "Requisitions",
                sql: "(\"Status\" = 'Pending' AND \"ApprovedByUserId\" IS NULL AND \"ApprovedAt\" IS NULL) OR (\"Status\" IN ('Approved', 'Rejected') AND \"ApprovedByUserId\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_Status_Valid",
                table: "Requisitions",
                sql: "\"Status\" IN ('Pending', 'Approved', 'Rejected')");
        }
    }
}
