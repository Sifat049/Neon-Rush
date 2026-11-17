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
