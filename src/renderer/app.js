// Modula Application Controller

document.addEventListener('DOMContentLoaded', async () => {
  // Application State
  const state = {
    config: {},
    courses: [],
    selectedCourse: null,
    modules: [],
    downloadHistory: {},
    activeDownloads: new Map(), // queueId -> { task, percent, downloaded, total }
    newItems: new Set(),
    newModules: new Set(),
    filterQuery: '',
    courseQuery: ''
  };

  // DOM Elements
  const elements = {
    // Theme
    btnThemeToggle: document.getElementById('btnThemeToggle'),

    // Sidebar
    coursesList: document.getElementById('coursesList'),
    courseSearchInput: document.getElementById('courseSearchInput'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    userStatus: document.getElementById('userStatus'),

    // Top Bar
    currentCourseTitle: document.getElementById('currentCourseTitle'),
    currentCourseCode: document.getElementById('currentCourseCode'),
    btnDownloadCourse: document.getElementById('btnDownloadCourse'),
    syncStatusPill: document.getElementById('syncStatusPill'),
    syncStatusText: document.getElementById('syncStatusText'),
    btnTriggerSync: document.getElementById('btnTriggerSync'),

    // Toolbar
    moduleFilterInput: document.getElementById('moduleFilterInput'),
    courseStats: document.getElementById('courseStats'),
    btnExpandAll: document.getElementById('btnExpandAll'),
    btnCollapseAll: document.getElementById('btnCollapseAll'),

    // Modules
    modulesContainer: document.getElementById('modulesContainer'),
    btnEmptySetup: document.getElementById('btnEmptySetup'),

    // Downloads Drawer
    downloadsDrawer: document.getElementById('downloadsDrawer'),
    drawerSummaryText: document.getElementById('drawerSummaryText'),
    drawerHeaderToggle: document.getElementById('drawerHeaderToggle'),
    drawerQueueList: document.getElementById('drawerQueueList'),
    btnOpenDownloadsFolder: document.getElementById('btnOpenDownloadsFolder'),
    btnToggleDrawer: document.getElementById('btnToggleDrawer'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    btnSettingsOpen: document.getElementById('btnSettingsOpen'),
    btnSettingsClose: document.getElementById('btnSettingsClose'),
    settingBaseUrl: document.getElementById('settingBaseUrl'),
    settingToken: document.getElementById('settingToken'),
    btnToggleTokenVisibility: document.getElementById('btnToggleTokenVisibility'),
    settingDownloadPath: document.getElementById('settingDownloadPath'),
    btnChooseFolder: document.getElementById('btnChooseFolder'),
    settingAutoSync: document.getElementById('settingAutoSync'),
    settingSyncInterval: document.getElementById('settingSyncInterval'),
    settingAutoDownloadNew: document.getElementById('settingAutoDownloadNew'),
    linkTokenHelp: document.getElementById('linkTokenHelp'),
    tokenHelpBox: document.getElementById('tokenHelpBox'),
    settingsAlert: document.getElementById('settingsAlert'),
    btnTestConnection: document.getElementById('btnTestConnection'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),

    // App Updates
    updateBanner: document.getElementById('updateBanner'),
    updateBannerText: document.getElementById('updateBannerText'),
    btnBannerDownload: document.getElementById('btnBannerDownload'),
    btnBannerDismiss: document.getElementById('btnBannerDismiss'),
    appVersionDisplay: document.getElementById('appVersionDisplay'),
    btnCheckUpdates: document.getElementById('btnCheckUpdates'),
    btnCheckUpdatesText: document.getElementById('btnCheckUpdatesText'),
    updateNoticeBox: document.getElementById('updateNoticeBox'),

    // Student Onboarding & Verification
    onboardingModal: document.getElementById('onboardingModal'),
    onboardingStepEmail: document.getElementById('onboardingStepEmail'),
    onboardingStepOtp: document.getElementById('onboardingStepOtp'),
    onboardingEmailInput: document.getElementById('onboardingEmailInput'),
    btnSendOtp: document.getElementById('btnSendOtp'),
    btnSendOtpText: document.getElementById('btnSendOtpText'),
    onboardingSentEmail: document.getElementById('onboardingSentEmail'),
    onboardingOtpInput: document.getElementById('onboardingOtpInput'),
    btnVerifyOtp: document.getElementById('btnVerifyOtp'),
    btnVerifyOtpText: document.getElementById('btnVerifyOtpText'),
    btnResendOtp: document.getElementById('btnResendOtp'),
    btnChangeEmail: document.getElementById('btnChangeEmail'),
    btnMicrosoftLogin: document.getElementById('btnMicrosoftLogin'),
    btnMicrosoftLoginText: document.getElementById('btnMicrosoftLoginText'),
    onboardingAlert: document.getElementById('onboardingAlert'),
    settingStudentEmailDisplay: document.getElementById('settingStudentEmailDisplay'),
    settingVerifiedBadge: document.getElementById('settingVerifiedBadge'),

    // Toast
    toast: document.getElementById('toast')
  };

  // Initialize App
  async function init() {
    setupEventListeners();
    setupOnboardingListeners();
    await loadConfig();
    await refreshDownloadHistory();
    const isAuthed = await checkAuthAndOnboard();
    if (isAuthed) {
      await connectAndLoadCourses();
    }
    await initAppVersion();
  }

  // Configuration & Theme
  async function loadConfig() {
    state.config = await window.modula.getConfig();
    applyTheme(state.config.theme || 'dark');
    updateSettingsModalFields();
  }

  function applyTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
    state.config.theme = theme;
  }

  function toggleTheme() {
    const nextTheme = state.config.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    window.modula.saveConfig({ theme: nextTheme });
  }

  // Toast Notification
  function showToast(message, duration = 3000) {
    elements.toast.textContent = message;
    elements.toast.classList.remove('hidden');
    setTimeout(() => {
      elements.toast.classList.add('hidden');
    }, duration);
  }

  // App Updates
  let latestUpdateInfo = null;

  async function initAppVersion() {
    try {
      const version = await window.modula.getAppVersion();
      if (elements.appVersionDisplay) {
        elements.appVersionDisplay.textContent = `Modula v${version}`;
      }
    } catch (err) {
      console.warn('Failed to retrieve app version:', err);
    }
  }

  function handleUpdateAvailable(updateInfo) {
    latestUpdateInfo = updateInfo;
    if (elements.updateBanner && elements.updateBannerText) {
      elements.updateBannerText.textContent = `Modula v${updateInfo.latestVersion} is available with new updates!`;
      elements.updateBanner.classList.remove('hidden');
    }
    if (elements.updateNoticeBox) {
      elements.updateNoticeBox.className = 'update-notice-box has-update';
      elements.updateNoticeBox.innerHTML = `
        <span>New release <strong>v${escapeHtml(updateInfo.latestVersion)}</strong> is available!</span>
        <button class="btn btn-primary btn-sm btn-update-action" type="button">Download Update</button>
      `;
      const btnAction = elements.updateNoticeBox.querySelector('.btn-update-action');
      if (btnAction) {
        btnAction.addEventListener('click', () => downloadAppUpdate(updateInfo));
      }
      elements.updateNoticeBox.classList.remove('hidden');
    }
  }

  async function downloadAppUpdate(updateInfo) {
    if (!updateInfo || !updateInfo.downloadUrl) return;
    showToast('Opening download link...');
    await window.modula.openExternal(updateInfo.downloadUrl);
  }

  async function triggerManualUpdateCheck() {
    if (!elements.btnCheckUpdates) return;
    elements.btnCheckUpdates.disabled = true;
    const originalText = elements.btnCheckUpdatesText.textContent;
    elements.btnCheckUpdatesText.innerHTML = '<span class="spinner" style="width:11px;height:11px;"></span> Checking...';

    if (elements.updateNoticeBox) {
      elements.updateNoticeBox.classList.add('hidden');
    }

    try {
      const result = await window.modula.checkForUpdates();
      if (result.updateAvailable) {
        handleUpdateAvailable(result);
        showToast(`Update available: Modula v${result.latestVersion}`);
      } else if (result.error) {
        if (elements.updateNoticeBox) {
          elements.updateNoticeBox.className = 'update-notice-box check-error';
          elements.updateNoticeBox.textContent = `Update check failed: ${result.error}`;
          elements.updateNoticeBox.classList.remove('hidden');
        }
      } else {
        if (elements.updateNoticeBox) {
          elements.updateNoticeBox.className = 'update-notice-box up-to-date';
          elements.updateNoticeBox.textContent = `✓ Modula is up to date (v${result.currentVersion}).`;
          elements.updateNoticeBox.classList.remove('hidden');
        }
        showToast('Modula is already up to date!');
      }
    } catch (err) {
      console.warn('Update check failed:', err);
    } finally {
      elements.btnCheckUpdates.disabled = false;
      elements.btnCheckUpdatesText.textContent = originalText;
    }
  }

  // Download History
  async function refreshDownloadHistory() {
    state.downloadHistory = await window.modula.getDownloadHistory();
  }

  // Canvas Courses & Modules
  async function connectAndLoadCourses() {
    const authStatus = await window.modula.getAuthStatus();
    if (!authStatus.isVerified) {
      checkAuthAndOnboard();
      return;
    }

    if (!state.config.baseUrl || !state.config.token) {
      elements.userName.textContent = 'Setup Required';
      elements.userStatus.textContent = 'Click to configure';
      elements.userAvatar.textContent = '?';
      openSettingsModal();
      return;
    }

    try {
      elements.userName.textContent = 'Connecting...';
      elements.userStatus.textContent = 'Verifying Canvas token...';

      // Test auth
      const user = await window.modula.testConnection(state.config.baseUrl, state.config.token);
      elements.userName.textContent = user.name || 'Student';
      elements.userStatus.textContent = 'Connected';
      elements.userAvatar.textContent = (user.name || 'S').charAt(0).toUpperCase();

      // Fetch Courses
      elements.coursesList.innerHTML = '<div class="sidebar-loading"><span class="spinner"></span> Loading courses...</div>';
      const courses = await window.modula.getCourses();
      state.courses = courses;

      renderCoursesList();

      if (courses.length > 0) {
        selectCourse(courses[0]);
      } else {
        elements.modulesContainer.innerHTML = `
          <div class="empty-state">
            <h3>No active courses found</h3>
            <p>Your Canvas account does not currently have any published courses available.</p>
          </div>
        `;
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
      elements.userName.textContent = 'Connection Error';
      elements.userStatus.textContent = 'Check API token';
      elements.userAvatar.textContent = '!';
      elements.coursesList.innerHTML = `
        <div class="sidebar-loading" style="color: var(--color-canvas-red);">
          Failed to load courses. Please verify your Canvas URL and Token in Settings.
        </div>
      `;
    }
  }

  function renderCoursesList() {
    const query = state.courseQuery.toLowerCase().trim();
    const filtered = state.courses.filter(c =>
      c.name.toLowerCase().includes(query) || (c.courseCode && c.courseCode.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
      elements.coursesList.innerHTML = '<div class="sidebar-loading">No courses match filter</div>';
      return;
    }

    elements.coursesList.innerHTML = '';
    filtered.forEach(course => {
      const item = document.createElement('div');
      item.className = `course-item ${state.selectedCourse && state.selectedCourse.id === course.id ? 'active' : ''}`;
      item.innerHTML = `
        ${course.courseCode ? `<span class="course-item-code">${escapeHtml(course.courseCode)}</span>` : ''}
        <span class="course-item-title" title="${escapeHtml(course.name)}">${escapeHtml(course.name)}</span>
      `;
      item.addEventListener('click', () => selectCourse(course));
      elements.coursesList.appendChild(item);
    });
  }

  async function selectCourse(course) {
    state.selectedCourse = course;
    renderCoursesList();

    elements.currentCourseTitle.textContent = course.name;
    elements.currentCourseCode.textContent = course.courseCode || '';
    elements.btnDownloadCourse.disabled = true;

    elements.modulesContainer.innerHTML = `
      <div class="empty-state">
        <span class="spinner" style="width: 24px; height: 24px; margin-bottom: 12px;"></span>
        <h3>Loading modules for ${escapeHtml(course.name)}...</h3>
      </div>
    `;

    try {
      const modules = await window.modula.getModules(course.id);
      state.modules = modules;
      elements.btnDownloadCourse.disabled = modules.length === 0;
      renderModules();
    } catch (err) {
      console.error('Failed to load modules:', err);
      elements.modulesContainer.innerHTML = `
        <div class="empty-state">
          <h3 style="color: var(--color-canvas-red);">Unable to load modules</h3>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  function renderModules() {
    const query = state.filterQuery.toLowerCase().trim();
    let totalItems = 0;

    elements.modulesContainer.innerHTML = '';

    if (state.modules.length === 0) {
      elements.modulesContainer.innerHTML = `
        <div class="empty-state">
          <h3>No modules found in this course</h3>
          <p>The instructor has not added any modules yet.</p>
        </div>
      `;
      elements.courseStats.textContent = '0 Modules';
      return;
    }

    state.modules.forEach((module, moduleIdx) => {
      const items = (module.items || []).filter(item => {
        if (!query) return true;
        return item.title.toLowerCase().includes(query);
      });

      if (query && items.length === 0 && !module.name.toLowerCase().includes(query)) {
        return; // Filter out module if neither module name nor items match
      }

      totalItems += (module.items || []).length;
      const isNewModule = state.newModules.has(module.id);
      const isCollapsed = query ? false : (!isNewModule && moduleIdx > 0);
      const moduleCard = createModuleCard(module, items, moduleIdx + 1, isCollapsed);
      elements.modulesContainer.appendChild(moduleCard);
    });

    elements.courseStats.textContent = `${state.modules.length} Modules · ${totalItems} Items`;
  }

  function createModuleCard(module, items, moduleIndex, isCollapsed = false) {
    const card = document.createElement('div');
    card.className = `module-card ${isCollapsed ? 'collapsed' : ''}`;
    card.dataset.moduleId = module.id;

    const isNewModule = state.newModules.has(module.id);
    const downloadableItems = items.filter(it => it.type !== 'SubHeader');
    const downloadedCount = downloadableItems.filter(it => state.downloadHistory[it.id]).length;
    const isFullyDownloaded = downloadableItems.length > 0 && downloadedCount === downloadableItems.length;

    // Header
    const header = document.createElement('div');
    header.className = 'module-header';
    header.innerHTML = `
      <div class="module-info">
        <svg class="module-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <span class="module-title">${escapeHtml(module.name)}</span>
        ${isNewModule ? '<span class="module-badge badge-new">NEW</span>' : ''}
        ${isFullyDownloaded ? '<span class="module-badge badge-done">Downloaded</span>' : `<span class="module-badge">${items.length} items</span>`}
      </div>
      <div class="module-actions">
        <button class="btn btn-secondary btn-sm btn-download-module" title="Download all items in this module">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download Module</span>
        </button>
      </div>
    `;

    // Toggle expand/collapse on header click
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-download-module')) return;
      card.classList.toggle('collapsed');
    });

    // Download module button click
    const btnDownloadMod = header.querySelector('.btn-download-module');
    btnDownloadMod.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnDownloadMod.disabled = true;
      btnDownloadMod.innerHTML = '<span class="spinner"></span> Queuing...';
      await window.modula.downloadModule(state.selectedCourse, module, moduleIndex);
      setTimeout(() => {
        btnDownloadMod.disabled = false;
        btnDownloadMod.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download Module</span>
        `;
      }, 1000);
    });

    // Items list
    const itemsList = document.createElement('div');
    itemsList.className = 'module-items';

    if (items.length === 0) {
      itemsList.innerHTML = '<div class="item-row" style="color: var(--text-subtle);">No items in this module</div>';
    } else {
      items.forEach(item => {
        itemsList.appendChild(createItemRow(module, item, moduleIndex));
      });
    }

    card.appendChild(header);
    card.appendChild(itemsList);
    return card;
  }

  function createItemRow(module, item, moduleIndex) {
    const row = document.createElement('div');
    row.className = `item-row ${item.type === 'SubHeader' ? 'item-subheader' : ''}`;
    row.id = `item-row-${item.id}`;

    if (item.type === 'SubHeader') {
      row.innerHTML = `<span>${escapeHtml(item.title)}</span>`;
      return row;
    }

    const downloadedRecord = state.downloadHistory[item.id];
    const isNew = state.newItems.has(item.id);
    const queueId = `${state.selectedCourse.id}_${module.id}_${item.id}`;
    const activeTask = state.activeDownloads.get(queueId);

    // Format file size
    let sizeStr = '';
    if (downloadedRecord && downloadedRecord.size) {
      sizeStr = formatBytes(downloadedRecord.size);
    } else if (item.contentDetails && item.contentDetails.size) {
      sizeStr = formatBytes(item.contentDetails.size);
    }

    row.innerHTML = `
      <div class="item-left">
        <div class="item-icon">
          ${getItemTypeIcon(item.type, item.title)}
        </div>
        <div class="item-details">
          <span class="item-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>
          <div class="item-meta">
            ${isNew ? '<span class="badge-tag-new">NEW</span>' : ''}
            <span>${item.type}</span>
            ${sizeStr ? `<span>· ${sizeStr}</span>` : ''}
            ${item.contentDetails && item.contentDetails.due_at ? `<span>· Due ${new Date(item.contentDetails.due_at).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="item-actions">
        ${renderItemActionButtons(item, downloadedRecord, activeTask)}
      </div>
    `;

    attachItemEventListeners(row, module, item, moduleIndex, downloadedRecord);
    return row;
  }

  function renderItemActionButtons(item, downloadedRecord, activeTask) {
    if (activeTask) {
      return `
        <div class="item-progress-bar">
          <div class="item-progress-fill" style="width: ${activeTask.percent || 0}%"></div>
        </div>
        <span style="font-size: 11px; color: var(--color-canvas-red); font-weight: 600;">${activeTask.percent || 0}%</span>
      `;
    }

    if (downloadedRecord && downloadedRecord.localPath) {
      return `
        <button class="btn btn-ghost btn-sm btn-open-file" title="Open file">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>Open</span>
        </button>
        <button class="icon-btn-sm btn-show-folder" title="Show in Finder / File Explorer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      `;
    }

    return `
      <button class="btn btn-secondary btn-sm btn-download-single">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        <span>Download</span>
      </button>
    `;
  }

  function attachItemEventListeners(row, module, item, moduleIndex, downloadedRecord) {
    const btnDownload = row.querySelector('.btn-download-single');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => {
        window.modula.downloadItem(state.selectedCourse, module, item, moduleIndex);
      });
    }

    const btnOpen = row.querySelector('.btn-open-file');
    if (btnOpen && downloadedRecord) {
      btnOpen.addEventListener('click', () => {
        window.modula.openPath(downloadedRecord.localPath);
      });
    }

    const btnShowFolder = row.querySelector('.btn-show-folder');
    if (btnShowFolder && downloadedRecord) {
      btnShowFolder.addEventListener('click', () => {
        window.modula.showItemInFolder(downloadedRecord.localPath);
      });
    }
  }

  function updateItemRow(itemId) {
    const row = document.getElementById(`item-row-${itemId}`);
    if (!row) return;

    // Find the item in state
    for (const mod of state.modules) {
      const it = (mod.items || []).find(i => i.id === itemId);
      if (it) {
        const queueId = `${state.selectedCourse.id}_${mod.id}_${it.id}`;
        const activeTask = state.activeDownloads.get(queueId);
        const downloadedRecord = state.downloadHistory[it.id];
        const actionsContainer = row.querySelector('.item-actions');
        if (actionsContainer) {
          actionsContainer.innerHTML = renderItemActionButtons(it, downloadedRecord, activeTask);
          attachItemEventListeners(row, mod, it, mod.position || 1, downloadedRecord);
        }
        break;
      }
    }
  }

  // Active Downloads Drawer
  function updateDownloadsDrawer() {
    const activeCount = state.activeDownloads.size;
    if (activeCount > 0) {
      elements.downloadsDrawer.style.display = 'block';
      elements.drawerSummaryText.textContent = `Downloading ${activeCount} file${activeCount > 1 ? 's' : ''}...`;

      elements.drawerQueueList.innerHTML = '';
      state.activeDownloads.forEach((info, queueId) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'queue-item';
        itemDiv.innerHTML = `
          <span style="font-weight: 500;">${escapeHtml(info.item.title)}</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--color-canvas-red); font-weight: 600;">${info.percent || 0}%</span>
            <button class="icon-btn-sm" title="Cancel" data-queue-id="${queueId}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        `;
        itemDiv.querySelector('button').addEventListener('click', () => {
          window.modula.cancelDownload(queueId);
        });
        elements.drawerQueueList.appendChild(itemDiv);
      });
    } else {
      elements.drawerSummaryText.textContent = 'All downloads completed';
      elements.drawerQueueList.innerHTML = '<div style="font-size: 11.5px; color: var(--text-muted); padding: 8px 0;">No active downloads</div>';
    }
  }

  // Settings Modal Handlers
  function openSettingsModal() {
    updateSettingsModalFields();
    elements.settingsAlert.className = 'alert-box hidden';
    elements.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    elements.settingsModal.classList.add('hidden');
  }

  function updateSettingsModalFields() {
    elements.settingBaseUrl.value = state.config.baseUrl || 'https://canvas.bham.ac.uk';
    elements.settingToken.value = state.config.token || '';
    elements.settingDownloadPath.value = state.config.downloadPath || '';
    elements.settingAutoSync.checked = state.config.autoSync !== false;
    elements.settingSyncInterval.value = String(state.config.syncInterval || 15);
    elements.settingAutoDownloadNew.checked = !!state.config.autoDownloadNew;

    if (elements.settingStudentEmailDisplay) {
      elements.settingStudentEmailDisplay.textContent = state.config.studentEmail || 'Verification Required';
    }
    if (elements.settingVerifiedBadge) {
      if (state.config.isVerified) {
        elements.settingVerifiedBadge.textContent = '✓ Verified Student';
        elements.settingVerifiedBadge.className = 'verified-badge';
      } else {
        elements.settingVerifiedBadge.textContent = 'Unverified';
        elements.settingVerifiedBadge.className = 'verified-badge unverified';
      }
    }
  }

  async function saveSettings() {
    const baseUrl = elements.settingBaseUrl.value.trim();
    const token = elements.settingToken.value.trim();
    const downloadPath = elements.settingDownloadPath.value.trim();
    const autoSync = elements.settingAutoSync.checked;
    const syncInterval = parseInt(elements.settingSyncInterval.value, 10);
    const autoDownloadNew = elements.settingAutoDownloadNew.checked;

    if (!baseUrl || !token) {
      elements.settingsAlert.className = 'alert-box alert-error';
      elements.settingsAlert.textContent = 'Please provide both your Canvas Base URL and API Access Token.';
      return;
    }

    elements.btnSaveSettings.disabled = true;
    elements.btnSaveSettings.innerHTML = '<span class="spinner"></span> Connecting...';

    try {
      const user = await window.modula.testConnection(baseUrl, token);
      await window.modula.saveConfig({
        baseUrl,
        token,
        downloadPath,
        autoSync,
        syncInterval,
        autoDownloadNew
      });

      state.config = await window.modula.getConfig();
      elements.settingsAlert.className = 'alert-box alert-success';
      elements.settingsAlert.textContent = `Connected successfully as ${user.name}!`;

      setTimeout(() => {
        closeSettingsModal();
        elements.btnSaveSettings.disabled = false;
        elements.btnSaveSettings.textContent = 'Save & Connect';
        connectAndLoadCourses();
      }, 700);

    } catch (err) {
      elements.btnSaveSettings.disabled = false;
      elements.btnSaveSettings.textContent = 'Save & Connect';
      elements.settingsAlert.className = 'alert-box alert-error';
      elements.settingsAlert.textContent = `Connection failed: ${err.message}`;
    }
  }

  async function testConnection() {
    const baseUrl = elements.settingBaseUrl.value.trim();
    const token = elements.settingToken.value.trim();
    if (!baseUrl || !token) {
      elements.settingsAlert.className = 'alert-box alert-error';
      elements.settingsAlert.textContent = 'Please enter Canvas URL and Token first.';
      return;
    }

    elements.btnTestConnection.disabled = true;
    elements.btnTestConnection.textContent = 'Testing...';

    try {
      const user = await window.modula.testConnection(baseUrl, token);
      elements.settingsAlert.className = 'alert-box alert-success';
      elements.settingsAlert.textContent = `Success! Connected as ${user.name} (${user.primary_email || user.login_id || 'Student'})`;
    } catch (err) {
      elements.settingsAlert.className = 'alert-box alert-error';
      elements.settingsAlert.textContent = `Connection failed: ${err.message}`;
    } finally {
      elements.btnTestConnection.disabled = false;
      elements.btnTestConnection.textContent = 'Test Connection';
    }
  }

  // Student Onboarding & Verification Controller
  async function checkAuthAndOnboard() {
    const authStatus = await window.modula.getAuthStatus();
    if (authStatus.isVerified && authStatus.studentEmail) {
      elements.onboardingModal.classList.add('hidden');
      if (elements.settingStudentEmailDisplay) {
        elements.settingStudentEmailDisplay.textContent = authStatus.studentEmail;
      }
      if (elements.settingVerifiedBadge) {
        elements.settingVerifiedBadge.textContent = '✓ Verified';
        elements.settingVerifiedBadge.style.display = 'inline-block';
      }
      return true;
    } else {
      // Not verified: show onboarding modal
      elements.onboardingModal.classList.remove('hidden');
      elements.onboardingStepEmail.classList.remove('hidden');
      elements.onboardingStepOtp.classList.add('hidden');
      elements.onboardingAlert.className = 'alert-box hidden';
      elements.userStatus.textContent = 'Verification Required';
      return false;
    }
  }

  function setupOnboardingListeners() {
    let pendingVerificationEmail = '';

    // Step 1: Send OTP
    async function handleSendOtp() {
      const email = elements.onboardingEmailInput.value.trim();
      elements.onboardingAlert.className = 'alert-box hidden';

      if (!email) {
        elements.onboardingAlert.className = 'alert-box alert-error';
        elements.onboardingAlert.textContent = 'Please enter your university student email.';
        return;
      }

      elements.btnSendOtp.disabled = true;
      elements.btnSendOtpText.textContent = 'Sending 6-Digit Code...';

      try {
        const result = await window.modula.sendStudentOtp(email);
        if (result.success) {
          pendingVerificationEmail = result.email;
          elements.onboardingSentEmail.textContent = pendingVerificationEmail;
          elements.onboardingStepEmail.classList.add('hidden');
          elements.onboardingStepOtp.classList.remove('hidden');
          elements.onboardingAlert.className = 'alert-box alert-success';
          elements.onboardingAlert.textContent = result.message || 'Verification code sent! Check your inbox.';
          elements.onboardingOtpInput.value = '';
          elements.onboardingOtpInput.focus();
        } else {
          elements.onboardingAlert.className = 'alert-box alert-error';
          elements.onboardingAlert.textContent = result.error || 'Failed to send verification code.';
        }
      } catch (err) {
        elements.onboardingAlert.className = 'alert-box alert-error';
        elements.onboardingAlert.textContent = err.message || 'Network error sending verification code.';
      } finally {
        elements.btnSendOtp.disabled = false;
        elements.btnSendOtpText.textContent = 'Send 6-Digit Verification Code';
      }
    }

    // Step 2: Verify OTP
    async function handleVerifyOtp() {
      const token = elements.onboardingOtpInput.value.trim();
      elements.onboardingAlert.className = 'alert-box hidden';

      if (!token) {
        elements.onboardingAlert.className = 'alert-box alert-error';
        elements.onboardingAlert.textContent = 'Please enter the 6-digit verification code.';
        return;
      }

      elements.btnVerifyOtp.disabled = true;
      elements.btnVerifyOtpText.textContent = 'Verifying Code...';

      try {
        const result = await window.modula.verifyStudentOtp(pendingVerificationEmail, token);
        if (result.success) {
          elements.onboardingModal.classList.add('hidden');
          showToast(`🎉 Student identity verified! Welcome, ${result.email}`);
          await loadConfig();

          // If Canvas credentials are not set up yet, open settings for seamless setup
          if (!state.config.baseUrl || !state.config.token) {
            openSettingsModal();
          } else {
            await connectAndLoadCourses();
          }
        } else {
          elements.onboardingAlert.className = 'alert-box alert-error';
          elements.onboardingAlert.textContent = result.error || 'Invalid or expired verification code.';
        }
      } catch (err) {
        elements.onboardingAlert.className = 'alert-box alert-error';
        elements.onboardingAlert.textContent = err.message || 'Error verifying code.';
      } finally {
        elements.btnVerifyOtp.disabled = false;
        elements.btnVerifyOtpText.textContent = 'Verify & Unlock Modula';
      }
    }

    if (elements.btnSendOtp) {
      elements.btnSendOtp.addEventListener('click', handleSendOtp);
    }

    if (elements.onboardingEmailInput) {
      elements.onboardingEmailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSendOtp();
        }
      });
    }

    if (elements.btnVerifyOtp) {
      elements.btnVerifyOtp.addEventListener('click', handleVerifyOtp);
    }

    if (elements.onboardingOtpInput) {
      elements.onboardingOtpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleVerifyOtp();
        }
      });
    }

    if (elements.btnChangeEmail) {
      elements.btnChangeEmail.addEventListener('click', () => {
        elements.onboardingStepOtp.classList.add('hidden');
        elements.onboardingStepEmail.classList.remove('hidden');
        elements.onboardingAlert.className = 'alert-box hidden';
        elements.onboardingEmailInput.focus();
      });
    }

    if (elements.btnResendOtp) {
      elements.btnResendOtp.addEventListener('click', async () => {
        if (!pendingVerificationEmail) return;
        elements.onboardingAlert.className = 'alert-box hidden';
        try {
          const res = await window.modula.sendStudentOtp(pendingVerificationEmail);
          if (res.success) {
            elements.onboardingAlert.className = 'alert-box alert-success';
            elements.onboardingAlert.textContent = 'A new verification code has been sent to your inbox.';
          } else {
            elements.onboardingAlert.className = 'alert-box alert-error';
            elements.onboardingAlert.textContent = res.error || 'Failed to resend code.';
          }
        } catch (err) {
          elements.onboardingAlert.className = 'alert-box alert-error';
          elements.onboardingAlert.textContent = err.message || 'Error resending code.';
        }
      });
    }

    // Microsoft Outlook Login
    async function handleMicrosoftLogin() {
      elements.onboardingAlert.className = 'alert-box hidden';
      elements.btnMicrosoftLogin.disabled = true;
      const originalText = elements.btnMicrosoftLoginText ? elements.btnMicrosoftLoginText.textContent : 'Continue with Microsoft Outlook';
      if (elements.btnMicrosoftLoginText) {
        elements.btnMicrosoftLoginText.textContent = 'Connecting to Microsoft...';
      }

      try {
        const result = await window.modula.signInWithMicrosoft();
        if (result.success) {
          elements.onboardingModal.classList.add('hidden');
          showToast(`🎉 Student identity verified! Welcome, ${result.email}`);
          await loadConfig();

          if (!state.config.baseUrl || !state.config.token) {
            openSettingsModal();
          } else {
            await connectAndLoadCourses();
          }
        } else {
          elements.onboardingAlert.className = 'alert-box alert-error';
          elements.onboardingAlert.textContent = result.error || 'Microsoft login was not completed.';
        }
      } catch (err) {
        elements.onboardingAlert.className = 'alert-box alert-error';
        elements.onboardingAlert.textContent = err.message || 'Error connecting to Microsoft.';
      } finally {
        elements.btnMicrosoftLogin.disabled = false;
        if (elements.btnMicrosoftLoginText) {
          elements.btnMicrosoftLoginText.textContent = originalText;
        }
      }
    }

    if (elements.btnMicrosoftLogin) {
      elements.btnMicrosoftLogin.addEventListener('click', handleMicrosoftLogin);
    }
  }

  // Setup Event Listeners
  function setupEventListeners() {
    // Theme toggle
    elements.btnThemeToggle.addEventListener('click', toggleTheme);

    // Settings
    elements.btnSettingsOpen.addEventListener('click', openSettingsModal);
    elements.btnSettingsClose.addEventListener('click', closeSettingsModal);
    elements.btnEmptySetup.addEventListener('click', openSettingsModal);
    elements.btnSaveSettings.addEventListener('click', saveSettings);
    elements.btnTestConnection.addEventListener('click', testConnection);

    // Toggle password visibility
    elements.btnToggleTokenVisibility.addEventListener('click', () => {
      const isPass = elements.settingToken.type === 'password';
      elements.settingToken.type = isPass ? 'text' : 'password';
    });

    // Preset pills click
    document.querySelectorAll('.preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        elements.settingBaseUrl.value = pill.dataset.url;
      });
    });

    // Token help toggle
    elements.linkTokenHelp.addEventListener('click', (e) => {
      e.preventDefault();
      elements.tokenHelpBox.classList.toggle('hidden');
    });

    // Directory Picker
    elements.btnChooseFolder.addEventListener('click', async () => {
      const dir = await window.modula.selectDownloadDirectory();
      if (dir) {
        elements.settingDownloadPath.value = dir;
      }
    });

    // Filter courses
    elements.courseSearchInput.addEventListener('input', (e) => {
      state.courseQuery = e.target.value;
      renderCoursesList();
    });

    // Filter modules
    elements.moduleFilterInput.addEventListener('input', (e) => {
      state.filterQuery = e.target.value;
      renderModules();
    });

    // Expand/Collapse All
    elements.btnExpandAll.addEventListener('click', () => {
      document.querySelectorAll('.module-card').forEach(c => c.classList.remove('collapsed'));
    });
    elements.btnCollapseAll.addEventListener('click', () => {
      document.querySelectorAll('.module-card').forEach(c => c.classList.add('collapsed'));
    });

    // Download entire course
    elements.btnDownloadCourse.addEventListener('click', async () => {
      if (!state.selectedCourse || state.modules.length === 0) return;
      elements.btnDownloadCourse.disabled = true;
      elements.btnDownloadCourse.innerHTML = '<span class="spinner"></span> Downloading Course...';
      showToast(`Started downloading all modules for ${state.selectedCourse.name}`);
      await window.modula.downloadCourse(state.selectedCourse, state.modules);
      setTimeout(() => {
        elements.btnDownloadCourse.disabled = false;
        elements.btnDownloadCourse.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download All Modules</span>
        `;
      }, 1500);
    });

    // Manual Sync Trigger
    elements.btnTriggerSync.addEventListener('click', async () => {
      elements.syncStatusPill.classList.add('syncing');
      elements.syncStatusText.textContent = 'Syncing...';
      await window.modula.triggerSync();
    });

    // Open Downloads Folder
    elements.btnOpenDownloadsFolder.addEventListener('click', () => {
      const path = state.config.downloadPath;
      if (path) window.modula.openPath(path);
    });

    // Drawer minimize toggle
    elements.btnToggleDrawer.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.downloadsDrawer.classList.toggle('minimized');
    });

    // IPC Download Events
    window.modula.onDownloadQueued(({ queueId, item }) => {
      state.activeDownloads.set(queueId, { item, percent: 0 });
      updateDownloadsDrawer();
      updateItemRow(item.id);
    });

    window.modula.onDownloadStarted(({ queueId, item }) => {
      const task = state.activeDownloads.get(queueId) || { item, percent: 0 };
      state.activeDownloads.set(queueId, task);
      updateDownloadsDrawer();
      updateItemRow(item.id);
    });

    window.modula.onDownloadProgress(({ queueId, percent }) => {
      const task = state.activeDownloads.get(queueId);
      if (task) {
        task.percent = percent;
        updateDownloadsDrawer();
        updateItemRow(task.item.id);
      }
    });

    window.modula.onDownloadCompleted(async ({ queueId, item, localPath }) => {
      state.activeDownloads.delete(queueId);
      await refreshDownloadHistory();
      updateDownloadsDrawer();
      updateItemRow(item.id);
      showToast(`Downloaded: ${item.title}`);
    });

    window.modula.onDownloadError(({ queueId, item, error }) => {
      state.activeDownloads.delete(queueId);
      updateDownloadsDrawer();
      updateItemRow(item.id);
      showToast(`Failed to download ${item.title}: ${error}`);
    });

    window.modula.onDownloadCancelled(({ queueId }) => {
      state.activeDownloads.delete(queueId);
      updateDownloadsDrawer();
    });

    // IPC Sync Events (Auto-Updating)
    window.modula.onSyncStatus(async (status) => {
      if (status.state === 'syncing') {
        elements.syncStatusPill.classList.add('syncing');
        elements.syncStatusText.textContent = 'Syncing...';
      } else if (status.state === 'idle') {
        elements.syncStatusPill.classList.remove('syncing');
        elements.syncStatusText.textContent = 'Synced';

        // Check if changes found
        if (status.changes && status.changes.length > 0) {
          status.changes.forEach(change => {
            (change.newModules || []).forEach(m => state.newModules.add(m.id));
            (change.newItems || []).forEach(it => state.newItems.add(it.item.id));
          });

          showToast(`Canvas Sync: Found new modules or items!`);
          if (state.selectedCourse) {
            // Reload current course modules
            const modules = await window.modula.getModules(state.selectedCourse.id);
            state.modules = modules;
            renderModules();
          }
        }
      } else if (status.state === 'error') {
        elements.syncStatusPill.classList.remove('syncing');
        elements.syncStatusText.textContent = 'Sync Error';
      }
    });

    // App Updates Listeners
    if (window.modula.onUpdateAvailable) {
      window.modula.onUpdateAvailable((info) => {
        handleUpdateAvailable(info);
      });
    }

    if (elements.btnBannerDownload) {
      elements.btnBannerDownload.addEventListener('click', () => {
        if (latestUpdateInfo) {
          downloadAppUpdate(latestUpdateInfo);
        }
      });
    }

    if (elements.btnBannerDismiss) {
      elements.btnBannerDismiss.addEventListener('click', () => {
        elements.updateBanner.classList.add('hidden');
      });
    }

    if (elements.btnCheckUpdates) {
      elements.btnCheckUpdates.addEventListener('click', triggerManualUpdateCheck);
    }
  }

  // Helpers
  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getItemTypeIcon(type, title) {
    const ext = title ? title.split('.').pop().toLowerCase() : '';

    if (type === 'File') {
      if (ext === 'pdf') {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
      }
      if (['docx', 'doc'].includes(ext)) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
      }
      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg>`;
      }
      if (['pptx', 'ppt'].includes(ext)) {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
      }
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`;
    }

    if (type === 'Page') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`;
    }

    if (type === 'Assignment') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>`;
    }

    if (type === 'Quiz') {
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }

    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
  }

  // Start app
  init();
});
