# AUV Inventory Pro

This is the desktop app I built so we can stop wrangling the parts spreadsheet.
It tracks our electrical/electronics inventory (resistors, caps, diodes, ICs,
connectors) with real search, quantity tracking, low-stock alerts, and Digi-Key
sourcing info baked in.

![AUV Inventory Pro demo](demo.gif)

Want to just poke at it without installing anything? There's a live web version
here: **https://wuisabel-gif.github.io/AUV-Inventory-Pro/** (it runs in your
browser, and changes you make there only live in your browser, not the real data).

## Running it

You'll need [Node.js](https://nodejs.org) (I built it on Node 26). Then:

```bash
npm install      # just the first time
npm start        # opens the app
```

No build step, no hot reload. If you change the UI, just stop it and run
`npm start` again.

Want a double-clickable app for teammates who don't want to touch a terminal?

```bash
npm run dist:mac     # → dist/AUV Inventory Pro.dmg  (Mac)
npm run dist         # whatever OS you're on
```

## What it does

- **Search that actually works.** Type any mix of value / package / location /
  notes / part number, in any order, so `0402 0.1uf` finds `0.1uF 0402`. Hit
  **⌘K** to jump straight to the search box.
- **Categories down the left:** Resistors, Capacitors, Diodes/LEDs, Inductors,
  ICs, Connectors, each with a live count. Click one to filter.
- **Bump quantities right in the row.** The `+` / `−` buttons save instantly.
- **Add / edit / delete parts** (**⌘N** for a new one). Every part has a category,
  value, package, quantity, location/bin, notes, and its own low-stock threshold.
- **Low-stock alerts.** A part shows **OUT** at 0, or **LOW** once it hits its
  threshold. Threshold defaults to 0 (so it only yells when you're actually out);
  bump it per-part if you want an earlier heads-up. There's a "Low stock only"
  toggle too.
- **Sourcing info.** Each part can hold a manufacturer part #, Digi-Key part #,
  and a Digi-Key link (the ↗ opens it in your browser). It also tags each one:
  **Verified** (real Digi-Key page), **Confirm stock** (part # is right, just
  double-check availability), or **Needs confirm** (value/voltage is ambiguous, so
  somebody needs to decide). Filter by these with the "Sourcing" dropdown.
- **Sort** by value, quantity, package, or recently updated.
- **Export / Import:** JSON for full backups, CSV for spreadsheets.
- **Push to a Google Sheet** so the rest of the team can see it (setup below).

## Where the data lives

Everything's in one plain JSON file on your machine:

```
Mac:  ~/Library/Application Support/AUV Inventory Pro/inventory.json
```

Hit **"Show data file"** in the app to open that folder. I went with a JSON file
instead of a database on purpose. It's simple, you can read/edit it by hand if
something's weird, and there's nothing to break when Node/Electron updates. Saves
are atomic and it keeps daily backups in a `backups/` folder, so a bad edit won't
nuke everything. A part looks like this:

```json
{
  "id": "p_…",
  "category": "Capacitors",
  "value": "0.1uF",
  "package": "0402",
  "quantity": 1,
  "lowStockThreshold": 0,
  "location": "",
  "notes": "Samsung X7R ±10% 16V.",
  "mfrPart": "CL05B104KO5NNNC",
  "dkPart": "1276-1001-1-ND",
  "dkLink": "https://www.digikey.com/en/products/detail/…",
  "updatedAt": "2026-06-12T…Z"
}
```

Heads up: your live inventory lives in that folder, **not** in this repo.
`data/seed.json` is just the starter data the app copies in on first launch. It
came from our original `AUV Electrical Inventory.xlsx` (each row split into a
value + package, duplicates rolled up into quantities). Editing `seed.json` later
won't touch an install that's already running.

### Sharing one list across the team

Easiest options: keep `data/seed.json` as the shared source of truth and
**Import** it (or **Export JSON** and commit it back), or drop `inventory.json`
in a shared/cloud folder. If we ever outgrow one file (lots of people editing at
once), we'd move to a small hosted DB, but for now this is way less hassle.

## Hooking it up to Google Sheets

The **Sync to Sheets** button shoves the current inventory into a shared Google
Sheet so everyone can see it. It's one-way (app → Sheet): syncing overwrites the
Sheet's tab with whatever's in the app.

Under the hood it's a tiny **Google Apps Script** living in the Sheet. No Google
Cloud project or API keys, just a deployment **URL** and a **token** you make up.
The script is [`google-apps-script/Code.gs`](google-apps-script/Code.gs). Heads
up: it's a one-time setup and it needs your Google login, so you have to do this
part yourself.

### Setting it up (~5 min, once)

1. Make a new Sheet at [sheets.google.com](https://sheets.google.com).
2. In the Sheet: **Extensions → Apps Script**. Delete whatever's there and paste
   all of [`google-apps-script/Code.gs`](google-apps-script/Code.gs).
3. Change the `SHARED_TOKEN` line to any long random string. You'll paste the
   *same* one into the app later:
   ```js
   var SHARED_TOKEN = 'your-long-random-secret';
   ```
4. **Save** it (💾). Don't skip this: unsaved code doesn't deploy, and that's the
   #1 reason it "doesn't work."
5. **Deploy → New deployment** → gear ⚙️ → **Web app**:
   - **Execute as:** Me
   - **Who has access:** **Anyone** (the plain one, *not* "Anyone with a Google
     account")
   - **Deploy**, then authorize it (click through the "unverified app" warning;
     it's your own script, that's normal).

### Grabbing the URL (this is the part that trips people up)

After deploying, copy the **Web app URL**. It ends in **`/exec`**. Lost it? Get
it back from **Deploy → Manage deployments → ✏️**.

- ✅ The one ending in **`/exec`** is the real one.
- ❌ The `/dev` one is just for testing and will fail from the app.

Then in the app: open **Sync to Sheets**, paste the `/exec` URL and your token,
hit **Save & Sync now**. You should see "Synced N parts ✓". Full walkthrough is in
[`google-apps-script/README.md`](google-apps-script/README.md).

If you change `Code.gs` later, you have to **redeploy a new version** (Manage
deployments → ✏️ → Version: New version → Deploy). The URL stays the same.

### If it fights you

- **"Script function not found: doGet" or the app gets HTML back:** the deployed
  version doesn't have the code. Paste it, **Save**, redeploy a new version.
- **It redirects to a USC (or other school) login page:** ⚠️ this one got us. A
  **usc.edu Google account won't work**, because USC forces everything through
  their login, so the app can never reach it. You can tell because the URL has
  `usc.edu` in it (`script.google.com/a/macros/usc.edu/s/…`). **Fix:** do the
  whole setup signed in as a personal Gmail (e.g. **uscauv@gmail.com**). There the
  URL is `script.google.com/macros/s/…/exec` with no `usc.edu`, and "Anyone" is
  actually allowed.
- **Quick test:** paste the `/exec` URL into a browser. If it's working you'll see
  `{"ok":true,...}`. A login page or error means it's not public yet.

Don't have a Gmail you can deploy from, or don't want to bother? You can skip all
this and just **Export CSV** from the app and `File → Import` it into a Sheet.
Same data, no script.

## How it's built (for whoever maintains this next)

```
main.js          Electron main process: the window + all the data stuff (save/backup/sync)
preload.js       the safe bridge between the UI and the data layer
src/index.html   layout
src/style.css    theme + our ALK Rounded font
src/renderer.js  the UI logic: search, filter, sort, edit, quantity buttons
src/fonts/       our team font
data/seed.json   starter inventory from the xlsx
web-demo/        the browser version (what's deployed to GitHub Pages)
google-apps-script/   the Google Sheets sync script + its setup guide
```

It's plain Electron + vanilla JS, no framework or build step. I kept it boring on
purpose so it's easy to pick up and not a pain to maintain. If you're an AI agent
or just want the deeper notes, check `CLAUDE.md`.

Questions? Ping me on Discord at [**isabelwu25**](https://discord.com/users/isabelwu25). 🤙
