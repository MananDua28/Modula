const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const CanvasAPI = require('./canvas-api');

class DownloadManager {
  constructor(configStore, mainWindow) {
    this.configStore = configStore;
    this.mainWindow = mainWindow;
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

  htmlToMarkdown(html) {
    if (!html) return '';
    let md = html;
    
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
        let fileApiUrl = item.url;
        let fileDetails = null;

        if (fileApiUrl) {
          fileDetails = await CanvasAPI.getFileDetails(baseUrl, token, fileApiUrl);
        } else if (item.contentId) {
          fileDetails = await CanvasAPI.getFileDetails(baseUrl, token, item.contentId);
        }

        if (!fileDetails || !fileDetails.url) {
          throw new Error('Unable to resolve file download URL from Canvas');
        }

        const fileName = this.sanitize(fileDetails.display_name || item.title || 'file');
        const destPath = path.join(targetDir, fileName);

        await CanvasAPI.downloadToFile(
          fileDetails.url,
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

        this.configStore.recordDownload(item.id, {
          localPath: destPath,
          size: fileDetails.size || 0,
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

        // Save as Markdown
        const mdPath = path.join(targetDir, `${title}.md`);
        const mdContent = `# ${pageData.title || title}\n\nCanvas URL: ${pageData.html_url || ''}\n\n${this.htmlToMarkdown(body)}`;
        fs.writeFileSync(mdPath, mdContent, 'utf8');

        // Save as HTML
        const htmlPath = path.join(targetDir, `${title}.html`);
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pageData.title || title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; max-width: 860px; margin: 40px auto; padding: 0 20px; color: #111; }
    img { max-width: 100%; height: auto; border-radius: 6px; }
    pre { background: #f4f4f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
    a { color: #E13F2B; }
  </style>
</head>
<body>
  <h1>${pageData.title || title}</h1>
  <hr/>
  ${body}
</body>
</html>`;
        fs.writeFileSync(htmlPath, fullHtml, 'utf8');

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

        this.configStore.recordDownload(item.id, {
          localPath: mdPath,
          size: Buffer.byteLength(mdContent),
          title: item.title,
          courseId: course.id,
          moduleId: module.id
        });

        this.notifyRenderer('download:completed', {
          queueId,
          item,
          localPath: mdPath
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
        const url = item.externalUrl || item.url || '';
        const title = this.sanitize(item.title || 'link');
        const linkPath = path.join(targetDir, `${title}.url`);
        const content = `[InternetShortcut]\nURL=${url}\n`;
        fs.writeFileSync(linkPath, content, 'utf8');

        this.configStore.recordDownload(item.id, {
          localPath: linkPath,
          size: Buffer.byteLength(content),
          title: item.title,
          courseId: course.id,
          moduleId: module.id
        });

        this.notifyRenderer('download:completed', {
          queueId,
          item,
          localPath: linkPath
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
