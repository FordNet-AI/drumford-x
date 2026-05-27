import { useState } from 'react'
import { X, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react'
import { useLibraryStore } from '@/stores/library-store'

const SEVERITY_CONFIG = {
  error: { icon: XCircle, color: 'text-[#ff3a5c]', bg: 'bg-[#ff3a5c15]' },
  warn:  { icon: AlertTriangle, color: 'text-[#ffcc00]', bg: 'bg-[#ffcc0015]' },
  info:  { icon: Info, color: 'text-[#555]', bg: 'bg-[#ffffff08]' },
} as const

export function ImportToast() {
  const result = useLibraryStore((s) => s.importResult)
  const clear = useLibraryStore((s) => s.clearImportResult)
  const [expanded, setExpanded] = useState(false)

  if (!result) return null

  const hasWarnings = result.warnings.length > 0
  const hasErrors = result.warnings.some((w) => w.severity === 'error')
  const allFailed = result.imported === 0 && result.skipped > 0

  // Header color and icon
  let headerColor = 'text-[#00e5ff]'
  let HeaderIcon = CheckCircle
  if (allFailed) {
    headerColor = 'text-[#ff3a5c]'
    HeaderIcon = XCircle
  } else if (hasErrors || hasWarnings) {
    headerColor = 'text-[#ffcc00]'
    HeaderIcon = AlertTriangle
  }

  // Summary text
  let summary: string
  if (allFailed) {
    summary = result.skipped === 1
      ? 'Import failed'
      : `Import failed — ${result.skipped} charts couldn't be parsed`
  } else if (result.imported === 0 && result.skipped === 0) {
    summary = result.warnings[0]?.issue || 'Nothing to import'
  } else {
    const parts: string[] = []
    parts.push(`${result.imported} chart${result.imported !== 1 ? 's' : ''} imported`)
    if (result.skipped > 0) parts.push(`${result.skipped} failed`)
    summary = parts.join(', ')
  }

  // Deduplicate warnings by song+issue
  const uniqueWarnings = result.warnings.filter(
    (w, i, arr) => arr.findIndex((x) => x.song === w.song && x.issue === w.issue) === i
  )

  return (
    <div className="mb-4 rounded-lg border border-[#1a1a2e] bg-[#0d0d18] overflow-hidden animate-in fade-in slide-in-from-top-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <HeaderIcon size={16} className={headerColor} />
        <span className={`text-sm font-medium ${headerColor} flex-1`}>{summary}</span>

        {uniqueWarnings.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[#555] hover:text-[#888] transition-colors p-1"
          >
            {expanded
              ? <ChevronUp size={14} />
              : <ChevronDown size={14} />
            }
          </button>
        )}

        <button
          onClick={clear}
          className="text-[#555] hover:text-[#888] transition-colors p-1"
        >
          <X size={14} />
        </button>
      </div>

      {/* Expanded warning details */}
      {expanded && uniqueWarnings.length > 0 && (
        <div className="border-t border-[#1a1a2e] px-4 py-2 space-y-1 max-h-48 overflow-y-auto">
          {uniqueWarnings.map((w, i) => {
            const cfg = SEVERITY_CONFIG[w.severity]
            const Icon = cfg.icon
            return (
              <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded ${cfg.bg}`}>
                <Icon size={12} className={`${cfg.color} mt-0.5 shrink-0`} />
                <div className="text-xs leading-relaxed">
                  {w.song && <span className="text-[#888] font-medium">{w.song}: </span>}
                  <span className="text-[#666]">{w.issue}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
