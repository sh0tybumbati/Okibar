# Cantina v1 "Finish" Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Cantina v1 — TV second window, Open Tabs screen, owner-toggle bill splits, floor click→checkout, app icon, Windows build — plus fix three brand wordmarks the rebrand regex missed.

**Architecture:** All app-feature work lands in the single big component `src/components/karaoke_queue.tsx`, reusing existing handlers (`openCheckout`, `computeSplit`, `finalizeCheckout`, synced `groupHistory`). The TV window and icon/Windows build touch the Electron layer (`electron/main.js`, `electron/preload.js`) and the electron-builder config in `package.json`.

**Tech Stack:** React (CRA), Electron 31 + electron-builder 24, lucide-react icons, rsvg-convert + ImageMagick for icon rasterization, wine for the Windows build. Shell is fish/zsh — no `VAR=val cmd` prefixes; use `env`.

**Branch:** `feature/cantina-v1-finish` (already created).

---

## File Structure

- **Modify** `src/components/karaoke_queue.tsx` — wordmark fixes, TV button, Tabs page + `openTabs`/`settleTab`, owner-toggle `computeSplit` + modal UI, floor token `onClick`.
- **Modify** `electron/preload.js` — expose `window.cantina` bridge.
- **Modify** `electron/main.js` — `open-tv-window` IPC + second `BrowserWindow`.
- **Create** `build-assets/icon.svg` and rasterized `icon.png` / `icon.ico`.
- **Modify** `package.json` — electron-builder `directories.buildResources`, `linux.icon`, `win` target, `electron:build:win` script.

---

## Task 1: Fix missed brand wordmarks

**Files:** Modify `src/components/karaoke_queue.tsx` (lines 1514, 1567, 2060)

- [ ] **Step 1: Confirm the missed occurrences**

Run: `grep -n 'Oki<span' src/components/karaoke_queue.tsx`
Expected: three lines (1514, 1567, 2060) rendering `Oki<span className="brand-text">bar</span>`.

- [ ] **Step 2: Replace all three**

Replace every occurrence of:

```jsx
Oki<span className="brand-text">bar</span>
```

with:

```jsx
Can<span className="brand-text">tina</span>
```

(Use a replace-all; the string is identical in all three spots.)

- [ ] **Step 3: Verify no visible "Okibar" remains**

Run: `grep -rniE 'okibar' src/ public/ | grep -v 'pin::v1'`
Expected: **no output** (only `hash.js` PIN_SALT is intentionally retained, and it's excluded here).

- [ ] **Step 4: Commit**

```bash
git add src/components/karaoke_queue.tsx
git commit -m "fix(brand): replace split Okibar wordmarks missed by rebrand regex"
```

---

## Task 2: TV as a second window (Electron)

**Files:**
- Modify: `electron/preload.js`
- Modify: `electron/main.js`
- Modify: `src/components/karaoke_queue.tsx` (header, ~line 2071)

- [ ] **Step 1: Expose the bridge in preload**

Replace the entire contents of `electron/preload.js` with:

```js
const { contextBridge, ipcRenderer } = require('electron');

// Bridge for the desktop bar console. `isDesktop` lets the web UI show
// desktop-only controls (e.g. "Open TV Window") and hide them in a browser.
contextBridge.exposeInMainWorld('cantina', {
  isDesktop: true,
  openTvWindow: () => ipcRenderer.send('open-tv-window'),
});
```

- [ ] **Step 2: Add the IPC handler + TV window in main**

In `electron/main.js`, change the first require to include `ipcMain`:

```js
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
```

Add near the other module-scope state (after `let mainWindow = null;`):

```js
let tvWindow = null;
```

Add this handler inside the `app.whenReady().then(...)` callback, right after `createWindow();`:

```js
  ipcMain.on('open-tv-window', () => {
    if (tvWindow && !tvWindow.isDestroyed()) {
      tvWindow.focus();
      return;
    }
    tvWindow = new BrowserWindow({
      width: 1280,
      height: 720,
      title: 'Cantina — TV',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    tvWindow.loadURL(`http://localhost:${PORT}/?mode=tv`).catch(() => {});
    tvWindow.on('closed', () => { tvWindow = null; });
  });
```

- [ ] **Step 3: Add the "Open TV Window" button to the bar header**

In `src/components/karaoke_queue.tsx`, locate the edit-mode button block in the bar header (ends ~line 2071 with `)}` after the `Edit Tables` button). Immediately after that closing `)}`, add:

```jsx
              {typeof window !== 'undefined' && window.cantina?.isDesktop && (
                <button
                  onClick={() => window.cantina.openTvWindow()}
                  className="btn btn-sm ml-2 btn-ghost"
                  title="Open the TV/player view in its own window"
                >
                  <Monitor className="w-4 h-4" /> TV Window
                </button>
              )}
```

(`Monitor` is already imported from lucide-react.)

- [ ] **Step 4: Build the renderer**

Run: `npm run build 2>&1 | grep -iE 'Compiled|Failed'`
Expected: `Compiled successfully.`

- [ ] **Step 5: Smoke-test in Electron**

```bash
cd ~/Projects/Okibar && (npx electron . >/tmp/cantina-tv.log 2>&1 &); sleep 6
grep -E "server running|Client connected" /tmp/cantina-tv.log
```
Expected: server boots and the bar window connects. Then **manually** click "TV Window" in the bar header → a second window titled "Cantina — TV" opens to the player view; clicking again focuses it (no third window). Close both, then:
```bash
pkill -9 -f "electron \." 2>/dev/null; pkill -9 -f ".mount_Cantina" 2>/dev/null
```

- [ ] **Step 6: Commit**

```bash
git add electron/preload.js electron/main.js src/components/karaoke_queue.tsx
git commit -m "feat(desktop): open the TV/player view in a second window via IPC"
```

---

## Task 3: Open Tabs screen

**Files:** Modify `src/components/karaoke_queue.tsx` (helpers after `finalizeCheckout` ~line 1130; nav array ~2041; nav label render ~2090; new page block before `barPage === 'settings'` ~2880)

- [ ] **Step 1: Add `openTabs` derivation and `settleTab` handler**

Immediately after the `finalizeCheckout` function (after its closing `};`, ~line 1130), add:

```jsx
  // Outstanding tabs = archived checkouts left unpaid (Close as Tab).
  const openTabs = Object.entries(groupHistory)
    .flatMap(([groupKey, entries]) => (entries || []).map(e => ({ ...e, groupKey })))
    .filter(e => e.paid === false && (e.amountTab || 0) > 0)
    .sort((a, b) => new Date(b.checkoutTime) - new Date(a.checkoutTime));

  // Settle an open tab in full: mark it paid and zero the outstanding balance.
  const settleTab = (groupKey, entryId) => {
    setGroupHistory(prev => ({
      ...prev,
      [groupKey]: (prev[groupKey] || []).map(e =>
        e.id === entryId
          ? { ...e, amountPaid: (e.amountPaid || 0) + (e.amountTab || 0), amountTab: 0, paid: true, settledAt: new Date().toISOString() }
          : e
      ),
    }));
    pushToast('Tab settled', 'success');
  };
```

- [ ] **Step 2: Add the nav tab with a count badge**

In the nav tabs array (~line 2041), add after the `history` entry:

```jsx
      { id: 'tabs', label: '💳 Tabs' },
```

Then in the nav button render (~line 2091), change the label cell from `{tab.label}` to:

```jsx
                {tab.label}{tab.id === 'tabs' && openTabs.length ? ` (${openTabs.length})` : ''}
```

- [ ] **Step 3: Add the Tabs page block**

Immediately before the `{barPage === 'settings' && (` block (~line 2880), add:

```jsx
          {barPage === 'tabs' && (
            <div className="space-y-3">
              <h3 className="h-display text-xl mb-2">Open Tabs</h3>
              {openTabs.length === 0 && <div className="muted text-sm">No open tabs.</div>}
              {openTabs.map(tab => (
                <div key={tab.id} className="panel p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{tab.groupName} · Table {tab.tableNumber}</div>
                    <div className="text-xs dim">
                      {(tab.members || []).map(m => m.name).join(', ') || `Table of ${tab.guestCount}`}
                      {' · '}{new Date(tab.checkoutTime).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="money" style={{ color: 'var(--warn)' }}>{currency}{(tab.amountTab || 0).toFixed(2)}</span>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => askConfirm({
                        title: `Settle ${tab.groupName}'s tab?`,
                        body: `${currency}${(tab.amountTab || 0).toFixed(2)} will be marked paid.`,
                        confirmLabel: 'Collect & Settle',
                        onConfirm: () => settleTab(tab.groupKey, tab.id),
                      })}
                    >
                      <CheckCircle className="w-4 h-4" /> Collect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
```

(`askConfirm`, `pushToast`, `currency`, `CheckCircle` are all already in scope.)

- [ ] **Step 4: Build the renderer**

Run: `npm run build 2>&1 | grep -iE 'Compiled|Failed'`
Expected: `Compiled successfully.`

- [ ] **Step 5: Smoke-test the flow**

Run the dev server (`env PORT=5000 node server/index.js &`), open `http://localhost:5000/?mode=bar`. Create a table with orders, check out via **Close as Tab** with an unpaid balance → the **💳 Tabs** nav shows `(1)` and lists the tab. Click **Collect → Collect & Settle** → it disappears, badge clears, and the **History** page shows the entry as paid. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add src/components/karaoke_queue.tsx
git commit -m "feat(bar): Open Tabs screen to view and settle outstanding tabs"
```

---

## Task 4: Owner-toggle bill splits

**Files:** Modify `src/components/karaoke_queue.tsx` (`computeSplit` ~1019; `openCheckout` ~1043; new `sharedOwners` state ~88; modal IIFE ~1357; modal shared-items UI ~1402)

- [ ] **Step 1: Add `sharedOwners` modal state**

Next to `const [checkoutPaid, setCheckoutPaid] = useState({});` (~line 88), add:

```jsx
  const [sharedOwners, setSharedOwners] = useState({}); // sharedItemKey -> string[] memberIds (subset that splits it)
```

- [ ] **Step 2: Reset it when the checkout modal opens**

In `openCheckout` (~line 1043), after `setCheckoutPaid({});` add:

```jsx
    setSharedOwners({});
```

- [ ] **Step 3: Rework `computeSplit` to honor owners**

Replace the whole `computeSplit` function (~lines 1019–1041) with:

```jsx
  // Split a table's confirmed orders by member. Member-tagged items go to that
  // member; each shared (untagged) item is divided among its "owners" — the
  // members ticked for it (default: everyone). An empty owner set falls back to
  // all members so a shared item's cost is never dropped.
  const computeSplit = (tableNum, owners = {}) => {
    const t = tables[tableNum] || {};
    const members = t.members || [];
    const allIds = members.map(m => m.id);
    const orders = t.orders || [];
    const perMember = {};
    members.forEach(m => { perMember[m.id] = { id: m.id, name: m.name, items: [], itemsTotal: 0, total: 0 }; });
    let sharedItems = [];
    let sharedTotal = 0;
    orders.forEach(o => {
      if (o.memberId && perMember[o.memberId]) {
        perMember[o.memberId].items.push(o);
        perMember[o.memberId].itemsTotal += o.price;
      } else {
        const key = sharedItems.length;            // index within the shared list
        sharedItems.push({ ...o, _key: key });
        sharedTotal += o.price;
      }
    });
    if (members.length) {
      sharedItems.forEach(item => {
        const picked = (owners[item._key] && owners[item._key].length) ? owners[item._key] : allIds;
        const each = item.price / picked.length;
        picked.forEach(id => { if (perMember[id]) perMember[id].total += each; });
      });
      members.forEach(m => { perMember[m.id].total += perMember[m.id].itemsTotal; });
    }
    return { members, perMember, sharedItems, sharedTotal, grandTotal: t.totalSpent || 0 };
  };
```

- [ ] **Step 4: Pass owners into the modal's split + add the toggle handler**

In the checkout modal IIFE (~line 1359), change:

```jsx
        const split = computeSplit(checkout.tableNum);
```

to:

```jsx
        const split = computeSplit(checkout.tableNum, sharedOwners);
        const allIds = split.members.map(m => m.id);
        const ownersFor = (key) => sharedOwners[key] && sharedOwners[key].length ? sharedOwners[key] : allIds;
        const toggleOwner = (key, mid) => setSharedOwners(prev => {
          const cur = prev[key] && prev[key].length ? prev[key] : allIds;
          const next = cur.includes(mid) ? cur.filter(x => x !== mid) : [...cur, mid];
          return { ...prev, [key]: next };
        });
```

- [ ] **Step 5: Render the shared-item owner toggles**

In the modal, immediately after the lines list `</div>` (the closing of the `space-y-2 max-h-[46vh]...` block, ~line 1402) and before the totals `subpanel`, add:

```jsx
              {hasMembers && split.sharedItems.length > 0 && (
                <div className="subpanel p-3 mt-3 space-y-2">
                  <div className="label">Shared items — tap who's splitting each</div>
                  {split.sharedItems.map(item => (
                    <div key={item._key} className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm">{item.name} <span className="dim">{currency}{item.price.toFixed(2)}</span></div>
                      <div className="flex gap-1 flex-wrap">
                        {split.members.map(m => {
                          const on = ownersFor(item._key).includes(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleOwner(item._key, m.id)}
                              className={`btn btn-xs ${on ? 'btn-primary' : 'btn-ghost'}`}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
```

- [ ] **Step 6: Update the "split evenly" helper text**

Change the modal subtitle (~line 1378) from:

```jsx
                {split.sharedTotal > 0 && hasMembers && <> Shared items ({currency}{split.sharedTotal.toFixed(2)}) are split evenly.</>}
```

to:

```jsx
                {split.sharedTotal > 0 && hasMembers && <> Shared items ({currency}{split.sharedTotal.toFixed(2)}) split among whoever you tick below.</>}
```

- [ ] **Step 7: Point `finalizeCheckout` at the owner-aware split**

In `finalizeCheckout` (~line 1069), change `const split = computeSplit(tableNum);` to:

```jsx
    const split = computeSplit(tableNum, sharedOwners);
```

- [ ] **Step 8: Build the renderer**

Run: `npm run build 2>&1 | grep -iE 'Compiled|Failed'`
Expected: `Compiled successfully.`

- [ ] **Step 9: Smoke-test the math**

Bar console: table with 2 named guests + one shared item (e.g. a $10 appetizer, no guest tag). Open checkout → default per-member totals include $5 each of the shared item. Untick one guest on that item → the other guest's total jumps to the full $10; per-member line totals always sum to the bill total. Confirm "Paid & Check Out" archives correctly.

- [ ] **Step 10: Commit**

```bash
git add src/components/karaoke_queue.tsx
git commit -m "feat(checkout): per-shared-item owner toggles instead of even split"
```

---

## Task 5: Floor click → checkout

**Files:** Modify `src/components/karaoke_queue.tsx` (floor token render ~line 2153)

- [ ] **Step 1: Add the click handler to occupied tokens**

On the floor token element (the `div` with `className={`floor-table ...`}` ~line 2153), add an `onClick` that opens checkout only in normal mode for occupied tables. Add this prop to that element:

```jsx
                      onClick={() => { if (!isEditMode && occupied) openCheckout(String(table.number)); }}
```

(`occupied`, `isEditMode`, `table`, and `openCheckout` are all in scope at this point in the floor map.)

- [ ] **Step 2: Build the renderer**

Run: `npm run build 2>&1 | grep -iE 'Compiled|Failed'`
Expected: `Compiled successfully.`

- [ ] **Step 3: Smoke-test**

Floor tab: occupy a table, click its token (normal mode) → checkout modal opens for that table. Switch to **Arrange** mode → clicking/dragging repositions the token and does NOT open checkout. Empty tokens do nothing on click in normal mode.

- [ ] **Step 4: Commit**

```bash
git add src/components/karaoke_queue.tsx
git commit -m "feat(floor): click an occupied table token to check it out"
```

---

## Task 6: App icon (neon mic + 'C')

**Files:** Create `build-assets/icon.svg`, `build-assets/icon.png`, `build-assets/icon.ico`; modify `package.json`

- [ ] **Step 1: Author the SVG**

Create `build-assets/icon.svg` (1024×1024) — a microphone inside a neon 'C' on a dark bar background:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#1b2440"/>
      <stop offset="100%" stop-color="#0a0e17"/>
    </radialGradient>
    <linearGradient id="neon" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22d3ee"/>
      <stop offset="100%" stop-color="#e11d8f"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <path d="M720 300a300 300 0 1 0 0 424" fill="none" stroke="url(#neon)" stroke-width="70"
        stroke-linecap="round" filter="url(#glow)"/>
  <g filter="url(#glow)">
    <rect x="452" y="300" width="120" height="250" rx="60" fill="#e2e8f0"/>
    <path d="M388 520a124 124 0 0 0 248 0" fill="none" stroke="#e2e8f0" stroke-width="28" stroke-linecap="round"/>
    <rect x="496" y="640" width="32" height="96" rx="16" fill="#e2e8f0"/>
    <rect x="430" y="730" width="164" height="30" rx="15" fill="#e2e8f0"/>
  </g>
</svg>
```

- [ ] **Step 2: Rasterize to PNG and ICO**

```bash
cd ~/Projects/Cantina 2>/dev/null || cd ~/Projects/Okibar
rsvg-convert -w 1024 -h 1024 build-assets/icon.svg -o build-assets/icon.png
convert build-assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 build-assets/icon.ico
ls -lh build-assets/icon.png build-assets/icon.ico
```
Expected: both files exist; `icon.png` is 1024×1024.

- [ ] **Step 3: Point electron-builder at the icon**

In `package.json` `build`, add a `directories` key and a `linux.icon`:

```json
    "directories": { "buildResources": "build-assets" },
```

(place it right after `"productName": "Cantina",`), and add to the `linux` block:

```json
      "icon": "build-assets/icon.png"
```

- [ ] **Step 4: Rebuild the AppImage and confirm the icon is embedded**

```bash
npm run electron:build 2>&1 | grep -iE "icon|AppImage|deb"
```
Expected: the build no longer logs `default Electron icon is used`; `dist/Cantina-1.0.0.AppImage` is produced.

- [ ] **Step 5: Commit**

```bash
git add build-assets/icon.svg build-assets/icon.png build-assets/icon.ico package.json
git commit -m "feat(desktop): Cantina app icon (neon mic + C)"
```

---

## Task 7: Windows build

**Files:** Modify `package.json` (`win` target + script)

- [ ] **Step 1: Add the Windows target and script**

In `package.json` `build`, add a `win` block after the `linux` block:

```json
    ,"win": {
      "target": ["nsis", "portable"],
      "icon": "build-assets/icon.ico"
    }
```

In `scripts`, add:

```json
    "electron:build:win": "npm run build && electron-builder --win",
```

- [ ] **Step 2: Attempt the Windows build via wine**

```bash
cd ~/Projects/Okibar && npm run electron:build:win 2>&1 | tail -25
ls -lh dist/*.exe 2>/dev/null
```
Expected (best case): `dist/Cantina Setup 1.0.0.exe` and a portable `.exe`.

- [ ] **Step 3: Record the outcome honestly**

If `.exe` artifacts were produced, note success. If wine fails to produce them on this machine, do NOT claim a Windows build — leave the config + script committed and note in the commit body that Windows artifacts must be built on a Windows host or a wine-capable CI runner. Either way the config is the deliverable here.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "build(desktop): add Windows nsis/portable target and electron:build:win script"
```

---

## Self-Review Notes

- **Spec coverage:** TV window (T2), Open Tabs list+settle (T3), owner-toggle splits with all-members fallback (T4), floor click→checkout with arrange-mode guard (T5), neon-mic icon (T6), Windows target best-effort via wine (T7). Added T1 for the three split wordmarks the rebrand regex missed (in-scope brand cleanup).
- **Placeholder scan:** none — every code step shows the actual code; the only conditional is T7's honest wine outcome, which is a real branch not a placeholder.
- **Naming consistency:** `sharedOwners` / `_key` / `ownersFor` / `toggleOwner` used consistently across `computeSplit`, the modal IIFE, and the toggle UI; `openTabs` / `settleTab` consistent across derivation, nav badge, and Tabs page. `window.cantina.openTvWindow` matches the preload bridge and the `open-tv-window` IPC channel in main.
- **computeSplit return change:** `sharedSplit`/`sharedItems[]` shape changed (items now carry `_key`); the only consumers are the modal and `finalizeCheckout`, both updated in T4. `breakdown` archived shape (per-member `total`) is unchanged, so History/Tabs keep working.
