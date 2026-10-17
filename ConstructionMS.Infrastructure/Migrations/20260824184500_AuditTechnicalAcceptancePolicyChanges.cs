using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AuditTechnicalAcceptancePolicyChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MaterialTechnicalAcceptancePolicyEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MaterialId = table.Column<int>(type: "integer", nullable: false),
                    PreviousRequired = table.Column<bool>(type: "boolean", nullable: false),
                    Required = table.Column<bool>(type: "boolean", nullable: false),
                    ChangedByUserId = table.Column<int>(type: "integer", nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialTechnicalAcceptancePolicyEvents", x => x.Id);
                    table.CheckConstraint("CK_MaterialTechnicalAcceptancePolicyEvents_Changed", "\"PreviousRequired\" <> \"Required\"");
                    table.ForeignKey(
                        name: "FK_MaterialTechnicalAcceptancePolicyEvents_Materials_MaterialId",
                        column: x => x.MaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialTechnicalAcceptancePolicyEvents_Users_ChangedByUser~",
                        column: x => x.ChangedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MaterialTechnicalAcceptancePolicyEvents_ChangedByUserId",
                table: "MaterialTechnicalAcceptancePolicyEvents",
                column: "ChangedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialTechnicalAcceptancePolicyEvents_MaterialId_ChangedAt",
                table: "MaterialTechnicalAcceptancePolicyEvents",
                columns: new[] { "MaterialId", "ChangedAt" });

            migrationBuilder.Sql(
                """
                CREATE TRIGGER "TR_MaterialTechnicalAcceptancePolicyEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "MaterialTechnicalAcceptancePolicyEvents"
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
                    IF EXISTS (SELECT 1 FROM "MaterialTechnicalAcceptancePolicyEvents")
                       OR EXISTS (
                        SELECT 1
                        FROM "StockLedgerEntries"
                        WHERE "MovementType" = 'TechnicalAcceptance'
                    ) THEN
                        RAISE EXCEPTION 'Cannot remove technical-acceptance policy audit data or accepted stock; restore a pre-migration backup instead';
                    END IF;
                END;
                $$;
                """);

            migrationBuilder.Sql(
                """
                DROP TRIGGER IF EXISTS "TR_MaterialTechnicalAcceptancePolicyEvents_AppendOnly"
                    ON "MaterialTechnicalAcceptancePolicyEvents";
                """);

            migrationBuilder.DropTable(
                name: "MaterialTechnicalAcceptancePolicyEvents");
        }
    }
}
