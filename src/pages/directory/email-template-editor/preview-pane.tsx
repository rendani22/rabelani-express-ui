import { Eye } from 'lucide-react'

/**
 * Renders already-interpolated email HTML in a sandboxed iframe. `sandbox=""`
 * blocks scripts + same-origin access and isolates the email's inline styles
 * from the app's CSS — safer than dangerouslySetInnerHTML.
 */
export function PreviewPane({ subject, html }: { subject: string; html: string }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <Eye className="size-3.5" /> Preview with sample data
      </div>
      <div className="border-b bg-card px-4 py-2 text-sm">
        <span className="text-xs text-muted-foreground">Subject: </span>
        <span className="font-medium">{subject || <span className="text-muted-foreground">(empty)</span>}</span>
      </div>
      <iframe
        title="Email preview"
        sandbox=""
        srcDoc={html}
        className="h-[32rem] w-full bg-white"
      />
    </div>
  )
}
