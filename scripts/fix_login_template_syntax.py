# -*- coding: utf-8 -*-
"""
Fix the template literal unescaped regex in scripts/build-capacitor-resident.js:
Replace `replace(/\/$/, '')` with `replace(new RegExp('/+$'), '')`.
Also add direct onclick handler to toggleServerSettingsBtn and saveServerUrlBtn.
"""

def patch_builder():
    p = 'scripts/build-capacitor-resident.js'
    with open(p, 'r', encoding='utf-8') as f:
        c = f.read()

    c = c.replace('\r\n', '\n')

    # Replace the mangled regexes
    c = c.replace("return saved.replace(/\/$/, '');", "return saved.replace(new RegExp('/+$'), '');")
    c = c.replace("let newUrl = serverUrlInput.value.trim().replace(/\/$/, '');", "let newUrl = serverUrlInput.value.trim().replace(new RegExp('/+$'), '');")
    c = c.replace("var base = (localStorage.getItem('evw_server_url') || '').replace(/\/$/, '');", "var base = (localStorage.getItem('evw_server_url') || '').replace(new RegExp('/+$'), '');")

    # Add inline onclick to toggle button & save button
    old_btn = 'id="toggleServerSettingsBtn" style="'
    new_btn = 'id="toggleServerSettingsBtn" onclick="window.toggleServerSettings && window.toggleServerSettings()" style="'
    if old_btn in c and 'onclick="window.toggleServerSettings' not in c:
        c = c.replace(old_btn, new_btn)

    old_save_btn = 'id="saveServerUrlBtn" style="'
    new_save_btn = 'id="saveServerUrlBtn" onclick="window.saveServerUrl && window.saveServerUrl()" style="'
    if old_save_btn in c and 'onclick="window.saveServerUrl' not in c:
        c = c.replace(old_save_btn, new_save_btn)

    # Expose toggleServerSettings & saveServerUrl to window inside the script
    hook_marker = "const toggleBtn = document.getElementById('toggleServerSettingsBtn');"
    functions_to_add = """      window.toggleServerSettings = function () {
        const p = document.getElementById('serverSettingsPanel');
        const inp = document.getElementById('serverUrlInput');
        if (!p) return;
        const isHidden = (p.style.display === 'none' || !p.style.display);
        p.style.display = isHidden ? 'block' : 'none';
        if (isHidden && inp) inp.focus();
      };

      window.saveServerUrl = async function () {
        const inp = document.getElementById('serverUrlInput');
        const stat = document.getElementById('serverUrlStatus');
        const p = document.getElementById('serverSettingsPanel');
        if (!inp) return;
        let newUrl = inp.value.trim().replace(new RegExp('/+$'), '');
        if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
          newUrl = 'http://' + newUrl;
          inp.value = newUrl;
        }
        try {
          localStorage.setItem('evw_server_url', newUrl);
          if (stat) {
            stat.textContent = 'Testing connection to ' + newUrl + '...';
            stat.style.color = '#2563eb';
          }
          await checkServerStatus();
          if (stat) {
            stat.textContent = 'Saved! Server URL updated.';
            stat.style.color = '#16a34a';
            setTimeout(() => { if (p) p.style.display = 'none'; }, 1500);
          }
        } catch (e) {
          if (stat) {
            stat.textContent = 'Saved to localStorage.';
            stat.style.color = '#16a34a';
          }
        }
      };

      const toggleBtn = document.getElementById('toggleServerSettingsBtn');"""

    if hook_marker in c and 'window.toggleServerSettings = function' not in c:
        c = c.replace(hook_marker, functions_to_add)

    with open(p, 'w', encoding='utf-8') as f:
        f.write(c)
    print("Patched build-capacitor-resident.js syntax and handlers")

if __name__ == '__main__':
    patch_builder()
