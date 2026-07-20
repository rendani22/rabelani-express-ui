import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { PreviewPane } from './preview-pane'

const HTML = '<!DOCTYPE html><html><body><h1>Ready for Collection</h1></body></html>'

describe('PreviewPane', () => {
  it('does not mount the iframe until there is content to show', () => {
    render(<PreviewPane subject="Subject" html="" />)
    expect(screen.queryByTitle('Email preview')).toBeNull()
    expect(screen.getByText('Nothing to preview yet.')).toBeTruthy()
  })

  it('mounts the iframe with the real html when content arrives after an empty first render', () => {
    vi.useFakeTimers()
    try {
      // The page renders `html=""` first (doc state before the query resolves),
      // then the template arrives — the sequence that left the frame blank.
      const { rerender } = render(<PreviewPane subject="Subject" html="" />)
      rerender(<PreviewPane subject="Subject" html={HTML} />)
      act(() => void vi.advanceTimersByTime(500))

      const frame = screen.getByTitle('Email preview') as HTMLIFrameElement
      expect(frame.getAttribute('srcdoc')).toBe(HTML)
    } finally {
      vi.useRealTimers()
    }
  })
})
