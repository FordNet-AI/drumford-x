# Intro post — copy-paste templates

Three lengths depending on the channel/community vibe. Pick whichever fits.
Framed for **real-kit drummers** who want to read charts on a screen by their kit.

---

## Long version (for #showcase / project-share / gear channels)

> Hey folks 👋 I've been building a thing and I wanted to share it for some alpha feedback.
>
> **DrumFord X** is a flat-screen drum chart reader. Prop a tablet or monitor next to your kit and the notes scroll down a highway in time with the song — so you can read a chart while you actually play. It's a *visualizer*, not a game: no scoring, no input detection, just the chart.
>
> Why I made it: I'm a drummer and I wanted a clean way to read drum charts on a screen by my kit, without messing with PDFs or sheet music or a headset.
>
> **What's in it:**
> - Browse + one-tap download ~6,000 community charts (instant search, full local catalog)
> - Reads the open `.rlrr` chart format
> - Customizable kit (lane order, colors, optional china/splash/hihat-foot lanes)
> - Per-song speed control (0.5×–1.5×), sync offset, metronome
> - Highway speed / note thickness / glow / pulse — all user-tunable
> - Windows + Android (sideload, no Play Store)
>
> **It's alpha.** Looking for a few brave souls who'd like to try it and tell me what breaks.
>
> Download + install instructions: https://github.com/FordNet-AI/drumford-x/releases/latest
>
> Bug reports / questions / general thoughts welcome in this thread or as GitHub issues. Cheers 🥁

---

## Medium version (for #general or busier channels)

> Made a flat-screen drum chart reader — prop a tablet by your kit, the notes scroll in time with the song. Windows .exe + Android APK. ~6,000 community charts, one-tap download.
>
> It's an alpha. Looking for testers willing to find the bugs.
>
> 🔗 https://github.com/FordNet-AI/drumford-x/releases/latest

---

## Short version (for #links or quick share)

> Flat-screen drum chart reader for real kits (Windows + Android alpha): https://github.com/FordNet-AI/drumford-x/releases/latest 🥁

---

## Things to think about BEFORE posting

- **Check the community's rules.** Some require permission before self-promotion or new-project posts. Look for a #rules or #info channel.
- **Skim a few recent posts in the channel you're targeting.** Match the tone (casual / formal / techy).
- **Reply to bug reports promptly.** First impressions matter. A "thanks, fixing now" within an hour is worth more than a polished feature later.

## What to do if you get a flood of attention

- **Pin the GitHub Issues link in your reply.** "Report bugs here" → consolidates feedback.
- **Don't promise specific features.** Say "I'll look into it" or "interesting, let me think." Easier to under-promise.
- **Tag posts with the version** ("v0.1.0 alpha") so people can tell stale reports apart from fresh ones.

## What to do if it lands flat

- That's fine! Means we have time to polish before a wider push.
- Post once, don't repost. Patience.

## Replies to anticipate

> "Is it a game / does it score me?"
**No.** Visualizer only — it shows you the chart while you play your own kit. No input detection, no scoring.

> "Where do the charts come from?"
**Community uploads via paradb.net** — browse and one-tap download right in the app. You can also import your own `.rlrr` chart folders.

> "Is it on the Play Store?"
**No.** Sideload only for now. Maybe later if there's demand.

> "Does it work on Mac / iOS / Linux?"
**Windows + Android right now.** The source is open (MIT) and the renderer is platform-agnostic — Mac/Linux Electron builds and iOS Capacitor builds are achievable but I haven't shipped them. Happy to take help.

> "Why MIT and not GPL?"
Personal preference. MIT means anyone can fork, modify, even commercialize. I just want it to be useful.
