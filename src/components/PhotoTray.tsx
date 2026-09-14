import type { Frame } from '../state/frames'
import { MAX_FRAMES } from '../state/frames'
import { getSim } from '../sims/simulations'

interface PhotoTrayProps {
  frames: Frame[]
  activeId: string | null
  thumbnails: Record<string, string>
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
}

/**
 * The roll of loaded photos.
 *
 * Each tile shows that photo under its own film, because the whole point of
 * holding several at once is being able to tell at a glance which is which and
 * what you've already done to it.
 */
export function PhotoTray({
  frames,
  activeId,
  thumbnails,
  onSelect,
  onRemove,
  onAdd,
}: PhotoTrayProps) {
  const full = frames.length >= MAX_FRAMES

  return (
    // pt-2 gives the remove buttons room to overhang without the scroll
    // container clipping them.
    <div className="flex shrink-0 items-stretch gap-2 overflow-x-auto pt-2 pb-1">
      {frames.map((frame, index) => {
        const active = frame.id === activeId
        return (
          <div key={frame.id} className="group relative shrink-0">
            <button
              type="button"
              onClick={() => onSelect(frame.id)}
              aria-current={active}
              title={`${frame.image.baseName} — ${getSim(frame.sim).name}`}
              className={`flex h-[3.25rem] w-[4.25rem] cursor-pointer items-center justify-center overflow-hidden border bg-ink-900 transition-colors ${
                active ? 'border-lcd' : 'border-ink-700 opacity-65 hover:opacity-100'
              }`}
            >
              {/* The graded thumbnail, not the original: it has to answer
                  "which film did I put on this one?" without a click. */}
              {thumbnails[frame.id] ? (
                <img
                  src={thumbnails[frame.id]}
                  alt={`${frame.image.baseName}, ${getSim(frame.sim).name}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <img
                  src={frame.image.thumbUrl}
                  alt={frame.image.baseName}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              )}
            </button>

            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-0.5 left-1 font-mono text-[9px] ${
                active ? 'text-lcd' : 'text-white/60'
              }`}
              style={{ textShadow: '0 0 3px rgba(0,0,0,.9)' }}
            >
              {String(index + 1).padStart(2, '0')}
            </span>

            {frames.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(frame.id)}
                aria-label={`Remove ${frame.image.baseName}`}
                // Always present for touch, where there is no hover to reveal it.
                // 24px square: these sit at the WCAG minimum and are always
                // visible on touch, where there is no hover to reveal them.
                className="absolute -top-2 -right-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-ink-600 bg-ink-900 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 hover:border-ink-400 hover:text-ink-100"
              >
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={onAdd}
        disabled={full}
        title={full ? `That's the limit of ${MAX_FRAMES} photos` : 'Add more photos'}
        className="flex h-[3.25rem] w-[3.25rem] shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 border border-dashed border-ink-700 text-ink-400 transition-colors hover:border-ink-500 hover:text-ink-200 disabled:cursor-not-allowed disabled:border-ink-800 disabled:text-ink-700"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <span className="font-mono text-[8.5px] tracking-wider uppercase">Add</span>
      </button>
    </div>
  )
}
