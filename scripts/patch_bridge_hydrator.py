with open('public/js/capacitor-resident-bridge.js', 'r', encoding='utf-8') as f:
    c = f.read()

target = "  seedOfflineMapDatabase();"
hydration_code = """  // 1b. Dynamic resident profile hydrator: syncs active resident name across headers & passes
  function hydrateCachedResidentProfile() {
    let resident = null;
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
    } catch (_) {}
    if (!resident) return;

    if (resident.user_id || resident.id) {
      global.currentUserId = String(resident.user_id || resident.id);
    }
    const fullName = resident.full_name || resident.name || (resident.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : null);
    if (fullName) {
      document.querySelectorAll('.resident-name-display, #headerUserName, #profileFullName').forEach(el => {
        el.textContent = fullName;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateCachedResidentProfile);
  } else {
    hydrateCachedResidentProfile();
  }
"""

if target in c:
    c = c.replace(target, target + "\n" + hydration_code, 1)
    with open('public/js/capacitor-resident-bridge.js', 'w', encoding='utf-8') as f:
        f.write(c)
    print("SUCCESS: capacitor-resident-bridge.js updated with profile hydrator")
else:
    print("ERROR: target not found")
