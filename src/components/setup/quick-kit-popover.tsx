import { useEffect, useRef, useState } from 'react'
import { Palette, ExternalLink, X } from 'lucide-react'
import { useKitStore } from '@/stores/kit-store'
import { useUIStore } from '@/stores/ui-store'

/**
 * Floating quick-access kit tuner for the gameplay screen.
 *
 * Sits in the bottom-right corner of the highway. Click to open a popover
 * with the most-fiddled controls — lane colors, thickness, glow, grid
 * brightness — so the user can fine-tune mid-song without backing out to
 * the full Kit Setup screen. A "Full Kit Setup" link inside the popover
 * jumps to the full editor for structural changes (reorder, add lanes,
 * instrument mapping).
 */
export function QuickKitPopover() {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const kit = useKitStore((s) => s.kit)
  const updateLane = useKitStore((s) => s.updateLane)
  const setNoteThickness = useKitStore((s) => s.setNoteThickness)
  const setGlowIntensity = useKitStore((s) => s.setGlowIntensity)
  const setGridBrightness = useKitStore((s) => s.setGridBrightness)
  const setPulseStrength = useKitStore((s) => s.setPulseStrength)
  const setLookaheadSeconds = useKitStore((s) => s.setLookaheadSeconds)
  const setScreen = useUIStore((s) => s.setScreen)

  // Close on outside click and on Escape
  useEffect(() => {
    if (!open) return
    function handleDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="absolute bottom-3 right-3 z-30">
      {/* Trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center w-9 h-9 bg-[#0d1424]/80 backdrop-blur-sm border border-[#1a1a2e] hover:border-[#00e5ff] text-[#888] hover:text-[#00e5ff] rounded-md transition-colors shadow-lg"
          title="Quick kit tuner — colors, thickness, glow"
        >
          <Palette size={16} />
        </button>
      )}

      {/* Popover */}
      {open && (
        <div className="w-[320px] bg-[#0d1424]/95 backdrop-blur-md border border-[#1a1a2e] rounded-lg shadow-2xl p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs tracking-[2px] text-[#aaa]">QUICK TUNE</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-[#555] hover:text-[#ffffffee] transition-colors"
              title="Close"
            >
              <X size={14} />
            </button>
          </div>

          {/* Lane colors — compact swatch row */}
          <div className="mb-4">
            <p className="text-[10px] text-[#666] mb-1.5 tracking-wider">LANE COLORS</p>
            <div className="grid grid-cols-2 gap-1.5">
              {kit.lanes.filter((l) => l.enabled).map((lane) => (
                <label
                  key={lane.id}
                  className="flex items-center gap-2 px-2 py-1 bg-[#050508] border border-[#1a1a2e] rounded cursor-pointer hover:border-[#2a2a4a]"
                  title={`${lane.label} color`}
                >
                  <span className="relative w-4 h-4 rounded-sm border border-[#222]" style={{ backgroundColor: lane.color }}>
                    <input
                      type="color"
                      value={lane.color}
                      onChange={(e) => updateLane(lane.id, { color: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </span>
                  <span className="text-[10px] text-[#aaa] tabular-nums truncate">{lane.shortLabel}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <Slider
            label="Thickness"
            value={kit.noteThickness}
            min={0.5}
            max={2.0}
            step={0.05}
            color="#00e5ff"
            onChange={setNoteThickness}
          />
          <Slider
            label="Glow"
            value={kit.glowIntensity}
            min={0}
            max={2.0}
            step={0.05}
            color="#ff8800"
            onChange={setGlowIntensity}
          />
          <Slider
            label="Grid"
            value={kit.gridBrightness}
            min={0}
            max={2.0}
            step={0.05}
            color="#88ffcc"
            onChange={setGridBrightness}
          />
          <Slider
            label="Pulse"
            value={kit.pulseStrength}
            min={0}
            max={2.0}
            step={0.05}
            color="#ffcc00"
            onChange={setPulseStrength}
          />
          <Slider
            label="Speed"
            value={kit.lookaheadSeconds}
            min={1.5}
            max={6.0}
            step={0.1}
            color="#ff66aa"
            onChange={setLookaheadSeconds}
            formatValue={(v) => `${v.toFixed(1)}s`}
          />

          {/* Link to full setup */}
          <button
            onClick={() => {
              setOpen(false)
              setScreen('setup')
            }}
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider text-[#666] hover:text-[#00e5ff] border border-[#1a1a2e] hover:border-[#00e5ff40] rounded transition-colors"
          >
            <ExternalLink size={11} />
            FULL KIT SETUP
          </button>
        </div>
      )}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  color,
  onChange,
  formatValue,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  color: string
  onChange: (v: number) => void
  /** Optional custom formatter for the right-aligned readout. Defaults to e.g. "1.25×". */
  formatValue?: (v: number) => string
}) {
  const display = formatValue ? formatValue(value) : `${value.toFixed(2)}×`
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[#888]">{label}</span>
        <span className="text-[10px] tabular-nums" style={{ color }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1"
      />
    </div>
  )
}
