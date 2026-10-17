using ConstructionMS.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260901090000_FixPolymorphicControlTriggerAccess")]
    public partial class FixPolymorphicControlTriggerAccess : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            ApplySafeTriggerDefinitions(migrationBuilder);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Rolling back to a trigger that reads fields from the wrong record
            // shape would make valid workflows fail, so retain the safe definitions.
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

                    IF verification_actor IS NOT NULL
                       AND (
                            verification_actor = batch_record."SubmittedByUserId"
                            OR verification_at < batch_record."SubmittedAt"
                       ) THEN
                        RAISE EXCEPTION 'Opening-position verification is not independent or authorized';
                    END IF;
                    IF TG_TABLE_NAME = 'OpeningPositionVerifications' THEN
                        IF NOT constructionms_actor_has_project_role(
                            verification_actor, 'Supervisor', batch_record."ProjectId") THEN
                            RAISE EXCEPTION 'Opening-position verifier is not active in the required project role';
                        END IF;
                    END IF;
                    IF decision_actor IS NOT NULL
                       AND (
                            decision_actor = batch_record."SubmittedByUserId"
                            OR decision_actor = verification_actor
                            OR decision_at < COALESCE(verification_at, batch_record."SubmittedAt")
                       ) THEN
                        RAISE EXCEPTION 'Opening-position submitter cannot verify or approve the same batch';
                    END IF;
                    IF TG_TABLE_NAME = 'OpeningPositionDecisions' THEN
                        IF NOT constructionms_actor_has_project_role(
                            decision_actor, 'CEO', batch_record."ProjectId") THEN
                            RAISE EXCEPTION 'Opening-position decision actor is not active in the required project role';
                        END IF;
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
                       OR closeout_record."SubmittedByUserId" <> issue_record."IssuedToUserId" THEN
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
                           OR decision_at < closeout_record."SubmittedAt"
                           OR (closeout_record."Status" = 'Approved'
                               AND closeout_record."UnaccountedQuantity" <> 0) THEN
                            RAISE EXCEPTION 'Custody close-out decision is missing or inconsistent';
                        END IF;
                    END IF;
                    IF TG_TABLE_NAME = 'MaterialCustodyCloseoutDecisions' THEN
                        IF NOT constructionms_actor_has_project_role(
                            decision_actor, 'Supervisor', issue_record."ProjectId") THEN
                            RAISE EXCEPTION 'Custody close-out decision actor is not active in the required project role';
                        END IF;
                    END IF;
                    RETURN NULL;
                END;
                $$ LANGUAGE plpgsql;
                """);

            migrationBuilder.Sql(
                """
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
                    trigger_event_type text;
                    trigger_actor integer;
                BEGIN
                    IF TG_TABLE_NAME = 'OperationalPeriods' THEN
                        period_id := NEW."Id";
                    ELSIF TG_TABLE_NAME = 'OperationalPeriodEvents' THEN
                        period_id := NEW."OperationalPeriodId";
                        trigger_event_type := NEW."EventType";
                        trigger_actor := NEW."ActorUserId";
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

                    IF TG_TABLE_NAME = 'OperationalPeriodEvents' THEN
                        IF (
                            trigger_event_type IN ('Opened', 'CloseSubmitted')
                            AND NOT constructionms_actor_has_project_role(
                                trigger_actor, submitter_role, period_record."ProjectId")
                        ) OR (
                            trigger_event_type IN ('Closed', 'CloseReturned')
                            AND NOT constructionms_actor_has_project_role(
                                trigger_actor, 'CEO', period_record."ProjectId")
                        ) THEN
                            RAISE EXCEPTION 'Operational-period event actor is not active in the required project role';
                        END IF;
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
                            )
                        ) OR (
                            event."SequenceNumber" > 1
                            AND NOT (
                                (
                                    event.prior_type IN ('Opened', 'CloseReturned')
                                    AND event."EventType" = 'CloseSubmitted'
                                    AND event."ActorRole" = submitter_role
                                ) OR (
                                    event.prior_type = 'CloseSubmitted'
                                    AND event."EventType" IN ('Closed', 'CloseReturned')
                                    AND event."ActorRole" = 'CEO'
                                    AND event."ActorUserId" <> event.prior_actor
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
                       OR decision_at < correction_record."SubmittedAt" THEN
                        RAISE EXCEPTION 'Controlled-correction decision is missing, unauthorized, or not independent';
                    END IF;
                    IF TG_TABLE_NAME = 'ControlledCorrectionDecisions' THEN
                        IF NOT constructionms_actor_has_project_role(
                            decision_actor, 'CEO', correction_record."ProjectId") THEN
                            RAISE EXCEPTION 'Controlled-correction decision actor is not active in the required project role';
                        END IF;
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
