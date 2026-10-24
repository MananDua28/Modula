// Modula Landing Page Interactivity

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileMenu();
  detectOSAndAdaptCTA();
  initCopyCommand();
  initSecurityTabs();
  initDownloadTracking();
  initFaqAccordion();
});

// Theme Management
function initTheme() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('modula_landing_theme') || 'dark';
  setTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.body.classList.contains('theme-light') ? 'light' : 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      setTheme(nextTheme);
    });
  }
}

function setTheme(theme) {
  document.body.classList.remove('theme-dark', 'theme-light');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('modula_landing_theme', theme);
}

// Mobile Navigation Drawer
function initMobileMenu() {
  const toggleBtn = document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileDrawer');

  if (!toggleBtn || !drawer) return;

  function openMenu() {
    toggleBtn.classList.add('active');
    drawer.classList.add('open');
    toggleBtn.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
  }

  function closeMenu() {
    toggleBtn.classList.remove('active');
    drawer.classList.remove('open');
    toggleBtn.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Close drawer when any mobile navigation link is clicked
  const mobileLinks = drawer.querySelectorAll('a');
  mobileLinks.forEach((link) => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });

  // Close drawer when clicking outside
  document.addEventListener('click', (e) => {
    if (drawer.classList.contains('open') && !drawer.contains(e.target) && !toggleBtn.contains(e.target)) {
      closeMenu();
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeMenu();
    }
  });
}

// OS Detection to Promote Correct Platform CTA
function detectOSAndAdaptCTA() {
  const primaryBtn = document.getElementById('primaryDownloadBtn');
  const primaryText = document.getElementById('primaryDownloadText');
  const secondaryBtn = document.getElementById('secondaryDownloadBtn');

  if (!primaryBtn || !secondaryBtn || !primaryText) return;

  const ua = window.navigator.userAgent.toLowerCase();
  const isWindows = ua.includes('win');

  const macDownloadUrl = "https://github.com/MananDua28/Modula/releases/download/v1.0.4/Modula-1.0.4-arm64.dmg";
  const winDownloadUrl = "https://github.com/MananDua28/Modula/releases/download/v1.0.4/Modula-Setup-1.0.4.exe";

  if (isWindows) {
    // Windows visitor: prioritize Windows setup installer
    primaryBtn.href = winDownloadUrl;
    primaryText.textContent = "Download for Windows (.exe)";
    primaryBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="8" height="8"></rect>
        <rect x="13" y="3" width="8" height="8"></rect>
        <rect x="3" y="13" width="8" height="8"></rect>
        <rect x="13" y="13" width="8" height="8"></rect>
      </svg>
      <span>Download for Windows (.exe)</span>
    `;

    secondaryBtn.href = macDownloadUrl;
    secondaryBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Download for macOS (.dmg)</span>
    `;
  } else {
    // Default to macOS (or Mac visitor)
    primaryBtn.href = macDownloadUrl;
    secondaryBtn.href = winDownloadUrl;
  }
}

// Copy Terminal Command Helper
function initCopyCommand() {
  const copyBtn = document.getElementById('copyCommandBtn');
  const copyText = document.getElementById('copyBtnText');

  if (!copyBtn || !copyText) return;

  copyBtn.addEventListener('click', async () => {
    const cmd = "xattr -cr /Applications/Modula.app";
    try {
      await navigator.clipboard.writeText(cmd);
      copyText.textContent = "✓ Copied!";
      copyBtn.style.borderColor = "#10b981";
      copyBtn.style.color = "#10b981";
      setTimeout(() => {
        copyText.textContent = "Copy Command";
        copyBtn.style.borderColor = "";
        copyBtn.style.color = "";
      }, 2500);
    } catch {
      // Fallback
      copyText.textContent = "Copied!";
      setTimeout(() => { copyText.textContent = "Copy Command"; }, 2000);
    }
  });
}

// Analytics Event Tracking for Downloads
function initDownloadTracking() {
  document.addEventListener('click', (e) => {
    const downloadAnchor = e.target.closest('a[href*="/releases/download/"]');
    if (!downloadAnchor) return;

    const href = downloadAnchor.getAttribute('href') || '';
    let platform = 'Unknown';
    if (href.endsWith('.dmg')) platform = 'macOS (.dmg)';
    else if (href.includes('Portable')) platform = 'Windows Portable (.exe)';
    else if (href.endsWith('.exe')) platform = 'Windows (.exe)';
    else if (href.endsWith('.zip')) platform = 'macOS (.zip)';

    if (typeof window.va === 'function') {
      window.va('track', 'App Download', { platform: platform, file: href.split('/').pop() });
    }
  });
}

// Security & Installation Guide Tab Switching
function initSecurityTabs() {
  const tabWinBtn = document.getElementById('tabWinBtn');
  const tabMacBtn = document.getElementById('tabMacBtn');
  const winContent = document.getElementById('tabWindowsContent');
  const macContent = document.getElementById('tabMacContent');

  if (!tabWinBtn || !tabMacBtn || !winContent || !macContent) return;

  function switchTab(platform) {
    if (platform === 'windows') {
      tabWinBtn.classList.add('active');
      tabMacBtn.classList.remove('active');
      winContent.classList.add('active');
      macContent.classList.remove('active');
    } else {
      tabMacBtn.classList.add('active');
      tabWinBtn.classList.remove('active');
      macContent.classList.add('active');
      winContent.classList.remove('active');
    }
  }

  tabWinBtn.addEventListener('click', () => switchTab('windows'));
  tabMacBtn.addEventListener('click', () => switchTab('macos'));

  // Automatically select the active guide tab matching the visitor's OS
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes('win')) {
    switchTab('windows');
  } else {
    switchTab('macos');
  }
}

// FAQ Accordion
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    if (!questionBtn) return;
    questionBtn.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      faqItems.forEach(other => other.classList.remove('active'));
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}


