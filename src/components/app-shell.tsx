import { useUIStore } from '@/stores/ui-store'
import { SongLibrary } from './library/song-library'
import { HighwayView } from './highway/highway-view'
import { KitSetup } from './setup/kit-setup'
import { TitleBar } from './title-bar'

export function AppShell() {
  const screen = useUIStore((s) => s.screen)

  return (
    <div className="flex flex-col h-screen">
      <TitleBar />
      <div className="flex-1 min-h-0">
        {screen === 'highway' && <HighwayView />}
        {screen === 'setup' && <KitSetup />}
        {screen === 'library' && <SongLibrary />}
      </div>
    </div>
  )
}
