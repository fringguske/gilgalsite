using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ImplementPettyCashControls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PettyCashRequests",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RequestNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    CostCodeId = table.Column<int>(type: "integer", nullable: false),
                    Purpose = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    AmountRequested = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    NeededByDate = table.Column<DateOnly>(type: "date", nullable: false),
                    RequestedByUserId = table.Column<int>(type: "integer", nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    AmountApproved = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    FinanceApprovedByUserId = table.Column<int>(type: "integer", nullable: true),
                    FinanceDecisionAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    FinanceDecisionNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AmountCommitted = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PettyCashRequests", x => x.Id);
                    table.CheckConstraint("CK_PettyCashRequests_Amounts", "\"AmountRequested\" > 0 AND \"AmountRequested\" <= 100000 AND (\"AmountApproved\" IS NULL OR (\"AmountApproved\" > 0 AND \"AmountApproved\" <= \"AmountRequested\")) AND (\"AmountCommitted\" IS NULL OR \"AmountCommitted\" > 0)");
                    table.CheckConstraint("CK_PettyCashRequests_Status", "\"Status\" IN ('PendingFinanceApproval', 'Rejected', 'Approved', 'Disbursed', 'ReconciliationSubmitted', 'Reconciled')");
                    table.ForeignKey(
                        name: "FK_PettyCashRequests_CostCodes_CostCodeId",
                        column: x => x.CostCodeId,
                        principalTable: "CostCodes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashRequests_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashRequests_Users_FinanceApprovedByUserId",
                        column: x => x.FinanceApprovedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashRequests_Users_RequestedByUserId",
                        column: x => x.RequestedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PettyCashDisbursements",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    DisbursementNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PettyCashRequestId = table.Column<long>(type: "bigint", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Method = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ExternalReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RecipientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    RecipientAcknowledgementReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    DisbursedByUserId = table.Column<int>(type: "integer", nullable: false),
                    DisbursedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PettyCashDisbursements", x => x.Id);
                    table.CheckConstraint("CK_PettyCashDisbursements_Amount", "\"Amount\" > 0");
                    table.CheckConstraint("CK_PettyCashDisbursements_Method", "\"Method\" IN ('MPesa', 'BankTransfer', 'Cheque', 'Cash')");
                    table.ForeignKey(
                        name: "FK_PettyCashDisbursements_PettyCashRequests_PettyCashRequestId",
                        column: x => x.PettyCashRequestId,
                        principalTable: "PettyCashRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashDisbursements_Users_DisbursedByUserId",
                        column: x => x.DisbursedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PettyCashReconciliations",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReconciliationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PettyCashRequestId = table.Column<long>(type: "bigint", nullable: false),
                    AmountSpent = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    AmountReturned = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ReturnReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SubmittedByUserId = table.Column<int>(type: "integer", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ReviewedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AmountExpensed = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PettyCashReconciliations", x => x.Id);
                    table.CheckConstraint("CK_PettyCashReconciliations_Amounts", "\"AmountSpent\" >= 0 AND \"AmountReturned\" >= 0 AND (\"AmountExpensed\" IS NULL OR \"AmountExpensed\" >= 0)");
                    table.CheckConstraint("CK_PettyCashReconciliations_Status", "\"Status\" IN ('PendingReview', 'Approved', 'Returned')");
                    table.ForeignKey(
                        name: "FK_PettyCashReconciliations_PettyCashRequests_PettyCashRequest~",
                        column: x => x.PettyCashRequestId,
                        principalTable: "PettyCashRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashReconciliations_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashReconciliations_Users_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PettyCashReconciliationEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PettyCashReconciliationId = table.Column<long>(type: "bigint", nullable: false),
                    EventType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PettyCashReconciliationEvents", x => x.Id);
                    table.CheckConstraint("CK_PettyCashReconciliationEvents_Type", "\"EventType\" IN ('Approved', 'Returned')");
                    table.ForeignKey(
                        name: "FK_PettyCashReconciliationEvents_PettyCashReconciliations_Pett~",
                        column: x => x.PettyCashReconciliationId,
                        principalTable: "PettyCashReconciliations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashReconciliationEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashDisbursements_DisbursedByUserId",
                table: "PettyCashDisbursements",
                column: "DisbursedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashDisbursements_DisbursementNumber",
                table: "PettyCashDisbursements",
                column: "DisbursementNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashDisbursements_ExternalReference",
                table: "PettyCashDisbursements",
                column: "ExternalReference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashDisbursements_PettyCashRequestId",
                table: "PettyCashDisbursements",
                column: "PettyCashRequestId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReconciliationEvents_ActorUserId",
                table: "PettyCashReconciliationEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReconciliationEvents_PettyCashReconciliationId_Occ~",
                table: "PettyCashReconciliationEvents",
                columns: new[] { "PettyCashReconciliationId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReconciliations_PettyCashRequestId",
                table: "PettyCashReconciliations",
                column: "PettyCashRequestId",
                unique: true,
                filter: "\"Status\" = 'PendingReview'");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReconciliations_PettyCashRequestId_Status",
                table: "PettyCashReconciliations",
                columns: new[] { "PettyCashRequestId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReconciliations_ReconciliationNumber",
                table: "PettyCashReconciliations",
                column: "ReconciliationNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReconciliations_ReviewedByUserId",
                table: "PettyCashReconciliations",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReconciliations_SubmittedByUserId",
                table: "PettyCashReconciliations",
                column: "SubmittedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashRequests_CostCodeId",
                table: "PettyCashRequests",
                column: "CostCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashRequests_FinanceApprovedByUserId",
                table: "PettyCashRequests",
                column: "FinanceApprovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashRequests_ProjectId_Status_RequestedAt",
                table: "PettyCashRequests",
                columns: new[] { "ProjectId", "Status", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashRequests_RequestedByUserId",
                table: "PettyCashRequests",
                column: "RequestedByUserId",
                unique: true,
                filter: "\"Status\" NOT IN ('Reconciled', 'Rejected')");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashRequests_RequestNumber",
                table: "PettyCashRequests",
                column: "RequestNumber",
                unique: true);

            migrationBuilder.Sql(
                """
                CREATE TRIGGER "TR_PettyCashDisbursements_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "PettyCashDisbursements"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE TRIGGER "TR_PettyCashReconciliationEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "PettyCashReconciliationEvents"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE TRIGGER "TR_PettyCashRequests_NoDelete"
                    BEFORE DELETE ON "PettyCashRequests"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_PettyCashRequests_SourceImmutable"
                    BEFORE UPDATE OF "RequestNumber", "ProjectId", "CostCodeId", "Purpose",
                        "AmountRequested", "NeededByDate", "RequestedByUserId", "RequestedAt"
                    ON "PettyCashRequests"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();

                CREATE TRIGGER "TR_PettyCashReconciliations_NoDelete"
                    BEFORE DELETE ON "PettyCashReconciliations"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                CREATE TRIGGER "TR_PettyCashReconciliations_SourceImmutable"
                    BEFORE UPDATE OF "ReconciliationNumber", "PettyCashRequestId", "AmountSpent",
                        "AmountReturned", "EvidenceReference", "ReturnReference", "Notes",
                        "SubmittedByUserId", "SubmittedAt"
                    ON "PettyCashReconciliations"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashDisbursements_AppendOnly\" ON \"PettyCashDisbursements\";");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashReconciliationEvents_AppendOnly\" ON \"PettyCashReconciliationEvents\";");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashRequests_NoDelete\" ON \"PettyCashRequests\";");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashRequests_SourceImmutable\" ON \"PettyCashRequests\";");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashReconciliations_NoDelete\" ON \"PettyCashReconciliations\";");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashReconciliations_SourceImmutable\" ON \"PettyCashReconciliations\";");

            migrationBuilder.DropTable(
                name: "PettyCashDisbursements");

            migrationBuilder.DropTable(
                name: "PettyCashReconciliationEvents");

            migrationBuilder.DropTable(
                name: "PettyCashReconciliations");

            migrationBuilder.DropTable(
                name: "PettyCashRequests");
        }
    }
}
