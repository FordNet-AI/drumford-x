import { useState, useRef, useEffect } from 'react'
import { Repeat, Minus, Plus } from 'lucide-react'
import { usePlayerStore } from '@/stores/player-store'
import { useDrillStore } from '@/stores/drill-store'
import { formatDuration } from '@/lib/rlrr-parser'

/**
 * Small pill toggle — cyan when on (mirrors the Coach/metronome toggle, recolored
 * to Drill's cyan so the practice-loop UI reads distinctly from Coach's yellow).
 */
function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
        disabled ? 'cursor-not-allowed bg-[#1a1a2e]' : checked ? 'bg-[#00e5ff]' : 'bg-[#2a2a4a]'
      }`}
      title={checked ? `${label} ON — click to disable` : `${label} OFF — click to enable`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${
          disabled ? 'bg-[#333]' : 'bg-[#0d1424]'
        } ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

/** A labeled toggle row. */
function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center justify-between py-1 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
    >
      <span className="text-[11px] text-[#aaa]">{label}</span>
      <Toggle label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  )
}

/**
 * A compact −/value%/+ stepper for a ramp percentage. Steppers (vs a typed
 * number field) avoid the controlled-input clamp fight and are finger-friendly
 * on the tablet. The store clamps the result into range.
 */
function PctStepper({
  label,
  value,
  delta,
  onChange,
  disabled,
}: {
  label: string
  value: number
  delta: number
  onChange: (next: number) => void
  disabled: boolean
}) {
  return (
    <div className={`flex flex-col items-center gap-0.5 ${disabled ? 'opacity-40' : ''}`}>
      <span className="text-[9px] uppercase tracking-wide text-[#666]">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(value - delta)}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
          className="rounded p-0.5 text-[#888] hover:bg-[#ffffff10] hover:text-[#ccc] disabled:cursor-not-allowed"
        >
          <Minus size={11} />
        </button>
        <span className="w-9 text-center text-[11px] tabular-nums text-[#ddd]">{value}%</span>
        <button
          type="button"
          onClick={() => onChange(value + delta)}
          disabled={disabled}
          aria-label={`Increase ${label}`}
          className="rounded p-0.5 text-[#888] hover:bg-[#ffffff10] hover:text-[#ccc] disabled:cursor-not-allowed"
        >
          <Plus size={11} />
        </button>
      </div>
    </div>
  )
}

/**
 * Drill Mode control for the transport bar.
 *
 * A "Drill" (repeat) trigger that opens a popover to bracket a practice loop
 * and ramp its tempo:
 *   - LOOP: Set A / Set B capture the live playhead; Clear wipes them; the Loop
 *     toggle (enabled once both are set) arms the A↔B loop. The actual wrap is
 *     driven by use-drill-loop (wired in HighwayView).
 *   - RAMP: a toggle + Start/Step/Target steppers (% of full tempo). With ramp
 *     on, an armed loop starts at Start% and climbs Step% per pass to Target%.
 *
 * All state lives in the session-only drill store; the trigger glows cyan while
 * a loop is armed so it's obvious at a glance.
 */
export function DrillControl() {
  const activeSong = usePlayerStore((s) => s.activeSong)
  // Subscribed so the "@ M:SS" hint + Set-B gating track the playhead live while
  // the popover is open (it's only mounted when open, so the churn is cheap).
  const currentTime = usePlayerStore((s) => s.currentTime)

  const loopStart = useDrillStore((s) => s.loopStart)
  const loopEnd = useDrillStore((s) => s.loopEnd)
  const loopEnabled = useDrillStore((s) => s.loopEnabled)
  const rampEnabled = useDrillStore((s) => s.rampEnabled)
  const rampStartPct = useDrillStore((s) => s.rampStartPct)
  const rampStepPct = useDrillStore((s) => s.rampStepPct)
  const rampTargetPct = useDrillStore((s) => s.rampTargetPct)
  const liveRampPct = useDrillStore((s) => s.liveRampPct)

  const setLoopStart = useDrillStore((s) => s.setLoopStart)
  const setLoopEnd = useDrillStore((s) => s.setLoopEnd)
  const clearLoop = useDrillStore((s) => s.clearLoop)
  const setLoopEnabled = useDrillStore((s) => s.setLoopEnabled)
  const setRampEnabled = useDrillStore((s) => s.setRampEnabled)
  const setRampStartPct = useDrillStore((s) => s.setRampStartPct)
  const setRampStepPct = useDrillStore((s) => s.setRampStepPct)
  const setRampTargetPct = useDrillStore((s) => s.setRampTargetPct)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape (same pattern as the other transport popovers).
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
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

  const hasSong = !!activeSong
  const bothSet = loopStart != null && loopEnd != null
  // B is only valid strictly after A.
  const canSetB = hasSong && (loopStart == null || currentTime > loopStart)
  const hasAnyMark = loopStart != null || loopEnd != null

  // Capture the LIVE playhead at click time (read imperatively).
  const setAAtPlayhead = () => setLoopStart(usePlayerStore.getState().currentTime)
  const setBAtPlayhead = () => setLoopEnd(usePlayerStore.getState().currentTime)

  return (
    <div ref={rootRef} className="relative flex items-center" title="Drill — practice loop">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors ${
          loopEnabled
            ? 'border border-[#00e5ff40] bg-[#00e5ff15] text-[#00e5ff]'
            : 'border border-transparent text-[#555] hover:text-[#888]'
        }`}
        aria-label="Drill settings"
        aria-expanded={open}
        title={loopEnabled ? 'Drill loop ON — settings' : 'Drill — practice loop settings'}
      >
        <Repeat size={15} />
        <span className="text-[10px] uppercase tracking-wider">Drill</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 z-50 w-56 rounded-md border border-[#1a1a2e] bg-[#0d1424] p-3 shadow-lg shadow-black/40"
          role="dialog"
          aria-label="Drill settings"
        >
          {/* LOOP */}
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wide text-[#666]">Loop</span>
            <span className="text-[10px] tabular-nums text-[#555]" title="Set A/B land here">
              @ {formatDuration(currentTime)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={setAAtPlayhead}
              disabled={!hasSong}
              className="flex-1 rounded border border-[#2a2a4a] px-2 py-1 text-[11px] text-[#ccc] transition-colors hover:border-[#00e5ff] hover:text-[#00e5ff] disabled:cursor-not-allowed disabled:opacity-40"
              title="Mark the loop start at the playhead"
            >
              Set A
            </button>
            <button
              type="button"
              onClick={setBAtPlayhead}
              disabled={!canSetB}
              className="flex-1 rounded border border-[#2a2a4a] px-2 py-1 text-[11px] text-[#ccc] transition-colors hover:border-[#00e5ff] hover:text-[#00e5ff] disabled:cursor-not-allowed disabled:opacity-40"
              title="Mark the loop end at the playhead (must be after A)"
            >
              Set B
            </button>
            <button
              type="button"
              onClick={clearLoop}
              disabled={!hasAnyMark}
              className="rounded border border-[#2a2a4a] px-2 py-1 text-[11px] text-[#888] transition-colors hover:border-[#ff5555] hover:text-[#ff7777] disabled:cursor-not-allowed disabled:opacity-40"
              title="Clear the loop region"
            >
              Clear
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-[#aaa]">
            <span>A {loopStart != null ? formatDuration(loopStart) : '—'}</span>
            <span>B {loopEnd != null ? formatDuration(loopEnd) : '—'}</span>
          </div>
          <ToggleRow
            label="Loop"
            checked={loopEnabled}
            onChange={setLoopEnabled}
            disabled={!bothSet}
          />

          {/* RAMP */}
          <div className="my-2 border-t border-[#1a1a2e]" />
          <ToggleRow label="Tempo ramp" checked={rampEnabled} onChange={setRampEnabled} />
          <div className="mt-1 flex items-start justify-between gap-1">
            <PctStepper
              label="Start"
              value={rampStartPct}
              delta={5}
              onChange={setRampStartPct}
              disabled={!rampEnabled}
            />
            <PctStepper
              label="Step"
              value={rampStepPct}
              delta={1}
              onChange={setRampStepPct}
              disabled={!rampEnabled}
            />
            <PctStepper
              label="Target"
              value={rampTargetPct}
              delta={5}
              onChange={setRampTargetPct}
              disabled={!rampEnabled}
            />
          </div>
          {loopEnabled && rampEnabled && (
            <div className="mt-1.5 text-center text-[10px] tabular-nums text-[#00e5ff]">
              Now {liveRampPct}%
            </div>
          )}

          <p className="mt-2 text-[9px] italic leading-snug text-[#555]">
            Set A then B at the playhead, turn Loop on. With ramp, the loop starts
            slow and speeds up each pass to your target.
          </p>
        </div>
      )}
    </div>
  )
}
