using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SingleFinanceAccountability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PettyCashReceiptConfirmations",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ConfirmationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PettyCashRequestId = table.Column<long>(type: "bigint", nullable: false),
                    PettyCashDisbursementId = table.Column<long>(type: "bigint", nullable: false),
                    AmountReceived = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ConfirmedByUserId = table.Column<int>(type: "integer", nullable: false),
                    ConfirmedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PettyCashReceiptConfirmations", x => x.Id);
                    table.CheckConstraint("CK_PettyCashReceiptConfirmations_Amount", "\"AmountReceived\" > 0");
                    table.ForeignKey(
                        name: "FK_PettyCashReceiptConfirmations_PettyCashDisbursements_PettyC~",
                        column: x => x.PettyCashDisbursementId,
                        principalTable: "PettyCashDisbursements",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashReceiptConfirmations_PettyCashRequests_PettyCashRe~",
                        column: x => x.PettyCashRequestId,
                        principalTable: "PettyCashRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PettyCashReceiptConfirmations_Users_ConfirmedByUserId",
                        column: x => x.ConfirmedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 9,
                column: "Description",
                value: "Matches invoices, executes Supervisor-authorized payments, and controls petty cash evidence");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReceiptConfirmations_ConfirmationNumber",
                table: "PettyCashReceiptConfirmations",
                column: "ConfirmationNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReceiptConfirmations_ConfirmedByUserId",
                table: "PettyCashReceiptConfirmations",
                column: "ConfirmedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReceiptConfirmations_PettyCashDisbursementId",
                table: "PettyCashReceiptConfirmations",
                column: "PettyCashDisbursementId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PettyCashReceiptConfirmations_PettyCashRequestId",
                table: "PettyCashReceiptConfirmations",
                column: "PettyCashRequestId",
                unique: true);

            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_validate_petty_cash_receipt_confirmation()
                RETURNS trigger AS $$
                DECLARE
                    recorded_amount numeric(18,2);
                BEGIN
                    SELECT "Amount" INTO recorded_amount
                    FROM "PettyCashDisbursements"
                    WHERE "Id" = NEW."PettyCashDisbursementId"
                      AND "PettyCashRequestId" = NEW."PettyCashRequestId";

                    IF recorded_amount IS NULL THEN
                        RAISE EXCEPTION 'The petty-cash handover does not belong to this request.';
                    END IF;

                    IF NEW."AmountReceived" <> recorded_amount THEN
                        RAISE EXCEPTION 'The confirmed amount must equal the recorded petty-cash handover.';
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_PettyCashReceiptConfirmations_Validate"
                    BEFORE INSERT ON "PettyCashReceiptConfirmations"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_petty_cash_receipt_confirmation();

                CREATE TRIGGER "TR_PettyCashReceiptConfirmations_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "PettyCashReceiptConfirmations"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashReceiptConfirmations_Validate\" ON \"PettyCashReceiptConfirmations\";");
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS \"TR_PettyCashReceiptConfirmations_AppendOnly\" ON \"PettyCashReceiptConfirmations\";");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS constructionms_validate_petty_cash_receipt_confirmation();");

            migrationBuilder.DropTable(
                name: "PettyCashReceiptConfirmations");

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 9,
                column: "Description",
                value: "Matches and authorizes payments or separately executes approved payments and records evidence");
        }
    }
}
