const { app } = require('electron');
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
