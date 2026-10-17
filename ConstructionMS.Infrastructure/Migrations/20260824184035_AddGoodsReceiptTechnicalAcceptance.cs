using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGoodsReceiptTechnicalAcceptance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RequiresTechnicalAcceptance",
                table: "PurchaseOrderLines",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresTechnicalAcceptance",
                table: "Materials",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            // Preserve every positive receipt already reflected in production stock.
            // Existing PO lines without received stock can safely enter the new control;
            // new inserts use the catalogue snapshot and default to the safer state.
            migrationBuilder.Sql(
                """
                ALTER TABLE "PurchaseOrderLines"
                    DISABLE TRIGGER "TR_PurchaseOrderLines_AppendOnly";

                UPDATE "PurchaseOrderLines" AS line
                SET "RequiresTechnicalAcceptance" = TRUE
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM "GoodsReceipts" AS receipt
                    WHERE receipt."PurchaseOrderLineId" = line."Id"
                      AND receipt."AcceptedQuantity" > 0
                );

                ALTER TABLE "PurchaseOrderLines"
                    ENABLE TRIGGER "TR_PurchaseOrderLines_AppendOnly";
                """);

            migrationBuilder.AlterColumn<bool>(
                name: "RequiresTechnicalAcceptance",
                table: "PurchaseOrderLines",
                type: "boolean",
                nullable: false,
                defaultValue: true,
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldDefaultValue: false);

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries",
                sql: "\"MovementType\" IN ('Receipt', 'TechnicalAcceptance', 'Issue', 'TransferOut', 'TransferIn', 'CountAdjustment')");

            migrationBuilder.CreateTable(
                name: "GoodsReceiptTechnicalAcceptances",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    GoodsReceiptId = table.Column<long>(type: "bigint", nullable: false),
                    ReviewSequence = table.Column<int>(type: "integer", nullable: false),
                    EngineerUserId = table.Column<int>(type: "integer", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GoodsReceiptTechnicalAcceptances", x => x.Id);
                    table.CheckConstraint("CK_GoodsReceiptTechnicalAcceptances_Notes", "length(btrim(\"Notes\")) >= 3");
                    table.CheckConstraint("CK_GoodsReceiptTechnicalAcceptances_Outcome", "\"Outcome\" IN ('Accepted', 'Rejected')");
                    table.CheckConstraint("CK_GoodsReceiptTechnicalAcceptances_ReviewSequence", "\"ReviewSequence\" > 0");
                    table.ForeignKey(
                        name: "FK_GoodsReceiptTechnicalAcceptances_GoodsReceipts_GoodsReceipt~",
                        column: x => x.GoodsReceiptId,
                        principalTable: "GoodsReceipts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_GoodsReceiptTechnicalAcceptances_Users_EngineerUserId",
                        column: x => x.EngineerUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceiptTechnicalAcceptances_EngineerUserId_ReviewedAt",
                table: "GoodsReceiptTechnicalAcceptances",
                columns: new[] { "EngineerUserId", "ReviewedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceiptTechnicalAcceptances_GoodsReceiptId_ReviewSeque~",
                table: "GoodsReceiptTechnicalAcceptances",
                columns: new[] { "GoodsReceiptId", "ReviewSequence" },
                unique: true);

            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_validate_goods_receipt_technical_acceptance()
                RETURNS trigger AS $$
                DECLARE
                    accepted_quantity numeric;
                    received_by_user_id integer;
                    technical_acceptance_required boolean;
                    latest_sequence integer;
                    latest_outcome text;
                BEGIN
                    SELECT
                        receipt."AcceptedQuantity",
                        receipt."ReceivedByUserId",
                        line."RequiresTechnicalAcceptance"
                    INTO
                        accepted_quantity,
                        received_by_user_id,
                        technical_acceptance_required
                    FROM "GoodsReceipts" AS receipt
                    INNER JOIN "PurchaseOrderLines" AS line
                        ON line."Id" = receipt."PurchaseOrderLineId"
                    WHERE receipt."Id" = NEW."GoodsReceiptId";

                    IF NOT FOUND THEN
                        RAISE EXCEPTION 'The goods receipt does not exist';
                    END IF;
                    IF NOT technical_acceptance_required OR accepted_quantity <= 0 THEN
                        RAISE EXCEPTION 'This goods receipt does not require technical acceptance';
                    END IF;
                    IF NEW."EngineerUserId" = received_by_user_id THEN
                        RAISE EXCEPTION 'The delivery receiver cannot perform its technical acceptance';
                    END IF;

                    SELECT review."ReviewSequence", review."Outcome"
                    INTO latest_sequence, latest_outcome
                    FROM "GoodsReceiptTechnicalAcceptances" AS review
                    WHERE review."GoodsReceiptId" = NEW."GoodsReceiptId"
                    ORDER BY review."ReviewSequence" DESC
                    LIMIT 1;

                    IF NEW."ReviewSequence" <> COALESCE(latest_sequence, 0) + 1 THEN
                        RAISE EXCEPTION 'Technical acceptance review sequence is invalid';
                    END IF;
                    IF latest_outcome = 'Accepted' THEN
                        RAISE EXCEPTION 'An accepted technical review is final';
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_GoodsReceiptTechnicalAcceptances_Validate"
                    BEFORE INSERT ON "GoodsReceiptTechnicalAcceptances"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_validate_goods_receipt_technical_acceptance();

                CREATE TRIGGER "TR_GoodsReceiptTechnicalAcceptances_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "GoodsReceiptTechnicalAcceptances"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "GoodsReceiptTechnicalAcceptances")
                       OR EXISTS (
                        SELECT 1
                        FROM "StockLedgerEntries"
                        WHERE "MovementType" = 'TechnicalAcceptance'
                    ) THEN
                        RAISE EXCEPTION 'Cannot remove technical acceptance after review evidence or accepted stock exists; restore a pre-migration backup instead';
                    END IF;
                END;
                $$;
                """);

            migrationBuilder.Sql(
                """
                DROP TRIGGER IF EXISTS "TR_GoodsReceiptTechnicalAcceptances_AppendOnly"
                    ON "GoodsReceiptTechnicalAcceptances";
                DROP TRIGGER IF EXISTS "TR_GoodsReceiptTechnicalAcceptances_Validate"
                    ON "GoodsReceiptTechnicalAcceptances";
                DROP FUNCTION IF EXISTS constructionms_validate_goods_receipt_technical_acceptance();
                """);

            migrationBuilder.DropTable(
                name: "GoodsReceiptTechnicalAcceptances");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries",
                sql: "\"MovementType\" IN ('Receipt', 'Issue', 'TransferOut', 'TransferIn', 'CountAdjustment')");

            migrationBuilder.DropColumn(
                name: "RequiresTechnicalAcceptance",
                table: "PurchaseOrderLines");

            migrationBuilder.DropColumn(
                name: "RequiresTechnicalAcceptance",
                table: "Materials");
        }
    }
}
