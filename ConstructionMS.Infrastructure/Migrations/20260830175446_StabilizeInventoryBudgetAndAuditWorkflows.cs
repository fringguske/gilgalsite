using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StabilizeInventoryBudgetAndAuditWorkflows : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_StockTransfers_Status",
                table: "StockTransfers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SecurityAuditEvents_Source",
                table: "SecurityAuditEvents");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrderLines_PurchaseOrderId",
                table: "PurchaseOrderLines");

            migrationBuilder.DropIndex(
                name: "IX_AccessRequests_NormalizedUsername",
                table: "AccessRequests");

            migrationBuilder.AddColumn<string>(
                name: "ResolutionDisposition",
                table: "StockTransfers",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResolutionEvidenceReference",
                table: "StockTransfers",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResolutionNotes",
                table: "StockTransfers",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ResolutionQuantity",
                table: "StockTransfers",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ResolvedAt",
                table: "StockTransfers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ResolvedByUserId",
                table: "StockTransfers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IdempotencyKey",
                table: "MaterialUsageRecords",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SupplierId",
                table: "GoodsReceipts",
                type: "integer",
                nullable: true);

            migrationBuilder.Sql(
                """
                ALTER TABLE "GoodsReceipts" DISABLE TRIGGER "TR_GoodsReceipts_AppendOnly";

                UPDATE "GoodsReceipts" receipt
                SET "SupplierId" = purchase_order."SupplierId",
                    "DeliveryNoteReference" = upper(btrim(receipt."DeliveryNoteReference"))
                FROM "PurchaseOrders" purchase_order
                WHERE purchase_order."Id" = receipt."PurchaseOrderId";

                ALTER TABLE "GoodsReceipts" ENABLE TRIGGER "TR_GoodsReceipts_AppendOnly";

                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM "GoodsReceipts"
                        WHERE "SupplierId" IS NULL
                           OR length(btrim("DeliveryNoteReference")) = 0
                    ) THEN
                        RAISE EXCEPTION 'Goods receipts contain an invalid supplier or delivery-note reference';
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM "GoodsReceipts"
                        GROUP BY "SupplierId", "DeliveryNoteReference"
                        HAVING COUNT(*) > 1
                    ) THEN
                        RAISE EXCEPTION 'A supplier delivery-note reference is recorded more than once';
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM "PurchaseOrders" purchase_order
                        LEFT JOIN "PurchaseOrderLines" line
                          ON line."PurchaseOrderId" = purchase_order."Id"
                        GROUP BY purchase_order."Id"
                        HAVING COUNT(line."Id") <> 1
                    ) THEN
                        RAISE EXCEPTION 'Every purchase order must contain exactly one line before this migration can continue';
                    END IF;
                END $$;
                """);

            migrationBuilder.AlterColumn<int>(
                name: "SupplierId",
                table: "GoodsReceipts",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_StockTransfers_ResolvedByUserId",
                table: "StockTransfers",
                column: "ResolvedByUserId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockTransfers_Resolution",
                table: "StockTransfers",
                sql: "(\"Status\" = 'Resolved' AND \"ResolvedByUserId\" IS NOT NULL AND \"ResolvedAt\" IS NOT NULL AND \"ResolutionDisposition\" IN ('AcceptedLoss', 'RecoveredAtDestination', 'ReturnedToSource') AND \"ResolutionQuantity\" > 0 AND length(btrim(\"ResolutionNotes\")) >= 3) OR (\"Status\" <> 'Resolved' AND \"ResolvedByUserId\" IS NULL AND \"ResolvedAt\" IS NULL AND \"ResolutionDisposition\" IS NULL AND \"ResolutionQuantity\" IS NULL AND \"ResolutionNotes\" IS NULL AND \"ResolutionEvidenceReference\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockTransfers_Status",
                table: "StockTransfers",
                sql: "\"Status\" IN ('PendingDispatch', 'InTransit', 'Received', 'Disputed', 'Resolved')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents",
                sql: "\"EventType\" IN ('UsernameChanged', 'PasswordChanged', 'AdministratorPasswordReset', 'UserCreated', 'UserProfileUpdated', 'UserRoleChanged', 'UserActivated', 'UserDeactivated')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SecurityAuditEvents_Source",
                table: "SecurityAuditEvents",
                sql: "\"Source\" IN ('SelfService', 'ServerRecovery', 'Administrator')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries",
                sql: "\"MovementType\" IN ('Receipt', 'TechnicalAcceptance', 'Issue', 'TransferOut', 'TransferIn', 'TransferVarianceRecovered', 'TransferVarianceReturned', 'CountAdjustment', 'OpeningBalance', 'ReturnToStore', 'HandoverCorrection', 'ControlledCorrection')");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_PurchaseOrderId",
                table: "PurchaseOrderLines",
                column: "PurchaseOrderId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialUsageRecords_MaterialIssueId_IdempotencyKey",
                table: "MaterialUsageRecords",
                columns: new[] { "MaterialIssueId", "IdempotencyKey" },
                unique: true,
                filter: "\"IdempotencyKey\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_SupplierId_DeliveryNoteReference",
                table: "GoodsReceipts",
                columns: new[] { "SupplierId", "DeliveryNoteReference" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_GoodsReceipts_DeliveryNoteReference",
                table: "GoodsReceipts",
                sql: "length(btrim(\"DeliveryNoteReference\")) > 0 AND \"DeliveryNoteReference\" = upper(btrim(\"DeliveryNoteReference\"))");

            migrationBuilder.CreateIndex(
                name: "IX_AccessRequests_NormalizedUsername",
                table: "AccessRequests",
                column: "NormalizedUsername",
                unique: true,
                filter: "\"Status\" = 'Pending'");

            migrationBuilder.AddForeignKey(
                name: "FK_GoodsReceipts_Suppliers_SupplierId",
                table: "GoodsReceipts",
                column: "SupplierId",
                principalTable: "Suppliers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_StockTransfers_Users_ResolvedByUserId",
                table: "StockTransfers",
                column: "ResolvedByUserId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            ApplyDatabaseWorkflowGuards(migrationBuilder);

            ApplyHistoricalActorSafeTriggerDefinitions(migrationBuilder);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "StockTransfers" WHERE "Status" = 'Resolved')
                       OR EXISTS (SELECT 1 FROM "MaterialUsageRecords" WHERE "IdempotencyKey" IS NOT NULL) THEN
                        RAISE EXCEPTION 'This migration cannot be rolled back after transfer resolutions or idempotent material-use records exist; restore the pre-migration backup instead';
                    END IF;
                END $$;

                DROP TRIGGER IF EXISTS "TR_StockTransfers_WorkflowInsert" ON "StockTransfers";
                DROP TRIGGER IF EXISTS "TR_StockTransfers_WorkflowTransition" ON "StockTransfers";
                DROP FUNCTION IF EXISTS constructionms_guard_stock_transfer_workflow();

                DROP TRIGGER IF EXISTS "TR_Materials_UnitImmutable" ON "Materials";
                DROP FUNCTION IF EXISTS constructionms_guard_material_unit();

                DROP TRIGGER IF EXISTS "TR_PurchaseOrders_RequireOneLine" ON "PurchaseOrders";
                DROP TRIGGER IF EXISTS "TR_PurchaseOrderLines_RequireOneLine" ON "PurchaseOrderLines";
                DROP FUNCTION IF EXISTS constructionms_require_one_purchase_order_line();
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_GoodsReceipts_Suppliers_SupplierId",
                table: "GoodsReceipts");

            migrationBuilder.DropForeignKey(
                name: "FK_StockTransfers_Users_ResolvedByUserId",
                table: "StockTransfers");

            migrationBuilder.DropIndex(
                name: "IX_StockTransfers_ResolvedByUserId",
                table: "StockTransfers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockTransfers_Resolution",
                table: "StockTransfers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockTransfers_Status",
                table: "StockTransfers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents");

            migrationBuilder.DropCheckConstraint(
                name: "CK_SecurityAuditEvents_Source",
                table: "SecurityAuditEvents");

            migrationBuilder.DropCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrderLines_PurchaseOrderId",
                table: "PurchaseOrderLines");

            migrationBuilder.DropIndex(
                name: "IX_MaterialUsageRecords_MaterialIssueId_IdempotencyKey",
                table: "MaterialUsageRecords");

            migrationBuilder.DropIndex(
                name: "IX_GoodsReceipts_SupplierId_DeliveryNoteReference",
                table: "GoodsReceipts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_GoodsReceipts_DeliveryNoteReference",
                table: "GoodsReceipts");

            migrationBuilder.DropIndex(
                name: "IX_AccessRequests_NormalizedUsername",
                table: "AccessRequests");

            migrationBuilder.DropColumn(
                name: "ResolutionDisposition",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "ResolutionEvidenceReference",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "ResolutionNotes",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "ResolutionQuantity",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "ResolvedAt",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "ResolvedByUserId",
                table: "StockTransfers");

            migrationBuilder.DropColumn(
                name: "IdempotencyKey",
                table: "MaterialUsageRecords");

            migrationBuilder.DropColumn(
                name: "SupplierId",
                table: "GoodsReceipts");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockTransfers_Status",
                table: "StockTransfers",
                sql: "\"Status\" IN ('PendingDispatch', 'InTransit', 'Received', 'Disputed')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents",
                sql: "\"EventType\" IN ('UsernameChanged', 'PasswordChanged', 'AdministratorPasswordReset')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SecurityAuditEvents_Source",
                table: "SecurityAuditEvents",
                sql: "\"Source\" IN ('SelfService', 'ServerRecovery')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_StockLedgerEntries_Movement",
                table: "StockLedgerEntries",
                sql: "\"MovementType\" IN ('Receipt', 'TechnicalAcceptance', 'Issue', 'TransferOut', 'TransferIn', 'CountAdjustment', 'OpeningBalance', 'ReturnToStore', 'HandoverCorrection', 'ControlledCorrection')");

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderLines_PurchaseOrderId",
                table: "PurchaseOrderLines",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_AccessRequests_NormalizedUsername",
                table: "AccessRequests",
                column: "NormalizedUsername",
                unique: true,
                filter: "\"Status\" = 'Pending'");
        }

        private static void ApplyDatabaseWorkflowGuards(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_guard_material_unit()
                RETURNS trigger AS $$
                BEGIN
                    IF NEW."Unit" IS DISTINCT FROM OLD."Unit"
                       AND (
                            EXISTS (SELECT 1 FROM "Requisitions" WHERE "MaterialId" = OLD."Id")
                            OR EXISTS (SELECT 1 FROM "StockBalances" WHERE "MaterialId" = OLD."Id")
                            OR EXISTS (SELECT 1 FROM "StockLedgerEntries" WHERE "MaterialId" = OLD."Id")
                            OR EXISTS (SELECT 1 FROM "StockTransfers" WHERE "MaterialId" = OLD."Id")
                            OR EXISTS (SELECT 1 FROM "OpeningInventoryLines" WHERE "MaterialId" = OLD."Id")
                       ) THEN
                        RAISE EXCEPTION 'The material unit cannot change after transaction history exists';
                    END IF;
                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_Materials_UnitImmutable"
                    BEFORE UPDATE OF "Unit" ON "Materials"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_material_unit();

                CREATE OR REPLACE FUNCTION constructionms_require_one_purchase_order_line()
                RETURNS trigger AS $$
                DECLARE
                    purchase_order_id integer;
                BEGIN
                    IF TG_TABLE_NAME = 'PurchaseOrders' THEN
                        purchase_order_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."Id" ELSE NEW."Id" END;
                        IF EXISTS (SELECT 1 FROM "PurchaseOrders" WHERE "Id" = purchase_order_id)
                           AND (SELECT COUNT(*) FROM "PurchaseOrderLines" WHERE "PurchaseOrderId" = purchase_order_id) <> 1 THEN
                            RAISE EXCEPTION 'Every purchase order must contain exactly one line';
                        END IF;
                    ELSE
                        IF TG_OP IN ('DELETE', 'UPDATE')
                           AND EXISTS (SELECT 1 FROM "PurchaseOrders" WHERE "Id" = OLD."PurchaseOrderId")
                           AND (SELECT COUNT(*) FROM "PurchaseOrderLines" WHERE "PurchaseOrderId" = OLD."PurchaseOrderId") <> 1 THEN
                            RAISE EXCEPTION 'Every purchase order must contain exactly one line';
                        END IF;

                        IF TG_OP IN ('INSERT', 'UPDATE')
                           AND (TG_OP <> 'UPDATE' OR NEW."PurchaseOrderId" IS DISTINCT FROM OLD."PurchaseOrderId")
                           AND EXISTS (SELECT 1 FROM "PurchaseOrders" WHERE "Id" = NEW."PurchaseOrderId")
                           AND (SELECT COUNT(*) FROM "PurchaseOrderLines" WHERE "PurchaseOrderId" = NEW."PurchaseOrderId") <> 1 THEN
                            RAISE EXCEPTION 'Every purchase order must contain exactly one line';
                        END IF;
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;

                CREATE CONSTRAINT TRIGGER "TR_PurchaseOrders_RequireOneLine"
                    AFTER INSERT OR UPDATE ON "PurchaseOrders"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_require_one_purchase_order_line();

                CREATE CONSTRAINT TRIGGER "TR_PurchaseOrderLines_RequireOneLine"
                    AFTER INSERT OR UPDATE OR DELETE ON "PurchaseOrderLines"
                    DEFERRABLE INITIALLY DEFERRED
                    FOR EACH ROW EXECUTE FUNCTION constructionms_require_one_purchase_order_line();

                CREATE OR REPLACE FUNCTION constructionms_guard_stock_transfer_workflow()
                RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'INSERT' THEN
                        IF NEW."Status" <> 'PendingDispatch'
                           OR NEW."DispatchedByUserId" IS NOT NULL OR NEW."DispatchedAt" IS NOT NULL
                           OR NEW."ReceivedByUserId" IS NOT NULL OR NEW."ReceivedQuantity" IS NOT NULL
                           OR NEW."ReceiptNotes" IS NOT NULL OR NEW."ReceivedAt" IS NOT NULL
                           OR NEW."ResolvedByUserId" IS NOT NULL OR NEW."ResolutionDisposition" IS NOT NULL
                           OR NEW."ResolutionQuantity" IS NOT NULL OR NEW."ResolutionNotes" IS NOT NULL
                           OR NEW."ResolutionEvidenceReference" IS NOT NULL OR NEW."ResolvedAt" IS NOT NULL THEN
                            RAISE EXCEPTION 'A stock transfer must begin pending dispatch';
                        END IF;
                        RETURN NEW;
                    END IF;

                    IF NEW."Status" IS NOT DISTINCT FROM OLD."Status"
                       AND NEW."DispatchedByUserId" IS NOT DISTINCT FROM OLD."DispatchedByUserId"
                       AND NEW."DispatchedAt" IS NOT DISTINCT FROM OLD."DispatchedAt"
                       AND NEW."ReceivedByUserId" IS NOT DISTINCT FROM OLD."ReceivedByUserId"
                       AND NEW."ReceivedQuantity" IS NOT DISTINCT FROM OLD."ReceivedQuantity"
                       AND NEW."ReceiptNotes" IS NOT DISTINCT FROM OLD."ReceiptNotes"
                       AND NEW."ReceivedAt" IS NOT DISTINCT FROM OLD."ReceivedAt"
                       AND NEW."ResolvedByUserId" IS NOT DISTINCT FROM OLD."ResolvedByUserId"
                       AND NEW."ResolutionDisposition" IS NOT DISTINCT FROM OLD."ResolutionDisposition"
                       AND NEW."ResolutionQuantity" IS NOT DISTINCT FROM OLD."ResolutionQuantity"
                       AND NEW."ResolutionNotes" IS NOT DISTINCT FROM OLD."ResolutionNotes"
                       AND NEW."ResolutionEvidenceReference" IS NOT DISTINCT FROM OLD."ResolutionEvidenceReference"
                       AND NEW."ResolvedAt" IS NOT DISTINCT FROM OLD."ResolvedAt" THEN
                        RETURN NEW;
                    END IF;

                    IF OLD."Status" = 'PendingDispatch' AND NEW."Status" = 'InTransit' THEN
                        IF NEW."DispatchedByUserId" IS NULL OR NEW."DispatchedAt" IS NULL
                           OR NEW."DispatchedByUserId" = NEW."RequestedByUserId"
                           OR NEW."ReceivedByUserId" IS NOT NULL OR NEW."ReceivedQuantity" IS NOT NULL
                           OR NEW."ReceiptNotes" IS NOT NULL OR NEW."ReceivedAt" IS NOT NULL
                           OR NEW."ResolvedByUserId" IS NOT NULL OR NEW."ResolutionDisposition" IS NOT NULL
                           OR NEW."ResolutionQuantity" IS NOT NULL OR NEW."ResolutionNotes" IS NOT NULL
                           OR NEW."ResolutionEvidenceReference" IS NOT NULL OR NEW."ResolvedAt" IS NOT NULL THEN
                            RAISE EXCEPTION 'Stock transfer dispatch is incomplete or not independent';
                        END IF;
                    ELSIF OLD."Status" = 'InTransit' AND NEW."Status" IN ('Received', 'Disputed') THEN
                        IF NEW."DispatchedByUserId" IS DISTINCT FROM OLD."DispatchedByUserId"
                           OR NEW."DispatchedAt" IS DISTINCT FROM OLD."DispatchedAt"
                           OR NEW."ReceivedByUserId" IS NULL OR NEW."ReceivedAt" IS NULL
                           OR NEW."ReceivedByUserId" = NEW."DispatchedByUserId"
                           OR NEW."ReceivedQuantity" IS NULL OR NEW."ReceivedQuantity" < 0
                           OR NEW."ReceivedQuantity" > NEW."Quantity"
                           OR (NEW."Status" = 'Received' AND NEW."ReceivedQuantity" <> NEW."Quantity")
                           OR (NEW."Status" = 'Disputed' AND NEW."ReceivedQuantity" = NEW."Quantity")
                           OR (NEW."Status" = 'Disputed' AND length(btrim(COALESCE(NEW."ReceiptNotes", ''))) < 3)
                           OR NEW."ResolvedByUserId" IS NOT NULL OR NEW."ResolutionDisposition" IS NOT NULL
                           OR NEW."ResolutionQuantity" IS NOT NULL OR NEW."ResolutionNotes" IS NOT NULL
                           OR NEW."ResolutionEvidenceReference" IS NOT NULL OR NEW."ResolvedAt" IS NOT NULL THEN
                            RAISE EXCEPTION 'Stock transfer receipt is incomplete or not independent';
                        END IF;
                    ELSIF OLD."Status" = 'Disputed' AND NEW."Status" = 'Resolved' THEN
                        IF NEW."DispatchedByUserId" IS DISTINCT FROM OLD."DispatchedByUserId"
                           OR NEW."DispatchedAt" IS DISTINCT FROM OLD."DispatchedAt"
                           OR NEW."ReceivedByUserId" IS DISTINCT FROM OLD."ReceivedByUserId"
                           OR NEW."ReceivedQuantity" IS DISTINCT FROM OLD."ReceivedQuantity"
                           OR NEW."ReceiptNotes" IS DISTINCT FROM OLD."ReceiptNotes"
                           OR NEW."ReceivedAt" IS DISTINCT FROM OLD."ReceivedAt"
                           OR NEW."ResolvedByUserId" IS NULL OR NEW."ResolvedAt" IS NULL
                           OR NEW."ResolutionDisposition" NOT IN ('AcceptedLoss', 'RecoveredAtDestination', 'ReturnedToSource')
                           OR NEW."ResolutionQuantity" IS DISTINCT FROM (NEW."Quantity" - NEW."ReceivedQuantity")
                           OR NEW."ResolutionQuantity" <= 0
                           OR length(btrim(COALESCE(NEW."ResolutionNotes", ''))) < 3
                           OR NEW."ResolvedByUserId" = NEW."RequestedByUserId"
                           OR NEW."ResolvedByUserId" = NEW."DispatchedByUserId"
                           OR NEW."ResolvedByUserId" = NEW."ReceivedByUserId" THEN
                            RAISE EXCEPTION 'Stock transfer variance resolution is incomplete or not independent';
                        END IF;
                    ELSE
                        RAISE EXCEPTION 'Invalid stock transfer workflow transition';
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_StockTransfers_WorkflowInsert"
                    BEFORE INSERT ON "StockTransfers"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_stock_transfer_workflow();

                CREATE TRIGGER "TR_StockTransfers_WorkflowTransition"
                    BEFORE UPDATE OF "Status", "DispatchedByUserId", "DispatchedAt", "ReceivedByUserId",
                        "ReceivedQuantity", "ReceiptNotes", "ReceivedAt", "ResolvedByUserId",
                        "ResolutionDisposition", "ResolutionQuantity", "ResolutionNotes",
                        "ResolutionEvidenceReference", "ResolvedAt"
                    ON "StockTransfers"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_stock_transfer_workflow();
                """);
        }
    }
}
