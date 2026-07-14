import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'

/**
 * Renders already-interpolated email HTML in a sandboxed iframe. `sandbox=""`
 * blocks scripts + same-origin access and isolates the email's inline styles
 * from the app's CSS — safer than dangerouslySetInnerHTML.
 *
 * Changing `srcdoc` re-navigates the frame's about:srcdoc document, and an
 * update that lands while a previous load is still in flight can be dropped,
 * leaving the frame blank. Two rules keep that from happening: the iframe is
 * only mounted once there is content (so its first srcdoc is the real one,
 * set at mount rather than as a navigation), and updates are settled before
 * being handed over, so typing doesn't re-navigate on every keystroke.
 */
const SETTLE_MS = 200

export function PreviewPane({ subject, html }: { subject: string; html: string }) {
  const [settled, setSettled] = useState(html)

  useEffect(() => {
    const t = setTimeout(() => setSettled(html), SETTLE_MS)
    return () => clearTimeout(t)
  }, [html])

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <Eye className="size-3.5" /> Preview with sample data
      </div>
      <div className="border-b bg-card px-4 py-2 text-sm">
        <span className="text-xs text-muted-foreground">Subject: </span>
        <span className="font-medium">{subject || <span className="text-muted-foreground">(empty)</span>}</span>
      </div>
      {settled.trim() ? (
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={settled}
          className="h-[32rem] w-full bg-white"
        />
      ) : (
        <div className="flex h-[32rem] w-full items-center justify-center bg-white text-sm text-muted-foreground">
          Nothing to preview yet.
        </div>
      )}
    </div>
  )
}
