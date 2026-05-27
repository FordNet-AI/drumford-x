import { usePlayerStore } from '@/stores/player-store'

const SPEEDS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

export function SpeedControl() {
  const speed = usePlayerStore((s) => s.speed)
  const setSpeed = usePlayerStore((s) => s.setSpeed)

  return (
    <select
      value={speed}
      onChange={(e) => setSpeed(parseFloat(e.target.value))}
      className="bg-[#12121e] text-[#888] text-xs border border-[#1a1a2e] rounded px-1.5 py-1 hover:border-[#2a2a4a] focus:outline-none focus:border-[#00e5ff] cursor-pointer"
    >
      {SPEEDS.map((s) => (
        <option key={s} value={s}>
          {s}x
        </option>
      ))}
    </select>
  )
}
