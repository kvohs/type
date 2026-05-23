const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { version: APP_VERSION } = require('./package.json');

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--type-version=${APP_VERSION}`],
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

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
  // network hiccup, rate limit, etc. — log but don't bother the user
  console.log('auto-update check failed:', err && err.message || err);
});

app.whenReady().then(() => {
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
