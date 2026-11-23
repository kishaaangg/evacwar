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
  const nativeFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;

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

  function getMobileSocketAuth() {
    try {
      const p = global.location.pathname || '';
      const isStaffOrRescuerPage = p.includes('/staff') || p.includes('/rescuer');
      const rawStaff = localStorage.getItem('evw_cached_staff');
      const rawRes = localStorage.getItem('evw_cached_resident');
      const u = isStaffOrRescuerPage
        ? (rawStaff ? JSON.parse(rawStaff) : (rawRes ? JSON.parse(rawRes) : null))
        : (rawRes ? JSON.parse(rawRes) : (rawStaff ? JSON.parse(rawStaff) : null));
      if (!u) return {};
      const userId = u.user_id || u.userId || u.id || null;
      const role = u.role || (u.staff_type ? 'staff' : 'resident');
      const residentId = u.resident_id || (role === 'resident' ? u.id : null);
      const staffType = u.staff_type || '';
      const userName = u.full_name || u.name || (u.first_name ? `${u.first_name} ${u.last_name || ''}`.trim() : '');
      return { userId, role, residentId, staffType, userName };
    } catch (_) {
      return {};
    }
  }

  function getMobileAuthHeaders() {
    const auth = getMobileSocketAuth();
    const hdrs = {};
    if (auth.userId) hdrs['X-Evakwar-Mobile-User-Id'] = String(auth.userId);
    if (auth.role) hdrs['X-Evakwar-Mobile-Role'] = String(auth.role);
    if (auth.residentId) hdrs['X-Evakwar-Mobile-Resident-Id'] = String(auth.residentId);
    if (auth.staffType) hdrs['X-Evakwar-Mobile-Staff-Type'] = String(auth.staffType);
    if (auth.userName) hdrs['X-Evakwar-Mobile-Name'] = String(auth.userName);
    return hdrs;
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
        timeout: 5000,
        auth: getMobileSocketAuth()
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
    if (/\/(login|logout|register|admin)(\/|\.html|$)/.test(p)) return;

    isPollingAlert = true;
    try {
      const hallBase = getHallServerUrl();
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), 2800);
      const res = await fetch(`${hallBase}/api/lora/latest-alert`, {
        method: 'GET',
        headers: Object.assign({ 'Accept': 'application/json' }, getMobileAuthHeaders()),
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

          // Compare server timestamp against serverNowMs so mismatched phone clocks never block alerts
          const refNowMs = Number(data.serverNowMs) || Date.now();
          const sentMs = Number(alert.timestampMs) || (alert.sent_at ? new Date(alert.sent_at).getTime() : refNowMs);
          const ageMs = (sentMs && !isNaN(sentMs)) ? (refNowMs - sentMs) : 0;

          // Trigger if broadcast within the last 30 minutes on server clock and not yet presented
          if (global.__lastTriggeredAlertId !== alertIdStr && ageMs >= -120000 && ageMs < 30 * 60 * 1000) {
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
    try {
      const savedUrl = localStorage.getItem('evw_server_url') || '';
      if (!savedUrl || savedUrl.startsWith('http://192.168.') || savedUrl.startsWith('http://10.')) {
        localStorage.setItem('evw_server_url', DEFAULT_HALL_SERVER);
      }
    } catch (_) {}
    setTimeout(probeAndSetServerUrl, 300);
    setInterval(pollLatestBroadcastAlert, 2500);
    setTimeout(pollLatestBroadcastAlert, 1200);
  }

  // 0. Auth guard for the static bundle (Capacitor APK or /resident-mobile iOS Web App)
  const isMobileWebPrefix = global.location.pathname.startsWith('/resident-mobile');
  const mobileBasePrefix = isMobileWebPrefix ? '/resident-mobile' : '';
  const isStaticBundle = isMobileWebPrefix || (isCapacitorRuntime && global.location.port !== '8080' && (global.location.hostname === 'localhost' || global.location.protocol === 'capacitor:' || global.location.protocol === 'file:'));
  if (isStaticBundle) {
    const p = global.location.pathname;
    const onAuthPage = /\/(login|logout|register)(\/|\.html|$)/.test(p);
    let loggedOut = false;
    try {
      const hasSession = Boolean(localStorage.getItem('evw_cached_resident') || localStorage.getItem('evw_cached_staff'));
      loggedOut = localStorage.getItem('evacwar_logged_out') === 'true' || !hasSession;
    } catch (_) {}
    if (loggedOut && !onAuthPage) {
      document.documentElement.style.display = 'none';
      global.location.replace(mobileBasePrefix + '/login/index.html');
      return;
    }
    // If logged in and viewing login page, forward to active role dashboard
    if (!loggedOut && onAuthPage && p.includes('/login')) {
      const uRole = localStorage.getItem('evw_user_role') || '';
      if (uRole === 'rescuer') {
        global.location.replace(mobileBasePrefix + '/rescuer/dashboard/index.html');
        return;
      } else if (uRole === 'staff') {
        global.location.replace(mobileBasePrefix + '/staff/dashboard/index.html');
        return;
      } else {
        global.location.replace(mobileBasePrefix + '/resident/dashboard/index.html');
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

  function resolveCloudPhotoUrl(photo) {
    if (!photo) return null;
    const s = String(photo).trim();
    if (!s) return null;
    if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://')) return s;
    const rel = s.startsWith('/') ? s : `/uploads/profiles/${s}`;
    return isStaticBundle ? `${getHallServerUrl()}${rel}` : rel;
  }

  function setFormFieldValue(fieldName, val) {
    const v = (val === undefined || val === null) ? '' : String(val);
    const byId = document.getElementById(fieldName);
    if (byId && byId.type !== 'file' && byId.type !== 'password' && byId.type !== 'checkbox' && byId.type !== 'radio') {
      byId.value = v;
    }
    document.querySelectorAll(`input[name="${fieldName}"], select[name="${fieldName}"], textarea[name="${fieldName}"]`).forEach(el => {
      if (el.type === 'file' || el.type === 'password' || el.type === 'checkbox' || el.type === 'radio') return;
      el.value = v;
    });
  }

  function setFormCheckValue(fieldName, val) {
    const checked = Boolean(val && val !== '0' && val !== 'false');
    const byId = document.getElementById(fieldName);
    if (byId && byId.type === 'checkbox') byId.checked = checked;
    document.querySelectorAll(`input[type="checkbox"][name="${fieldName}"]`).forEach(el => {
      el.checked = checked;
    });
  }

  // 2. Dynamic Resident Profile & QR Hydrator
  function hydrateCachedResidentProfile() {
    if (!isStaticBundle) return;
    const curPath = global.location.pathname || '';
    if (curPath.includes('/staff') || curPath.includes('/rescuer')) return;

    let resident = null;
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
    } catch (_) {}
    if (!resident) return;

    if (resident.user_id || resident.id) {
      global.currentUserId = String(resident.user_id || resident.id);
    }
    const fullName = [resident.first_name, resident.middle_name, resident.last_name].filter(Boolean).join(' ').trim()
      || resident.full_name || resident.name || 'Resident';
    const shortFullName = [resident.first_name, resident.last_name].filter(Boolean).join(' ').trim() || fullName;
    try {
      localStorage.setItem('evw_user_full_name', shortFullName);
      if (global.AndroidBleBridge && typeof global.AndroidBleBridge.setActiveUser === 'function') {
        global.AndroidBleBridge.setActiveUser(shortFullName, 'Resident');
      }
    } catch (_) {}
    const firstName = resident.first_name || (shortFullName ? shortFullName.split(' ')[0] : 'Resident');
    const lastName = resident.last_name || '';
    const email = resident.email || localStorage.getItem('evw_cached_email') || '';
    const initial = (firstName || shortFullName || 'R').charAt(0).toUpperCase();
    const contact = resident.contact_number || '';
    const address = resident.home_address || '';
    const barangay = resident.barangay || 'San Rafael';
    const familySize = resident.family_size || 1;
    const uuid = resident.qr_code_uuid || `evw-resident-${resident.id || 1}`;

    let birthdateIso = '';
    let birthdatePretty = 'Not specified';
    if (resident.birthdate) {
      const bd = new Date(resident.birthdate);
      if (!isNaN(bd.getTime())) {
        birthdateIso = bd.toISOString().split('T')[0];
        birthdatePretty = bd.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      }
    }

    // Text fields across headers, settings, and cards
    document.querySelectorAll('#residentUserGreetingName, .resident-first-name-display').forEach(el => {
      el.textContent = firstName;
    });
    document.querySelectorAll('.resident-name-display, #headerUserName, #profileFullName, #ownerName, .profile-hero-name, #displayFullName').forEach(el => {
      el.textContent = shortFullName;
    });
    document.querySelectorAll('#residentUserAvatarInitial, .resident-avatar-initial').forEach(el => {
      el.textContent = initial;
    });
    document.querySelectorAll('#profileEmailDisplay, #ownerEmail, #displayEmail, #profileEmailSubtext').forEach(el => {
      el.textContent = email || contact || 'Registered Resident';
    });
    document.querySelectorAll('#profilePhoneDisplay, .resident-contact-display, #displayContact, #profileContactBadgeText').forEach(el => {
      el.textContent = contact;
    });
    const contactBadge = document.getElementById('profileContactBadge');
    if (contactBadge) {
      contactBadge.className = contact
        ? 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold border border-slate-200/70 profile-sub-bg profile-text-dark'
        : 'hidden';
    }
    document.querySelectorAll('#profileAddressDisplay, .resident-address-display, #displayAddress').forEach(el => {
      el.textContent = address;
    });
    document.querySelectorAll('#profileBarangayDisplay, #displayBarangay, #qrBarangayText').forEach(el => {
      el.textContent = barangay;
    });
    document.querySelectorAll('#profileBarangayBadgeText').forEach(el => {
      el.textContent = 'Brgy. ' + barangay;
    });
    document.querySelectorAll('#profileFamilySizeDisplay, #displayFamilySize, #qrMembersRegisteredCount').forEach(el => {
      el.textContent = familySize;
    });
    document.querySelectorAll('#profilePassId, .resident-uuid-display').forEach(el => {
      el.textContent = uuid;
    });
    const qrFamTitle = document.getElementById('qrFamilyTitle');
    if (qrFamTitle) {
      qrFamTitle.textContent = lastName ? `${lastName} Family` : `${firstName} Family Pass`;
    }

    // Personal Info Modal display spans
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText('piFullName', fullName);
    const agePart = resident.age ? `${resident.age} yrs old` : '';
    const sexPart = resident.sex || 'Male';
    setText('piAgeSex', agePart ? `${agePart} • ${sexPart}` : sexPart);
    setText('piBirthdate', birthdatePretty);
    setText('piContact', contact || email || 'None');
    setText('piFamilySize', `${familySize} member(s)`);
    setText('piAddress', `${address ? address + ', ' : ''}Brgy. ${barangay}, Baao`);
    setText('piEmergencyName', resident.emergency_contact_name || 'No emergency contact set');
    const piEmergLink = document.getElementById('piEmergencyPhone');
    const piEmergText = document.getElementById('piEmergencyPhoneText');
    if (piEmergLink) {
      if (resident.emergency_contact_phone) {
        piEmergLink.href = `tel:${resident.emergency_contact_phone}`;
        piEmergLink.classList.remove('hidden');
        piEmergLink.classList.add('flex');
        if (piEmergText) piEmergText.textContent = resident.emergency_contact_phone;
      } else {
        piEmergLink.classList.add('hidden');
        piEmergLink.classList.remove('flex');
      }
    }

    // Profile Avatar Photo vs Initial Fallback
    const avatarDisplay = document.getElementById('profile-avatar-display');
    const avatarFallback = document.getElementById('profile-avatar-fallback');
    const pSrc = resolveCloudPhotoUrl(resident.profile_photo);
    if (pSrc) {
      if (avatarDisplay) {
        avatarDisplay.src = pSrc;
        avatarDisplay.style.display = 'block';
      }
      if (avatarFallback) avatarFallback.classList.add('hidden');
      document.querySelectorAll('img.resident-avatar-img, img#headerAvatarImg, img.user-profile-img').forEach(img => {
        img.src = pSrc;
      });
    } else {
      if (avatarDisplay) avatarDisplay.style.display = 'none';
      if (avatarFallback) {
        avatarFallback.textContent = initial;
        avatarFallback.classList.remove('hidden');
      }
    }

    // Populate Settings / Edit Profile Form inputs (matches both #id and [name="..."])
    setFormFieldValue('first_name', resident.first_name || '');
    setFormFieldValue('middle_name', resident.middle_name || '');
    setFormFieldValue('last_name', resident.last_name || '');
    setFormFieldValue('contact_number', resident.contact_number || '');
    setFormFieldValue('email', email);
    setFormFieldValue('family_size', familySize);
    setFormFieldValue('home_address', address);
    setFormFieldValue('barangay', barangay);
    setFormFieldValue('sex', resident.sex || 'Male');
    setFormFieldValue('birthdate', birthdateIso);
    setFormFieldValue('age', resident.age || '');
    setFormFieldValue('emergency_contact_name', resident.emergency_contact_name || '');
    setFormFieldValue('emergency_contact_phone', resident.emergency_contact_phone || '');
    setFormFieldValue('serious_illness_details', resident.serious_illness_details || '');

    setFormCheckValue('is_4ps', resident.is_4ps);
    setFormCheckValue('is_pregnant', resident.is_pregnant);
    setFormCheckValue('is_lactating', resident.is_lactating);
    setFormCheckValue('is_pwd', resident.is_pwd);
    setFormCheckValue('is_single_head', resident.is_single_head);
    setFormCheckValue('has_serious_illness', resident.has_serious_illness);

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
  global.hydrateCachedResidentProfile = hydrateCachedResidentProfile;

  // Dynamic Staff & Rescuer Profile Hydrator
  function hydrateCachedStaffProfile() {
    if (!isStaticBundle) return;
    const curPath = global.location.pathname || '';
    if (curPath.includes('/resident')) return;

    let staff = null;
    try {
      staff = JSON.parse(localStorage.getItem('evw_cached_staff') || 'null');
    } catch (_) {}
    if (!staff) return;

    if (staff.userId || staff.user_id || staff.id) {
      global.currentUserId = String(staff.userId || staff.user_id || staff.id);
    }
    const isRescuer = String(staff.staff_type || '').toUpperCase() === 'RESCUER' || curPath.includes('/rescuer');
    global.__evwRole = isRescuer ? 'rescuer' : 'staff';

    const fullName = [staff.first_name, staff.middle_name, staff.last_name].filter(Boolean).join(' ').trim()
      || staff.full_name || staff.name || (isRescuer ? 'Emergency Rescuer' : 'Evacuation Staff');
    const shortFullName = [staff.first_name, staff.last_name].filter(Boolean).join(' ').trim() || fullName;
    try {
      localStorage.setItem('evw_user_full_name', shortFullName);
      if (global.AndroidBleBridge && typeof global.AndroidBleBridge.setActiveUser === 'function') {
        global.AndroidBleBridge.setActiveUser(shortFullName, isRescuer ? 'Rescuer' : 'Staff');
      }
    } catch (_) {}
    const firstName = staff.first_name || (shortFullName ? shortFullName.split(' ')[0] : (isRescuer ? 'Rescuer' : 'Staff'));
    const lastName = staff.last_name || '';
    const email = staff.email || localStorage.getItem('evw_cached_email') || '';
    const initial = (firstName || shortFullName || 'S').charAt(0).toUpperCase();
    const contact = staff.contact_number || '';
    const occupation = staff.occupation || (isRescuer ? 'Disaster Response Rescuer' : 'Evacuation Site Manager');
    const staffType = staff.staff_type || (isRescuer ? 'RESCUER' : 'EVACUATION');
    const photoSrc = resolveCloudPhotoUrl(staff.profile_photo);

    document.querySelectorAll('#staffUserGreetingName, .staff-first-name-display, #headerStaffName, #rescuerGreetingName, .rescuer-first-name-display').forEach(el => {
      el.textContent = firstName;
    });
    document.querySelectorAll('.staff-name-display, #headerUserName, #profileFullName, #ownerName, .profile-hero-name, #displayFullName, .rescuer-name-display').forEach(el => {
      el.textContent = shortFullName;
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
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText('staffTypeBadge', staffType);
    if (staff.assigned_center_name) {
      setText('staffAssignedCenterText', staff.assigned_center_name);
    }
    const staffNum = staff.staff_id || staff.id;
    if (staffNum) {
      setText('staffIdentityId', `#STF-${String(staffNum).padStart(4, '0')}`);
    }
    setText('staffIdentityRole', isRescuer ? 'Barangay Rescuer' : 'Barangay Staff');
    setText('staffIdentityFirstName', staff.first_name || firstName);
    const midRow = document.getElementById('staffIdentityMiddleNameRow');
    if (midRow) {
      if (staff.middle_name) {
        midRow.classList.remove('hidden');
        midRow.classList.add('flex');
        setText('staffIdentityMiddleName', staff.middle_name);
      } else {
        midRow.classList.add('hidden');
        midRow.classList.remove('flex');
      }
    }
    setText('staffIdentityLastName', lastName);
    setText('staffIdentityOccupation', occupation);
    setText('staffIdentityContact', contact || 'Not set');
    setText('staffIdentityEmail', email || 'N/A');

    // Populate Edit Staff / Rescuer Profile form inputs (matches both #id and [name="..."])
    setFormFieldValue('first_name', staff.first_name || '');
    setFormFieldValue('middle_name', staff.middle_name || '');
    setFormFieldValue('last_name', staff.last_name || '');
    setFormFieldValue('contact_number', contact);
    setFormFieldValue('email', email);
    setFormFieldValue('occupation', occupation);

    // Avatar Display + Modal Preview
    const avatarDisplay = document.getElementById('profile-avatar-display');
    const avatarFallback = document.getElementById('profile-avatar-fallback');
    if (photoSrc) {
      if (avatarDisplay) {
        avatarDisplay.src = photoSrc;
        avatarDisplay.style.display = 'block';
      }
      if (avatarFallback) avatarFallback.classList.add('hidden');
      document.querySelectorAll('img.staff-avatar-img, img#headerAvatarImg, img.user-profile-img, img#rescuerAvatarImg, img#staffModalAvatarPreview, img#rescuerModalAvatarPreview').forEach(img => {
        img.src = photoSrc;
      });
    } else {
      if (avatarDisplay) avatarDisplay.style.display = 'none';
      if (avatarFallback) {
        avatarFallback.textContent = initial;
        avatarFallback.classList.remove('hidden');
      }
    }
  }
  global.hydrateCachedStaffProfile = hydrateCachedStaffProfile;

  // 3. Dynamic Household Members List Hydrator for /resident/qr
  function hydrateCachedMembersList() {
    let resident = null;
    let members = [];
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
      members = JSON.parse(localStorage.getItem('evw_cached_members') || '[]');
    } catch (_) {}
    if (!Array.isArray(members)) members = [];

    const totalCount = members.length + (resident ? 1 : 0);
    document.querySelectorAll('#membersCountDisplay, .members-count-badge').forEach(el => {
      el.textContent = members.length;
    });
    const totalBadge = document.getElementById('qrTotalHouseholdBadge');
    if (totalBadge) {
      totalBadge.textContent = `${totalCount} Total`;
    }
    const evacRatioEl = document.getElementById('qrEvacuatedRatioText');
    if (evacRatioEl) {
      evacRatioEl.textContent = `Evacuated: 0 / ${totalCount} members`;
    }

    const membersContainer = document.getElementById('membersList') || document.getElementById('membersListContainer');
    if (!membersContainer) return;

    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let html = '';

    // Household Head Card for the logged-in resident
    if (resident) {
      const headName = `${resident.first_name || ''} ${resident.middle_name ? resident.middle_name + ' ' : ''}${resident.last_name || ''}`.trim() || resident.full_name || 'Resident';
      const headSex = resident.sex || 'Male';
      const headAge = resident.age ? ` • ${resident.age} yrs` : '';
      const headPhoto = resolveCloudPhotoUrl(resident.profile_photo);

      html += `
        <div class="bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/40 rounded-2xl p-3 sm:p-4 shadow-xs border border-blue-200/90 flex flex-col gap-2 relative overflow-hidden group hover:shadow-md hover:border-blue-400 transition-all">
          <div class="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-bl-full pointer-events-none"></div>
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center text-lg sm:text-xl shrink-0 shadow-inner border border-blue-200 overflow-hidden relative">
              ${headPhoto
                ? `<img loading="lazy" src="${esc(headPhoto)}" decoding="async" alt="${esc(headName)}" class="w-full h-full object-cover" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');" /><span class="hidden text-xl">${headSex === 'Female' ? '👩' : '👨'}</span>`
                : `<span class="text-xl">${headSex === 'Female' ? '👩' : '👨'}</span>`}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <h4 class="font-black text-slate-900 text-xs sm:text-sm tracking-tight truncate">${esc(headName)}</h4>
                <span class="text-[9px] sm:text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-2xs inline-flex items-center gap-1 shrink-0">
                  <i class="ph ph-crown-simple text-xs"></i> Household Head
                </span>
              </div>
              <div class="text-[10px] sm:text-[11px] text-slate-500 font-semibold mt-0.5">${esc(headSex)}${esc(headAge)}</div>
            </div>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-blue-100/60 text-[10px] sm:text-xs">
            ${resident.evacuation_status === 'CHECKED_IN'
              ? `<span class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1"><i class="ph ph-check-circle text-xs"></i> CHECKED IN</span>`
              : `<span class="px-2 py-0.5 rounded-lg text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1"><i class="ph ph-clock text-xs"></i> NOT EVACUATED</span>`}
          </div>
        </div>
      `;
    }

    if (members.length === 0) {
      html += `
        <div class="p-6 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
          <i class="ph ph-users text-3xl text-slate-400 mb-1"></i>
          <p class="text-xs font-bold text-slate-600">No additional family members registered yet.</p>
          <p class="text-[11px] text-slate-400 mt-0.5">Tap "ADD MEMBER" above to register dependents.</p>
        </div>
      `;
      membersContainer.innerHTML = html;
      return;
    }

    members.forEach(member => {
      const mName = `${member.first_name || ''} ${member.middle_name ? member.middle_name + ' ' : ''}${member.last_name || ''}`.trim() || 'Family Member';
      const mRel = member.relation || 'Dependent';
      const mSex = member.sex || 'Male';
      const mAge = member.age !== null && member.age !== undefined && member.age !== '' ? `${member.age} yrs` : '';

      html += `
        <div class="bg-white rounded-2xl p-3 sm:p-4 shadow-xs border border-slate-200/80 flex flex-col gap-2 group hover:shadow-md transition-all">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
              <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-black flex items-center justify-center text-sm shrink-0 border border-blue-200">
                ${mSex === 'Female' ? '👩' : '👨'}
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <h4 class="font-black text-slate-900 text-xs sm:text-sm tracking-tight truncate">${esc(mName)}</h4>
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">${esc(mRel)}</span>
                </div>
                <div class="text-[10px] text-slate-500 font-semibold mt-0.5">${esc(mSex)} ${mAge ? '• ' + esc(mAge) : ''}</div>
              </div>
            </div>
            <button type="button" onclick="window.deleteOfflineMember && window.deleteOfflineMember(${Number(member.id || 0)})" class="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center border border-rose-200 cursor-pointer active:scale-95" title="Remove Member">
              <i class="ph ph-trash text-sm"></i>
            </button>
          </div>
        </div>
      `;
    });
    membersContainer.innerHTML = html;
  }

  // Background server sync for logged-in mobile user (Resident, Staff, or Rescuer) so profile & family members stay fresh from MySQL
  async function syncMobileProfileFromServer() {
    if (!isStaticBundle || !navigator.onLine || !nativeFetch) return;
    const hasResident = Boolean(localStorage.getItem('evw_cached_resident'));
    const hasStaff = Boolean(localStorage.getItem('evw_cached_staff'));
    if (!hasResident && !hasStaff) return;
    try {
      const res = await nativeFetch(getHallServerUrl() + '/api/mobile/me', {
        method: 'GET',
        credentials: 'include',
        headers: getMobileAuthHeaders()
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success) {
        if (data.staff) {
          localStorage.setItem('evw_cached_staff', JSON.stringify(data.staff));
          if (data.staff.email) localStorage.setItem('evw_cached_email', data.staff.email);
          hydrateCachedStaffProfile();
        }
        if (data.resident) {
          localStorage.setItem('evw_cached_resident', JSON.stringify(data.resident));
          if (Array.isArray(data.members)) {
            localStorage.setItem('evw_cached_members', JSON.stringify(data.members));
          }
          if (data.resident.email) localStorage.setItem('evw_cached_email', data.resident.email);
          hydrateCachedResidentProfile();
        }
      }
    } catch (_) {}
  }
  global.syncMobileProfileFromServer = syncMobileProfileFromServer;
  if (isStaticBundle) {
    setTimeout(syncMobileProfileFromServer, 600);
  }

  // 4. Offline & Online Form Submission Interceptor for Resident, Staff, Rescuer Profiles, Avatars, Passwords & Household Members
  let formInterceptorsBound = false;
  function setupFormInterceptors() {
    if (!isStaticBundle || formInterceptorsBound) return;
    formInterceptorsBound = true;

    const notifyUser = (msg) => {
      if (typeof window.EvacWarToast === 'function') {
        window.EvacWarToast(msg);
      } else {
        alert(msg);
      }
    };

    const closeOpenModals = () => {
      document.querySelectorAll('.modal, [id^="modal"]').forEach(m => {
        if (m.classList.contains('active') || !m.classList.contains('hidden')) {
          m.classList.add('hidden');
          m.classList.remove('active');
        }
      });
      document.body.classList.remove('overflow-hidden');
    };

    document.addEventListener('submit', async (e) => {
      const form = e.target;
      if (!form) return;

      const act = form.getAttribute('action') || '';
      const isProfileOrAuthForm =
        act.includes('/resident/profile') ||
        act.includes('/staff/profile') ||
        act.includes('/rescuer/profile') ||
        [
          'formEditProfile',
          'formEmergencyContact',
          'formVulnerability',
          'formChangePassword',
          'avatarUploadForm',
          'formEditStaffProfile',
          'formStaffChangePassword'
        ].includes(form.id);

      if (isProfileOrAuthForm) {
        e.preventDefault();
        e.stopPropagation();

        const formData = new FormData(form);
        const curPath = global.location.pathname || '';
        const isStaffForm =
          act.includes('/staff/profile') ||
          act.includes('/rescuer/profile') ||
          form.id === 'formEditStaffProfile' ||
          form.id === 'formStaffChangePassword' ||
          (form.id === 'avatarUploadForm' && (curPath.includes('/staff') || curPath.includes('/rescuer')));

        const isPasswordForm =
          form.id === 'formChangePassword' ||
          form.id === 'formStaffChangePassword' ||
          Boolean(formData.get('new_password'));

        let cachedUser = {};
        try {
          cachedUser = JSON.parse(localStorage.getItem(isStaffForm ? 'evw_cached_staff' : 'evw_cached_resident') || '{}') || {};
        } catch (_) {}

        const userId = cachedUser.user_id || cachedUser.userId || 0;
        const staffId = isStaffForm ? (cachedUser.staff_id || cachedUser.id || 0) : 0;
        const residentId = !isStaffForm ? (cachedUser.resident_id || cachedUser.id || 0) : 0;
        const roleTag = isStaffForm
          ? (String(cachedUser.staff_type || '').toUpperCase() === 'RESCUER' || curPath.includes('/rescuer') ? 'rescuer' : 'staff')
          : 'resident';

        // Password Change Flow (always requires online MySQL verification)
        if (isPasswordForm) {
          const newPw = String(formData.get('new_password') || '');
          const confirmPw = String(formData.get('confirm_password') || '');
          if (newPw.length < 8 || !/[a-zA-Z]/.test(newPw) || !/[0-9]/.test(newPw)) {
            notifyUser('Password must be at least 8 characters and include both letters and numbers.');
            return false;
          }
          if (newPw !== confirmPw) {
            notifyUser('New password and confirmation do not match.');
            return false;
          }
          if (!navigator.onLine || !nativeFetch) {
            notifyUser('Internet connection is required to change your password.');
            return false;
          }

          formData.set('user_id', String(userId));
          formData.set('role', roleTag);
          try {
            const resp = await nativeFetch(`${getHallServerUrl()}/api/mobile/profile/update`, {
              method: 'POST',
              body: formData,
              credentials: 'include',
              headers: getMobileAuthHeaders()
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.success) {
              notifyUser(data.message || 'Failed to update password.');
              return false;
            }
            form.reset();
            closeOpenModals();
            notifyUser(data.message || 'Password updated successfully!');
          } catch (err) {
            notifyUser('Could not reach server to update password. Please try again.');
          }
          return false;
        }

        // For Vulnerability checkbox form, explicitly include unchecked boxes as '0'
        if (form.id === 'formVulnerability') {
          ['is_4ps', 'is_pregnant', 'is_lactating', 'is_pwd', 'is_single_head', 'has_serious_illness'].forEach(flag => {
            const cb = form.querySelector(`input[type="checkbox"][name="${flag}"]`);
            formData.set(flag, cb && cb.checked ? '1' : '0');
          });
        }

        // Instant visual preview if uploading an avatar photo
        const photoFile = formData.get('profile_photo');
        const hasPhotoFile = Boolean(photoFile && photoFile instanceof File && photoFile.size > 0);
        if (hasPhotoFile) {
          try {
            const reader = new FileReader();
            reader.onload = (re) => {
              const avatarDisplay = document.getElementById('profile-avatar-display');
              const avatarFallback = document.getElementById('profile-avatar-fallback');
              if (avatarDisplay) {
                avatarDisplay.src = re.target.result;
                avatarDisplay.style.display = 'block';
              }
              if (avatarFallback) avatarFallback.classList.add('hidden');
            };
            reader.readAsDataURL(photoFile);
          } catch (_) {}
        }

        // Attach identity fields for MySQL update
        formData.set('user_id', String(userId));
        formData.set('role', roleTag);
        if (isStaffForm && staffId) formData.set('staff_id', String(staffId));
        if (!isStaffForm && residentId) formData.set('resident_id', String(residentId));

        // Online: persist directly to MySQL first, then update localStorage with server's authoritative row
        if (navigator.onLine && nativeFetch) {
          const submitBtn = form.querySelector('button[type="submit"]');
          const prevBtnHtml = submitBtn ? submitBtn.innerHTML : null;
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Saving...';
          }
          try {
            const resp = await nativeFetch(`${getHallServerUrl()}/api/mobile/profile/update`, {
              method: 'POST',
              body: formData,
              credentials: 'include',
              headers: getMobileAuthHeaders()
            });
            const data = await resp.json().catch(() => ({}));
            if (!resp.ok || !data.success) {
              notifyUser(data.message || 'Could not save profile changes. Please try again.');
              return false;
            }
            if (isStaffForm && data.staff) {
              localStorage.setItem('evw_cached_staff', JSON.stringify(data.staff));
              if (data.staff.email) localStorage.setItem('evw_cached_email', data.staff.email);
              hydrateCachedStaffProfile();
            } else if (!isStaffForm && data.resident) {
              localStorage.setItem('evw_cached_resident', JSON.stringify(data.resident));
              if (data.resident.email) localStorage.setItem('evw_cached_email', data.resident.email);
              hydrateCachedResidentProfile();
            }
            // Reset file input so same photo can be re-selected later if desired
            form.querySelectorAll('input[type="file"]').forEach(fi => { fi.value = ''; });
            closeOpenModals();
            notifyUser(hasPhotoFile ? 'Profile photo updated!' : (data.message || 'Profile updated successfully!'));
          } catch (err) {
            notifyUser('Network error saving profile to server. Please check your connection and try again.');
          } finally {
            if (submitBtn && prevBtnHtml !== null) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = prevBtnHtml;
            }
          }
          return false;
        }

        // Offline fallback: update local device cache so UI stays responsive
        for (const [key, value] of formData.entries()) {
          if (['_csrf', 'returnTo', 'user_id', 'staff_id', 'resident_id', 'role'].includes(key)) continue;
          if (key === 'profile_photo') continue;
          cachedUser[key] = value;
        }
        const fn = cachedUser.first_name || '';
        const ln = cachedUser.last_name || '';
        cachedUser.name = `${fn} ${ln}`.trim() || cachedUser.name;
        cachedUser.full_name = cachedUser.name;

        try {
          localStorage.setItem(isStaffForm ? 'evw_cached_staff' : 'evw_cached_resident', JSON.stringify(cachedUser));
          if (cachedUser.email) localStorage.setItem('evw_cached_email', cachedUser.email);
        } catch (_) {}

        if (isStaffForm) hydrateCachedStaffProfile();
        else hydrateCachedResidentProfile();

        closeOpenModals();
        notifyUser('Saved offline on device. Connect to internet and save again to sync to database.');
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

      // If running inside Capacitor native WebView, rewrite `/api/...`, `/staff/...`, `/rescuer/...`, and `/resident/...` to Hall Server with mobile auth headers
      if ((urlStr.startsWith('/api/') || urlStr.startsWith('/staff/') || urlStr.startsWith('/rescuer/') || urlStr.startsWith('/resident/')) && global.location.port !== '8080') {
        const hallBase = getHallServerUrl();
        const mergedOpts = Object.assign({ credentials: 'include' }, options || {});
        mergedOpts.headers = Object.assign({}, getMobileAuthHeaders(), (options && options.headers) ? options.headers : {});
        try {
          return await origFetch.call(global, hallBase + urlStr, mergedOpts);
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

  // 6. Patch io() in Capacitor so Socket.IO connects to the Cloud / Barangay Hall Server with mobile auth
  function patchGlobalIo() {
    if (isCapacitorRuntime && global.location.port !== '8080' && typeof global.io === 'function' && !global.io._evwPatched) {
      const origIo = global.io;
      const wrappedIo = function (uri, opts) {
        const authPayload = getMobileSocketAuth();
        if (!uri || typeof uri === 'object') {
          const baseOpts = Object.assign({ reconnectionAttempts: 10, timeout: 5000, auth: authPayload }, uri || {});
          baseOpts.auth = Object.assign({}, authPayload, (uri && uri.auth) ? uri.auth : {});
          return origIo(getHallServerUrl(), baseOpts);
        }
        const mergedOpts = Object.assign({ auth: authPayload }, opts || {});
        mergedOpts.auth = Object.assign({}, authPayload, (opts && opts.auth) ? opts.auth : {});
        return origIo(uri, mergedOpts);
      };
      wrappedIo._evwPatched = true;
      global.io = wrappedIo;
    }
  }
  patchGlobalIo();
  document.addEventListener('DOMContentLoaded', patchGlobalIo);

    // 7b. Global programmatic navigation helper for Android native notifications & intents
  global.navigateToEvakWar = function (rawHref) {
    if (!rawHref) return;
    const isPreviewPrefix = global.location.pathname.startsWith('/resident-mobile');
    const prefix = isPreviewPrefix ? '/resident-mobile' : '';
    const cleanHref = rawHref.split('?')[0].split('#')[0];
    const queryOrHash = rawHref.slice(cleanHref.length);

    const storedRole = (localStorage.getItem('evw_user_role') || '').toLowerCase();
    let targetPath = null;
    if (cleanHref.includes('/typhoon') || cleanHref.includes('/weather')) {
      if (cleanHref.startsWith('/staff') || storedRole === 'staff' || storedRole === 'barangay_council') {
        targetPath = `${prefix}/staff/typhoon/index.html`;
      } else if (cleanHref.startsWith('/rescuer') || storedRole === 'rescuer') {
        targetPath = `${prefix}/rescuer/typhoon/index.html`;
      } else {
        targetPath = `${prefix}/resident/typhoon/index.html`;
      }
    } else if (cleanHref.includes('/chat')) {
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
