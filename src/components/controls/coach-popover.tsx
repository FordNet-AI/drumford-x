import { useState, useRef, useEffect } from 'react'
import { GraduationCap } from 'lucide-react'
import { useCoachStore, type EventCueKey } from '@/stores/coach-store'
import { useCoachRuntime } from '@/stores/coach-runtime'
import { speak } from '@/lib/coach/speech'

/** Per-event cue rows for the popover. Order = display order. */
const EVENT_CUE_ROWS: { key: EventCueKey; label: string }[] = [
  { key: 'cueTempo', label: 'Tempo' },
  { key: 'cueMeter', label: 'Meter' },
  { key: 'cueFill', label: 'Fill' },
  { key: 'cueDoubleKick', label: 'Double-kick' },
  { key: 'cueSection', label: 'Section' },
  { key: 'cueReentry', label: 'Re-entry' },
]

/** Small pill toggle switch — yellow when on, mirrors the metronome control. */
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
        disabled
          ? 'cursor-not-allowed bg-[#1a1a2e]'
          : checked
            ? 'bg-[#ffcc00]'
            : 'bg-[#2a2a4a]'
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
      className={`flex items-center justify-between py-1 ${
        disabled ? 'opacity-40' : 'cursor-pointer'
      }`}
    >
      <span className="text-[11px] text-[#aaa]">{label}</span>
      <Toggle label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </label>
  )
}

/**
 * Coach Mode control for the transport bar's controls cluster.
 *
 * A small "Coach" (graduation-cap) trigger that opens a dark popover above the
 * bar — mirrors MetronomeControl's pattern (outside-click / Escape close,
 * popover anchored `bottom-full right-0`). The panel holds:
 *   - Master Coach toggle, then Voice + Banner toggles (the latter two are
 *     disabled while the master is off).
 *   - The six per-event cue toggles (tempo / meter / fill / double-kick /
 *     section / re-entry).
 *   - A "Test cue" button that fires the voice + banner so you can verify both
 *     work — gated by the master switch and the individual voice/banner toggles.
 *
 * All toggles read/write the persisted coach store; the banner uses the
 * transient coach-runtime store.
 */
export function CoachControl() {
  const coachEnabled = useCoachStore((s) => s.coachEnabled)
  const setCoachEnabled = useCoachStore((s) => s.setCoachEnabled)
  const voiceEnabled = useCoachStore((s) => s.voiceEnabled)
  const setVoiceEnabled = useCoachStore((s) => s.setVoiceEnabled)
  const bannerEnabled = useCoachStore((s) => s.bannerEnabled)
  const setBannerEnabled = useCoachStore((s) => s.setBannerEnabled)
  const eventCues = useCoachStore((s) => s.eventCues)
  const setEventCue = useCoachStore((s) => s.setEventCue)

  const showBanner = useCoachRuntime((s) => s.showBanner)

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

  /**
   * Fire a sample cue so the user can hear the voice + see the banner. Gated by
   * the master switch; voice and banner each honor their own toggle. This is the
   * only way (until Phase D) to exercise the speech + banner plumbing.
   */
  const handleTestCue = () => {
    if (!coachEnabled) return
    if (voiceEnabled) speak('Tempo up, one forty')
    if (bannerEnabled) showBanner('⚡ TEMPO 140', 2500, 'tempo')
  }

  return (
    <div ref={rootRef} className="relative flex items-center" title="Coach Mode">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 transition-colors ${
          coachEnabled
            ? 'border border-[#ffcc0040] bg-[#ffcc0015] text-[#ffcc00]'
            : 'border border-transparent text-[#555] hover:text-[#888]'
        }`}
        aria-label="Coach Mode settings"
        aria-expanded={open}
        title={coachEnabled ? 'Coach Mode ON — settings' : 'Coach Mode OFF — settings'}
      >
        <GraduationCap size={15} />
        <span className="text-[10px] uppercase tracking-wider">Coach</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full right-0 mb-2 z-50 w-52 rounded-md border border-[#1a1a2e] bg-[#0d1424] p-3 shadow-lg shadow-black/40"
          role="dialog"
          aria-label="Coach Mode settings"
        >
          {/* Master + output toggles */}
          <ToggleRow label="Coach" checked={coachEnabled} onChange={setCoachEnabled} />
          <ToggleRow
            label="Voice"
            checked={voiceEnabled}
            onChange={setVoiceEnabled}
            disabled={!coachEnabled}
          />
          <ToggleRow
            label="Banner"
            checked={bannerEnabled}
            onChange={setBannerEnabled}
            disabled={!coachEnabled}
          />

          {/* Per-event cues */}
          <div className="my-2 border-t border-[#1a1a2e]" />
          <span className="block text-[10px] uppercase tracking-wide text-[#666] mb-1">
            Cues
          </span>
          {EVENT_CUE_ROWS.map((row) => (
            <ToggleRow
              key={row.key}
              label={row.label}
              checked={eventCues[row.key]}
              onChange={(on) => setEventCue(row.key, on)}
              disabled={!coachEnabled}
            />
          ))}

          {/* Test cue */}
          <div className="my-2 border-t border-[#1a1a2e]" />
          <button
            type="button"
            onClick={handleTestCue}
            disabled={!coachEnabled}
            className={`w-full rounded px-2 py-1.5 text-[11px] tracking-wide transition-colors ${
              coachEnabled
                ? 'border border-[#00e5ff40] text-[#00e5ff] hover:bg-[#00e5ff15]'
                : 'cursor-not-allowed border border-[#1a1a2e] text-[#555]'
            }`}
            title="Play a sample voice + banner cue to test Coach Mode"
          >
            Test cue
          </button>
        </div>
      )}
    </div>
  )
}
