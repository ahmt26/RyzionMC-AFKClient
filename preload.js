const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('windowControl', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  setRadarOpen: (open) => ipcRenderer.send('set-radar-open', open)
});
