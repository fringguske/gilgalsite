using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ConstructionMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AllowPoSelfApproval : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseOrders_Actors_Distinct",
                table: "PurchaseOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseOrders_CancellationActor",
                table: "PurchaseOrders");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseOrders_Actors_Distinct",
                table: "PurchaseOrders",
                sql: "(\"RejectedByUserId\" IS NULL OR \"RejectedByUserId\" <> \"CreatedByUserId\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseOrders_CancellationActor",
                table: "PurchaseOrders",
                sql: "\"Status\" <> 'Cancelled' OR ((\"ApprovedAt\" IS NOT NULL OR (\"SubmittedAt\" IS NOT NULL AND \"RejectedAt\" IS NULL)) AND \"CancelledByUserId\" <> \"CreatedByUserId\") OR ((\"ApprovedAt\" IS NULL AND (\"SubmittedAt\" IS NULL OR \"RejectedAt\" IS NOT NULL)) AND \"CancelledByUserId\" = \"CreatedByUserId\") OR (\"ApprovedByUserId\" = \"CreatedByUserId\" AND \"CancelledByUserId\" = \"CreatedByUserId\")");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseOrders_Actors_Distinct",
                table: "PurchaseOrders");

            migrationBuilder.DropCheckConstraint(
                name: "CK_PurchaseOrders_CancellationActor",
                table: "PurchaseOrders");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseOrders_Actors_Distinct",
                table: "PurchaseOrders",
                sql: "(\"ApprovedByUserId\" IS NULL OR \"ApprovedByUserId\" <> \"CreatedByUserId\") AND (\"RejectedByUserId\" IS NULL OR \"RejectedByUserId\" <> \"CreatedByUserId\")");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PurchaseOrders_CancellationActor",
                table: "PurchaseOrders",
                sql: "\"Status\" <> 'Cancelled' OR ((\"ApprovedAt\" IS NOT NULL OR (\"SubmittedAt\" IS NOT NULL AND \"RejectedAt\" IS NULL)) AND \"CancelledByUserId\" <> \"CreatedByUserId\") OR ((\"ApprovedAt\" IS NULL AND (\"SubmittedAt\" IS NULL OR \"RejectedAt\" IS NOT NULL)) AND \"CancelledByUserId\" = \"CreatedByUserId\")");
        }
    }
}
