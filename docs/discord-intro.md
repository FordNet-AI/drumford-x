# Discord intro post — copy-paste templates

Three lengths depending on the channel vibe. Pick whichever fits.

---

## Long version (for #showcase / #made-with-paradiddle / #cool-stuff channels)

> Hey folks 👋 I've been building a thing and I wanted to share it for some alpha feedback.
>
> **DrumFord X** is a flat-screen player for Paradiddle charts. Same `.rlrr` files, same ParaDB integration, but renders the notes scrolling down a canvas highway you can read on a monitor or tablet — no headset, no controllers. It's a *visualizer*, not a game (no scoring, no input detection).
>
> Why I made it: I wanted to look at Paradiddle charts on days when I couldn't physically be in VR — at lunch breaks, on the couch with my tablet, while my partner is using the headset. Turned into a real little app.
>
> **What's in it:**
> - Browse and one-tap download from ParaDB (~6,000 charts, full local catalog, instant search)
> - Customizable kit (lane order, colors, optional china/splash/hihat-foot lanes)
> - Per-song speed control, sync offset, metronome
> - Highway speed / note thickness / glow / pulse — all user-tunable
> - Windows + Android (sideload, no Play Store)
>
> **Disclaimer:** Independent fan project. Not affiliated with Paradiddle. Doesn't replace the VR experience — it's a complement.
>
> **It's alpha.** I'm the only person who's tested it. Looking for ~5 brave souls who'd like to try it and tell me what breaks.
>
> Download + install instructions: https://github.com/FordNet-AI/drumford-x/releases/latest
>
> Bug reports / questions / general thoughts welcome in this thread or as GitHub issues. Cheers 🥁

---

## Medium version (for #general or busier channels)

> Made a flat-screen player for Paradiddle charts — Windows .exe + Android APK. Same `.rlrr` format, integrates with ParaDB, no headset needed.
>
> It's an alpha. Looking for testers willing to find the bugs.
>
> 🔗 https://github.com/FordNet-AI/drumford-x/releases/latest

---

## Short version (for #links or quick share)

> Flat-screen Paradiddle player (Windows + Android alpha): https://github.com/FordNet-AI/drumford-x/releases/latest 🥁

---

## Things to think about BEFORE posting

- **Check the Discord's rules.** Some communities require permission before self-promotion or new-project posts. Look for a #rules or #info channel.
- **Skim a few recent posts in the channel you're targeting.** Match the tone (casual / formal / techy).
- **Don't post in #help or #support** — those are for people troubleshooting Paradiddle itself.
- **Reply to bug reports promptly.** First impressions matter. A "thanks, fixing now" within an hour is worth more than a polished feature later.

## What to do if you get a flood of attention

- **Pin the GitHub Issues link in your reply.** Channel a "report bugs here" → consolidates feedback.
- **Don't promise specific features.** Say "I'll look into it" or "interesting, let me think." Easier to under-promise.
- **Tag posts with the version** ("v0.1.0 alpha") so people can tell stale reports apart from fresh ones.

## What to do if it lands flat

- That's fine! Means we have time to polish before a wider push.
- Most Paradiddle Discord activity is concentrated in a few core regulars. They'll see it eventually.
- Post once, don't repost. Patience.

## Replies to anticipate

> "Does it replace Paradiddle?"
**No.** Visualizer only. You still play the real thing in VR for the gameplay. This is for reading charts when you can't (or don't want to) headset up.

> "Is it on the Play Store?"
**No.** Sideload only for now. Maybe later if there's demand.

> "Does it work on Mac / iOS / Linux?"
**Windows + Android right now.** The source is open (MIT), and the renderer code is platform-agnostic — Mac/Linux Electron builds and iOS Capacitor builds are achievable but I haven't shipped them. Happy to take help.

> "Will it ever run on Quest?"
**Probably not.** Quest runs Android, but it's a VR-first OS. If you're already on Quest, you have Paradiddle proper — that's the better experience for that hardware.

> "Why MIT and not GPL?"
Personal preference. MIT means anyone can fork, modify, even commercialize. I'm not worried about anyone "stealing" this; I just want it to be useful.
