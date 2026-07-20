-- Align staff role/department support with the Users dialog.
--
-- The Users UI offers Viewer / Manager / Staff roles and a Department field, but
-- the base schema only defined the staff_role enum as
-- (warehouse, driver, admin, collection) and staff_profiles had no `department`
-- column. As a result:
--   * creating a viewer / manager / staff user failed (enum value not present), and
--   * saving a department failed with
--     "Could not find the 'department' column of 'staff_profiles' in the schema cache".
--
-- Both statements are idempotent so this is safe to apply to any environment.

-- 1. Extend the staff_role enum with the roles the Users dialog offers.
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE public.staff_role ADD VALUE IF NOT EXISTS 'viewer';

-- 2. Add the optional department column used by the Users dialog.
ALTER TABLE public.staff_profiles ADD COLUMN IF NOT EXISTS department text;
