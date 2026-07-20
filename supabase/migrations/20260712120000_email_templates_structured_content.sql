-- Add the structured-content column for the email-template editor.
--
-- Deliberately nullable and UNSEEDED: every existing template keeps its exact
-- body_html (reference barcode, "automated message" disclaimer, full footer —
-- everything). With content = NULL the editor loads each template through its
-- raw-HTML ("Advanced HTML") view, so nothing is reproduced from scratch and
-- nothing is dropped. body_html stays the single source of truth for the send
-- pipeline and is never overwritten by this migration.
--
-- A future migration can seed `content` per template once each one has been
-- faithfully rebuilt as structured blocks from its real HTML.

alter table public.email_templates
  add column if not exists content jsonb;
