const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigStore {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.configFile = path.join(this.userDataPath, 'config.json');
    this.cacheFile = path.join(this.userDataPath, 'cache.json');
    this.historyFile = path.join(this.userDataPath, 'download-history.json');
    
    this.defaultConfig = {
      baseUrl: 'https://canvas.bham.ac.uk',
      token: '',
      downloadPath: path.join(app.getPath('downloads'), 'Modula'),
      theme: 'dark', // 'dark' | 'light'
      syncInterval: 15, // in minutes
      autoSync: true,
      autoDownloadNew: false,
      lastSyncTimestamp: null,
      deviceId: '',
      studentEmail: '',
      studentDomain: '',
      isVerified: false,
      verifiedAt: null,
      userId: null,
      sessionToken: null,
      panoptoCookies: '',
      panoptoHost: ''
    };

    this.config = this.loadConfig();
    this.cache = this.loadJson(this.cacheFile, {});
    this.history = this.loadJson(this.historyFile, {});
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        return { ...this.defaultConfig, ...JSON.parse(data) };
      }
    } catch (err) {
      console.error('Error loading config:', err);
    }
    return { ...this.defaultConfig };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error('Error saving config:', err);
      return false;
    }
  }

  getConfig() {
    return { ...this.config };
  }

  loadJson(filePath, defaultValue) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.error(`Error loading ${filePath}:`, err);
    }
    return defaultValue;
  }

  saveJson(filePath, data) {
    try {
      fs.mkdirSync(this.userDataPath, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (err) {
      console.error(`Error saving ${filePath}:`, err);
      return false;
    }
  }

  getCache(key) {
    return this.cache[key] || null;
  }

  setCache(key, value) {
    this.cache[key] = value;
    this.saveJson(this.cacheFile, this.cache);
  }

  recordDownload(itemId, fileInfo) {
    this.history[itemId] = {
      ...fileInfo,
      downloadedAt: new Date().toISOString()
    };
    this.saveJson(this.historyFile, this.history);
  }

  isDownloaded(itemId) {
    const item = this.history[itemId];
    if (item && item.localPath && fs.existsSync(item.localPath)) {
      return item;
    }
    return null;
  }

  getHistory() {
    return { ...this.history };
  }

  getPanoptoCookies() {
    return this.config.panoptoCookies || '';
  }

  setPanoptoCookies(cookies, host) {
    this.saveConfig({ panoptoCookies: cookies, panoptoHost: host });
  }

  clearPanoptoCookies() {
    this.saveConfig({ panoptoCookies: '', panoptoHost: '' });
  }
}

module.exports = ConfigStore;
