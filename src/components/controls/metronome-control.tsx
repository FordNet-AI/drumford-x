import { useState, useRef, useEffect } from 'react'
import { usePlayerStore } from '@/stores/player-store'
import { useCoachStore, type Subdivision } from '@/stores/coach-store'

/** Inline metronome icon — two eighth notes connected by a beam */
function MetronomeIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Metronome body (triangle) */}
      <path d="M5 21L12 3L19 21" />
      {/* Pendulum arm */}
      <line x1="12" y1="9" x2="17" y2="5" />
      {/* Base */}
      <line x1="5" y1="21" x2="19" y2="21" />
      {/* Center mark */}
      <circle cx="12" cy="15" r="1" fill="currentColor" />
    </svg>
  )
}

/** Small chevron to indicate the settings popover */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

const COUNT_IN_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1 bar' },
  { value: 2, label: '2 bars' },
]

const SUBDIVISION_OPTIONS: { value: Subdivision; label: string }[] = [
  { value: 'quarter', label: '1/4' },
  { value: 'eighth', label: '1/8' },
  { value: 'sixteenth', label: '1/16' },
]

/**
 * Metronome control for the transport bar.
 *
 * Inline: the enable toggle + (when enabled) a volume slider — same as before —
 * plus a settings chevron that opens a small dark popover for the Coach-Mode
 * metronome prefs: count-in length, subdivision, and accent-beat-1.
 *
 * The on/off toggle is session state (player store). The customizable prefs
 * (count-in, subdivision, accent, volume) live in the persisted coach store.
 */
export function MetronomeControl() {
  const enabled = usePlayerStore((s) => s.metronomeEnabled)
  const setEnabled = usePlayerStore((s) => s.setMetronomeEnabled)

  // Persisted prefs.
  const volume = useCoachStore((s) => s.metronomeVolume)
  const setVolume = useCoachStore((s) => s.setMetronomeVolume)
  const countInBars = useCoachStore((s) => s.countInBars)
  const setCountInBars = useCoachStore((s) => s.setCountInBars)
  const subdivision = useCoachStore((s) => s.subdivision)
  const setSubdivision = useCoachStore((s) => s.setSubdivision)
  const accentBeat1 = useCoachStore((s) => s.accentBeat1)
  const setAccentBeat1 = useCoachStore((s) => s.setAccentBeat1)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5" title="Metronome click track">
      <button
        onClick={() => setEnabled(!enabled)}
        className={`p-1 rounded transition-colors ${
          enabled
            ? 'text-[#ffcc00] bg-[#ffcc0015] border border-[#ffcc0040]'
            : 'text-[#555] hover:text-[#888] border border-transparent'
        }`}
        title={enabled ? 'Metronome ON — click to disable' : 'Metronome OFF — click to enable'}
      >
        <MetronomeIcon size={14} />
      </button>

      {enabled && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-12 h-1"
          title={`Metronome volume: ${Math.round(volume * 100)}%`}
        />
      )}

      {/* Settings toggle — always available so count-in can be set before play */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-center w-4 h-4 rounded transition-colors ${
          open ? 'text-[#ffcc00]' : 'text-[#555] hover:text-[#888]'
        }`}
        aria-label="Metronome settings"
        aria-expanded={open}
        title="Metronome settings"
      >
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 z-50 w-44 rounded-md border border-[#1a1a2e] bg-[#0d1424] p-3 shadow-lg shadow-black/40"
          role="dialog"
          aria-label="Metronome settings"
        >
          {/* Count-in */}
          <div className="mb-3">
            <span className="block text-[10px] uppercase tracking-wide text-[#666] mb-1">Count-in</span>
            <div className="flex gap-1">
              {COUNT_IN_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setCountInBars(opt.value)}
                  className={`flex-1 rounded px-1 py-1 text-[11px] tabular-nums transition-colors ${
                    countInBars === opt.value
                      ? 'bg-[#ffcc0020] text-[#ffcc00] border border-[#ffcc0040]'
                      : 'text-[#888] border border-[#1a1a2e] hover:border-[#2a2a4a]'
                  }`}
                  title={`Count-in: ${opt.label}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subdivision */}
          <div className="mb-3">
            <span className="block text-[10px] uppercase tracking-wide text-[#666] mb-1">Subdivision</span>
            <div className="flex gap-1">
              {SUBDIVISION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSubdivision(opt.value)}
                  className={`flex-1 rounded px-1 py-1 text-[11px] tabular-nums transition-colors ${
                    subdivision === opt.value
                      ? 'bg-[#ffcc0020] text-[#ffcc00] border border-[#ffcc0040]'
                      : 'text-[#888] border border-[#1a1a2e] hover:border-[#2a2a4a]'
                  }`}
                  title={`Subdivision: ${opt.label} notes`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accent beat 1 */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-[11px] text-[#aaa]">Accent beat 1</span>
            <button
              type="button"
              role="switch"
              aria-checked={accentBeat1}
              onClick={() => setAccentBeat1(!accentBeat1)}
              className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                accentBeat1 ? 'bg-[#ffcc00]' : 'bg-[#2a2a4a]'
              }`}
              title={accentBeat1 ? 'Accent ON — click to disable' : 'Accent OFF — click to enable'}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-[#0d1424] transition-transform ${
                  accentBeat1 ? 'translate-x-3.5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      )}
    </div>
  )
}
