# NOTICE

This file documents the third-party relationships of **DrumFord X** and the things it does and does not redistribute.

---

## Paradiddle (Studio Cor)

DrumFord X is an independent fan project. It is **not affiliated with, endorsed by, sponsored by, or otherwise connected to** Studio Cor or the Paradiddle VR drumming game.

DrumFord X is compatible with the `.rlrr` chart format used by Paradiddle. The format is plain JSON; this project parses and renders it for the purpose of interoperability — letting users of Paradiddle view their charts on a flat screen. The project does **not** redistribute:

- Any Paradiddle game code
- Any Paradiddle assets (textures, models, audio, fonts, UI)
- Any Paradiddle executable or binary

The official `rlrrschema.json` is included in [`docs/rlrrschema.json`](docs/rlrrschema.json) as a reference for the chart format. This file is sourced from Studio Cor's open-source [ParadiddleUtilities](https://github.com/Paradiddle-Stuff/ParadiddleUtilities) toolkit and is reproduced as documentation under the same terms.

For the official Paradiddle game and chart authoring tools, see:
- Paradiddle: <https://paradiddleapp.com/>
- ParadiddleUtilities: <https://github.com/Paradiddle-Stuff/ParadiddleUtilities>

If a representative of Studio Cor would like any change to this notice or to this project's use of the `.rlrr` format, please open an issue on this repository.

---

## ParaDB (paradb.net)

DrumFord X integrates with ParaDB, a community-run database of Paradiddle charts. The integration uses ParaDB's public HTTP API to:

- Fetch the public catalog of charts (`GET /api/maps`)
- Download a chart zip on user request (`GET /api/maps/[id]/download`)

DrumFord X does **not** scrape, mirror, or redistribute the ParaDB catalog beyond what is necessary to render the in-app browser. The cached catalog is stored locally in the user's IndexedDB and is refreshed on the user's manual request, not on a schedule.

If ParaDB would like the integration changed or removed, please open an issue.

---

## Audio

DrumFord X **does not host, redistribute, or scan audio of any kind.**

- The application is a chart visualizer. It plays back audio files that the user supplies themselves, either by importing a song folder or by downloading a chart zip from ParaDB (which itself contains user-supplied audio).
- No copyrighted audio is included in this repository or in any released binary.
- DrumFord X does not perform stem separation, source separation, or any other transformation of audio that would create a derivative work.

Users are responsible for ensuring they have the right to play the audio they import. The MIT license disclaims all warranty regarding such use.

---

## Chart authors

Every chart playable in DrumFord X was authored by a member of the Paradiddle community. This project is built on their work and has no value without it. If you are a chart author and you would like a specific chart removed from any DrumFord X feature (e.g., a featured-chart list), please open an issue.

---

## Trademarks

*DrumFord X* and *Fordnet* are trademarks of Fordnet. The MIT license covers the source code only; it does not grant rights to use these names, the Fordnet logo, or any related marks on derivative works. Forks must be renamed.

*Paradiddle* is a trademark of Studio Cor. *ParaDB* is a name used by the ParaDB.net community.
