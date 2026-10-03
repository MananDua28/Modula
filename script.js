// Modula Landing Page Interactivity

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  detectOSAndAdaptCTA();
  initCopyCommand();
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

// OS Detection to Promote Correct Platform CTA
function detectOSAndAdaptCTA() {
  const primaryBtn = document.getElementById('primaryDownloadBtn');
  const primaryText = document.getElementById('primaryDownloadText');
  const secondaryBtn = document.getElementById('secondaryDownloadBtn');

  if (!primaryBtn || !secondaryBtn || !primaryText) return;

  const ua = window.navigator.userAgent.toLowerCase();
  const isWindows = ua.includes('win');
  const isMac = ua.includes('mac');

  const macDownloadUrl = "https://github.com/MananDua28/Modula/releases/download/v1.0.2/Modula-1.0.2-arm64.dmg";
  const winDownloadUrl = "https://github.com/MananDua28/Modula/releases/download/v1.0.2/Modula-Setup-1.0.2.exe";

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
