const { contextBridge, ipcRenderer } = require('electron');

// Minimal, safe bridge for the renderer. Only these calls cross into Node.
contextBridge.exposeInMainWorld('typeAPI', {
  isDesktop: true,
  pickFolder: () => ipcRenderer.invoke('type:pick-folder'),
  saveNote: (payload) => ipcRenderer.invoke('type:save-note', payload),
});
