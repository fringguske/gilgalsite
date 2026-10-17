using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddUsernameChangeAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents",
                sql: "\"EventType\" IN ('UsernameChanged', 'PasswordChanged', 'AdministratorPasswordReset')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents");

            migrationBuilder.AddCheckConstraint(
                name: "CK_SecurityAuditEvents_EventType",
                table: "SecurityAuditEvents",
                sql: "\"EventType\" IN ('PasswordChanged', 'AdministratorPasswordReset')");
        }
    }
}
