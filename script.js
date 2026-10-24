// Modula Landing Page Interactivity

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileMenu();
  detectOSAndAdaptCTA();
  initCopyCommand();
  initSecurityTabs();
  initDownloadTracking();
  initFaqAccordion();
  initContactForm();
  initScrollFeatures();
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

  const appleSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.89c.65-.8 1.1-1.92.97-3.04-.95.04-2.1.63-2.77 1.42-.59.68-1.11 1.78-.97 2.87 1.06.08 2.13-.54 2.77-1.25z"/></svg>`;
  const winSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><path d="M0 0h11v11H0zM13 0h11v11H13zM0 13h11v11H0zM13 13h11v11H13z"/></svg>`;

  if (isWindows) {
    // Windows visitor: prioritize Windows setup installer
    primaryBtn.href = winDownloadUrl;
    primaryBtn.innerHTML = `
      ${winSvg}
      <span id="primaryDownloadText">Download for Windows (.exe)</span>
    `;

    secondaryBtn.href = macDownloadUrl;
    secondaryBtn.innerHTML = `
      ${appleSvg}
      <span>Download for macOS (.dmg)</span>
    `;
  } else {
    // Default to macOS (or Mac visitor)
    primaryBtn.href = macDownloadUrl;
    primaryBtn.innerHTML = `
      ${appleSvg}
      <span id="primaryDownloadText">Download for macOS (.dmg)</span>
    `;

    secondaryBtn.href = winDownloadUrl;
    secondaryBtn.innerHTML = `
      ${winSvg}
      <span>Download for Windows (.exe)</span>
    `;
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
      copyText.textContent = "Copied to clipboard";
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

// Contact & Issue Reporting Form (Connected to Supabase)
function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const submitBtn = document.getElementById('contactSubmitBtn');
  const submitText = document.getElementById('contactSubmitText');
  const alertBox = document.getElementById('contactStatusAlert');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('contactName')?.value.trim() || 'Anonymous';
    const email = document.getElementById('contactEmail')?.value.trim();
    const category = document.getElementById('contactCategory')?.value || 'General Issue';
    const uni = document.getElementById('contactUni')?.value.trim() || 'Not specified';
    const userMessage = document.getElementById('contactMessage')?.value.trim();

    if (!email || !userMessage) {
      showAlert('Please enter your university email and a description of the issue.', 'error');
      return;
    }

    // Only university emails accepted
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'mail.com', 'proton.me', 'protonmail.com', 'live.com', 'msn.com'];
    const emailDomain = (email.split('@')[1] || '').toLowerCase();
    if (personalDomains.includes(emailDomain)) {
      showAlert('Only official university student emails are accepted (e.g. .ac.uk, .edu, or your campus domain). Personal email addresses are not accepted.', 'error');
      return;
    }

    // Set loading state
    submitBtn.disabled = true;
    const originalText = submitText.textContent;
    submitText.textContent = 'Sending...';

    const fullMessage = `[Category: ${category}]\n[Student: ${name}]\n[University/Domain: ${uni}]\n\n${userMessage}`;

    const supabaseUrl = 'https://eaphgmvozomccqrctbst.supabase.co';
    const supabaseKey = 'sb_publishable_IqKDQtuxViU0wqOODbwMow_JGmZFPp5';

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          student_email: email,
          message: fullMessage,
          app_version: 'web-landing-v1.0.4',
          platform: `Web (${window.navigator.userAgent.slice(0, 100)})`,
          device_id: 'web-contact-form'
        })
      });

      if (response.ok) {
        showAlert('Thank you! Your report has been submitted. We will review it and follow up via email if needed.', 'success');
        form.reset();
      } else {
        const errText = await response.text();
        console.warn('Supabase submission response:', response.status, errText);
        showAlert('Could not send automatically. Please email modula.auth@gmail.com directly.', 'error');
      }
    } catch (err) {
      console.error('Contact form submission error:', err);
      showAlert('Network error. Please check your internet connection or email modula.auth@gmail.com directly.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = originalText;
    }
  });

  function showAlert(msg, type) {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = `contact-status-alert alert-${type}`;
    alertBox.style.display = 'block';
  }
}

// Sticky Header Shadow on Scroll & Scroll to Top Button
function initScrollFeatures() {
  const navbar = document.querySelector('.navbar');
  const scrollBtn = document.getElementById('scrollToTopBtn');

  const onScroll = () => {
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    // Header shadow on scroll
    if (navbar) {
      if (scrollY > 20) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    }

    // Scroll to Top visibility
    if (scrollBtn) {
      if (scrollY > 400) {
        scrollBtn.classList.add('visible');
      } else {
        scrollBtn.classList.remove('visible');
      }
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
}


