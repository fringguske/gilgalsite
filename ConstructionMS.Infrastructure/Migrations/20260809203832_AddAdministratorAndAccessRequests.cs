using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAdministratorAndAccessRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users");

            migrationBuilder.AddColumn<string>(
                name: "Username",
                table: "Users",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.Sql(
                """
                WITH candidates AS (
                    SELECT "Id",
                           lower(btrim("FullName")) AS candidate,
                           count(*) OVER (PARTITION BY lower(btrim("FullName"))) AS candidate_count
                    FROM "Users"
                )
                UPDATE "Users" AS users
                SET "Username" = CASE
                    WHEN candidates.candidate_count = 1
                         AND candidates.candidate ~ '^[a-z0-9][a-z0-9._-]{2,49}$'
                        THEN candidates.candidate
                    ELSE 'legacy-user-' || users."Id"::text
                END
                FROM candidates
                WHERE candidates."Id" = users."Id";

                ALTER TABLE "Users" ALTER COLUMN "Username" DROP DEFAULT;
                """);

            migrationBuilder.AddColumn<string>(
                name: "NormalizedUsername",
                table: "Users",
                type: "text",
                nullable: true,
                computedColumnSql: "lower(btrim(\"Username\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))",
                stored: true);

            migrationBuilder.CreateTable(
                name: "AccessRequests",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Username = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    PasswordHash = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedByUserId = table.Column<int>(type: "integer", nullable: true),
                    ApprovedUserId = table.Column<int>(type: "integer", nullable: true),
                    DecisionNote = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    NormalizedUsername = table.Column<string>(type: "text", nullable: true, computedColumnSql: "lower(btrim(\"Username\", ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)))", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccessRequests", x => x.Id);
                    table.CheckConstraint("CK_AccessRequests_Status", "\"Status\" IN ('Pending', 'Approved', 'Rejected')");
                    table.CheckConstraint("CK_AccessRequests_Username_Format", "\"Username\" ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}$'");
                    table.ForeignKey(
                        name: "FK_AccessRequests_Users_ApprovedUserId",
                        column: x => x.ApprovedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AccessRequests_Users_ReviewedByUserId",
                        column: x => x.ReviewedByUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Roles",
                columns: new[] { "Id", "CreatedAt", "Description", "RoleName" },
                values: new object[] { 10, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Approves access requests and manages user roles and project scope", "Administrator" });

            migrationBuilder.CreateIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users",
                column: "NormalizedEmail");

            migrationBuilder.CreateIndex(
                name: "IX_Users_NormalizedUsername",
                table: "Users",
                column: "NormalizedUsername",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Users_Username_Format",
                table: "Users",
                sql: "\"Username\" ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{2,49}$'");

            migrationBuilder.CreateIndex(
                name: "IX_AccessRequests_ApprovedUserId",
                table: "AccessRequests",
                column: "ApprovedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AccessRequests_NormalizedUsername",
                table: "AccessRequests",
                column: "NormalizedUsername",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AccessRequests_ReviewedByUserId",
                table: "AccessRequests",
                column: "ReviewedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_AccessRequests_Status_RequestedAt",
                table: "AccessRequests",
                columns: new[] { "Status", "RequestedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AccessRequests");

            migrationBuilder.DropIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_NormalizedUsername",
                table: "Users");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Users_Username_Format",
                table: "Users");

            migrationBuilder.DeleteData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 10);

            migrationBuilder.DropColumn(
                name: "NormalizedUsername",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Username",
                table: "Users");

            migrationBuilder.CreateIndex(
                name: "IX_Users_NormalizedEmail",
                table: "Users",
                column: "NormalizedEmail",
                unique: true);
        }
    }
}
