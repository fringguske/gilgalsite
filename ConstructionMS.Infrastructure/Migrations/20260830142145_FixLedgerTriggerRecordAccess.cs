using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FixLedgerTriggerRecordAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            ApplySafeTriggerDefinitions(migrationBuilder);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The superseded definitions cannot safely process polymorphic trigger
            // records, so a rollback keeps the corrected trigger functions in place.
            ApplySafeTriggerDefinitions(migrationBuilder);
        }

        private static void ApplySafeTriggerDefinitions(MigrationBuilder migrationBuilder)
        {
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
                    ELSIF TG_TABLE_NAME = 'StockLedgerEntries' THEN
                        IF NEW."MovementType" IS DISTINCT FROM 'OpeningBalance'
                           OR NEW."ReferenceType" IS DISTINCT FROM 'OpeningPosition' THEN
                            RETURN NULL;
                        END IF;
                        batch_id := NEW."ReferenceId";
                    ELSIF TG_TABLE_NAME = 'CashLedgerEntries' THEN
                        IF NEW."EntryType" IS DISTINCT FROM 'OpeningBalance'
                           OR NEW."ReferenceType" IS DISTINCT FROM 'OpeningPosition' THEN
                            RETURN NULL;
                        END IF;
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
                """);

            migrationBuilder.Sql(
                """
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
                    ELSIF TG_TABLE_NAME = 'StockLedgerEntries' THEN
                        IF NEW."MovementType" IS DISTINCT FROM 'ControlledCorrection'
                           OR NEW."ReferenceType" IS DISTINCT FROM 'ControlledCorrection' THEN
                            RETURN NULL;
                        END IF;
                        correction_id := NEW."ReferenceId";
                    ELSIF TG_TABLE_NAME = 'CashLedgerEntries' THEN
                        IF NEW."EntryType" IS DISTINCT FROM 'ControlledCorrection'
                           OR NEW."ReferenceType" IS DISTINCT FROM 'ControlledCorrection' THEN
                            RETURN NULL;
                        END IF;
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
                """);
        }
    }
}
