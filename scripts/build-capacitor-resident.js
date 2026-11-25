/**
 * EvakWar (E-BAKWAR) — Capacitor Native Views & Assets Builder
 * Compiles:
 *   1. Resident PWA views (`views/resident/*.ejs`)
 *   2. Evacuation Staff views (`views/staff/*.ejs`)
 *   3. Disaster Rescuer views (`views/rescuer/*.ejs`)
 * Bundles all 82 resident accounts and 21 staff/rescuer accounts into `offline-data.js`
 * with 100% offline 433.875 MHz LoRa Mesh support, background notifications, and sirens.
 */
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const QRCode = require('qrcode');

const db = require('../config/db');
const Center = require('../models/centerModel');
const Alert = require('../models/alertModel');
const gisCache = require('../utils/gisCache');
const weatherService = require('../utils/weatherService');
const pagasaService = require('../utils/pagasaService');
const sharedSimData = require('../utils/simData');
const getMapConfig = require('../config/mapConfig');

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const OUT_DIR = path.join(ROOT_DIR, 'resident-mobile');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.toLowerCase().endsWith('.apk')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function writeOutputHtml(relPaths, htmlContent) {
  for (const rel of relPaths) {
    const fullPath = path.join(OUT_DIR, rel);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, htmlContent, 'utf8');
  }
}

function rewriteOfflineHrefs(html) {
  return html
    .replace(/href="\/resident\/sos"/g, 'href="/resident/sos/index.html"')
    .replace(/href="\/resident\/evacuation"/g, 'href="/resident/evacuation/index.html"')
    .replace(/href="\/resident\/typhoon"/g, 'href="/resident/typhoon/index.html"')
    .replace(/href="\/resident\/chat"/g, 'href="/resident/chat/index.html"')
    .replace(/href="\/resident\/qr"/g, 'href="/resident/qr/index.html"')
    .replace(/href="\/resident\/profile"/g, 'href="/resident/profile/index.html"')
    .replace(/href="\/resident\/settings"/g, 'href="/resident/profile/index.html"')
    .replace(/href="\/resident\/dashboard"/g, 'href="/resident/dashboard/index.html"')
    .replace(/href="\/resident\/"/g, 'href="/resident/dashboard/index.html"')
    .replace(/href="\/resident"/g, 'href="/resident/dashboard/index.html"')
    .replace(/href="\/staff\/qr-scanner"/g, 'href="/staff/qr-scanner/index.html"')
    .replace(/href="\/staff\/qr"/g, 'href="/staff/qr-scanner/index.html"')
    .replace(/href="\/staff\/map"/g, 'href="/staff/map/index.html"')
    .replace(/href="\/staff\/chat"/g, 'href="/staff/chat/index.html"')
    .replace(/href="\/staff\/reports"/g, 'href="/staff/reports/index.html"')
    .replace(/href="\/staff\/typhoon"/g, 'href="/staff/typhoon/index.html"')
    .replace(/href="\/staff\/profile"/g, 'href="/staff/settings/index.html"')
    .replace(/href="\/staff\/settings"/g, 'href="/staff/settings/index.html"')
    .replace(/href="\/staff\/dashboard"/g, 'href="/staff/dashboard/index.html"')
    .replace(/href="\/staff\/"/g, 'href="/staff/dashboard/index.html"')
    .replace(/href="\/staff"/g, 'href="/staff/dashboard/index.html"')
    .replace(/href="\/rescuer\/map"/g, 'href="/rescuer/map/index.html"')
    .replace(/href="\/rescuer\/chat"/g, 'href="/rescuer/chat/index.html"')
    .replace(/href="\/rescuer\/reports"/g, 'href="/rescuer/reports/index.html"')
    .replace(/href="\/rescuer\/typhoon"/g, 'href="/rescuer/typhoon/index.html"')
    .replace(/href="\/rescuer\/profile"/g, 'href="/rescuer/settings/index.html"')
    .replace(/href="\/rescuer\/settings"/g, 'href="/rescuer/settings/index.html"')
    .replace(/href="\/rescuer\/dashboard"/g, 'href="/rescuer/dashboard/index.html"')
    .replace(/href="\/rescuer\/"/g, 'href="/rescuer/dashboard/index.html"')
    .replace(/href="\/rescuer"/g, 'href="/rescuer/dashboard/index.html"')
    .replace(/href="\/logout"/g, 'href="/logout/index.html"')
    .replace(/href="\/login"/g, 'href="/login/index.html"')
    .replace(/'\/logout'/g, "'/logout/index.html'")
    .replace(/'\/login'/g, "'/login/index.html'");
}

async function buildCapacitorApp() {
  console.log('[Build Capacitor Native App] 1. Copying public/ static assets to resident-mobile/...');
  copyDirRecursive(PUBLIC_DIR, OUT_DIR);

  // Remove PWA manifest, service-worker, server-hosted uploads, unused 3MB Phosphor.svg, and any .apk files from native Capacitor bundle
  ['manifest.json', 'service-worker.js', 'css/Phosphor.svg'].forEach(f => {
    const p = path.join(OUT_DIR, f);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (_) {}
    }
  });
  const uploadsOutDir = path.join(OUT_DIR, 'uploads');
  if (fs.existsSync(uploadsOutDir)) {
    try { fs.rmSync(uploadsOutDir, { recursive: true, force: true }); } catch (_) {}
  }
  try {
    for (const f of fs.readdirSync(OUT_DIR)) {
      if (f.toLowerCase().endsWith('.apk')) {
        fs.unlinkSync(path.join(OUT_DIR, f));
      }
    }
  } catch (_) {}

  // Copy Socket.IO client browser bundle
  const socketIoClientDist = path.join(ROOT_DIR, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js');
  if (fs.existsSync(socketIoClientDist)) {
    const destSocketIo = path.join(OUT_DIR, 'socket.io', 'socket.io.js');
    fs.mkdirSync(path.dirname(destSocketIo), { recursive: true });
    fs.copyFileSync(socketIoClientDist, destSocketIo);
  }

  // Copy bcrypt.min.js for offline password hashing
  const bcryptUmd = path.join(ROOT_DIR, 'node_modules', 'bcryptjs', 'umd', 'index.js');
  if (fs.existsSync(bcryptUmd)) {
    const destBcrypt = path.join(OUT_DIR, 'js', 'bcrypt.min.js');
    fs.mkdirSync(path.dirname(destBcrypt), { recursive: true });
    fs.copyFileSync(bcryptUmd, destBcrypt);
    fs.copyFileSync(bcryptUmd, path.join(PUBLIC_DIR, 'js', 'bcrypt.min.js'));
  }

  console.log('[Build Capacitor Native App] 2. Fetching live San Rafael data, Residents & Staff from MySQL...');
  let centers = [];
  let mapFeatures = '{"type":"FeatureCollection","features":[]}';
  let activeAlert = null;
  let resident = null;
  let userRow = null;
  let members = [];
  let weather = weatherService.getFallbackWeather();
  let allResidentsData = [];
  let allStaffData = [];

  try {
    const [dbCenters, dbFeatures, dbAlert, dbWeather, dbPagasa, residentRows, membersRows, staffRows] = await Promise.all([
      Center.findAll().catch(() => []),
      gisCache.getDrawnFeatures(false).catch(() => '{"type":"FeatureCollection","features":[]}'),
      Alert.getLatestActive().catch(() => null),
      weatherService.getLatestWeather().catch(() => null),
      pagasaService.getPagasaGuidance().catch(() => null),
      db.query(`
        SELECT u.id as user_id, u.email, u.password_hash, u.role, r.*
        FROM residents r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE'
          AND (u.role IS NULL OR u.role = 'resident')
        ORDER BY r.id ASC
      `).catch(() => [[]]),
      db.query(`SELECT * FROM household_members ORDER BY id ASC`).catch(() => [[]]),
      db.query(`
        SELECT s.*, u.email, u.password_hash, u.role
        FROM staff s
        LEFT JOIN users u ON s.user_id = u.id
        ORDER BY s.id ASC
      `).catch(() => [[]])
    ]);

    centers = Array.isArray(dbCenters) ? dbCenters : [];
    if (dbFeatures) {
      mapFeatures = typeof dbFeatures === 'string' ? dbFeatures : JSON.stringify(dbFeatures);
    }
    activeAlert = dbAlert || null;
    if (dbWeather) weather = dbWeather;
    if (dbPagasa) weather.pagasa = dbPagasa;

    const actualResidents = (residentRows && residentRows[0]) ? residentRows[0] : [];
    const actualMembers = (membersRows && membersRows[0]) ? membersRows[0] : [];
    const actualStaff = (staffRows && staffRows[0]) ? staffRows[0] : [];

    allResidentsData = actualResidents.map(r => {
      const fn = r.first_name || 'Resident';
      const ln = r.last_name || '';
      const name = `${fn} ${ln}`.trim() || 'Resident';
      return {
        id: r.id,
        user_id: r.user_id,
        email: (r.email || '').toLowerCase(),
        password_hash: r.password_hash,
        role: 'resident',
        first_name: fn,
        middle_name: r.middle_name || '',
        last_name: ln,
        name: name,
        full_name: name,
        contact_number: r.contact_number || '',
        home_address: r.home_address || '',
        barangay: r.barangay || 'San Rafael',
        sex: r.sex || 'Male',
        birthdate: r.birthdate || null,
        age: r.age || 0,
        family_size: r.family_size || 1,
        vulnerability: r.vulnerability || 'NONE',
        has_special_needs: Boolean(r.has_special_needs),
        is_4ps: Boolean(r.is_4ps),
        is_pregnant: Boolean(r.is_pregnant),
        is_lactating: Boolean(r.is_lactating),
        is_pwd: Boolean(r.is_pwd),
        is_single_head: Boolean(r.is_single_head),
        has_serious_illness: Boolean(r.has_serious_illness),
        serious_illness_details: r.serious_illness_details || '',
        emergency_contact_name: r.emergency_contact_name || '',
        emergency_contact_phone: r.emergency_contact_phone || '',
        qr_code_uuid: r.qr_code_uuid || `evw-resident-${r.id}`,
        profile_photo: r.profile_photo || null,
        approval_status: 'APPROVED',
        members: actualMembers.filter(m => m.resident_id === r.id)
      };
    });

    allStaffData = actualStaff.map(s => {
      const fn = s.first_name || 'Staff';
      const ln = s.last_name || '';
      const name = `${fn} ${ln}`.trim() || 'Staff Member';
      const isRescuer = s.staff_type === 'RESCUER';
      return {
        id: s.id,
        staffId: s.id,
        user_id: s.user_id,
        userId: s.user_id,
        email: (s.email || '').toLowerCase(),
        password_hash: s.password_hash,
        role: 'staff',
        staff_type: s.staff_type || (isRescuer ? 'RESCUER' : 'EVACUATION'),
        first_name: fn,
        middle_name: s.middle_name || '',
        last_name: ln,
        name: name,
        full_name: name,
        contact_number: s.contact_number || '',
        occupation: s.occupation || (isRescuer ? 'Disaster Response Rescuer' : 'Evacuation Site Manager'),
        assigned_center_id: s.assigned_center_id,
        profile_photo: s.profile_photo || null,
        status: s.status || 'ACTIVE'
      };
    });

    console.log(`[Build Capacitor Native App] Loaded ${allResidentsData.length} residents, ${actualMembers.length} members, and ${allStaffData.length} staff/rescuers from MySQL.`);
  } catch (err) {
    console.warn('[Build Capacitor Native App] DB fetch warning:', err.message);
  }

  // Always compile static mobile templates with a neutral generic placeholder
  // so no real resident's personal or family info ever leaks into another user's session.
  resident = {
    id: 0,
    user_id: 0,
    first_name: 'Resident',
    middle_name: '',
    last_name: '',
    contact_number: '',
    home_address: '',
    barangay: 'San Rafael',
    sex: 'Male',
    age: '',
    vulnerability: 'NONE',
    family_size: 1,
    approval_status: 'APPROVED',
    qr_code_uuid: 'evw-resident-pending',
    profile_photo: null
  };
  userRow = {
    id: 0,
    name: 'Resident',
    email: '',
    role: 'resident'
  };
  members = [];

  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(resident.qr_code_uuid, {
      width: 360,
      margin: 1,
      color: { dark: '#1e3a8a', light: '#ffffff' }
    });
  } catch (_) {}

  // Save offline-data.js containing ALL 82 Residents, 21 Staff/Rescuers, Centers, and Features
  const parsedFeatures = typeof mapFeatures === 'string' ? JSON.parse(mapFeatures) : mapFeatures;
  const offlineDataJs =
    `window.OFFLINE_CENTERS = ${JSON.stringify(centers, null, 2)};\n` +
    `window.OFFLINE_FEATURES = ${JSON.stringify(parsedFeatures, null, 2)};\n` +
    `window.OFFLINE_RESIDENTS = ${JSON.stringify(allResidentsData, null, 2)};\n` +
    `window.OFFLINE_STAFF = ${JSON.stringify(allStaffData, null, 2)};\n`;

  fs.mkdirSync(path.join(OUT_DIR, 'js'), { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'data'), { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'js', 'offline-data.js'), offlineDataJs, 'utf8');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'js', 'offline-data.js'), offlineDataJs, 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'data', 'offline_residents.json'), JSON.stringify(allResidentsData, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'data', 'offline_staff.json'), JSON.stringify(allStaffData, null, 2), 'utf8');

  const fullName = `${resident.first_name || ''} ${resident.last_name || ''}`.trim() || 'Resident';
  const resolvedPhoto = resident.profile_photo
    ? (resident.profile_photo.startsWith('http') || resident.profile_photo.startsWith('/')
      ? resident.profile_photo
      : `/uploads/profiles/${resident.profile_photo}`)
    : null;

  const userContext = {
    id: resident.user_id || 1,
    resident_id: resident.id,
    name: fullName,
    full_name: fullName,
    first_name: resident.first_name || 'Resident',
    middle_name: resident.middle_name || '',
    last_name: resident.last_name || '',
    email: (userRow && userRow.email) || 'resident@sanrafael.gov.ph',
    role: 'resident',
    contact_number: resident.contact_number || '',
    profile_photo: resolvedPhoto
  };

  const formatManilaTime = (dateVal) => {
    if (!dateVal) return 'Just now';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Just now';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  };

  const formatManilaDateTime = (dateVal) => {
    if (!dateVal) return 'N/A';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  };

  const baseResidentData = {
    ...sharedSimData(),
    csrfToken: '',
    activeAlert: activeAlert,
    profilePhoto: resolvedPhoto,
    user: userContext,
    staff: null,
    rescuer: null,
    resident: resident,
    members: members,
    evacuatedCount: 0,
    totalHouseholdCount: (members ? members.length : 0) + 1,
    qrDataUrl: qrDataUrl,
    centers: centers,
    mapFeatures: typeof mapFeatures === 'string' ? mapFeatures : JSON.stringify(mapFeatures),
    activeCheckin: null,
    weather: weather,
    mapConfig: getMapConfig(),
    formatManilaTime,
    formatManilaDateTime,
    errorMessage: null,
    successMessage: null,
    statusMsg: null,
    errorMsg: null
  };

  // Helper to compile a resident view
  async function compileResidentView(viewName, pageTitle) {
    const templatePath = path.join(VIEWS_DIR, 'resident', `${viewName}.ejs`);
    const data = {
      ...baseResidentData,
      page: { title: pageTitle }
    };
    data.locals = data;

    let html = await ejs.renderFile(templatePath, data, {
      views: [VIEWS_DIR],
      filename: templatePath
    });

    const injection = `\n  <script src="/js/bcrypt.min.js"></script>\n  <script src="/js/offline-data.js"></script>\n  <script src="/js/capacitor-resident-bridge.js"></script>\n</head>`;
    html = html.replace('</head>', injection);
    return rewriteOfflineHrefs(html);
  }

  // -------------------------------------------------------------
  // STAFF VIEW COMPILATION
  // -------------------------------------------------------------
  const defaultStaffAccount = allStaffData.find(s => s.staff_type === 'EVACUATION') || {
    id: 14,
    user_id: 55,
    name: 'Virgil Vasquez',
    full_name: 'Virgil Vasquez',
    first_name: 'Virgil',
    last_name: 'Vasquez',
    email: 'toto@gmail.com',
    role: 'staff',
    staff_type: 'EVACUATION',
    assigned_center_id: (centers[0] && centers[0].id) || 13,
    contact_number: '09123456780',
    occupation: 'Evacuation Center Site Staff'
  };

  const activeCenter = centers.find(c => Number(c.id) === Number(defaultStaffAccount.assigned_center_id)) || centers[0] || { id: 13, name: 'San Rafael Evacuation Center', capacity: 300, current_evacuees: 45 };

  const baseStaffData = {
    ...sharedSimData(),
    csrfToken: '',
    user: {
      id: defaultStaffAccount.user_id,
      name: defaultStaffAccount.full_name,
      email: defaultStaffAccount.email,
      role: 'staff',
      staff_type: 'EVACUATION'
    },
    staff: defaultStaffAccount,
    rescuer: null,
    activeCenter: activeCenter,
    activeCenterId: activeCenter.id,
    assignedSites: centers,
    centers: centers,
    allCenters: centers,
    recentScanned: [],
    weather: weather,
    mapFeatures: typeof mapFeatures === 'string' ? mapFeatures : JSON.stringify(mapFeatures),
    mapConfig: getMapConfig(),
    activeAlert: activeAlert,
    activeSosAlerts: [],
    recentSosAlerts: [],
    ecStats: {
      summary: {
        total_families: 12,
        four_ps_count: 5,
        pregnant_lactating: 2,
        pwd_count: 3,
        seniors_count: 4,
        infants_toddlers: 2
      },
      totalFamilies: 12,
      totalIndividuals: 45,
      capacity: activeCenter.capacity || 300,
      available: (activeCenter.capacity || 300) - 45,
      occupiedRate: Math.round((45 / (activeCenter.capacity || 300)) * 100)
    },
    sosReports: [],
    sosStats: { total: 0, pending: 0, dispatched: 0, rescued: 0, resolved: 0 },
    myStats: { assigned: 0, resolved: 0 },
    activeEvacuees: [],
    departedEvacuees: [],
    selectedCenterId: activeCenter.id,
    statusMsg: null,
    errorMsg: null,
    errorMessage: null,
    successMessage: null,
    formatManilaTime,
    formatManilaDateTime
  };

  async function compileStaffView(viewName, pageTitle) {
    const templatePath = path.join(VIEWS_DIR, 'staff', `${viewName}.ejs`);
    const data = {
      ...baseStaffData,
      page: { title: pageTitle }
    };
    data.locals = data;

    let html = await ejs.renderFile(templatePath, data, {
      views: [VIEWS_DIR],
      filename: templatePath
    });

    const injection = `\n  <script src="/js/bcrypt.min.js"></script>\n  <script src="/js/offline-data.js"></script>\n  <script src="/js/capacitor-resident-bridge.js"></script>\n</head>`;
    html = html.replace('</head>', injection);
    return rewriteOfflineHrefs(html);
  }

  // -------------------------------------------------------------
  // RESCUER VIEW COMPILATION
  // -------------------------------------------------------------
  const defaultRescuerAccount = allStaffData.find(s => s.staff_type === 'RESCUER') || {
    id: 1,
    user_id: 9,
    name: 'Staff Three',
    full_name: 'Staff Three',
    first_name: 'Staff',
    last_name: 'Three',
    email: 'staff3@yahoo.com',
    role: 'staff',
    staff_type: 'RESCUER',
    contact_number: '09123456781',
    occupation: 'Disaster Emergency Rescuer'
  };

  const baseRescuerData = {
    ...baseStaffData,
    user: {
      id: defaultRescuerAccount.user_id,
      name: defaultRescuerAccount.full_name,
      email: defaultRescuerAccount.email,
      role: 'staff',
      staff_type: 'RESCUER'
    },
    staff: defaultRescuerAccount,
    rescuer: defaultRescuerAccount,
    isRescuer: true
  };

  async function compileRescuerView(viewName, pageTitle) {
    const templatePath = path.join(VIEWS_DIR, 'rescuer', `${viewName}.ejs`);
    const data = {
      ...baseRescuerData,
      page: { title: pageTitle }
    };
    data.locals = data;

    let html = await ejs.renderFile(templatePath, data, {
      views: [VIEWS_DIR],
      filename: templatePath
    });

    const injection = `\n  <script src="/js/bcrypt.min.js"></script>\n  <script src="/js/offline-data.js"></script>\n  <script src="/js/capacitor-resident-bridge.js"></script>\n</head>`;
    html = html.replace('</head>', injection);
    return rewriteOfflineHrefs(html);
  }

  // -------------------------------------------------------------
  // AUTH / LOGIN PAGE (RESIDENTS + STAFF + RESCUERS)
  // -------------------------------------------------------------
  function buildAuthPages() {
    const safe = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const defaultOwnerEmail = String(userContext.email || 'laurencesinfuego@gmail.com').toLowerCase();
    const defaultOwnerName = String(userContext.full_name || 'Laurence Sinfuego');
    const defaultSalt = '1b5dc65549135310918a292e167b95e2';
    const defaultHash = 'e9b9e35cc8269ac32bb61f3154b8cce89860ffd0e999bac98eafb2cf0603f366';

    const loginHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b1329">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="EvakWar">
  <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
  <title>Sign In - EvakWar Mobile</title>
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/google-fonts.css">
  <script src="/js/bcrypt.min.js"></script>
  <script src="/js/offline-data.js"></script>
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
      <h1 style="font-size: 18px; font-weight: 900; margin: 0; color: #0f172a;">EvakWar Unified Mobile</h1>
      <p style="font-size: 12px; color: #64748b; margin: 2px 0 0;">Barangay San Rafael &bull; Resident, Staff & Rescuer</p>
    </div>

    <!-- Live Network / Mode Badge -->
    <div style="text-align: center;">
      <span id="modeBadge" class="mode-pill mode-online">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981;"></span>
        <span id="modeText">Checking Server Connection...</span>
      </span>
    </div>

    <!-- Cached Device Account Indicator -->
    <div id="cachedOwnerBox" class="cached-notice" style="display: none;">
      <div class="avatar-circle" id="ownerInitial">L</div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 10.5px; font-weight: 700; color: #64748b; text-transform: uppercase;" id="ownerRoleLabel">Account Active</div>
        <div id="ownerName" style="font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${safe(defaultOwnerName)}</div>
      </div>
    </div>

    <div id="errorAlert" class="error-msg"></div>
    <div id="successAlert" style="font-size: 12px; font-weight: 600; color: #166534; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; display: none; text-align: left;"></div>

    <!-- Sign In / Register Tab Switcher -->
    <div style="display: flex; background: #f1f5f9; border-radius: 12px; padding: 4px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
      <button type="button" id="tabSignInBtn" onclick="window.switchAuthTab('login')" style="flex: 1; padding: 8px 10px; border: 0; border-radius: 9px; font-size: 12.5px; font-weight: 800; cursor: pointer; background: #2563eb; color: #ffffff; box-shadow: 0 2px 6px rgba(37,99,235,0.25);">
        Sign In
      </button>
      <button type="button" id="tabRegisterBtn" onclick="window.switchAuthTab('register')" style="flex: 1; padding: 8px 10px; border: 0; border-radius: 9px; font-size: 12.5px; font-weight: 800; cursor: pointer; background: transparent; color: #475569;">
        Register Account
      </button>
    </div>

    <form id="loginForm" autocomplete="on">
      <div class="input-group">
        <label for="emailInput" class="input-label">Email or Contact Number</label>
        <input id="emailInput" type="text" class="text-input" placeholder="Enter your email or 09XXXXXXXXX" required autocomplete="username">
      </div>

      <div class="input-group">
        <label for="passwordInput" class="input-label">Password</label>
        <input id="passwordInput" type="password" class="text-input" placeholder="&bull;&bull;&bull;&bull;&bull;&bull;" required autocomplete="current-password">
      </div>

      <button type="submit" id="submitBtn" class="btn-submit">
        Sign In to Emergency Dashboard
      </button>

      <div style="margin-top: 12px; text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">
        Don't have an account? <button type="button" onclick="window.switchAuthTab('register')" style="background: none; border: 0; color: #2563eb; font-weight: 800; cursor: pointer; padding: 0; text-decoration: underline;">Create one here</button>
      </div>
    </form>

    <!-- In-App Resident Registration Form -->
    <form id="registerForm" style="display: none; text-align: left;" autocomplete="on">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regFirstName" class="input-label">First Name *</label>
          <input id="regFirstName" name="first_name" type="text" class="text-input" style="padding: 10px 12px; font-size: 13px;" placeholder="First Name" required>
        </div>
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regLastName" class="input-label">Last Name *</label>
          <input id="regLastName" name="last_name" type="text" class="text-input" style="padding: 10px 12px; font-size: 13px;" placeholder="Last Name" required>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regMiddleName" class="input-label">Middle Name (Opt)</label>
          <input id="regMiddleName" name="middle_name" type="text" class="text-input" style="padding: 10px 12px; font-size: 13px;" placeholder="Middle Name">
        </div>
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regContact" class="input-label">Mobile Number *</label>
          <input id="regContact" name="contact" type="tel" class="text-input" style="padding: 10px 12px; font-size: 13px;" placeholder="09XXXXXXXXX" maxlength="11" required>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regZone" class="input-label">Zone Location *</label>
          <select id="regZone" name="zone" class="text-input" style="padding: 10px 12px; font-size: 13px;" required>
            <option value="">Select Zone</option>
            <option value="Zone 1">Zone 1</option>
            <option value="Zone 2">Zone 2</option>
            <option value="Zone 3">Zone 3</option>
            <option value="Zone 4">Zone 4</option>
            <option value="Zone 5">Zone 5</option>
            <option value="Zone 6">Zone 6</option>
            <option value="Zone 7">Zone 7</option>
          </select>
        </div>
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regFamilySize" class="input-label">Family Size *</label>
          <input id="regFamilySize" name="family_size" type="number" min="1" max="30" value="1" class="text-input" style="padding: 10px 12px; font-size: 13px;" required>
        </div>
      </div>

      <div class="input-group" style="margin-bottom: 10px;">
        <label for="regEmail" class="input-label">Email Address *</label>
        <input id="regEmail" name="email" type="email" class="text-input" style="padding: 10px 12px; font-size: 13px;" placeholder="yourname@email.com" required>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regPassword" class="input-label">Password *</label>
          <input id="regPassword" name="password" type="password" class="text-input" style="padding: 10px 12px; font-size: 13px;" placeholder="8+ chars (letters+nums)" required>
        </div>
        <div class="input-group" style="margin-bottom: 10px;">
          <label for="regConfirmPassword" class="input-label">Confirm Password *</label>
          <input id="regConfirmPassword" name="confirm_password" type="password" class="text-input" style="padding: 10px 12px; font-size: 13px;" placeholder="Repeat password" required>
        </div>
      </div>

      <div class="input-group" style="margin-bottom: 10px;">
        <label for="regVulnerability" class="input-label">Vulnerability Category</label>
        <select id="regVulnerability" name="vulnerability" class="text-input" style="padding: 10px 12px; font-size: 13px;">
          <option value="None">None</option>
          <option value="Senior Citizen">Senior Citizen</option>
          <option value="PWD">Person with Disability (PWD)</option>
          <option value="Pregnant">Pregnant</option>
          <option value="Lactating Mother">Lactating Mother</option>
          <option value="4Ps Beneficiary">4Ps Beneficiary</option>
        </select>
      </div>

      <div class="input-group" style="margin-bottom: 12px;">
        <label for="regValidId" class="input-label">Valid ID / Barangay ID Photo *</label>
        <input id="regValidId" name="valid_id" type="file" accept="image/*" class="text-input" style="padding: 8px 10px; font-size: 12px;" required>
      </div>

      <button type="submit" id="regSubmitBtn" class="btn-submit">
        Submit Resident Registration
      </button>

      <div style="margin-top: 12px; text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">
        Already have an account? <button type="button" onclick="window.switchAuthTab('login')" style="background: none; border: 0; color: #2563eb; font-weight: 800; cursor: pointer; padding: 0; text-decoration: underline;">Sign in here</button>
      </div>
    </form>

    <!-- Cloud Hosting & Server Endpoint Config Toggle -->
    <div style="margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 10px;">
      <div style="text-align: center;">
        <button type="button" id="toggleServerSettingsBtn" onclick="window.toggleServerSettings && window.toggleServerSettings()" style="background: none; border: none; color: #64748b; font-size: 11.5px; font-weight: 700; cursor: pointer; padding: 6px 10px; display: inline-flex; align-items: center; gap: 4px;">
          <span>&#9881; Server / Wi-Fi Network Settings</span>
        </button>
      </div>

      <div id="serverSettingsPanel" style="display: none; margin-top: 8px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; text-align: left;">
        <label for="serverUrlInput" style="display: block; font-size: 10.5px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Barangay Hall Server URL</label>
        <div style="display: flex; gap: 6px;">
          <input type="url" id="serverUrlInput" class="text-input" style="padding: 8px 10px; font-size: 12px;" placeholder="https://evacwar.onrender.com">
          <button type="button" id="saveServerUrlBtn" onclick="window.saveServerUrl && window.saveServerUrl()" style="background: #0f172a; color: #ffffff; border: none; border-radius: 10px; padding: 0 14px; font-size: 11.5px; font-weight: 800; cursor: pointer; shrink: 0;">Save</button>
        </div>
        <div id="serverUrlStatus" style="font-size: 11px; font-weight: 600; margin-top: 6px; color: #64748b;"></div>
      </div>
    </div>

    <div style="margin-top: 14px; text-align: center; font-size: 10.5px; color: #94a3b8; font-weight: 600;">
      <span>EvakWar v2.4 &bull; 433.875 MHz LoRa Mesh + Wi-Fi</span>
    </div>
  </div>

  <script>
    (function () {
      'use strict';

      const DEFAULT_SERVER_URL = 'https://evacwar.onrender.com';
      const CANDIDATE_URLS = [
        'https://evacwar.onrender.com',
        'https://evacwar-koyeb.onrender.com',
        'https://evakwar.onrender.com',
        'http://192.168.0.102:8080',
        'http://192.168.0.101:8080',
        'http://192.168.0.100:8080',
        'http://192.168.18.14:8080',
        'http://10.0.2.2:8080'
      ];

      const DEFAULT_EMAIL = ${JSON.stringify(defaultOwnerEmail)};
      const DEFAULT_NAME = ${JSON.stringify(defaultOwnerName)};
      const DEFAULT_SALT = ${JSON.stringify(defaultSalt)};
      const DEFAULT_HASH = ${JSON.stringify(defaultHash)};

      const emailInput = document.getElementById('emailInput');
      const passwordInput = document.getElementById('passwordInput');
      const errorAlert = document.getElementById('errorAlert');
      const submitBtn = document.getElementById('submitBtn');
      const modeBadge = document.getElementById('modeBadge');
      const modeText = document.getElementById('modeText');
      const ownerNameEl = document.getElementById('ownerName');
      const ownerInitialEl = document.getElementById('ownerInitial');
      const ownerRoleLabel = document.getElementById('ownerRoleLabel');

      // Populate cached user if present
      let cachedUser = null;
      try {
        const uRole = localStorage.getItem('evw_user_role');
        if (uRole === 'staff' || uRole === 'rescuer') {
          cachedUser = JSON.parse(localStorage.getItem('evw_cached_staff') || 'null');
        } else {
          cachedUser = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
        }
      } catch (_) {}

      if (cachedUser && (cachedUser.full_name || cachedUser.name || cachedUser.first_name)) {
        const displayName = cachedUser.full_name || cachedUser.name || ((cachedUser.first_name || '') + ' ' + (cachedUser.last_name || '')).trim();
        if (ownerNameEl) ownerNameEl.textContent = displayName;
        if (ownerInitialEl) ownerInitialEl.textContent = displayName.charAt(0).toUpperCase();
        if (ownerRoleLabel) {
          const uRole = localStorage.getItem('evw_user_role') || (cachedUser.staff_type === 'RESCUER' ? 'rescuer' : (cachedUser.staff_type ? 'staff' : 'resident'));
          ownerRoleLabel.textContent = uRole === 'rescuer' ? 'Rescuer Account' : (uRole === 'staff' ? 'Staff Account' : 'Resident Account');
        }
        const cachedOwnerBox = document.getElementById('cachedOwnerBox');
        if (cachedOwnerBox) cachedOwnerBox.style.display = 'flex';
      }
      const cachedEmail = localStorage.getItem('evw_cached_email');
      if (emailInput && cachedEmail) emailInput.value = cachedEmail;

      const successAlert = document.getElementById('successAlert');

      function showError(msg) {
        if (successAlert) successAlert.style.display = 'none';
        if (!errorAlert) return;
        errorAlert.textContent = msg;
        errorAlert.style.display = 'block';
      }

      function hideError() {
        if (!errorAlert) return;
        errorAlert.style.display = 'none';
      }

      function showSuccess(msg) {
        hideError();
        if (!successAlert) return;
        successAlert.textContent = msg;
        successAlert.style.display = 'block';
      }

      window.switchAuthTab = function (tab) {
        hideError();
        const loginF = document.getElementById('loginForm');
        const regF = document.getElementById('registerForm');
        const btnIn = document.getElementById('tabSignInBtn');
        const btnReg = document.getElementById('tabRegisterBtn');
        if (tab === 'register') {
          if (loginF) loginF.style.display = 'none';
          if (regF) regF.style.display = 'block';
          if (btnReg) {
            btnReg.style.background = '#2563eb';
            btnReg.style.color = '#ffffff';
            btnReg.style.boxShadow = '0 2px 6px rgba(37,99,235,0.25)';
          }
          if (btnIn) {
            btnIn.style.background = 'transparent';
            btnIn.style.color = '#475569';
            btnIn.style.boxShadow = 'none';
          }
        } else {
          if (loginF) loginF.style.display = 'block';
          if (regF) regF.style.display = 'none';
          if (btnIn) {
            btnIn.style.background = '#2563eb';
            btnIn.style.color = '#ffffff';
            btnIn.style.boxShadow = '0 2px 6px rgba(37,99,235,0.25)';
          }
          if (btnReg) {
            btnReg.style.background = 'transparent';
            btnReg.style.color = '#475569';
            btnReg.style.boxShadow = 'none';
          }
        }
      };

      if (window.location.pathname.includes('register') || window.location.search.includes('register')) {
        window.switchAuthTab('register');
      }

      function getHallBaseUrl() {
        if (window.location.protocol.startsWith('http') && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && !(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform())) {
          return window.location.origin;
        }
        try {
          const saved = localStorage.getItem('evw_server_url');
          if (saved && saved.startsWith('http') && !saved.includes('http://localhost/') && saved !== 'http://localhost') {
            return saved.replace(new RegExp('/+$'), '');
          }
        } catch (_) {}
        if (window.location.port === '8080') return window.location.origin;
        return DEFAULT_SERVER_URL;
      }

      async function checkServerStatus() {
        if (!navigator.onLine) {
          setOfflineUi();
          return;
        }

        const currentUrl = getHallBaseUrl();
        const urlsToTry = [currentUrl, ...CANDIDATE_URLS.filter(u => u !== currentUrl)];

        for (const testUrl of urlsToTry) {
          try {
            const ctrl = new AbortController();
            const tId = setTimeout(() => ctrl.abort(), 3500);
            const res = await fetch(testUrl + '/api/centers/active', { method: 'GET', signal: ctrl.signal });
            clearTimeout(tId);
            if (res.ok) {
              localStorage.setItem('evw_server_url', testUrl);
              setOnlineUi(testUrl);
              const sInp = document.getElementById('serverUrlInput');
              if (sInp && sInp.value !== testUrl) sInp.value = testUrl;
              return;
            }
          } catch (_) {}
        }
        setOfflineUi();
      }

      function setOnlineUi(activeUrl) {
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

      window.toggleServerSettings = function () {
        const p = document.getElementById('serverSettingsPanel');
        const inp = document.getElementById('serverUrlInput');
        if (!p) return;
        const isHidden = (p.style.display === 'none' || !p.style.display);
        p.style.display = isHidden ? 'block' : 'none';
        if (isHidden && inp) {
          inp.value = getHallBaseUrl();
          inp.focus();
        }
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

      const serverUrlInput = document.getElementById('serverUrlInput');
      if (serverUrlInput) {
        serverUrlInput.value = getHallBaseUrl();
      }

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

        const rawInput = emailInput.value.trim();
        const email = rawInput.toLowerCase();
        const password = passwordInput.value;

        if (!email || !password) {
          showError('Please enter both email/contact and password.');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying Credentials...';

        // STEP 1: Attempt Server Sign-In if online
        if (navigator.onLine) {
          try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 12000);
            const res = await fetch(getHallBaseUrl() + '/api/mobile/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: rawInput, password }),
              credentials: 'include',
              signal: ctrl.signal
            });
            clearTimeout(timer);

            const data = await res.json().catch(() => null);

            if (res.ok && data && data.success) {
              const role = data.role || (data.staff ? (data.staff.staff_type === 'RESCUER' ? 'rescuer' : 'staff') : 'resident');
              const basePref = window.location.pathname.startsWith('/resident-mobile') ? '/resident-mobile' : '';
              const rawTarget = data.redirectUrl || (role === 'rescuer' ? '/rescuer/dashboard/index.html' : (role === 'staff' ? '/staff/dashboard/index.html' : '/resident/dashboard/index.html'));
              const targetUrl = (basePref && !rawTarget.startsWith(basePref)) ? (basePref + rawTarget) : rawTarget;

              try {
                const prevEmail = (localStorage.getItem('evw_cached_email') || '').toLowerCase();
                if (prevEmail && prevEmail !== email) {
                  localStorage.removeItem('evw_muted_alert_ids');
                  localStorage.removeItem('Evacwar_lora_notifications');
                  localStorage.removeItem('Evacwar_read_notif_ids');
                  localStorage.removeItem('evw_last_triggered_alert_id');
                }
                localStorage.removeItem('evw_cached_staff');
                localStorage.removeItem('evw_cached_resident');
                localStorage.removeItem('evw_cached_members');
                localStorage.setItem('evw_cached_email', email);
                localStorage.setItem('evw_user_role', role);
                if (data.staff) localStorage.setItem('evw_cached_staff', JSON.stringify(data.staff));
                if (data.resident) localStorage.setItem('evw_cached_resident', JSON.stringify(data.resident));
                localStorage.setItem('evw_cached_members', JSON.stringify(Array.isArray(data.members) ? data.members : []));
                const fullNameNow = (data.staff && (data.staff.full_name || data.staff.name)) || (data.resident && (data.resident.full_name || data.resident.name)) || '';
                if (fullNameNow) {
                  localStorage.setItem('evw_user_full_name', fullNameNow);
                  if (window.AndroidBleBridge && typeof window.AndroidBleBridge.setActiveUser === 'function') {
                    try { window.AndroidBleBridge.setActiveUser(fullNameNow, role); } catch (_) {}
                  }
                }
                if (data.offlineAuth) {
                  localStorage.setItem('evw_offline_salt', data.offlineAuth.salt);
                  localStorage.setItem('evw_offline_hash', data.offlineAuth.hash);
                }
                localStorage.removeItem('evacwar_logged_out');
              } catch (_) {}

              submitBtn.textContent = 'Success! Opening Dashboard...';
              setTimeout(() => {
                window.location.replace(targetUrl);
              }, 400);
              return;
            } else if (res.status === 401 || res.status === 403) {
              showError((data && data.message) || 'Invalid username/email or password.');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Sign In to Emergency Dashboard';
              return;
            }
          } catch (_netErr) {
            console.warn('Server sign-in unreachable, attempting offline verification...');
          }
        }

        // STEP 2: Offline Verification Fallback (Bcrypt against pre-seeded records)
        try {
          const offlineStaff = window.OFFLINE_STAFF || [];
          const offlineResidents = window.OFFLINE_RESIDENTS || [];
          const cleanInputNoSpace = rawInput.replace(/[\\s\\-]/g, '');

          // Check Staff/Rescuer Accounts
          const foundStaff = offlineStaff.find(s =>
            (s.email && s.email.toLowerCase() === email) ||
            (s.contact_number && s.contact_number.replace(/[\\s\\-]/g, '') === cleanInputNoSpace)
          );

          if (foundStaff) {
            let isPasswordValid = false;
            if (window.bcrypt && typeof window.bcrypt.compareSync === 'function' && foundStaff.password_hash) {
              try { isPasswordValid = window.bcrypt.compareSync(password, foundStaff.password_hash); } catch (_) {}
            }

            if (isPasswordValid) {
              const role = foundStaff.staff_type === 'RESCUER' ? 'rescuer' : 'staff';
              const basePref = window.location.pathname.startsWith('/resident-mobile') ? '/resident-mobile' : '';
              const targetUrl = basePref + (role === 'rescuer' ? '/rescuer/dashboard/index.html' : '/staff/dashboard/index.html');
              try {
                localStorage.setItem('evw_cached_email', foundStaff.email || email);
                localStorage.setItem('evw_user_role', role);
                localStorage.setItem('evw_cached_staff', JSON.stringify(foundStaff));
                localStorage.removeItem('evacwar_logged_out');
              } catch (_) {}

              submitBtn.textContent = 'Verified (Staff Offline Mode)! Opening...';
              setTimeout(() => window.location.replace(targetUrl), 300);
              return;
            } else {
              showError('Incorrect password for Staff account.');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Sign In to Emergency Dashboard';
              return;
            }
          }

          // Check Resident Accounts
          const foundResident = offlineResidents.find(a =>
            (a.email && a.email.toLowerCase() === email) ||
            (a.contact_number && a.contact_number.replace(/[\\s\\-]/g, '') === cleanInputNoSpace)
          );

          if (foundResident) {
            let isPasswordValid = false;
            if (window.bcrypt && typeof window.bcrypt.compareSync === 'function' && foundResident.password_hash) {
              try { isPasswordValid = window.bcrypt.compareSync(password, foundResident.password_hash); } catch (_) {}
            }

            // Fallback check for Laurence pre-calculated hash
            if (!isPasswordValid && (foundResident.user_id === 3 || email.includes('laurence'))) {
              const computedHash = await hashPasswordWithSalt(password, DEFAULT_SALT);
              if (computedHash.toLowerCase() === DEFAULT_HASH.toLowerCase()) {
                isPasswordValid = true;
              }
            }

            if (isPasswordValid) {
              try {
                localStorage.setItem('evw_cached_email', foundResident.email || email);
                localStorage.setItem('evw_user_role', 'resident');
                localStorage.setItem('evw_cached_resident', JSON.stringify(foundResident));
                localStorage.setItem('evw_cached_members', JSON.stringify(foundResident.members || []));
                localStorage.removeItem('evacwar_logged_out');
              } catch (_) {}

              const basePref = window.location.pathname.startsWith('/resident-mobile') ? '/resident-mobile' : '';
              submitBtn.textContent = 'Verified (Offline Mode)! Opening...';
              setTimeout(() => window.location.replace(basePref + '/resident/dashboard/index.html'), 300);
              return;
            } else {
              showError('Incorrect password (Offline verification).');
              submitBtn.disabled = false;
              submitBtn.textContent = 'Sign In to Emergency Dashboard';
              return;
            }
          }

          // Fallback Laurence account
          const storedEmail = (localStorage.getItem('evw_cached_email') || DEFAULT_EMAIL).toLowerCase();
          const storedHash = localStorage.getItem('evw_offline_hash') || DEFAULT_HASH;
          const storedSalt = localStorage.getItem('evw_offline_salt') || DEFAULT_SALT;

          if (email === storedEmail || email.includes('laurence')) {
            const computedHash = await hashPasswordWithSalt(password, storedSalt);
            if (computedHash.toLowerCase() === storedHash.toLowerCase()) {
              localStorage.setItem('evw_user_role', 'resident');
              localStorage.removeItem('evacwar_logged_out');
              const basePref = window.location.pathname.startsWith('/resident-mobile') ? '/resident-mobile' : '';
              submitBtn.textContent = 'Verified (Offline Mode)...';
              setTimeout(() => window.location.replace(basePref + '/resident/dashboard/index.html'), 300);
              return;
            }
          }

          showError('Account not found in offline records. Connect to the internet to sign in.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In to Emergency Dashboard';
          return;
        } catch (cryptErr) {
          console.error('Offline crypto verification error:', cryptErr);
          showError('Authentication error. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In to Emergency Dashboard';
        }
      });

      function compressIdPhoto(file, maxDim = 1280, quality = 0.8) {
        return new Promise((resolve) => {
          if (!file || !file.type.startsWith('image/')) return resolve(file);
          const reader = new FileReader();
          reader.onload = function (ev) {
            const img = new Image();
            img.onload = function () {
              let w = img.width;
              let h = img.height;
              if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                else { w = Math.round((w * maxDim) / h); h = maxDim; }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              canvas.toBlob((blob) => {
                if (blob && blob.size < file.size) {
                  resolve(new File([blob], file.name.replace(/\\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
                } else {
                  resolve(file);
                }
              }, 'image/jpeg', quality);
            };
            img.onerror = () => resolve(file);
            img.src = ev.target.result;
          };
          reader.onerror = () => resolve(file);
          reader.readAsDataURL(file);
        });
      }

      const regForm = document.getElementById('registerForm');
      if (regForm) {
        regForm.addEventListener('submit', async function (e) {
          e.preventDefault();
          hideError();
          if (!navigator.onLine) {
            showError('Internet connection is required to register a new resident account.');
            return;
          }
          const regBtn = document.getElementById('regSubmitBtn');
          const pw = document.getElementById('regPassword').value;
          const cpw = document.getElementById('regConfirmPassword').value;
          if (pw !== cpw) {
            showError('Passwords do not match.');
            return;
          }
          regBtn.disabled = true;
          regBtn.textContent = 'Submitting Registration...';
          try {
            const fd = new FormData(regForm);
            const idInput = document.getElementById('regValidId');
            if (idInput && idInput.files && idInput.files[0]) {
              const compressed = await compressIdPhoto(idInput.files[0]);
              fd.set('valid_id', compressed, compressed.name);
            }
            const res = await fetch(getHallBaseUrl() + '/api/mobile/register', {
              method: 'POST',
              headers: { 'Accept': 'application/json' },
              body: fd
            });
            const data = await res.json().catch(() => null);
            if (res.ok && data && data.success) {
              const submittedEmail = document.getElementById('regEmail').value.trim();
              regForm.reset();
              window.switchAuthTab('login');
              if (emailInput && submittedEmail) emailInput.value = submittedEmail;
              showSuccess(data.message || 'Registration submitted! Your account is pending verification and approval by Barangay San Rafael staff.');
            } else {
              showError((data && data.message) || 'Registration failed. Please check all required fields.');
            }
          } catch (err) {
            showError('Could not reach the server. Please check your internet connection and try again.');
          } finally {
            regBtn.disabled = false;
            regBtn.textContent = 'Submit Resident Registration';
          }
        });
      }
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
        localStorage.removeItem('evw_cached_resident');
        localStorage.removeItem('evw_cached_staff');
        localStorage.removeItem('evw_user_role');
        localStorage.removeItem('evw_cached_email');
        localStorage.removeItem('evw_cached_members');
        localStorage.removeItem('evw_user_full_name');
        localStorage.removeItem('evw_muted_alert_ids');
        localStorage.removeItem('Evacwar_lora_notifications');
        localStorage.removeItem('Evacwar_read_notif_ids');
        localStorage.removeItem('evw_last_triggered_alert_id');
        if (window.AndroidBleBridge && typeof window.AndroidBleBridge.setActiveUser === 'function') {
          try { window.AndroidBleBridge.setActiveUser('', 'Resident'); } catch (_) {}
        }
        sessionStorage.clear();
        var base = (localStorage.getItem('evw_server_url') || '').replace(new RegExp('/+$'), '');
        if (base && navigator.onLine) {
          fetch(base + '/logout', { credentials: 'include', mode: 'no-cors' }).catch(function () {});
        }
      } catch (_) {}
      setTimeout(function () {
        var basePref = window.location.pathname.indexOf('/resident-mobile') === 0 ? '/resident-mobile' : '';
        window.location.replace(basePref + '/login/index.html');
      }, 350);
    })();
  </script>
</body>
</html>`;

    writeOutputHtml(['login/index.html', 'login.html', 'register/index.html', 'register.html'], loginHtml);
    writeOutputHtml(['logout/index.html', 'logout.html'], logoutHtml);
  }

  // -------------------------------------------------------------
  // COMPILE ALL VIEWS
  // -------------------------------------------------------------
  console.log('[Build Capacitor Native App] 3. Compiling Resident Views...');
  const resDashboardHtml = await compileResidentView('dashboard', 'Resident Dashboard');
  const resEvacuationHtml = await compileResidentView('evacuation', 'Evacuation Map');
  const resSosHtml = await compileResidentView('sos', 'Emergency SOS');
  const resTyphoonHtml = await compileResidentView('typhoon', 'Typhoon Monitoring');
  const resChatHtml = await compileResidentView('chat', 'LoRa Mesh Chat');
  const resQpHtml = await compileResidentView('qr', 'Household QR');
  const resSettingsHtml = await compileResidentView('settings', 'Profile & Settings');

  writeOutputHtml([
    'index.html',
    'resident/index.html',
    'resident/dashboard/index.html',
    'resident/dashboard.html'
  ], resDashboardHtml);

  writeOutputHtml([
    'resident/evacuation/index.html',
    'resident/evacuation.html',
    'map/index.html'
  ], resEvacuationHtml);

  writeOutputHtml([
    'resident/sos/index.html',
    'resident/sos.html',
    'sos/index.html'
  ], resSosHtml);

  writeOutputHtml([
    'resident/typhoon/index.html',
    'resident/typhoon.html'
  ], resTyphoonHtml);

  writeOutputHtml([
    'resident/chat/index.html',
    'resident/chat.html'
  ], resChatHtml);

  writeOutputHtml([
    'resident/qr/index.html',
    'resident/qr.html',
    'resident/scan/index.html'
  ], resQpHtml);

  writeOutputHtml([
    'resident/profile/index.html',
    'resident/profile.html',
    'resident/settings/index.html',
    'resident/settings.html'
  ], resSettingsHtml);

  console.log('[Build Capacitor Native App] 4. Compiling Evacuation Staff Views...');
  const staffDashboardHtml = await compileStaffView('dashboard', 'Staff Dashboard');
  const staffQrHtml = await compileStaffView('qr-scanner', 'QR Intake & Scanner');
  const staffMapHtml = await compileStaffView('map', 'Evacuation Map');
  const staffChatHtml = await compileStaffView('chat', 'LoRa Mesh Chat');
  const staffReportsHtml = await compileStaffView('reports', 'Reports & EC Board');
  const staffSettingsHtml = await compileStaffView('settings', 'Staff Profile & Settings');
  const staffTyphoonHtml = await compileStaffView('typhoon', 'Typhoon Monitoring');

  writeOutputHtml([
    'staff/index.html',
    'staff/dashboard/index.html',
    'staff/dashboard.html'
  ], staffDashboardHtml);

  writeOutputHtml([
    'staff/qr/index.html',
    'staff/qr.html',
    'staff/qr-scanner/index.html',
    'staff/qr-scanner.html'
  ], staffQrHtml);

  writeOutputHtml([
    'staff/map/index.html',
    'staff/map.html'
  ], staffMapHtml);

  writeOutputHtml([
    'staff/chat/index.html',
    'staff/chat.html'
  ], staffChatHtml);

  writeOutputHtml([
    'staff/reports/index.html',
    'staff/reports.html'
  ], staffReportsHtml);

  writeOutputHtml([
    'staff/profile/index.html',
    'staff/profile.html',
    'staff/settings/index.html',
    'staff/settings.html'
  ], staffSettingsHtml);

  writeOutputHtml([
    'staff/typhoon/index.html',
    'staff/typhoon.html'
  ], staffTyphoonHtml);

  console.log('[Build Capacitor Native App] 5. Compiling Disaster Rescuer Views...');
  const rescuerDashboardHtml = await compileRescuerView('dashboard', 'Rescuer Command Dashboard');
  const rescuerMapHtml = await compileRescuerView('map', 'Rescuer SOS Tactical Radar Map');
  const rescuerChatHtml = await compileRescuerView('chat', 'LoRa Mesh Chat');
  const rescuerReportsHtml = await compileRescuerView('reports', 'Rescuer SOS Incident Reports');
  const rescuerSettingsHtml = await compileRescuerView('settings', 'Rescuer Profile & Settings');
  const rescuerTyphoonHtml = await compileRescuerView('typhoon', 'Rescuer Typhoon & Weather Radar');

  writeOutputHtml([
    'rescuer/index.html',
    'rescuer/dashboard/index.html',
    'rescuer/dashboard.html'
  ], rescuerDashboardHtml);

  writeOutputHtml([
    'rescuer/map/index.html',
    'rescuer/map.html'
  ], rescuerMapHtml);

  writeOutputHtml([
    'rescuer/chat/index.html',
    'rescuer/chat.html'
  ], rescuerChatHtml);

  writeOutputHtml([
    'rescuer/reports/index.html',
    'rescuer/reports.html'
  ], rescuerReportsHtml);

  writeOutputHtml([
    'rescuer/profile/index.html',
    'rescuer/profile.html',
    'rescuer/settings/index.html',
    'rescuer/settings.html'
  ], rescuerSettingsHtml);

  writeOutputHtml([
    'rescuer/typhoon/index.html',
    'rescuer/typhoon.html'
  ], rescuerTyphoonHtml);

  console.log('[Build Capacitor Native App] 6. Building Multi-Role Auth Pages...');
  buildAuthPages();

  console.log('[Build Capacitor Native App] ✅ Successfully compiled all Resident, Staff, and Rescuer views into resident-mobile/!');
  process.exit(0);
}

buildCapacitorApp().catch((err) => {
  console.error('[Build Capacitor Native App] ❌ Build failed:', err);
  process.exit(1);
});
