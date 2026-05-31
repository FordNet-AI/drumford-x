import { useState, useRef, useEffect } from 'react'
import { GraduationCap, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { useCoachStore, type EventCueKey, type UserCue } from '@/stores/coach-store'
import { useCoachRuntime } from '@/stores/coach-runtime'
import { usePlayerStore } from '@/stores/player-store'
import { speak } from '@/lib/coach/speech'
import { formatDuration } from '@/lib/rlrr-parser'

/** Per-event cue rows for the popover. Order = display order. */
const EVENT_CUE_ROWS: { key: EventCueKey; label: string }[] = [
  { key: 'cueTempo', label: 'Tempo' },
  { key: 'cueMeter', label: 'Meter' },
  { key: 'cueFill', label: 'Fill' },
  { key: 'cueDoubleKick', label: 'Double-kick' },
  { key: 'cueSection', label: 'Section' },
  { key: 'cueReentry', label: 'Re-entry' },
]

/** One-tap cue presets — common drummer trouble-spot reminders. */
const CUE_PRESETS = ['Watch hands', 'Ghost notes', 'Build', 'Loud', 'Loop here'] as const

/** Max length of a user-cue text (keeps banners/speech short). */
const CUE_TEXT_MAX = 40

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
 * One manage-list row for an existing user cue. Reads as `M:SS  text` with edit
 * + delete actions; clicking the time seeks there. In edit mode it swaps to a
 * time (M:SS, parsed leniently) + text input pair with confirm/cancel.
 */
function CueRow({
  cue,
  disabled,
  onSeekTo,
  onSave,
  onDelete,
}: {
  cue: UserCue
  disabled: boolean
  onSeekTo: (time: number) => void
  onSave: (patch: { time?: number; text?: string }) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(cue.text)
  const [timeStr, setTimeStr] = useState(formatDuration(cue.time))

  // Re-seed the draft fields whenever we (re)enter edit mode or the cue changes.
  useEffect(() => {
    if (editing) {
      setText(cue.text)
      setTimeStr(formatDuration(cue.time))
    }
  }, [editing, cue.text, cue.time])

  const commit = () => {
    const trimmed = text.trim().slice(0, CUE_TEXT_MAX)
    const parsed = parseTimeInput(timeStr)
    const patch: { time?: number; text?: string } = {}
    if (trimmed && trimmed !== cue.text) patch.text = trimmed
    if (parsed !== null && Math.abs(parsed - cue.time) > 1e-3) patch.time = parsed
    if (patch.text !== undefined || patch.time !== undefined) onSave(patch)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 py-0.5">
        <input
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          aria-label="Cue time (M:SS)"
          className="w-12 shrink-0 rounded border border-[#2a2a4a] bg-[#050508] px-1 py-0.5 text-[10px] tabular-nums text-[#ffffffcc] focus:border-[#00e5ff] focus:outline-none"
        />
        <input
          value={text}
          maxLength={CUE_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          aria-label="Cue text"
          autoFocus
          className="min-w-0 flex-1 rounded border border-[#2a2a4a] bg-[#050508] px-1 py-0.5 text-[11px] text-[#ffffffcc] focus:border-[#00e5ff] focus:outline-none"
        />
        <button
          type="button"
          onClick={commit}
          aria-label="Save cue"
          title="Save"
          className="shrink-0 rounded p-0.5 text-[#00e5ff] hover:bg-[#00e5ff15]"
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel edit"
          title="Cancel"
          className="shrink-0 rounded p-0.5 text-[#888] hover:bg-[#ffffff10]"
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-1 py-0.5">
      <button
        type="button"
        onClick={() => onSeekTo(cue.time)}
        aria-label={`Seek to ${formatDuration(cue.time)}`}
        title="Jump to this cue"
        className="shrink-0 rounded px-1 py-0.5 text-[10px] tabular-nums text-[#00e5ff] hover:bg-[#00e5ff15]"
      >
        {formatDuration(cue.time)}
      </button>
      <span className="min-w-0 flex-1 truncate text-[11px] text-[#ccc]" title={cue.text}>
        {cue.text}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={disabled}
        aria-label={`Edit cue ${cue.text}`}
        title="Edit"
        className="shrink-0 rounded p-0.5 text-[#888] hover:bg-[#ffffff10] hover:text-[#ccc] disabled:opacity-40"
      >
        <Pencil size={12} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={`Delete cue ${cue.text}`}
        title="Delete"
        className="shrink-0 rounded p-0.5 text-[#888] hover:bg-[#ff555520] hover:text-[#ff7777] disabled:opacity-40"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

/**
 * Parse a cue-time input. Accepts `M:SS`, `MM:SS`, or a plain seconds number
 * (e.g. `42` or `42.5`). Returns clamped-to-0 seconds, or null if unparseable.
 */
function parseTimeInput(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  if (s.includes(':')) {
    const [mPart, sPart] = s.split(':')
    const m = parseInt(mPart ?? '', 10)
    const sec = parseFloat(sPart ?? '')
    if (!Number.isFinite(m) || !Number.isFinite(sec)) return null
    return Math.max(0, m * 60 + sec)
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.max(0, n) : null
}

/** Stable empty array for the per-song cue selector (avoids re-render churn). */
const EMPTY: UserCue[] = []

/**
 * The "Cues" subsection: add a cue at the live playhead (preset chips + a free
 * text input), plus a manage list of the active song's saved cues (seek / edit /
 * delete). All actions are disabled when there's no active song.
 */
function CuesSection({ onSeek }: { onSeek?: (time: number) => void }) {
  const activeSong = usePlayerStore((s) => s.activeSong)
  const songId = activeSong?.id ?? null
  // Subscribed so the "@ M:SS" add hint tracks the playhead while the popover is
  // open (it's only mounted when open, so the per-frame re-render is cheap).
  const currentTime = usePlayerStore((s) => s.currentTime)
  // Subscribe to just this song's cues so the list re-renders on add/edit/delete.
  const cues = useCoachStore((s) => (songId ? s.userCues[songId] ?? EMPTY : EMPTY))
  const addUserCue = useCoachStore((s) => s.addUserCue)
  const updateUserCue = useCoachStore((s) => s.updateUserCue)
  const deleteUserCue = useCoachStore((s) => s.deleteUserCue)

  const [draft, setDraft] = useState('')

  // Capture the LIVE playhead at click time (imperative read — the point is to
  // mark the spot you're sitting on, paused or playing).
  const addAt = (text: string) => {
    const trimmed = text.trim().slice(0, CUE_TEXT_MAX)
    if (!songId || !trimmed) return
    const time = usePlayerStore.getState().currentTime
    addUserCue(songId, time, trimmed)
    setDraft('')
  }

  /** Seek the store AND notify the transport (restarts audio if playing). */
  const seekTo = (time: number) => {
    usePlayerStore.getState().seek(time)
    onSeek?.(time)
  }

  if (!songId) {
    return (
      <>
        <div className="my-2 border-t border-[#1a1a2e]" />
        <span className="block text-[10px] uppercase tracking-wide text-[#666] mb-1">
          My cues
        </span>
        <p className="py-1 text-[10px] italic text-[#555]">Load a chart to add cues.</p>
      </>
    )
  }

  return (
    <>
      <div className="my-2 border-t border-[#1a1a2e]" />
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#666]">My cues</span>
        <span className="text-[10px] tabular-nums text-[#555]" title="A new cue lands here">
          @ {formatDuration(currentTime)}
        </span>
      </div>

      {/* Add row: free text + an "Add at playhead" button. */}
      <div className="flex items-center gap-1">
        <input
          value={draft}
          maxLength={CUE_TEXT_MAX}
          placeholder="Note for this spot…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addAt(draft)
          }}
          aria-label="New cue text"
          className="min-w-0 flex-1 rounded border border-[#2a2a4a] bg-[#050508] px-1.5 py-1 text-[11px] text-[#ffffffcc] placeholder:text-[#555] focus:border-[#00e5ff] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => addAt(draft)}
          disabled={!draft.trim()}
          aria-label="Add cue at playhead"
          title="Add a cue at the current playhead"
          className={`flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-[10px] transition-colors ${
            draft.trim()
              ? 'border border-[#ffcc0040] text-[#ffcc00] hover:bg-[#ffcc0015]'
              : 'cursor-not-allowed border border-[#1a1a2e] text-[#555]'
          }`}
        >
          <Plus size={12} /> Add
        </button>
      </div>

      {/* Preset chips — one tap captures the playhead with that label. */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {CUE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => addAt(p)}
            title={`Add "${p}" at the current playhead`}
            className="rounded-full border border-[#2a2a4a] px-2 py-0.5 text-[10px] text-[#aaa] transition-colors hover:border-[#ffcc0060] hover:text-[#ffcc00]"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Manage list — sorted by time (the store keeps it sorted). */}
      {cues.length > 0 ? (
        <div className="mt-2 max-h-40 overflow-y-auto pr-0.5">
          {cues.map((cue) => (
            <CueRow
              key={cue.id}
              cue={cue}
              disabled={false}
              onSeekTo={seekTo}
              onSave={(patch) => updateUserCue(songId, cue.id, patch)}
              onDelete={() => deleteUserCue(songId, cue.id)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] italic text-[#555]">
          No cues yet — mark a spot above.
        </p>
      )}
    </>
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
 *   - A "My cues" subsection to add a cue at the playhead (presets + free text)
 *     and manage (seek / edit / delete) the active song's saved cues.
 *
 * All toggles read/write the persisted coach store; the banner uses the
 * transient coach-runtime store. `onSeek` (threaded from the transport) lets a
 * cue's time-click restart audio at that point when playing.
 */
export function CoachControl({ onSeek }: { onSeek?: (time: number) => void } = {}) {
  const coachEnabled = useCoachStore((s) => s.coachEnabled)
  const setCoachEnabled = useCoachStore((s) => s.setCoachEnabled)
  const voiceEnabled = useCoachStore((s) => s.voiceEnabled)
  const setVoiceEnabled = useCoachStore((s) => s.setVoiceEnabled)
  const bannerEnabled = useCoachStore((s) => s.bannerEnabled)
  const setBannerEnabled = useCoachStore((s) => s.setBannerEnabled)
  const proTipEnabled = useCoachStore((s) => s.proTipEnabled)
  const setProTipEnabled = useCoachStore((s) => s.setProTipEnabled)
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
          <ToggleRow
            label="Pro tip"
            checked={proTipEnabled}
            onChange={setProTipEnabled}
            disabled={!coachEnabled}
          />

          {/* Per-event (auto-detected) cues */}
          <div className="my-2 border-t border-[#1a1a2e]" />
          <span className="block text-[10px] uppercase tracking-wide text-[#666] mb-1">
            Event cues
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

          {/* User-added cues — add at the playhead + manage the song's list. */}
          <CuesSection onSeek={onSeek} />
        </div>
      )}
    </div>
  )
}
