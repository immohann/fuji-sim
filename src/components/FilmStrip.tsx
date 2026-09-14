import type { SimId } from '../sims/simulations'
import { SIMULATIONS } from '../sims/simulations'
import type { Thumbnails } from '../state/useThumbnails'

interface FilmStripProps {
  selected: SimId
  thumbnails: Thumbnails
  onSelect: (id: SimId) => void
}

export function FilmStrip({ selected, thumbnails, onSelect }: FilmStripProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Film simulation"
      className="flex shrink-0 justify-start gap-2 overflow-x-auto px-0.5 pb-1 sm:justify-center"
    >
      {SIMULATIONS.map((sim) => {
        const active = sim.id === selected
        const thumb = thumbnails[sim.id]
        return (
          <button
            key={sim.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={sim.blurb}
            onClick={() => onSelect(sim.id)}
            className={`group flex w-[3.9rem] shrink-0 flex-col gap-1.5 rounded-md p-1 text-center transition-colors sm:w-[4.75rem] ${
              active ? 'bg-ink-800' : 'hover:bg-ink-850'
            }`}
          >
            <span
              className={`block aspect-square w-full overflow-hidden rounded bg-ink-800 ring-1 transition-all ${
                active ? 'ring-2 ring-accent' : 'ring-ink-700 group-hover:ring-ink-600'
              }`}
            >
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              )}
            </span>
            <span
              className={`text-[10px] leading-tight font-medium tracking-wide ${
                active ? 'text-ink-100' : 'text-ink-300'
              }`}
            >
              {sim.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}
