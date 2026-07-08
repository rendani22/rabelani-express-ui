import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  /** Confirm button label (default "Confirm"). */
  confirmText?: string
  /** Cancel button label (default "Cancel"). */
  cancelText?: string
  /** Red confirm button + warning glyph, for irreversible/destructive actions. */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false))

/**
 * In-app replacement for the native `window.confirm`. Wrap the app once with
 * `ConfirmProvider`, then `const confirm = useConfirm()` and
 * `if (await confirm({ title, description, destructive })) { … }`.
 *
 * Cancel is focused first (never the destructive action), and closing via
 * overlay/Escape resolves to `false`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [pending, setPending] = useState(false)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const settle = useCallback((value: boolean) => {
    setOpen(false)
    setPending(false)
    resolver.current?.(value)
    resolver.current = null
  }, [])

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    setPending(false)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const destructive = options?.destructive ?? false

  return (
    <ConfirmContext value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
        <DialogContent className="sm:max-w-[26rem]">
          <DialogHeader>
            <div className="flex items-start gap-3">
              {destructive && (
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive">
                  <AlertTriangle className="size-[18px]" />
                </span>
              )}
              <div className="flex flex-col gap-1.5">
                <DialogTitle>{options?.title}</DialogTitle>
                {options?.description && (
                  <DialogDescription>{options.description}</DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => settle(false)} disabled={pending}>
              {options?.cancelText ?? 'Cancel'}
            </Button>
            <Button
              size="sm"
              variant={destructive ? 'destructive' : 'default'}
              className={cn(pending && 'pointer-events-none')}
              onClick={() => {
                setPending(true)
                settle(true)
              }}
            >
              {options?.confirmText ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext>
  )
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}
