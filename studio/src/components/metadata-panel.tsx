import { formatDuration } from '@/lib/rlrr-parser'
import { useStudioStore } from '@studio/stores/studio-store'

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Expert'] as const

/**
 * Metadata panel — editable chart metadata bound live to `chart.meta` via
 * `setMeta`, plus a read-only summary derived from the chart (length, first
 * tempo + time signature, note count). Every edit writes straight to the store,
 * so the Preview/Editor and export stay in sync.
 */
export function MetadataPanel() {
  const chart = useStudioStore((s) => s.chart)
  const setMeta = useStudioStore((s) => s.setMeta)

  if (!chart) return null

  const { meta } = chart
  const first = chart.bpmEvents[0]
  const ts = first?.timeSignature
  const knownDifficulty = (DIFFICULTIES as readonly string[]).includes(meta.difficulty)

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 px-6 py-10">
      <h2 className="text-lg tracking-wide text-[#ffffffee]">Chart metadata</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title">
          <input
            type="text"
            value={meta.title}
            onChange={(e) => setMeta({ title: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Artist">
          <input
            type="text"
            value={meta.artist}
            onChange={(e) => setMeta({ artist: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Creator">
          <input
            type="text"
            value={meta.creator}
            onChange={(e) => setMeta({ creator: e.target.value })}
            className={inputClass}
          />
        </Field>

        <Field label="Difficulty">
          <select
            value={knownDifficulty ? meta.difficulty : '__custom__'}
            onChange={(e) => {
              if (e.target.value !== '__custom__') setMeta({ difficulty: e.target.value })
            }}
            className={inputClass}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            {!knownDifficulty && (
              <option value="__custom__" disabled>
                {meta.difficulty || '(custom)'}
              </option>
            )}
          </select>
        </Field>

        <Field label={`Complexity (${meta.complexity})`}>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={meta.complexity}
            onChange={(e) => setMeta({ complexity: parseInt(e.target.value, 10) })}
            className="h-1 w-full cursor-pointer accent-[#00e5ff]"
            aria-label="Complexity"
          />
        </Field>
      </div>

      {/* Read-only, chart-derived summary */}
      <div className="grid grid-cols-3 gap-3 rounded-md border border-[#1a1a2e] bg-[#0d1424] p-4">
        <Stat label="Length" value={formatDuration(meta.length)} />
        <Stat
          label="Tempo"
          value={
            first
              ? `${Math.round(first.bpm)} bpm · ${ts ? `${ts[0]}/${ts[1]}` : '4/4'}`
              : '—'
          }
        />
        <Stat label="Notes" value={String(chart.notes.length)} />
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded border border-[#1a1a2e] bg-[#050508] px-2 py-1.5 text-sm text-[#ffffffcc] outline-none focus:border-[#00e5ff55]'

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs tracking-wide text-[#8a93a8]">{props.label}</span>
      {props.children}
    </label>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs tracking-wide text-[#8a93a8]">{props.label}</span>
      <span className="font-mono text-sm tabular-nums text-[#cdd3df]">{props.value}</span>
    </div>
  )
}
