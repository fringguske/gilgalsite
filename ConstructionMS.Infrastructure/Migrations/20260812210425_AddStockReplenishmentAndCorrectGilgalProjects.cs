using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStockReplenishmentAndCorrectGilgalProjects : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RequestType",
                table: "Requisitions",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "SiteUse");

            migrationBuilder.Sql(
                "ALTER TABLE \"Requisitions\" ALTER COLUMN \"RequestType\" DROP DEFAULT;");

            migrationBuilder.UpdateData(
                table: "Projects",
                keyColumn: "Id",
                keyValue: 1,
                column: "Name",
                value: "Gilgal 2");

            migrationBuilder.UpdateData(
                table: "Projects",
                keyColumn: "Id",
                keyValue: 2,
                column: "Name",
                value: "Gilgal 3");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Requisitions_RequestType_Valid",
                table: "Requisitions",
                sql: "\"RequestType\" IN ('SiteUse', 'StockReplenishment')");

            migrationBuilder.Sql(
                """
                CREATE TRIGGER "TR_Requisitions_RequestTypeImmutable"
                    BEFORE UPDATE OF "RequestType" ON "Requisitions"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "DROP TRIGGER IF EXISTS \"TR_Requisitions_RequestTypeImmutable\" ON \"Requisitions\";");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Requisitions_RequestType_Valid",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "RequestType",
                table: "Requisitions");

            migrationBuilder.UpdateData(
                table: "Projects",
                keyColumn: "Id",
                keyValue: 1,
                column: "Name",
                value: "Gilgal 1");

            migrationBuilder.UpdateData(
                table: "Projects",
                keyColumn: "Id",
                keyValue: 2,
                column: "Name",
                value: "Gilgal 2");
        }
    }
}
