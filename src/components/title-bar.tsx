import { Minus, Square, X } from 'lucide-react'

const isElectron = !!window.electronAPI

/**
 * Custom frameless title bar — visible only in Electron.
 * The entire bar is draggable (app region), except the window control buttons.
 */
export function TitleBar() {
  if (!isElectron) return null

  return (
    <div
      className="flex items-center h-8 bg-[#08080f] border-b border-[#111] select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App title - left side */}
      <div className="flex items-center gap-1.5 px-3">
        <span className="text-[10px] tracking-[2px] font-black">
          <span className="text-[#00e5ff]">DRUM</span>
          <span className="text-[#ff3a5c]">FORD</span>
          <span className="text-[#555] ml-1">X</span>
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Window controls - right side */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="h-full px-3 text-[#666] hover:text-[#aaa] hover:bg-[#ffffff08] transition-colors"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="h-full px-3 text-[#666] hover:text-[#aaa] hover:bg-[#ffffff08] transition-colors"
        >
          <Square size={11} />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="h-full px-3 text-[#666] hover:text-[#fff] hover:bg-[#ff3a5c] transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
