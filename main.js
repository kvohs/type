const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
