import { ExternalLink } from 'lucide-react'
import { useUIStore } from '@/stores/ui-store'

export type LibraryTab = 'my-songs' | 'paradb' | 'manual' | 'about'

interface LibraryTabsProps {
  activeTab: LibraryTab
  onTabChange: (tab: LibraryTab) => void
}

const isElectron = !!window.electronAPI

/** Official Paradiddle (the VR app) homepage — opens externally in the user's
 *  default browser via window.open(). On Electron, main.ts's setWindowOpenHandler
 *  catches the call and routes through shell.openExternal. On Capacitor Android,
 *  the WebView punts to the system browser via Intent.ACTION_VIEW. So a single
 *  `window.open()` call works cleanly on both platforms with no plugin needed. */
const PARADIDDLE_BUY_URL = 'https://paradiddleapp.com/'

/**
 * Top-of-library navigation row.
 *
 * Mixes three button types:
 *   - Content tabs: My Songs / Browse ParaDB / Manual / About swap what shows
 *     in the library main area below.
 *   - Navigation button: Kit Setup jumps to a separate top-level screen.
 *     It's styled like a tab for visual cohesion but never appears "active"
 *     because we leave the library when clicked.
 *   - External link: Buy Paradiddle opens the official paradiddleapp.com page
 *     in the system browser. Styled like a tab but with an ExternalLink icon
 *     to telegraph that it leaves the app.
 *
 * ParaDB requires the Electron main process (CORS bypass for the API)
 * so we hide that tab in browser mode but keep everything else.
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
      <TabButton
        label="Buy Paradiddle"
        active={false}
        onClick={() => window.open(PARADIDDLE_BUY_URL, '_blank', 'noopener,noreferrer')}
        rightIcon={<ExternalLink size={12} className="opacity-60" />}
        title="Open paradiddleapp.com in your browser"
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
