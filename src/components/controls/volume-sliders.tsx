import { Drum, Music } from 'lucide-react'
import { usePlayerStore } from '@/stores/player-store'

export function VolumeSliders() {
  const drumVolume = usePlayerStore((s) => s.drumVolume)
  const songVolume = usePlayerStore((s) => s.songVolume)
  const setDrumVolume = usePlayerStore((s) => s.setDrumVolume)
  const setSongVolume = usePlayerStore((s) => s.setSongVolume)

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5" title="Drum track volume">
        <Drum size={14} className="text-[#ff3a5c]" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={drumVolume}
          onChange={(e) => setDrumVolume(parseFloat(e.target.value))}
          className="w-16 h-1"
        />
      </div>

      <div className="flex items-center gap-1.5" title="Backing track volume">
        <Music size={14} className="text-[#00e5ff]" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={songVolume}
          onChange={(e) => setSongVolume(parseFloat(e.target.value))}
          className="w-16 h-1"
        />
      </div>
    </div>
  )
}
