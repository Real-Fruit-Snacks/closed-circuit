<div align="center">

  # Closed Circuit

  **A browser horror game about a night-shift security guard. "I'm on Observation Duty"-style spot-the-anomaly, skinned as a CCTV monitoring station.**

  [![License: MIT](https://img.shields.io/badge/License-MIT-cba6f7.svg)](https://opensource.org/licenses/MIT)
  [![Version](https://img.shields.io/badge/version-1.0.0-89b4fa)](https://github.com/Real-Fruit-Snacks/closed-circuit/releases)
  
  [Play Closed Circuit](https://real-fruit-snacks.github.io/closed-circuit) • [Report Issue](https://github.com/Real-Fruit-Snacks/closed-circuit/issues)

</div>

---

## Overview

You work the overnight desk at ARGUS monitoring a wall of CCTV feeds: watch the cameras, log what's wrong, follow your post orders. At 4:15 AM, a new camera appears on the board. It's your apartment. You're in it. Live.

100% procedural — no image or audio assets, everything is canvas drawing and WebAudio synthesis. The whole build is **31 KB**.

## Play it locally

Double-click `game/index.html`. That's it — no build step, no server needed
(classic script tags, no modules). Chrome/Edge/Firefox all work.

For development with capture tooling: `node server.js` then open http://localhost:8311
(`server.js` is dev-only; it is not part of the itch build).

## The night (spoilers — this is your design doc)

| Clock | Event |
|-------|-------|
| 12:00 | Shift starts. 6 streams in queue. Rulebook opens (diegetic tutorial). |
| 12:38 | Anomalies start spawning. Rate escalates from ~50s to ~17s apart by 5 AM. |
| 1:30  | Supervisor reminds you §4: modcam stays on. |
| 2:10  | The lamp in **your** room (modcam, sidebar) goes out. No fanfare. |
| 3:33  | A figure stands in your doorway for 8 seconds. You cannot flag your own camera. |
| 4:15  | `strm_0413 — apartment_cam (UNREGISTERED DEVICE)` joins the queue. It's the reverse angle of your desk cam — you can see yourself at the desk, moving in real time. Logging it returns NO INCIDENT ON RECORD — the entry is accepted, then scrubbed. |
| 4:40  | Something stands where that camera is. It blocks most of your window. |
| 5:20  | The door behind you is open now. Supervisor: "you're almost through. don't get up." |
| 5:50  | apartment_cam goes SOURCE OFFLINE. |
| 6:00  | Shift complete. Ending varies: clean board / sloppy board, modified by whether you ever opened stream 0413, and how many times you flagged it. |

## Core rule: filing is not fixing (v0.2)

Nothing you file gets repaired. Filing an entry satisfies *the platform* — it stops that
event from draining LOG INTEGRITY and adds a row to your shift report. The thing on
camera **stays**. Rooms accumulate wrongness all night; your shift log [L] is how you
remember what's already documented versus what's new.

- Each fresh event drains integrity for ~75s (the documentation window). After that the
  queue stops caring — but your report permanently shows it as MISSED unless you file it
  late for half credit. Failure = neglecting several fresh events at once, not one slip.
- **Figures escalate.** Stage 1: somewhere it shouldn't be. Stage 2: closer — and it
  prefers to move while you're watching a different stream. Stage 3: facing the camera,
  room darkening around it, presence drone in your headphones. Then it leaves on its own
  schedule. Filing it never makes it leave. Nothing makes it leave.
- The one exception: FEED events (camera tilt/zoom/static) recalibrate ~30–45s after being
  filed. The platform repairs its own equipment. Only its own equipment.
- Shift end grades your documentation: **ACCURATE** (≥90% coverage) / **INCOMPLETE** (≥60%)
  / **NEGLIGENT**, with a full incident record — every event, when it started, when you
  filed it or that you didn't. Entries filed on apartment_cam show as [ENTRY REMOVED].

Fail state: integrity at zero → every feed seizes, your modcam goes fullscreen, and
something is behind your chair. SIGNAL LOST.

39 anomalies across the 6 public streams, 6 event classes (PERSON / REMOVED / ADDED /
MOVED / LIGHT / FEED). The public cameras now carry **environmental clues** — a figure out
by the gas pumps, a car that parks outside then leaves, a face on the late news, a box
cutter that's there and then gone, keys removed from the lobby rack — that piece together
one night. The looming silhouette itself is reserved for your apartment cam and desk cam.

## Controls

- **←/→** or **1–7** — switch streams (mouse: click the queue)
- **F** or **Space** — file an entry on the stream you're viewing, then pick a class (1–6)
- **L** — shift log · **R** — post orders · **M** — mute · **ESC** — close panels
- **0** — enlarge your desk cam · **click any feed** to enlarge it (click again / ESC to shrink)
- False entries get rate-limited (8s, grows on repeats). Duplicates get a gentler 3s.

## Uploading to itch.io

1. itch.io → Dashboard → **Create new project**
2. **Kind of project:** HTML
3. Upload `closed-circuit-v0.7.0.zip` and check **"This file will be played in the browser"**
4. **Embed options:** 1280 × 720, enable *Fullscreen button*, leave *Mobile friendly* off
   (it's mouse-playable but designed for desktop)
5. Suggested tags: `horror`, `anomaly`, `observation`, `liminal-space`, `short`,
   `singleplayer`, `night-shift`, `analog-horror`

### Suggested page copy

> **CLOSED CIRCUIT** — *the overnight watch*
>
> You work the night security desk at ARGUS, watching a wall of CCTV feeds — a gas station,
> a laundromat, a daycare, an office, a warehouse, an apartment lobby. Watch the cameras,
> follow your post orders, and **log** anything that's wrong. Nothing you log gets fixed.
> It only gets *documented*.
>
> Your desk cam stays on for the whole shift. That's §4. You agreed to it.
>
> At 4:15 AM a new camera joins the board. UNREGISTERED DEVICE. It's the reverse angle of
> your own desk cam. It's your apartment. You're already inside.
>
> Look closely — the cameras don't just glitch. A figure out by the pumps. A car that parks,
> waits, and is gone. A face on the late news. Pieces of a night that's coming to your door.
>
> ⏱ One shift ≈ 9 minutes · 🎧 headphones recommended · 👁 39 anomalies, a scripted descent,
> multiple endings · 100% procedural — no asset files, no jumpscare spam.

## Tuning

All difficulty knobs live at the top of `game/js/director.js` (`MQ.TUNE`): shift length,
spawn curve, integrity drain/regen, ticket delay, rate-limit growth. Debug mode:
`index.html?debug=1` runs time at 6× and exposes `MQ.skipTo(min)`, `MQ.forceSpawn(i)`,
`MQ.win()`, `MQ.fail()` in the console.

## Architecture (for future-you)

- `js/paint.js` — the lo-fi camera look: pre-rendered noise frames, scanlines, vignette,
  band-glitch, light pools, and the shared `fig()` silhouette
- `js/scenes.js` — all 7 streams + modcam. A scene = draw function reading a state object
  `S`; anomalies are just boolean flags on `S`. Add an anomaly = add a flag + a list entry.
- `js/director.js` — spawner, integrity, the scripted timeline (`SCRIPT` array)
- `js/audio.js` — all synthesized: room-tone bed, per-stream hiss retuning, danger drone
  tied to integrity, UI cues, dread thuds
- `js/main.js` — state machine, render loop (scenes at ~13fps on purpose), ticket flow
- DOM chrome is the moderation console; canvas is only used for the "video" feeds

`_caps/` is dev scratch (canvas captures for visual review) — ignore it.
