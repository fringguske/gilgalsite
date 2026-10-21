-- =============================================================================
-- UPGRADE: move waiting supplier applications onto the supplier register.
--
-- Suppliers are now added straight to the register by the Procurement Officer
-- or the CEO, with no approval step, and the screen that listed supplier
-- applications is gone. Run this once in the Supabase SQL Editor so that any
-- application still waiting for approval becomes a supplier. With none waiting
-- it does nothing, and it is safe to run more than once: a company whose KRA PIN
-- is already on the register is skipped.
--
-- The application records themselves are left unchanged, as history.
-- =============================================================================

BEGIN;

SET LOCAL search_path TO public;

INSERT INTO "Suppliers" (
    "Name", "ContactPerson", "PhoneNumber", "Email", "KraPin", "MpesaNumber", "Category",
    "IsBlacklisted", "CreatedAt")
SELECT
    application."Name", application."ContactPerson", application."PhoneNumber", application."Email",
    application."KraPin", application."MpesaNumber", application."Category",
    FALSE, application."SubmittedAt"
FROM "SupplierOnboardingRequests" AS application
WHERE application."Status" = 'Pending'
  AND NOT EXISTS (
      SELECT 1
      FROM "Suppliers" AS supplier
      WHERE supplier."NormalizedKraPin" = application."NormalizedKraPin");

COMMIT;
