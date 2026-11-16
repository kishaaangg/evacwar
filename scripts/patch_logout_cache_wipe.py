# -*- coding: utf-8 -*-
with open('scripts/build-capacitor-resident.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('\r\n', '\n')

# 1. In logoutHtml, wipe cached resident so next user login is 100% fresh
old_logout = """        localStorage.setItem('evacwar_logged_out', 'true');
        sessionStorage.clear();"""

new_logout = """        localStorage.setItem('evacwar_logged_out', 'true');
        localStorage.removeItem('evw_cached_resident');
        localStorage.removeItem('evw_cached_email');
        localStorage.removeItem('evw_cached_members');
        sessionStorage.clear();"""

if old_logout in c:
    c = c.replace(old_logout, new_logout)
    print("Patched logoutHtml in build-capacitor-resident.js")

# 2. In loginHtml, hide cachedOwnerBox by default and only show if evw_cached_resident exists
c = c.replace('<div id="cachedOwnerBox" class="cached-notice">', '<div id="cachedOwnerBox" class="cached-notice" style="display: none;">')

# 3. In loginHtml script, only show cachedOwnerBox if localStorage has resident
old_populate = """      const cachedEmail = (localStorage.getItem('evw_cached_email') || DEFAULT_EMAIL).toLowerCase();
      let cachedResident = null;
      try {
        cachedResident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
      } catch (_) {}

      const displayName = (cachedResident && (cachedResident.full_name || cachedResident.name)) || DEFAULT_NAME;
      if (ownerNameEl) ownerNameEl.textContent = displayName;
      if (ownerInitialEl) ownerInitialEl.textContent = displayName.charAt(0).toUpperCase();
      if (emailInput) emailInput.value = cachedEmail;"""

new_populate = """      let cachedResident = null;
      try {
        cachedResident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
      } catch (_) {}

      if (cachedResident && (cachedResident.full_name || cachedResident.name || cachedResident.first_name)) {
        const displayName = cachedResident.full_name || cachedResident.name || `${cachedResident.first_name || ''} ${cachedResident.last_name || ''}`.trim();
        if (ownerNameEl) ownerNameEl.textContent = displayName;
        if (ownerInitialEl) ownerInitialEl.textContent = displayName.charAt(0).toUpperCase();
        const cachedOwnerBox = document.getElementById('cachedOwnerBox');
        if (cachedOwnerBox) cachedOwnerBox.style.display = 'flex';
      }
      const cachedEmail = localStorage.getItem('evw_cached_email');
      if (emailInput && cachedEmail) emailInput.value = cachedEmail;"""

if old_populate in c:
    c = c.replace(old_populate, new_populate)
    print("Patched loginHtml cached resident populator")

with open('scripts/build-capacitor-resident.js', 'w', encoding='utf-8') as f:
    f.write(c)
print("Saved scripts/build-capacitor-resident.js successfully")
