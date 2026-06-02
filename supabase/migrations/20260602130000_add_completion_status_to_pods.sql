-- Migration: add_completion_status_to_pods
-- Adds a column to store whether the POD was recorded as 'Delivered' or 'Collected'
-- This helps in rendering the correct labels on the POD document.

ALTER TABLE public.pods ADD COLUMN IF NOT EXISTS completion_status TEXT;

-- Update existing pods: if status was 'delivered', then 'Delivered', else 'Collected'
DO $$
BEGIN
    UPDATE public.pods p
    SET completion_status = 'Collected'
    FROM public.packages pkg
    WHERE p.package_id = pkg.id
    AND p.completion_status IS NULL;
END $$;

