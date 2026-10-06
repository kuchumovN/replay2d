# Skybox for CS2

Local web app that replays Counter-Strike 2 demos (`.dem`) as a 2D top-down view on the map radar.

- Players with view direction, HP, flash state, bomb carrier; death markers
- Grenades: flight paths, smokes (with countdown), fires, flash/HE bursts
- Bomb: drop, plant/defuse progress, timer, explosion; shot tracers
- Kill feed, scoreboard (HP, armor, money, weapon, utility, K/D/A), score
- Round strip, scrubber with kill/bomb markers, 0.25–8× speed
- Multi-level maps (Nuke, Vertigo, Train) are shown as radars side by side

## Requirements

Node.js 22+. Demo parsing uses [`@laihoe/demoparser2`](https://github.com/LaihoE/demoparser) (native, prebuilt for macOS/Linux/Windows).

## Setup

```sh
npm install
npm run fetch-maps        # radar images + calibration → web/public/maps (not committed)
```

`fetch-maps` downloads from [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons), which mirrors the
overviews from the game depot. Re-run it after map updates; `npm run fetch-maps -- de_nuke` updates selected maps only.
Radar images are Valve assets.

## Run

```sh
npm run dev               # server on :3001 + Vite on http://localhost:5173
npm start                 # production: builds the frontend, serves everything on http://127.0.0.1:3001
```

Drop a `.dem` file on the page. Parsed demos live in server memory only (last 3); the uploaded file is deleted
right after parsing. A page reload keeps the demo open while the server is running.

**Controls:** Space play/pause · ←/→ ±5 s (Shift ±1 s) · ↑/↓ previous/next round · +/− speed ·
scroll to zoom, drag to pan, double-click to reset · click a player in the scoreboard to highlight them.

## Tests

```sh
npm test
npm run typecheck
```

The parser integration test runs on `fixtures/test_demo.dem` if present (the public test demo from the
demoparser repo, `src/parser/test_demo.dem`) or on `SKYBOX_TEST_DEMO=/path/to.dem`.

## Layout

```
shared/   types shared by server and web (MatchMeta, RoundData, ...)
server/   Fastify API; parsing runs in a worker thread
  src/parse/rounds.ts   round slicing from game events
  src/parse/build.ts    parser output → per-round frames, events, grenades
web/      React + Canvas 2D viewer
  src/playback/         clock, interpolation, derived state (bomb, clock, score)
  src/render/           canvas layers
scripts/  fetch-maps
```

Data flow: `POST /api/demos` (raw body) → worker parses with demoparser2 → `GET /api/demos/:id` (status/meta) →
`GET /api/demos/:id/rounds/:n` (one round: positions on a 2-tick grid, slow state every 16 ticks, events).
