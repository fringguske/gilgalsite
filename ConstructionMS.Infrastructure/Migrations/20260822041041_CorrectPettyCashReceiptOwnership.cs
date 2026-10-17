using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CorrectPettyCashReceiptOwnership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $ownership$
                DECLARE
                    application_owner name;
                BEGIN
                    SELECT pg_get_userbyid(table_record.relowner)
                    INTO application_owner
                    FROM pg_class AS table_record
                    INNER JOIN pg_namespace AS schema_record
                        ON schema_record.oid = table_record.relnamespace
                    WHERE schema_record.nspname = current_schema()
                      AND table_record.relname = 'Users'
                      AND table_record.relkind = 'r';

                    IF application_owner IS NULL THEN
                        RAISE EXCEPTION 'The established application database owner could not be determined.';
                    END IF;

                    EXECUTE format(
                        'ALTER TABLE %I.%I OWNER TO %I',
                        current_schema(),
                        'PettyCashReceiptConfirmations',
                        application_owner);
                    EXECUTE format(
                        'ALTER SEQUENCE %I.%I OWNER TO %I',
                        current_schema(),
                        'PettyCashReceiptConfirmations_Id_seq',
                        application_owner);
                    EXECUTE format(
                        'ALTER FUNCTION %I.%I() OWNER TO %I',
                        current_schema(),
                        'constructionms_validate_petty_cash_receipt_confirmation',
                        application_owner);
                END
                $ownership$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Ownership remains with the established application role on rollback.
        }
    }
}
