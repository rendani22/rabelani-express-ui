import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Loader2, Mail, Pencil, Plus, RefreshCw, RotateCcw, Save, Send } from 'lucide-react'
import { listEmailTemplates, sendTestEmail, updateEmailTemplate, type EmailTemplate } from '@/lib/api/email-templates'
import { isCurrentUserAdmin } from '@/lib/api/staff'
import { useAuth } from '@/lib/auth'
import { reportError } from '@/lib/logger'
import {
  type Block,
  type BlockKind,
  type TemplateDoc,
  BLOCK_LABELS,
  docFromRawHtml,
  isKnownTemplateKey,
  isRawHtmlDoc,
  isTemplateDoc,
  makeBlock,
} from '@/lib/email/blocks'
import { compileBlocks } from '@/lib/email/compile'
import { renderTemplate } from '@/lib/email/render'
import { SAMPLE_DATA, VARIABLE_CATALOG, type CatalogEntry } from '@/lib/email/catalog'
import { SEED_CONTENT } from '@/lib/email/seed-content'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BannerEditor, BlockEditor } from './email-template-editor/block-editor'
import { TokenField } from './email-template-editor/token-field'
import { PreviewPane } from './email-template-editor/preview-pane'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const invalidEmails = (csv: string) =>
  csv.split(',').map((s) => s.trim()).filter(Boolean).filter((e) => !EMAIL_RE.test(e))

const ADD_ORDER: BlockKind[] = ['paragraph', 'heading', 'note', 'reference_strip', 'button', 'items_table', 'divider', 'html']

/** Parse a template row's `content` into a doc, falling back to its raw HTML. */
function docFor(t: EmailTemplate): TemplateDoc {
  if (t.content && isTemplateDoc(t.content)) return t.content
  return docFromRawHtml(t.body_html)
}

export function EmailTemplatesPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'preview' | 'edit'>('preview')
  const [subject, setSubject] = useState('')
  const [doc, setDoc] = useState<TemplateDoc>(() => docFromRawHtml(''))
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')

  const templates = useQuery({ queryKey: ['email-templates'], queryFn: listEmailTemplates })
  const admin = useQuery({ queryKey: ['is-admin'], queryFn: isCurrentUserAdmin })

  const rows = templates.data ?? []
  const selected = useMemo(() => rows.find((t) => t.id === selectedId) ?? rows[0] ?? null, [rows, selectedId])

  // Reset edit state whenever the selection changes / list loads.
  useEffect(() => {
    if (selected) {
      setSubject(selected.subject)
      setDoc(docFor(selected))
      setCc(selected.cc?.join(', ') ?? '')
      setBcc(selected.bcc?.join(', ') ?? '')
      setMode('preview')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const catalog: CatalogEntry[] = useMemo(
    () => (selected && isKnownTemplateKey(selected.key) ? VARIABLE_CATALOG[selected.key] : []),
    [selected?.key],
  )
  const sample = useMemo(
    () => (selected && isKnownTemplateKey(selected.key) ? SAMPLE_DATA[selected.key] : {}),
    [selected?.key],
  )

  // Live compile + render, matching what the send pipeline produces.
  const compiledBody = useMemo(() => compileBlocks(doc), [doc])
  const previewHtml = useMemo(() => renderTemplate(compiledBody, sample), [compiledBody, sample])
  const previewSubject = useMemo(() => renderTemplate(subject, sample), [subject, sample])

  const rawDoc = isRawHtmlDoc(doc)

  const save = useMutation({
    mutationFn: () =>
      updateEmailTemplate(selected!.id, {
        subject,
        body_html: compiledBody,
        cc: cc.split(',').map((s) => s.trim()).filter(Boolean),
        bcc: bcc.split(',').map((s) => s.trim()).filter(Boolean),
        content: doc,
      }),
    onSuccess: () => {
      toast.success('Template saved.')
      qc.invalidateQueries({ queryKey: ['email-templates'] })
      setMode('preview')
    },
    onError: (e) => toast.error(reportError(e, 'Could not save the template.', { op: 'emailTemplates.save' })),
  })

  const test = useMutation({
    mutationFn: () => sendTestEmail({ to: user?.email ?? '', subject: previewSubject, html: previewHtml }),
    onSuccess: () => toast.success(`Test email sent to ${user?.email}.`),
    onError: (e) => toast.error(reportError(e, 'Could not send the test email.', { op: 'emailTemplates.test' })),
  })

  const canEdit = admin.data === true
  const badEmails = invalidEmails(cc).length > 0 || invalidEmails(bcc).length > 0

  // ---- block operations ----
  const setBlocks = (blocks: Block[]) => setDoc((d) => ({ ...d, blocks }))
  const updateBlock = (i: number, b: Block) => setBlocks(doc.blocks.map((x, idx) => (idx === i ? b : x)))
  const removeBlock = (i: number) => setBlocks(doc.blocks.filter((_, idx) => idx !== i))
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= doc.blocks.length) return
    const next = [...doc.blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    setBlocks(next)
  }
  const addBlock = (kind: BlockKind) => setBlocks([...doc.blocks, makeBlock(kind)])
  const resetToDefault = () => {
    if (selected && isKnownTemplateKey(selected.key)) setDoc(structuredClone(SEED_CONTENT[selected.key]))
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Email templates"
        description="Edit the transactional emails customers receive — no code required."
        actions={
          <Button variant="outline" size="sm" onClick={() => templates.refetch()} disabled={templates.isFetching}>
            <RefreshCw className={templates.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        {/* list */}
        <aside className="flex max-h-[calc(100svh-14rem)] flex-col overflow-hidden rounded-lg border bg-card lg:sticky lg:top-4 lg:self-start">
          <div className="border-b px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Templates</span>
          </div>
          <ul className="flex-1 divide-y overflow-y-auto">
            {templates.isLoading
              ? Array.from({ length: 5 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-8 w-full" /></li>)
              : rows.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedId(t.id)}
                      className={cn('flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors', selected?.id === t.id ? 'bg-accent' : 'hover:bg-accent/50')}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Mail className={cn('size-3.5', selected?.id === t.id ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="truncate">{t.name}</span>
                      </span>
                      <span className="mono truncate pl-5 text-[10px] text-muted-foreground">{t.key}</span>
                    </button>
                  </li>
                ))}
          </ul>
        </aside>

        {/* detail */}
        {selected ? (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-5 py-3">
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
                      <Button variant="ghost" size="sm" onClick={() => { setMode('preview'); setDoc(docFor(selected)); setSubject(selected.subject) }}>Cancel</Button>
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

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {/* editor / details column */}
              <div className="flex flex-col gap-4">
                {mode === 'edit' ? (
                  <>
                    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                      <TokenField label="Subject line" value={subject} onChange={setSubject} catalog={catalog} />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs">CC <span className="font-normal text-muted-foreground">(comma-separated)</span></Label>
                          <Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 text-sm" />
                          {invalidEmails(cc).length > 0 && <p className="text-xs text-destructive">Invalid: {invalidEmails(cc).join(', ')}</p>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label className="text-xs">BCC <span className="font-normal text-muted-foreground">(comma-separated)</span></Label>
                          <Input value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-8 text-sm" />
                          {invalidEmails(bcc).length > 0 && <p className="text-xs text-destructive">Invalid: {invalidEmails(bcc).join(', ')}</p>}
                        </div>
                      </div>
                    </div>

                    {rawDoc ? (
                      <div className="flex flex-col gap-3">
                        <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                          Edit this email&apos;s HTML directly. The live preview on the right updates as you type.
                        </div>
                        <BlockEditor
                          block={doc.blocks[0]}
                          catalog={catalog}
                          onChange={(b) => updateBlock(0, b)}
                          onMoveUp={() => {}}
                          onMoveDown={() => {}}
                          onRemove={() => {}}
                          isFirst
                          isLast
                        />
                      </div>
                    ) : (
                      <>
                        <BannerEditor banner={doc.banner} catalog={catalog} onChange={(banner) => setDoc((d) => ({ ...d, banner }))} />
                        <div className="flex flex-col gap-3">
                          {doc.blocks.map((b, i) => (
                            <BlockEditor
                              key={b.id}
                              block={b}
                              catalog={catalog}
                              onChange={(nb) => updateBlock(i, nb)}
                              onMoveUp={() => moveBlock(i, -1)}
                              onMoveDown={() => moveBlock(i, 1)}
                              onRemove={() => removeBlock(i)}
                              isFirst={i === 0}
                              isLast={i === doc.blocks.length - 1}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm"><Plus className="size-4" /> Add block</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {ADD_ORDER.map((k) => (
                                <DropdownMenuItem key={k} onSelect={() => addBlock(k)}>{BLOCK_LABELS[k]}</DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {selected && isKnownTemplateKey(selected.key) && (
                            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={resetToDefault}><RotateCcw className="size-4" /> Reset to default</Button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Subject</p>
                      <p className="mt-0.5 text-sm">{previewSubject}</p>
                    </div>
                    {(selected.cc?.length || selected.bcc?.length) ? (
                      <div className="text-sm">
                        <p className="text-xs font-medium text-muted-foreground">Recipients</p>
                        {selected.cc?.length ? <p className="truncate"><span className="font-semibold">CC:</span> <span className="mono text-xs">{selected.cc.join(', ')}</span></p> : null}
                        {selected.bcc?.length ? <p className="truncate"><span className="font-semibold">BCC:</span> <span className="mono text-xs">{selected.bcc.join(', ')}</span></p> : null}
                      </div>
                    ) : null}
                    {canEdit && (
                      <div className="flex flex-wrap gap-2 border-t pt-3">
                        <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending || !user?.email}>
                          {test.isPending ? <Loader2 className="animate-spin" /> : <Send className="size-4" />} Send test to my email
                        </Button>
                        {user?.email && <span className="self-center text-xs text-muted-foreground">{user.email}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* live preview column */}
              <div className="xl:sticky xl:top-4 xl:self-start">
                <PreviewPane subject={previewSubject} html={previewHtml} />
                {mode === 'edit' && canEdit && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => test.mutate()} disabled={test.isPending || !user?.email}>
                    {test.isPending ? <Loader2 className="animate-spin" /> : <Send className="size-4" />} Send test to my email
                  </Button>
                )}
              </div>
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
