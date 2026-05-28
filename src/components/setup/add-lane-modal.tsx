import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import type { KitLane } from '@/types/kit'
import { useKitStore } from '@/stores/kit-store'
import { DEFAULT_CLASS_TO_LANE } from '@/lib/default-kit'

type Shape = 'drum' | 'cymbal' | 'fullWidth'

interface AddLaneModalProps {
  /** Suggested next ID and label index — passed in so we don't double-compute */
  defaultId: string
  defaultLabel: string
  defaultShortLabel: string
  onClose: () => void
}

/**
 * Modal for creating a new custom lane WITH its instrument mappings in one step.
 *
 * Without this, users had to click "+ Custom Lane" (gets an empty white lane),
 * then dig into Advanced > Instrument Mapping to actually route drums into it.
 * Now they pick name/color/shape AND check which drum classes feed this lane,
 * all in one flow. Hitting "Add Lane" commits both the new lane and the
 * instrument overrides at once.
 */
export function AddLaneModal({ defaultId, defaultLabel, defaultShortLabel, onClose }: AddLaneModalProps) {
  const addLane = useKitStore((s) => s.addLane)
  const setInstrumentOverride = useKitStore((s) => s.setInstrumentOverride)
  const existingLanes = useKitStore((s) => s.kit.lanes)
  const existingOverrides = useKitStore((s) => s.kit.instrumentOverrides)

  const [label, setLabel] = useState(defaultLabel)
  const [shortLabel, setShortLabel] = useState(defaultShortLabel)
  const [color, setColor] = useState('#ffffff')
  const [shape, setShape] = useState<Shape>('drum')
  const [pulseTrigger, setPulseTrigger] = useState(false)
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set())

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Group instrument classes by category for readable picking
  const groupedClasses = useMemo(() => {
    const groups: Record<string, string[]> = {
      'Kick & Snare': [],
      'Hi-hats': [],
      'Toms': [],
      'Crashes & Splash': [],
      'Rides': [],
      'Other': [],
    }
    for (const cls of Object.keys(DEFAULT_CLASS_TO_LANE).sort()) {
      const lower = cls.toLowerCase()
      if (lower.includes('kick') || lower.includes('snare')) groups['Kick & Snare']!.push(cls)
      else if (lower.includes('hihat') || lower.includes('hi_hat')) groups['Hi-hats']!.push(cls)
      else if (lower.includes('tom') || lower.includes('floor')) groups['Toms']!.push(cls)
      else if (lower.includes('crash') || lower.includes('china') || lower.includes('splash')) groups['Crashes & Splash']!.push(cls)
      else if (lower.includes('ride')) groups['Rides']!.push(cls)
      else groups['Other']!.push(cls)
    }
    return groups
  }, [])

  const toggleClass = (cls: string) => {
    setSelectedClasses((prev) => {
      const next = new Set(prev)
      if (next.has(cls)) next.delete(cls)
      else next.add(cls)
      return next
    })
  }

  const handleCreate = () => {
    // Build the lane
    const lane: KitLane = {
      id: defaultId,
      label: label.trim() || defaultLabel,
      shortLabel: (shortLabel.trim() || defaultShortLabel).slice(0, 3),
      color,
      isCymbal: shape === 'cymbal',
      isFullWidth: shape === 'fullWidth',
      enabled: true,
      pulseTrigger,
    }

    // Skip the override loop if the lane wasn't actually added (duplicate id) —
    // otherwise we'd write overrides pointing at a non-existent lane.
    const added = addLane(lane)
    if (!added) {
      console.warn(`[add-lane] Skipped duplicate lane id "${lane.id}"`)
      onClose()
      return
    }

    // Route every selected class to this new lane via overrides
    for (const cls of selectedClasses) {
      setInstrumentOverride(cls, lane.id)
    }

    onClose()
  }

  // Detect classes already mapped to other lanes via overrides — show a hint
  // so the user knows they'll be re-routing existing assignments.
  const overrideConflicts = useMemo(() => {
    const conflicts: Record<string, string> = {}
    for (const cls of selectedClasses) {
      const current = existingOverrides[cls]
      if (current && current !== defaultId) {
        const target = existingLanes.find((l) => l.id === current)
        if (target) conflicts[cls] = target.label
      }
    }
    return conflicts
  }, [selectedClasses, existingOverrides, existingLanes, defaultId])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#0d1424] border border-[#1a1a2e] rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a2e]">
          <h2 className="text-sm font-semibold text-[#ffffffee] tracking-wide">Add Custom Lane</h2>
          <button
            onClick={onClose}
            className="p-1 text-[#555] hover:text-[#aaa] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrolls if too tall */}
        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          {/* Identity row */}
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 cursor-pointer" title="Lane color">
              <span className="text-[10px] text-[#666] tracking-wider">COLOR</span>
              <span className="relative block w-10 h-10 rounded border border-[#222]" style={{ backgroundColor: color }}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </span>
            </label>
            <div className="flex-1">
              <label className="text-[10px] text-[#666] tracking-wider block mb-1">LABEL</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={defaultLabel}
                className="w-full bg-[#050508] border border-[#1a1a2e] rounded px-2 py-1.5 text-sm text-[#ffffffee] focus:outline-none focus:border-[#00e5ff]"
              />
            </div>
            <div className="w-16">
              <label className="text-[10px] text-[#666] tracking-wider block mb-1">SHORT</label>
              <input
                type="text"
                value={shortLabel}
                onChange={(e) => setShortLabel(e.target.value.slice(0, 3))}
                maxLength={3}
                placeholder={defaultShortLabel}
                className="w-full bg-[#050508] border border-[#1a1a2e] rounded px-2 py-1.5 text-sm text-[#aaa] text-center focus:outline-none focus:border-[#00e5ff]"
              />
            </div>
          </div>

          {/* Shape selector */}
          <div>
            <label className="text-[10px] text-[#666] tracking-wider block mb-2">SHAPE</label>
            <div className="grid grid-cols-3 gap-2">
              <ShapeOption
                value="drum"
                current={shape}
                onChange={setShape}
                label="Drum"
                description="Solid pill, narrow column"
              />
              <ShapeOption
                value="cymbal"
                current={shape}
                onChange={setShape}
                label="Cymbal"
                description="Hollow outline, wider"
              />
              <ShapeOption
                value="fullWidth"
                current={shape}
                onChange={setShape}
                label="Full-width"
                description="Horizontal bar, like kick"
              />
            </div>
          </div>

          {/* Pulse toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pulseTrigger}
              onChange={(e) => setPulseTrigger(e.target.checked)}
              className="accent-[#ffcc00]"
            />
            <span className="text-xs text-[#aaa]">Hits on this lane trigger the hit-line pulse</span>
          </label>

          {/* Instrument mapping */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="text-[10px] text-[#666] tracking-wider">MAP DRUMS TO THIS LANE</label>
              <span className="text-[10px] text-[#444]">{selectedClasses.size} selected</span>
            </div>
            <p className="text-[10px] text-[#555] mb-2">
              Pick which Paradiddle instruments feed this lane. Unchecked classes keep their existing mapping. You can change this later in Advanced settings.
            </p>

            <div className="bg-[#050508] border border-[#1a1a2e] rounded p-3 space-y-3">
              {Object.entries(groupedClasses).map(([group, classes]) => (
                <div key={group}>
                  <p className="text-[10px] text-[#666] tracking-wider mb-1">{group.toUpperCase()}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {classes.map((cls) => {
                      const conflict = overrideConflicts[cls]
                      return (
                        <label
                          key={cls}
                          className="flex items-center gap-2 text-[10px] cursor-pointer hover:bg-[#0f0f1a] px-1 py-0.5 rounded"
                          title={conflict ? `Currently routed to ${conflict} — checking will move it here` : ''}
                        >
                          <input
                            type="checkbox"
                            checked={selectedClasses.has(cls)}
                            onChange={() => toggleClass(cls)}
                            className="accent-[#00e5ff]"
                          />
                          <code className="font-mono text-[#aaa] truncate">{cls}</code>
                          {conflict && (
                            <span className="text-[9px] text-[#ff8800]" title={`Currently mapped to ${conflict}`}>↪</span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#1a1a2e]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[#888] hover:text-[#ffffffee] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-1.5 text-xs text-[#00e5ff] bg-[#00e5ff15] border border-[#00e5ff40] hover:bg-[#00e5ff25] rounded transition-colors"
          >
            Add Lane
          </button>
        </div>
      </div>
    </div>
  )
}

function ShapeOption({
  value, current, onChange, label, description,
}: {
  value: Shape
  current: Shape
  onChange: (v: Shape) => void
  label: string
  description: string
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`flex flex-col items-start gap-0.5 p-2 rounded border transition-colors text-left ${
        active
          ? 'border-[#00e5ff40] bg-[#00e5ff10]'
          : 'border-[#1a1a2e] hover:border-[#2a2a4a] bg-[#050508]'
      }`}
    >
      <span className={`text-xs ${active ? 'text-[#00e5ff]' : 'text-[#ddd]'}`}>{label}</span>
      <span className="text-[10px] text-[#555]">{description}</span>
    </button>
  )
}
