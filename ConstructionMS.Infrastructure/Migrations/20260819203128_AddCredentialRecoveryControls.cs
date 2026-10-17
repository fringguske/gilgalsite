using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCredentialRecoveryControls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CredentialVersion",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateTable(
                name: "SecurityAuditEvents",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EventType = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Source = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TargetUserId = table.Column<int>(type: "integer", nullable: false),
                    ActorUserId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SecurityAuditEvents", x => x.Id);
                    table.CheckConstraint("CK_SecurityAuditEvents_EventType", "\"EventType\" IN ('PasswordChanged', 'AdministratorPasswordReset')");
                    table.CheckConstraint("CK_SecurityAuditEvents_Source", "\"Source\" IN ('SelfService', 'ServerRecovery')");
                    table.ForeignKey(
                        name: "FK_SecurityAuditEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SecurityAuditEvents_Users_TargetUserId",
                        column: x => x.TargetUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_Users_CredentialVersion_Positive",
                table: "Users",
                sql: "\"CredentialVersion\" >= 1");

            migrationBuilder.CreateIndex(
                name: "IX_SecurityAuditEvents_ActorUserId",
                table: "SecurityAuditEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SecurityAuditEvents_TargetUserId_OccurredAt",
                table: "SecurityAuditEvents",
                columns: new[] { "TargetUserId", "OccurredAt" });

            migrationBuilder.Sql(
                """
                CREATE TRIGGER "TR_SecurityAuditEvents_AppendOnly"
                    BEFORE UPDATE OR DELETE ON "SecurityAuditEvents"
                    FOR EACH ROW
                    EXECUTE FUNCTION constructionms_reject_evidence_mutation();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SecurityAuditEvents");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Users_CredentialVersion_Positive",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "CredentialVersion",
                table: "Users");
        }
    }
}
