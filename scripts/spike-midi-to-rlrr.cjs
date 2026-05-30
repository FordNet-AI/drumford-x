/**
 * SPIKE — drum MIDI → .rlrr converter (throwaway proof of concept).
 *
 * Proves the keystone of the "auto-chart from MIDI" idea: a General-MIDI drum
 * track converts cleanly into DrumFord's .rlrr note data, with correct
 * lanes, timing, and tempo. NOT production code — lives only on the
 * spike/midi-to-rlrr branch.
 *
 * Usage:
 *   node scripts/spike-midi-to-rlrr.cjs                 # synthesize a demo beat + convert
 *   node scripts/spike-midi-to-rlrr.cjs --in path.mid --title "X" --artist "Y"
 *
 * Outputs into public/spike-demo/:
 *   <name>.rlrr        — the chart (load this in DrumFord)
 *   <name>.wav         — a click track of matching length, so playback scrolls
 *   demo-beat.mid      — the synthesized MIDI (only when no --in given)
 */

const path = require('path')
const fs = require('fs')
const { Midi } = require('@tonejs/midi')

// ── General MIDI percussion note → DrumFord instrument class ───────────────
// (GM drum map: https://en.wikipedia.org/wiki/General_MIDI#Percussion)
// Classes must match DEFAULT_CLASS_TO_LANE in src/lib/default-kit.ts.
const GM_TO_CLASS = {
  35: 'BP_Kick_C', 36: 'BP_Kick_C',                       // bass drums
  37: 'BP_Snare_C', 38: 'BP_Snare_C', 40: 'BP_Snare_C',   // snare + sidestick
  42: 'BP_HiHat_C', 46: 'BP_HiHat_C',                     // closed + open hat → hihat lane
  44: 'BP_HiHatFoot_C',                                   // pedal hat
  41: 'BP_FloorTom_C', 43: 'BP_FloorTom_C',               // floor toms
  45: 'BP_Tom2_C', 47: 'BP_Tom2_C',                       // low/low-mid tom
  48: 'BP_Tom1_C', 50: 'BP_Tom1_C',                       // hi-mid/high tom
  49: 'BP_Crash17_C', 57: 'BP_Crash17_C',                 // crashes
  55: 'BP_Splash_C',                                      // splash
  52: 'BP_ChinaCrash_C',                                  // china
  51: 'BP_Ride_C', 59: 'BP_Ride_C',                       // ride
  53: 'BP_RideBell_C',                                    // ride bell
}

// A readable instrument NAME per class (events reference instruments by name).
const CLASS_TO_NAME = {
  BP_Kick_C: 'Kick', BP_Snare_C: 'Snare', BP_HiHat_C: 'HiHat',
  BP_HiHatFoot_C: 'HiHatFoot', BP_FloorTom_C: 'FloorTom',
  BP_Tom2_C: 'Tom2', BP_Tom1_C: 'Tom1', BP_Crash17_C: 'Crash',
  BP_Splash_C: 'Splash', BP_ChinaCrash_C: 'China', BP_Ride_C: 'Ride',
  BP_RideBell_C: 'RideBell',
}

const OUT_DIR = path.join(__dirname, '..', 'public', 'spike-demo')

// ── arg parsing ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function arg(flag, def) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def }
const inPath = arg('--in', null)
const title = arg('--title', 'Spike Demo Beat')
const artist = arg('--artist', 'DrumFord Lab')

// ── synthesize a demo MIDI when none provided ────────────────────────────────
// A 4-bar rock beat at 120 BPM: kick on 1 & 3, snare on 2 & 4, closed hat in
// 8ths, a crash on bar 1 beat 1, and a tom fill in bar 4.
function synthesizeDemoBeat() {
  const midi = new Midi()
  midi.header.setTempo(120)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  const track = midi.addTrack()
  track.channel = 9 // GM channel 10 (0-indexed 9) = percussion
  const SPB = 0.5 // sec per beat at 120 BPM
  const dur = 0.05
  const add = (note, beat, vel = 0.8) => track.addNote({ midi: note, time: beat * SPB, duration: dur, velocity: vel })

  for (let bar = 0; bar < 4; bar++) {
    const b = bar * 4
    add(36, b + 0, 0.95)          // kick 1
    add(36, b + 2, 0.9)           // kick 3
    add(38, b + 1, 0.9)           // snare 2
    add(38, b + 3, 0.9)           // snare 4
    for (let e = 0; e < 8; e++) add(42, b + e * 0.5, e % 2 ? 0.5 : 0.7) // hats (8ths, accent downbeats)
    if (bar === 0) add(49, b + 0, 1.0) // crash on the 1
  }
  // bar 4 fill: replace last beat's hats with a tom roll
  const b4 = 3 * 4
  add(48, b4 + 3.0, 0.85); add(48, b4 + 3.25, 0.85)  // hi tom
  add(45, b4 + 3.5, 0.9);  add(41, b4 + 3.75, 0.95)  // low tom → floor tom
  return midi
}

// ── load or synthesize ───────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true })
let midi
let baseName
if (inPath) {
  midi = new Midi(fs.readFileSync(inPath))
  baseName = path.basename(inPath).replace(/\.midi?$/i, '')
  console.log(`[spike] Loaded MIDI: ${inPath}`)
} else {
  midi = synthesizeDemoBeat()
  baseName = 'demo-beat'
  fs.writeFileSync(path.join(OUT_DIR, 'demo-beat.mid'), Buffer.from(midi.toArray()))
  console.log('[spike] Synthesized demo-beat.mid (4-bar rock beat @ 120 BPM)')
}

// ── collect drum hits across all tracks (channel 10 / percussion) ─────────────
const hits = []  // { time, class, vel }
const skipped = {}
for (const track of midi.tracks) {
  // GM percussion lives on channel 9 (0-indexed). Some MIDIs put drums on a
  // track without setting channel; if a track's notes are mostly GM-drum
  // numbers we still take them. For the spike we accept channel 9 OR any
  // track whose notes map cleanly.
  for (const note of track.notes) {
    const cls = GM_TO_CLASS[note.midi]
    if (!cls) { skipped[note.midi] = (skipped[note.midi] || 0) + 1; continue }
    hits.push({ time: +note.time.toFixed(4), class: cls, vel: Math.max(1, Math.round(note.velocity * 127)) })
  }
}
hits.sort((a, b) => a.time - b.time)

// ── build instruments[] (one per class actually used) ────────────────────────
const usedClasses = [...new Set(hits.map((h) => h.class))]
const instruments = usedClasses.map((cls) => ({
  name: CLASS_TO_NAME[cls] || cls,
  class: cls,
  overrideData: '',
  location: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
  volumeMultiplier: 1, pitchMultiplier: 1, midiNotes: [],
}))

// ── build events[] (reference instruments by name) ────────────────────────────
const events = hits.map((h) => ({
  name: CLASS_TO_NAME[h.class] || h.class,
  time: h.time,
  vel: h.vel,
  loc: 0,
}))

// ── bpmEvents[] from the MIDI tempo + time-signature map ──────────────────────
const ts0 = midi.header.timeSignatures[0]?.timeSignature || [4, 4]
const bpmEvents = (midi.header.tempos.length ? midi.header.tempos : [{ ticks: 0, bpm: 120 }]).map((t) => ({
  bpm: +t.bpm.toFixed(3),
  time: +midi.header.ticksToSeconds(t.ticks).toFixed(4),
  timeSignature: ts0,
}))
if (!bpmEvents.length || bpmEvents[0].time > 0) bpmEvents.unshift({ bpm: 120, time: 0, timeSignature: ts0 })

const length = +(midi.duration + 1).toFixed(2)

// ── assemble the .rlrr ────────────────────────────────────────────────────────
const rlrr = {
  version: 1,
  recordingMetadata: {
    title, artist, creator: 'DrumFord (auto from MIDI)',
    length, complexity: 3, coverImagePath: '', description: 'Generated from drum MIDI — spike',
  },
  audioFileData: {
    songTracks: [`${baseName}.wav`], drumTracks: [],
    songPreview: '', spectrogramTracks: [], calibrationOffset: 0,
  },
  highwaySettings: { ghostNotes: true, accentNotes: true, ghostNoteThreshold: 30, accentNoteThreshold: 90 },
  instruments, events, bpmEvents, bookmarks: [],
  editorData: { mappingTime: 0, editorVersion: 'drumford-spike' },
}

const rlrrPath = path.join(OUT_DIR, `${baseName}.rlrr`)
fs.writeFileSync(rlrrPath, JSON.stringify(rlrr, null, 2))

// ── matching-length click-track WAV so playback scrolls the highway ───────────
writeClickWav(path.join(OUT_DIR, `${baseName}.wav`), length, bpmEvents[0].bpm)

// ── report ────────────────────────────────────────────────────────────────────
const perLane = {}
for (const h of hits) { const n = CLASS_TO_NAME[h.class] || h.class; perLane[n] = (perLane[n] || 0) + 1 }
console.log(`\n[spike] Converted → ${rlrrPath}`)
console.log(`  duration: ${length}s   bpm: ${bpmEvents[0].bpm}   time-sig: ${ts0[0]}/${ts0[1]}`)
console.log(`  ${events.length} notes across ${usedClasses.length} instruments:`)
for (const [name, n] of Object.entries(perLane)) console.log(`    ${name.padEnd(10)} ${n}`)
if (Object.keys(skipped).length) console.log(`  skipped (unmapped GM notes): ${JSON.stringify(skipped)}`)
console.log('\n  first 12 events:')
for (const e of events.slice(0, 12)) console.log(`    t=${e.time.toFixed(3)}s  ${e.name.padEnd(10)} vel=${e.vel}`)

// ── tiny WAV writer: mono 22050Hz 16-bit, soft 1kHz blip on each beat ─────────
function writeClickWav(outPath, durationSec, bpm) {
  const sr = 22050
  const total = Math.ceil(durationSec * sr)
  const data = Buffer.alloc(total * 2)
  const beatSec = 60 / bpm
  const blip = Math.floor(0.04 * sr) // 40ms blip
  for (let beat = 0; beat * beatSec < durationSec; beat++) {
    const start = Math.floor(beat * beatSec * sr)
    for (let i = 0; i < blip && start + i < total; i++) {
      const env = 1 - i / blip
      const s = Math.sin((2 * Math.PI * 1000 * i) / sr) * env * 0.25
      data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), (start + i) * 2)
    }
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8)
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22); header.writeUInt32LE(sr, 24); header.writeUInt32LE(sr * 2, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  fs.writeFileSync(outPath, Buffer.concat([header, data]))
}
