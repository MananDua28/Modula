const { app, shell } = require('electron');

class UpdateChecker {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.repoOwner = 'MananDua28';
    this.repoName = 'Modula';
    this.fallbackRepo = 'Canvas-Downloader';
    this.forceUpdateRequired = false;
    this.lastCheckResult = null;

    try {
      this.currentVersion = (app && typeof app.getVersion === 'function')
        ? app.getVersion()
        : require('../../package.json').version;
    } catch {
      this.currentVersion = require('../../package.json').version;
    }
  }

  /**
   * Fetch remote version manifest (version.json) from GitHub Raw
   */
  async getRemoteVersionManifest() {
    const urls = [
      `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/main/version.json`,
      `https://raw.githubusercontent.com/${this.repoOwner}/${this.fallbackRepo}/main/version.json`
    ];

    for (const url of urls) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': `Modula-App/${this.currentVersion}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          if (data && typeof data === 'object') {
            return data;
          }
        }
      } catch (_) {
        clearTimeout(timeout);
      }
    }

    return null;
  }

  /**
   * Fetch latest release information from GitHub Releases API
   */
  async getLatestRelease() {
    const repos = [this.repoName, this.fallbackRepo];

    for (const repo of repos) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      try {
        const response = await fetch(`https://api.github.com/repos/${this.repoOwner}/${repo}/releases/latest`, {
          signal: controller.signal,
          headers: {
            'User-Agent': `Modula-App/${this.currentVersion}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });
        clearTimeout(timeout);

        if (response.ok) {
          return await response.json();
        }
      } catch (err) {
        clearTimeout(timeout);
      }
    }

    return null;
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
   * Check for updates and evaluate minimum supported version requirement
   * @param {boolean} isManual - whether check was initiated manually by user
   */
  async checkForUpdates(isManual = false) {
    try {
      const [manifestResult, releaseResult] = await Promise.allSettled([
        this.getRemoteVersionManifest(),
        this.getLatestRelease()
      ]);

      const manifest = manifestResult.status === 'fulfilled' ? manifestResult.value : null;
      const release = releaseResult.status === 'fulfilled' ? releaseResult.value : null;

      // Determine latest version available
      let latestTag = '';
      if (release && release.tag_name) {
        latestTag = release.tag_name.replace(/^v/, '');
      } else if (manifest && manifest.latestVersion) {
        latestTag = manifest.latestVersion.replace(/^v/, '');
      } else {
        latestTag = this.currentVersion;
      }

      // Determine minimum supported version & force-update flag
      let minSupportedVersion = '1.0.0';
      let isForcedByManifest = false;

      if (manifest) {
        if (manifest.minSupportedVersion) {
          minSupportedVersion = String(manifest.minSupportedVersion).replace(/^v/, '').trim();
        }
        if (manifest.forceUpdate === true) {
          isForcedByManifest = true;
        }
      }

      // Check for inline directives in GitHub release body (e.g. MIN_SUPPORTED_VERSION: 1.0.4)
      if (release && typeof release.body === 'string') {
        const minMatch = release.body.match(/(?:MIN_SUPPORTED_VERSION|MIN_VERSION)\s*[:=]\s*v?([0-9.]+)/i);
        if (minMatch) {
          minSupportedVersion = minMatch[1];
        }
        if (/FORCE_UPDATE\s*[:=]\s*(?:true|yes|1)/i.test(release.body)) {
          isForcedByManifest = true;
        }
      }

      const isNewer = this.compareVersions(latestTag, this.currentVersion) > 0;
      const isBelowMin = this.compareVersions(this.currentVersion, minSupportedVersion) < 0;
      const isForceUpdate = isBelowMin || (isNewer && isForcedByManifest);

      this.forceUpdateRequired = isForceUpdate;

      // Resolve platform-specific direct download URL
      let directDownloadUrl = null;
      const isMac = process.platform === 'darwin';
      const isWin = process.platform === 'win32';

      if (release && release.assets && Array.isArray(release.assets)) {
        if (isMac) {
          const dmgAsset = release.assets.find(a => a.name.endsWith('.dmg'));
          if (dmgAsset) directDownloadUrl = dmgAsset.browser_download_url;
        } else if (isWin) {
          const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));
          if (exeAsset) directDownloadUrl = exeAsset.browser_download_url;
        }
      }

      const defaultDownloadUrl = (manifest && manifest.downloadUrl)
        || (release && release.html_url)
        || `https://github.com/${this.repoOwner}/${this.repoName}/releases/latest`;

      const targetUrl = directDownloadUrl || defaultDownloadUrl;

      const title = (manifest && manifest.title) || (isForceUpdate ? 'Update Required to Continue' : 'Update Available');
      const message = (manifest && manifest.message) || (
        isForceUpdate
          ? 'Your installed version of Modula is no longer supported. Please update to the latest version to continue accessing course materials and Canvas downloads.'
          : `A new version of Modula (v${latestTag}) is available with performance fixes and improvements.`
      );

      const result = {
        updateAvailable: isNewer,
        isForceUpdate,
        currentVersion: this.currentVersion,
        latestVersion: latestTag,
        minSupportedVersion,
        title,
        message,
        releaseName: (release && release.name) || `Modula v${latestTag}`,
        releaseNotes: (release && release.body) || '',
        downloadUrl: targetUrl,
        directDownloadUrl,
        releaseUrl: (release && release.html_url) || defaultDownloadUrl,
        publishedAt: (release && release.published_at) || (manifest && manifest.publishedAt) || null,
        isManual
      };

      this.lastCheckResult = result;

      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (isForceUpdate) {
          this.mainWindow.webContents.send('app:force-update-required', result);
        } else if (isNewer) {
          this.mainWindow.webContents.send('app:update-available', result);
        }
      }

      return result;
    } catch (err) {
      console.warn('Update check failed:', err.message);
      const fallbackResult = {
        updateAvailable: false,
        isForceUpdate: false,
        currentVersion: this.currentVersion,
        error: err.message,
        isManual
      };
      this.lastCheckResult = fallbackResult;
      return fallbackResult;
    }
  }

  isForceUpdateRequired() {
    return Boolean(this.forceUpdateRequired);
  }

  getLastResult() {
    return this.lastCheckResult;
  }
}

module.exports = UpdateChecker;
