# Replay2D for CS2

Replays Counter-Strike 2 demos (`.dem`) as a 2D top-down view on the map radar. Runs entirely in the browser
(the demo is parsed locally and never uploaded) or as a desktop app.

- Players with view direction, HP, flash state, bomb carrier; death markers
- Grenades: flight paths, smokes (with countdown), fires, flash/HE bursts
- Bomb: drop, plant/defuse progress, timer, explosion; shot tracers
- Kill feed, scoreboard (HP, armor, money, weapon, utility, K/D/A), score
- Round strip, scrubber with kill/bomb markers, 0.25–8× speed
- Multi-level maps (Nuke, Vertigo, Train) are shown as radars side by side

## Web version

**https://kuchumovn.github.io/replay2d/** — open it and drop a `.dem` file. The demo is parsed in your browser
and never leaves your computer. A full pro match takes 10–15 s and ~2 GB of memory (desktop browsers; phones may
run out of memory). The site is deployed to GitHub Pages on every push to `main` (`.github/workflows/pages.yml`).

## Desktop app (Windows / macOS)

Download the installer from [Releases](https://github.com/kuchumovN/replay2d/releases):

- **macOS (Apple Silicon, M1 and newer):** `Replay2D-<version>-mac-apple-silicon.dmg` → drag Replay2D to Applications.
  Intel Macs are not supported (the parser has no current Intel build).
- **Windows (x64):** `Replay2D-<version>-windows-setup.exe` → installs and starts in one click.

Radar images are bundled, so it works offline. Demos are read straight from disk (no copy).

**Updates:** on launch the app checks the latest GitHub Release; the button in the top-right corner shows
“Update to vX.Y.Z” when there is one (or checks on click). On Windows it downloads the installer, installs silently
and restarts; on macOS it downloads and opens the `.dmg` — drag Replay2D to Applications again.

The builds are not code-signed, so the first launch shows a warning:

- **macOS:** “Replay2D can’t be opened / Apple could not verify…” → System Settings → Privacy & Security →
  **Open Anyway** (once). If it says the app is damaged: `xattr -dr com.apple.quarantine /Applications/Replay2D.app`.
- **Windows:** SmartScreen “Windows protected your PC” → **More info** → **Run anyway**.

### Building it

```sh
npm run desktop          # run the desktop app from source
npm run desktop:dist     # installer for the current OS → desktop/release/
```

Releases are built by GitHub Actions (`.github/workflows/release.yml`) on macOS and Windows runners:
push a tag `vX.Y.Z` → installers are attached to a GitHub Release with that version. Running the workflow
manually builds them as workflow artifacts only. `node desktop/scripts/make-icon.mjs` regenerates the icon.

## Requirements

Node.js 22+. Demo parsing uses [demoparser2](https://github.com/LaihoE/demoparser): the desktop app uses the
native Node module (`@laihoe/demoparser2`), the browser a WebAssembly build of the same version made from source.
Building it needs Rust (`rustup target add wasm32-unknown-unknown`), [wasm-pack](https://github.com/rustwasm/wasm-pack)
and `protoc` ([protobuf](https://github.com/protocolbuffers/protobuf/releases); or `PROTOC=/path/to/protoc`).

## Setup

```sh
npm install
npm run fetch-maps        # radar images + calibration → web/public/maps (not committed)
npm run build-wasm        # browser demo parser → web/src/parse/demoparser (not committed)
```

`build-wasm` fetches demoparser at the pinned version into `wasm/vendor`, applies `wasm/demoparser.patch`
(lets it run on wasm) and builds the bindings in `wasm/src/lib.rs`, which mirror the Node ones.

`fetch-maps` downloads from [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons), which mirrors the
overviews from the game depot. Re-run it after map updates; `npm run fetch-maps -- de_nuke` updates selected maps only.
Radar images are Valve assets. Weapon and grenade icons (`web/src/assets/weapons`) come from
[lexogrine/cs2-react-hud](https://github.com/lexogrine/cs2-react-hud) (MIT); kill feed modifiers and armor icons (`web/src/assets/hud`) are CS2 HUD icons (Valve assets) from
[Juknum/counter-strike-icons](https://github.com/Juknum/counter-strike-icons).

## Run

```sh
npm run dev               # Vite on http://localhost:5173
npm run build             # static site → web/dist (any static hosting, any base path)
```

Drop a `.dem` file on the page. It is parsed in a Web Worker (a full pro match takes 10–15 s and ~2 GB of memory);
the result lives in the tab only (last 3 demos), so a page reload closes the demo. Phones may run out of memory
on full matches; use the desktop app for those.

**Controls:** Space play/pause · ←/→ ±5 s (Shift ±1 s) · ↑/↓ previous/next round · +/− speed ·
scroll to zoom, drag to pan, double-click to reset · click a player in the scoreboard to highlight them.

## Tests

```sh
npm test
npm run typecheck
```

The parser integration tests run on `fixtures/test_demo.dem` if present (the public test demo from the
demoparser repo, `src/parser/test_demo.dem`) or on `REPLAY2D_TEST_DEMO=/path/to.dem`; one of them checks that the
wasm build produces the same result as the native parser.

## Layout

```
shared/   types and the parsing pipeline shared by web and desktop
  src/parse/pipeline.ts demoparser2 calls (behind a DemoParser interface: native or wasm)
  src/parse/rounds.ts   round slicing from game events
  src/parse/build.ts    parser output → per-round frames, events, grenades
web/      React + Canvas 2D viewer
  src/parse/            wasm parser in a Web Worker, parsed demos of the tab
  src/playback/         clock, interpolation, derived state (bomb, clock, score)
  src/render/           canvas layers
wasm/     WebAssembly bindings of demoparser2 (Rust)
server/   desktop backend (Fastify): native parser in a worker thread
desktop/  Electron app: runs the server in-process on a random local port
  src/main.ts           window, server start, native parser location
  src/preload.ts        window.replay2d bridge (file path + token for /api/demos/local)
  scripts/bundle.mjs    esbuild bundles + web build → desktop/dist
  scripts/dist.mjs      stage, native parser, electron-builder
scripts/  fetch-maps, build-wasm
```

Data flow. Browser: the file goes to a Web Worker → copied into wasm memory → `parseDemo` → meta and rounds are
posted back to the page. Desktop: `POST /api/demos/local` (file path) → worker thread with the native parser →
`GET /api/demos/:id` (status/meta) → `GET /api/demos/:id/rounds/:n`. A round holds positions on a 2-tick grid,
slow state every 16 ticks and events.
