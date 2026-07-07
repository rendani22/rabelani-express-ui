import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Code, Eye, Loader2, Mail, Pencil, RefreshCw, Save } from 'lucide-react'
import type { EmailTemplate } from '@/lib/api/email-templates'
import { listEmailTemplates, updateEmailTemplate } from '@/lib/api/email-templates'
import { isCurrentUserAdmin } from '@/lib/api/staff'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

// Sample data for preview interpolation (ported from the Angular preview vars).
const SAMPLE: Record<string, string> = {
  reference: 'PKG-20260504-71E9',
  po_number: 'GG80666810',
  support_email: 'rabelanimm@gmail.com',
  review_form_url: 'https://example.com/review',
  current_year: String(new Date().getFullYear()),
  receiver_name: 'Thabo Mokoena',
  receiver_email: 'thabo.mokoena@gmail.com',
  collection_point: 'Polokwane depot',
}

/** Replace {{ var }} scalar placeholders with sample values for preview. */
function interpolate(text: string): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => SAMPLE[k] ?? `{{${k}}}`)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const invalidEmails = (csv: string) =>
  csv.split(',').map((s) => s.trim()).filter(Boolean).filter((e) => !EMAIL_RE.test(e))

export function EmailTemplatesPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')

  const templates = useQuery({ queryKey: ['email-templates'], queryFn: listEmailTemplates })
  const admin = useQuery({ queryKey: ['is-admin'], queryFn: isCurrentUserAdmin })

  const rows = templates.data ?? []
  const selected = useMemo(
    () => rows.find((t) => t.id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId],
  )

  // reset edit fields whenever the selection changes / list loads
  useEffect(() => {
    if (selected) {
      setSubject(selected.subject)
      setBody(selected.body_html)
      setCc(selected.cc?.join(', ') ?? '')
      setBcc(selected.bcc?.join(', ') ?? '')
      setMode('preview')
    }
  }, [selected?.id])

  const save = useMutation({
    mutationFn: () =>
      updateEmailTemplate(selected!.id, {
        subject,
        body_html: body,
        cc: cc.split(',').map((s) => s.trim()).filter(Boolean),
        bcc: bcc.split(',').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast.success('Template saved.')
      qc.invalidateQueries({ queryKey: ['email-templates'] })
      setMode('preview')
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the template.', { op: 'emailTemplates.save' })),
  })

  const canEdit = admin.data === true
  const badEmails = mode === 'edit' && (invalidEmails(cc).length > 0 || invalidEmails(bcc).length > 0)

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Email templates"
        description="Preview and edit the transactional emails stored in the database."
        actions={
          <Button variant="outline" size="sm" onClick={() => templates.refetch()} disabled={templates.isFetching}>
            <RefreshCw className={templates.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
        {/* list */}
        <aside className="flex max-h-[calc(100svh-16rem)] flex-col overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Templates</span>
          </div>
          <ul className="flex-1 divide-y overflow-y-auto">
            {templates.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="p-3"><Skeleton className="h-8 w-full" /></li>
              ))
            ) : (
              rows.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors',
                      selected?.id === t.id ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Mail className={cn('size-3.5', selected?.id === t.id ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span className="mono truncate pl-5 text-[10px] text-muted-foreground">{t.key}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        {/* detail */}
        {selected ? (
          <section className="flex max-h-[calc(100svh-16rem)] flex-col overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <div className="flex min-w-0 flex-col">
                <h2 className="truncate text-sm font-semibold">{selected.name}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="mono">{selected.key}</span>
                  {selected.version ? ` · v${selected.version}` : ''}
                  {selected.updated_at ? ` · ${formatDateTime(selected.updated_at)}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit ? (
                  mode === 'preview' ? (
                    <Button size="sm" onClick={() => setMode('edit')}><Pencil /> Edit</Button>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setMode('preview')}>Cancel</Button>
                      <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || badEmails}>
                        {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
                      </Button>
                    </>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    <Eye className="size-3.5" /> Read only
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {mode === 'preview' ? (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Subject preview</p>
                    <p className="mt-0.5 text-sm">{interpolate(selected.subject)}</p>
                    <p className="mono mt-1 text-xs text-muted-foreground">Template: {selected.subject}</p>
                  </div>
                  {(selected.cc?.length || selected.bcc?.length) ? (
                    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">Recipients</p>
                      {selected.cc?.length ? <p className="truncate"><span className="font-semibold">CC:</span> <span className="mono text-xs">{selected.cc.join(', ')}</span></p> : null}
                      {selected.bcc?.length ? <p className="truncate"><span className="font-semibold">BCC:</span> <span className="mono text-xs">{selected.bcc.join(', ')}</span></p> : null}
                    </div>
                  ) : null}
                  {selected.variables && selected.variables.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Available variables</p>
                      <div className="flex flex-wrap gap-2">
                        {selected.variables.map((v) => (
                          <span key={v.name} title={v.description} className="mono inline-flex rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                            {'{{'}{v.name}{'}}'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="overflow-hidden rounded-lg border">
                    <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                      <Eye className="size-3.5" /> Preview with sample data
                    </div>
                    <div
                      className="bg-white p-6 text-gray-900"
                      dangerouslySetInnerHTML={{ __html: interpolate(selected.body_html) }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label>Subject line</Label>
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>CC <span className="text-xs font-normal text-muted-foreground">(comma-separated)</span></Label>
                      <Input value={cc} onChange={(e) => setCc(e.target.value)} />
                      {invalidEmails(cc).length > 0 && <p className="text-xs text-destructive">Invalid: {invalidEmails(cc).join(', ')}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>BCC <span className="text-xs font-normal text-muted-foreground">(comma-separated)</span></Label>
                      <Input value={bcc} onChange={(e) => setBcc(e.target.value)} />
                      {invalidEmails(bcc).length > 0 && <p className="text-xs text-destructive">Invalid: {invalidEmails(bcc).join(', ')}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="flex items-center gap-1.5"><Code className="size-3.5" /> HTML body</Label>
                    <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={20} className="mono text-xs" />
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="flex items-center justify-center rounded-lg border bg-card py-20 text-center">
            <div className="flex flex-col items-center gap-2">
              <Mail className="size-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">No template selected</p>
            </div>
          </section>
        )}
      </div>
    </PageBody>
  )
}
