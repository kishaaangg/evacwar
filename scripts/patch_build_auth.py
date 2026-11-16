path = r"scripts/build-capacitor-resident.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace the MySQL query that was fetching Leo Bisenio
old_db_block = """    // Fetch a real approved resident profile from DB (e.g., ID 87 or latest approved resident)
    const [resRows] = await db.execute(`
      SELECT r.*, u.email, u.role
      FROM residents r
      LEFT JOIN users u ON r.user_id = u.id
      ORDER BY (r.qr_code_uuid IS NOT NULL) DESC, r.id DESC
      LIMIT 1
    `).catch(() => [[]]);

    if (resRows && resRows[0]) {
      resident = resRows[0];
      userRow = {
        id: resident.user_id || 1,
        email: resident.email || 'resident@sanrafael.gov.ph',
        role: 'resident'
      };
      members = await HouseholdMember.findByResidentId(resident.id).catch(() => []);
    }
  } catch (err) {
    console.warn('[Build Capacitor Resident] DB fetch warning (using fallback data):', err.message);
  }

  if (!resident) {
    resident = {
      id: 87,
      user_id: 1,
      first_name: 'Juan',
      middle_name: '',
      last_name: 'Dela Cruz',
      contact_number: '09171234567',
      home_address: 'Zone 1, San Rafael',
      barangay: 'San Rafael',
      sex: 'Male',
      age: 34,
      vulnerability: 'None',
      family_size: 1,
      approval_status: 'APPROVED',
      qr_code_uuid: 'evw-san-rafael-resident-87',
      profile_photo: null
    };
  }"""

new_db_block = """    // Neutral placeholder data for static compilation so no specific resident identity is pre-baked
    resident = {
      id: 0,
      user_id: 0,
      first_name: 'Resident',
      middle_name: '',
      last_name: '',
      contact_number: '',
      home_address: 'Barangay San Rafael',
      barangay: 'San Rafael',
      sex: 'Resident',
      age: 0,
      vulnerability: 'None',
      family_size: 1,
      approval_status: 'APPROVED',
      qr_code_uuid: 'evw-san-rafael-resident',
      profile_photo: null
    };
    userRow = {
      id: 0,
      email: '',
      role: 'resident'
    };
    members = [];
  } catch (err) {
    console.warn('[Build Capacitor Resident] DB fetch warning (using fallback data):', err.message);
  }

  if (!resident) {
    resident = {
      id: 0,
      user_id: 0,
      first_name: 'Resident',
      middle_name: '',
      last_name: '',
      contact_number: '',
      home_address: 'Barangay San Rafael',
      barangay: 'San Rafael',
      sex: 'Resident',
      age: 0,
      vulnerability: 'None',
      family_size: 1,
      approval_status: 'APPROVED',
      qr_code_uuid: 'evw-san-rafael-resident',
      profile_photo: null
    };
  }"""

if old_db_block in content:
    content = content.replace(old_db_block, new_db_block)
    print("Replaced DB resident block successfully.")
else:
    old_db_crlf = old_db_block.replace('\n', '\r\n')
    if old_db_crlf in content:
        content = content.replace(old_db_crlf, new_db_block.replace('\n', '\r\n'))
        print("Replaced DB resident block (CRLF) successfully.")
    else:
        print("Warning: old_db_block not found!")

# 2. Fix the duplicate event listeners in buildAuthPages
old_listeners = """      const toggleBtn = document.getElementById('toggleServerSettingsBtn');
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
          let newUrl = serverUrlInput.value.trim().replace(new RegExp('/+$'), '');
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

new_listeners = """      const serverUrlInput = document.getElementById('serverUrlInput');
      if (serverUrlInput) {
        serverUrlInput.value = getHallBaseUrl();
      }"""

if old_listeners in content:
    content = content.replace(old_listeners, new_listeners)
    print("Cleaned up duplicate event listeners on login screen successfully.")
else:
    old_listeners_crlf = old_listeners.replace('\n', '\r\n')
    if old_listeners_crlf in content:
        content = content.replace(old_listeners_crlf, new_listeners.replace('\n', '\r\n'))
        print("Cleaned up duplicate event listeners (CRLF) successfully.")
    else:
        print("Warning: old_listeners not found!")

# 3. Update offline login error message so it is polite and clear
old_offline_msg = "showError('Offline mode is currently configured for ' + storedEmail + '. Connect to Wi-Fi to sign in with a different account.');"
new_offline_msg = "showError('This account is not cached for offline access yet. Connect to Wi-Fi to sign in.');"
if old_offline_msg in content:
    content = content.replace(old_offline_msg, new_offline_msg)
    print("Updated offline error message successfully.")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated build-capacitor-resident.js.")
