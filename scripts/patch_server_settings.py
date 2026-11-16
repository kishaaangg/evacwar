import re

with open('scripts/build-capacitor-resident.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Locate the server settings section to add before </form> or after
old_footer = """    <div style="margin-top: 18px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">
      <span>Option C: Server Auth + Salted SHA-256 Offline Fallback</span>
    </div>"""

new_footer = """    <!-- Cloud Hosting & Server Endpoint Config Toggle -->
    <div style="margin-top: 16px; border-top: 1px solid #f1f5f9; pt-3;">
      <div style="text-align: center;">
        <button type="button" id="toggleServerSettingsBtn" style="background: none; border: none; color: #64748b; font-size: 11.5px; font-weight: 700; cursor: pointer; padding: 6px 10px; display: inline-flex; align-items: center; gap: 4px;">
          <span>&#9881; Server / Hosting Settings</span>
        </button>
      </div>

      <div id="serverSettingsPanel" style="display: none; margin-top: 8px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; text-align: left;">
        <label for="serverUrlInput" style="display: block; font-size: 10.5px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Barangay Hall / Cloud Hosting URL</label>
        <div style="display: flex; gap: 6px;">
          <input type="url" id="serverUrlInput" class="text-input" style="padding: 8px 10px; font-size: 12px;" placeholder="https://your-domain.railway.app">
          <button type="button" id="saveServerUrlBtn" style="background: #0f172a; color: #ffffff; border: none; border-radius: 10px; padding: 0 14px; font-size: 11.5px; font-weight: 800; cursor: pointer; shrink: 0;">Save</button>
        </div>
        <div id="serverUrlStatus" style="font-size: 11px; font-weight: 600; margin-top: 6px; color: #64748b;"></div>
      </div>
    </div>

    <div style="margin-top: 14px; text-align: center; font-size: 10.5px; color: #94a3b8; font-weight: 600;">
      <span>EvakWar v2.4 &bull; Dual-Mode (Cloud Hosting + 433.875 MHz LoRa)</span>
    </div>"""

old_js_init = """      checkServerStatus();
      window.addEventListener('online', checkServerStatus);
      window.addEventListener('offline', setOfflineUi);"""

new_js_init = """      checkServerStatus();
      window.addEventListener('online', checkServerStatus);
      window.addEventListener('offline', setOfflineUi);

      // Server URL Settings Toggle & Save Handler
      const toggleBtn = document.getElementById('toggleServerSettingsBtn');
      const panel = document.getElementById('serverSettingsPanel');
      const serverUrlInput = document.getElementById('serverUrlInput');
      const saveServerUrlBtn = document.getElementById('saveServerUrlBtn');
      const serverUrlStatus = document.getElementById('serverUrlStatus');

      if (serverUrlInput) {
        serverUrlInput.value = getHallBaseUrl();
      }

      if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
          const isHidden = panel.style.display === 'none';
          panel.style.display = isHidden ? 'block' : 'none';
          if (isHidden && serverUrlInput) serverUrlInput.focus();
        });
      }

      if (saveServerUrlBtn && serverUrlInput) {
        saveServerUrlBtn.addEventListener('click', async () => {
          let newUrl = serverUrlInput.value.trim().replace(/\\/$/, '');
          if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
            newUrl = 'https://' + newUrl;
            serverUrlInput.value = newUrl;
          }
          try {
            localStorage.setItem('evw_server_url', newUrl);
            if (serverUrlStatus) {
              serverUrlStatus.textContent = 'Testing connection to ' + newUrl + '...';
              serverUrlStatus.style.color = '#2563eb';
            }
            await checkServerStatus();
            if (serverUrlStatus) {
              serverUrlStatus.textContent = 'Saved! Server URL updated.';
              serverUrlStatus.style.color = '#16a34a';
              setTimeout(() => { panel.style.display = 'none'; }, 1500);
            }
          } catch (e) {
            if (serverUrlStatus) {
              serverUrlStatus.textContent = 'Saved to localStorage.';
              serverUrlStatus.style.color = '#16a34a';
            }
          }
        });
      }"""

norm_content = content.replace('\r\n', '\n')
norm_content = norm_content.replace(old_footer.replace('\r\n', '\n'), new_footer.replace('\r\n', '\n'))
norm_content = norm_content.replace(old_js_init.replace('\r\n', '\n'), new_js_init.replace('\r\n', '\n'))

with open('scripts/build-capacitor-resident.js', 'w', encoding='utf-8') as f:
    f.write(norm_content)

print("SUCCESS: scripts/build-capacitor-resident.js patched with Server Settings UI!")
