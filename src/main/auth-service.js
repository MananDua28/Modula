const { app, BrowserWindow } = require('electron');
const crypto = require('crypto');

class AuthService {
  constructor(configStore) {
    this.configStore = configStore;
    this.supabaseUrl = 'https://eaphgmvozomccqrctbst.supabase.co';
    this.supabaseKey = 'sb_publishable_IqKDQtuxViU0wqOODbwMow_JGmZFPp5';

    // Ensure a persistent unique device ID exists
    this.ensureDeviceId();
  }

  ensureDeviceId() {
    const config = this.configStore.getConfig();
    if (!config.deviceId) {
      const newDeviceId = 'modula_dev_' + crypto.randomUUID();
      this.configStore.saveConfig({ deviceId: newDeviceId });
      return newDeviceId;
    }
    return config.deviceId;
  }

  getDeviceId() {
    const config = this.configStore.getConfig();
    return config.deviceId || this.ensureDeviceId();
  }

  isValidStudentEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email address cannot be empty.' };
    }

    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, error: 'Please enter a valid email address.' };
    }

    const domain = trimmed.split('@')[1];

    // Explicitly reject commercial / personal webmail providers
    const bannedDomains = [
      'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com',
      'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
      'icloud.com', 'me.com', 'mac.com', 'aol.com',
      'protonmail.com', 'proton.me', 'zoho.com', 'mail.com',
      'gmx.com', 'gmx.net', 'yandex.com', 'fastmail.com'
    ];

    if (bannedDomains.includes(domain)) {
      return {
        valid: false,
        error: `Personal email providers (@${domain}) are not permitted. Modula requires an official university student email address.`
      };
    }

    // Require educational domain suffixes or institutional patterns
    const isEduPattern = 
      domain.endsWith('.ac.uk') ||           // UK universities (e.g. bham.ac.uk, ox.ac.uk)
      domain.endsWith('.edu') ||             // US/global universities (e.g. stanford.edu)
      domain.includes('.edu.') ||            // International edu (e.g. unimelb.edu.au, iitb.edu.in)
      domain.includes('.ac.') ||             // International academic (e.g. u-tokyo.ac.jp, nus.ac.sg)
      domain.endsWith('.edu.cn') ||
      domain.startsWith('uni-') ||
      domain.includes('.univ-') ||
      domain.endsWith('.uni.lu') ||
      domain.endsWith('.epfl.ch') ||
      domain.endsWith('.ethz.ch');

    if (!isEduPattern) {
      return {
        valid: false,
        error: `"${domain}" is not recognized as an official university domain (.ac.uk, .edu, etc.).`
      };
    }

    return { valid: true, domain, email: trimmed };
  }

  async sendOtp(rawEmail) {
    const validation = this.isValidStudentEmail(rawEmail);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const email = validation.email;
    const deviceId = this.getDeviceId();
    const appVersion = app.isPackaged ? app.getVersion() : '1.0.2';

    try {
      const response = await fetch(`${this.supabaseUrl}/auth/v1/otp`, {
        method: 'POST',
        headers: {
          'apikey': this.supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          create_user: true,
          data: {
            device_id: deviceId,
            platform: process.platform,
            app_version: appVersion,
            university_domain: validation.domain
          }
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.msg || data.message || data.error_description || 'Failed to send verification code.';
        return { success: false, error: errorMsg };
      }

      return {
        success: true,
        message: `Verification code sent to ${email}. Please check your inbox.`,
        email: email
      };
    } catch (err) {
      console.error('Error sending OTP via Supabase:', err);
      return {
        success: false,
        error: 'Network error connecting to verification service. Please check your internet connection.'
      };
    }
  }

  async verifyOtp(rawEmail, token) {
    if (!token || !token.trim()) {
      return { success: false, error: 'Please enter the verification code.' };
    }

    const cleanToken = token.trim().replace(/\s+/g, '');
    const validation = this.isValidStudentEmail(rawEmail);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const email = validation.email;
    const deviceId = this.getDeviceId();
    const appVersion = app.isPackaged ? app.getVersion() : '1.0.2';

    try {
      let response = await fetch(`${this.supabaseUrl}/auth/v1/verify`, {
        method: 'POST',
        headers: {
          'apikey': this.supabaseKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'email',
          email: email,
          token: cleanToken
        })
      });

      let data = await response.json().catch(() => ({}));

      // If 'email' type fails (e.g. for initial account registration), try 'signup' type
      if (!response.ok) {
        const retryResponse = await fetch(`${this.supabaseUrl}/auth/v1/verify`, {
          method: 'POST',
          headers: {
            'apikey': this.supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: 'signup',
            email: email,
            token: cleanToken
          })
        });
        const retryData = await retryResponse.json().catch(() => ({}));
        if (retryResponse.ok) {
          response = retryResponse;
          data = retryData;
        }
      }

      if (!response.ok) {
        const errorMsg = data.msg || data.message || data.error_description || 'Invalid or expired verification code.';
        return { success: false, error: errorMsg };
      }

      const accessToken = data.access_token;
      const user = data.user;

      // Update student profile metadata in Supabase
      if (accessToken) {
        try {
          await fetch(`${this.supabaseUrl}/auth/v1/user`, {
            method: 'PUT',
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              data: {
                device_id: deviceId,
                student_email: email,
                platform: process.platform,
                app_version: appVersion,
                university_domain: validation.domain,
                verified_at: new Date().toISOString(),
                last_active_at: new Date().toISOString()
              }
            })
          });
        } catch (metaErr) {
          console.warn('Could not update Supabase user metadata:', metaErr);
        }
      }

      // Save verified status locally in configStore
      this.configStore.saveConfig({
        isVerified: true,
        studentEmail: email,
        studentDomain: validation.domain,
        verifiedAt: new Date().toISOString(),
        userId: user ? user.id : null,
        sessionToken: accessToken || null
      });

      return {
        success: true,
        user: user,
        email: email
      };
    } catch (err) {
      console.error('Error verifying OTP via Supabase:', err);
      return {
        success: false,
        error: 'Network error verifying code. Please try again.'
      };
    }
  }

  async sendHeartbeat() {
    const config = this.configStore.getConfig();
    if (!config.isVerified || !config.sessionToken) return;

    try {
      const appVersion = app.isPackaged ? app.getVersion() : '1.0.2';
      await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${config.sessionToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            last_active_at: new Date().toISOString(),
            app_version: appVersion
          }
        })
      });
    } catch (err) {
      // Background heartbeat failure is non-fatal
    }
  }

  async signInWithMicrosoft() {
    const deviceId = this.getDeviceId();
    const appVersion = app.isPackaged ? app.getVersion() : '1.0.3';

    // Generate PKCE pair
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const callbackUrl = `${this.supabaseUrl}/auth/v1/callback`;
    const authorizeUrl = `${this.supabaseUrl}/auth/v1/authorize?provider=azure` +
      `&scopes=email%20openid%20profile` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=s256` +
      `&redirect_to=${encodeURIComponent(callbackUrl)}`;

    return new Promise((resolve) => {
      let isCompleted = false;

      const authWindow = new BrowserWindow({
        width: 520,
        height: 680,
        show: true,
        title: 'Sign in with Microsoft Outlook',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });

      const finish = (result) => {
        if (isCompleted) return;
        isCompleted = true;
        try {
          if (!authWindow.isDestroyed()) {
            authWindow.close();
          }
        } catch (_) {}
        resolve(result);
      };

      const handleUrlNavigation = async (targetUrl) => {
        if (!targetUrl || isCompleted) return;

        // Check for error parameters
        if (targetUrl.includes('error=') || targetUrl.includes('error_description=')) {
          try {
            const parsed = new URL(targetUrl.replace('#', '?'));
            const desc = parsed.searchParams.get('error_description') || parsed.searchParams.get('error') || 'Microsoft login failed.';
            return finish({ success: false, error: decodeURIComponent(desc) });
          } catch (_) {
            return finish({ success: false, error: 'Microsoft sign in encountered an error.' });
          }
        }

        // Check for PKCE auth code or access token
        let code = null;
        let accessToken = null;
        let refreshToken = null;

        try {
          const parsed = new URL(targetUrl.replace('#', '?'));
          code = parsed.searchParams.get('code');
          accessToken = parsed.searchParams.get('access_token');
          refreshToken = parsed.searchParams.get('refresh_token');
        } catch (_) {}

        // 1. Direct access token (implicit flow)
        if (accessToken) {
          return await processSessionToken(accessToken, refreshToken);
        }

        // 2. PKCE auth code
        if (code) {
          try {
            const tokenRes = await fetch(`${this.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
              method: 'POST',
              headers: {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${this.supabaseKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                auth_code: code,
                code_verifier: codeVerifier
              })
            });

            const tokenData = await tokenRes.json().catch(() => ({}));
            if (!tokenRes.ok || !tokenData.access_token) {
              const errMsg = tokenData.msg || tokenData.error_description || 'Failed to exchange authorization code for session.';
              return finish({ success: false, error: errMsg });
            }

            return await processSessionToken(tokenData.access_token, tokenData.refresh_token);
          } catch (err) {
            console.error('Error exchanging PKCE code:', err);
            return finish({ success: false, error: 'Network error exchanging login code.' });
          }
        }
      };

      const processSessionToken = async (token, refToken) => {
        try {
          // Retrieve user profile from Supabase
          const userRes = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
            headers: {
              'apikey': this.supabaseKey,
              'Authorization': `Bearer ${token}`
            }
          });

          if (!userRes.ok) {
            return finish({ success: false, error: 'Failed to retrieve authenticated user profile.' });
          }

          const user = await userRes.json();
          const email = (user.email || '').trim().toLowerCase();

          if (!email) {
            return finish({ success: false, error: 'Could not obtain email address from Microsoft account.' });
          }

          // Validate that it's a student email
          const validation = this.isValidStudentEmail(email);
          if (!validation.valid) {
            return finish({
              success: false,
              error: `The Microsoft account (${email}) is not an eligible student email address: ${validation.error}`
            });
          }

          // Update user profile in Supabase
          try {
            await fetch(`${this.supabaseUrl}/auth/v1/user`, {
              method: 'PUT',
              headers: {
                'apikey': this.supabaseKey,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                data: {
                  device_id: deviceId,
                  student_email: email,
                  platform: process.platform,
                  app_version: appVersion,
                  university_domain: validation.domain,
                  auth_provider: 'azure_microsoft',
                  verified_at: new Date().toISOString(),
                  last_active_at: new Date().toISOString()
                }
              })
            });
          } catch (metaErr) {
            console.warn('Could not update Supabase user metadata:', metaErr);
          }

          // Save verified state locally
          this.configStore.saveConfig({
            isVerified: true,
            studentEmail: email,
            studentDomain: validation.domain,
            verifiedAt: new Date().toISOString(),
            userId: user.id || null,
            sessionToken: token,
            refreshToken: refToken || null,
            authProvider: 'azure_microsoft'
          });

          return finish({
            success: true,
            email: email,
            user: user
          });
        } catch (err) {
          console.error('Error processing Microsoft user session:', err);
          return finish({ success: false, error: 'Error processing student authentication session.' });
        }
      };

      authWindow.webContents.on('will-redirect', (_event, url) => {
        handleUrlNavigation(url);
      });

      authWindow.webContents.on('will-navigate', (_event, url) => {
        handleUrlNavigation(url);
      });

      authWindow.webContents.on('did-navigate', (_event, url) => {
        handleUrlNavigation(url);
      });

      authWindow.on('closed', () => {
        if (!isCompleted) {
          finish({ success: false, error: 'Microsoft login window was closed.' });
        }
      });

      authWindow.loadURL(authorizeUrl).catch((err) => {
        if (!isCompleted) {
          finish({ success: false, error: `Failed to load Microsoft login: ${err.message}` });
        }
      });
    });
  }

  async signOut() {
    this.configStore.saveConfig({
      isVerified: false,
      studentEmail: null,
      studentDomain: null,
      verifiedAt: null,
      userId: null,
      sessionToken: null,
      refreshToken: null,
      authProvider: null
    });
    return { success: true };
  }

  getAuthStatus() {
    const config = this.configStore.getConfig();
    return {
      isVerified: Boolean(config.isVerified && config.studentEmail),
      studentEmail: config.studentEmail || null,
      studentDomain: config.studentDomain || null,
      deviceId: this.getDeviceId(),
      verifiedAt: config.verifiedAt || null
    };
  }
}

module.exports = AuthService;
