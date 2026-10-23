const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

class CanvasAPI {
  static cleanBaseUrl(url) {
    if (!url) return '';
    let clean = url.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    return clean;
  }

  static getHeaders(token) {
    return {
      'Authorization': `Bearer ${token.trim()}`,
      'User-Agent': 'Modula-LMS-Client/1.0 (Desktop; Electron)',
      'Accept': 'application/json'
    };
  }

  static async request(fullUrl, token, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(fullUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const reqOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: options.method || 'GET',
          headers: {
            ...this.getHeaders(token),
            ...(options.headers || {})
          },
          timeout: 25000
        };

        const req = protocol.request(reqOptions, (res) => {
          // Handle 3xx redirects
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, fullUrl).toString();
            }
            return resolve(this.request(redirectUrl, token, options));
          }

          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(data);
                resolve({
                  data: parsed,
                  headers: res.headers,
                  statusCode: res.statusCode
                });
              } catch (e) {
                resolve({
                  data: data,
                  headers: res.headers,
                  statusCode: res.statusCode
                });
              }
            } else {
              let errorMsg = `HTTP ${res.statusCode}: ${res.statusMessage}`;
              try {
                const errObj = JSON.parse(data);
                if (errObj.errors && Array.isArray(errObj.errors)) {
                  errorMsg = errObj.errors.map(e => e.message).join(', ');
                } else if (errObj.message) {
                  errorMsg = errObj.message;
                }
              } catch (_) {}
              const err = new Error(errorMsg);
              err.statusCode = res.statusCode;
              reject(err);
            }
          });
        });

        req.on('error', (err) => {
          reject(new Error(`Network error: ${err.message}`));
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timed out after 25s'));
        });

        if (options.body) {
          req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }

        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  static async getPaginated(baseUrl, endpoint, token, params = {}) {
    const cleanUrl = this.cleanBaseUrl(baseUrl);
    let url = new URL(`${cleanUrl}/api/v1/${endpoint.replace(/^\/+/, '')}`);
    
    // Add params
    Object.keys(params).forEach(key => {
      if (Array.isArray(params[key])) {
        params[key].forEach(v => url.searchParams.append(`${key}[]`, v));
      } else {
        url.searchParams.set(key, params[key]);
      }
    });

    if (!url.searchParams.has('per_page')) {
      url.searchParams.set('per_page', '100');
    }

    const allItems = [];
    let nextUrl = url.toString();

    while (nextUrl) {
      const response = await this.request(nextUrl, token);
      if (Array.isArray(response.data)) {
        allItems.push(...response.data);
      } else {
        return response.data;
      }

      // Check Link header for rel="next"
      const linkHeader = response.headers['link'] || '';
      nextUrl = null;
      const links = linkHeader.split(',');
      for (const link of links) {
        const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
        if (match && match[2] === 'next') {
          nextUrl = match[1];
          break;
        }
      }
    }

    return allItems;
  }

  static async testConnection(baseUrl, token) {
    const cleanUrl = this.cleanBaseUrl(baseUrl);
    const res = await this.request(`${cleanUrl}/api/v1/users/self`, token);
    return res.data;
  }

  static async getCourses(baseUrl, token) {
    const courses = await this.getPaginated(baseUrl, 'courses', token, {
      'include': ['term', 'total_students', 'course_image'],
      'state': ['available']
    });

    // Filter courses that user actually has access to or have a valid name
    return courses
      .filter(c => c && c.name && !c.access_restricted_by_date)
      .map(c => ({
        id: c.id,
        name: c.name,
        courseCode: c.course_code || '',
        term: c.term ? c.term.name : '',
        imageUrl: c.image_download_url || null,
        enrollmentType: c.enrollments && c.enrollments[0] ? c.enrollments[0].type : 'student'
      }));
  }

  static parsePageIntoItems(html, baseUrl, courseId) {
    if (!html) return [];
    const items = [];
    const seenItemKeys = new Set();
    const tableUrls = new Set();

    function cleanText(t) {
      return (t || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function resolveItem(href, text, indent = 0, sourceIndex = 0) {
      if (!href) return null;
      let rawHref = href.replace(/&amp;/g, '&');
      let fullUrl = rawHref;
      if (!fullUrl.startsWith('http')) {
        const cleanBase = (baseUrl || '').replace(/\/+$/, '');
        fullUrl = cleanBase + (rawHref.startsWith('/') ? '' : '/') + rawHref;
      }

      const fileMatch = fullUrl.match(/\/courses\/\d+\/files\/(\d+)/i) || fullUrl.match(/\/files\/(\d+)/i);
      const isDoc = !!fullUrl.match(/\.(pdf|pptx?|docx?|xlsx?|zip|rar|py|c|cpp|java|ipynb|mat)(\?|$)/i);
      const isPanopto = fullUrl.includes('panopto') || fullUrl.includes('external_tools/retrieve');
      const isVideo = isPanopto || fullUrl.includes('youtube.com') || fullUrl.includes('youtu.be') || fullUrl.includes('vimeo.com');

      if (!fileMatch && !isDoc && !isVideo) {
        return null;
      }

      const title = text || (fullUrl.split('/').pop().split('?')[0]) || 'Document';
      // Deduplicate by URL + Title (so separate lectures sharing the same recording URL are both preserved)
      const dedupKey = `${fullUrl}:::${title.toLowerCase()}`;
      if (seenItemKeys.has(dedupKey)) {
        return null;
      }
      seenItemKeys.add(dedupKey);

      const uniqueHash = crypto.createHash('md5').update(`${fullUrl}_${title}_${sourceIndex}`).digest('hex').substring(0, 16);

      if (fileMatch || isDoc) {
        const fileId = fileMatch ? fileMatch[1] : uniqueHash;
        return {
          id: `res_file_${fileId}`,
          title: title,
          type: 'File',
          url: fullUrl,
          downloadUrl: fullUrl,
          contentId: fileMatch ? parseInt(fileMatch[1], 10) : null,
          indent: indent,
          htmlUrl: fullUrl
        };
      } else if (isVideo) {
        return {
          id: `res_vid_${uniqueHash}`,
          title: title,
          type: 'ExternalUrl',
          url: fullUrl,
          externalUrl: fullUrl,
          indent: indent,
          htmlUrl: fullUrl
        };
      }
      return null;
    }

    // 1. Check Table Rows
    const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)];
    let globalItemIdx = 0;
    if (rows.length > 1) {
      rows.forEach((r, idx) => {
        const cells = [...r[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)];
        if (cells.length >= 2) {
          const topic = cleanText(cells[0][1]);
          const contentCell = cells[1][1];
          const links = [...contentCell.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)];
          const rowItems = [];
          for (const l of links) {
            globalItemIdx++;
            const it = resolveItem(l[1], cleanText(l[2]), 1, globalItemIdx);
            if (it) {
              rowItems.push(it);
              tableUrls.add(it.url);
            }
          }
          if (rowItems.length > 0) {
            if (topic) {
              items.push({
                id: `res_sub_${idx}`,
                title: topic,
                type: 'SubHeader',
                indent: 0
              });
            }
            items.push(...rowItems);
          }
        }
      });
    }

    // 2. Extra links in page body (outside table)
    const allLinks = [...html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)];
    for (const l of allLinks) {
      const href = l[1];
      if (tableUrls.has(href)) continue;
      globalItemIdx++;
      const it = resolveItem(href, cleanText(l[2]), 0, globalItemIdx);
      if (it) items.push(it);
    }

    return items;
  }

  static async getCourseHomeResources(baseUrl, token, courseId) {
    const cleanUrl = this.cleanBaseUrl(baseUrl);
    const resourceModules = [];

    try {
      // 1. Fetch Front Page of course
      const fpRes = await this.request(`${cleanUrl}/api/v1/courses/${courseId}/front_page`, token).catch(() => null);
      if (!fpRes || !fpRes.data || !fpRes.data.body) {
        return [];
      }

      const fpData = fpRes.data;
      const fpBody = fpData.body || '';

      // Find all internal page links in front page (e.g. "Module Resources" button)
      const pageLinkRegex = new RegExp(`(?:courses\/${courseId}\/pages\/|${cleanUrl}\/courses\/${courseId}\/pages\/)([^"'\\s?#]+)`, 'gi');
      const linkedPages = new Map();

      const linkMatches = [...fpBody.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)];
      for (const m of linkMatches) {
        const href = m[1];
        const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
        const slugMatch = href.match(pageLinkRegex);
        if (slugMatch) {
          const parts = href.split('/pages/');
          if (parts[1]) {
            const slug = parts[1].split(/[?#]/)[0];
            if (slug && slug !== fpData.url && !linkedPages.has(slug)) {
              linkedPages.set(slug, text);
            }
          }
        }
      }

      // Check linked pages (e.g. "Module Resources")
      for (const [slug, linkText] of linkedPages.entries()) {
        try {
          const page = await this.getPageDetails(baseUrl, token, courseId, slug);
          if (page && page.body) {
            const items = this.parsePageIntoItems(page.body, baseUrl, courseId);
            if (items.length > 0) {
              const moduleName = linkText || page.title || 'Module Resources';
              resourceModules.push({
                id: `res_page_${slug}`,
                name: moduleName,
                position: 0,
                itemsCount: items.length,
                state: 'active',
                isResourceModule: true,
                pageUrl: slug,
                items: items
              });
            }
          }
        } catch (pageErr) {
          console.warn(`Could not load resource page ${slug}:`, pageErr.message);
        }
      }

      // Also check Front Page itself for direct learning items
      const fpItems = this.parsePageIntoItems(fpBody, baseUrl, courseId);
      if (fpItems.length > 0) {
        resourceModules.push({
          id: `res_page_${fpData.url || 'front_page'}`,
          name: fpData.title || 'Course Home Resources',
          position: 0,
          itemsCount: fpItems.length,
          state: 'active',
          isResourceModule: true,
          pageUrl: fpData.url,
          items: fpItems
        });
      }

    } catch (err) {
      console.warn('Error fetching course home resources:', err.message);
    }

    return resourceModules;
  }

  static async getModules(baseUrl, token, courseId) {
    let nativeModules = [];
    try {
      const modules = await this.getPaginated(baseUrl, `courses/${courseId}/modules`, token, {
        'include': ['items', 'content_details']
      });

      nativeModules = modules.map(m => ({
        id: m.id,
        name: m.name,
        position: m.position,
        itemsCount: m.items_count || (m.items ? m.items.length : 0),
        state: m.state,
        items: (m.items || []).map(item => ({
          id: item.id,
          title: item.title,
          type: item.type, // 'File', 'Page', 'Assignment', 'Quiz', 'SubHeader', 'ExternalUrl', 'ExternalTool'
          position: item.position,
          indent: item.indent,
          url: item.url,
          contentId: item.content_id,
          pageUrl: item.page_url,
          externalUrl: item.external_url,
          htmlUrl: item.html_url,
          contentDetails: item.content_details || null
        }))
      }));
    } catch (err) {
      console.warn(`Could not fetch native modules for course ${courseId}:`, err.message);
    }

    // Discover Front Page & Resource Pages (e.g. "Module Resources")
    const resourceModules = await this.getCourseHomeResources(baseUrl, token, courseId);

    // Combine: Resource Modules first (at the top), then native modules
    const allModules = [...resourceModules, ...nativeModules];

    // Re-index positions
    allModules.forEach((m, idx) => {
      m.position = idx + 1;
    });

    return allModules;
  }

  static async getModuleItems(baseUrl, token, courseId, moduleId) {
    return await this.getPaginated(baseUrl, `courses/${courseId}/modules/${moduleId}/items`, token);
  }

  static async getFileDetails(baseUrl, token, fileIdOrUrl) {
    let url = fileIdOrUrl;
    if (!url.startsWith('http')) {
      const cleanUrl = this.cleanBaseUrl(baseUrl);
      url = `${cleanUrl}/api/v1/files/${fileIdOrUrl}`;
    }
    const res = await this.request(url, token);
    return res.data;
  }

  static async getPageDetails(baseUrl, token, courseId, pageUrl) {
    const cleanUrl = this.cleanBaseUrl(baseUrl);
    const res = await this.request(`${cleanUrl}/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`, token);
    return res.data;
  }

  static async getAssignmentDetails(baseUrl, token, courseId, assignmentId) {
    const cleanUrl = this.cleanBaseUrl(baseUrl);
    const res = await this.request(`${cleanUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}`, token);
    return res.data;
  }

  static downloadToFile(fileUrl, token, destPath, onProgress, abortSignal) {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(fileUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        // Ensure target directory exists
        fs.mkdirSync(path.dirname(destPath), { recursive: true });

        const reqOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'GET',
          headers: {
            // Note: If redirecting to S3 or AWS storage, Authorization header can sometimes conflict with signed URLs.
            // Canvas token is provided for Canvas endpoints; for S3 signed URLs, no Bearer header is needed.
            ...(parsedUrl.hostname.includes('instructure') || parsedUrl.hostname.includes('canvas')
              ? this.getHeaders(token)
              : { 'User-Agent': 'Modula-LMS-Client/1.0' })
          }
        };

        const req = protocol.request(reqOptions, (res) => {
          // Handle Redirects
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (!redirectUrl.startsWith('http')) {
              redirectUrl = new URL(redirectUrl, fileUrl).toString();
            }
            return resolve(this.downloadToFile(redirectUrl, token, destPath, onProgress, abortSignal));
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to download: HTTP ${res.statusCode} ${res.statusMessage}`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          let lastReport = Date.now();

          const fileStream = fs.createWriteStream(destPath);

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            const now = Date.now();
            if (onProgress && (now - lastReport > 200 || downloadedBytes === totalBytes)) {
              lastReport = now;
              const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
              onProgress({
                downloaded: downloadedBytes,
                total: totalBytes,
                percent: percent
              });
            }
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              resolve({
                path: destPath,
                size: downloadedBytes
              });
            });
          });

          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        });

        if (abortSignal) {
          abortSignal.addEventListener('abort', () => {
            req.destroy();
            fs.unlink(destPath, () => {});
            reject(new Error('Download cancelled'));
          });
        }

        req.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });

        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = CanvasAPI;
