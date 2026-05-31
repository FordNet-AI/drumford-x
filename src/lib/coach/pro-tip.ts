import type { Song } from '@/types/song'
import { getCurrentBpm, getCurrentTimeSig } from '@/components/highway/highway-renderer'
import { analyzeCues } from '@/lib/coach/cue-analysis'

/**
 * Auto-generated "pro tip" shown/spoken at song start when the chart has no
 * author-written description.
 *
 * Produces a short (≤ ~2 sentence) coaching summary built entirely from data we
 * already have:
 *  - the initial tempo + time signature (at t=0),
 *  - how many tempo / meter changes the chart contains,
 *  - whether the cue analysis flagged fills, sustained double-kick runs, or a
 *    long drop-out → re-entry,
 *  - the chart's section names, if any.
 *
 * It leans on `analyzeCues` so the things it calls out are exactly the things
 * Coach Mode will actually cue mid-song (no divergent second analysis). Clauses
 * that don't apply are omitted; a plain steady groove collapses to just
 * "{bpm} BPM, {meter}. Keep it steady."
 *
 * PURE: no DOM, no store reads, deterministic for a given Song. Safe to unit
 * test and memoize per song.
 *
 * @example
 *   "120 BPM, 4/4. Heads-up: a double-kick section and a couple of big fills. 2 tempo changes."
 */
export function generateProTip(song: Song): string {
  const bpmEvents = song.bpmEvents ?? []

  // Lead: initial tempo + meter (at the very top of the song).
  const bpm = Math.round(getCurrentBpm(0, bpmEvents))
  const sig = getCurrentTimeSig(0, bpmEvents)
  const meter = `${sig[0]}/${sig[1]}`
  const lead = `${bpm} BPM, ${meter}.`

  // Reuse the cue analysis so the summary matches what gets cued mid-song.
  const cues = analyzeCues(song)
  const tempoChanges = cues.filter((c) => c.type === 'tempo').length
  const meterChanges = cues.filter((c) => c.type === 'meter').length
  const hasFill = cues.some((c) => c.type === 'fill')
  const fillCount = cues.filter((c) => c.type === 'fill').length
  const hasDoubleKick = cues.some((c) => c.type === 'doubleKick')
  const hasReentry = cues.some((c) => c.type === 'reentry')

  // --- "Heads-up:" clause — notable playing features ------------------------
  // Order by how much a drummer wants to brace for it: double-kick, fills,
  // then a drop-out/re-entry. Each phrase is a noun so they list cleanly.
  const headsUp: string[] = []
  if (hasDoubleKick) headsUp.push('a double-kick section')
  if (hasFill) headsUp.push(fillCount > 1 ? 'a few big fills' : 'a big fill')
  if (hasReentry) headsUp.push('a drum drop-out you re-enter on')

  // --- Structural clause — tempo / meter changes ----------------------------
  // Charts with dense tempo/meter automation can report dozens of "changes";
  // listing an exact count then reads like a changelog and overflows the tip.
  // Above MANY_CHANGES we collapse to a soft "frequent …" phrase instead.
  const changes: string[] = []
  if (tempoChanges > 0) changes.push(changePhrase(tempoChanges, 'tempo'))
  if (meterChanges > 0) changes.push(changePhrase(meterChanges, 'meter'))

  // --- Sections clause ------------------------------------------------------
  // List section labels in order, de-duplicating consecutive repeats. Capped so
  // a heavily-bookmarked chart doesn't blow past two sentences.
  const sectionLabels = sectionList(song)

  const parts: string[] = [lead]

  if (headsUp.length > 0) {
    parts.push(`Heads-up: ${joinList(headsUp)}.`)
  }

  if (changes.length > 0) {
    parts.push(`${capitalize(joinList(changes))}.`)
  }

  if (sectionLabels) {
    parts.push(`Sections: ${sectionLabels}.`)
  }

  // Plain steady groove: nothing notable, no structural changes, no sections →
  // a short encouraging nudge instead of a bare "120 BPM, 4/4."
  if (headsUp.length === 0 && changes.length === 0 && !sectionLabels) {
    parts.push('Keep it steady.')
  }

  return parts.join(' ')
}

/**
 * Above this many tempo/meter changes we stop printing an exact count and use a
 * soft "frequent …" phrase, so a chart with dense tempo automation doesn't turn
 * the tip into "37 tempo changes".
 */
const MANY_CHANGES = 6

/**
 * Phrase a count of tempo/meter changes: "1 tempo change", "3 tempo changes",
 * or — past MANY_CHANGES — "frequent tempo changes" (no overwhelming number).
 */
function changePhrase(count: number, kind: 'tempo' | 'meter'): string {
  if (count > MANY_CHANGES) return `frequent ${kind} changes`
  if (count === 1) return `1 ${kind} change`
  return `${count} ${kind} changes`
}

/** Cap on how many section labels we list before summarizing as "…". */
const MAX_SECTIONS_LISTED = 5

/** Minimal HTML entity map for the few entities that show up in chart blurbs. */
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

/**
 * Turn an author's chart description into plain, speakable/displayable text.
 *
 * Community charts sometimes store a RICH-TEXT (HTML) description — e.g.
 * "<h2>🥁 Drum Track Update</h2><ul><li>…</li></ul>". Shown verbatim that would
 * paint raw tags in the banner and make the voice read "less-than h2". So we:
 *  - strip tags (block tags become a space so words don't fuse),
 *  - decode the handful of common entities,
 *  - collapse runs of whitespace and trim.
 *
 * Plain-text descriptions pass through essentially untouched (just trimmed).
 * Pure + DOM-free (regex-based, not innerHTML) so it works under SSR/tests.
 * Returns '' for nullish input or markup with no text content.
 */
export function sanitizeDescription(raw: string | undefined | null): string {
  if (!raw) return ''
  let text = raw
  // Drop tags entirely but leave a space in their place so "</li><li>" doesn't
  // weld adjacent words together.
  text = text.replace(/<[^>]*>/g, ' ')
  // Decode the common named/numeric entities we expect in chart blurbs.
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(char)
  }
  // Collapse all whitespace (incl. the newlines/indentation common in HTML).
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Build a comma-joined section-label string from `song.sections`, in time
 * order, collapsing consecutive duplicate labels and capping the count so the
 * tip stays short. Returns null when the song has no usable sections.
 */
function sectionList(song: Song): string | null {
  const sections = song.sections
  if (!sections || sections.length === 0) return null

  const labels: string[] = []
  for (const s of sections) {
    const label = s.label?.trim()
    if (!label) continue
    if (labels[labels.length - 1] === label) continue // drop consecutive repeats
    labels.push(label)
  }
  if (labels.length === 0) return null

  if (labels.length > MAX_SECTIONS_LISTED) {
    return `${labels.slice(0, MAX_SECTIONS_LISTED).join(', ')}…`
  }
  return labels.join(', ')
}

/** Join a list as "a", "a and b", or "a, b and c". */
function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Capitalize the first character of a string (rest untouched). */
function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1)
}
