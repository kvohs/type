const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { version: APP_VERSION } = require('./package.json');

// route electron-updater's output to ~/Library/Logs/type/main.log so we can
// actually see what happened when "no update arrived" again
log.transports.file.level = 'info';
autoUpdater.logger = log;

// ---- where kept pages live ----
// By default, type saves to its iCloud Drive folder — the SAME container the
// iPhone app writes to, so pages sync across devices and show up as a "type"
// folder in iCloud Drive: plain .md files you can open, move, and grab in
// Finder (the iA Writer model, not a hidden database). Power users override it
// with the folder picker in settings (an Obsidian vault, Dropbox, anywhere).
// When iCloud Drive is off we fall back to Downloads.
const ICLOUD_ROOT = path.join(os.homedir(), 'Library', 'Mobile Documents');
const ICLOUD_TYPE_DOCS = path.join(ICLOUD_ROOT, 'iCloud~com~kellyvohs~type', 'Documents');

// iCloud Drive is enabled iff its CloudDocs root exists under Mobile Documents.
function icloudAvailable() {
  try { return fs.existsSync(path.join(ICLOUD_ROOT, 'com~apple~CloudDocs')); }
  catch (e) { return false; }
}

// The resolved default folder when the user hasn't picked one.
function defaultSaveDir() {
  if (icloudAvailable()) {
    try { fs.mkdirSync(ICLOUD_TYPE_DOCS, { recursive: true }); return ICLOUD_TYPE_DOCS; }
    catch (e) { /* iCloud present but unwritable — fall back */ }
  }
  return app.getPath('downloads');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 420,
    minHeight: 360,
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',   // mac: keep the traffic lights, drop the title bar
    title: 'type',
    icon: path.join(__dirname, 'build', 'icon.icns'),
    // Hide until first paint is ready so the user never sees the white-flash-
    // then-theme handover. The dock icon is already "active" while we wait;
    // when the window finally appears it appears fully formed.
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--type-version=${APP_VERSION}`],
    },
  });

  // Show only after first paint, and tell the renderer the moment we do so
  // it can start the intro animation from the beginning — the window opening
  // *is* the wordmark reveal.
  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('type:ready');
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // notify the renderer whenever the window's fullscreen state changes, so
  // Zen settings + checkbox stay in sync no matter how it was triggered
  // (settings click, ⌃⌘F system shortcut, green-button hover menu, Esc, etc.)
  const sendFs = (on) => {
    if (!win.isDestroyed()) win.webContents.send('type:fullscreen-changed', on);
  };
  win.on('enter-full-screen', () => sendFs(true));
  win.on('leave-full-screen', () => sendFs(false));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

// --- file-system bridge for "save to a folder" ---
ipcMain.handle('type:pick-folder', async (e) => {
  // Present the picker as a sheet attached to the requesting window. A
  // parentless dialog renders at normal window level, so when "Stay on top"
  // is enabled it opens *behind* the always-on-top main window and is never
  // seen — making it look like the folder can't be changed at all. A sheet is
  // owned by its parent, so it always surfaces in front, even above-all-others.
  const win = BrowserWindow.fromWebContents(e.sender);
  const opts = {
    title: 'Choose where type saves',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultSaveDir(),   // start browsing at the current default (iCloud Drive · type)
  };
  const res = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts);
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
});

// The renderer asks where the default lives, to show the right folder label in
// settings ("iCloud Drive · type" vs "Downloads") when the user hasn't picked one.
ipcMain.handle('type:default-save-dir', () => {
  const dir = defaultSaveDir();
  const icloud = dir === ICLOUD_TYPE_DOCS;
  return { dir, icloud, label: icloud ? 'iCloud Drive · type' : 'Downloads' };
});

ipcMain.handle('type:set-zen', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setFullScreen(!!on);
  return true;
});

ipcMain.handle('type:set-on-top', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setAlwaysOnTop(!!on);
  return true;
});

// --- native share sheet bridge ---
// renderer hands us a PNG data URL; we write it to a temp file and spawn the
// Swift helper (build/type-share) which presents NSSharingServicePicker.
// the picker offers AirDrop, Messages, Notes, Mail, etc. — user picks one.
ipcMain.handle('type:share-image', async (_e, payload) => {
  try {
    const dataUrl = payload && payload.dataUrl;
    const slug = (payload && payload.slug) || 'quote';
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
      return { ok: false, error: 'expected a PNG data URL' };
    }
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const tmp = path.join(os.tmpdir(), `type-${slug}-${Date.now()}.png`);
    fs.writeFileSync(tmp, buf);

    const bin = app.isPackaged
      ? path.join(process.resourcesPath, 'type-share')
      : path.join(__dirname, 'build', 'type-share');

    if (!fs.existsSync(bin)) {
      return { ok: false, error: 'share helper missing at ' + bin };
    }

    const child = spawn(bin, [tmp], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, file: tmp };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// share a kept note: hand the actual .md to the same native share sheet the
// image path uses. iOS shares the .md file via its own share sheet; this is the
// Mac parity (the renderer's navigator.share fallback is unavailable in Electron).
ipcMain.handle('type:share-note', async (_e, payload) => {
  try {
    const filename = (payload && payload.filename) || 'type-note.md';
    // prefer the real saved file (same dir resolution as list/read-note); fall
    // back to a temp copy of the text if it isn't on disk where we expect.
    const dir = (payload && payload.dir) || defaultSaveDir();
    let file = path.join(dir, filename);
    if (!fs.existsSync(file)) {
      file = path.join(os.tmpdir(), filename.replace(/[^\w.\-]/g, '_'));
      fs.writeFileSync(file, (payload && payload.text) || '');
    }

    const bin = app.isPackaged
      ? path.join(process.resourcesPath, 'type-share')
      : path.join(__dirname, 'build', 'type-share');
    if (!fs.existsSync(bin)) return { ok: false, error: 'share helper missing at ' + bin };

    const child = spawn(bin, [file], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// --- feedback ---
// renderer hands us the feedback text. we show a native confirm dialog
// (so the user can see exactly what's about to leave the machine), then
// POST it to the Coop-hosted endpoint, which forwards via Resend.
// the recipient address lives on the server, never in this binary.
const FEEDBACK_ENDPOINT = 'https://heycoop.ai/api/type-feedback';

ipcMain.handle('type:send-feedback', async (e, payload) => {
  try {
    const body = (payload && typeof payload.body === 'string') ? payload.body.trim() : '';
    if (!body) return { ok: false, error: 'empty feedback' };

    const win = BrowserWindow.fromWebContents(e.sender);
    const preview = body.length > 600 ? body.slice(0, 600) + '\n…' : body;
    const confirm = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Send this feedback to Kelly?',
      message: 'Send this feedback?',
      detail: preview,
      buttons: ['Send', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    if (confirm.response !== 0) return { ok: false, cancelled: true };

    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body,
        version: APP_VERSION,
        // optional window capture (cmd-shift-B) -> lands on the work-board ticket
        screenshot: (payload && typeof payload.screenshot === 'string' && payload.screenshot.length <= 8000000)
          ? payload.screenshot : undefined,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `server returned ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    log.error('feedback send error', err);
    return { ok: false, error: String(err && err.message || err) };
  }
});

// cmd-shift-B captures the app window (not the screen, so no permission
// prompt) for a feedback report; same trick as Dispatch's work board.
ipcMain.handle('type:capture-feedback', async (e) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender);
    const img = await win.webContents.capturePage();
    return (img && !img.isEmpty()) ? img.toDataURL() : null;
  } catch (err) {
    return null;
  }
});

ipcMain.handle('type:save-note', async (_e, payload) => {
  try {
    const { content, filename } = payload || {};
    const dir = (payload && payload.dir) || defaultSaveDir();
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, filename);
    fs.writeFileSync(file, content, 'utf8');
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// --- kept notes (review drawer): list / read / delete the .md files in the
// save folder, so the desktop drawer reads your real pages, not sample data.
// Mirrors the iOS NoteSaver so the renderer gets identical objects. ---
function parseNoteFile(text) {
  let dateISO = null, kept = null, words = null, body = text;
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (m) {
    const fm = m[1];
    const d = fm.match(/^date:\s*(.+)$/m);  if (d) dateISO = d[1].trim();
    const k = fm.match(/^kept:\s*(.+)$/m);  if (k) kept = k[1].trim();
    const w = fm.match(/^words:\s*(\d+)/m); if (w) words = parseInt(w[1], 10);
    body = text.slice(m[0].length);
  }
  body = body.replace(/^\n+/, '').replace(/\s+$/, '');   // drop the blank line after frontmatter + trailing space
  if (words == null) words = (body.match(/\S+/g) || []).length;
  return { dateISO, kept, words, body };
}
ipcMain.handle('type:list-notes', async (_e, dir) => {
  try {
    const d = dir || defaultSaveDir();
    if (!fs.existsSync(d)) return [];
    const out = [];
    for (const f of fs.readdirSync(d)) {
      if (!f.toLowerCase().endsWith('.md')) continue;
      try {
        const p = parseNoteFile(fs.readFileSync(path.join(d, f), 'utf8'));
        out.push({ filename: f, dateISO: p.dateISO, kept: p.kept, words: p.words, body: p.body });
      } catch (_) {}
    }
    // newest first by day, then filename (filenames carry the full timestamp)
    out.sort((a, b) => {
      const x = a.dateISO || '', y = b.dateISO || '';
      if (x !== y) return x < y ? 1 : -1;
      return a.filename < b.filename ? 1 : -1;
    });
    return out;
  } catch (e) { return []; }
});
ipcMain.handle('type:read-note', async (_e, payload) => {
  try {
    const dir = (payload && payload.dir) || defaultSaveDir();
    const filename = payload && payload.filename;
    if (!filename) return '';
    return parseNoteFile(fs.readFileSync(path.join(dir, filename), 'utf8')).body;
  } catch (e) { return ''; }
});
ipcMain.handle('type:delete-note', async (_e, payload) => {
  try {
    const dir = (payload && payload.dir) || defaultSaveDir();
    const filename = payload && payload.filename;
    if (!filename) return false;
    fs.unlinkSync(path.join(dir, filename));
    return true;
  } catch (e) { return false; }
});
// open the save folder in Finder so the user can see their plain .md files
ipcMain.handle('type:open-folder', async (_e, dir) => {
  try {
    const d = dir || defaultSaveDir();
    fs.mkdirSync(d, { recursive: true });
    const err = await shell.openPath(d);
    return { ok: !err, error: err || undefined };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

// --- auto-update ---
// reads latest-mac.yml from GitHub Releases (kvohs/type), downloads the new
// dmg in the background, prompts on quit to install. needs the .app to be
// signed + notarized, which it is.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// The renderer owns all update UX now — a quiet, progress-aware toast instead
// of a stack of native modal dialogs. We just forward electron-updater's
// lifecycle to it on one channel. `manualCheckInProgress` gates the chatty
// states (checking / up-to-date / error) so a background check stays silent
// unless it actually has a new version to download.
let manualCheckInProgress = false;

function sendUpdate(payload) {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) win.webContents.send('type:update', payload);
}

autoUpdater.on('checking-for-update', () => {
  if (manualCheckInProgress) sendUpdate({ state: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  // both manual and background — from here the progress bar tells the story
  sendUpdate({ state: 'available', version: info.version });
  manualCheckInProgress = false;
});

autoUpdater.on('download-progress', (p) => {
  sendUpdate({ state: 'progress', percent: p.percent });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdate({ state: 'ready', version: info.version });
});

autoUpdater.on('update-not-available', () => {
  if (manualCheckInProgress) sendUpdate({ state: 'none', version: APP_VERSION });
  manualCheckInProgress = false;
});

autoUpdater.on('error', (err) => {
  log.error('auto-update error', err);
  if (manualCheckInProgress) sendUpdate({ state: 'error', message: String(err && err.message || err) });
  manualCheckInProgress = false;
});

// renderer's "restart" button → quit, install, relaunch. The in-progress draft
// is mirrored to localStorage, so the restart preserves whatever you'd written.
ipcMain.handle('type:quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

function checkForUpdatesManually() {
  if (!app.isPackaged) {
    const win = BrowserWindow.getAllWindows()[0];
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Updates disabled in dev',
      message: 'Auto-update only runs in packaged builds. Run from a dmg install to test.',
      buttons: ['OK'],
    }).catch(() => {});
    return;
  }
  manualCheckInProgress = true;
  autoUpdater.checkForUpdates().catch((err) => {
    log.error('manual check failed', err);
  });
}

function buildMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => checkForUpdatesManually() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  // dev-mode dock icon on macOS — packaged builds use build/icon.icns automatically
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(path.join(__dirname, 'build', 'icon-1024.png')); } catch (e) {}
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // only check for updates in packaged builds — dev mode has no codesign
  // identity for electron-updater to verify against
  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
    // check again every 6 hours while the app is running
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
