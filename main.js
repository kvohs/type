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
ipcMain.handle('type:pick-folder', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Choose where type saves',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  return res.filePaths[0];
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
      body: JSON.stringify({ body, version: APP_VERSION }),
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

ipcMain.handle('type:save-note', async (_e, payload) => {
  try {
    const { content, filename } = payload || {};
    const dir = (payload && payload.dir) || app.getPath('downloads');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, filename);
    fs.writeFileSync(file, content, 'utf8');
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// --- auto-update ---
// reads latest-mac.yml from GitHub Releases (kvohs/type), downloads the new
// dmg in the background, prompts on quit to install. needs the .app to be
// signed + notarized, which it is.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// when set, the next update-{available,not-available,error} fires a dialog
// so a manual "Check for Updates…" click always gives the user feedback
let manualCheckInProgress = false;

autoUpdater.on('update-available', (info) => {
  if (manualCheckInProgress) {
    const win = BrowserWindow.getAllWindows()[0];
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update available',
      message: `type ${info.version} is downloading.`,
      detail: 'You’ll be prompted to install when the download finishes.',
      buttons: ['OK'],
    }).catch(() => {});
    manualCheckInProgress = false;
  }
});

autoUpdater.on('update-not-available', () => {
  if (manualCheckInProgress) {
    const win = BrowserWindow.getAllWindows()[0];
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'You’re up to date',
      message: `type ${APP_VERSION} is the latest version.`,
      buttons: ['OK'],
    }).catch(() => {});
    manualCheckInProgress = false;
  }
});

autoUpdater.on('update-downloaded', (info) => {
  const win = BrowserWindow.getAllWindows()[0];
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'type update ready',
    message: `type ${info.version} is ready to install.`,
    detail: 'The update applies the next time you quit and reopen type.',
    buttons: ['OK'],
    defaultId: 0,
  }).catch(() => {});
});

autoUpdater.on('error', (err) => {
  log.error('auto-update error', err);
  if (manualCheckInProgress) {
    const win = BrowserWindow.getAllWindows()[0];
    dialog.showMessageBox(win, {
      type: 'error',
      title: 'Update check failed',
      message: 'Couldn’t check for updates.',
      detail: String(err && err.message || err),
      buttons: ['OK'],
    }).catch(() => {});
    manualCheckInProgress = false;
  }
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
