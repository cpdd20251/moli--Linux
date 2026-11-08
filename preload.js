const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('moli', {
  boot: () => ipcRenderer.invoke('vm:boot'),
  desktopReady: () => ipcRenderer.invoke('vm:desktop-ready'),
  devTools: () => ipcRenderer.invoke('vm:devtools'),
  setLanguage: (language) => ipcRenderer.invoke('vm:language', language),
  restart: () => ipcRenderer.invoke('vm:restart'),
  stop: () => ipcRenderer.invoke('vm:stop'),
  info: () => ipcRenderer.invoke('vm:info'),
  onStatus: (callback) => subscribe('vm:status', callback),
  onDownload: (callback) => subscribe('vm:download', callback),
  onReady: (callback) => subscribe('vm:ready', callback),
  onDesktopReady: (callback) => subscribe('vm:desktop', callback),
  onError: (callback) => subscribe('vm:error', callback),
  onExit: (callback) => subscribe('vm:exit', callback)
});

