const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const { URL } = require('url');
const { BrowserWindow } = require('electron');

class PanoptoDownloader {
  constructor(configStore, getMainWindowFn) {
    this.configStore = configStore;
    this.getMainWindow = getMainWindowFn;
    this.isAuthenticating = false;
    this.authPromise = null;
  }

  extractInfoFromUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const url = rawUrl.replace(/&amp;/g, '&');

    const deliveryMatch = url.match(/custom_context_delivery(?:%3D|=)([a-f0-9\-]{36})/i)
      || url.match(/[?&]id=([a-f0-9\-]{36})/i)
      || url.match(/viewer\.aspx\?id=([a-f0-9\-]{36})/i);

    if (!deliveryMatch) return null;

    const deliveryId = deliveryMatch[1];
    const hostMatch = url.match(/https?%3A%2F%2F([a-zA-Z0-9.-]+\.panopto\.(?:com|eu|net|org))/i)
      || url.match(/https?:\/\/([a-zA-Z0-9.-]+\.panopto\.(?:com|eu|net|org))/i);

    const host = hostMatch ? hostMatch[1] : (this.configStore.getConfig().panoptoHost || 'bham.cloud.panopto.eu');

    return { deliveryId, host };
  }

  async getValidCookies(host, deliveryId, forcePrompt = false) {
    if (!forcePrompt) {
      const savedCookies = this.configStore.getPanoptoCookies();
      if (savedCookies && savedCookies.includes('.ASPXAUTH')) {
        return savedCookies;
      }
    }
    return await this.promptLogin(host, deliveryId);
  }

  promptLogin(host, deliveryId) {
    if (this.isAuthenticating && this.authPromise) {
      return this.authPromise;
    }

    this.isAuthenticating = true;
    this.authPromise = new Promise((resolve, reject) => {
      let resolved = false;
      const parentWin = typeof this.getMainWindow === 'function' ? this.getMainWindow() : null;

      const authWin = new BrowserWindow({
        width: 600,
        height: 750,
        title: 'Sign In to University Panopto - Modula',
        parent: parentWin || undefined,
        modal: !!parentWin,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const initialUrl = deliveryId
        ? `https://${host}/Panopto/Pages/Viewer.aspx?id=${deliveryId}`
        : `https://${host}/Panopto/Pages/Auth/Login.aspx`;

      const checkCookies = async () => {
        try {
          if (!authWin || authWin.isDestroyed()) return;
          const session = authWin.webContents.session;
          const cookies = await session.cookies.get({});
          const panoptoCookies = cookies.filter(c =>
            c.domain.includes('panopto') ||
            c.domain.includes('cloudfront') ||
            c.name === '.ASPXAUTH'
          );

          const hasAuth = panoptoCookies.some(c => c.name === '.ASPXAUTH');
          if (hasAuth && !resolved) {
            resolved = true;
            const cookieString = panoptoCookies.map(c => `${c.name}=${c.value}`).join('; ');
            this.configStore.setPanoptoCookies(cookieString, host);
            this.isAuthenticating = false;
            this.authPromise = null;
            if (!authWin.isDestroyed()) {
              authWin.close();
            }
            resolve(cookieString);
          }
        } catch (err) {
          console.warn('Error reading Panopto cookies:', err.message);
        }
      };

      authWin.webContents.on('did-finish-load', () => {
        checkCookies();
      });

      authWin.webContents.on('did-navigate', () => {
        checkCookies();
      });

      authWin.on('close', () => {
        this.isAuthenticating = false;
        this.authPromise = null;
        if (!resolved) {
          reject(new Error('Panopto authentication was cancelled.'));
        }
      });

      authWin.loadURL(initialUrl);
    });

    return this.authPromise;
  }

  async queryDeliveryInfo(host, deliveryId, cookies) {
    return new Promise((resolve) => {
      const payload = querystring.stringify({
        deliveryId: deliveryId,
        responseType: 'json'
      });

      const req = https.request({
        hostname: host,
        port: 443,
        path: '/Panopto/Pages/Viewer/DeliveryInfo.aspx',
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          'Cookie': cookies,
          'Referer': `https://${host}/Panopto/Pages/Viewer.aspx?id=${deliveryId}`
        },
        timeout: 20000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.ErrorCode === 2 || json.LoginRedirect === true) {
              return resolve({ unauthorized: true });
            }
            resolve({ unauthorized: false, delivery: json.Delivery });
          } catch (e) {
            resolve({ unauthorized: false, delivery: null, raw: body });
          }
        });
      });

      req.on('error', (err) => {
        console.warn('Error querying Panopto DeliveryInfo:', err.message);
        resolve({ unauthorized: false, delivery: null, error: err.message });
      });

      req.write(payload);
      req.end();
    });
  }

  async testPodcastDownloadUrl(host, deliveryId, cookies) {
    return new Promise((resolve) => {
      const pathUrl = `/Panopto/Podcast/Download/${deliveryId}.mp4`;
      const req = https.request({
        hostname: host,
        port: 443,
        path: pathUrl,
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Cookie': cookies
        },
        timeout: 15000
      }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301 || res.statusCode === 307) {
          return resolve({ accessible: true, downloadUrl: res.headers.location });
        }
        if (res.statusCode === 200) {
          return resolve({ accessible: true, downloadUrl: `https://${host}${pathUrl}` });
        }
        resolve({ accessible: false, statusCode: res.statusCode });
      });

      req.on('error', () => resolve({ accessible: false }));
      req.end();
    });
  }

  async resolveMedia(host, deliveryId) {
    let cookies = await this.getValidCookies(host, deliveryId, false);
    let di = await this.queryDeliveryInfo(host, deliveryId, cookies);

    if (di.unauthorized) {
      console.log('Panopto cookies expired, prompting user login...');
      cookies = await this.getValidCookies(host, deliveryId, true);
      di = await this.queryDeliveryInfo(host, deliveryId, cookies);
    }

    // 1. Check direct podcast download endpoint
    const podcastTest = await this.testPodcastDownloadUrl(host, deliveryId, cookies);
    if (podcastTest.accessible && podcastTest.downloadUrl) {
      return {
        type: 'mp4',
        url: podcastTest.downloadUrl,
        cookies: cookies,
        title: (di.delivery && di.delivery.SessionName) ? di.delivery.SessionName : null
      };
    }

    // 2. Check PodcastStreams in DeliveryInfo
    if (di.delivery && Array.isArray(di.delivery.PodcastStreams)) {
      for (const stream of di.delivery.PodcastStreams) {
        if (stream.StreamUrl && stream.StreamUrl.includes('.mp4')) {
          return {
            type: 'mp4',
            url: stream.StreamUrl,
            cookies: cookies,
            title: di.delivery.SessionName
          };
        }
      }
    }

    // 3. Check regular Streams in DeliveryInfo
    if (di.delivery && Array.isArray(di.delivery.Streams)) {
      // Find highest resolution progressive or primary stream
      for (const stream of di.delivery.Streams) {
        const streamUrl = stream.StreamUrl || stream.StreamHttpUrl;
        if (streamUrl && streamUrl.includes('.mp4')) {
          return {
            type: 'mp4',
            url: streamUrl,
            cookies: cookies,
            title: di.delivery.SessionName
          };
        }
      }

      // Check for HLS stream
      for (const stream of di.delivery.Streams) {
        const streamUrl = stream.StreamUrl || stream.StreamHttpUrl;
        if (streamUrl && streamUrl.includes('.m3u8')) {
          return {
            type: 'hls',
            url: streamUrl,
            cookies: cookies,
            title: di.delivery.SessionName
          };
        }
      }
    }

    // 4. Fallback to direct Podcast endpoint with cookies
    return {
      type: 'mp4',
      url: `https://${host}/Panopto/Podcast/Download/${deliveryId}.mp4`,
      cookies: cookies,
      title: (di.delivery && di.delivery.SessionName) ? di.delivery.SessionName : null
    };
  }

  async downloadToFile(videoUrl, cookies, destPath, onProgress, abortSignal) {
    return new Promise((resolve, reject) => {
      const execute = (currentUrl, redirectCount = 0) => {
        if (redirectCount > 10) {
          return reject(new Error('Too many HTTP redirects'));
        }

        if (abortSignal && abortSignal.aborted) {
          return reject(new Error('Download cancelled by user'));
        }

        const parsed = new URL(currentUrl);
        const protocol = parsed.protocol === 'https:' ? https : http;

        const req = protocol.get(currentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            ...(cookies ? { 'Cookie': cookies } : {})
          }
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let nextUrl = res.headers.location;
            if (!nextUrl.startsWith('http')) {
              nextUrl = new URL(nextUrl, currentUrl).toString();
            }
            return execute(nextUrl, redirectCount + 1);
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Failed to download video: HTTP ${res.statusCode} ${res.statusMessage}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let transferredBytes = 0;

          const fileStream = fs.createWriteStream(destPath);

          if (abortSignal) {
            abortSignal.addEventListener('abort', () => {
              res.destroy();
              fileStream.destroy();
              fs.unlink(destPath, () => {});
              reject(new Error('Download cancelled by user'));
            });
          }

          res.on('data', (chunk) => {
            transferredBytes += chunk.length;
            if (onProgress && totalBytes > 0) {
              const percent = Math.min(100, Math.round((transferredBytes / totalBytes) * 100));
              onProgress({
                percent,
                transferred: transferredBytes,
                total: totalBytes
              });
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              resolve({
                destPath,
                size: transferredBytes || totalBytes
              });
            });
          });

          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        });

        req.on('error', reject);
      };

      execute(videoUrl);
    });
  }
}

module.exports = PanoptoDownloader;
