const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const CanvasAPI = require('./canvas-api');
const PanoptoDownloader = require('./panopto-downloader');

class DownloadManager {
  constructor(configStore, mainWindow) {
    this.configStore = configStore;
    this.mainWindow = mainWindow;
    this.panoptoDownloader = new PanoptoDownloader(configStore, () => this.mainWindow);
    this.queue = [];
    this.activeDownloads = new Map(); // id -> { abortController, item }
    this.maxConcurrent = 3;
    this.isProcessing = false;
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  sanitize(name) {
    if (!name) return 'Untitled';
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  parseVideoEmbeds(rawHtml, baseUrl, courseId, pageData) {
    if (!rawHtml || typeof rawHtml !== 'string') return [];
    const videos = [];
    const seen = new Set();

    // 1. Panopto LTI tool or Canvas external_tools/retrieve
    const panoptoRegex = /(?:src|href)=["']([^"']*(?:external_tools\/retrieve|panopto)[^"']*)["']/gi;
    let match;
    while ((match = panoptoRegex.exec(rawHtml)) !== null) {
      const rawUrl = match[1].replace(/&amp;/g, '&');
      const deliveryMatch = rawUrl.match(/custom_context_delivery(?:%3D|=)([a-f0-9\-]{36})/i)
        || rawUrl.match(/[?&]id=([a-f0-9\-]{36})/i);

      if (deliveryMatch) {
        const deliveryId = deliveryMatch[1];
        const hostMatch = rawUrl.match(/https?%3A%2F%2F([a-zA-Z0-9.-]+\.panopto\.(?:com|eu|net|org))/i)
          || rawUrl.match(/https?:\/\/([a-zA-Z0-9.-]+\.panopto\.(?:com|eu|net|org))/i);
        const host = hostMatch ? hostMatch[1] : 'bham.cloud.panopto.eu';
        const viewerUrl = `https://${host}/Panopto/Pages/Viewer.aspx?id=${deliveryId}`;
        const embedUrl = `https://${host}/Panopto/Pages/Embed.aspx?id=${deliveryId}&autoplay=false&offerviewer=true&showtitle=true&showbrand=false&captions=true&interactivity=all`;

        let canvasLaunchUrl = rawUrl;
        if (!canvasLaunchUrl.startsWith('http')) {
          const cleanBase = (baseUrl || '').replace(/\/+$/, '');
          canvasLaunchUrl = cleanBase + (rawUrl.startsWith('/') ? '' : '/') + rawUrl;
        }

        if (!seen.has(viewerUrl)) {
          seen.add(viewerUrl);
          videos.push({
            type: 'panopto',
            platformName: 'Panopto Lecture Recording',
            deliveryId,
            host,
            viewerUrl,
            embedUrl,
            canvasLaunchUrl,
            rawUrl
          });
        }
      }
    }

    // 2. Direct Panopto Embed/Viewer URLs in iframes or links
    const panoptoDirectRegex = /(?:src|href)=["'](https?:\/\/([a-zA-Z0-9.-]+\.panopto\.(?:com|eu|net|org))\/Panopto\/Pages\/(?:Embed|Viewer)\.aspx\?[^"']*)["']/gi;
    while ((match = panoptoDirectRegex.exec(rawHtml)) !== null) {
      const fullUrl = match[1].replace(/&amp;/g, '&');
      const host = match[2];
      const idMatch = fullUrl.match(/[?&]id=([a-f0-9\-]{36})/i);
      if (idMatch) {
        const deliveryId = idMatch[1];
        const viewerUrl = `https://${host}/Panopto/Pages/Viewer.aspx?id=${deliveryId}`;
        const embedUrl = `https://${host}/Panopto/Pages/Embed.aspx?id=${deliveryId}&autoplay=false&offerviewer=true&showtitle=true&showbrand=false&captions=true&interactivity=all`;
        if (!seen.has(viewerUrl)) {
          seen.add(viewerUrl);
          videos.push({
            type: 'panopto',
            platformName: 'Panopto Lecture Recording',
            deliveryId,
            host,
            viewerUrl,
            embedUrl,
            canvasLaunchUrl: fullUrl,
            rawUrl: fullUrl
          });
        }
      }
    }

    // 3. YouTube Embeds
    const ytRegex = /(?:src|href)=["'](https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)([a-zA-Z0-9_\-]+)[^"']*)["']/gi;
    while ((match = ytRegex.exec(rawHtml)) !== null) {
      const videoId = match[2];
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`;
      if (!seen.has(watchUrl)) {
        seen.add(watchUrl);
        videos.push({
          type: 'youtube',
          platformName: 'YouTube Video',
          videoId,
          viewerUrl: watchUrl,
          embedUrl,
          canvasLaunchUrl: watchUrl,
          rawUrl: match[1]
        });
      }
    }

    // 4. Vimeo Embeds
    const vimeoRegex = /(?:src|href)=["'](https?:\/\/player\.vimeo\.com\/video\/(\d+)[^"']*)["']/gi;
    while ((match = vimeoRegex.exec(rawHtml)) !== null) {
      const videoId = match[2];
      const watchUrl = `https://vimeo.com/${videoId}`;
      const embedUrl = `https://player.vimeo.com/video/${videoId}`;
      if (!seen.has(watchUrl)) {
        seen.add(watchUrl);
        videos.push({
          type: 'vimeo',
          platformName: 'Vimeo Video',
          videoId,
          viewerUrl: watchUrl,
          embedUrl,
          canvasLaunchUrl: watchUrl,
          rawUrl: match[1]
        });
      }
    }

    return videos;
  }

  resolveVideoFromUrl(rawUrl, baseUrl, courseId, item) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const url = rawUrl.replace(/&amp;/g, '&');

    // Panopto delivery ID
    const deliveryMatch = url.match(/custom_context_delivery(?:%3D|=)([a-f0-9\-]{36})/i)
      || url.match(/[?&]id=([a-f0-9\-]{36})/i);

    if (deliveryMatch) {
      const deliveryId = deliveryMatch[1];
      const hostMatch = url.match(/https?%3A%2F%2F([a-zA-Z0-9.-]+\.panopto\.(?:com|eu|net|org))/i)
        || url.match(/https?:\/\/([a-zA-Z0-9.-]+\.panopto\.(?:com|eu|net|org))/i);
      const host = hostMatch ? hostMatch[1] : 'bham.cloud.panopto.eu';
      return {
        type: 'panopto',
        platformName: 'Panopto Lecture Recording',
        deliveryId,
        host,
        viewerUrl: `https://${host}/Panopto/Pages/Viewer.aspx?id=${deliveryId}`,
        embedUrl: `https://${host}/Panopto/Pages/Embed.aspx?id=${deliveryId}&autoplay=false&offerviewer=true&showtitle=true&showbrand=false&captions=true&interactivity=all`,
        canvasLaunchUrl: url
      };
    }

    // YouTube
    const ytMatch = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_\-]+)/i);
    if (ytMatch) {
      const videoId = ytMatch[1];
      return {
        type: 'youtube',
        platformName: 'YouTube Video',
        videoId,
        viewerUrl: `https://www.youtube.com/watch?v=${videoId}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
        canvasLaunchUrl: url
      };
    }

    // Vimeo
    const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeoMatch) {
      const videoId = vimeoMatch[1];
      return {
        type: 'vimeo',
        platformName: 'Vimeo Video',
        videoId,
        viewerUrl: `https://vimeo.com/${videoId}`,
        embedUrl: `https://player.vimeo.com/video/${videoId}`,
        canvasLaunchUrl: url
      };
    }

    return null;
  }

  cleanHtmlBody(body, videos = []) {
    if (!body || typeof body !== 'string') return '';
    let cleaned = body;

    // Remove any external mobile app or tracker scripts injected by Canvas
    cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // For any detected video, remove the broken Canvas external_tools/retrieve iframe
    // so the student does not see the dead grey iframe box
    for (const v of videos) {
      if (v.rawUrl) {
        const escapedRaw = v.rawUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const iframeRegex = new RegExp(`<iframe[^>]*src=["'][^"']*${escapedRaw}[^"']*["'][^>]*>\\s*<\\/iframe>`, 'gi');
        cleaned = cleaned.replace(iframeRegex, '');
      }
    }
    // Also remove generic external_tools/retrieve and Panopto iframes so unauthenticated error boxes never display
    cleaned = cleaned.replace(/<iframe[^>]*src=["'][^"']*panopto\.[^"']*["'][^>]*>\s*<\/iframe>/gi, '');
    cleaned = cleaned.replace(/<iframe[^>]*src=["'][^"']*external_tools\/retrieve[^"']*["'][^>]*>\s*<\/iframe>/gi, '');

    return cleaned.trim();
  }

  buildPageHtml(pageData, title, body, videos) {
    const pageTitle = pageData.title || title;
    const canvasUrl = pageData.html_url || '';
    const cleanedBody = this.cleanHtmlBody(body, videos);

    let videoCardsHtml = '';
    if (videos && videos.length > 0) {
      videoCardsHtml = videos.map(v => {
        const isPanopto = v.type === 'panopto';
        const primaryUrl = isPanopto ? (canvasUrl || v.canvasLaunchUrl || v.viewerUrl) : (v.viewerUrl || canvasUrl);
        const playBtnText = isPanopto ? 'Play Lecture Recording' : 'Watch Video';

        return `
    <div class="modula-video-card">
      <div class="modula-video-header">
        <div class="modula-video-tag">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          ${this.escapeHtml(v.platformName)}
        </div>
        <h2 class="modula-video-title">${this.escapeHtml(pageTitle)}</h2>
        <span class="modula-video-subtitle">${isPanopto ? 'University Lecture Capture • Canvas SSO' : 'Embedded Video Stream'}</span>
      </div>

      <div class="modula-video-body">
        ${isPanopto ? `
        <a href="${this.escapeHtml(primaryUrl)}" target="_blank" rel="noopener noreferrer" class="modula-video-screen-banner" title="Click anywhere to play recording in browser">
          <div class="modula-video-screen-backdrop"></div>
          <div class="modula-video-screen-content">
            <div class="modula-video-play-btn" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 20 12 7 20 7 4"></polygon></svg>
            </div>
            <div class="modula-video-screen-heading">${this.escapeHtml(pageTitle)}</div>
            <div class="modula-video-screen-pill">
              <span class="pulse-dot"></span> Authenticated Canvas Stream
            </div>
            <div class="modula-video-screen-subtext">Click to stream directly with Single Sign-On (Canvas LTI)</div>
          </div>
        </a>` : (v.embedUrl ? `
        <div class="modula-video-embed-wrap">
          <iframe src="${this.escapeHtml(v.embedUrl)}" allowfullscreen allow="autoplay; fullscreen; encrypted-media"></iframe>
        </div>` : '')}

        <div class="modula-video-actions">
          <a href="${this.escapeHtml(primaryUrl)}" target="_blank" rel="noopener noreferrer" class="modula-btn-primary">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            ${playBtnText}
          </a>
          ${(isPanopto && v.viewerUrl && v.viewerUrl !== primaryUrl) ? `
          <a href="${this.escapeHtml(v.viewerUrl)}" target="_blank" rel="noopener noreferrer" class="modula-btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            Panopto Direct Link
          </a>` : ''}
          ${(canvasUrl && canvasUrl !== primaryUrl) ? `
          <a href="${this.escapeHtml(canvasUrl)}" target="_blank" rel="noopener noreferrer" class="modula-btn-secondary">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            Open in Canvas
          </a>` : ''}
        </div>

        <p class="modula-video-note">
          🔒 <strong>University SSO Protected:</strong> University lecture recordings are secured by your institution's Single Sign-On (SSO). Clicking <strong>${playBtnText}</strong> launches the lecture via Canvas with complete slide navigation, variable playback speeds, full audio, and searchable transcripts.
        </p>
      </div>
    </div>`;
      }).join('\n');
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(pageTitle)}</title>
  <style>
    :root {
      --bg: #0d0d0f;
      --card-bg: #161619;
      --card-border: #28282c;
      --text: #f4f4f5;
      --text-muted: #9da0a8;
      --accent: #E13F2B;
      --accent-hover: #c93422;
      --accent-soft: rgba(225, 63, 43, 0.12);
      --btn-secondary-bg: #222226;
      --btn-secondary-hover: #2f2f35;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --card-border: #e2e8f0;
        --text: #0f172a;
        --text-muted: #64748b;
        --accent: #E13F2B;
        --accent-hover: #c93422;
        --accent-soft: rgba(225, 63, 43, 0.08);
        --btn-secondary-bg: #f1f5f9;
        --btn-secondary-hover: #e2e8f0;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      max-width: 880px;
      margin: 40px auto;
      padding: 0 24px 60px;
      color: var(--text);
      background: var(--bg);
    }
    .page-header {
      padding-bottom: 18px;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .canvas-link-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 500;
      color: var(--accent);
      text-decoration: none;
    }
    .canvas-link-badge:hover { text-decoration: underline; }
    
    /* Video Card */
    .modula-video-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
      margin: 20px 0 28px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
    }
    .modula-video-header {
      padding: 16px 20px;
      background: var(--accent-soft);
      border-bottom: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .modula-video-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .modula-video-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
    }
    .modula-video-subtitle {
      font-size: 12px;
      color: var(--text-muted);
    }
    .modula-video-body {
      padding: 20px;
    }

    /* Video Screen Banner (for Panopto SSO streams) */
    .modula-video-screen-banner {
      display: flex;
      position: relative;
      width: 100%;
      min-height: 250px;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 16px;
      border: 1px solid var(--card-border);
      background: linear-gradient(135deg, #151518 0%, #0d0d10 50%, #171212 100%);
      text-decoration: none;
      cursor: pointer;
      box-shadow: inset 0 0 80px rgba(0, 0, 0, 0.6);
      transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    }
    @media (prefers-color-scheme: light) {
      .modula-video-screen-banner {
        background: linear-gradient(135deg, #1e2530 0%, #0f172a 100%);
      }
    }
    .modula-video-screen-banner:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: 0 12px 28px rgba(225, 63, 43, 0.22), inset 0 0 60px rgba(0, 0, 0, 0.4);
    }
    .modula-video-screen-backdrop {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(circle at center, rgba(225, 63, 43, 0.15) 0%, transparent 70%);
      pointer-events: none;
    }
    .modula-video-screen-content {
      position: relative;
      z-index: 2;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      text-align: center;
      gap: 10px;
    }
    .modula-video-play-btn {
      width: 62px;
      height: 62px;
      border-radius: 50%;
      background: var(--accent);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(225, 63, 43, 0.45);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      margin-bottom: 4px;
    }
    .modula-video-screen-banner:hover .modula-video-play-btn {
      transform: scale(1.12);
      box-shadow: 0 10px 32px rgba(225, 63, 43, 0.65);
    }
    .modula-video-screen-heading {
      font-size: 17px;
      font-weight: 600;
      color: #ffffff;
      max-width: 600px;
      line-height: 1.35;
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
    }
    .modula-video-screen-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(255, 255, 255, 0.1);
      color: #e4e4e7;
      padding: 4px 12px;
      border-radius: 20px;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .modula-video-screen-subtext {
      font-size: 12px;
      color: #a1a1aa;
    }

    .modula-video-embed-wrap {
      position: relative;
      width: 100%;
      padding-top: 56.25%;
      border-radius: 8px;
      overflow: hidden;
      background: #000;
      margin-bottom: 16px;
      border: 1px solid var(--card-border);
    }
    .modula-video-embed-wrap iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .modula-video-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }
    .modula-btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--accent);
      color: #ffffff !important;
      padding: 9px 18px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 7px;
      text-decoration: none;
      transition: background 0.15s ease, transform 0.1s ease;
    }
    .modula-btn-primary:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    .modula-btn-secondary {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--btn-secondary-bg);
      color: var(--text) !important;
      border: 1px solid var(--card-border);
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 7px;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .modula-btn-secondary:hover {
      background: var(--btn-secondary-hover);
    }
    .modula-video-note {
      font-size: 11.5px;
      color: var(--text-muted);
      line-height: 1.45;
    }
    .page-content {
      font-size: 14.5px;
      line-height: 1.65;
      color: var(--text);
    }
    .page-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; }
    .page-content pre { background: var(--card-bg); border: 1px solid var(--card-border); padding: 14px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-size: 13px; }
    .page-content a { color: var(--accent); }
    .page-content table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .page-content th, .page-content td { padding: 9px 12px; border: 1px solid var(--card-border); text-align: left; }
    .page-content th { background: var(--btn-secondary-bg); }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${this.escapeHtml(pageTitle)}</h1>
    ${canvasUrl ? `<a class="canvas-link-badge" href="${this.escapeHtml(canvasUrl)}" target="_blank" rel="noopener noreferrer">↗ Open Page in Canvas</a>` : ''}
  </div>

  ${videoCardsHtml}

  <div class="page-content">
    ${cleanedBody}
  </div>
</body>
</html>`;
  }

  buildPageMarkdown(pageData, title, body, videos) {
    const pageTitle = pageData.title || title;
    const canvasUrl = pageData.html_url || '';
    const cleanedBody = this.cleanHtmlBody(body, videos);
    const bodyMd = this.htmlToMarkdown(cleanedBody);

    const lines = [
      `# ${pageTitle}`,
      ''
    ];

    if (canvasUrl) {
      lines.push(`- **Canvas Page:** [Open in Canvas](${canvasUrl})`);
      lines.push('');
    }

    if (videos && videos.length > 0) {
      for (const v of videos) {
        const isPanopto = v.type === 'panopto';
        const primaryUrl = isPanopto ? (canvasUrl || v.canvasLaunchUrl || v.viewerUrl) : (v.viewerUrl || canvasUrl);
        const playBtnText = isPanopto ? 'Play Lecture Recording' : 'Watch Video';

        lines.push('---');
        lines.push('');
        lines.push(`### 🎥 ${v.platformName}: ${pageTitle}`);
        lines.push(`- 🔗 **[▶ ${playBtnText}](${primaryUrl})**`);
        if (isPanopto && v.viewerUrl && v.viewerUrl !== primaryUrl) {
          lines.push(`- 🔗 **[Panopto Direct Link](${v.viewerUrl})**`);
        }
        if (canvasUrl && canvasUrl !== primaryUrl) {
          lines.push(`- 🔗 **[Open in Canvas Page](${canvasUrl})**`);
        }
        lines.push('');
        lines.push(`> *Note: University lecture recordings require Single Sign-On (SSO). The link above opens directly in your browser with full player controls, speed adjustments, slide navigation, and transcripts.*`);
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    if (bodyMd) {
      lines.push('## Page Content');
      lines.push('');
      lines.push(bodyMd);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  buildLinkHtml(title, targetUrl, item, videoInfo) {
    const isVideo = Boolean(videoInfo);
    const platformName = videoInfo ? videoInfo.platformName : (item.type === 'ExternalTool' ? 'Canvas External Tool' : 'External Web Resource');
    const btnText = isVideo ? '▶ Play Lecture Recording' : 'Open Resource';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <meta http-equiv="refresh" content="1; url=${this.escapeHtml(targetUrl)}">
  <style>
    :root {
      --bg: #0d0d0f;
      --card-bg: #161619;
      --card-border: #28282c;
      --text: #f4f4f5;
      --text-muted: #9da0a8;
      --accent: #E13F2B;
      --accent-hover: #c93422;
      --btn-secondary-bg: #222226;
      --btn-secondary-hover: #2f2f35;
    }
    @media (prefers-color-scheme: light) {
      :root {
        --bg: #f8fafc;
        --card-bg: #ffffff;
        --card-border: #e2e8f0;
        --text: #0f172a;
        --text-muted: #64748b;
        --accent: #E13F2B;
        --accent-hover: #c93422;
        --btn-secondary-bg: #f1f5f9;
        --btn-secondary-hover: #e2e8f0;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
    }
    .launch-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      max-width: 520px;
      width: 100%;
      padding: 32px 28px;
      text-align: center;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      background: rgba(225, 63, 43, 0.1);
      padding: 4px 10px;
      border-radius: 5px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.35;
    }
    p {
      font-size: 13px;
      color: var(--text-muted);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-launch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: var(--accent);
      color: #fff !important;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 8px;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .btn-launch:hover { background: var(--accent-hover); }
    .auto-note {
      font-size: 11.5px;
      color: var(--text-muted);
      margin-top: 16px;
    }
  </style>
  <script>
    setTimeout(function() {
      window.location.href = ${JSON.stringify(targetUrl)};
    }, 1200);
  </script>
</head>
<body>
  <div class="launch-card">
    <div class="badge">${this.escapeHtml(platformName)}</div>
    <h1>${this.escapeHtml(title)}</h1>
    <p>Opening link in your default browser where your student account is signed in.</p>
    <div class="actions">
      <a href="${this.escapeHtml(targetUrl)}" class="btn-launch">${btnText}</a>
    </div>
    <div class="auto-note">Redirecting automatically in 1 second...</div>
  </div>
</body>
</html>`;
  }

  buildLinkMarkdown(title, targetUrl, item, videoInfo) {
    const isVideo = Boolean(videoInfo);
    const platformName = videoInfo ? videoInfo.platformName : (item.type === 'ExternalTool' ? 'Canvas External Tool' : 'External Web Resource');

    const lines = [
      `# ${title}`,
      '',
      `- **Resource Type:** ${platformName}`,
      `- 🔗 **[${isVideo ? '▶ Play Lecture Recording' : 'Open Resource Link'}](${targetUrl})**`
    ];

    if (item.htmlUrl && item.htmlUrl !== targetUrl) {
      lines.push(`- 🔗 **[View on Canvas](${item.htmlUrl})**`);
    }
    if (videoInfo && videoInfo.viewerUrl && videoInfo.viewerUrl !== targetUrl) {
      lines.push(`- 🔗 **[Panopto Direct Link](${videoInfo.viewerUrl})**`);
    }

    lines.push('');
    lines.push(`> *Note: This resource is hosted online. The link above opens directly in your browser with your active university Single Sign-On (SSO) session.*`);

    return lines.join('\n');
  }

  htmlToMarkdown(html) {
    if (!html) return '';
    let md = html;

    // Strip scripts and styles before conversion
    md = md.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    md = md.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Replace headings
    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
    md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
    md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n');
    md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n');

    // Replace paragraphs & breaks
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
    md = md.replace(/<br\s*[\/]?>/gi, '\n');

    // Replace lists
    md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
    md = md.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

    // Replace bold & italics
    md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**');
    md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*');

    // Replace code
    md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Replace links
    md = md.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Strip all other HTML tags
    md = md.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    md = md.replace(/&nbsp;/g, ' ')
           .replace(/&amp;/g, '&')
           .replace(/&lt;/g, '<')
           .replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"')
           .replace(/&#39;/g, "'");

    return md.replace(/\n{3,}/g, '\n\n').trim();
  }

  getItemTargetDirectory(course, module, moduleIndex = 1) {
    const config = this.configStore.getConfig();
    const basePath = config.downloadPath || path.join(process.env.HOME || '', 'Downloads', 'Modula');
    
    const courseFolder = this.sanitize(
      course.courseCode ? `${course.courseCode} - ${course.name}` : course.name
    );
    
    const prefix = String(moduleIndex).padStart(2, '0');
    const moduleFolder = `${prefix}_${this.sanitize(module.name)}`;

    const targetDir = path.join(basePath, courseFolder, moduleFolder);
    fs.mkdirSync(targetDir, { recursive: true });
    return targetDir;
  }

  async enqueueItem(course, module, item, moduleIndex = 1) {
    const queueId = `${course.id}_${module.id}_${item.id}`;

    // Check if already in queue or downloading
    if (this.activeDownloads.has(queueId) || this.queue.some(q => q.queueId === queueId)) {
      return { status: 'already_queued' };
    }

    const task = {
      queueId,
      course,
      module,
      item,
      moduleIndex,
      status: 'pending',
      percent: 0,
      createdAt: Date.now()
    };

    this.queue.push(task);
    this.notifyRenderer('download:queued', { queueId, item, module });
    this.processQueue();
    return { status: 'queued', queueId };
  }

  async enqueueModule(course, module, moduleIndex = 1) {
    const items = module.items || [];
    const results = [];
    for (const item of items) {
      if (item.type === 'SubHeader') continue;
      const res = await this.enqueueItem(course, module, item, moduleIndex);
      results.push(res);
    }
    return results;
  }

  async enqueueCourse(course, modules) {
    const results = [];
    for (let i = 0; i < modules.length; i++) {
      const module = modules[i];
      const res = await this.enqueueModule(course, module, i + 1);
      results.push(...res);
    }
    return results;
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeDownloads.size < this.maxConcurrent) {
      const task = this.queue.shift();
      if (!task) break;

      const abortController = new AbortController();
      this.activeDownloads.set(task.queueId, { abortController, task });

      this.executeDownload(task, abortController.signal).finally(() => {
        this.activeDownloads.delete(task.queueId);
        this.processQueue();
      });
    }

    this.isProcessing = false;
  }

  async executeDownload(task, abortSignal) {
    const { queueId, course, module, item, moduleIndex } = task;
    const config = this.configStore.getConfig();
    const token = config.token;
    const baseUrl = config.baseUrl;

    const targetDir = this.getItemTargetDirectory(course, module, moduleIndex);
    this.notifyRenderer('download:started', { queueId, item });

    try {
      if (item.type === 'File') {
        let downloadUrl = item.downloadUrl;
        let fileName = this.sanitize(item.title || 'file');
        let fileSize = (item.contentDetails && item.contentDetails.size) ? item.contentDetails.size : 0;

        if (!downloadUrl) {
          let fileDetails = null;
          try {
            if (item.url && !item.url.includes('/download')) {
              fileDetails = await CanvasAPI.getFileDetails(baseUrl, token, item.url);
            } else if (item.contentId) {
              fileDetails = await CanvasAPI.getFileDetails(baseUrl, token, item.contentId);
            }
          } catch (e) {
            console.warn('Could not fetch file details via API, falling back to item URL:', e.message);
          }

          if (fileDetails && fileDetails.url) {
            downloadUrl = fileDetails.url;
            fileName = this.sanitize(fileDetails.display_name || item.title || 'file');
            fileSize = fileDetails.size || fileSize;
          } else if (item.url) {
            downloadUrl = item.url;
          }
        }

        if (!downloadUrl) {
          throw new Error('Unable to resolve file download URL from Canvas');
        }

        // Ensure extension exists if detectable
        if (!path.extname(fileName)) {
          const matchExt = downloadUrl.match(/\.(pdf|pptx?|docx?|xlsx?|zip|rar|py|c|cpp|java|ipynb|mat)(\?|$)/i);
          if (matchExt) {
            fileName += '.' + matchExt[1].toLowerCase();
          }
        }

        const destPath = path.join(targetDir, fileName);

        const dlResult = await CanvasAPI.downloadToFile(
          downloadUrl,
          token,
          destPath,
          (progress) => {
            this.notifyRenderer('download:progress', {
              queueId,
              percent: progress.percent,
              downloaded: progress.downloaded,
              total: progress.total
            });
          },
          abortSignal
        );

        const recordedSize = (dlResult && dlResult.size) ? dlResult.size : fileSize;

        this.configStore.recordDownload(item.id, {
          localPath: destPath,
          size: recordedSize,
          title: item.title,
          courseId: course.id,
          moduleId: module.id
        });

        this.notifyRenderer('download:completed', {
          queueId,
          item,
          localPath: destPath
        });

      } else if (item.type === 'Page') {
        const pageUrl = item.pageUrl || (item.url ? item.url.split('/').pop() : null);
        if (!pageUrl) throw new Error('Missing page URL identifier');

        const pageData = await CanvasAPI.getPageDetails(baseUrl, token, course.id, pageUrl);
        const title = this.sanitize(pageData.title || item.title || 'page');
        const body = pageData.body || '';

        // Detect videos (Panopto, YouTube, Vimeo, Canvas Studio)
        const videos = this.parseVideoEmbeds(body, baseUrl, course.id, pageData);

        // 1. Save as HTML with clean video launch card
        const htmlPath = path.join(targetDir, `${title}.html`);
        const fullHtml = this.buildPageHtml(pageData, title, body, videos);
        fs.writeFileSync(htmlPath, fullHtml, 'utf8');

        // 2. Save as Markdown with rich video links
        const mdPath = path.join(targetDir, `${title}.md`);
        const mdContent = this.buildPageMarkdown(pageData, title, body, videos);
        fs.writeFileSync(mdPath, mdContent, 'utf8');

        // 3. If videos exist, also save native desktop web shortcuts for 1-click browser launch
        if (videos.length > 0) {
          const primaryVideo = videos[0];
          const isPanopto = primaryVideo.type === 'panopto';
          const primaryUrl = isPanopto
            ? (pageData.html_url || primaryVideo.canvasLaunchUrl || primaryVideo.viewerUrl)
            : (primaryVideo.viewerUrl || pageData.html_url);

          try {
            const weblocPath = path.join(targetDir, `[Watch] ${title}.webloc`);
            const weblocContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>URL</key>
  <string>${this.escapeXml(primaryUrl)}</string>
</dict>
</plist>`;
            fs.writeFileSync(weblocPath, weblocContent, 'utf8');

            const urlPath = path.join(targetDir, `[Watch] ${title}.url`);
            const urlContent = `[InternetShortcut]\nURL=${primaryUrl}\n`;
            fs.writeFileSync(urlPath, urlContent, 'utf8');
          } catch (e) {
            console.warn('Could not write desktop shortcut:', e.message);
          }
        }

        // Check for embedded files inside the page body
        const embeddedMatches = [...body.matchAll(/\/courses\/\d+\/files\/(\d+)/g)];
        const embeddedIds = [...new Set(embeddedMatches.map(m => m[1]))];

        for (const embId of embeddedIds) {
          try {
            const embInfo = await CanvasAPI.getFileDetails(baseUrl, token, embId);
            if (embInfo && embInfo.url) {
              const embName = this.sanitize(embInfo.display_name || `embedded_${embId}`);
              const embDest = path.join(targetDir, embName);
              await CanvasAPI.downloadToFile(embInfo.url, token, embDest, null, abortSignal);
            }
          } catch (embErr) {
            console.warn(`Could not fetch embedded file ${embId}:`, embErr.message);
          }
        }

        const primaryPagePath = (videos && videos.length > 0) ? htmlPath : mdPath;
        this.configStore.recordDownload(item.id, {
          localPath: primaryPagePath,
          size: Buffer.byteLength(fullHtml) + Buffer.byteLength(mdContent),
          title: item.title,
          courseId: course.id,
          moduleId: module.id
        });

        this.notifyRenderer('download:completed', {
          queueId,
          item,
          localPath: primaryPagePath
        });

      } else if (item.type === 'Assignment') {
        const assignmentId = item.contentId;
        const aData = await CanvasAPI.getAssignmentDetails(baseUrl, token, course.id, assignmentId);
        const title = this.sanitize(aData.name || item.title || 'assignment');

        // Create dedicated assignment directory
        const assignmentDir = path.join(targetDir, title);
        fs.mkdirSync(assignmentDir, { recursive: true });

        const rawDesc = aData.description || '';
        const downloadedTemplates = [];
        const urlToLocalMap = new Map();

        // 1. Scan for linked files directly in description (/courses/:id/files/:id)
        const fileMatches = [...rawDesc.matchAll(/\/courses\/\d+\/files\/(\d+)/g)];
        const fileIds = [...new Set(fileMatches.map(m => m[1]))];

        for (const fId of fileIds) {
          try {
            const fInfo = await CanvasAPI.getFileDetails(baseUrl, token, fId);
            if (fInfo && fInfo.url) {
              const fname = this.sanitize(fInfo.display_name || `template_${fId}`);
              const fpath = path.join(assignmentDir, fname);
              await CanvasAPI.downloadToFile(fInfo.url, token, fpath, null, abortSignal);
              downloadedTemplates.push(fname);
              urlToLocalMap.set(`/courses/${course.id}/files/${fId}`, `./${encodeURIComponent(fname)}`);
            }
          } catch (fe) {
            console.warn(`[Assignment] Could not download file ${fId}:`, fe.message);
          }
        }

        // 2. Scan for referenced modules in description (/courses/:id/modules/:id)
        const modMatches = [...rawDesc.matchAll(/\/courses\/\d+\/modules\/(\d+)/g)];
        const modIds = [...new Set(modMatches.map(m => m[1]))];

        for (const mId of modIds) {
          try {
            const modItems = await CanvasAPI.getModuleItems(baseUrl, token, course.id, mId);
            for (const mItem of modItems) {
              if (mItem.type === 'File') {
                try {
                  const mFile = await CanvasAPI.getFileDetails(baseUrl, token, mItem.content_id || mItem.url);
                  if (mFile && mFile.url) {
                    const fname = this.sanitize(mFile.display_name || mItem.title);
                    const fpath = path.join(assignmentDir, fname);
                    if (!fs.existsSync(fpath)) {
                      await CanvasAPI.downloadToFile(mFile.url, token, fpath, null, abortSignal);
                      downloadedTemplates.push(fname);
                    }
                    urlToLocalMap.set(`/courses/${course.id}/modules/${mId}`, `./${encodeURIComponent(fname)}`);
                  }
                } catch (mfe) {
                  console.warn(`[Assignment] Could not fetch module file:`, mfe.message);
                }
              } else if (mItem.type === 'Page') {
                try {
                  const pUrl = mItem.page_url || (mItem.url ? mItem.url.split('/').pop() : null);
                  if (pUrl) {
                    const pData = await CanvasAPI.getPageDetails(baseUrl, token, course.id, pUrl);
                    const pBody = pData.body || '';
                    const pFileMatches = [...pBody.matchAll(/\/courses\/\d+\/files\/(\d+)/g)];
                    for (const pm of pFileMatches) {
                      const pFid = pm[1];
                      try {
                        const pfInfo = await CanvasAPI.getFileDetails(baseUrl, token, pFid);
                        if (pfInfo && pfInfo.url) {
                          const pfName = this.sanitize(pfInfo.display_name || `page_file_${pFid}`);
                          const pfPath = path.join(assignmentDir, pfName);
                          if (!fs.existsSync(pfPath)) {
                            await CanvasAPI.downloadToFile(pfInfo.url, token, pfPath, null, abortSignal);
                            downloadedTemplates.push(pfName);
                          }
                          urlToLocalMap.set(`/courses/${course.id}/modules/${mId}`, `./${encodeURIComponent(pfName)}`);
                        }
                      } catch (_) {}
                    }
                  }
                } catch (_) {}
              }
            }
          } catch (me) {
            console.warn(`[Assignment] Could not fetch referenced module ${mId}:`, me.message);
          }
        }

        // 3. Scan for direct attachments on the assignment object
        if (Array.isArray(aData.attachments)) {
          for (const att of aData.attachments) {
            try {
              if (att.url) {
                const fname = this.sanitize(att.display_name || att.filename || 'attachment');
                const fpath = path.join(assignmentDir, fname);
                if (!fs.existsSync(fpath)) {
                  await CanvasAPI.downloadToFile(att.url, token, fpath, null, abortSignal);
                  downloadedTemplates.push(fname);
                }
              }
            } catch (_) {}
          }
        }

        // 4. Convert description to markdown and rewrite links to point to local files
        let mdDesc = this.htmlToMarkdown(rawDesc);
        for (const [onlineUrl, localRel] of urlToLocalMap.entries()) {
          mdDesc = mdDesc.split(onlineUrl).join(localRel);
        }

        const dueAt = aData.due_at ? new Date(aData.due_at).toLocaleString() : 'None';
        const points = aData.points_possible || 'Unspecified';
        const subTypes = (aData.submission_types || []).join(', ') || 'online';

        // 5. Construct Markdown with offline files list and complete rubric
        const mdLines = [
          `# ${aData.name}`,
          ``,
          `- **Due Date:** ${dueAt}`,
          `- **Points / Weight:** ${points}`,
          `- **Submission Types:** ${subTypes}`,
          `- **Folder Location:** \`./${title}\``,
          ``,
          `## Instructions & Requirements`,
          ``,
          mdDesc,
          ``
        ];

        if (downloadedTemplates.length > 0) {
          mdLines.push(`## Downloaded Templates & Guidelines (Offline Access)`);
          mdLines.push(``);
          for (const dt of [...new Set(downloadedTemplates)]) {
            mdLines.push(`- 📄 **[${dt}](./${encodeURIComponent(dt)})**`);
          }
          mdLines.push(``);
        }

        // 6. Rubric Table
        if (Array.isArray(aData.rubric) && aData.rubric.length > 0) {
          mdLines.push(`## Assessment Criteria & Marking Rubric`);
          mdLines.push(``);
          mdLines.push(`| Criterion | Points | Description |`);
          mdLines.push(`| :--- | :--- | :--- |`);
          for (const crit of aData.rubric) {
            const cDesc = (crit.description || '').replace(/\|/g, '-');
            const cPts = crit.points !== undefined ? `${crit.points} pts` : '';
            const cLong = (crit.long_description || '').replace(/\|/g, '-');
            mdLines.push(`| **${cDesc}** | **${cPts}** | ${cLong} |`);
          }
          mdLines.push(``);
        }

        const fullContent = mdLines.join('\n');
        
        // Save inside the dedicated folder
        const folderReadme = path.join(assignmentDir, 'README.md');
        fs.writeFileSync(folderReadme, fullContent, 'utf8');

        // Also save at root of targetDir with links pointing into the folder
        const mdPath = path.join(targetDir, `${title}.md`);
        let rootContent = fullContent;
        // Adjust relative links for the root file
        for (const dt of downloadedTemplates) {
          rootContent = rootContent.split(`./${encodeURIComponent(dt)}`).join(`./${encodeURIComponent(title)}/${encodeURIComponent(dt)}`);
        }
        fs.writeFileSync(mdPath, rootContent, 'utf8');

        this.configStore.recordDownload(item.id, {
          localPath: mdPath,
          size: Buffer.byteLength(fullContent),
          title: item.title,
          courseId: course.id,
          moduleId: module.id
        });

        this.notifyRenderer('download:completed', {
          queueId,
          item,
          localPath: mdPath
        });

      } else if (item.type === 'ExternalUrl' || item.type === 'ExternalTool') {
        const rawUrl = item.externalUrl || item.url || '';
        const title = this.sanitize(item.title || 'link');

        const videoInfo = this.resolveVideoFromUrl(rawUrl, baseUrl, course.id, item);
        let targetUrl = rawUrl;
        if (videoInfo) {
          if (videoInfo.type === 'panopto') {
            targetUrl = item.htmlUrl || videoInfo.canvasLaunchUrl || videoInfo.viewerUrl;
          } else {
            targetUrl = videoInfo.viewerUrl;
          }
        }

        let downloadedVideoPath = null;
        let downloadedVideoSize = 0;

        // Try downloading real Panopto MP4 video if it is a Panopto recording!
        if (videoInfo && videoInfo.type === 'panopto') {
          const host = videoInfo.host;
          const deliveryId = videoInfo.deliveryId;

          if (item.cookies) {
            this.configStore.setPanoptoCookies(item.cookies, host);
          }

          const media = await this.panoptoDownloader.resolveMedia(host, deliveryId);

          if (media && media.url) {
            const mp4Path = path.join(targetDir, `${title}.mp4`);
            const dlResult = await this.panoptoDownloader.downloadToFile(
              media.url,
              media.cookies,
              mp4Path,
              (progress) => {
                this.notifyRenderer('download:progress', {
                  queueId,
                  item,
                  percent: progress.percent,
                  transferred: progress.transferred,
                  total: progress.total
                });
              },
              abortSignal
            );

            if (dlResult && dlResult.size > 0) {
              downloadedVideoPath = dlResult.destPath;
              downloadedVideoSize = dlResult.size;
            }
          }
        }

        // Always also generate native shortcuts and launch helpers
        // 1. macOS native shortcut (.webloc)
        const weblocPath = path.join(targetDir, `${title}.webloc`);
        const weblocContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>URL</key>
  <string>${this.escapeXml(targetUrl)}</string>
</dict>
</plist>`;
        fs.writeFileSync(weblocPath, weblocContent, 'utf8');

        // 2. Windows shortcut (.url)
        const urlPath = path.join(targetDir, `${title}.url`);
        const urlContent = `[InternetShortcut]\nURL=${targetUrl}\n`;
        fs.writeFileSync(urlPath, urlContent, 'utf8');

        // 3. HTML Launch & Redirect Page (.html)
        const htmlPath = path.join(targetDir, `${title}.html`);
        const htmlContent = this.buildLinkHtml(title, targetUrl, item, videoInfo);
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');

        // 4. Markdown Note (.md)
        const mdPath = path.join(targetDir, `${title}.md`);
        const mdContent = this.buildLinkMarkdown(title, targetUrl, item, videoInfo);
        fs.writeFileSync(mdPath, mdContent, 'utf8');

        const primaryPath = downloadedVideoPath || (process.platform === 'darwin' ? weblocPath : urlPath);
        const recordedSize = downloadedVideoSize || (Buffer.byteLength(urlContent) + Buffer.byteLength(htmlContent));

        this.configStore.recordDownload(item.id, {
          localPath: primaryPath,
          size: recordedSize,
          title: item.title,
          courseId: course.id,
          moduleId: module.id
        });

        this.notifyRenderer('download:completed', {
          queueId,
          item,
          localPath: primaryPath
        });
      }
    } catch (err) {
      console.error(`Download failed for ${item.title}:`, err);
      this.notifyRenderer('download:error', {
        queueId,
        item,
        error: err.message
      });
    }
  }

  cancelDownload(queueId) {
    const active = this.activeDownloads.get(queueId);
    if (active) {
      active.abortController.abort();
      this.activeDownloads.delete(queueId);
      this.notifyRenderer('download:cancelled', { queueId });
      return true;
    }
    // Remove from queue if not started
    const index = this.queue.findIndex(q => q.queueId === queueId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.notifyRenderer('download:cancelled', { queueId });
      return true;
    }
    return false;
  }

  openPath(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
      return true;
    }
    return false;
  }

  showInFolder(filePath) {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  }
}

module.exports = DownloadManager;
