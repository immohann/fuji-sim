import { useCallback, useEffect, useRef, useState } from 'react'

interface DropzoneProps {
  onFile: (file: File) => void
  /** Rendered as the empty state; when a photo is loaded this is a drop target only. */
  variant: 'empty' | 'overlay'
  children?: React.ReactNode
}

/**
 * Accepts a photo by drop, click, or paste.
 *
 * Paste matters more than it looks: it's the fastest path from a screenshot or a
 * web image to a result, and costs one event listener.
 */
export function Dropzone({ onFile, variant, children }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [over, setOver] = useState(false)
  const depth = useRef(0)

  const take = useCallback(
    (files: FileList | null | undefined) => {
      const file = files?.[0]
      if (file) onFile(file)
    },
    [onFile],
  )

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
        ?.getAsFile()
      if (file) {
        e.preventDefault()
        onFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [onFile])

  // dragenter/leave fire for every child element, so count depth rather than
  // toggling -- otherwise the highlight flickers as the pointer crosses text.
  const handlers = {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      depth.current += 1
      setOver(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault()
      depth.current -= 1
      if (depth.current <= 0) {
        depth.current = 0
        setOver(false)
      }
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setOver(false)
      take(e.dataTransfer?.files)
    },
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        take(e.target.files)
        // Reset so re-picking the same file fires change again.
        e.target.value = ''
      }}
    />
  )

  if (variant === 'overlay') {
    return (
      <div {...handlers} className="relative flex flex-1 flex-col lg:min-h-0">
        {children}
        {input}
        {over && (
          <div className="pointer-events-none absolute inset-2 z-30 rounded-lg border-2 border-dashed border-accent bg-ink-950/70 backdrop-blur-sm">
            <span className="absolute inset-0 flex items-center justify-center text-sm text-ink-100">
              Drop to replace the photo
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div {...handlers} className="flex min-h-[60vh] flex-1 items-center justify-center p-6">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`flex w-full max-w-lg flex-col items-center gap-4 rounded-xl border-2 border-dashed px-8 py-16 text-center transition-colors ${
          over
            ? 'border-accent bg-accent/5'
            : 'border-ink-700 bg-ink-900/40 hover:border-ink-600 hover:bg-ink-900'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-ink-400" aria-hidden="true">
          <path
            d="M4 16.5V7a2 2 0 0 1 2-2h3l1.2-1.8h3.6L15 5h3a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11.8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span className="text-base font-medium text-ink-100">Drop a photo here</span>
        <span className="max-w-xs text-[13px] leading-relaxed text-ink-400">
          or click to choose one, or paste from your clipboard. JPEG, PNG, WebP.
        </span>
        {input}
      </button>
    </div>
  )
}
