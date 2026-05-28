# DrumFord X

> Flatscreen Paradiddle. Read drum charts on your desktop or tablet without strapping a headset on.

DrumFord X is a chart visualizer for [Paradiddle](https://paradiddleapp.com), the VR drumming game. It plays the same `.rlrr` chart format and pulls songs from [paradb.net](https://paradb.net), but renders the notes scrolling down a flat canvas highway you can read on a regular monitor or tablet — no headset, no controllers, no rumbling kick pedals through your floor.

Built by **[Fordnet](#about-fordnet)**.

![Highway in action, with the Quick Tune popover open](docs/screenshots/05-quick-tune.jpg)

🎬 [Watch the 30-second demo video](docs/screenshots/demo.mp4) *(plays inline on GitHub when you click)*

---

## What it is

- 🎯 **A read-only chart player.** Notes scroll down lanes synced to the original song audio. No scoring, no input detection, no drumming required — it's a visualization tool.
- 🥁 **Compatible with every Paradiddle chart.** Same `.rlrr` JSON format. Parses every chart on ParaDB.
- 🌐 **Integrated ParaDB browser.** Search ~6,000 community charts, one-tap download, auto-import.
- ⚙️ **Customizable.** Reorder lanes, recolor notes, tune note thickness / glow / grid brightness / hit-line pulse / highway speed. Add or remove lanes (CHINA, SPLASH, HH-FOOT). Per-instrument routing for unusual charts.
- 🎚️ **Sync tooling.** Per-song speed (0.5×–1.5×), user-configurable sync offset (±2000 ms), metronome with BPM-event awareness, audio-output-latency-compensated timing.
- 💻 **Two platforms today.** Windows .exe (Electron) and Android APK (Capacitor wrapper). Same renderer code, same feature set.

## What it isn't

- ❌ **Not a Paradiddle replacement.** It doesn't track drumming, isn't a game, doesn't replace the VR experience. Use it alongside Paradiddle (or instead of, on days you can't be in VR).
- ❌ **Not affiliated with Paradiddle.** Independent fan project. The Paradiddle team is not responsible for this and didn't make it.
- ❌ **Not a chart authoring tool.** It plays charts you've already authored or downloaded. For authoring, use [the official Paradiddle utilities](https://github.com/Paradiddle-Stuff/ParadiddleUtilities).
- ❌ **Not in any app store.** Downloads are direct from the GitHub releases page below.

---

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/02-library.jpg" alt="Song library with cover art and difficulty buttons"/></td>
    <td width="50%"><img src="docs/screenshots/03-paradb.jpg" alt="ParaDB browser with 6,000+ songs, instant search, sort by popularity"/></td>
  </tr>
  <tr>
    <td width="50%" align="center"><em>Your library — sortable, filterable, cover-art aware</em></td>
    <td width="50%" align="center"><em>Browse ParaDB — ~6,000 community charts, instant client-side search</em></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/04-kit-setup.jpg" alt="Kit Setup screen — lane reorder, color swatches, kit tuning sliders"/></td>
    <td width="50%"><img src="docs/screenshots/01-highway.jpg" alt="Highway during playback — kick bars, hi-hat 16ths, snare backbeat"/></td>
  </tr>
  <tr>
    <td width="50%" align="center"><em>Kit Setup — customize lanes, colors, shapes, and tuning sliders</em></td>
    <td width="50%" align="center"><em>Highway during playback — Ace of Spades, Hard difficulty</em></td>
  </tr>
</table>

---

## Install

### Windows (portable, no installer)

1. Download **`drumford-x-v0.1.0-win-x64.zip`** from the [latest release](https://github.com/FordNet-AI/drumford-x/releases/latest)
2. Right-click → **Extract All** to a folder of your choice (e.g. `C:\Apps\DrumFord X\`)
3. Double-click **`DrumFord X.exe`** to launch
4. **First-time warning:** Windows SmartScreen may show "Windows protected your PC" because this is an unsigned debug build. Click **"More info"** → **"Run anyway"**. This is expected for an alpha — code signing requires a paid certificate we haven't bothered with yet.

To uninstall, just delete the folder. No registry changes, no system bloat.

### Android (APK sideload)

1. Download **`drumford-x-v0.1.0-android.apk`** from the [latest release](https://github.com/FordNet-AI/drumford-x/releases/latest)
2. On your Android device, open the APK file via your file manager or browser downloads
3. Android will say "This type of file can harm your device" — that's the generic warning for non-Play-Store APKs. Tap **Install anyway** (or "Install from this source" once you grant permission).
4. **Samsung note:** if you have a Galaxy device, you may need to disable **Auto Blocker** first (Settings → Security and privacy → Auto Blocker → OFF). Samsung blocks sideloaded APKs by default.
5. Launch **DrumFord X** from your app drawer.

The APK is debug-signed, which is fine for sideloading but means it won't ever be on the Play Store from this signing key.

### Both platforms

After first launch, you'll land on an empty library. Two ways to get songs in:

- **Browse ParaDB tab** — the easiest path. Loads a local cache of every public chart, one-tap downloads straight into your library.
- **Import a song zip** (Android) or **drag a folder onto the app** (Windows) — for charts you already have.

---

## Features

| | |
|---|---|
| 🎼 **Chart playback** | Scroll-down highway, kick as full-width bar, customizable color per lane, accent / ghost note styling, hollow cymbals |
| 🥁 **Hit-line pulse** | Visual feedback when triggering notes cross the hit line (configurable per-lane) |
| 📚 **Library** | Sort by Date Added / Title / Artist / Complexity / Duration. Filter by difficulty. |
| 🌐 **ParaDB browser** | Local catalog of all ~6,000 community charts. Instant client-side search. Sort by Most Popular / Trending (7d / 30d) / Newest / Complexity / A→Z. Compact list view + grid view. |
| 🎛️ **Kit Setup** | Per-lane reorder, color, kind (drum / cymbal / full-width), enable/disable, pulse-trigger, custom-name. Optional presets: CHINA, SPLASH, HH-FOOT. Advanced instrument-class remapping. |
| 🎚️ **Live tuning** | Highway speed, note thickness, glow intensity, grid brightness, hit-line pulse strength. All sliders, all persistent. |
| ⏱️ **Sync controls** | Per-song speed multiplier (0.5×–1.5×), per-user sync offset (±2000 ms, click-to-type), metronome with full BPM-event awareness |
| 🎨 **Visual polish** | Custom FordNetAi branding, dark-navy color palette, hit-line cyan glow, lane background gradients, beat grid (downbeats stronger) |
| ⌨️ **Keyboard shortcuts** | Space = play/pause, Esc = close any modal |
| 🪟 **Frameless window** | Custom title bar on Windows. Standard Android UI on tablet. |

## Known limitations

- **Audio latency on tablet:** Android's audio pipeline has higher latency than desktop. Use the **Offset** control to compensate (typically +50–100 ms on a tablet).
- **No drag-and-drop on Android:** Replaced with a "Import Zip file" picker. ParaDB is the primary import path.
- **No code signing:** Windows SmartScreen + Android "Install Unknown Apps" warnings. Both are click-through but cosmetically rough.
- **No chart authoring:** This is a player, not an editor. Use Paradiddle's tools to make new charts.
- **Open hi-hat detection:** Not yet differentiated visually from closed hi-hat. The chart authoring community typically uses velocity to encode this; DrumFord X renders accent-velocity notes larger + with a glow, so well-charted songs already get visual distinction "for free."
- **Tempo changes:** Fully supported on the highway grid; tempo changes within a song re-anchor the beat grid correctly.

## Bugs / feedback

Open an issue: https://github.com/FordNet-AI/drumford-x/issues

Useful info to include:
- Platform (Windows or Android)
- App version (visible on the About tab)
- Song you were playing (link to ParaDB)
- What happened vs what you expected
- Browser console / adb logcat output if you can grab it

This is **alpha** — please report rough edges. That's literally why we shared.

---

## Build from source

### Requirements

- Node.js 22+ ([nodejs.org](https://nodejs.org))
- Git

### Run in dev (Windows / macOS / Linux)

```
git clone https://github.com/FordNet-AI/drumford-x
cd drumford-x
npm install
npm run dev:electron
```

Or on Windows the one-shot launcher: `start.bat`.

### Build Windows .exe

```
npm run build
npx electron-builder --dir   # produces release/win-unpacked/
```

The unpacked `.exe` sits at `release/win-unpacked/DrumFord X.exe`. To wrap as an NSIS installer you'd need Windows Developer Mode enabled (or Admin powershell) due to a symlink-extraction quirk in electron-builder. For alpha distribution the unpacked folder zipped is fine.

### Build Android APK

The `android-capacitor` branch has the Capacitor wrapper. CI builds the APK on every push to that branch and uploads it as an Actions artifact.

```
git checkout android-capacitor
npm install
npm run android:open        # opens Android Studio (needs JDK 21 + Android SDK)
# In Android Studio: Build → Build APK(s)
```

Easier path: download the APK from the [latest release](https://github.com/FordNet-AI/drumford-x/releases/latest).

### Regenerate icons

```
npm run icon            # regenerates public/icon.ico (Windows)
npm run android:icons   # regenerates android/app/src/main/res/mipmap-*/* (Android)
```

---

## Stack

Electron + Capacitor · React 19 · Vite 7 · TypeScript · Tailwind v4 · Zustand 5 · Web Audio API · IndexedDB (idb-keyval) · adm-zip + jszip

## Project layout

```
electron/         Electron main process (Windows shell, IPC, ParaDB API, zip extraction)
src/
  components/   React UI
    highway/    Canvas renderer + lane logic
    library/    Song cards, ParaDB browser, import
    setup/      Kit Setup, Quick Tuner popover, Add-Lane modal
    controls/   Transport bar widgets
  stores/       Zustand stores (player, library, kit, ui)
  lib/          Pure modules (parser, default kit, song storage, catalog cache, capacitor bridge)
  types/        Shared types
android/        Capacitor Android shell (only on android-capacitor branch)
public/         Static assets (icon, Fordnet logo, demo song)
scripts/        Build helpers
docs/           rlrrschema.json — official Paradiddle chart spec for reference
.github/        CI workflow (auto-builds Android APK)
```

---

## About Fordnet

Fordnet is the indie label behind DrumFord X. Built by Tim — drummer, builder, and recovering Quicken user — out of a desire to read Paradiddle charts without strapping a headset on every time.

## Credits

- **Paradiddle** — the VR drumming game and `.rlrr` chart format we play. Without it, this doesn't exist.
- **ParaDB.net** — the community-run chart database that DrumFord X integrates with.
- **Every chart author** — every drummer who has ever taken the time to chart a song. This whole experience runs on your work.

## License

MIT. See [LICENSE](LICENSE).

**Trademark notice:** *DrumFord X* and *Fordnet* are trademarks of Fordnet. The MIT license grants permission to use the source code; it does not grant permission to use these names or the Fordnet logo on derivative works. If you fork the project, please rename your fork.

## Notice

See [NOTICE.md](NOTICE.md) for the formal Paradiddle attribution and a summary of what this project does and doesn't redistribute.
