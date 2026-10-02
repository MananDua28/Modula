const { Notification } = require('electron');
const CanvasAPI = require('./canvas-api');

class SyncEngine {
  constructor(configStore, downloadManager, mainWindow) {
    this.configStore = configStore;
    this.downloadManager = downloadManager;
    this.mainWindow = mainWindow;
    this.timer = null;
    this.isSyncing = false;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  start() {
    this.stop();
    const config = this.configStore.getConfig();
    if (!config.autoSync || !config.token) return;

    const intervalMinutes = Math.max(config.syncInterval || 15, 3);
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[SyncEngine] Started. Polling every ${intervalMinutes} minutes.`);
    this.timer = setInterval(() => {
      this.syncAllCourses();
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[SyncEngine] Stopped.');
    }
  }

  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async syncAllCourses(silent = true) {
    if (this.isSyncing) return;
    const config = this.configStore.getConfig();
    if (!config.token || !config.baseUrl) return;

    this.isSyncing = true;
    this.notifyRenderer('sync:status', { state: 'syncing' });

    try {
      const courses = await CanvasAPI.getCourses(config.baseUrl, config.token);
      let totalNewModules = 0;
      let totalNewItems = 0;
      const detectedChanges = [];

      for (const course of courses) {
        const cacheKey = `course_modules_${course.id}`;
        const previousModules = this.configStore.getCache(cacheKey) || [];
        const currentModules = await CanvasAPI.getModules(config.baseUrl, config.token, course.id);

        const diff = this.computeDelta(course, previousModules, currentModules);

        if (diff.newModules.length > 0 || diff.newItems.length > 0) {
          totalNewModules += diff.newModules.length;
          totalNewItems += diff.newItems.length;
          detectedChanges.push({
            course,
            ...diff
          });

          // Update cached snapshot
          this.configStore.setCache(cacheKey, currentModules);

          // If auto-download is enabled, download new items
          if (config.autoDownloadNew) {
            for (const itemTask of diff.newItems) {
              await this.downloadManager.enqueueItem(
                course,
                itemTask.module,
                itemTask.item,
                itemTask.moduleIndex
              );
            }
          }
        }
      }

      const timestamp = new Date().toISOString();
      this.configStore.saveConfig({ lastSyncTimestamp: timestamp });

      this.notifyRenderer('sync:status', {
        state: 'idle',
        lastSync: timestamp,
        changes: detectedChanges
      });

      // Show native OS notification if new content found
      if ((totalNewModules > 0 || totalNewItems > 0)) {
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: 'Modula — New Canvas Content Found',
            body: `Detected ${totalNewModules} new module(s) and ${totalNewItems} new item(s). Your offline library is up to date!`,
            silent: false
          });
          notif.show();
        }
      }

    } catch (err) {
      console.error('[SyncEngine] Error during sync:', err.message);
      this.notifyRenderer('sync:status', { state: 'error', error: err.message });
    } finally {
      this.isSyncing = false;
    }
  }

  computeDelta(course, oldModules, newModules) {
    const oldModuleMap = new Map(oldModules.map(m => [m.id, m]));
    const oldItemSet = new Set();
    oldModules.forEach(m => {
      (m.items || []).forEach(it => oldItemSet.add(it.id));
    });

    const newModulesList = [];
    const newItemsList = [];

    newModules.forEach((m, idx) => {
      if (!oldModuleMap.has(m.id)) {
        newModulesList.push(m);
        // All items inside new module are also new
        (m.items || []).forEach(it => {
          if (it.type !== 'SubHeader') {
            newItemsList.push({ module: m, item: it, moduleIndex: idx + 1 });
          }
        });
      } else {
        // Module existed, check if new items added to it
        (m.items || []).forEach(it => {
          if (!oldItemSet.has(it.id) && it.type !== 'SubHeader') {
            newItemsList.push({ module: m, item: it, moduleIndex: idx + 1 });
          }
        });
      }
    });

    return {
      newModules: newModulesList,
      newItems: newItemsList
    };
  }
}

module.exports = SyncEngine;
