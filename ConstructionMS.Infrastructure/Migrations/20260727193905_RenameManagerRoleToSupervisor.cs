using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RenameManagerRoleToSupervisor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM "Roles"
                        WHERE "Id" = 2 AND "RoleName" = 'Manager'
                    ) THEN
                        RAISE EXCEPTION 'Role 2 must be Manager before it can be renamed to Supervisor.';
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM "Roles"
                        WHERE "Id" <> 2 AND "RoleName" = 'Supervisor'
                    ) THEN
                        RAISE EXCEPTION 'A separate Supervisor role already exists. Resolve it before applying this migration.';
                    END IF;
                END $$;
                """);

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "Description", "RoleName" },
                values: new object[] { "Coordinates assigned projects and approves work within delegated limits", "Supervisor" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM "Roles"
                        WHERE "Id" = 2 AND "RoleName" = 'Supervisor'
                    ) THEN
                        RAISE EXCEPTION 'Role 2 must be Supervisor before this migration can be rolled back.';
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM "Roles"
                        WHERE "Id" <> 2 AND "RoleName" = 'Manager'
                    ) THEN
                        RAISE EXCEPTION 'A separate Manager role already exists. Resolve it before rolling back this migration.';
                    END IF;
                END $$;
                """);

            migrationBuilder.UpdateData(
                table: "Roles",
                keyColumn: "Id",
                keyValue: 2,
                columns: new[] { "Description", "RoleName" },
                values: new object[] { "Coordinates projects and approves work within delegated limits", "Manager" });
        }
    }
}
