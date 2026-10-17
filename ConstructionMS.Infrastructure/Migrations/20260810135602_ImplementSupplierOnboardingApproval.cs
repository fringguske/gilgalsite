using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ImplementSupplierOnboardingApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SupplierOnboardingRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RequestNumber = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ContactPerson = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PhoneNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    KraPin = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    MpesaNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Category = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SubmittedByUserId = table.Column<int>(type: "integer", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ApprovedSupplierId = table.Column<int>(type: "integer", nullable: true),
                    NormalizedKraPin = table.Column<string>(type: "text", nullable: true, computedColumnSql: "nullif(upper(btrim(\"KraPin\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13))), '')", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierOnboardingRequests", x => x.Id);
                    table.CheckConstraint("CK_SupplierOnboardingRequests_Actors_Distinct", "\"ReviewedByUserId\" IS NULL OR \"ReviewedByUserId\" <> \"SubmittedByUserId\"");
                    table.CheckConstraint("CK_SupplierOnboardingRequests_Decision_Consistent", "(\"Status\" = 'Pending' AND \"ReviewedByUserId\" IS NULL AND \"ReviewedAt\" IS NULL AND \"ReviewNotes\" IS NULL AND \"ApprovedSupplierId\" IS NULL) OR (\"Status\" = 'Approved' AND \"ReviewedByUserId\" IS NOT NULL AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 AND \"ApprovedSupplierId\" IS NOT NULL) OR (\"Status\" = 'Rejected' AND \"ReviewedByUserId\" IS NOT NULL AND \"ReviewedAt\" IS NOT NULL AND length(btrim(\"ReviewNotes\")) >= 3 AND \"ApprovedSupplierId\" IS NULL)");
                    table.CheckConstraint("CK_SupplierOnboardingRequests_Review_After_Submission", "\"ReviewedAt\" IS NULL OR \"ReviewedAt\" >= \"SubmittedAt\"");
                    table.CheckConstraint("CK_SupplierOnboardingRequests_Status_Valid", "\"Status\" IN ('Pending', 'Approved', 'Rejected')");
                    table.ForeignKey(
                        name: "FK_SupplierOnboardingRequests_Suppliers_ApprovedSupplierId",
                        column: x => x.ApprovedSupplierId,
                        principalTable: "Suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierOnboardingRequests_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierOnboardingRequests_Users_SubmittedByUserId",
                        column: x => x.SubmittedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupplierOnboardingRequests_ApprovedSupplierId",
                table: "SupplierOnboardingRequests",
                column: "ApprovedSupplierId",
                unique: true,
                filter: "\"ApprovedSupplierId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierOnboardingRequests_NormalizedKraPin",
                table: "SupplierOnboardingRequests",
                column: "NormalizedKraPin",
                unique: true,
                filter: "\"Status\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierOnboardingRequests_RequestNumber",
                table: "SupplierOnboardingRequests",
                column: "RequestNumber",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierOnboardingRequests_ReviewedByUserId",
                table: "SupplierOnboardingRequests",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierOnboardingRequests_Status",
                table: "SupplierOnboardingRequests",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierOnboardingRequests_SubmittedByUserId",
                table: "SupplierOnboardingRequests",
                column: "SubmittedByUserId");

            migrationBuilder.Sql(
                """
                CREATE OR REPLACE FUNCTION constructionms_guard_supplier_onboarding_mutation()
                RETURNS trigger AS $$
                BEGIN
                    IF TG_OP = 'DELETE' THEN
                        RAISE EXCEPTION 'Supplier onboarding requests cannot be deleted.';
                    END IF;

                    IF OLD."Status" <> 'Pending' THEN
                        RAISE EXCEPTION 'A reviewed supplier onboarding request is immutable.';
                    END IF;

                    IF NEW."RequestNumber" IS DISTINCT FROM OLD."RequestNumber"
                        OR NEW."Name" IS DISTINCT FROM OLD."Name"
                        OR NEW."ContactPerson" IS DISTINCT FROM OLD."ContactPerson"
                        OR NEW."PhoneNumber" IS DISTINCT FROM OLD."PhoneNumber"
                        OR NEW."Email" IS DISTINCT FROM OLD."Email"
                        OR NEW."KraPin" IS DISTINCT FROM OLD."KraPin"
                        OR NEW."MpesaNumber" IS DISTINCT FROM OLD."MpesaNumber"
                        OR NEW."Category" IS DISTINCT FROM OLD."Category"
                        OR NEW."SubmittedByUserId" IS DISTINCT FROM OLD."SubmittedByUserId"
                        OR NEW."SubmittedAt" IS DISTINCT FROM OLD."SubmittedAt" THEN
                        RAISE EXCEPTION 'Supplier proposal fields are immutable; submit a new onboarding request.';
                    END IF;

                    IF NEW."Status" NOT IN ('Approved', 'Rejected') THEN
                        RAISE EXCEPTION 'A supplier review must record one terminal decision.';
                    END IF;

                    RETURN NEW;
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER "TR_SupplierOnboardingRequests_ControlledDecision"
                    BEFORE UPDATE OR DELETE ON "SupplierOnboardingRequests"
                    FOR EACH ROW EXECUTE FUNCTION constructionms_guard_supplier_onboarding_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SupplierOnboardingRequests");

            migrationBuilder.Sql(
                "DROP FUNCTION IF EXISTS constructionms_guard_supplier_onboarding_mutation();");
        }
    }
}
