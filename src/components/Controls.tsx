import { useState } from 'react'
import type { FilmSim } from '../sims/simulations'
import type { Params, SliderSpec } from '../state/params'
import { DEFAULT_PARAMS, PRIMARY_SLIDERS, SECONDARY_SLIDERS } from '../state/params'
import { Slider } from './Slider'

interface ControlsProps {
  sim: FilmSim
  params: Params
  onChange: (patch: Partial<Params>) => void
  onReset: () => void
}

export function Controls({ sim, params, onChange, onReset }: ControlsProps) {
  const [adjustOpen, setAdjustOpen] = useState(false)
  const dirty = (Object.keys(DEFAULT_PARAMS) as (keyof Params)[]).some(
    (k) => Math.abs(params[k] - DEFAULT_PARAMS[k]) > 1e-6,
  )

  const render = (spec: SliderSpec) => (
    <Slider
      key={spec.key}
      spec={spec}
      value={params[spec.key]}
      defaultValue={DEFAULT_PARAMS[spec.key]}
      onChange={(v) => onChange({ [spec.key]: v })}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] leading-relaxed text-ink-400">{sim.blurb}</p>

      <div className="flex flex-col gap-3">{PRIMARY_SLIDERS.map(render)}</div>

      <div className="border-t border-ink-800 pt-3">
        <button
          type="button"
          onClick={() => setAdjustOpen((v) => !v)}
          aria-expanded={adjustOpen}
          className="flex w-full items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-300 uppercase transition-colors hover:text-ink-100"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3 w-3 transition-transform ${adjustOpen ? 'rotate-90' : ''}`}
            aria-hidden="true"
          >
            <path
              d="M9 6l6 6-6 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Adjust
        </button>

        {adjustOpen && (
          <div className="flex flex-col gap-3 pt-3">{SECONDARY_SLIDERS.map(render)}</div>
        )}
      </div>

      {dirty && (
        <button
          type="button"
          onClick={onReset}
          className="self-start text-[11px] text-ink-400 underline decoration-ink-600 underline-offset-3 transition-colors hover:text-ink-200"
        >
          Reset all
        </button>
      )}
    </div>
  )
}
