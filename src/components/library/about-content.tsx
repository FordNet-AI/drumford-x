/**
 * About page — info about the app, Fordnet, and credits.
 * Brief and editable: this is mostly for the user (Tim) and people he hands a build to.
 */
export function AboutContent() {
  return (
    <div className="max-w-2xl mx-auto py-4 text-[#aaa] text-sm leading-relaxed space-y-8">
      <header>
        <h1
          className="text-3xl tracking-[6px] font-black mb-2"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <span className="text-[#00e5ff]">DRUM</span>
          <span className="text-[#ff3a5c]">FORD</span>
          <span className="text-[#888] ml-2 text-xl">X</span>
        </h1>
        <p className="text-xs text-[#555]">Paradiddle for flat screens — v0.1.0 alpha</p>
      </header>

      <Section title="What this is">
        <p>
          DrumFord X is a desktop visualizer for Paradiddle drum charts. Notes scroll down a highway in
          sync with the original song's audio, calibrated to land at the exact moment they should be played.
          There's no scoring, no input detection, no judgment — just a clean way to read drum charts on a
          flat screen instead of in VR.
        </p>
      </Section>

      <Section title="About Fordnet">
        <p>
          Fordnet is the indie label behind DrumFord X. Built by Tim — drummer, builder, and recovering Quicken user — out
          of a desire to read Paradiddle charts without strapping a headset on every time.
        </p>
        <p className="text-xs text-[#666]">
          (Edit this section in <code className="font-mono text-[#888]">src/components/library/about-content.tsx</code> — say whatever you want about yourself here.)
        </p>
      </Section>

      <Section title="Credits & Acknowledgements">
        <Credit name="Paradiddle" desc="The VR drumming game that established the .rlrr chart format and ecosystem. Without it, none of this exists." />
        <Credit name="ParaDB" desc="paradb.net — the community-run chart database that DrumFord X integrates with for one-click downloads." />
        <Credit name="Chart authors" desc="Every drummer who has ever taken the time to chart a song. This whole experience runs on your work." />
      </Section>

      <Section title="Disclaimers">
        <Disclaimer text="Not affiliated with Paradiddle. DrumFord X is an independent fan project — not endorsed by, sponsored by, or connected to Studio Cor or the Paradiddle game." />
        <Disclaimer text="No audio is hosted or distributed. DrumFord X is a visualizer; you supply your own audio and are responsible for your rights to it." />
        <Disclaimer text="Community content. Charts come from community uploaders via paradb.net — DrumFord X doesn't create, curate, or vet them, and isn't responsible for their content or the songs they reference." />
        <Disclaimer text="No warranty. Provided as-is under the MIT license, with no guarantee of fitness for any purpose." />
        <Disclaimer text="Trademarks. DrumFord X and Fordnet are trademarks of Fordnet. Paradiddle is a trademark of its respective owners." />
        <p className="text-xs text-[#666] pt-1">
          Spot a problem or a chart that shouldn't be here? Report it at{' '}
          <span className="font-mono text-[#888]">github.com/FordNet-AI/drumford-x/issues</span>.
        </p>
      </Section>

      <Section title="Tech">
        <p className="text-xs">
          Electron · React 19 · Vite 7 · TypeScript · Tailwind v4 · Zustand 5 · Web Audio API.
        </p>
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

function Credit({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-[#00e5ff] font-mono text-xs min-w-[80px]">{name}</span>
      <span className="flex-1 text-xs text-[#888]">{desc}</span>
    </div>
  )
}

/** A single disclaimer line. The first sentence (up to the first period) is
 *  emphasized as a mini-heading so the section scans quickly. */
function Disclaimer({ text }: { text: string }) {
  const periodIdx = text.indexOf('. ')
  const lead = periodIdx > -1 ? text.slice(0, periodIdx + 1) : text
  const rest = periodIdx > -1 ? text.slice(periodIdx + 2) : ''
  return (
    <div className="flex items-start gap-2 text-xs text-[#888]">
      <span className="text-[#444] select-none">›</span>
      <span className="flex-1">
        <span className="text-[#aaa]">{lead}</span>
        {rest && <span> {rest}</span>}
      </span>
    </div>
  )
}
