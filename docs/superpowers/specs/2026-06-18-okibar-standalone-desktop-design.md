# Okibar Standalone Desktop App — Design

**Date:** 2026-06-18
**Status:** Approved (design phase)

## Overview

Package Okibar as a self-contained desktop application that bundles **both** the
Express/socket.io back end and the operator front end, with the bar console
rendered in its **own native window** (not a browser tab). Guest phones (`table`)
and the big-screen player (`tv`) continue to connect over the venue WiFi exactly
as they do today.

Target platforms: **Linux** (AppImage + `.deb`) and **Windows** (NSIS installer +
portable `.exe`).

Packaging technology: **Electron + electron-builder**. Electron's main process
runs the existing Node back end in-process (no separate Node install required),
and opens a `BrowserWindow` for the bar console.

## Goals

- One double-clickable program that starts the server and shows the bar console
  in a native window.
- Other devices (phones, TV) still join over the LAN at `http://<host-ip>:5000`.
- Minimal changes to existing application code — packaging, not a rewrite.
- YouTube API key baked into the shipped binary (single-venue use); not committed
  to git in plaintext.

## Non-Goals

- macOS builds (not requested).
- Multi-role window switching / running the TV from the same machine.
- Per-operator API-key configuration UI (key is baked in).
- Auto-update infrastructure.
- Real authentication hardening (existing `staffPin` deterrent is unchanged).

## Architecture

```
┌─────────────────────────── Electron app ───────────────────────────┐
│  main process (Node)                                                │
│   1. resolve writable data dir  (app.getPath('userData'))           │
│   2. load bundled .env  → process.env.YOUTUBE_API_KEY               │
│   3. set process.env.OKIBAR_STATE_FILE = <userData>/state.json      │
│   4. require('../server/index.js')  → Express+socket.io on 0.0.0.0  │
│   5. BrowserWindow → http://localhost:5000/?mode=bar                │
└─────────────────────────────────────────────────────────────────────┘
        ▲ localhost (operator)            ▲ LAN  http://<host-ip>:5000
        │                                  │
   bar console window              phones (table) + TV (tv)  via WiFi
```

The back end is unchanged in behavior; it simply (a) reads its state-file path
and API key from environment variables that the Electron main process supplies,
and (b) binds to all interfaces so LAN devices can reach it.

## Components

### 1. `electron/main.js` (new)
App entry point (`"main"` in `package.json` switches to this for the Electron
build, while `npm start` keeps booting the bare server for headless use).
Responsibilities:
- Compute the writable data dir via `app.getPath('userData')`; ensure it exists.
- On **first run**, seed `<userData>/state.json` from the bundled default if none
  exists (so a fresh install starts clean, existing installs keep their data).
- Load the bundled `.env` (from the packaged resources path) and set
  `process.env.YOUTUBE_API_KEY` before requiring the server.
- Set `process.env.OKIBAR_STATE_FILE` to `<userData>/state.json`.
- `require('../server/index.js')` to boot the back end.
- Create the `BrowserWindow` (maximizable, sensible min size) loading
  `http://localhost:5000/?mode=bar` once the server's `listen` callback fires.
- Quit the app (and the server process) when the window closes.

### 2. `electron/preload.js` (new, minimal)
Standard context-isolation preload. No privileged APIs needed for v1 — included
so the window runs with `contextIsolation: true` and `nodeIntegration: false`.

### 3. `server/index.js` (modified — small)
- Line 30: `const STATE_FILE = process.env.OKIBAR_STATE_FILE || path.join(__dirname, 'state.json');`
  (falls back to current behavior when run headless / in dev).
- Add a **LAN-host endpoint** `GET /api/host` returning `{ host: "<lan-ip>:<port>" }`,
  where `<lan-ip>` is derived from `os.networkInterfaces()` (first non-internal
  IPv4). This is server-side so it works identically in the desktop window and in
  a plain browser.
- `server.listen(PORT, ...)` → `server.listen(PORT, '0.0.0.0', ...)` to guarantee
  LAN binding (Node defaults to all interfaces, but we make it explicit).

### 4. `src/components/karaoke_queue.tsx` (modified — small)
- Replace `tableUrl(n)` (line 1184) so the QR host comes from the
  `/api/host` value when available, falling back to `window.location.origin`.
  Concretely: fetch `/api/host` once on mount, store the LAN host, and build
  `http://<lanHost>/?mode=table&table=${n}`. When the bar console is already
  loaded via the LAN IP (browser case) this yields the same URL; when loaded via
  `localhost` (desktop window) it now yields a phone-reachable URL.
- This is the only front-end change; both QR usages (lines 1309, 1510) go through
  `tableUrl`, so fixing it once covers both.

### 5. `package.json` (modified)
- Add `electron` and `electron-builder` to `devDependencies`.
- Add scripts:
  - `electron:dev` — build React (or use the running dev server) and launch Electron pointing at the local server.
  - `electron:build` — `react-scripts build` then `electron-builder` for the current OS.
  - `electron:build:all` — build Linux + Windows targets (Windows cross-build via Wine on Linux, or built on a Windows machine).
- Add an `electron-builder` config block (or `electron-builder.yml`):
  - `appId`, `productName: "Okibar"`.
  - `files`: `build/**`, `server/**`, `electron/**`, `node_modules/**` (production deps).
  - `extraResources`: bundle `.env` into the app resources.
  - Linux targets: `AppImage`, `deb`. Windows targets: `nsis`, `portable`.

## Data & Config Locations (packaged)

| Item | Dev / headless | Packaged desktop app |
|------|----------------|----------------------|
| `state.json` | `server/state.json` | `<userData>/state.json` |
| YouTube key | `.env` next to source | `.env` bundled in app resources → `process.env` |
| React build | served from `build/` | served from `build/` inside the asar/resources |

`<userData>` resolves to e.g. `~/.config/Okibar/` (Linux) or
`%APPDATA%\Okibar\` (Windows). Writing state there avoids the read-only
install-dir problem on Windows and inside the AppImage.

## API Key Handling

Chosen approach: **baked in**. To honor that without committing the secret to
git, the real key stays in the existing **gitignored `.env`**, and
`electron-builder` packages that `.env` into the app's resources at build time.
`main.js` loads it and sets `process.env.YOUTUBE_API_KEY` before the server
starts. Result: the shipped binary "just works," and the plaintext key is never
committed to the repository.

## Error Handling

- **Port 5000 in use:** the server `listen` will emit `EADDRINUSE`; `main.js`
  catches it and shows a native error dialog ("Okibar is already running, or port
  5000 is busy") instead of a blank window, then quits.
- **Server boot failure / window load failure:** `did-fail-load` on the window
  retries once after a short delay (covers the race where the window loads before
  `listen` completes), then surfaces a dialog.
- **No LAN connection:** `/api/host` returns `127.0.0.1` if no external IPv4 is
  found; the bar console still works locally and the QR simply won't be reachable
  by phones (expected when offline).
- Existing app-level resilience (`ErrorBoundary`, YouTube cached fallback, kiosk
  guards) is unchanged.

## Testing / Verification

1. **Headless regression:** `npm start` still boots the bare server using
   `server/state.json` (env fallback path) — confirms no dev-flow breakage.
2. **State path:** with `OKIBAR_STATE_FILE` set, server reads/writes the override
   location; without it, the old path.
3. **`/api/host`:** returns a `<ip>:5000` shaped value; QR string built from it.
4. **Desktop smoke test (Linux dev machine):** run `electron:dev`; verify the bar
   console opens in a native window, a second device on the LAN can load
   `http://<host-ip>:5000/?mode=table`, scanning the bar QR enters a table, and
   socket sync (queue/tables) works across window + phone.
5. **Packaged artifact:** build the Linux AppImage, run it on a clean path, verify
   state persists to `<userData>` across restarts. Windows `.exe` verified on a
   Windows machine (or via Wine smoke test).

## Risks / Open Items

- **Windows cross-building from Linux** needs Wine, or a Windows box / CI runner.
  If Wine is unavailable, Linux builds ship first and Windows follows on a Windows
  host. (Not a blocker for the Linux deliverable.)
- **Binary size** ~150–200 MB per platform (Electron baseline) — acceptable for a
  venue install.
- **`node_modules` packaging:** ensure production deps (googleapis is large) are
  included and dev deps excluded via electron-builder's `files` filtering.
```
