# DrumFord X — Google Play submission checklist

Everything needed to get DrumFord X onto Google Play, with the answers
pre-filled so you can transcribe them into the Console. Target the **Internal
testing** track first (fast, no production review gate). The signed `.aab` is
produced by CI — see the bottom for how to get it.

---

## ✅ Already done (by the build prep on `android-play`)

- [x] Signed-AAB build pipeline — `.github/workflows/android-release.yml`
- [x] Release signing wired into `android/app/build.gradle` (env-var driven)
- [x] Upload keystore generated; 4 GitHub secrets set
      (`ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`)
- [x] Keystore backup + passwords saved to `D:\Fordnet\drumford-play-signing\`
- [x] 512×512 icon + 1024×500 feature graphic — `docs/play-assets/`
- [x] Privacy policy — `docs/privacy-policy.md`
- [x] `applicationId` / package name: `com.fordnet.drumfordx` (permanent once published)
- [x] targetSdk 36 (current; meets Play's target-API requirement)

## 🔑 BACK UP THE KEYSTORE (do this first)

`D:\Fordnet\drumford-play-signing\upload-keystore.jks` + `CREDENTIALS.txt`.
Copy both to a password manager / cloud / second drive. If you lose the upload
key it's resettable under Play App Signing, but don't rely on that. **This
folder is NOT in the git repo** (deliberately).

---

## 1. Developer account (the big gate)

- [ ] **Register as an ORGANIZATION** (recommended — you have the LLC). This avoids
      the 20-tester/14-day rule that personal accounts hit before they can ship
      to production.
  - Needs a **D-U-N-S number** (free from Dun & Bradstreet; can take a few days
    to ~2 weeks — request it early). Org name should match the LLC.
- [ ] Pay the **one-time $25** registration fee.
- [ ] Complete Google's identity verification.

> Alternative: a personal account is faster to open but forces a 20-tester
> closed test for 14 days before production. For an alpha on Internal testing
> this is less of a blocker, but org is the better long-term call.

## 2. Host the privacy policy (need a public URL)

- [x] GitHub Pages enabled — serving `android-play` `/docs`. **Live & verified
      (HTTP 200, rendered HTML):**
      <https://fordnet-ai.github.io/drumford-x/privacy-policy>
- [ ] Paste that URL into the Console's required Privacy Policy field.

## 3. Create the app in Play Console

- [ ] Apps → Create app. Name: **DrumFord X**. Default language: English (US).
      Type: **App**. Free. Confirm declarations.
- [ ] Opt into **Play App Signing** (default; Google holds the app-signing key,
      you upload with the upload key we generated).

## 4. Store listing (copy-paste ready)

- **App name:** `DrumFord X`
- **Short description (≤80 chars):**
  `Read drum charts on a flat screen, right next to your kit.`
- **Full description (paste):**
  ```
  DrumFord X is a flat-screen drum chart visualizer for real kits. Prop a
  tablet or monitor next to your kit and read the chart scrolling down a
  highway in time with the song — no headset, no scoring, no input detection.
  Just the chart while you play.

  • Browse ~6,000 community-uploaded charts from paradb.net and download with one tap
  • Reads the open .rlrr chart format
  • Customize your kit: lane order, colors, note thickness, glow, highway speed
  • Per-song speed (0.5×–1.5×), sync offset, and a metronome
  • Separate volume for the drum track and backing track

  DrumFord X is a read-only visualizer. It does not host or distribute song
  audio — you supply your own. Independent project; not affiliated with the
  makers of the .rlrr format.
  ```
- **App icon:** `docs/play-assets/icon-512.png`
- **Feature graphic:** `docs/play-assets/feature-graphic-1024x500.png`
- **Phone screenshots (≥2):** use `docs/screenshots/*.jpg` for now (Internal
  testing is lenient). Refine later with real Android captures.
- **Category:** Music & Audio. **Tags:** drums, music, charts.
- **Contact email:** your support email.

## 5. Content rating (IARC questionnaire)

- [ ] Category: **Utility / Productivity / Other** (it's a tool, not a game).
- [ ] Answers: no violence, no sexual content, no profanity, no gambling, no
      user-to-user communication, no location sharing. Expected rating: **Everyone**.

## 6. Data safety form (pre-filled answers)

- [ ] **Does your app collect or share any user data?** → **No.**
- [ ] No data types collected. No data shared. No data processed ephemerally.
- [ ] (If asked about it) the only network calls are to paradb.net to fetch/
      download public community charts — no user data is sent.
- This matches `docs/privacy-policy.md` exactly.

## 7. App access

- [ ] **All functionality available without special access** (no login/credentials).

## 8. Ads

- [ ] **No, my app does not contain ads.**

## 9. Upload the bundle

- [x] Signed AAB already built & downloaded:
      `D:\Fordnet\DrumFord X\release-android\app-release.aab` (3.3 MB).
      Built by CI run 26763961848 (commit `76bb731`) → **versionName 0.1.0,
      versionCode 5**. Verified: valid AAB, web bundle embedded, signed with the
      Play upload key. To rebuild later, re-run "Build Android AAB (Play)" and
      download artifact **drumford-x-play-aab**.
- [ ] Release → **Testing → Internal testing** → Create new release → upload the
      `.aab` → add release notes (reuse the v0.1.0 notes) → roll out.
- [ ] Add testers (your email + friends) to the Internal testing list; share the
      opt-in link. Installs come straight from Play after that.

## ⚠️ Content-policy note

An app that downloads charts tied to copyrighted songs *can* draw reviewer
scrutiny under Play's IP policy. You're defensible — DrumFord X hosts no audio,
charts are note-timing data, users supply their own audio, it's a reader not a
pirate tool, and the in-app + listing disclaimers say so. If a review flags it,
respond with exactly that framing. Internal testing generally isn't reviewed as
hard as production, so it's a low-risk place to start.

## Version strategy

- CI sets `versionCode` = the workflow run number (auto-increments per build)
  and `versionName` = `0.1.0`. Each AAB you upload will have a higher
  versionCode than the last automatically. Bump `versionName` (in the workflow's
  `-PvName=` flag) when you cut a real new version.
