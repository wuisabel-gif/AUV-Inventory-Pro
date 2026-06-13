'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Data layer
//
// Storage strategy: a single human-readable JSON file ("inventory.json") kept
// in Electron's per-user data directory. This is intentionally simple and
// robust for an inventory of this size (hundreds of parts):
//   * No native dependencies / no migrations to babysit.
//   * Trivially backed up, version-controlled, or hand-edited in a pinch.
//   * Every write is atomic (temp file + rename) and a timestamped copy is
//     dropped into a /backups folder so a bad edit is always recoverable.
// ---------------------------------------------------------------------------

const DATA_DIR = app.getPath('userData');
const DB_PATH = path.join(DATA_DIR, 'inventory.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SEED_PATH = path.join(__dirname, 'data', 'seed.json');

const CATEGORIES = [
  'Resistors',
  'Capacitors',
  'Diodes/LEDs',
  'Inductors',
  'ICs',
  'Connectors',
];

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function blankDb() {
  return {
    schemaVersion: 1,
    categories: CATEGORIES,
    lastUpdated: nowIso(),
    items: [],
  };
}

// Normalize a raw record (from seed or import) into the canonical shape.
function normalizeItem(raw) {
  return {
    id: raw.id || newId(),
    category: raw.category || 'Resistors',
    value: (raw.value || '').toString().trim(),
    package: (raw.package || '').toString().trim(),
    quantity: Number.isFinite(+raw.quantity) ? Math.max(0, Math.round(+raw.quantity)) : 0,
    lowStockThreshold:
      Number.isFinite(+raw.lowStockThreshold) ? Math.max(0, Math.round(+raw.lowStockThreshold)) : 0,
    location: (raw.location || '').toString().trim(),
    notes: (raw.notes || '').toString().trim(),
    updatedAt: raw.updatedAt || nowIso(),
  };
}

function loadDb() {
  ensureDirs();
  if (!fs.existsSync(DB_PATH)) {
    // First launch: seed from the bundled snapshot parsed out of the xlsx.
    let seed = blankDb();
    try {
      if (fs.existsSync(SEED_PATH)) {
        const s = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
        seed = {
          schemaVersion: 1,
          categories: CATEGORIES,
          lastUpdated: nowIso(),
          items: (s.items || []).map(normalizeItem),
        };
      }
    } catch (err) {
      console.error('Failed to read seed, starting empty:', err);
    }
    writeDb(seed);
    return seed;
  }
  try {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    db.categories = CATEGORIES;
    db.items = (db.items || []).map(normalizeItem);
    return db;
  } catch (err) {
    console.error('Corrupt inventory.json, recovering from latest backup:', err);
    const recovered = recoverFromBackup();
    return recovered || blankDb();
  }
}

function recoverFromBackup() {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse();
    for (const f of files) {
      try {
        const db = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8'));
        db.items = (db.items || []).map(normalizeItem);
        return db;
      } catch (_) {
        /* try next */
      }
    }
  } catch (_) {
    /* no backups */
  }
  return null;
}

let lastBackupDay = null;

function writeDb(db) {
  ensureDirs();
  db.lastUpdated = nowIso();
  const json = JSON.stringify(db, null, 2);

  // Atomic write: write to temp then rename over the real file.
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, DB_PATH);

  // Keep one backup per day, prune to the most recent 30.
  const day = db.lastUpdated.slice(0, 10);
  if (day !== lastBackupDay) {
    lastBackupDay = day;
    try {
      fs.writeFileSync(path.join(BACKUP_DIR, `inventory-${day}.json`), json, 'utf8');
      const backups = fs
        .readdirSync(BACKUP_DIR)
        .filter((f) => f.startsWith('inventory-') && f.endsWith('.json'))
        .sort();
      while (backups.length > 30) {
        fs.unlinkSync(path.join(BACKUP_DIR, backups.shift()));
      }
    } catch (err) {
      console.error('Backup failed (non-fatal):', err);
    }
  }
  return db;
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('inventory:get', () => loadDb());

ipcMain.handle('inventory:add', (_e, raw) => {
  const db = loadDb();
  const item = normalizeItem({ ...raw, id: newId(), updatedAt: nowIso() });
  db.items.push(item);
  writeDb(db);
  return db;
});

ipcMain.handle('inventory:update', (_e, raw) => {
  const db = loadDb();
  const idx = db.items.findIndex((i) => i.id === raw.id);
  if (idx === -1) throw new Error('Item not found: ' + raw.id);
  db.items[idx] = normalizeItem({ ...db.items[idx], ...raw, updatedAt: nowIso() });
  writeDb(db);
  return db;
});

ipcMain.handle('inventory:adjust', (_e, { id, delta }) => {
  const db = loadDb();
  const item = db.items.find((i) => i.id === id);
  if (!item) throw new Error('Item not found: ' + id);
  item.quantity = Math.max(0, item.quantity + delta);
  item.updatedAt = nowIso();
  writeDb(db);
  return db;
});

ipcMain.handle('inventory:delete', (_e, id) => {
  const db = loadDb();
  db.items = db.items.filter((i) => i.id !== id);
  writeDb(db);
  return db;
});

ipcMain.handle('inventory:dataDir', () => DATA_DIR);
ipcMain.handle('inventory:revealData', () => shell.showItemInFolder(DB_PATH));

ipcMain.handle('inventory:export', async () => {
  const db = loadDb();
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export inventory',
    defaultPath: 'auv-inventory.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('inventory:exportCsv', async () => {
  const db = loadDb();
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export as CSV',
    defaultPath: 'auv-inventory.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePath) return { ok: false };
  const esc = (v) => {
    const s = (v == null ? '' : String(v));
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = ['Category', 'Value', 'Package', 'Quantity', 'Location', 'Notes', 'Updated'];
  const rows = db.items.map((i) =>
    [i.category, i.value, i.package, i.quantity, i.location, i.notes, i.updatedAt].map(esc).join(',')
  );
  fs.writeFileSync(filePath, [header.join(','), ...rows].join('\n'), 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('inventory:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Import inventory (JSON)',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false };
  const imported = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
  const items = (imported.items || imported).map(normalizeItem);
  const db = { ...blankDb(), items };
  writeDb(db);
  return { ok: true, db };
});

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: '#0b1626',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Dev-only: AUV_SHOT=<png path> captures the rendered window then quits.
  if (process.env.AUV_SHOT) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.env.AUV_CLICK) {
            await win.webContents.executeJavaScript(
              `document.querySelector('.cat[data-cat="${process.env.AUV_CLICK}"]')?.click(); document.querySelectorAll('#rows tr').length`
            );
            await new Promise((r) => setTimeout(r, 300));
          }
          const img = await win.webContents.capturePage();
          fs.writeFileSync(process.env.AUV_SHOT, img.toPNG());
        } catch (err) {
          console.error('capture failed', err);
        }
        app.quit();
      }, 1600);
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
