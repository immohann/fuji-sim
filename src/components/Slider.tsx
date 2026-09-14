import { useId } from 'react'
import type { SliderSpec } from '../state/params'

interface SliderProps {
  spec: SliderSpec
  value: number
  defaultValue: number
  onChange: (value: number) => void
}

export function Slider({ spec, value, defaultValue, onChange }: SliderProps) {
  const id = useId()
  const modified = Math.abs(value - defaultValue) > 1e-6

  return (
    <div className="group">
      <div className="flex items-baseline justify-between gap-2 pb-1">
        <label
          htmlFor={id}
          className="text-[11px] font-medium tracking-wide text-ink-300 uppercase"
        >
          {spec.label}
        </label>
        <button
          type="button"
          // Double-click-to-reset is the convention, but a real button keeps the
          // reset reachable by keyboard and touch too.
          onClick={() => onChange(defaultValue)}
          disabled={!modified}
          title={modified ? `Reset ${spec.label.toLowerCase()}` : undefined}
          // Padding buys a 24px-plus hit area for a control that is only 11px of
          // text, without changing where the number sits.
          className="-my-1 -mr-1.5 cursor-pointer px-1.5 py-1 font-mono text-[11px] tabular-nums text-ink-200 transition-colors enabled:hover:text-accent disabled:cursor-default disabled:text-ink-400"
        >
          {spec.format(value)}
        </button>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(defaultValue)}
      />
    </div>
  )
}
