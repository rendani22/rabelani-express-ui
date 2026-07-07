-- Customer portal — Phase 1: schema.
-- See docs/superpowers/plans/2026-07-07-customer-portal.md.
--
-- "Customer" == a receiver_profiles row. It gains a company, a role
-- (buyer/runner), and a link to its auth user (set at invite time). Packages
-- gain a real receiver_id FK so scoping is by id, not a free-text email.

-- Companies -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Customer role --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.receiver_role AS ENUM ('buyer', 'runner');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- receiver_profiles = the "customer". role/company/auth are NULL until invited.
ALTER TABLE public.receiver_profiles
  ADD COLUMN IF NOT EXISTS company_id   uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS role         public.receiver_role,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id);

-- One auth user maps to at most one receiver profile.
CREATE UNIQUE INDEX IF NOT EXISTS receiver_profiles_auth_user_id_key
  ON public.receiver_profiles(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS receiver_profiles_company_id_idx
  ON public.receiver_profiles(company_id);

-- Real package -> receiver FK ------------------------------------------------
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS receiver_id uuid REFERENCES public.receiver_profiles(id);
CREATE INDEX IF NOT EXISTS packages_receiver_id_idx ON public.packages(receiver_id);

-- Backfill existing packages by case-insensitive email match. Rows left NULL
-- (incl. historical custom-email packages) stay staff-only until re-linked.
UPDATE public.packages p
SET    receiver_id = rp.id
FROM   public.receiver_profiles rp
WHERE  lower(p.receiver_email) = lower(rp.email)
  AND  p.receiver_id IS NULL;

-- Keep the create flow unchanged: resolve (or auto-create) the receiver from
-- receiver_email on insert. This satisfies decision (c) — a hand-typed custom
-- email auto-creates a receiver so no package is orphaned — and means the
-- create-package edge function needs no change to set receiver_id.
CREATE OR REPLACE FUNCTION public.set_package_receiver()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid uuid;
BEGIN
  IF new.receiver_id IS NULL AND new.receiver_email IS NOT NULL THEN
    SELECT id INTO rid FROM public.receiver_profiles
      WHERE lower(email) = lower(new.receiver_email) LIMIT 1;
    IF rid IS NULL THEN
      INSERT INTO public.receiver_profiles (name, surname, email)
      VALUES (split_part(new.receiver_email, '@', 1), '', lower(new.receiver_email))
      RETURNING id INTO rid;
    END IF;
    new.receiver_id := rid;
  END IF;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS trg_set_package_receiver ON public.packages;
CREATE TRIGGER trg_set_package_receiver
  BEFORE INSERT ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.set_package_receiver();
