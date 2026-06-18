const { contextBridge, ipcRenderer } = require('electron');

// app version is passed in by main via webPreferences.additionalArguments,
// so the renderer can show it without an async IPC roundtrip at startup
const versionArg = (process.argv || []).find((a) => a.startsWith('--type-version='));
const TYPE_VERSION = versionArg ? versionArg.split('=')[1] : '';

// debug = not a packaged build (dev `electron .` run). Mirrors the iOS bridge's
// `debug` flag so the renderer's usage signal can stay silent in dev.
const debugArg = (process.argv || []).find((a) => a.startsWith('--type-debug='));
const TYPE_DEBUG = debugArg ? debugArg.split('=')[1] === '1' : true;

// Minimal, safe bridge for the renderer. Only these calls cross into Node.
contextBridge.exposeInMainWorld('typeAPI', {
  isDesktop: true,
  debug: TYPE_DEBUG,
  version: TYPE_VERSION,
  pickFolder: () => ipcRenderer.invoke('type:pick-folder'),
  defaultSaveDir: () => ipcRenderer.invoke('type:default-save-dir'),   // { dir, icloud, label } for the settings folder label
  openFolder: (dir) => ipcRenderer.invoke('type:open-folder', dir || null),   // reveal the save folder in Finder
  saveNote: (payload) => ipcRenderer.invoke('type:save-note', payload),
  // kept-notes review: read / open / delete the .md files in the save folder
  listNotes: (dir) => ipcRenderer.invoke('type:list-notes', dir || null),
  readNote: (filename, dir) => ipcRenderer.invoke('type:read-note', { filename, dir: dir || null }),
  deleteNote: (filename, dir) => ipcRenderer.invoke('type:delete-note', { filename, dir: dir || null }),
  shareImage: (payload) => ipcRenderer.invoke('type:share-image', payload),
  shareNote: (payload) => ipcRenderer.invoke('type:share-note', payload),   // share a kept .md via the native macOS share sheet
  sendFeedback: (payload) => ipcRenderer.invoke('type:send-feedback', payload),
  captureFeedback: () => ipcRenderer.invoke('type:capture-feedback'),
  setZen: (on) => ipcRenderer.invoke('type:set-zen', !!on),
  setOnTop: (on) => ipcRenderer.invoke('type:set-on-top', !!on),
  // fires whenever the window enters or leaves macOS native fullscreen, so
  // settings.zen stays in sync no matter how it was triggered (settings click,
  // ⌃⌘F system shortcut, green-button menu, Esc, etc.)
  onFullscreenChanged: (cb) => {
    const handler = (_e, on) => cb(!!on);
    ipcRenderer.on('type:fullscreen-changed', handler);
    return () => ipcRenderer.off('type:fullscreen-changed', handler);
  },
  // fires once when the main process has called win.show() — used by the
  // renderer to defer the intro animation until the window is actually
  // visible, so the user always sees "type." typing out from the start
  onReady: (cb) => {
    const handler = () => cb();
    ipcRenderer.once('type:ready', handler);
    return () => ipcRenderer.off('type:ready', handler);
  },
  // auto-update lifecycle on a single channel: { state: 'checking' |
  // 'available' | 'progress' | 'ready' | 'none' | 'error', version?, percent?,
  // message? }. The renderer turns it into a quiet progress toast. Returns an
  // unsubscribe fn.
  onUpdate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('type:update', handler);
    return () => ipcRenderer.off('type:update', handler);
  },
  // the "restart" affordance on a downloaded update — quit, install, relaunch
  quitAndInstall: () => ipcRenderer.invoke('type:quit-and-install'),
});
