const { contextBridge, ipcRenderer } = require('electron');

// app version is passed in by main via webPreferences.additionalArguments,
// so the renderer can show it without an async IPC roundtrip at startup
const versionArg = (process.argv || []).find((a) => a.startsWith('--type-version='));
const TYPE_VERSION = versionArg ? versionArg.split('=')[1] : '';

// Minimal, safe bridge for the renderer. Only these calls cross into Node.
contextBridge.exposeInMainWorld('typeAPI', {
  isDesktop: true,
  version: TYPE_VERSION,
  pickFolder: () => ipcRenderer.invoke('type:pick-folder'),
  saveNote: (payload) => ipcRenderer.invoke('type:save-note', payload),
  shareImage: (payload) => ipcRenderer.invoke('type:share-image', payload),
  setZen: (on) => ipcRenderer.invoke('type:set-zen', !!on),
  setOnTop: (on) => ipcRenderer.invoke('type:set-on-top', !!on),
});
