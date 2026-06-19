const { contextBridge, ipcRenderer } = require('electron');

// Bridge for the desktop bar console. `isDesktop` lets the web UI show
// desktop-only controls (e.g. "Open TV Window") and hide them in a browser.
contextBridge.exposeInMainWorld('cantina', {
  isDesktop: true,
  openTvWindow: () => ipcRenderer.send('open-tv-window'),
});
