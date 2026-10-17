using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddFinanceOfficerRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                table: "Roles",
                columns: new[] { "Id", "CreatedAt", "Description", "RoleName" },
                values: new object[] { 9, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Performs three-way matching and independently authorizes payments", "Finance Officer" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM "Users" WHERE "RoleId" = 9) THEN
                        RAISE EXCEPTION 'Cannot remove Finance Officer role while users are assigned to it.';
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM "Roles"
                        WHERE "Id" = 9 AND "RoleName" <> 'Finance Officer'
                    ) THEN
                        RAISE EXCEPTION 'Cannot remove role 9 because it is no longer the migration-owned Finance Officer role.';
                    END IF;

                    DELETE FROM "Roles"
                    WHERE "Id" = 9;
                END $$;
                """);
        }
    }
}
