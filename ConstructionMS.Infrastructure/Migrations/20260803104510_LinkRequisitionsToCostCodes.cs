using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class LinkRequisitionsToCostCodes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CostCodeId",
                table: "Requisitions",
                type: "integer",
                nullable: true);

            // Cost codes did not exist when legacy requisitions were created. Give
            // every project a stable fallback code, link imported rows to it, and
            // only then make the relationship required. This avoids an invalid
            // default foreign key and preserves every existing request.
            migrationBuilder.Sql(
                """
                INSERT INTO "CostCodes"
                    ("ProjectId", "Code", "Name", "IsActive", "CreatedAt")
                SELECT
                    p."Id", 'GENERAL', 'General construction', TRUE, NOW()
                FROM "Projects" AS p
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM "CostCodes" AS existing
                    WHERE existing."ProjectId" = p."Id"
                      AND existing."Code" = 'GENERAL');

                UPDATE "Requisitions" AS r
                SET "CostCodeId" = c."Id"
                FROM "CostCodes" AS c
                WHERE c."ProjectId" = r."ProjectId"
                  AND c."Code" = 'GENERAL'
                  AND r."CostCodeId" IS NULL;
                """);

            migrationBuilder.AlterColumn<int>(
                name: "CostCodeId",
                table: "Requisitions",
                type: "integer",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Requisitions_CostCodeId",
                table: "Requisitions",
                column: "CostCodeId");

            migrationBuilder.AddForeignKey(
                name: "FK_Requisitions_CostCodes_CostCodeId",
                table: "Requisitions",
                column: "CostCodeId",
                principalTable: "CostCodes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Requisitions_CostCodes_CostCodeId",
                table: "Requisitions");

            migrationBuilder.DropIndex(
                name: "IX_Requisitions_CostCodeId",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "CostCodeId",
                table: "Requisitions");
        }
    }
}
