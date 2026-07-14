import { supabase } from '@/lib/supabase'
import type { TemplateDoc } from '@/lib/email/blocks'

// ============================================================================
// Types (ported from features/email-templates/email-templates.ts)
// ============================================================================

/** A template variable descriptor embedded in an email template. */
export interface TemplateVariable {
  name: string
  description: string
  kind: 'scalar' | 'list'
}

/** Email template entity from the `email_templates` table. */
export interface EmailTemplate {
  id: string
  key: string
  name: string
  subject: string
  body_html: string
  description?: string | null
  variables?: TemplateVariable[] | null
  cc?: string[] | null
  bcc?: string[] | null
  version?: number | null
  is_active?: boolean | null
  updated_at?: string | null
  /** Structured editor block document; null for legacy/custom templates. */
  content?: TemplateDoc | null
}

/** Columns selected/returned for email templates (matches the Angular component). */
const EMAIL_TEMPLATE_COLUMNS =
  'id, key, name, description, subject, body_html, variables, cc, bcc, version, is_active, updated_at, content'

// ============================================================================
// Reads
// ============================================================================

/**
 * Load all email templates, ordered by name ascending.
 * Ported from `EmailTemplatesComponent.loadTemplates()`.
 */
export async function listEmailTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select(EMAIL_TEMPLATE_COLUMNS)
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as EmailTemplate[]
}

// ============================================================================
// Mutations
// ============================================================================

/** Fields updatable on an email template. `cc`/`bcc` are arrays of email addresses. */
export interface UpdateEmailTemplateDto {
  subject: string
  /** Compiled from `content`; stays the source of truth for the send pipeline. */
  body_html: string
  cc: string[]
  bcc: string[]
  /** Structured block document (source of truth for the editor). */
  content: TemplateDoc | null
}

/**
 * Update an email template's subject, compiled body, structured content, cc and
 * bcc. `body_html` must be `compileBlocks(content)` so the DB stays consistent.
 * Returns the updated row.
 */
export async function updateEmailTemplate(
  id: string,
  { subject, body_html, cc, bcc, content }: UpdateEmailTemplateDto,
): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .update({ subject, body_html, cc, bcc, content })
    .eq('id', id)
    .select(EMAIL_TEMPLATE_COLUMNS)
    .single()

  if (error) throw error
  return data as EmailTemplate
}

/** Send a one-off TEST copy of a rendered email to `to` (admin-only edge fn). */
export async function sendTestEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-test-email', { body: input })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
}
