# Okibar Standalone Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Okibar as a self-contained Electron desktop app that runs the Express/socket.io back end in-process and shows the bar console in its own native window, while phones and the TV still join over the LAN.

**Architecture:** A new `electron/main.js` boots the existing `server/index.js` in Electron's main (Node) process, points the server's state file at a writable user-data dir, loads the baked-in YouTube key from a bundled `.env`, and opens a `BrowserWindow` at `http://localhost:5000/?mode=bar`. A new `GET /api/host` endpoint lets the bar console build QR codes from the machine's LAN IP instead of `localhost`. `electron-builder` produces the Linux AppImage/.deb first; Windows follows on a Windows host.

**Tech Stack:** Electron, electron-builder, existing Node/Express/socket.io back end, React (CRA) front end. User shell is **fish** — verification commands use `env VAR=val cmd` (fish does not support `VAR=val cmd` prefixes).

---

## File Structure

- **Create** `electron/main.js` — Electron entry: data dir + env wiring, port precheck, boots server, opens window with load-retry.
- **Create** `electron/preload.js` — minimal context-isolation preload (no privileged APIs in v1).
- **Modify** `server/index.js` — state-file path override; `/api/host` endpoint; explicit `0.0.0.0` bind; `require('os')`.
- **Modify** `src/services/api.js` — add `getHost()`.
- **Modify** `src/components/karaoke_queue.tsx` — `lanHost` state + fetch; QR `tableUrl` uses LAN host.
- **Modify** `package.json` — `main` → `electron/main.js`; Electron dev deps; `electron:dev` / `electron:build` scripts; `electron-builder` config bundling `.env`.

---

## Task 1: Server reads state-file path from env

**Files:**
- Modify: `server/index.js:30`

- [ ] **Step 1: Write the failing verification**

Create a temp state file and confirm the server restores from a custom path only when honored:

```bash
cd ~/Projects/Okibar
echo '{"queue":[{"title":"SENTINEL"}]}' > /tmp/okibar-test-state.json
env OKIBAR_STATE_FILE=/tmp/okibar-test-state.json PORT=5055 timeout 3 node server/index.js 2>&1 | grep "Restored venue state from /tmp/okibar-test-state.json"
```

- [ ] **Step 2: Run it to verify it fails**

Expected: **no output / non-zero grep** — the server currently ignores `OKIBAR_STATE_FILE` and reads `server/state.json`.

- [ ] **Step 3: Make the minimal change**

In `server/index.js`, change line 30 from:

```js
const STATE_FILE = path.join(__dirname, 'state.json');
```

to:

```js
const STATE_FILE = process.env.OKIBAR_STATE_FILE || path.join(__dirname, 'state.json');
```

- [ ] **Step 4: Run the verification to confirm it passes**

```bash
env OKIBAR_STATE_FILE=/tmp/okibar-test-state.json PORT=5055 timeout 3 node server/index.js 2>&1 | grep "Restored venue state from /tmp/okibar-test-state.json"
```

Expected: prints `💾 Restored venue state from /tmp/okibar-test-state.json`.

- [ ] **Step 5: Confirm dev fallback still works**

```bash
env PORT=5055 timeout 3 node server/index.js 2>&1 | grep "Okibar server running on port 5055"
```

Expected: server still starts with no env override (uses `server/state.json`).

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat(server): allow state-file path override via OKIBAR_STATE_FILE"
```

---

## Task 2: Server `/api/host` endpoint + explicit LAN bind

**Files:**
- Modify: `server/index.js` (top requires; new route before the `app.get('*')` catch-all at the bottom; `server.listen` call)

- [ ] **Step 1: Write the failing verification**

```bash
cd ~/Projects/Okibar
env PORT=5056 timeout 4 node server/index.js >/tmp/okibar-host.log 2>&1 &
sleep 2
curl -s http://localhost:5056/api/host
echo
```

- [ ] **Step 2: Run it to verify it fails**

Expected: the response is the React `index.html` (the catch-all), **not** JSON — `/api/host` does not exist yet.

- [ ] **Step 3: Add the `os` require**

At the top of `server/index.js`, alongside the other requires (after `const fs = require('fs');`), add:

```js
const os = require('os');
```

- [ ] **Step 4: Add a LAN-IP helper and the route**

Immediately **before** the catch-all `app.get('*', ...)` near the bottom of `server/index.js`, add:

```js
// --- LAN HOST (for guest QR codes) ---
// The desktop window loads the console from localhost, but phones must reach
// this machine by its LAN IP. Resolve the first non-internal IPv4 address.
function getLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

app.get('/api/host', (req, res) => {
  res.json({ host: `${getLanIp()}:${PORT}` });
});
```

- [ ] **Step 5: Make the LAN bind explicit**

Change the `server.listen` call from:

```js
server.listen(PORT, async () => {
```

to:

```js
server.listen(PORT, '0.0.0.0', async () => {
```

- [ ] **Step 6: Run the verification to confirm it passes**

```bash
env PORT=5056 timeout 4 node server/index.js >/tmp/okibar-host.log 2>&1 &
sleep 2
curl -s http://localhost:5056/api/host
echo
```

Expected: JSON like `{"host":"192.168.x.y:5056"}` (or `127.0.0.1:5056` if offline).

- [ ] **Step 7: Commit**

```bash
git add server/index.js
git commit -m "feat(server): add /api/host LAN-IP endpoint and bind 0.0.0.0"
```

---

## Task 3: Bar console builds QR from LAN host

**Files:**
- Modify: `src/services/api.js` (add `getHost`)
- Modify: `src/components/karaoke_queue.tsx:49` area (new state), an effect near it, and `:1184` (`tableUrl`)

- [ ] **Step 1: Add `getHost` to the API service**

In `src/services/api.js`, inside the `apiService` object, after `getCachedSongs`, add a comma and:

```js
  // Get this machine's LAN host (ip:port) for guest QR deep links
  getHost: async () => {
    const response = await fetch(`${API_BASE_URL}/host`);
    return response.json();
  }
```

(Ensure the preceding `getCachedSongs` entry now ends with a comma.)

- [ ] **Step 2: Add `lanHost` state**

In `src/components/karaoke_queue.tsx`, with the other `useState` declarations near the top of `KaraokeBarApp` (e.g. just after the `theme` state around line 69), add:

```js
  const [lanHost, setLanHost] = useState(null);   // ip:port for guest QR (from /api/host)
```

- [ ] **Step 3: Fetch the LAN host on mount**

With the component's other `useEffect` hooks, add:

```js
  // The desktop window serves the console from localhost; phones can't reach
  // that. Ask the server for its LAN ip:port and build QR links from it.
  useEffect(() => {
    apiService.getHost()
      .then((data) => { if (data && data.host) setLanHost(data.host); })
      .catch(() => {});
  }, []);
```

(`apiService` is already imported — it is used for song search. If the import is missing, add `import apiService from '../services/api';`.)

- [ ] **Step 4: Use the LAN host in `tableUrl`**

Replace line 1184:

```js
  const tableUrl = (n) => `${window.location.origin}/?mode=table&table=${n}`;
```

with:

```js
  const tableUrl = (n) => {
    const base = lanHost ? `http://${lanHost}` : window.location.origin;
    return `${base}/?mode=table&table=${n}`;
  };
```

- [ ] **Step 5: Verify the production build compiles**

```bash
cd ~/Projects/Okibar && npm run build 2>&1 | tail -5
```

Expected: `Compiled successfully` (or only pre-existing warnings); a fresh `build/` is produced. The runtime QR behavior is verified in Task 6's smoke test.

- [ ] **Step 6: Commit**

```bash
git add src/services/api.js src/components/karaoke_queue.tsx build
git commit -m "feat(ui): build guest QR codes from LAN host instead of localhost"
```

---

## Task 4: Electron app shell (deps, main, preload, dev script)

**Files:**
- Modify: `package.json` (deps, `main`, `electron:dev` script)
- Create: `electron/main.js`
- Create: `electron/preload.js`

- [ ] **Step 1: Install Electron dev dependencies**

```bash
cd ~/Projects/Okibar
npm install --save-dev electron@31 electron-builder@24
```

Expected: both packages added to `devDependencies`.

- [ ] **Step 2: Point `package.json` `main` at the Electron entry and add the dev script**

In `package.json`, change:

```json
  "main": "server/index.js",
```

to:

```json
  "main": "electron/main.js",
```

(The `start` script — `node server/index.js` — names the file explicitly, so headless run is unaffected.)

Add to the `scripts` block:

```json
    "electron:dev": "npm run build && electron .",
```

- [ ] **Step 3: Create the preload script**

Create `electron/preload.js`:

```js
// Minimal preload. Context isolation is on and node integration is off, so the
// renderer (the React console) runs as a normal web page talking to the local
// server over HTTP/sockets. No privileged bridge is needed in v1.
window.addEventListener('DOMContentLoaded', () => {});
```

- [ ] **Step 4: Create the main process**

Create `electron/main.js`:

```js
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

const PORT = process.env.PORT || 5000;
let mainWindow = null;

// 1. Writable data dir — a packaged app cannot write inside its install dir.
const userDataDir = app.getPath('userData');
fs.mkdirSync(userDataDir, { recursive: true });
process.env.OKIBAR_STATE_FILE = path.join(userDataDir, 'state.json');

// 2. Baked-in YouTube key: load the bundled .env (repo root in dev,
//    process.resourcesPath when packaged) before the server reads it.
const envCandidates = [
  path.join(process.resourcesPath || '', '.env'),
  path.join(__dirname, '..', '.env'),
];
for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

// Resolve once a TCP port is found free (or report it busy).
function checkPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Okibar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loadWhenReady();
}

// The window may be created before server.listen() finishes; retry the load.
function loadWhenReady(attempt = 0) {
  const url = `http://localhost:${PORT}/?mode=bar`;
  mainWindow.loadURL(url).catch(() => {});
  mainWindow.webContents.once('did-fail-load', () => {
    if (attempt < 20) {
      setTimeout(() => loadWhenReady(attempt + 1), 400);
    } else {
      dialog.showErrorBox('Okibar', 'Could not load the bar console — the server did not start.');
    }
  });
}

app.whenReady().then(async () => {
  const free = await checkPortFree(PORT);
  if (!free) {
    dialog.showErrorBox('Okibar', `Okibar is already running, or port ${PORT} is in use.`);
    app.quit();
    return;
  }
  // Boot the bundled back end in-process.
  require(path.join(__dirname, '..', 'server', 'index.js'));
  createWindow();
});

app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 5: Run the app**

```bash
cd ~/Projects/Okibar && npm run electron:dev
```

Expected: a native **Okibar** window opens showing the **bar console** (not a browser). The terminal logs `🚀 Okibar server running on port 5000`. Close the window; the process exits.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron/main.js electron/preload.js
git commit -m "feat(desktop): add Electron shell booting the server in a native window"
```

---

## Task 5: Packaging config (electron-builder, Linux targets, bundled .env)

**Files:**
- Modify: `package.json` (build scripts + `build` config block)

- [ ] **Step 1: Add build scripts**

In `package.json` `scripts`, add:

```json
    "electron:build": "npm run build && electron-builder --linux",
    "electron:pack": "npm run build && electron-builder --linux --dir",
```

(`electron:pack` produces an unpacked dir — faster for smoke-testing than a full installer.)

- [ ] **Step 2: Add the electron-builder config**

Add a top-level `"build"` block to `package.json`:

```json
  "build": {
    "appId": "com.okibar.app",
    "productName": "Okibar",
    "files": [
      "build/**/*",
      "server/**/*",
      "electron/**/*",
      "node_modules/**/*",
      "!**/node_modules/.cache",
      "!server/state.json"
    ],
    "extraResources": [
      { "from": ".env", "to": ".env" }
    ],
    "linux": {
      "target": ["AppImage", "deb"],
      "category": "AudioVideo"
    }
  }
```

Notes: `!server/state.json` keeps your dev venue state out of the shipped binary (fresh installs start empty via the server's existing no-file path). `extraResources` copies the gitignored `.env` into `process.resourcesPath` so the baked-in key ships without being committed.

- [ ] **Step 3: Produce an unpacked build**

```bash
cd ~/Projects/Okibar && npm run electron:pack 2>&1 | tail -15
```

Expected: completes with a `dist/linux-unpacked/` directory containing an `okibar-karaoke` (or `Okibar`) executable. Confirm the `.env` was bundled:

```bash
find ~/Projects/Okibar/dist -name .env
```

Expected: a path under `dist/linux-unpacked/resources/.env`.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build(desktop): electron-builder config for Linux AppImage/deb"
```

---

## Task 6: Build the AppImage and smoke-test end to end

**Files:** none modified — this task verifies the deliverable.

- [ ] **Step 1: Build the Linux installer artifacts**

```bash
cd ~/Projects/Okibar && npm run electron:build 2>&1 | tail -20
ls -lh dist/*.AppImage dist/*.deb
```

Expected: an `*.AppImage` and a `*.deb` in `dist/`.

- [ ] **Step 2: Run the AppImage from a clean working dir**

```bash
chmod +x ~/Projects/Okibar/dist/*.AppImage
cd /tmp && ~/Projects/Okibar/dist/*.AppImage
```

Expected: the **Okibar** window opens to the bar console.

- [ ] **Step 3: Verify LAN access + QR from a second device**

On a phone/tablet on the same WiFi, open `http://<this-machine-LAN-IP>:5000/?mode=table&table=1` (find the IP via `ip -4 addr` or the bar console's QR). Expected: the guest table view loads and song-queue changes sync to the desktop window.
Then scan a table QR shown in the bar console. Expected: the QR encodes `http://<LAN-IP>:5000/...` (not `localhost`) and the device enters that table.

- [ ] **Step 4: Verify state persists to the user-data dir**

```bash
ls -l ~/.config/Okibar/state.json
```

Expected: the file exists and updates as you change the queue. Close and relaunch the AppImage — the previous venue state is restored (terminal/log shows `Restored venue state from .../Okibar/state.json`).

- [ ] **Step 5: Verify port-in-use guard**

Launch a second instance while the first runs. Expected: a native dialog "Okibar is already running, or port 5000 is in use." and the second instance quits.

- [ ] **Step 6: Tag the deliverable (no code change to commit)**

```bash
cd ~/Projects/Okibar
git tag -a desktop-v1 -m "Standalone Linux desktop build (AppImage + deb)"
```

Windows builds (`electron-builder --win` with `nsis` + `portable` targets) follow on a Windows host or via a Wine-enabled runner — out of scope for this Linux-first pass.

---

## Self-Review Notes

- **Spec coverage:** writable data dir (T1, T4), `/api/host` + LAN bind (T2), LAN-IP QR (T3), Electron shell with in-process server (T4), baked-in `.env` (T4 load + T5 bundle), Linux AppImage/.deb (T5–T6), port-in-use + load-retry error handling (T4), headless regression + LAN + persistence verification (T1, T6). macOS and Windows correctly deferred as non-goals/Linux-first.
- **Deviation from spec:** the spec mentioned seeding `state.json` from a bundled default on first run; dropped per YAGNI — the server already starts with empty state when no file exists, which is the desired clean first-run behavior. `!server/state.json` in the build `files` ensures dev state isn't shipped.
- **Naming consistency:** `OKIBAR_STATE_FILE`, `/api/host` → `{host}`, `getHost()`, `lanHost`, `tableUrl` used identically across server, api service, and component tasks.
