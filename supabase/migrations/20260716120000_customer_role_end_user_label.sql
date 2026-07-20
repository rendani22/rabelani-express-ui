-- ---------------------------------------------------------------------------
-- Rename the 'runner' portal role to "End user" in user-facing copy.
--
-- Display-name change only. The receiver_role enum value stays 'runner' — RLS
-- policies, the invite edge function and the portal all still key off it. This
-- migration only corrects the permission catalog description, which is rendered
-- verbatim in the access-control UI.
--
-- The 20260714200000 seed is ON CONFLICT DO NOTHING, so it cannot restate this
-- text on an existing database; the UPDATE below covers those, and running
-- after the seed covers fresh ones too.
-- ---------------------------------------------------------------------------

UPDATE public.permissions
SET description = 'Grant a customer portal access as buyer or end user.'
WHERE key = 'customers.invite';
