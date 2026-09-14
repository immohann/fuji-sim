import { useCallback, useEffect, useRef, useState } from 'react'

interface DropzoneProps {
  onFile: (file: File) => void
  /** Copy shown on the drag-over scrim. */
  overlayLabel: string
  /** Receives a callback that opens the native file picker. */
  children: (openPicker: () => void) => React.ReactNode
}

/**
 * Wraps the app in a drop target and owns the single hidden file input.
 *
 * Paste matters more than it looks: it's the fastest path from a screenshot or
 * a web image to a result, and costs one event listener.
 */
export function Dropzone({ onFile, overlayLabel, children }: DropzoneProps) {
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

  const openPicker = useCallback(() => inputRef.current?.click(), [])

  return (
    <div
      className="relative flex flex-1 flex-col lg:min-h-0"
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        // dragenter/leave fire for every child element, so count depth rather
        // than toggling -- otherwise the scrim flickers as the pointer crosses text.
        depth.current -= 1
        if (depth.current <= 0) {
          depth.current = 0
          setOver(false)
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        depth.current = 0
        setOver(false)
        take(e.dataTransfer?.files)
      }}
    >
      {/* openPicker only touches the input ref when it is invoked from a click,
          which the lint rule can't see through a render prop. */}
      {/* oxlint-disable-next-line react/refs */}
      {children(openPicker)}

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

      {over && (
        <div className="pointer-events-none absolute inset-2 z-40 rounded-lg border-2 border-dashed border-lcd bg-ink-950/75 backdrop-blur-sm">
          <span className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-[0.18em] text-lcd uppercase">
            {overlayLabel}
          </span>
        </div>
      )}
    </div>
  )
}
