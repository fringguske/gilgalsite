using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddMaterialCatalogRequestWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NormalizedName",
                table: "Materials",
                type: "text",
                nullable: true,
                computedColumnSql: "lower(btrim(\"Name\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))",
                stored: true);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedUnit",
                table: "Materials",
                type: "text",
                nullable: true,
                computedColumnSql: "lower(btrim(\"Unit\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))",
                stored: true);

            migrationBuilder.CreateTable(
                name: "MaterialCatalogRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RequestNumber = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ProjectId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Category = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Unit = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Purpose = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SubmittedByUserId = table.Column<int>(type: "integer", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ApprovedMaterialId = table.Column<int>(type: "integer", nullable: true),
                    NormalizedName = table.Column<string>(type: "text", nullable: true, computedColumnSql: "lower(btrim(\"Name\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))", stored: true),
                    NormalizedUnit = table.Column<string>(type: "text", nullable: true, computedColumnSql: "lower(btrim(\"Unit\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MaterialCatalogRequests", x => x.Id);
                    table.CheckConstraint("CK_MaterialCatalogRequests_Actors_Distinct", "\"ReviewedByUserId\" IS NULL OR \"ReviewedByUserId\" <> \"SubmittedByUserId\"");
                    table.CheckConstraint("CK_MaterialCatalogRequests_Decision_Consistent", "(\"Status\" = 'Pending' AND \"ReviewedByUserId\" IS NULL AND \"ReviewedAt\" IS NULL AND \"ReviewNotes\" IS NULL AND \"ApprovedMaterialId\" IS NULL) OR (\"Status\" = 'Approved' AND \"ReviewedByUserId\" IS NOT NULL AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 AND \"ApprovedMaterialId\" IS NOT NULL) OR (\"Status\" = 'Rejected' AND \"ReviewedByUserId\" IS NOT NULL AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 AND \"ApprovedMaterialId\" IS NULL)");
                    table.CheckConstraint("CK_MaterialCatalogRequests_Review_After_Submission", "\"ReviewedAt\" IS NULL OR \"ReviewedAt\" >= \"SubmittedAt\"");
                    table.CheckConstraint("CK_MaterialCatalogRequests_Status_Valid", "\"Status\" IN ('Pending', 'Approved', 'Rejected')");
                    table.ForeignKey(
                        name: "FK_MaterialCatalogRequests_Materials_ApprovedMaterialId",
                        column: x => x.ApprovedMaterialId,
                        principalTable: "Materials",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialCatalogRequests_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialCatalogRequests_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MaterialCatalogRequests_Users_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM "Materials"
                        GROUP BY "NormalizedName", "NormalizedUnit"
                        HAVING count(*) > 1
                    ) THEN
                        RAISE EXCEPTION 'Equivalent material catalog records must be resolved before this migration can continue.';
                    END IF;
                END;
                $$;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Materials_NormalizedName_NormalizedUnit",
                table: "Materials",
                columns: new[] { "NormalizedName", "NormalizedUnit" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCatalogRequests_ApprovedMaterialId",
                table: "MaterialCatalogRequests",
                column: "ApprovedMaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCatalogRequests_NormalizedName_NormalizedUnit",
                table: "MaterialCatalogRequests",
                columns: new[] { "NormalizedName", "NormalizedUnit" },
                unique: true,
                filter: "\"Status\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCatalogRequests_ProjectId_Status_SubmittedAt",
                table: "MaterialCatalogRequests",
                columns: new[] { "ProjectId", "Status", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCatalogRequests_RequestNumber",
                table: "MaterialCatalogRequests",
                column: "RequestNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCatalogRequests_ReviewedByUserId",
                table: "MaterialCatalogRequests",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCatalogRequests_Status",
                table: "MaterialCatalogRequests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_MaterialCatalogRequests_SubmittedByUserId",
                table: "MaterialCatalogRequests",
                column: "SubmittedByUserId");

            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_guard_material_catalog_request_mutation()
                RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Material catalog requests cannot be deleted.';
                    END IF;

                    IF OLD."Status" <> 'Pending' THEN
                        RAISE EXCEPTION 'A reviewed material catalog request is immutable.';
                    END IF;

                    IF NEW."RequestNumber" IS DISTINCT FROM OLD."RequestNumber"
                        OR NEW."ProjectId" IS DISTINCT FROM OLD."ProjectId"
                        OR NEW."Name" IS DISTINCT FROM OLD."Name"
                        OR NEW."Category" IS DISTINCT FROM OLD."Category"
                        OR NEW."Unit" IS DISTINCT FROM OLD."Unit"
                        OR NEW."Purpose" IS DISTINCT FROM OLD."Purpose"
                        OR NEW."SubmittedByUserId" IS DISTINCT FROM OLD."SubmittedByUserId"
                        OR NEW."SubmittedAt" IS DISTINCT FROM OLD."SubmittedAt" THEN
                        RAISE EXCEPTION 'Material proposal fields are immutable; submit a new request.';
                    END IF;

                    IF NEW."Status" NOT IN ('Approved', 'Rejected') THEN
                        RAISE EXCEPTION 'A material catalog review must record one terminal decision.';
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_MaterialCatalogRequests_ControlledDecision"
                    BEFORE UPDATE OR DELETE ON "MaterialCatalogRequests"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_material_catalog_request_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MaterialCatalogRequests");

            migrationBuilder.DropIndex(
                name: "IX_Materials_NormalizedName_NormalizedUnit",
                table: "Materials");

            migrationBuilder.DropColumn(
                name: "NormalizedName",
                table: "Materials");

            migrationBuilder.DropColumn(
                name: "NormalizedUnit",
                table: "Materials");

            migrationBuilder.Sql(
                "DROP FUNCTION IF EXISTS constructionms_guard_material_catalog_request_mutation();");
        }
    }
}
