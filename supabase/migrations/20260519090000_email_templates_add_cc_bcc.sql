-- Add cc and bcc columns to email_templates so each template can define
-- recipients to be CC'd / BCC'd when the edge functions send mail.
SET search_path = public;

ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS cc text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS bcc text[] DEFAULT '{}'::text[];

-- No need to touch policies; edge functions use the service role.

