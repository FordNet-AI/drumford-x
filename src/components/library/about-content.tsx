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
        <p className="text-xs text-[#555]">Paradiddle for flat screens — version 0.1.0</p>
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
