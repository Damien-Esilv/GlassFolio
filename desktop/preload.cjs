/**
 * Preload (sandboxed, so CommonJS and no local imports). Exposes one small, frozen API to the web app:
 * `window.glassfolioDesktop`. The web app treats its absence as "running in a browser".
 * Channel names must match desktop/main.mjs (checked by tests/unit/desktop/ipcChannels.test.ts).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'glassfolioDesktop',
  Object.freeze({
    getInfo: () => ipcRenderer.invoke('glassfolio:get-info'),
    getUpdateState: () => ipcRenderer.invoke('glassfolio:update-get-state'),
    checkForUpdates: () => ipcRenderer.invoke('glassfolio:update-check'),
    installUpdate: () => ipcRenderer.invoke('glassfolio:update-install'),
    openReleasePage: () => ipcRenderer.invoke('glassfolio:update-open-release-page'),
    setAutoUpdateCheck: (enabled) => ipcRenderer.invoke('glassfolio:set-auto-update-check', enabled === true),
    onUpdateState: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('glassfolio:update-state', handler);
      return () => ipcRenderer.removeListener('glassfolio:update-state', handler);
    },
  }),
);
