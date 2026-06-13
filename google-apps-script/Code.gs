/**
 * AUV Inventory Pro — Google Sheets sync endpoint
 * --------------------------------------------------
 * Paste this into the Apps Script editor of your inventory Google Sheet
 * (Extensions → Apps Script), set SHARED_TOKEN below to a secret of your
 * choosing, then Deploy → New deployment → Web app (see README.md).
 *
 * The desktop app POSTs the full inventory here; this script overwrites the
 * "Inventory" tab with the current parts list. One-way: app → Sheet.
 */

// ⚠️ CHANGE THIS to a random secret, and paste the SAME value into the app's
// "Shared token" field. It's the only thing stopping a stranger who finds the
// URL from writing to your sheet.
var SHARED_TOKEN = 'CHANGE_ME_to_a_long_random_string';

var SHEET_NAME = 'Inventory';
var HEADERS = ['Category', 'Value', 'Package', 'Quantity', 'Location', 'Notes', 'Updated'];

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Empty request body.' });
    }
    var body = JSON.parse(e.postData.contents);

    if (String(body.token || '') !== SHARED_TOKEN) {
      return json({ ok: false, error: 'Unauthorized: token mismatch.' });
    }

    var items = Array.isArray(body.items) ? body.items : [];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    sheet.clearContents();
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');

    var rows = items.map(function (i) {
      return [
        i.category || '',
        i.value || '',
        i.package || '',
        Number(i.quantity) || 0,
        i.location || '',
        i.notes || '',
        i.updatedAt || '',
      ];
    });
    if (rows.length) {
      sheet.getRange(2, 1, rows.length, HEADERS.length).setValues(rows);
    }
    sheet.getRange(rows.length + 3, 1).setValue('Last synced from app: ' + (body.syncedAt || new Date()));
    sheet.setFrozenRows(1);

    return json({ ok: true, count: rows.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Visiting the URL in a browser hits this — handy to confirm the deployment.
function doGet() {
  return json({ ok: true, msg: 'AUV Inventory sync endpoint is live. POST inventory data here.' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
