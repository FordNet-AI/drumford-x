/**
 * In-app manual / user guide. Plain-text content describing the features the
 * user has built up — no fancy formatting libraries, just Tailwind-styled
 * markup so it stays in the same visual language as the rest of the app.
 */
export function ManualContent() {
  return (
    <div className="max-w-3xl mx-auto py-4 text-[#aaa] text-sm leading-relaxed space-y-8">
      <header>
        <h2 className="text-xl text-[#ffffffee] tracking-wider mb-1">DrumFord X — Manual</h2>
        <p className="text-xs text-[#555]">
          A short guide to every feature. Need something not here? It probably hasn't been built yet.
        </p>
      </header>

      <Section title="Getting Started">
        <p>
          Drop a song folder (or a parent folder containing multiple songs) anywhere on the library screen to import.
          Each song folder needs at least one <code className="font-mono text-[#00e5ff]">.rlrr</code> chart file plus
          its associated audio stems (<code className="font-mono text-[#00e5ff]">.ogg</code>/<code className="font-mono text-[#00e5ff]">.mp3</code>/<code className="font-mono text-[#00e5ff]">.wav</code>).
          Album art (any common image format) is picked up automatically if present.
        </p>
        <p>
          In Electron mode, the <span className="text-[#00e5ff]">Community Charts</span> tab lets you search and one-click-download
          community charts from paradb.net directly into your library.
        </p>
      </Section>

      <Section title="Library">
        <Bullet>Search by title, artist, or creator using the filter box.</Bullet>
        <Bullet>Sort by title / artist / complexity / duration — toggle ascending/descending in the dropdown.</Bullet>
        <Bullet>Filter by difficulty using the chips below the toolbar.</Bullet>
        <Bullet>Hover the pencil icon on a song card to edit its title, artist, or cover art.</Bullet>
        <Bullet>The green drum-icon badge means the chart has separate drum stems (volume control available).</Bullet>
        <Bullet>The green number badge next to it shows how many kit pieces the chart uses — hover for the list.</Bullet>
      </Section>

      <Section title="Playing a Song">
        <p>
          Click a difficulty button on a song card to start. The highway scrolls notes top-to-bottom; they land on
          the cyan hit line at the same moment you hear them. Press <kbd className="px-1.5 py-0.5 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-[10px] font-mono text-[#ddd]">Space</kbd> to play / pause.
        </p>
        <p>
          The transport bar at the bottom has: scrub bar, play/pause, restart, time display, current BPM + time
          signature, volume controls (song + drum stems independent), metronome, speed (0.5×–1.5×), and sync offset.
        </p>
      </Section>

      <Section title="Sync Controls">
        <p>
          If notes consistently arrive before or after the audio, use the <span className="text-[#ff8800]">offset</span> control on the right of the transport bar.
        </p>
        <Bullet>The <span className="text-[#aaa]">−</span> / <span className="text-[#aaa]">+</span> buttons nudge by 5ms.</Bullet>
        <Bullet>Click the value to type an exact ms number (range ±2000ms).</Bullet>
        <Bullet>The <span className="text-[#aaa]">×</span> button appears when offset ≠ 0 — one-click reset to zero.</Bullet>
        <p>
          Positive offset = notes appear later relative to audio (use when notes hit too early).
          Negative = the opposite.
        </p>
      </Section>

      <Section title="Kit Setup">
        <p>
          Open the <span className="text-[#00e5ff]">Kit Setup</span> tab to customize how the highway looks.
          Settings save automatically and apply to every song you play.
        </p>
        <Bullet><strong className="text-[#ddd]">Lanes:</strong> reorder, recolor, rename, and toggle on/off. Pick whether each lane is a drum (solid pill), cymbal (hollow outline), or full-width bar (kick style).</Bullet>
        <Bullet><strong className="text-[#ddd]">Pulse:</strong> per-lane checkbox that controls which drums fire the hit-line pulse animation.</Bullet>
        <Bullet><strong className="text-[#ddd]">Optional presets:</strong> CHINA, SPLASH, HH FT (hi-hat foot pedal) — adding any preset automatically routes the matching instruments to it.</Bullet>
        <Bullet><strong className="text-[#ddd]">Custom Lane:</strong> create a new lane with name, color, shape, pulse, AND mappings all in one modal.</Bullet>
        <Bullet><strong className="text-[#ddd]">Tuning sliders:</strong> thickness, glow, grid brightness, pulse strength, highway speed.</Bullet>
        <Bullet><strong className="text-[#ddd]">Advanced:</strong> remap any individual Paradiddle instrument class to a different lane.</Bullet>
        <Bullet><strong className="text-[#ddd]">Reset:</strong> wipe all kit changes back to factory defaults.</Bullet>
      </Section>

      <Section title="Quick Kit Tuner (gameplay)">
        <p>
          While playing a song, click the small <span className="text-[#00e5ff]">palette icon</span> in the bottom-right corner of the highway to pop open a compact tuner. Adjust lane colors,
          thickness, glow, grid brightness, pulse strength, and highway speed without leaving playback.
        </p>
      </Section>

      <Section title="Keyboard Shortcuts">
        <table className="text-xs">
          <tbody>
            <Shortcut keys="Space" desc="Play / pause" />
            <Shortcut keys="Escape" desc="Close any open modal or popover" />
          </tbody>
        </table>
      </Section>

      <Section title="Tips">
        <Bullet>The metronome shares the same AudioContext as playback — clicks stay perfectly in sync with the song even at non-1.0× speed.</Bullet>
        <Bullet>Speed changes don't affect pitch (Web Audio playbackRate trades pitch for speed by default — we accept that for now).</Bullet>
        <Bullet>The kit signature on each song card is computed against your CURRENT kit — adding a CHINA lane will instantly update the chip count on songs that use china.</Bullet>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs text-[#888] tracking-[2px] mb-3">{title.toUpperCase()}</h3>
      <div className="space-y-2 text-[#aaa]">{children}</div>
    </section>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[#444] mt-1">•</span>
      <span className="flex-1">{children}</span>
    </div>
  )
}

function Shortcut({ keys, desc }: { keys: string; desc: string }) {
  return (
    <tr>
      <td className="pr-4 py-1">
        <kbd className="px-1.5 py-0.5 bg-[#1a1a2e] border border-[#2a2a4a] rounded text-[10px] font-mono text-[#ddd]">{keys}</kbd>
      </td>
      <td className="py-1 text-[#aaa]">{desc}</td>
    </tr>
  )
}
