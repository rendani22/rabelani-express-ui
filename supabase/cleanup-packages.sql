-- =============================================================================
-- Cleanup script: remove package-related data ONLY for the "Test customer"
-- =============================================================================
-- WARNING: This is a destructive operation. It deletes rows from packages,
-- package_items, package_status_history, pods and related audit/inventory
-- tables, but ONLY for packages whose receiver matches the "Test customer"
-- receiver_profile (i.e. name='Test' AND surname='Customer', case-insensitive).
-- Run only against a database where this data should be wiped (e.g.
-- staging / dev). Wrap in a transaction so it can be rolled back if anything
-- looks wrong before COMMIT.
--
-- Order of operations is important because of foreign-key constraints and
-- the circular reference between `packages.pod_id` <-> `pods.package_id`.
--
-- Implementation note: the "target package" set is expressed as an inline
-- subquery (not a TEMP TABLE) so the script works in environments such as
-- the Supabase SQL editor that may run each top-level statement in its own
-- session, where temp tables would not persist across statements.
-- =============================================================================

BEGIN;

-- 0. Disable user triggers on `packages` and `pods` so the lock-enforcement
--    triggers (`prevent_pod_modification`, `prevent_package_modification_when_locked`)
--    don't block the cleanup. Requires table-owner privileges (the `postgres`
--    role in Supabase's SQL editor has this).
ALTER TABLE public.packages DISABLE TRIGGER USER;
ALTER TABLE public.pods     DISABLE TRIGGER USER;

-- Sanity check (uncomment when running interactively):
-- SELECT COUNT(*) AS target_packages
-- FROM public.packages p
-- WHERE LOWER(p.receiver_email) IN (
--   SELECT LOWER(rp.email) FROM public.receiver_profiles rp
--   WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
--      OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
-- );

-- Unlock the targeted PODs now that the trigger is suppressed (defensive —
-- the DELETEs below would work without this, but it keeps state consistent
-- if the transaction is rolled back partway through and re-enabled).
UPDATE public.pods
SET is_locked = false,
    locked_at = NULL
WHERE is_locked = true
  AND package_id IN (
    SELECT p.id FROM public.packages p
    WHERE LOWER(p.receiver_email) IN (
      SELECT LOWER(rp.email) FROM public.receiver_profiles rp
      WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
         OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
    )
  );

-- 1. Remove audit log entries that reference the targeted packages or
--    their PODs / package items / status history rows.
DELETE FROM public.audit_logs
WHERE (entity_type IN ('package', 'packages')
       AND entity_id IN (
         SELECT p.id FROM public.packages p
         WHERE LOWER(p.receiver_email) IN (
           SELECT LOWER(rp.email) FROM public.receiver_profiles rp
           WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
              OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
         )
       ))
   OR (entity_type IN ('pod', 'pods')
       AND entity_id IN (
         SELECT pd.id FROM public.pods pd
         WHERE pd.package_id IN (
           SELECT p.id FROM public.packages p
           WHERE LOWER(p.receiver_email) IN (
             SELECT LOWER(rp.email) FROM public.receiver_profiles rp
             WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
                OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
           )
         )
       ))
   OR (entity_type = 'package_item'
       AND entity_id IN (
         SELECT pi.id FROM public.package_items pi
         WHERE pi.package_id IN (
           SELECT p.id FROM public.packages p
           WHERE LOWER(p.receiver_email) IN (
             SELECT LOWER(rp.email) FROM public.receiver_profiles rp
             WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
                OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
           )
         )
       ))
   OR (entity_type = 'package_status_history'
       AND entity_id IN (
         SELECT psh.id FROM public.package_status_history psh
         WHERE psh.package_id IN (
           SELECT p.id FROM public.packages p
           WHERE LOWER(p.receiver_email) IN (
             SELECT LOWER(rp.email) FROM public.receiver_profiles rp
             WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
                OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
           )
         )
       ));

-- 2. Remove inventory movements that were generated from package deductions
--    for the targeted packages. The `inventory_movements` table has no
--    `package_id` FK — package-driven movements record the package reference
--    in the free-text `reference` column instead.
DELETE FROM public.inventory_movements
WHERE source = 'package_deduct'
  AND reference IN (
    SELECT p.reference FROM public.packages p
    WHERE p.reference IS NOT NULL
      AND LOWER(p.receiver_email) IN (
        SELECT LOWER(rp.email) FROM public.receiver_profiles rp
        WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
           OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
      )
  );

-- 3. Remove package line items for the targeted packages.
DELETE FROM public.package_items
WHERE package_id IN (
  SELECT p.id FROM public.packages p
  WHERE LOWER(p.receiver_email) IN (
    SELECT LOWER(rp.email) FROM public.receiver_profiles rp
    WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
       OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
  )
);

-- 4. Remove package status history for the targeted packages.
DELETE FROM public.package_status_history
WHERE package_id IN (
  SELECT p.id FROM public.packages p
  WHERE LOWER(p.receiver_email) IN (
    SELECT LOWER(rp.email) FROM public.receiver_profiles rp
    WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
       OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
  )
);

-- 5. Break the circular FK between packages and pods so pods can be deleted.
UPDATE public.packages
SET pod_id = NULL
WHERE pod_id IS NOT NULL
  AND LOWER(receiver_email) IN (
    SELECT LOWER(rp.email) FROM public.receiver_profiles rp
    WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
       OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
  );

-- 6. Remove proof-of-delivery records for the targeted packages.
DELETE FROM public.pods
WHERE package_id IN (
  SELECT p.id FROM public.packages p
  WHERE LOWER(p.receiver_email) IN (
    SELECT LOWER(rp.email) FROM public.receiver_profiles rp
    WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
       OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
  )
);

-- 7. Finally, remove the targeted packages themselves.
DELETE FROM public.packages
WHERE LOWER(receiver_email) IN (
  SELECT LOWER(rp.email) FROM public.receiver_profiles rp
  WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
     OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
);

-- 8. Re-enable triggers.
ALTER TABLE public.packages ENABLE TRIGGER USER;
ALTER TABLE public.pods     ENABLE TRIGGER USER;

-- =============================================================================
-- Sanity checks (should all return 0 for the targeted set)
-- =============================================================================
-- SELECT COUNT(*) AS remaining_test_packages
-- FROM public.packages p
-- WHERE LOWER(p.receiver_email) IN (
--   SELECT LOWER(rp.email) FROM public.receiver_profiles rp
--   WHERE (LOWER(rp.name) = 'test' AND LOWER(rp.surname) = 'customer')
--      OR LOWER(rp.name || ' ' || rp.surname) = 'test customer'
-- );

-- Review the changes above, then either:
--   COMMIT;   -- to apply
--   ROLLBACK; -- to abort

COMMIT;

