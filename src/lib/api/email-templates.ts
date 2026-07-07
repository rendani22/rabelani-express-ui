import { supabase } from '@/lib/supabase'

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
}

/** Columns selected/returned for email templates (matches the Angular component). */
const EMAIL_TEMPLATE_COLUMNS =
  'id, key, name, description, subject, body_html, variables, cc, bcc, version, is_active, updated_at'

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
  body_html: string
  cc: string[]
  bcc: string[]
}

/**
 * Update an email template's subject, body, cc and bcc. Ported from
 * `EmailTemplatesComponent.saveTemplate()`. Returns the updated row.
 */
export async function updateEmailTemplate(
  id: string,
  { subject, body_html, cc, bcc }: UpdateEmailTemplateDto,
): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .update({ subject, body_html, cc, bcc })
    .eq('id', id)
    .select(EMAIL_TEMPLATE_COLUMNS)
    .single()

  if (error) throw error
  return data as EmailTemplate
}
