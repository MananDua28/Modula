const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('modula', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (newConfig) => ipcRenderer.invoke('config:save', newConfig),
  selectDownloadDirectory: () => ipcRenderer.invoke('dialog:select-directory'),

  // Canvas API
  testConnection: (baseUrl, token) => ipcRenderer.invoke('canvas:test-connection', { baseUrl, token }),
  getCourses: () => ipcRenderer.invoke('canvas:get-courses'),
  getModules: (courseId) => ipcRenderer.invoke('canvas:get-modules', courseId),

  // Downloads
  downloadItem: (course, module, item, moduleIndex) =>
    ipcRenderer.invoke('download:item', { course, module, item, moduleIndex }),
  downloadModule: (course, module, moduleIndex) =>
    ipcRenderer.invoke('download:module', { course, module, moduleIndex }),
  downloadCourse: (course, modules) =>
    ipcRenderer.invoke('download:course', { course, modules }),
  cancelDownload: (queueId) => ipcRenderer.invoke('download:cancel', queueId),
  isDownloaded: (itemId) => ipcRenderer.invoke('download:is-downloaded', itemId),
  getDownloadHistory: () => ipcRenderer.invoke('download:get-history'),

  // System & Files
  openPath: (path) => ipcRenderer.invoke('system:open-path', path),
  showItemInFolder: (path) => ipcRenderer.invoke('system:show-in-folder', path),

  // Auto-Sync
  triggerSync: () => ipcRenderer.invoke('sync:trigger'),

  // Event Listeners
  onDownloadQueued: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:queued', handler);
    return () => ipcRenderer.removeListener('download:queued', handler);
  },
  onDownloadStarted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:started', handler);
    return () => ipcRenderer.removeListener('download:started', handler);
  },
  onDownloadProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:progress', handler);
    return () => ipcRenderer.removeListener('download:progress', handler);
  },
  onDownloadCompleted: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:completed', handler);
    return () => ipcRenderer.removeListener('download:completed', handler);
  },
  onDownloadError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:error', handler);
    return () => ipcRenderer.removeListener('download:error', handler);
  },
  onDownloadCancelled: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('download:cancelled', handler);
    return () => ipcRenderer.removeListener('download:cancelled', handler);
  },
  onSyncStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },

  // App Version & Updates
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  openExternal: (url) => ipcRenderer.invoke('system:open-external', url),
  onUpdateAvailable: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('app:update-available', handler);
    return () => ipcRenderer.removeListener('app:update-available', handler);
  }
});
