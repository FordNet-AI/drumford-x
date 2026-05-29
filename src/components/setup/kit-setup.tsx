import { useState } from 'react'
import { ArrowLeft, ChevronUp, ChevronDown, Trash2, Plus, RotateCcw } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'
import { useKitStore } from '@/stores/kit-store'
import { useLibraryStore } from '@/stores/library-store'
import { OPTIONAL_LANE_PRESETS, DEFAULT_CLASS_TO_LANE, PRESET_AUTO_OVERRIDES } from '@/lib/default-kit'
import type { KitLane } from '@/types/kit'
import { AddLaneModal } from './add-lane-modal'

/**
 * Kit Setup screen — lets users customize their drum highway:
 *   - Reorder lanes (left-to-right on highway)
 *   - Change colors, labels, kind (cymbal/drum/full-width)
 *   - Enable/disable lanes
 *   - Add optional lanes (china, splash, hi-hat foot)
 *   - Override individual instrument-class mappings
 *   - Adjust global note thickness
 *
 * Changes save to localStorage immediately. Any active song re-resolves
 * its notes against the new kit on the next render.
 */
export function KitSetup() {
  const setScreen = useUIStore((s) => s.setScreen)
  const kit = useKitStore((s) => s.kit)
  const updateLane = useKitStore((s) => s.updateLane)
  const reorderLanes = useKitStore((s) => s.reorderLanes)
  const addLane = useKitStore((s) => s.addLane)
  const removeLane = useKitStore((s) => s.removeLane)
  const setInstrumentOverride = useKitStore((s) => s.setInstrumentOverride)
  const setNoteThickness = useKitStore((s) => s.setNoteThickness)
  const setGlowIntensity = useKitStore((s) => s.setGlowIntensity)
  const setGridBrightness = useKitStore((s) => s.setGridBrightness)
  const setPulseStrength = useKitStore((s) => s.setPulseStrength)
  const setLookaheadSeconds = useKitStore((s) => s.setLookaheadSeconds)
  const reset = useKitStore((s) => s.reset)

  const songs = useLibraryStore((s) => s.songs)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [addingLane, setAddingLane] = useState<null | { id: string; label: string; shortLabel: string }>(null)

  function moveLane(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= kit.lanes.length) return
    const next = [...kit.lanes]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved!)
    reorderLanes(next)
  }

  // Lane ids already in the kit (so add-preset dropdown can hide them)
  const existingIds = new Set(kit.lanes.map((l) => l.id))
  const availablePresets = OPTIONAL_LANE_PRESETS.filter((p) => !existingIds.has(p.id))

  function openAddCustomLane() {
    // Find a unique id like "custom1", "custom2", etc.
    let n = 1
    while (existingIds.has(`custom${n}`)) n++
    const id = `custom${n}`
    setAddingLane({
      id,
      label: `LANE ${kit.lanes.length + 1}`,
      shortLabel: `L${kit.lanes.length + 1}`,
    })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-6 py-3 border-b border-[#1a1a2e] bg-[#0d1424]">
        <button
          onClick={() => setScreen('library')}
          className="p-1.5 text-[#888] hover:text-[#00e5ff] transition-colors"
          title="Back to library"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg tracking-[3px] font-bold text-[#ffffffee]">KIT SETUP</h1>
          <p className="text-xs text-[#555]">Configure your drum layout once — applies to every song</p>
        </div>
        <button
          onClick={() => {
            if (confirm('Reset all kit settings to defaults?')) reset()
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#888] hover:text-[#ff3a5c] border border-[#1a1a2e] hover:border-[#ff3a5c40] rounded transition-colors"
          title="Reset to factory defaults"
        >
          <RotateCcw size={12} />
          Reset
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Lanes section */}
        <section>
          <h2 className="text-xs tracking-[2px] text-[#888] mb-3">LANES</h2>
          <p className="text-xs text-[#555] mb-4">
            Order top-to-bottom matches left-to-right on the highway. Full-width lanes render as horizontal bars behind the column notes (use for kick).
          </p>

          <div className="space-y-1">
            {kit.lanes.map((lane, idx) => (
              <LaneRow
                key={lane.id}
                lane={lane}
                isFirst={idx === 0}
                isLast={idx === kit.lanes.length - 1}
                onMoveUp={() => moveLane(idx, -1)}
                onMoveDown={() => moveLane(idx, 1)}
                onUpdate={(patch) => updateLane(lane.id, patch)}
                onRemove={() => removeLane(lane.id)}
              />
            ))}
          </div>

          {/* Add lane row */}
          <div className="flex items-center gap-2 mt-3">
            {availablePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  addLane(preset)
                  // Auto-route the instrument classes that "belong to" this preset
                  // so the user immediately sees notes flow into the new lane
                  // instead of staying in their default destinations.
                  const autoMap = PRESET_AUTO_OVERRIDES[preset.id] ?? []
                  for (const cls of autoMap) {
                    setInstrumentOverride(cls, preset.id)
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#888] hover:text-[#00e5ff] border border-[#1a1a2e] hover:border-[#00e5ff40] rounded transition-colors"
                title={`Add ${preset.label} lane and route its drums automatically`}
              >
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: preset.color }} />
                <Plus size={11} />
                {preset.label}
              </button>
            ))}
            <button
              onClick={openAddCustomLane}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#888] hover:text-[#ffffffee] border border-[#1a1a2e] hover:border-[#444] rounded transition-colors"
              title="Add a custom lane and map drums to it"
            >
              <Plus size={11} />
              Custom Lane
            </button>
          </div>
        </section>

        {/* Note style */}
        <section>
          <h2 className="text-xs tracking-[2px] text-[#888] mb-3">NOTE STYLE</h2>
          <div className="bg-[#0d1424] border border-[#1a1a2e] rounded p-4 max-w-md space-y-5">
            {/* Thickness */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#aaa]">Thickness</span>
                <span className="text-xs text-[#00e5ff] tabular-nums">
                  {kit.noteThickness.toFixed(2)}×
                </span>
              </label>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={kit.noteThickness}
                onChange={(e) => setNoteThickness(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-[#444] mt-1">
                <span>Thin</span>
                <span>Default</span>
                <span>Chunky</span>
              </div>
            </div>

            {/* Glow intensity */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#aaa]">Glow</span>
                <span className="text-xs text-[#ff8800] tabular-nums">
                  {kit.glowIntensity.toFixed(2)}×
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.05}
                value={kit.glowIntensity}
                onChange={(e) => setGlowIntensity(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-[#444] mt-1">
                <span>Soft</span>
                <span>Default</span>
                <span>Hard</span>
              </div>
              <p className="text-[10px] text-[#444] mt-1.5">
                Controls accent-note shadows and the soft column background glows.
              </p>
            </div>

            {/* Grid brightness */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#aaa]">Grid brightness</span>
                <span className="text-xs text-[#88ffcc] tabular-nums">
                  {kit.gridBrightness.toFixed(2)}×
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.05}
                value={kit.gridBrightness}
                onChange={(e) => setGridBrightness(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-[#444] mt-1">
                <span>Hidden</span>
                <span>Default</span>
                <span>Bold</span>
              </div>
              <p className="text-[10px] text-[#444] mt-1.5">
                Beat grid lines on the highway. Downbeats render at ~3× the brightness of regular beats. Drop to 0 to hide them entirely.
              </p>
            </div>

            {/* Highway speed / lookahead */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#aaa]">Highway speed</span>
                <span className="text-xs text-[#ff66aa] tabular-nums">
                  {kit.lookaheadSeconds.toFixed(1)}s
                </span>
              </label>
              <input
                type="range"
                min={1.5}
                max={6.0}
                step={0.1}
                value={kit.lookaheadSeconds}
                onChange={(e) => setLookaheadSeconds(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-[#444] mt-1">
                <span>Fast (1.5s)</span>
                <span>Default (3s)</span>
                <span>Slow (6s)</span>
              </div>
              <p className="text-[10px] text-[#444] mt-1.5">
                How far ahead notes are visible before hitting the bar. Lower = faster scroll, less reaction time. Higher = more warning, gentler for learning a new chart.
              </p>
            </div>

            {/* Hit-line pulse strength */}
            <div>
              <label className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#aaa]">Hit-line pulse</span>
                <span className="text-xs text-[#ffcc00] tabular-nums">
                  {kit.pulseStrength.toFixed(2)}×
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.05}
                value={kit.pulseStrength}
                onChange={(e) => setPulseStrength(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-[#444] mt-1">
                <span>Off</span>
                <span>Default</span>
                <span>Punchy</span>
              </div>
              <p className="text-[10px] text-[#444] mt-1.5">
                Flash + bloom on the hit line when triggering notes cross it. Set "Pulse" on each lane below to choose which drums fire it.
              </p>
            </div>
          </div>
        </section>

        {/* Advanced: instrument mapping */}
        <section>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs tracking-[2px] text-[#888] hover:text-[#ffffffee] transition-colors flex items-center gap-1.5"
          >
            <span>ADVANCED — INSTRUMENT MAPPING</span>
            {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showAdvanced && (
            <InstrumentMapping
              songCount={songs.length}
            />
          )}
        </section>
      </div>

      {/* Add custom lane modal */}
      {addingLane && (
        <AddLaneModal
          defaultId={addingLane.id}
          defaultLabel={addingLane.label}
          defaultShortLabel={addingLane.shortLabel}
          onClose={() => setAddingLane(null)}
        />
      )}
    </div>
  )
}

function LaneRow({
  lane,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onRemove,
}: {
  lane: KitLane
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onUpdate: (patch: Partial<KitLane>) => void
  onRemove: () => void
}) {
  return (
    <div
      className={`flex items-center gap-2 p-2 border border-[#1a1a2e] rounded bg-[#0d1424] ${
        !lane.enabled ? 'opacity-50' : ''
      }`}
    >
      {/* Reorder */}
      <div className="flex flex-col">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="text-[#555] hover:text-[#00e5ff] disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="text-[#555] hover:text-[#00e5ff] disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronDown size={12} />
        </button>
      </div>

      {/* Color swatch + picker */}
      <label className="relative cursor-pointer" title="Lane color">
        <span
          className="block w-6 h-6 rounded border border-[#222]"
          style={{ backgroundColor: lane.color }}
        />
        <input
          type="color"
          value={lane.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>

      {/* Labels */}
      <input
        type="text"
        value={lane.label}
        onChange={(e) => onUpdate({ label: e.target.value })}
        className="bg-[#111] border border-[#222] px-2 py-1 text-xs text-[#ffffffee] rounded w-28 focus:outline-none focus:border-[#00e5ff]"
        placeholder="Label"
      />
      <input
        type="text"
        value={lane.shortLabel}
        onChange={(e) => onUpdate({ shortLabel: e.target.value })}
        className="bg-[#111] border border-[#222] px-2 py-1 text-xs text-[#888] rounded w-12 text-center focus:outline-none focus:border-[#00e5ff]"
        placeholder="SH"
        maxLength={3}
      />

      {/* Kind */}
      <label className="flex items-center gap-1 text-xs text-[#888] cursor-pointer ml-2">
        <input
          type="checkbox"
          checked={lane.isCymbal}
          onChange={(e) => onUpdate({ isCymbal: e.target.checked })}
          className="accent-[#00e5ff]"
        />
        Cymbal
      </label>
      <label className="flex items-center gap-1 text-xs text-[#888] cursor-pointer">
        <input
          type="checkbox"
          checked={lane.isFullWidth}
          onChange={(e) => onUpdate({ isFullWidth: e.target.checked })}
          className="accent-[#00e5ff]"
        />
        Full-width
      </label>
      <label
        className="flex items-center gap-1 text-xs text-[#888] cursor-pointer"
        title="Hits on this lane trigger the hit-line pulse"
      >
        <input
          type="checkbox"
          checked={lane.pulseTrigger}
          onChange={(e) => onUpdate({ pulseTrigger: e.target.checked })}
          className="accent-[#ffcc00]"
        />
        Pulse
      </label>

      {/* Enabled toggle */}
      <label className="flex items-center gap-1 text-xs text-[#888] cursor-pointer ml-auto">
        <input
          type="checkbox"
          checked={lane.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
          className="accent-[#00e5ff]"
        />
        Enabled
      </label>

      {/* Remove */}
      <button
        onClick={() => {
          if (confirm(`Remove lane "${lane.label}"? Notes mapped to it will be hidden.`)) onRemove()
        }}
        className="text-[#444] hover:text-[#ff3a5c] transition-colors p-1"
        title="Remove lane"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

/**
 * Per-instrument-class override editor.
 * Shows every known instrument class with a dropdown to pick which lane it maps to.
 */
function InstrumentMapping({ songCount }: { songCount: number }) {
  const kit = useKitStore((s) => s.kit)
  const setInstrumentOverride = useKitStore((s) => s.setInstrumentOverride)

  // Group instruments by category for readability
  const allClasses = Object.keys(DEFAULT_CLASS_TO_LANE).sort()

  return (
    <div className="mt-3 bg-[#0d1424] border border-[#1a1a2e] rounded p-4">
      <p className="text-xs text-[#555] mb-3">
        Override which lane a specific drum maps to. Empty = use default mapping.
        {songCount === 0 && ' Import some songs to see what instruments your library uses.'}
      </p>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 max-h-96 overflow-y-auto">
        {allClasses.map((cls) => {
          const defaultLane = DEFAULT_CLASS_TO_LANE[cls]!
          const override = kit.instrumentOverrides[cls] ?? ''
          const effective = override || defaultLane
          return (
            <div key={cls} className="flex items-center gap-2 py-1">
              <code className="text-[10px] text-[#888] w-32 truncate font-mono">{cls}</code>
              <span className="text-[10px] text-[#444]">→</span>
              <select
                value={effective}
                onChange={(e) => {
                  const val = e.target.value
                  // If user picked the default, clear the override; else set it
                  setInstrumentOverride(cls, val === defaultLane ? null : val)
                }}
                className="bg-[#111] border border-[#222] px-2 py-0.5 text-[10px] text-[#ffffffee] rounded flex-1 focus:outline-none focus:border-[#00e5ff]"
              >
                {kit.lanes.map((lane) => (
                  <option key={lane.id} value={lane.id}>
                    {lane.label}
                  </option>
                ))}
              </select>
              {override && (
                <button
                  onClick={() => setInstrumentOverride(cls, null)}
                  className="text-[10px] text-[#555] hover:text-[#00e5ff]"
                  title="Reset to default"
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
