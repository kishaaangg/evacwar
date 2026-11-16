path = r"public/js/capacitor-resident-bridge.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

target = """  function hydrateCachedResidentProfile() {
    let resident = null;
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
    } catch (_) {}
    if (!resident) return;

    if (resident.user_id || resident.id) {
      global.currentUserId = String(resident.user_id || resident.id);
    }
    const fullName = resident.full_name || resident.name || (resident.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : null);
    const firstName = resident.first_name || (fullName ? fullName.split(' ')[0] : 'Resident');
    const email = resident.email || localStorage.getItem('evw_cached_email') || '';

    if (firstName) {
      document.querySelectorAll('#residentUserGreetingName, .resident-first-name-display').forEach(el => {
        el.textContent = firstName;
      });
    }
    if (fullName) {
      document.querySelectorAll('.resident-name-display, #headerUserName, #profileFullName, #ownerName, .profile-hero-name').forEach(el => {
        el.textContent = fullName;
      });
    }
    if (email) {
      document.querySelectorAll('#profileEmailDisplay, #ownerEmail').forEach(el => {
        el.textContent = email;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateCachedResidentProfile);
  } else {
    hydrateCachedResidentProfile();
  }"""

replacement = """  function hydrateCachedResidentProfile() {
    let resident = null;
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
    } catch (_) {}
    if (!resident) return;

    if (resident.user_id || resident.id) {
      global.currentUserId = String(resident.user_id || resident.id);
    }
    const fullName = resident.full_name || resident.name || (resident.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : null);
    const firstName = resident.first_name || (fullName ? fullName.split(' ')[0] : 'Resident');
    const email = resident.email || localStorage.getItem('evw_cached_email') || '';
    const initial = (firstName || fullName || 'R').charAt(0).toUpperCase();

    if (firstName) {
      document.querySelectorAll('#residentUserGreetingName, .resident-first-name-display').forEach(el => {
        el.textContent = firstName;
      });
    }
    if (fullName) {
      document.querySelectorAll('.resident-name-display, #headerUserName, #profileFullName, #ownerName, .profile-hero-name').forEach(el => {
        el.textContent = fullName;
      });
    }
    if (initial) {
      document.querySelectorAll('#residentUserAvatarInitial, .resident-avatar-initial').forEach(el => {
        el.textContent = initial;
      });
    }
    if (email) {
      document.querySelectorAll('#profileEmailDisplay, #ownerEmail').forEach(el => {
        el.textContent = email;
      });
    }
    const contact = resident.contact_number || '';
    if (contact) {
      document.querySelectorAll('#profilePhoneDisplay, .resident-contact-display').forEach(el => {
        el.textContent = contact;
      });
    }
    const addr = resident.home_address || '';
    if (addr) {
      document.querySelectorAll('#profileAddressDisplay, .resident-address-display').forEach(el => {
        el.textContent = addr;
      });
    }
    const uuid = resident.qr_code_uuid || '';
    if (uuid) {
      document.querySelectorAll('#profilePassId, .resident-uuid-display').forEach(el => {
        el.textContent = uuid;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateCachedResidentProfile);
  } else {
    hydrateCachedResidentProfile();
  }
  window.addEventListener('load', hydrateCachedResidentProfile);
  setTimeout(hydrateCachedResidentProfile, 300);"""

if target in content:
    content = content.replace(target, replacement)
    print("Replaced hydrateCachedResidentProfile successfully.")
else:
    # Try CRLF
    target_crlf = target.replace('\n', '\r\n')
    if target_crlf in content:
        content = content.replace(target_crlf, replacement.replace('\n', '\r\n'))
        print("Replaced hydrateCachedResidentProfile (CRLF) successfully.")
    else:
        print("Could not find target in capacitor-resident-bridge.js")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
