const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const ConfigStore = require('./config-store');
const CanvasAPI = require('./canvas-api');
const DownloadManager = require('./download-manager');
const SyncEngine = require('./sync-engine');
const UpdateChecker = require('./update-checker');
const AuthService = require('./auth-service');

let mainWindow = null;
let configStore = null;
let downloadManager = null;
let syncEngine = null;
let updateChecker = null;
let authService = null;

function createWindow() {
  configStore = new ConfigStore();
  const config = configStore.getConfig();

  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    title: 'Modula',
    backgroundColor: config.theme === 'light' ? '#ffffff' : '#09090b',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 16, y: 16 } : undefined,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  downloadManager = new DownloadManager(configStore, mainWindow);
  syncEngine = new SyncEngine(configStore, downloadManager, mainWindow);
  updateChecker = new UpdateChecker(mainWindow);
  authService = new AuthService(configStore);

  // Send lightweight heartbeat for active user metrics
  authService.sendHeartbeat().catch(() => {});

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Start background auto-sync
  syncEngine.start();

  // Check for app updates 4 seconds after launch
  setTimeout(() => {
    if (updateChecker) {
      updateChecker.checkForUpdates(false).catch(err => console.warn('Auto update check failed:', err.message));
    }
  }, 4000);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (syncEngine) syncEngine.stop();
  });
}

// App Lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Configuration
ipcMain.handle('config:get', async () => {
  return configStore.getConfig();
});

ipcMain.handle('config:save', async (_event, newConfig) => {
  const success = configStore.saveConfig(newConfig);
  if (syncEngine) {
    syncEngine.start(); // Restart with updated intervals/settings
  }
  return success;
});

ipcMain.handle('dialog:select-directory', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Modula Download Directory'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Canvas API
ipcMain.handle('canvas:test-connection', async (_event, { baseUrl, token }) => {
  return await CanvasAPI.testConnection(baseUrl, token);
});

ipcMain.handle('canvas:get-courses', async () => {
  const config = configStore.getConfig();
  if (!config.baseUrl || !config.token) {
    throw new Error('Canvas URL or API token missing. Please configure them in Settings.');
  }
  return await CanvasAPI.getCourses(config.baseUrl, config.token);
});

ipcMain.handle('canvas:get-modules', async (_event, courseId) => {
  const config = configStore.getConfig();
  const modules = await CanvasAPI.getModules(config.baseUrl, config.token, courseId);
  // Cache the modules for delta detection
  configStore.setCache(`course_modules_${courseId}`, modules);
  return modules;
});

// Downloads
ipcMain.handle('download:item', async (_event, { course, module, item, moduleIndex }) => {
  return await downloadManager.enqueueItem(course, module, item, moduleIndex);
});

ipcMain.handle('download:module', async (_event, { course, module, moduleIndex }) => {
  return await downloadManager.enqueueModule(course, module, moduleIndex);
});

ipcMain.handle('download:course', async (_event, { course, modules }) => {
  return await downloadManager.enqueueCourse(course, modules);
});

ipcMain.handle('download:cancel', async (_event, queueId) => {
  return downloadManager.cancelDownload(queueId);
});

ipcMain.handle('download:is-downloaded', async (_event, itemId) => {
  return configStore.isDownloaded(itemId);
});

ipcMain.handle('download:get-history', async () => {
  return configStore.getHistory();
});

// System
ipcMain.handle('system:open-path', async (_event, filePath) => {
  return downloadManager.openPath(filePath);
});

ipcMain.handle('system:show-in-folder', async (_event, filePath) => {
  return downloadManager.showInFolder(filePath);
});

// Auto-Sync
ipcMain.handle('sync:trigger', async () => {
  if (syncEngine) {
    await syncEngine.syncAllCourses(false);
    return true;
  }
  return false;
});

// App Version & Updates
ipcMain.handle('app:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('app:check-for-updates', async () => {
  if (updateChecker) {
    return await updateChecker.checkForUpdates(true);
  }
  return { updateAvailable: false, currentVersion: app.getVersion() };
});

ipcMain.handle('system:open-external', async (_event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// Student Verification & Onboarding
ipcMain.handle('auth:send-otp', async (_event, email) => {
  if (authService) {
    return await authService.sendOtp(email);
  }
  return { success: false, error: 'Auth service not initialized.' };
});

ipcMain.handle('auth:verify-otp', async (_event, { email, token }) => {
  if (authService) {
    return await authService.verifyOtp(email, token);
  }
  return { success: false, error: 'Auth service not initialized.' };
});

ipcMain.handle('auth:get-status', async () => {
  if (authService) {
    return authService.getAuthStatus();
  }
  return { isVerified: false };
});

