import { Construction } from 'lucide-react'
import { PageBody, PageHeader } from '@/components/layout/page-header'

/** Temporary stand-in for pages not yet ported, so the shell is fully navigable. */
export function PlaceholderPage({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <PageBody>
      <PageHeader eyebrow={eyebrow ?? 'Rewrite in progress'} title={title} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Construction className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{title} is being rebuilt</p>
          <p className="text-sm text-muted-foreground">
            This page will be ported next in the React rewrite.
          </p>
        </div>
      </div>
    </PageBody>
  )
}
