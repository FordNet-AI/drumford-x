import { useMemo } from 'react'
import { useKitStore } from '@/stores/kit-store'
import { resolveInstrumentLane } from '@/lib/default-kit'

/**
 * Tiny "kit count" badge — matches the green drum-stem badge style next to it.
 * Shows the number of distinct kit lanes this song uses (resolved against
 * the user's current kit, so china/splash break out separately if the user
 * has those lanes). The full list is in the hover tooltip.
 *
 * Returns null if no lanes resolve (e.g. song uses only unmapped instruments
 * or every lane is disabled), so we never render an empty badge.
 */
export function KitSignature({ instrumentClasses }: { instrumentClasses: string[] }) {
  const kit = useKitStore((s) => s.kit)

  const usedLanes = useMemo(() => {
    if (instrumentClasses.length === 0) return []
    const laneById = new Map(kit.lanes.map((l) => [l.id, l]))
    const used = new Set<string>()
    for (const cls of instrumentClasses) {
      const laneId = resolveInstrumentLane(cls, kit.instrumentOverrides)
      if (laneId && laneById.has(laneId)) used.add(laneId)
    }
    // Preserve kit display order in the tooltip text
    return kit.lanes.filter((l) => used.has(l.id))
  }, [instrumentClasses, kit])

  if (usedLanes.length === 0) return null

  return (
    <div
      className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-[#22c55e18] border border-[#22c55e40] text-[#22c55e] cursor-default text-[10px] font-semibold tabular-nums"
      title={`Uses ${usedLanes.length} drum${usedLanes.length === 1 ? '' : 's'}: ${usedLanes.map((l) => l.label).join(', ')}`}
    >
      {usedLanes.length}
    </div>
  )
}
