import { usePlayerStore } from '@/stores/player-store'

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

export function MetronomeControl() {
  const enabled = usePlayerStore((s) => s.metronomeEnabled)
  const volume = usePlayerStore((s) => s.metronomeVolume)
  const setEnabled = usePlayerStore((s) => s.setMetronomeEnabled)
  const setVolume = usePlayerStore((s) => s.setMetronomeVolume)

  return (
    <div className="flex items-center gap-1.5" title="Metronome click track">
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
    </div>
  )
}
