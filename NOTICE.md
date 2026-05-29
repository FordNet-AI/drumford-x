# NOTICE

This file documents the third-party relationships of **DrumFord X** and the things it does and does not redistribute.

---

## Independent project

DrumFord X is an independent project. It plays the open `.rlrr` drum-chart format and is **not affiliated with, endorsed by, sponsored by, or otherwise connected to** the makers of that format.

The `.rlrr` format is plain JSON; this project parses and renders it for the purpose of **interoperability** — letting drummers read charts on a flat screen. DrumFord X does **not** redistribute any third-party game code, assets (textures, models, audio, fonts, UI), executables, or binaries.

---

## Community charts (paradb.net)

DrumFord X integrates with [paradb.net](https://paradb.net), a community-run database of `.rlrr` drum charts. The integration uses paradb.net's public HTTP API to:

- Fetch the public catalog of charts (`GET /api/maps`)
- Download a chart zip on user request (`GET /api/maps/[id]/download`)

DrumFord X does **not** scrape, mirror, or redistribute the catalog beyond what is necessary to render the in-app browser. The cached catalog is stored locally in the user's IndexedDB and refreshed only on the user's manual request, not on a schedule. API requests retry politely with backoff and honor rate limits.

If paradb.net's operator would like the integration changed or removed, please open an issue.

---

## Audio

DrumFord X **does not host, redistribute, or scan audio of any kind.**

- The application is a chart visualizer. It plays back audio files that the user supplies themselves, either by importing a song folder or by downloading a chart zip (which itself contains user-supplied audio).
- No copyrighted audio is included in this repository or in any released binary.
- DrumFord X does not perform stem separation, source separation, or any other transformation of audio that would create a derivative work.

Users are responsible for ensuring they have the right to play the audio they import. The MIT license disclaims all warranty regarding such use.

---

## Chart authors

Every chart playable in DrumFord X was authored by a member of the drumming community. This project is built on their work and has no value without it. If you are a chart author and you would like a specific chart removed from any DrumFord X feature, please open an issue.

---

## Trademarks

*DrumFord X* and *Fordnet* are trademarks of Fordnet. The MIT license covers the source code only; it does not grant rights to use these names, the Fordnet logo, or any related marks on derivative works. Forks must be renamed.

Other names and formats referenced are the property of their respective owners.
