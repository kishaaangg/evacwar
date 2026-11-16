/**
 * EvakWar (E-BAKWAR) — Capacitor Native & Offline Resident Bridge
 * Ensures the compiled views/resident/*.ejs pages inside Capacitor's WebView:
 *   1. Pre-seed IndexedDB (`window.EvakWarDB`) with San Rafael's 11 evacuation centers & GIS routes/hazards
 *   2. Route relative `/api/*` and `Socket.IO` requests to the active Barangay Hall Server (`http://192.168.0.102:8080`)
 *      with dynamic subnet probing across common local IP ranges.
 *   3. Intercept `/resident/*` navigation links and form submissions (Manage Profile, Personal Info,
 *      Vulnerabilities, Emergency Contacts, Household Members) so changes persist immediately in
 *      localStorage offline and sync smoothly to MySQL when online.
 *   4. Dynamically hydrate profile views, QR passes, and household member cards for ALL 82 resident database accounts.
 */
(function (global) {
  'use strict';

  const isCapacitorRuntime = Boolean(
    (global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform()) ||
    global.location.pathname.startsWith('/resident-mobile') ||
    global.location.hostname === 'localhost' ||
    global.location.protocol === 'capacitor:' ||
    global.location.protocol === 'file:'
  );

  // Default Barangay Hall Server (Cloud Render primary, local LAN fallbacks)
  const DEFAULT_HALL_SERVER = 'https://evacwar.onrender.com';
  const PROBE_CANDIDATES = [
    'https://evacwar.onrender.com',
    'https://evacwar-koyeb.onrender.com',
    'https://evakwar.onrender.com',
    'http://192.168.0.102:8080',
    'http://192.168.0.101:8080',
    'http://192.168.0.100:8080',
    'http://192.168.18.14:8080',
    'http://10.0.2.2:8080'
  ];

  function getHallServerUrl() {
    let resolved = DEFAULT_HALL_SERVER;
    try {
      const saved = localStorage.getItem('evw_server_url');
      if (saved && saved.startsWith('http') && !saved.includes('http://localhost/') && saved !== 'http://localhost') {
        resolved = saved.replace(/\/$/, '');
      }
    } catch (_) {}
    if (global.location.port === '8080' || (global.location.protocol.startsWith('http') && global.location.hostname !== 'localhost' && global.location.hostname !== '127.0.0.1' && !(global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform()))) {
      resolved = global.location.origin;
    }
    try {
      if (global.AndroidSettingsBridge && typeof global.AndroidSettingsBridge.setServerUrl === 'function') {
        global.AndroidSettingsBridge.setServerUrl(resolved);
      }
    } catch (_) {}
    return resolved;
  }

  // Active Server Probe: verifies reachability and auto-switches if IP changes
  async function probeAndSetServerUrl() {
    if (!navigator.onLine) return;
    const current = getHallServerUrl();
    const toCheck = [current, ...PROBE_CANDIDATES.filter(u => u !== current)];

    for (const url of toCheck) {
      try {
        const ctrl = new AbortController();
        const tId = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(url + '/api/centers/active', { method: 'GET', signal: ctrl.signal });
        clearTimeout(tId);
        if (res.ok) {
          try {
            localStorage.setItem('evw_server_url', url);
            if (global.AndroidSettingsBridge && typeof global.AndroidSettingsBridge.setServerUrl === 'function') {
              global.AndroidSettingsBridge.setServerUrl(url);
            }
          } catch (_) {}
          ensureLiveSocketConnected(url);
          return url;
        }
      } catch (_) {}
    }
    return current;
  }

  function ensureLiveSocketConnected(serverUrl) {
    if (!isCapacitorRuntime || typeof global.io !== 'function') return;
    try {
      const target = (serverUrl || getHallServerUrl()).replace(/\/$/, '');
      if (global.__appSocket && global.__appSocket.connected && global.__appSocket._evwTarget === target) {
        return;
      }
      if (global.__appSocket && global.__appSocket._evwTarget && global.__appSocket._evwTarget !== target) {
        try { global.__appSocket.disconnect(); } catch (_) {}
      }
      const sock = global.io(target, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 15,
        timeout: 5000
      });
      sock._evwTarget = target;
      global.__appSocket = sock;
      global.appSocket = sock;
      global.evakwarAlertSocket = sock;

      sock.on('emergency:alert', (data) => {
        if (typeof global.triggerEmergencyAlarm === 'function') {
          global.triggerEmergencyAlarm(data);
        }
      });
      sock.on('alert:broadcast', (data) => {
        if (data && data.title && typeof global.triggerEmergencyAlarm === 'function') {
          global.triggerEmergencyAlarm(data);
        }
      });
      sock.on('lora:chat', (msg) => {
        if (msg && msg.text) {
          try {
            const raw = localStorage.getItem('evw_lora_chat_messages');
            const list = raw ? JSON.parse(raw) : [];
            const idx = list.findIndex(m => String(m.msgId || m.id) === String(msg.msgId || msg.id));
            if (idx >= 0) {
              list[idx] = Object.assign(list[idx], msg);
            } else {
              list.push(msg);
            }
            localStorage.setItem('evw_lora_chat_messages', JSON.stringify(list.slice(-100)));
          } catch (_) {}
          try {
            global.dispatchEvent(new CustomEvent('evakwar:lora-chat', { detail: msg }));
          } catch (_) {}
        }
      });
    } catch (_) {}
  }

  // Real-time 2.5s HTTP Broadcast Alert Poller (Guarantees phone receives alerts on Wi-Fi even if WebSocket is blocked)
  let isPollingAlert = false;
  async function pollLatestBroadcastAlert() {
    if (!navigator.onLine || isPollingAlert) return;
    const p = global.location.pathname || '';
    if (/^\/(login|logout|admin)(\/|\.html|$)/.test(p)) return;

    isPollingAlert = true;
    try {
      const hallBase = getHallServerUrl();
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), 2200);
      const res = await fetch(`${hallBase}/api/lora/latest-alert`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: ctrl.signal
      });
      clearTimeout(tId);
      if (res.ok) {
        const data = await res.json();
        const alert = data && data.alert;
        if (alert && (alert.id || alert.alertId)) {
          const alertIdStr = String(alert.alertId || alert.id);
          let mutedList = [];
          try { mutedList = JSON.parse(localStorage.getItem('evw_muted_alert_ids') || '[]'); } catch (_) {}
          if (mutedList.includes(alertIdStr)) {
            // Already muted by resident, skip sounding alarm
            return;
          }

          const sentMs = alert.timestampMs || (alert.sent_at ? new Date(alert.sent_at).getTime() : 0);
          const ageMs = sentMs ? (Date.now() - sentMs) : 0;

          // If alert is fresh (broadcast within the last 15 minutes) and not yet presented this session
          if (global.__lastTriggeredAlertId !== alertIdStr && ageMs >= -60000 && ageMs < 15 * 60 * 1000) {
            global.__lastTriggeredAlertId = alertIdStr;
            if (typeof global.triggerEmergencyAlarm === 'function') {
              global.triggerEmergencyAlarm(alert);
            }
          }
        }
      }
    } catch (_) {
    } finally {
      isPollingAlert = false;
    }
  }

  if (isCapacitorRuntime) {
    if (!localStorage.getItem('evw_server_url') || localStorage.getItem('evw_server_url').startsWith('http://192.168.')) {
      try { localStorage.setItem('evw_server_url', DEFAULT_HALL_SERVER); } catch (_) {}
    }
    setTimeout(probeAndSetServerUrl, 300);
    setInterval(pollLatestBroadcastAlert, 2500);
    setTimeout(pollLatestBroadcastAlert, 1200);
  }

  // 0. Auth guard for the static bundle
  const isStaticBundle = isCapacitorRuntime && global.location.port !== '8080' && (global.location.hostname === 'localhost' || global.location.protocol === 'capacitor:' || global.location.protocol === 'file:');
  if (isStaticBundle) {
    const p = global.location.pathname;
    const onAuthPage = /^\/(login|logout|register)(\/|\.html|$)/.test(p);
    let loggedOut = false;
    try {
      const hasSession = Boolean(localStorage.getItem('evw_cached_resident') || localStorage.getItem('evw_cached_staff'));
      loggedOut = localStorage.getItem('evacwar_logged_out') === 'true' || !hasSession;
    } catch (_) {}
    if (loggedOut && !onAuthPage) {
      document.documentElement.style.display = 'none';
      global.location.replace('/login/index.html');
      return;
    }
    // If logged in and viewing login page, forward to active role dashboard
    if (!loggedOut && onAuthPage && p.includes('/login')) {
      const uRole = localStorage.getItem('evw_user_role') || '';
      if (uRole === 'rescuer') {
        global.location.replace('/rescuer/dashboard/index.html');
        return;
      } else if (uRole === 'staff') {
        global.location.replace('/staff/dashboard/index.html');
        return;
      }
    }
  }

  // 1. Pre-seed EvakWarDB (IndexedDB) with offline centers and GeoJSON routes/hazards
  function seedOfflineMapDatabase() {
    const centers = global.OFFLINE_CENTERS || [];
    const features = global.OFFLINE_FEATURES || { type: 'FeatureCollection', features: [] };
    if (centers.length === 0) return;

    const trySave = () => {
      if (global.EvakWarDB && typeof global.EvakWarDB.saveMapData === 'function') {
        global.EvakWarDB.saveMapData(centers, features).catch(() => {});
      }
    };

    trySave();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', trySave);
    } else {
      setTimeout(trySave, 300);
    }
  }
  seedOfflineMapDatabase();

  // 2. Dynamic Resident Profile & QR Hydrator
  function hydrateCachedResidentProfile() {
    let resident = null;
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
    } catch (_) {}
    if (!resident) return;

    if (resident.user_id || resident.id) {
      global.currentUserId = String(resident.user_id || resident.id);
    }
    const fullName = resident.full_name || resident.name || (resident.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : 'Resident');
    const firstName = resident.first_name || (fullName ? fullName.split(' ')[0] : 'Resident');
    const lastName = resident.last_name || '';
    const email = resident.email || localStorage.getItem('evw_cached_email') || '';
    const initial = (firstName || fullName || 'R').charAt(0).toUpperCase();
    const contact = resident.contact_number || '';
    const address = resident.home_address || '';
    const barangay = resident.barangay || 'San Rafael';
    const familySize = resident.family_size || 1;
    const uuid = resident.qr_code_uuid || `evw-resident-${resident.id || 1}`;

    // Text fields across headers, settings, and cards
    document.querySelectorAll('#residentUserGreetingName, .resident-first-name-display').forEach(el => {
      el.textContent = firstName;
    });
    document.querySelectorAll('.resident-name-display, #headerUserName, #profileFullName, #ownerName, .profile-hero-name, #displayFullName').forEach(el => {
      el.textContent = fullName;
    });
    document.querySelectorAll('#residentUserAvatarInitial, .resident-avatar-initial').forEach(el => {
      el.textContent = initial;
    });
    document.querySelectorAll('#profileEmailDisplay, #ownerEmail, #displayEmail').forEach(el => {
      el.textContent = email;
    });
    document.querySelectorAll('#profilePhoneDisplay, .resident-contact-display, #displayContact').forEach(el => {
      el.textContent = contact;
    });
    document.querySelectorAll('#profileAddressDisplay, .resident-address-display, #displayAddress').forEach(el => {
      el.textContent = address;
    });
    document.querySelectorAll('#profileBarangayDisplay, #displayBarangay').forEach(el => {
      el.textContent = barangay;
    });
    document.querySelectorAll('#profileFamilySizeDisplay, #displayFamilySize').forEach(el => {
      el.textContent = familySize;
    });
    document.querySelectorAll('#profilePassId, .resident-uuid-display').forEach(el => {
      el.textContent = uuid;
    });

    // Populate Settings / Edit Profile Form inputs if present on page
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };
    const setCheck = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(val);
    };

    setVal('first_name', resident.first_name);
    setVal('middle_name', resident.middle_name);
    setVal('last_name', resident.last_name);
    setVal('contact_number', resident.contact_number);
    setVal('email', email);
    setVal('family_size', resident.family_size);
    setVal('home_address', resident.home_address);
    setVal('barangay', resident.barangay);
    setVal('sex', resident.sex);
    setVal('age', resident.age);
    setVal('emergency_contact_name', resident.emergency_contact_name);
    setVal('emergency_contact_phone', resident.emergency_contact_phone);

    setCheck('is_4ps', resident.is_4ps);
    setCheck('is_pregnant', resident.is_pregnant);
    setCheck('is_lactating', resident.is_lactating);
    setCheck('is_pwd', resident.is_pwd);
    setCheck('is_single_head', resident.is_single_head);
    setCheck('has_serious_illness', resident.has_serious_illness);
    setVal('serious_illness_details', resident.serious_illness_details);

    // Dynamic QR Code Rendering for /resident/qr
    const qrImgs = document.querySelectorAll('img[alt*="QR Code"], img[alt*="Household QR"]');
    if (qrImgs.length > 0 && uuid) {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(uuid)}&color=1e3a8a`;
      qrImgs.forEach(img => {
        img.src = qrUrl;
      });
    }

    hydrateCachedMembersList();
  }

  // Dynamic Staff & Rescuer Profile Hydrator
  function hydrateCachedStaffProfile() {
    let staff = null;
    try {
      staff = JSON.parse(localStorage.getItem('evw_cached_staff') || 'null');
    } catch (_) {}
    if (!staff) return;

    if (staff.userId || staff.user_id || staff.id) {
      global.currentUserId = String(staff.userId || staff.user_id || staff.id);
    }
    const isRescuer = staff.staff_type === 'RESCUER';
    global.__evwRole = isRescuer ? 'rescuer' : 'staff';

    const fullName = staff.full_name || staff.name || (staff.first_name ? `${staff.first_name} ${staff.last_name || ''}`.trim() : (isRescuer ? 'Emergency Rescuer' : 'Evacuation Staff'));
    const firstName = staff.first_name || (fullName ? fullName.split(' ')[0] : 'Staff');
    const lastName = staff.last_name || '';
    const email = staff.email || localStorage.getItem('evw_cached_email') || '';
    const initial = (firstName || fullName || 'S').charAt(0).toUpperCase();
    const contact = staff.contact_number || '';
    const occupation = staff.occupation || (isRescuer ? 'Disaster Response Rescuer' : 'Evacuation Site Manager');
    const photo = staff.profile_photo;

    document.querySelectorAll('#staffUserGreetingName, .staff-first-name-display, #headerStaffName, #rescuerGreetingName, .rescuer-first-name-display').forEach(el => {
      el.textContent = firstName;
    });
    document.querySelectorAll('.staff-name-display, #headerUserName, #profileFullName, #ownerName, .profile-hero-name, #displayFullName, .rescuer-name-display').forEach(el => {
      el.textContent = fullName;
    });
    document.querySelectorAll('#staffUserAvatarInitial, .staff-avatar-initial, #rescuerAvatarInitial, .user-avatar-initial').forEach(el => {
      el.textContent = initial;
    });
    document.querySelectorAll('#profileEmailDisplay, #ownerEmail, #displayEmail, .staff-email-display, .rescuer-email-display').forEach(el => {
      el.textContent = email;
    });
    document.querySelectorAll('#profilePhoneDisplay, .staff-contact-display, #displayContact, .rescuer-contact-display').forEach(el => {
      el.textContent = contact;
    });
    document.querySelectorAll('#profileOccupationDisplay, .staff-occupation-display, #displayOccupation').forEach(el => {
      el.textContent = occupation;
    });

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined && val !== null) el.value = val;
    };
    setVal('first_name', staff.first_name);
    setVal('middle_name', staff.middle_name);
    setVal('last_name', staff.last_name);
    setVal('contact_number', staff.contact_number);
    setVal('email', email);
    setVal('occupation', occupation);

    if (photo) {
      const photoSrc = photo.startsWith('http') || photo.startsWith('data:') || photo.startsWith('/') ? photo : `/uploads/profiles/${photo}`;
      document.querySelectorAll('img.staff-avatar-img, img#headerAvatarImg, img.user-profile-img, img#rescuerAvatarImg').forEach(img => {
        img.src = photoSrc;
      });
    }
  }

  // 3. Dynamic Household Members List Hydrator for /resident/qr
  function hydrateCachedMembersList() {
    let members = [];
    try {
      members = JSON.parse(localStorage.getItem('evw_cached_members') || '[]');
    } catch (_) {}

    const membersCountEls = document.querySelectorAll('#membersCountDisplay, .members-count-badge');
    membersCountEls.forEach(el => {
      el.textContent = members.length;
    });

    const membersContainer = document.getElementById('membersListContainer');
    if (!membersContainer) return;

    if (members.length === 0) {
      membersContainer.innerHTML = `
        <div class="p-6 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <i class="ph ph-users text-3xl text-slate-400 mb-1"></i>
          <p class="text-xs font-bold text-slate-600">No additional family members registered yet.</p>
          <p class="text-[11px] text-slate-400 mt-0.5">Tap "+ Add Family Member" above to register dependents.</p>
        </div>
      `;
      return;
    }

    let html = '';
    members.forEach(member => {
      const mName = `${member.first_name || ''} ${member.middle_name ? member.middle_name + ' ' : ''}${member.last_name || ''}`.trim() || 'Family Member';
      const mRel = member.relation || 'Dependent';
      const mSex = member.sex || 'Male';
      const mAge = member.age !== null && member.age !== undefined ? `${member.age} yrs` : '';

      html += `
        <div class="bg-white rounded-2xl p-3 sm:p-4 shadow-xs border border-slate-200/80 flex flex-col gap-2 group hover:shadow-md transition-all">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-black flex items-center justify-center text-sm shrink-0 border border-blue-200">
                ${mSex === 'Female' ? '👩' : '👨'}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <h4 class="font-black text-slate-900 text-xs sm:text-sm tracking-tight truncate">${mName}</h4>
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">${mRel}</span>
                </div>
                <div class="text-[10px] text-slate-500 font-semibold mt-0.5">${mSex} ${mAge ? '• ' + mAge : ''}</div>
              </div>
            </div>
            <button type="button" onclick="window.deleteOfflineMember(${member.id || 0})" class="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center border border-rose-200 cursor-pointer active:scale-95" title="Remove Member">
              <i class="ph ph-trash text-sm"></i>
            </button>
          </div>
        </div>
      `;
    });
    membersContainer.innerHTML = html;
  }

  // 4. Offline & Online Form Submission Interceptor for Profile & Household Members
  function setupFormInterceptors() {
    document.addEventListener('submit', async (e) => {
      const form = e.target;
      if (!form || !form.action) return;

      const act = form.getAttribute('action') || '';

      // Intercept Resident Profile Updates (/resident/profile)
      if (act.includes('/resident/profile') || form.id === 'formEditProfile' || form.id === 'formEmergencyContact' || form.id === 'avatarUploadForm') {
        e.preventDefault();
        e.stopPropagation();

        const formData = new FormData(form);
        let resident = {};
        try {
          resident = JSON.parse(localStorage.getItem('evw_cached_resident') || '{}') || {};
        } catch (_) {}

        // Read form entries into resident object
        for (const [key, value] of formData.entries()) {
          if (key === '_csrf' || key === 'returnTo') continue;
          if (key === 'profile_photo' && value instanceof File && value.size > 0) {
            // Read as data URL for instant offline avatar preview
            try {
              const reader = new FileReader();
              reader.onload = (re) => {
                resident.profile_photo = re.target.result;
                localStorage.setItem('evw_cached_resident', JSON.stringify(resident));
                hydrateCachedResidentProfile();
              };
              reader.readAsDataURL(value);
            } catch (_) {}
          } else {
            resident[key] = value;
          }
        }

        // Recompute full name
        const fn = resident.first_name || '';
        const ln = resident.last_name || '';
        resident.name = `${fn} ${ln}`.trim() || resident.name || 'Resident';
        resident.full_name = resident.name;

        // Persist locally immediately
        try {
          localStorage.setItem('evw_cached_resident', JSON.stringify(resident));
          if (resident.email) localStorage.setItem('evw_cached_email', resident.email);
        } catch (_) {}

        hydrateCachedResidentProfile();

        // Close any active modal
        document.querySelectorAll('.modal, [id^="modal"]').forEach(m => {
          if (m.classList.contains('active') || !m.classList.contains('hidden')) {
            m.classList.add('hidden');
            m.classList.remove('active');
          }
        });

        // Show feedback toast
        if (typeof window.EvacWarToast === 'function') {
          window.EvacWarToast('✅ Profile details saved successfully!');
        } else {
          alert('Profile details saved successfully!');
        }

        // Sync to server if online
        if (navigator.onLine) {
          const hallBase = getHallServerUrl();
          formData.append('resident_id', resident.id || resident.resident_id || 0);
          formData.append('user_id', resident.user_id || 0);

          fetch(`${hallBase}/api/mobile/profile/update`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
          }).then(r => r.json()).then(data => {
            if (data && data.success && data.resident) {
              localStorage.setItem('evw_cached_resident', JSON.stringify(data.resident));
              hydrateCachedResidentProfile();
            }
          }).catch(err => console.warn('Background profile sync note:', err.message));
        }
        return false;
      }

      // Intercept Household Member Addition / Editing (/resident/qr/members)
      if (act.includes('/resident/qr/members') || form.id === 'memberForm') {
        e.preventDefault();
        e.stopPropagation();

        const formData = new FormData(form);
        let resident = {};
        let members = [];
        try {
          resident = JSON.parse(localStorage.getItem('evw_cached_resident') || '{}') || {};
          members = JSON.parse(localStorage.getItem('evw_cached_members') || '[]') || [];
        } catch (_) {}

        const newMember = {
          id: formData.get('id') ? Number(formData.get('id')) : Date.now(),
          resident_id: resident.id || 0,
          first_name: formData.get('first_name') || '',
          middle_name: formData.get('middle_name') || '',
          last_name: formData.get('last_name') || '',
          relation: formData.get('relation') || 'Dependent',
          sex: formData.get('sex') || 'Male',
          birthdate: formData.get('birthdate') || null,
          age: formData.get('age') ? Number(formData.get('age')) : null,
          is_pregnant: formData.get('is_pregnant') ? 1 : 0,
          is_lactating: formData.get('is_lactating') ? 1 : 0,
          is_pwd: formData.get('is_pwd') ? 1 : 0,
          has_serious_illness: formData.get('has_serious_illness') ? 1 : 0,
          serious_illness_details: formData.get('serious_illness_details') || ''
        };

        const existingIdx = members.findIndex(m => m.id === newMember.id);
        if (existingIdx !== -1) {
          members[existingIdx] = Object.assign(members[existingIdx], newMember);
        } else {
          members.push(newMember);
        }

        try {
          localStorage.setItem('evw_cached_members', JSON.stringify(members));
        } catch (_) {}

        hydrateCachedMembersList();

        // Close modal
        const addModal = document.getElementById('modalAddMember');
        if (addModal) {
          addModal.classList.add('hidden');
          addModal.classList.remove('flex');
        }

        if (typeof window.EvacWarToast === 'function') {
          window.EvacWarToast('✅ Family member saved successfully!');
        } else {
          alert('Family member saved successfully!');
        }

        // Sync to server if online
        if (navigator.onLine) {
          const hallBase = getHallServerUrl();
          formData.append('resident_id', resident.id || 0);
          fetch(`${hallBase}/api/mobile/members/save`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
          }).then(r => r.json()).then(data => {
            if (data && data.success && data.members) {
              localStorage.setItem('evw_cached_members', JSON.stringify(data.members));
              hydrateCachedMembersList();
            }
          }).catch(() => {});
        }
        return false;
      }
    }, true);
  }

  // Global helper for deleting offline member
  global.deleteOfflineMember = function (memberId) {
    if (!confirm('Are you sure you want to remove this family member?')) return;
    let resident = {};
    let members = [];
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || '{}') || {};
      members = JSON.parse(localStorage.getItem('evw_cached_members') || '[]') || [];
    } catch (_) {}

    members = members.filter(m => Number(m.id) !== Number(memberId));
    try {
      localStorage.setItem('evw_cached_members', JSON.stringify(members));
    } catch (_) {}

    hydrateCachedMembersList();

    if (navigator.onLine) {
      const hallBase = getHallServerUrl();
      fetch(`${hallBase}/api/mobile/members/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memberId, resident_id: resident.id || 0 }),
        credentials: 'include'
      }).catch(() => {});
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      hydrateCachedResidentProfile();
      hydrateCachedStaffProfile();
      setupFormInterceptors();
    });
  } else {
    hydrateCachedResidentProfile();
    hydrateCachedStaffProfile();
    setupFormInterceptors();
  }
  window.addEventListener('load', () => {
    hydrateCachedResidentProfile();
    hydrateCachedStaffProfile();
    setupFormInterceptors();
  });
  setTimeout(() => {
    hydrateCachedResidentProfile();
    hydrateCachedStaffProfile();
  }, 300);

  // 5. Patch fetch() in Capacitor so `/api/...`, `/staff/...`, and `/rescuer/...` route to Hall Server when online and return cached offline data when Wi-Fi is OFF
  if (isCapacitorRuntime && typeof global.fetch === 'function') {
    const origFetch = global.fetch;
    global.fetch = async function (resource, options = {}) {
      const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');

      // Session check has no server route inside the static bundle
      if (urlStr.startsWith('/auth/check') && global.location.port !== '8080') {
        let loggedOut = false;
        try { loggedOut = localStorage.getItem('evacwar_logged_out') === 'true'; } catch (_) {}
        return new Response(JSON.stringify({ authenticated: !loggedOut }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Intercept /api/centers/active when offline or in Capacitor
      if (urlStr.includes('/api/centers/active')) {
        if (!navigator.onLine && Array.isArray(global.OFFLINE_CENTERS)) {
          return new Response(JSON.stringify({ success: true, centers: global.OFFLINE_CENTERS }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Offline QR Scanner Lookup for Staff (100% Offline / Off-Grid)
      if ((urlStr.includes('/staff/qr/lookup') || urlStr.includes('/api/staff/qr/lookup')) && (!navigator.onLine || global.location.port !== '8080')) {
        let requestedCode = '';
        try {
          if (options && options.body) {
            const parsed = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
            requestedCode = String(parsed.code || parsed.uuid || parsed.qr || '').trim();
          }
        } catch (_) {}

        const residents = global.OFFLINE_RESIDENTS || [];
        const cleanReq = requestedCode.replace(/^evw-resident-/, '');
        const matched = residents.find(r =>
          String(r.qr_code_uuid || '') === requestedCode ||
          String(r.id) === requestedCode ||
          String(r.id) === cleanReq ||
          (r.qr_code_uuid && r.qr_code_uuid.includes(requestedCode))
        );

        if (matched) {
          return new Response(JSON.stringify({
            success: true,
            resident: matched,
            offline: true,
            message: 'Resident verified from offline records.'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Offline QR Checkin / Checkout for Staff
      if ((urlStr.includes('/staff/qr/checkin') || urlStr.includes('/staff/walkin/checkin') || urlStr.includes('/staff/checkout')) && (!navigator.onLine || global.location.port !== '8080')) {
        let payload = {};
        try {
          if (options && options.body) {
            payload = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
          }
        } catch (_) {}

        let offlineCheckins = [];
        try { offlineCheckins = JSON.parse(localStorage.getItem('evw_offline_checkins') || '[]'); } catch (_) {}
        offlineCheckins.push({
          action: urlStr.includes('checkout') ? 'CHECKOUT' : 'CHECKIN',
          payload: payload,
          timestamp: Date.now()
        });
        try { localStorage.setItem('evw_offline_checkins', JSON.stringify(offlineCheckins)); } catch (_) {}

        return new Response(JSON.stringify({
          success: true,
          offline: true,
          message: urlStr.includes('checkout')
            ? 'Resident checked out (Saved Offline).'
            : 'Resident checked in successfully! (Saved Offline)'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Offline Roster for Staff
      if ((urlStr.includes('/staff/offline/roster') || urlStr.includes('/api/offline/roster')) && (!navigator.onLine || global.location.port !== '8080')) {
        return new Response(JSON.stringify({
          success: true,
          roster: global.OFFLINE_RESIDENTS || []
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Intercept /api/sos/resident/active when offline
      if (urlStr.includes('/api/sos/resident/active') && !navigator.onLine) {
        return new Response(JSON.stringify({ success: true, activeSos: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Intercept /api/notifications when offline
      if (urlStr.includes('/api/notifications') && !navigator.onLine) {
        let loraNotifs = [];
        try {
          loraNotifs = JSON.parse(localStorage.getItem('Evacwar_lora_notifications') || '[]');
        } catch (_) {}
        return new Response(JSON.stringify({ success: true, notifications: loraNotifs }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Intercept /api/lora/chat when offline or server unreachable
      if (urlStr.includes('/api/lora/chat')) {
        if (!navigator.onLine) {
          if (options && options.method && options.method.toUpperCase() === 'POST') {
            try {
              const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
              const raw = localStorage.getItem('evw_lora_chat_messages');
              const list = raw ? JSON.parse(raw) : [];
              const pendingMsg = {
                id: body.msgId || String(Date.now()),
                msgId: body.msgId || String(Date.now()),
                seq: null,
                senderRole: body.senderRole || 'Resident',
                senderName: body.senderName || 'Resident',
                nodeId: body.nodeId || '!f4e213d4',
                text: body.text || '',
                timestamp: Date.now(),
                sent_at: new Date().toISOString(),
                transport: 'LORA_433MHZ',
                status: 'pending'
              };
              list.push(pendingMsg);
              localStorage.setItem('evw_lora_chat_messages', JSON.stringify(list.slice(-100)));
              return new Response(JSON.stringify({ success: true, chatMessage: pendingMsg, offline: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            } catch (_) {}
          }
          let msgs = [];
          try {
            msgs = JSON.parse(localStorage.getItem('evw_lora_chat_messages') || '[]');
          } catch (_) {}
          return new Response(JSON.stringify({ success: true, messages: msgs, offline: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // If running inside Capacitor native WebView, rewrite `/api/...`, `/staff/...`, and `/rescuer/...` to Hall Server
      if ((urlStr.startsWith('/api/') || urlStr.startsWith('/staff/') || urlStr.startsWith('/rescuer/')) && global.location.port !== '8080') {
        const hallBase = getHallServerUrl();
        try {
          return await origFetch.call(global, hallBase + urlStr, Object.assign({ credentials: 'include' }, options));
        } catch (err) {
          if (urlStr.includes('/api/centers/active') && Array.isArray(global.OFFLINE_CENTERS)) {
            return new Response(JSON.stringify({ success: true, centers: global.OFFLINE_CENTERS }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          throw err;
        }
      }

      return origFetch.call(global, resource, options);
    };
  }

  // 6. Patch io() in Capacitor so Socket.IO connects to the Barangay Hall Server when on LAN Wi-Fi
  document.addEventListener('DOMContentLoaded', () => {
    if (isCapacitorRuntime && global.location.port !== '8080' && typeof global.io === 'function') {
      const origIo = global.io;
      global.io = function (uri, opts) {
        if (!uri || typeof uri === 'object') {
          return origIo(getHallServerUrl(), Object.assign({ reconnectionAttempts: 5, timeout: 4000 }, uri || {}));
        }
        return origIo(uri, opts);
      };
    }
  });

    // 7b. Global programmatic navigation helper for Android native notifications & intents
  global.navigateToEvakWar = function (rawHref) {
    if (!rawHref) return;
    const isPreviewPrefix = global.location.pathname.startsWith('/resident-mobile');
    const prefix = isPreviewPrefix ? '/resident-mobile' : '';
    const cleanHref = rawHref.split('?')[0].split('#')[0];
    const queryOrHash = rawHref.slice(cleanHref.length);

    let targetPath = null;
    if (cleanHref.includes('/chat')) {
      targetPath = `${prefix}/resident/chat/index.html`;
    } else if (cleanHref.includes('/sos')) {
      targetPath = `${prefix}/resident/sos/index.html`;
    } else if (cleanHref.includes('/evacuation') || cleanHref.includes('/map')) {
      targetPath = `${prefix}/resident/evacuation/index.html`;
    } else if (cleanHref.includes('/dashboard')) {
      targetPath = `${prefix}/resident/dashboard/index.html`;
    }

    if (targetPath) {
      global.location.href = targetPath + queryOrHash;
    } else {
      global.location.href = rawHref;
    }
  };

  // 7. Intercept navigation links when running inside Capacitor
  document.addEventListener('click', (e) => {
    const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    const rawHref = link.getAttribute('href');
    if (!rawHref) return;

    const isPreviewPrefix = global.location.pathname.startsWith('/resident-mobile');
    const isCapacitorOrLocal = Boolean(
      isPreviewPrefix ||
      global.location.hostname === 'localhost' ||
      global.location.protocol === 'capacitor:' ||
      global.location.protocol === 'file:' ||
      (global.Capacitor && typeof global.Capacitor.isNativePlatform === 'function' && global.Capacitor.isNativePlatform())
    );

    if (!isCapacitorOrLocal) return;

    const prefix = isPreviewPrefix ? '/resident-mobile' : '';
    let targetPath = null;

    const cleanHref = rawHref.split('?')[0].split('#')[0];
    const queryOrHash = rawHref.slice(cleanHref.length);

    if (cleanHref === '/logout' || cleanHref === '/logout/') {
      targetPath = `${prefix}/logout/index.html`;
    } else if (cleanHref === '/login' || cleanHref === '/login/') {
      targetPath = `${prefix}/login/index.html`;
    } else if (cleanHref === '/resident' || cleanHref === '/resident/' || cleanHref === '/resident/dashboard' || cleanHref === '/resident/dashboard/' || cleanHref === '/') {
      targetPath = `${prefix}/resident/dashboard/index.html`;
    } else if (cleanHref.startsWith('/resident/evacuation') || cleanHref.startsWith('/map')) {
      targetPath = `${prefix}/resident/evacuation/index.html`;
    } else if (cleanHref.startsWith('/resident/sos') || cleanHref.startsWith('/sos')) {
      targetPath = `${prefix}/resident/sos/index.html`;
    } else if (cleanHref.startsWith('/resident/typhoon')) {
      targetPath = `${prefix}/resident/typhoon/index.html`;
    } else if (cleanHref.startsWith('/resident/chat')) {
      targetPath = `${prefix}/resident/chat/index.html`;
    } else if (cleanHref.startsWith('/resident/qr') || cleanHref.startsWith('/resident/scan')) {
      targetPath = `${prefix}/resident/qr/index.html`;
    } else if (cleanHref.startsWith('/resident/profile') || cleanHref.startsWith('/resident/settings')) {
      targetPath = `${prefix}/resident/profile/index.html`;
    } else if (cleanHref === '/staff' || cleanHref === '/staff/' || cleanHref === '/staff/dashboard' || cleanHref === '/staff/dashboard/') {
      targetPath = `${prefix}/staff/dashboard/index.html`;
    } else if (cleanHref.startsWith('/staff/qr') || cleanHref.startsWith('/staff/scan')) {
      targetPath = `${prefix}/staff/qr-scanner/index.html`;
    } else if (cleanHref.startsWith('/staff/map')) {
      targetPath = `${prefix}/staff/map/index.html`;
    } else if (cleanHref.startsWith('/staff/chat')) {
      targetPath = `${prefix}/staff/chat/index.html`;
    } else if (cleanHref.startsWith('/staff/reports')) {
      targetPath = `${prefix}/staff/reports/index.html`;
    } else if (cleanHref.startsWith('/staff/typhoon')) {
      targetPath = `${prefix}/staff/typhoon/index.html`;
    } else if (cleanHref.startsWith('/staff/profile') || cleanHref.startsWith('/staff/settings')) {
      targetPath = `${prefix}/staff/settings/index.html`;
    } else if (cleanHref === '/rescuer' || cleanHref === '/rescuer/' || cleanHref === '/rescuer/dashboard' || cleanHref === '/rescuer/dashboard/') {
      targetPath = `${prefix}/rescuer/dashboard/index.html`;
    } else if (cleanHref.startsWith('/rescuer/map')) {
      targetPath = `${prefix}/rescuer/map/index.html`;
    } else if (cleanHref.startsWith('/rescuer/chat')) {
      targetPath = `${prefix}/rescuer/chat/index.html`;
    } else if (cleanHref.startsWith('/rescuer/reports')) {
      targetPath = `${prefix}/rescuer/reports/index.html`;
    } else if (cleanHref.startsWith('/rescuer/typhoon')) {
      targetPath = `${prefix}/rescuer/typhoon/index.html`;
    } else if (cleanHref.startsWith('/rescuer/profile') || cleanHref.startsWith('/rescuer/settings')) {
      targetPath = `${prefix}/rescuer/settings/index.html`;
    }

    if (targetPath) {
      e.preventDefault();
      e.stopPropagation();
      global.location.href = targetPath + queryOrHash;
    }
  }, true);

  // 8. Auto-request Location permissions and prompt to enable GPS on app startup via in-app dialog
  function checkAndPromptLocationOnStartup() {
    try {
      if (global.AndroidSettingsBridge && typeof global.AndroidSettingsBridge.isLocationEnabled === 'function') {
        if (!global.AndroidSettingsBridge.isLocationEnabled()) {
          setTimeout(() => {
            try {
              if (global.AndroidSettingsBridge && !global.AndroidSettingsBridge.isLocationEnabled()) {
                if (typeof global.AndroidSettingsBridge.requestEnableLocationDialog === 'function') {
                  global.AndroidSettingsBridge.requestEnableLocationDialog();
                }
              }
            } catch (_) {}
          }, 800);
          return;
        }
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            try {
              if (pos && pos.coords) {
                const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
                localStorage.setItem('evw_last_gps', JSON.stringify({ lat, lng, acc: Math.round(acc || 15), ts: Date.now() }));
              }
            } catch (_) {}
          },
          () => {},
          { enableHighAccuracy: true, timeout: 6000, maximumAge: 30000 }
        );
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAndPromptLocationOnStartup);
  } else {
    checkAndPromptLocationOnStartup();
  }
})(window);
