# Google Sheets sync — one-time setup (~5 minutes)

This lets the **Sync to Sheets** button in the app push your inventory into a
Google Sheet your whole team can view. It's one-way: the app is the editor, and
syncing **overwrites** the Sheet's `Inventory` tab with the current parts list.

You do these steps once, on the Google side (it needs your Google login).

## 1. Create the Sheet
1. Go to <https://sheets.google.com> and create a blank spreadsheet.
2. Name it something like **AUV Electrical Inventory**.

## 2. Add the script
1. In the Sheet: **Extensions → Apps Script**.
2. Delete whatever is in the editor, then paste the entire contents of
   [`Code.gs`](Code.gs).
3. Change this line to your own secret (any long random string):
   ```js
   var SHARED_TOKEN = 'CHANGE_ME_to_a_long_random_string';
   ```
   Keep this value handy — you'll paste the **same** value into the app.
4. Click the **Save** (💾) icon.

## 3. Deploy as a web app
1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" → choose **Web app**.
3. Set:
   - **Description:** anything (e.g. "AUV inventory sync")
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**  ← important; the token is what protects it
4. Click **Deploy**.
5. Click **Authorize access**, pick your Google account, and approve. (Google
   may warn the app is "unverified" because it's your own script — click
   **Advanced → Go to … (unsafe)** → **Allow**. This is normal for personal
   Apps Script.)
6. Copy the **Web app URL** — it ends in `/exec`.

## 4. Connect the app
1. In AUV Inventory Pro, click **Sync to Sheets** (bottom-left).
2. Paste the **Web app URL** and the **token** (the `SHARED_TOKEN` you set).
3. Click **Save & Sync now**. You should see "Synced N parts ✓", and the Sheet's
   `Inventory` tab will fill in.

## Updating the script later
If you change `Code.gs`, you must **redeploy**: **Deploy → Manage deployments →**
edit (✏️) the existing deployment → **Version: New version → Deploy**. The URL
stays the same. (Creating a brand-new deployment instead gives a *new* URL,
which you'd then have to re-paste into the app.)

## Troubleshooting
- **"Unexpected response (HTTP 401/403)"** — the deployment's *Who has access* is
  not set to **Anyone**, or you haven't authorized it. Redo step 3.
- **"Unauthorized: token mismatch"** — the token in the app doesn't match
  `SHARED_TOKEN` in the script.
- **"Script function not found: doGet"** — the deployed version doesn't contain
  the script. Paste `Code.gs`, **Save**, then **redeploy a new version**.
- **Redirects to a school/company login (e.g. a `*.edu` SSO page)** — the script
  is on a **Google Workspace** account that forces org login. The tell-tale sign
  is the URL contains your org domain, like
  `script.google.com/a/macros/your-school.edu/s/…/exec`. Many orgs (incl. USC)
  block truly-public web apps. **Fix:** deploy from a **personal Gmail account** —
  its public URL looks like `script.google.com/macros/s/…/exec` (no org domain).
- **Test the URL** by opening it in a browser — you should see
  `{"ok":true,"msg":"AUV Inventory sync endpoint is live..."}`. A login page or
  error means it isn't public yet.

## Security notes
- The URL + token let anyone holding them **overwrite** the sheet. Share them
  only with teammates who should sync, and don't commit the real values.
- Because access is "Anyone," treat the token like a password. To rotate it,
  change `SHARED_TOKEN`, redeploy a new version, and update the app.
