import { useState, useRef, useEffect } from 'react'
import { usePlayerStore } from '@/stores/player-store'

/**
 * User-adjustable sync offset.
 * Positive = notes delayed (audio plays ahead of notes).
 *
 * Three ways to set it:
 *   - − / + buttons nudge by 5ms
 *   - Click the value to type an exact ms number (any integer in range)
 *   - Click the × to reset to 0
 *
 * Clamped to ±2000ms (±2 seconds) — far beyond any realistic audio
 * pipeline latency, but lets users dial in extreme cases without us
 * second-guessing them.
 */
const MIN_MS = -2000
const MAX_MS = 2000
const NUDGE_MS = 5

export function OffsetControl() {
  const userOffset = usePlayerStore((s) => s.userOffset)
  const setUserOffset = usePlayerStore((s) => s.setUserOffset)

  const offsetMs = Math.round(userOffset * 1000)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // When entering edit mode, seed the draft with the current value and focus
  useEffect(() => {
    if (editing) {
      setDraft(String(offsetMs))
      // Select-all so user can type to replace
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const setMs = (ms: number) => {
    const clamped = Math.max(MIN_MS, Math.min(MAX_MS, ms))
    setUserOffset(clamped / 1000)
  }

  const nudge = (deltaMs: number) => setMs(offsetMs + deltaMs)

  const commitDraft = () => {
    // Allow blank/garbage to mean "keep current value"
    const parsed = parseInt(draft, 10)
    if (!Number.isNaN(parsed)) setMs(parsed)
    setEditing(false)
  }

  const cancelDraft = () => setEditing(false)

  return (
    <div
      className="flex items-center gap-1"
      title="Sync offset — nudge notes earlier or later relative to audio. Click value to type exact ms."
    >
      <button
        onClick={() => nudge(-NUDGE_MS)}
        className="w-5 h-5 flex items-center justify-center text-[10px] text-[#888] bg-[#12121e] border border-[#1a1a2e] rounded hover:border-[#2a2a4a] hover:text-[#00e5ff] transition-colors"
        title={`−${NUDGE_MS}ms`}
      >
        −
      </button>

      {editing ? (
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={draft}
          min={MIN_MS}
          max={MAX_MS}
          step={1}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur() // triggers commit via onBlur
            } else if (e.key === 'Escape') {
              cancelDraft()
            }
          }}
          className="w-[52px] h-5 px-1 text-[10px] tabular-nums text-center bg-[#0d1424] border border-[#00e5ff60] rounded text-[#00e5ff] focus:outline-none focus:border-[#00e5ff] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      ) : (
        <span
          className={`text-[10px] tabular-nums w-[52px] text-center cursor-text rounded border border-transparent hover:border-[#2a2a4a] hover:bg-[#12121e] transition-colors ${
            offsetMs === 0 ? 'text-[#555]' : 'text-[#ff8800]'
          }`}
          onClick={() => setEditing(true)}
          title="Click to type an exact ms value"
        >
          {offsetMs > 0 ? '+' : ''}{offsetMs}ms
        </span>
      )}

      <button
        onClick={() => nudge(NUDGE_MS)}
        className="w-5 h-5 flex items-center justify-center text-[10px] text-[#888] bg-[#12121e] border border-[#1a1a2e] rounded hover:border-[#2a2a4a] hover:text-[#00e5ff] transition-colors"
        title={`+${NUDGE_MS}ms`}
      >
        +
      </button>

      {/* Reset button — only shown when offset is non-zero so it doesn't add visual noise */}
      {offsetMs !== 0 && !editing && (
        <button
          onClick={() => setUserOffset(0)}
          className="w-5 h-5 flex items-center justify-center text-[10px] text-[#444] hover:text-[#ff3a5c] transition-colors"
          title="Reset offset to 0"
        >
          ×
        </button>
      )}
    </div>
  )
}
