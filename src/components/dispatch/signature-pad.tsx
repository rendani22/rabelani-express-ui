import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface SignaturePadHandle {
  toDataURL: () => string | null
  clear: () => void
  isEmpty: () => boolean
}

/** Canvas signature capture. Returns a base64 PNG data URL via ref. */
export function SignaturePad({
  ref,
  label,
  className,
}: {
  ref?: React.Ref<SignaturePadHandle>
  label?: string
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const [empty, setEmpty] = useState(true)

  // size the canvas backing store to its CSS box (crisp lines on HiDPI)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#111'
    }
  }, [])

  useImperativeHandle(ref, () => ({
    toDataURL: () => (dirty.current ? canvasRef.current?.toDataURL('image/png') ?? null : null),
    clear: () => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      dirty.current = false
      setEmpty(true)
    },
    isEmpty: () => !dirty.current,
  }))

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent) => {
    drawing.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = pos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    if (!dirty.current) {
      dirty.current = true
      setEmpty(false)
    }
  }
  const end = () => {
    drawing.current = false
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    dirty.current = false
    setEmpty(true)
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between">
        {label && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </span>
        )}
        <Button type="button" variant="ghost" size="xs" onClick={clear} disabled={empty}>
          <Eraser /> Clear
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-32 w-full touch-none rounded-md border bg-white"
      />
    </div>
  )
}
