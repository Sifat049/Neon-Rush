# NEON RUSH: GRAVITY RACER

A 3D anti-gravity arcade racer. You drive inside a square "gravity tube" and can rotate gravity onto the floor, left wall, right wall or ceiling. One codebase runs in macOS browsers, on Android (Capacitor) and on mobile web.

Stack: React, TypeScript, Vite, Three.js, React Three Fiber, drei, Zustand, Howler, Tailwind, Capacitor. All art and audio are generated in code.

## Run on macOS

You need Node.js 18 or newer (`node -v` to check).

```bash
cd "Neon Rush"
npm install
npm run dev          # opens a local server, usually http://localhost:5173
```

Other commands:

```bash
npm run typecheck    # TypeScript check only
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build
npx tsx scripts/sim-test.ts    # headless gameplay/AI test suite
npx tsx scripts/track-check.ts # track geometry report
```

## Build the Android APK

You need Android Studio (it installs the Android SDK and a JDK).

```bash
npm install
npm run build
npx cap sync android      # copies dist/ into the Android project
npx cap open android      # opens Android Studio
```

In Android Studio: wait for the Gradle sync, then **Build > Build Bundle(s) / APK(s) > Build APK(s)**. The debug APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a phone and install it, or press Run with a phone/emulator connected.

Command-line alternative (after Android Studio has installed the SDK):

```bash
cd android
./gradlew assembleDebug
```

A signed release APK needs your own keystore: **Build > Generate Signed Bundle / APK** in Android Studio.

App id: `com.neonrush.gravityracer`. The app is locked to landscape, hides the system bars, and the back button pauses the race.

## Controls

| Key | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake |
| A / D or Left / Right | Steer |
| Space | Jump |
| Shift | Boost |
| Z / C / X / Ctrl | Drift |
| Q / E | Rotate gravity left / right |
| Esc or P | Pause |
| Shift+R | Restart race |
| F | Fullscreen |

On touch devices large on-screen buttons appear (steer, gas, brake, jump, boost, drift, gravity). Size and visibility are in Settings.

## Game contents

- Modes: Quick Race (3 AI), Time Trial, Gravity Challenge, Free Drive
- Tracks: Neon City, Gravity Core, Void Station (the last two unlock with credits)
- Cars: 5 cars with different stats, 8 paints, 4 upgrade types with 5 levels each
- Progress (credits, XP, levels, unlocks, records, 12 achievements) is saved in LocalStorage under `neonrush.save.v1`
- Quality presets LOW / MEDIUM / HIGH, 30 / 60 / max FPS, render scale

## Project layout

```
src/app        App shell, fullscreen helper
src/ui         All menus, HUD, touch controls, results
src/scenes     3D scenes (menu world, race world, post-processing)
src/game       core (race rules), physics, ai, tracks, vehicles, audio, effects
src/store      Zustand stores and save data
src/controls   Keyboard / touch / gamepad input
scripts        Headless tests and track reports
android        Capacitor Android project
```

## What was tested, and what was not

Actually run:
- `npm run build` (TypeScript strict + Vite): passes.
- `npx tsx scripts/sim-test.ts`: 36 passed, 0 failed. It covers physics (accelerate, steer, brake, jump, boost, gravity switching, obstacles, falling and respawn, gap jumping), AI races on all three tracks, the Gravity Challenge and Time Trial. It simulates the game without graphics.
- `npx cap add android` and `npx cap sync android`: succeed.

NOT tested:
- The game was not opened in a browser during development, so visuals, shaders, audio and the DOM UI have only been type-checked and built, not looked at. Expect to tune small visual issues.
- The Android APK was not built: the development VM has no Android SDK. The Android project is generated, but nobody has installed or run it on a device.
- Touch controls and performance on real phones are untested.

## Known limitations

- No real-time shadows (glow and fog are used instead).
- Audio is synthesized, so it is simple compared with recorded music.
- No online multiplayer.
- AI cars are tuned by simulation, not by human play-testing, so difficulty may need adjusting.

## Phase 4A: Event modes (Drift Challenge, Stunt Arena, Police Chase)

Pick them in **Play > Race Setup**. They work on every track (including editor tracks) and every weather.

- **Drift Challenge (90 s).** Hold DRIFT (Z/C/X/Ctrl) and steer. A chain's points grow with speed, the multiplier rises every 2 s (max x5), pink rings mark x2 drift zones, and a chain is banked 0.9 s after you stop drifting (or automatically after 10 s). Hitting an obstacle or falling loses the live chain. Banking chains quickly builds a combo bonus.
- **Stunt Arena (90 s).** No obstacles; magenta ramps launch you (some are on the walls, so switch gravity). In the air hold **steer = spin** and **brake = flip**, release near a full turn and land clean. Clean tricks chain a combo (max x4); an unfinished rotation is a "sloppy landing" worth a quarter of the points.
- **Police Chase (up to 150 s).** Three police cars chase you and get faster with heat. Being rammed from behind fills the arrest meter (BUSTED at 100%). Two drones lock on and fire an EMP: boost, jump or switch gravity during the warning to dodge it. Ram a cop from the side or ahead to damage it (3 hits = takedown, +500). Win by holding a green zone with no cop within 45 m for 2.5 s (ESCAPED) or surviving the 150 s (SURVIVED).
- Results show rewards (credits + XP), and a local top-5 leaderboard per event and track (saved in LocalStorage). Three new achievements were added.

Code: `src/game/events/events.ts` (rules), `src/scenes/EventLayer.tsx` (rings, ramps, drones), HUD panel in `src/ui/HUD.tsx`.

### Tests for the event modes
```bash
npx tsx scripts/events-test.ts   # 42 checks, headless
```
It covers scoring, chain loss, tricks, ramps, police AI, arrest meter, takedowns, drone EMP, escape and reward summaries on all three tracks.

Not tested / known limits of Phase 4A:
- Visuals of rings, ramps, drones and police lights were not seen in a running browser. They are type-checked and built only.
- Medal thresholds come from bot runs (a perfect non-stop bot), not from human play-testing. Police difficulty was only checked with bots: a plain autopilot gets busted in 15-30 s, a bot that boosts and drifts escapes on all three tracks.
- Police cars look like ordinary cars in blue/red paint with flashing particle lights, not a dedicated model.
- Treasure Hunt and Street Racing events, multiplayer events and the Phase 4 open-world/maps are not part of this step.

## Phase 4B: Track editor, sharing, maps, weather

**Maps (4):** Neon Tokyo (rain), Sky District (sunset), Void Underground (night), Neon Wasteland (sandstorm). Weather can be overridden in Race Setup.

**Track editor** (Main Menu → Track Editor): 11 piece types (straight, curve, sharp turn, loop, spiral, ramp, bridge, tunnel, wall ride, ceiling, platform). Add after the selected piece, rotate (mirror), move, copy, delete, checkpoint flag, undo/redo, top-down preview with an animated preview lap, style (colours, width, lighting, weather, fog, sky, decor, obstacles, environment), race settings (laps, AI, racers, start slot, time limit). Pieces always snap end to end; the track must close into a loop and is validated (self-crossing or unplayable layouts are rejected). **Test race** and **Solo lap** play it immediately and return you to the editor. Saved tracks (max 50) appear in Race Setup.

**Sharing:** every track has a unique ID. Export/import JSON (file or paste), or a share code (`NR1.…`, with checksum, works offline). Imported tracks are validated and previewed before you accept them, and get a fresh ID. Optional online sharing with your own server:

```
npx tsx server/share-server.ts        # PORT=8787, DATA_DIR=server/data
```
Then type the server address (e.g. `http://192.168.1.20:8787`) in the editor's Save · Share tab. The server validates every upload, limits size (64 KB) and rate (20/min/IP). To use it from the GitHub Pages site you need an https server (Pages is https; browsers block http calls from it).

**Tests:** `npx tsx scripts/editor-test.ts` (38), `scripts/share-test.ts` (11, real HTTP), `scripts/events-test.ts` (42), `scripts/sim-test.ts` (42). `npx tsc --noEmit` is clean and the production build succeeds.

### Not built (honest list)
- **Open-world connected city, free roam, districts, garages, world map, chunk streaming:** not built. The game is a track racer; this needs a different architecture.
- **Multiplayer (Colyseus), car meet lobby, bikes:** not built.
- **Treasure Hunt, Street Racing, Gravity Challenge events:** not built (Drift, Stunt, Police are).
- **Flying vehicles, holo ads, dynamic resolution:** not built.
- **Not verified:** nothing was viewed in a real browser by me (rings, ramps, editor UI layout, touch use), the Android APK was not rebuilt, and medal/police difficulty was tuned with bots only, not by human play. Please play-test and report problems.
