# Cantina v1 "Finish" Batch — Design

**Date:** 2026-06-18
**Status:** Approved (design phase)

## Overview

Six focused, mostly-independent features that complete Cantina v1 before any remote
push. Four are app features (TV second window, Open Tabs screen, owner-toggle bill
splits, floor click→checkout); two finish the desktop deliverable (app icon, Windows
build). All build on the existing React/Express/socket.io + Electron app.

Build order: features 1–4 first (app code), then 5 (icon), then 6 (Windows build —
depends on the icon for `icon.ico`).

## Shared Context (current code)

- `src/components/karaoke_queue.tsx` is the single big component. Bar pages switch on
  `barPage` (`queue|orders|guests|tables|floor|menu|history|settings`).
- Checkout: `openCheckout(tableNum)` (≈1043) sets `checkout={tableNum}`; modal at ≈1367
  uses `checkoutPaid` map keyed by `memberId|'shared'`. `computeSplit(tableNum)` (≈1019)
  splits shared items **evenly**. `finalizeCheckout` (≈1068) archives an entry with a
  stable `id: Date.now()` into `groupHistory[groupKey]` (array), then `resetTable`.
- `groupHistory` is synced + persisted; entries carry `paid`, `amountPaid`, `amountTab`.
- Floor: tokens render in `barPage==='floor'`; `isEditMode` = arrange (reposition),
  normal mode = occupied tokens are HTML5-draggable → `transferTable`.
- Electron: `electron/main.js` (main), `electron/preload.js` (currently a no-op),
  `BrowserWindow` with `contextIsolation:true`, `nodeIntegration:false`.

---

## Feature 1 — TV as a Second Window (Electron)

**Goal:** From the desktop bar console, open the TV/player UI in its own window.

**Components:**
- `electron/preload.js`: use `contextBridge.exposeInMainWorld('cantina', { openTvWindow: () => ipcRenderer.send('open-tv-window'), isDesktop: true })`. Requires importing `{ contextBridge, ipcRenderer }` from `electron`.
- `electron/main.js`: add `const { ipcMain } = require('electron')`; track `let tvWindow = null`; on `ipcMain.on('open-tv-window')`, if `tvWindow` exists and not destroyed → `tvWindow.focus()`, else create a new `BrowserWindow` (1280×720, title `Cantina — TV`) loading `http://localhost:${PORT}/?mode=tv`; clear `tvWindow` on its `closed`.
- `src/components/karaoke_queue.tsx`: in the bar header, render an **"Open TV Window"** button **only when** `typeof window !== 'undefined' && window.cantina?.isDesktop`. onClick → `window.cantina.openTvWindow()`.

**Data flow:** renderer → `ipcRenderer.send` → main spawns window → that window loads the
existing `?mode=tv` route and socket-syncs like any other device. No new sync state.

**Error handling:** guard against destroyed `tvWindow`; the button is hidden entirely in
plain-browser use, so non-desktop clients are unaffected.

**Testing:** Electron smoke test — click the button, confirm a second window opens to the
TV view and reflects queue changes; click again → focuses the existing window (no duplicate).

---

## Feature 2 — Open Tabs Screen

**Goal:** See and settle outstanding tabs (unpaid balances left when a table "Closed as Tab").

**Components (all in `karaoke_queue.tsx`):**
- New bar page `barPage==='tabs'` with nav entry `{ id: 'tabs', label: '💳 Tabs' }`. Show a
  count badge = number of open tabs.
- Derive `openTabs`: flatten `groupHistory` values, keep entries where `paid===false &&
  amountTab>0`, sort newest-first by `checkoutTime`. Each carries its `groupKey` for updates.
- Render rows: group name / table number, member names, `amountTab` (currency), checkout date.
- **Settle action** `settleTab(groupKey, entryId)`: update that entry within
  `groupHistory[groupKey]` → `amountPaid += amountTab`, `amountTab = 0`, `paid = true`,
  `settledAt = new Date().toISOString()`. Setter goes through the existing synced
  `setGroupHistory`. Push a success toast.

**Data flow:** reads/writes the already-synced `groupHistory`; no new persisted key.

**Error handling:** if an entry id isn't found (race), no-op. Empty state: "No open tabs."

**Testing:** create a tab via "Close as Tab", confirm it appears in Tabs with correct
balance; settle it, confirm it disappears, badge decrements, and the History page now shows
it as paid.

---

## Feature 3 — Owner-Toggle Bill Splits

**Goal:** Replace the even shared-item split with per-item ownership; a shared item's cost
divides only among the guests marked as sharing it (default = everyone = today's behavior).

**Components (all in `karaoke_queue.tsx`):**
- Modal-local state `sharedOwners`: map `sharedItemKey → string[] memberIds`. Key = order
  `id` if present, else its index in the shared list. Initialized to all member ids when the
  checkout modal opens (`openCheckout` resets it alongside `checkoutPaid`).
- Rework `computeSplit(tableNum, sharedOwners)`:
  - member item totals unchanged (orders with a valid `memberId`).
  - For each shared item, owners = `sharedOwners[key]` (falling back to all members); add
    `item.price / owners.length` to each owner's total. If a shared item has zero owners,
    its cost falls back to splitting across **all** members (never dropped).
  - Return existing fields plus per-member shared subtotal so the modal can show breakdowns.
- Checkout modal: under each shared item, render member toggle-chips reflecting
  `sharedOwners`; toggling recomputes per-member totals live. With no members, behavior is
  unchanged (single shared bucket).
- `finalizeCheckout` calls `computeSplit(tableNum, sharedOwners)`; the archived `breakdown`
  shape is unchanged (per-member `total`), so History/Tabs keep working.

**Error handling:** unknown member ids in a key are ignored; empty-owner items use the
all-members fallback so the grand total always reconciles to `totalSpent`.

**Testing:** table with 2 members + 1 shared item — default splits evenly; untoggle one
member on the shared item → full cost lands on the other; per-member totals always sum to
`totalSpent`.

---

## Feature 4 — Floor Click → Checkout

**Goal:** Click an occupied floor token (normal mode) to open its checkout.

**Components:** in the floor token render (`barPage==='floor'`), add `onClick` that, when
`!isEditMode && occupied`, calls `openCheckout(String(table.number))`. Arrange mode and the
existing drag-to-transfer gesture are untouched (drag is a separate pointer interaction).

**Error handling:** empty tokens ignore clicks in normal mode; in arrange mode clicks never
trigger checkout.

**Testing:** occupy a table, go to Floor, click its token → checkout modal opens for that
table; in Arrange mode the same click repositions, not checks out.

---

## Feature 5 — App Icon (Neon Mic + 'C')

**Goal:** Replace the default Electron icon with a Cantina mark.

**Components:**
- Author `build-assets/icon.svg` — a microphone inside a neon 'C' on a dark bar background.
- Rasterize to `build-assets/icon.png` (1024×1024) and `build-assets/icon.ico` (multi-size)
  using whichever is available: `rsvg-convert`/`inkscape`/ImageMagick `convert` for PNG,
  ImageMagick `convert` for ICO. (Tool availability checked during implementation; if none
  is present, install ImageMagick or note the gap — do not fake the asset.)
- electron-builder config: `directories.buildResources: "build-assets"` (separate from CRA's
  `build/`), `linux.icon: "build-assets/icon.png"`, and (Feature 6) `win.icon:
  "build-assets/icon.ico"`.

**Testing:** rebuild the AppImage; confirm the new icon is embedded (no "default Electron
icon" line in the build log) and the window/taskbar shows the Cantina mark.

---

## Feature 6 — Windows Build

**Goal:** Produce Windows installers from this Linux machine via the installed `wine`.

**Components:**
- electron-builder `win` target: `{ "target": ["nsis", "portable"], "icon":
  "build-assets/icon.ico" }`.
- `package.json` script `electron:build:win`: `npm run build && electron-builder --win`.

**Error handling / honesty:** attempt the build through `wine`. If wine cannot produce the
nsis/portable artifacts here, capture the failure, leave the config in place, and document
that Windows artifacts must be built on a Windows host or a wine-capable CI runner — do not
claim a Windows build that didn't happen.

**Testing:** run `npm run electron:build:win`; verify `dist/*.exe` (Setup + portable) exist.
Full functional verification requires a Windows machine (out of scope here); a successful
artifact build is the deliverable.

---

## Out of Scope (YAGNI)

- macOS builds; auto-update; multi-monitor auto-placement for the TV window; partial-payment
  settling on tabs (settle is all-or-nothing); reassigning members from the Tabs screen.

## Verification Summary

Per-feature tests above, plus a consolidated Electron smoke test after features 1–5: launch
the desktop app, open the TV window, occupy a table, click its floor token to check out with
owner-toggled shared items, close as a tab, settle it from the Tabs screen — zero console
exceptions, state persisted to `~/.config/Cantina/state.json`.
