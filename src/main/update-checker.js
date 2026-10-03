const { app, shell } = require('electron');
const https = require('https');

class UpdateChecker {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.repoOwner = 'MananDua28';
    this.repoName = 'Modula';
    try {
      this.currentVersion = (app && typeof app.getVersion === 'function') ? app.getVersion() : require('../../package.json').version;
    } catch {
      this.currentVersion = require('../../package.json').version;
    }
  }

  /**
   * Fetch latest release information from GitHub Releases API
   */
  async getLatestRelease() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.repoOwner}/${this.repoName}/releases/latest`,
        headers: {
          'User-Agent': `Modula-App/${this.currentVersion}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      const req = https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const release = JSON.parse(data);
              resolve(release);
            } catch (err) {
              reject(new Error(`Failed to parse release JSON: ${err.message}`));
            }
          } else {
            reject(new Error(`GitHub API returned status ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Update check request timed out'));
      });
    });
  }

  /**
   * Semver comparator: returns >0 if v1 > v2, 0 if v1 == v2, <0 if v1 < v2
   */
  compareVersions(v1, v2) {
    const clean1 = (v1 || '').replace(/^v/, '').trim();
    const clean2 = (v2 || '').replace(/^v/, '').trim();

    const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
    const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Check for updates
   * @param {boolean} isManual - whether check was initiated manually by user
   */
  async checkForUpdates(isManual = false) {
    try {
      const release = await this.getLatestRelease();
      const latestTag = release.tag_name || '';
      const isNewer = this.compareVersions(latestTag, this.currentVersion) > 0;

      // Platform specific asset download URL
      let directDownloadUrl = null;
      const isMac = process.platform === 'darwin';
      const isWin = process.platform === 'win32';

      if (release.assets && Array.isArray(release.assets)) {
        if (isMac) {
          const dmgAsset = release.assets.find(a => a.name.endsWith('.dmg'));
          if (dmgAsset) directDownloadUrl = dmgAsset.browser_download_url;
        } else if (isWin) {
          const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));
          if (exeAsset) directDownloadUrl = exeAsset.browser_download_url;
        }
      }

      const targetUrl = directDownloadUrl || release.html_url;

      const result = {
        updateAvailable: isNewer,
        currentVersion: this.currentVersion,
        latestVersion: latestTag.replace(/^v/, ''),
        releaseName: release.name || latestTag,
        releaseNotes: release.body || '',
        downloadUrl: targetUrl,
        releaseUrl: release.html_url,
        publishedAt: release.published_at,
        isManual
      };

      if (isNewer && this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('app:update-available', result);
      }

      return result;
    } catch (err) {
      console.warn('Update check failed:', err.message);
      return {
        updateAvailable: false,
        currentVersion: this.currentVersion,
        error: err.message,
        isManual
      };
    }
  }
}

module.exports = UpdateChecker;
