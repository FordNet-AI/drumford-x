import { useUIStore } from '@/stores/ui-store'

export type LibraryTab = 'my-songs' | 'paradb' | 'manual' | 'about'

interface LibraryTabsProps {
  activeTab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
}

const isElectron = !!window.electronAPI

/**
 * Top-of-library navigation row.
 *
 * Mixes two button types:
 *   - Content tabs: My Songs / Community Charts / Manual / About swap what
 *     shows in the library main area below.
 *   - Navigation button: Kit Setup jumps to a separate top-level screen.
 *     It's styled like a tab for visual cohesion but never appears "active"
 *     because we leave the library when clicked.
 *
 * The Community Charts tab needs the Electron main process (CORS bypass for
 * the chart API), so it's hidden in plain browser mode and only appears in the
 * desktop app.
 */
export function LibraryTabs({ activeTab, onTabChange }: LibraryTabsProps) {
  const setScreen = useUIStore((s) => s.setScreen)

  return (
    <div className="flex items-center gap-1 mb-4">
      <TabButton
        label="My Songs"
        active={activeTab === 'my-songs'}
        onClick={() => onTabChange('my-songs')}
      />
      {isElectron && (
        <TabButton
          label="Community Charts"
          active={activeTab === 'paradb'}
          onClick={() => onTabChange('paradb')}
        />
      )}
      <TabButton
        label="Kit Setup"
        active={false}
        onClick={() => setScreen('setup')}
      />
      <TabButton
        label="Manual"
        active={activeTab === 'manual'}
        onClick={() => onTabChange('manual')}
      />
      <TabButton
        label="About"
        active={activeTab === 'about'}
        onClick={() => onTabChange('about')}
      />
    </div>
  )
}

function TabButton({
  label,
  active,
  onClick,
  rightIcon,
  title,
}: {
  label: string
  active: boolean
  onClick: () => void
  rightIcon?: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-all
        ${active
          ? 'bg-[#1a1a2e] text-[#00e5ff] border border-[#00e5ff30]'
          : 'text-[#555] hover:text-[#888] border border-transparent hover:border-[#1a1a2e]'
        }
      `}
    >
      <span>{label}</span>
      {rightIcon}
    </button>
  )
}
