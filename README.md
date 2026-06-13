# AUV Inventory Pro

A desktop app for the Autonomous Underwater Vehicle team's electrical & electronics
inventory. Built to replace the spreadsheet with fast search, in-place quantity
editing, low-stock alerts, and a clean underwater-themed UI using the team's
**ALK Rounded** typeface.

![AUV Inventory Pro demo](demo.gif)

## Run it

```bash
npm install      # one time
npm start        # launches the app
```

Requires [Node.js](https://nodejs.org) (tested on Node 26). `npm start` runs it
through Electron — no build step needed for day-to-day use.

## Package a standalone app (optional)

To produce a double-clickable app you can hand to teammates who don't have Node:

```bash
npm run dist:mac     # → dist/AUV Inventory Pro.dmg  (macOS)
npm run dist         # current platform
```

## Features

- **Search** — type any combination of value / package / location / notes; terms
  match in any order, so `0402 0.1uf` finds `0.1uF 0402`. Matches are highlighted.
  Press **⌘K** to jump to the search box.
- **Category sidebar** — Resistors, Capacitors, Diodes/LEDs, Inductors, ICs,
  Connectors, with live counts.
- **Quantity steppers** — `+` / `−` on every row write through to disk instantly.
- **Add / edit / delete** parts (**⌘N** for a new part). Each part has a category,
  value, package/footprint, quantity, location/bin, notes, and a per-part
  low-stock threshold.
- **Low-stock alerts** — a part is flagged **OUT** at 0, or **LOW** when it reaches
  its threshold. The threshold defaults to **0** (alert only when out of stock);
  raise it per-part for an early warning. The "Low stock only" toggle filters to
  just those parts.
- **Sort** by value, quantity, package, or recently updated.
- **Export / Import** — JSON (full backup/restore) and CSV (for spreadsheets).

## How data is stored

Data lives in a single human-readable JSON file in the app's per-user data folder:

```
macOS:  ~/Library/Application Support/AUV Inventory Pro/inventory.json
```

Click **"Show data file"** in the app to reveal it in Finder.

Why JSON rather than a database:

- **Robust & simple** — no native modules, no migrations, nothing to break on a
  Node/Electron upgrade. Right-sized for an inventory of hundreds of parts.
- **Inspectable & portable** — readable by anyone, diff-able in git, editable by
  hand in an emergency.
- **Safe writes** — every save is atomic (write-temp-then-rename, so a crash can't
  corrupt the file) and a timestamped copy is kept in a `backups/` folder
  (last 30 days). If the main file is ever unreadable, the app auto-recovers from
  the newest backup.

Each part record:

```json
{
  "id": "p_…",
  "category": "Capacitors",
  "value": "0.1uF",
  "package": "0402",
  "quantity": 1,
  "lowStockThreshold": 0,
  "location": "",
  "notes": "",
  "updatedAt": "2026-06-12T…Z"
}
```

### Sharing one inventory across the team

JSON makes this easy. Either:
- Keep the repo's `data/seed.json` as the shared source of truth and **Import** it,
  or **Export JSON** and commit it back; or
- Point the team at a shared/cloud folder and replace `inventory.json` there.

If you later outgrow a single shared file (concurrent editors, audit history),
the natural next step is a small hosted database — but for the current scale,
JSON + git is the lower-maintenance choice.

## Seeding from the original spreadsheet

`data/seed.json` was generated from `AUV Electrical Inventory.xlsx`. Each row was
parsed into a `value` + `package` (e.g. `220 0402` → value `220`, package `0402`),
and duplicate entries were collapsed into a `quantity`. On first launch the app
copies this seed into your data folder; after that, your edits live only in
`inventory.json` and the seed is left untouched.

## Project layout

```
main.js          Electron main process — window + data layer (load/save/backup/IPC)
preload.js       Secure bridge exposing the data API to the UI
src/index.html   Layout
src/style.css    Theme + @font-face for the ALK Rounded typeface
src/renderer.js  UI logic — search, filter, sort, modal, quantity edits
src/fonts/       Bundled team typeface
data/seed.json   Initial inventory parsed from the xlsx
```
