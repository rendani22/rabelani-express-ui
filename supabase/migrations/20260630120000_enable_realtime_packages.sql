-- Enable Supabase Realtime for the `packages` table so the driver app receives
-- live INSERT/UPDATE/DELETE events (new dispatch notifications, status changes,
-- collections by other drivers) without polling. RLS still applies — clients
-- only receive rows their SELECT policy permits.
--
-- Idempotent: safe to run even if the table is already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'packages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.packages;
  END IF;
END
$$;
