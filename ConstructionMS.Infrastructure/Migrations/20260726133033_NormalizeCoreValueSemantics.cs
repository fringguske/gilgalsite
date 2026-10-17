using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeCoreValueSemantics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM "Projects"
                        WHERE "Budget" = 'NaN'::numeric
                           OR "Budget" < 0
                           OR ("EndDate" IS NOT NULL AND "EndDate" < "StartDate")
                           OR ("StartDate" AT TIME ZONE 'UTC')::time <> TIME '00:00:00'
                           OR ("EndDate" IS NOT NULL AND ("EndDate" AT TIME ZONE 'UTC')::time <> TIME '00:00:00')
                    ) OR EXISTS (
                        SELECT 1 FROM "Materials"
                        WHERE "StandardPrice" = 'NaN'::numeric
                           OR "ReorderLevel" = 'NaN'::numeric
                           OR "StandardPrice" < 0
                           OR "ReorderLevel" < 0
                    ) OR EXISTS (
                        SELECT 1 FROM "Requisitions"
                        WHERE "Quantity" = 'NaN'::numeric
                           OR "Quantity" <= 0
                           OR "Status" NOT IN ('Pending', 'Approved', 'Rejected')
                           OR (
                                "Status" = 'Pending'
                                AND ("ApprovedByUserId" IS NOT NULL OR "ApprovedAt" IS NOT NULL)
                           )
                           OR (
                                "Status" IN ('Approved', 'Rejected')
                                AND ("ApprovedByUserId" IS NULL OR "ApprovedAt" IS NULL)
                           )
                           OR (
                                "ApprovedByUserId" IS NOT NULL
                                AND "ApprovedByUserId" = "RequestedByUserId"
                           )
                    ) THEN
                        RAISE EXCEPTION 'Existing dates, numeric values or requisition states violate the normalized schema. Correct them before applying this migration.';
                    END IF;

                    IF EXISTS (
                        SELECT lower(btrim("Email", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))) FROM "Users"
                        GROUP BY lower(btrim("Email", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))) HAVING count(*) > 1
                    ) OR EXISTS (
                        SELECT upper(btrim("KraPin", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))) FROM "Suppliers"
                        WHERE "KraPin" IS NOT NULL
                        GROUP BY upper(btrim("KraPin", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))) HAVING count(*) > 1
                    ) THEN
                        RAISE EXCEPTION 'Case-insensitive duplicate emails or supplier KRA PINs must be resolved before applying this migration.';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropIndex(
                name: "IX_Users_Email",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Suppliers_KraPin",
                table: "Suppliers");

            migrationBuilder.AlterColumn<decimal>(
                name: "Quantity",
                table: "Requisitions",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.Sql(
                """
                ALTER TABLE "Projects"
                    ALTER COLUMN "StartDate" TYPE date
                    USING ("StartDate" AT TIME ZONE 'UTC')::date,
                    ALTER COLUMN "EndDate" TYPE date
                    USING ("EndDate" AT TIME ZONE 'UTC')::date;
                """);

            migrationBuilder.AlterColumn<decimal>(
                name: "ReorderLevel",
                table: "Materials",
                type: "numeric(18,3)",
                precision: 18,
                scale: 3,
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer");

            migrationBuilder.AddColumn<string>(
                name: "NormalizedEmail",
                table: "Users",
                type: "text",
                nullable: true,
                computedColumnSql: "lower(btrim(\"Email\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))",
                stored: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedKraPin",
                table: "Suppliers",
                type: "text",
                nullable: true,
                computedColumnSql: "nullif(upper(btrim(\"KraPin\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))), '')",
                stored: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users",
                column: "NormalizedEmail",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Suppliers_NormalizedKraPin",
                table: "Suppliers",
                column: "NormalizedKraPin",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_Quantity_Positive",
                table: "Requisitions",
                sql: "\"Quantity\" <> 'NaN'::numeric AND \"Quantity\" > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_Status_Valid",
                table: "Requisitions",
                sql: "\"Status\" IN ('Pending', 'Approved', 'Rejected')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_ActionFields_Consistent",
                table: "Requisitions",
                sql: "(\"Status\" = 'Pending' AND \"ApprovedByUserId\" IS NULL AND \"ApprovedAt\" IS NULL) OR (\"Status\" IN ('Approved', 'Rejected') AND \"ApprovedByUserId\" IS NOT NULL AND \"ApprovedAt\" IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_Actors_Distinct",
                table: "Requisitions",
                sql: "\"ApprovedByUserId\" IS NULL OR \"ApprovedByUserId\" <> \"RequestedByUserId\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Projects_Budget_NonNegative",
                table: "Projects",
                sql: "\"Budget\" <> 'NaN'::numeric AND \"Budget\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Projects_DateRange",
                table: "Projects",
                sql: "\"EndDate\" IS NULL OR \"EndDate\" >= \"StartDate\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Materials_ReorderLevel_NonNegative",
                table: "Materials",
                sql: "\"ReorderLevel\" <> 'NaN'::numeric AND \"ReorderLevel\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Materials_StandardPrice_NonNegative",
                table: "Materials",
                sql: "\"StandardPrice\" <> 'NaN'::numeric AND \"StandardPrice\" >= 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM "Requisitions"
                        WHERE "Quantity" = 'NaN'::numeric
                           OR "Quantity" <> trunc("Quantity")
                           OR "Quantity" > 2147483647
                    ) OR EXISTS (
                        SELECT 1 FROM "Materials"
                        WHERE "ReorderLevel" = 'NaN'::numeric
                           OR "ReorderLevel" <> trunc("ReorderLevel")
                           OR "ReorderLevel" > 2147483647
                    ) THEN
                        RAISE EXCEPTION 'Fractional or out-of-range quantities cannot be rolled back to integer columns.';
                    END IF;
                END $$;
                """);

            migrationBuilder.DropIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Suppliers_NormalizedKraPin",
                table: "Suppliers");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_Quantity_Positive",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_Status_Valid",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_ActionFields_Consistent",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_Actors_Distinct",
                table: "Requisitions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Projects_Budget_NonNegative",
                table: "Projects");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Projects_DateRange",
                table: "Projects");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Materials_ReorderLevel_NonNegative",
                table: "Materials");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Materials_StandardPrice_NonNegative",
                table: "Materials");

            migrationBuilder.DropColumn(
                name: "NormalizedEmail",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "NormalizedKraPin",
                table: "Suppliers");

            migrationBuilder.Sql(
                """
                ALTER TABLE "Requisitions"
                    ALTER COLUMN "Quantity" TYPE integer
                    USING "Quantity"::integer;

                ALTER TABLE "Projects"
                    ALTER COLUMN "StartDate" TYPE timestamp with time zone
                    USING "StartDate"::timestamp AT TIME ZONE 'UTC',
                    ALTER COLUMN "EndDate" TYPE timestamp with time zone
                    USING "EndDate"::timestamp AT TIME ZONE 'UTC';

                ALTER TABLE "Materials"
                    ALTER COLUMN "ReorderLevel" TYPE integer
                    USING "ReorderLevel"::integer;
                """);

            migrationBuilder.Sql(
                """
                UPDATE "Suppliers"
                SET "KraPin" = NULL
                WHERE "KraPin" IS NOT NULL
                  AND btrim("KraPin", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)) = '';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Suppliers_KraPin",
                table: "Suppliers",
                column: "KraPin",
                unique: true);
        }
    }
}
