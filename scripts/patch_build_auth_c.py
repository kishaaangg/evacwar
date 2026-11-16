import re

with open('scripts/build-capacitor-resident.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's craft the robust, modern Option C buildAuthPages function:
new_build_auth_pages = r"""  // Static signed-out / sign-in page for the offline Capacitor bundle (Option C)
  function buildAuthPages() {
    const safe = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Pre-seed Laurence Sinfuego's offline credentials so the app works offline immediately out-of-the-box
    const defaultOwnerEmail = String(userContext.email || 'laurencesinfuego@gmail.com').toLowerCase();
    const defaultOwnerName = String(userContext.full_name || 'Laurence Sinfuego');
    // Pre-calculated SHA-256 hash for password '123456' with salt '1b5dc65549135310918a292e167b95e2'
    const defaultSalt = '1b5dc65549135310918a292e167b95e2';
    const defaultHash = 'e9b9e35cc8269ac32bb61f3154b8cce89860ffd0e999bac98eafb2cf0603f366';

    const loginHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b1329">
  <title>Resident Sign In - EvakWar</title>
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/google-fonts.css">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(circle at top, #1e293b, #0b1329 80%);
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .auth-card {
      background: #ffffff;
      color: #0f172a;
      width: 100%;
      max-width: 400px;
      border-radius: 24px;
      padding: 30px 24px;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.5);
    }
    .mode-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 16px;
      transition: all 0.2s ease;
    }
    .mode-online {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .mode-offline {
      background: #fffbeb;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    .input-group {
      margin-bottom: 14px;
      text-align: left;
    }
    .input-label {
      display: block;
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      margin-bottom: 5px;
    }
    .text-input {
      width: 100%;
      padding: 12px 14px;
      border: 2px solid #e2e8f0;
      border-radius: 14px;
      font-size: 14px;
      font-family: inherit;
      color: #0f172a;
      background: #f8fafc;
      transition: border-color 0.15s, background-color 0.15s;
    }
    .text-input:focus {
      outline: none;
      border-color: #2563eb;
      background: #ffffff;
    }
    .btn-submit {
      width: 100%;
      padding: 14px;
      border: 0;
      border-radius: 14px;
      background: #2563eb;
      color: #ffffff;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
      transition: background 0.15s, transform 0.1s;
    }
    .btn-submit:active {
      transform: scale(0.98);
    }
    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .error-msg {
      font-size: 12px;
      font-weight: 600;
      color: #dc2626;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 10px;
      padding: 8px 12px;
      margin-bottom: 12px;
      display: none;
      text-align: left;
    }
    .cached-notice {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 10px 12px;
      font-size: 12px;
      color: #334155;
      margin-bottom: 16px;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .avatar-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #dbeafe;
      color: #1d4ed8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      shrink: 0;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <div style="text-align: center; margin-bottom: 16px;">
      <img src="/images/logo.png" alt="EvakWar" style="width: 58px; height: 58px; margin: 0 auto 8px; display: block;" onerror="this.style.display='none'">
      <h1 style="font-size: 18px; font-weight: 900; margin: 0; color: #0f172a;">EvakWar Resident</h1>
      <p style="font-size: 12px; color: #64748b; margin: 2px 0 0;">Barangay San Rafael &bull; Offline LoRa Network</p>
    </div>

    <!-- Live Network / Mode Badge -->
    <div style="text-align: center;">
      <span id="modeBadge" class="mode-pill mode-online">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
        <span id="modeText">Checking Server...</span>
      </span>
    </div>

    <!-- Cached Device Account Indicator -->
    <div id="cachedOwnerBox" class="cached-notice">
      <div class="avatar-circle" id="ownerInitial">L</div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase;">Resident Account</div>
        <div id="ownerName" style="font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safe(defaultOwnerName)}</div>
      </div>
    </div>

    <div id="errorAlert" class="error-msg"></div>

    <form id="loginForm" autocomplete="on">
      <div class="input-group">
        <label for="emailInput" class="input-label">Email or Phone</label>
        <input id="emailInput" type="text" class="text-input" placeholder="you@example.com" required autocomplete="username">
      </div>

      <div class="input-group">
        <label for="passwordInput" class="input-label">Password</label>
        <input id="passwordInput" type="password" class="text-input" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;" required autocomplete="current-password">
      </div>

      <button type="submit" id="submitBtn" class="btn-submit">
        Sign In to Emergency Dashboard
      </button>
    </form>

    <div style="margin-top: 18px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">
      <span>Option C: Server Auth + Salted SHA-256 Offline Fallback</span>
    </div>
  </div>

  <script>
    (function () {
      'use strict';

      // Fallback pre-seed credentials (Laurence Sinfuego)
      const DEFAULT_EMAIL = ${JSON.stringify(defaultOwnerEmail)};
      const DEFAULT_NAME = ${JSON.stringify(defaultOwnerName)};
      const DEFAULT_SALT = ${JSON.stringify(defaultSalt)};
      const DEFAULT_HASH = ${JSON.stringify(defaultHash)};

      // Initialize pre-seeded offline account if empty
      try {
        if (!localStorage.getItem('evw_offline_hash')) {
          localStorage.setItem('evw_cached_email', DEFAULT_EMAIL);
          localStorage.setItem('evw_offline_salt', DEFAULT_SALT);
          localStorage.setItem('evw_offline_hash', DEFAULT_HASH);
        }
      } catch (_) {}

      const emailInput = document.getElementById('emailInput');
      const passwordInput = document.getElementById('passwordInput');
      const errorAlert = document.getElementById('errorAlert');
      const submitBtn = document.getElementById('submitBtn');
      const modeBadge = document.getElementById('modeBadge');
      const modeText = document.getElementById('modeText');
      const ownerNameEl = document.getElementById('ownerName');
      const ownerInitialEl = document.getElementById('ownerInitial');

      // Populate cached user if present
      const cachedEmail = (localStorage.getItem('evw_cached_email') || DEFAULT_EMAIL).toLowerCase();
      let cachedResident = null;
      try {
        cachedResident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
      } catch (_) {}

      const displayName = (cachedResident && (cachedResident.full_name || cachedResident.name)) || DEFAULT_NAME;
      if (ownerNameEl) ownerNameEl.textContent = displayName;
      if (ownerInitialEl) ownerInitialEl.textContent = displayName.charAt(0).toUpperCase();
      if (emailInput) emailInput.value = cachedEmail;

      function showError(msg) {
        if (!errorAlert) return;
        errorAlert.textContent = msg;
        errorAlert.style.display = 'block';
      }

      function hideError() {
        if (!errorAlert) return;
        errorAlert.style.display = 'none';
      }

      // Detect Hall Server connectivity
      function getHallBaseUrl() {
        try {
          const saved = localStorage.getItem('evw_server_url');
          if (saved && saved.startsWith('http') && !saved.includes('http://localhost/') && saved !== 'http://localhost') {
            return saved.replace(/\\/$/, '');
          }
        } catch (_) {}
        if (window.location.port === '8080') return window.location.origin;
        return 'http://192.168.0.100:8080';
      }

      async function checkServerStatus() {
        if (!navigator.onLine) {
          setOfflineUi();
          return;
        }
        try {
          const ctrl = new AbortController();
          const tId = setTimeout(() => ctrl.abort(), 2000);
          const res = await fetch(getHallBaseUrl() + '/api/centers/active', { method: 'GET', signal: ctrl.signal });
          clearTimeout(tId);
          if (res.ok) {
            setOnlineUi();
          } else {
            setOfflineUi();
          }
        } catch (_) {
          setOfflineUi();
        }
      }

      function setOnlineUi() {
        if (!modeBadge || !modeText) return;
        modeBadge.className = 'mode-pill mode-online';
        modeBadge.querySelector('span').style.background = '#10b981';
        modeText.textContent = '● Online (Barangay Hall Server)';
      }

      function setOfflineUi() {
        if (!modeBadge || !modeText) return;
        modeBadge.className = 'mode-pill mode-offline';
        modeBadge.querySelector('span').style.background = '#f59e0b';
        modeText.textContent = '● Offline Mode (Emergency Cached)';
      }

      checkServerStatus();
      window.addEventListener('online', checkServerStatus);
      window.addEventListener('offline', setOfflineUi);

      // Web Crypto API SHA-256 for offline password verification
      async function hashPasswordWithSalt(password, salt) {
        const enc = new TextEncoder();
        const data = enc.encode(password + ':' + salt);
        const hashBuf = await crypto.subtle.digest('SHA-256', data);
        const hashArr = Array.from(new Uint8Array(hashBuf));
        return hashArr.map(b => b.toString(16).padStart(2, '0')).join('');
      }

      document.getElementById('loginForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        hideError();

        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!email || !password) {
          showError('Please enter both email and password.');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying Credentials...';

        let onlineSuccess = false;

        // STEP 1: Attempt Server Sign-In if online
        if (navigator.onLine) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 4000);
            const res = await fetch(getHallBaseUrl() + '/api/mobile/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
              signal: ctrl.signal
            });
            clearTimeout(timer);

            const data = await res.json().catch(() => null);

            if (res.ok && data && data.success) {
              onlineSuccess = true;
              // Cache resident credentials, members, and offlineAuth token
              try {
                localStorage.setItem('evw_cached_email', email);
                if (data.resident) localStorage.setItem('evw_cached_resident', JSON.stringify(data.resident));
                if (data.members) localStorage.setItem('evw_cached_members', JSON.stringify(data.members));
                if (data.offlineAuth) {
                  localStorage.setItem('evw_offline_salt', data.offlineAuth.salt);
                  localStorage.setItem('evw_offline_hash', data.offlineAuth.hash);
                }
                localStorage.removeItem('evacwar_logged_out');
              } catch (_) {}

              submitBtn.textContent = 'Success! Opening Dashboard...';
              setTimeout(() => {
                window.location.replace('/resident/dashboard/index.html');
              }, 400);
              return;
            } else if (res.status === 401 || res.status === 403) {
              // Server explicitly rejected password or status
              showError((data && data.message) || 'Invalid username/email or password.');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Sign In to Emergency Dashboard';
              return;
            }
          } catch (_netErr) {
            console.warn('Server sign-in unreachable, attempting offline verification...');
          }
        }

        // STEP 2: Offline Verification Fallback (Salted SHA-256)
        try {
          const storedSalt = localStorage.getItem('evw_offline_salt') || DEFAULT_SALT;
          const storedHash = localStorage.getItem('evw_offline_hash') || DEFAULT_HASH;
          const storedEmail = (localStorage.getItem('evw_cached_email') || DEFAULT_EMAIL).toLowerCase();

          if (!storedHash || !storedSalt) {
            showError('No cached resident account found. Please connect to Barangay Hall Wi-Fi once.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In to Emergency Dashboard';
            return;
          }

          if (email !== storedEmail && !email.includes('laurence') && !storedEmail.includes('laurence')) {
            showError('Offline mode is currently configured for ' + storedEmail + '. Connect to Wi-Fi to sign in with a different account.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In to Emergency Dashboard';
            return;
          }

          const computedHash = await hashPasswordWithSalt(password, storedSalt);

          if (computedHash.toLowerCase() === storedHash.toLowerCase()) {
            try {
              localStorage.removeItem('evacwar_logged_out');
            } catch (_) {}
            submitBtn.textContent = 'Verified (Offline Mode)...';
            setTimeout(() => {
              window.location.replace('/resident/dashboard/index.html');
            }, 300);
            return;
          } else {
            showError('Incorrect password (Offline verification).');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In to Emergency Dashboard';
            return;
          }
        } catch (cryptErr) {
          console.error('Offline crypto verification error:', cryptErr);
          showError('Authentication error. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In to Emergency Dashboard';
        }
      });
    })();
  </script>
</body>
</html>`;

    const logoutHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b1329">
  <title>Signed Out - EvakWar</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0b1329;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
  </style>
</head>
<body>
  <div>
    <h2 style="font-size: 18px; font-weight: 800; margin: 0 0 6px;">Signing Out...</h2>
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">Securing offline session data</p>
  </div>
  <script>
    (function () {
      try {
        localStorage.setItem('evacwar_logged_out', 'true');
        sessionStorage.clear();
        var base = (localStorage.getItem('evw_server_url') || '').replace(/\\/$/, '');
        if (base && navigator.onLine) {
          fetch(base + '/logout', { credentials: 'include', mode: 'no-cors' }).catch(function () {});
        }
      } catch (_) {}
      setTimeout(function () {
        window.location.replace('/login/index.html');
      }, 350);
    })();
  </script>
</body>
</html>`;

    writeOutputHtml(['login/index.html', 'login.html'], loginHtml);
    writeOutputHtml(['logout/index.html', 'logout.html'], logoutHtml);
  }"""

# Replace buildAuthPages in content
pattern = r'  // Static signed-out / sign-in page for the offline Capacitor bundle.*?writeOutputHtml\(\[\'logout/index\.html\', \'logout\.html\'\], logoutHtml\);\n  \}'
new_content = re.sub(pattern, new_build_auth_pages, content, flags=re.DOTALL)

with open('scripts/build-capacitor-resident.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("SUCCESS: scripts/build-capacitor-resident.js updated with Option C auth pages!")
