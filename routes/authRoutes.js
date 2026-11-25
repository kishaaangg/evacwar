const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { redirectIfAuth } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');
const persistentPhotoStore = require('../utils/persistentPhotoStore');
const db = require('../config/db');
const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

router.get("/login", redirectIfAuth, authController.getLogin);
router.post("/login", authController.postLogin);
router.all("/login", (req, res) => {
  res.setHeader("Allow", "GET, POST");
  res.status(405).send("Method Not Allowed");
});

router.get(["/logout", "/logout/index.html", "/logout/"], authController.logout);
router.post(["/logout", "/logout/index.html", "/logout/"], authController.logout);
router.all(["/logout", "/logout/index.html", "/logout/"], (req, res) => {
  res.setHeader("Allow", "GET, POST");
  res.status(405).send("Method Not Allowed");
});

router.get("/register", redirectIfAuth, authController.getRegister);
router.post("/register", upload.fields([
  { name: 'valid_id', maxCount: 1 },
  { name: 'barangay_id_photo', maxCount: 1 },
  { name: 'id_photo', maxCount: 1 }
]), authController.postRegister);
router.post("/api/mobile/register", upload.fields([
  { name: 'valid_id', maxCount: 1 },
  { name: 'barangay_id_photo', maxCount: 1 },
  { name: 'id_photo', maxCount: 1 }
]), (req, res, next) => {
  req.headers.accept = 'application/json';
  return authController.postRegister(req, res, next);
});
router.all("/register", (req, res) => {
  res.setHeader("Allow", "GET, POST");
  res.status(405).send("Method Not Allowed");
});

// Lightweight session validation endpoint for BFCache and history navigation
router.get("/auth/check", (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  if (req.session && req.session.userId) {
    return res.json({ authenticated: true, role: req.session.role });
  }
  return res.json({ authenticated: false });
});

// =========================================================================
// POST /api/mobile/login (CAPACITOR NATIVE RESIDENT AUTHENTICATION)
// Authenticates credentials against Barangay Hall MySQL database and returns
// offline-cacheable verification salt & hash for offline fallback.
// Supports all 82 resident accounts from MySQL.
// =========================================================================
router.post('/api/mobile/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email/username and password.' });
    }

    const trimmed = String(email).trim().toLowerCase();
    const user = await User.findByEmailOrContact(trimmed);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    const isMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    // Generate secure offline verification salt & hash (SHA-256 with 16-byte random salt)
    const salt = crypto.randomBytes(16).toString('hex');
    const offlineHash = crypto.createHash('sha256').update(String(password) + ':' + salt).digest('hex');

    // 1. Check if user is Staff or Rescuer (role === 'staff' or linked staff row)
    const [staffRows] = await db.query(
      `SELECT s.*, ec.name AS assigned_center_name, ec.address AS assigned_center_address
       FROM staff s
       LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
       WHERE s.user_id = ? LIMIT 1`,
      [user.id]
    );
    const staffRecord = staffRows && staffRows[0] ? staffRows[0] : null;

    if (user.role === 'staff' || staffRecord) {
      const isRescuer = (staffRecord && staffRecord.staff_type === 'RESCUER') || user.staff_type === 'RESCUER';
      const staffType = isRescuer ? 'RESCUER' : 'EVACUATION';
      const appRole = isRescuer ? 'rescuer' : 'staff';
      const redirectUrl = isRescuer ? '/rescuer/dashboard/index.html' : '/staff/dashboard/index.html';

      const sFullName = staffRecord
        ? `${staffRecord.first_name || ''} ${staffRecord.last_name || ''}`.trim()
        : (user.name || 'Staff Member');

      const sPhoto = staffRecord && staffRecord.profile_photo
        ? (staffRecord.profile_photo.startsWith('http') || staffRecord.profile_photo.startsWith('/')
          ? staffRecord.profile_photo
          : `/uploads/profiles/${staffRecord.profile_photo}`)
        : null;

      const staffContext = {
        id: staffRecord ? staffRecord.id : user.id,
        userId: user.id,
        user_id: user.id,
        name: sFullName,
        full_name: sFullName,
        first_name: staffRecord ? (staffRecord.first_name || 'Staff') : 'Staff',
        middle_name: staffRecord ? (staffRecord.middle_name || '') : '',
        last_name: staffRecord ? (staffRecord.last_name || '') : '',
        email: user.email,
        role: 'staff',
        staff_type: staffType,
        assigned_center_id: staffRecord ? staffRecord.assigned_center_id : null,
        assigned_center_name: staffRecord ? (staffRecord.assigned_center_name || 'San Rafael Evacuation Center') : 'San Rafael Evacuation Center',
        assigned_center_address: staffRecord ? (staffRecord.assigned_center_address || 'Barangay San Rafael, Baao, Camarines Sur') : 'Barangay San Rafael, Baao, Camarines Sur',
        contact_number: staffRecord ? (staffRecord.contact_number || '') : '',
        occupation: staffRecord ? (staffRecord.occupation || '') : '',
        profile_photo: sPhoto
      };

      if (req.session) {
        req.session.userId = user.id;
        req.session.role = 'staff';
        req.session.staffId = staffContext.id;
        req.session.staffType = staffType;
        req.session.userName = sFullName;
      }

      return res.json({
        success: true,
        message: 'Staff authentication successful',
        role: appRole,
        redirectUrl: redirectUrl,
        user: {
          id: user.id,
          name: sFullName,
          email: user.email,
          role: 'staff',
          staff_type: staffType
        },
        staff: staffContext,
        offlineAuth: {
          salt: salt,
          hash: offlineHash
        }
      });
    }

    // 2. Otherwise verify Resident record
    const [residentRows] = await db.query('SELECT * FROM residents WHERE user_id = ? LIMIT 1', [user.id]);
    const resident = residentRows && residentRows[0] ? residentRows[0] : null;

    if (!resident && user.role !== 'resident') {
      return res.status(403).json({ success: false, message: 'Invalid role for mobile app. Registered residents, staff, and rescuers only.' });
    }

    const approvalStatus = resident ? (resident.approval_status || 'APPROVED') : (user.approval_status || (user.is_verified ? 'APPROVED' : 'PENDING'));
    if (approvalStatus === 'REJECTED') {
      return res.status(403).json({ success: false, message: 'Your resident registration was rejected. Please contact Barangay San Rafael office.' });
    }

    const [members] = resident ? await db.query('SELECT * FROM household_members WHERE resident_id = ?', [resident.id]) : [[]];

    const fullName = resident
      ? `${resident.first_name || ''} ${resident.last_name || ''}`.trim()
      : (user.name || user.email.split('@')[0]);

    const resolvedPhoto = resident && resident.profile_photo
      ? (resident.profile_photo.startsWith('http') || resident.profile_photo.startsWith('/')
        ? resident.profile_photo
        : `/uploads/profiles/${resident.profile_photo}`)
      : null;

    const userContext = {
      id: resident ? resident.id : user.id,
      user_id: user.id,
      resident_id: resident ? resident.id : 0,
      name: fullName,
      full_name: fullName,
      first_name: resident ? (resident.first_name || 'Resident') : (user.first_name || 'Resident'),
      middle_name: resident ? (resident.middle_name || '') : '',
      last_name: resident ? (resident.last_name || '') : '',
      email: user.email,
      role: 'resident',
      contact_number: resident ? (resident.contact_number || '') : (user.contact_number || ''),
      barangay: resident ? (resident.barangay || 'San Rafael') : 'San Rafael',
      home_address: resident ? (resident.home_address || '') : '',
      sex: resident ? (resident.sex || 'Male') : 'Male',
      birthdate: resident ? resident.birthdate : null,
      age: resident ? (resident.age || 0) : 0,
      family_size: resident ? (resident.family_size || 1) : 1,
      vulnerability: resident ? (resident.vulnerability || 'NONE') : 'NONE',
      has_special_needs: resident ? Boolean(resident.has_special_needs) : false,
      is_4ps: resident ? Boolean(resident.is_4ps) : false,
      is_pregnant: resident ? Boolean(resident.is_pregnant) : false,
      is_lactating: resident ? Boolean(resident.is_lactating) : false,
      is_pwd: resident ? Boolean(resident.is_pwd) : false,
      is_single_head: resident ? Boolean(resident.is_single_head) : false,
      has_serious_illness: resident ? Boolean(resident.has_serious_illness) : false,
      serious_illness_details: resident ? (resident.serious_illness_details || '') : '',
      emergency_contact_name: resident ? (resident.emergency_contact_name || '') : '',
      emergency_contact_phone: resident ? (resident.emergency_contact_phone || '') : '',
      profile_photo: resolvedPhoto,
      qr_code_uuid: resident ? (resident.qr_code_uuid || `evw-resident-${resident.id}`) : `evw-user-${user.id}`,
      approval_status: approvalStatus
    };

    // Initialize express session so subsequent requests with credentials: 'include' work seamlessly
    if (req.session) {
      req.session.userId = user.id;
      req.session.role = 'resident';
      req.session.userName = fullName;
      if (resident) req.session.residentId = resident.id;
    }

    return res.json({
      success: true,
      message: 'Authentication successful',
      role: 'resident',
      redirectUrl: '/resident/dashboard/index.html',
      user: {
        id: user.id,
        email: user.email,
        role: 'resident'
      },
      resident: userContext,
      members: members || [],
      offlineAuth: {
        salt: salt,
        hash: offlineHash
      }
    });
  } catch (err) {
    console.error('Error in /api/mobile/login:', err);
    return res.status(500).json({ success: false, message: 'Server error during mobile authentication.' });
  }
});

// =========================================================================
// =========================================================================
// GET /api/mobile/me
// Fetches the authenticated mobile user's latest profile (Resident, Staff, or Rescuer)
// =========================================================================
router.get('/api/mobile/me', async (req, res) => {
  try {
    const userId = Number((req.session && req.session.userId) || req.headers['x-evakwar-mobile-user-id'] || 0);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }
    const [uRows] = await db.query('SELECT id, email, role, is_verified FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!uRows || uRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = uRows[0];
    const roleLower = String(user.role || '').toLowerCase();

    // Support Staff & Rescuer accounts
    if (roleLower === 'staff' || roleLower === 'rescuer' || roleLower === 'barangay_council') {
      const [sRows] = await db.query(
        `SELECT s.*, ec.name AS assigned_center_name
         FROM staff s
         LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
         WHERE s.user_id = ? LIMIT 1`,
        [user.id]
      );
      const staff = sRows && sRows[0] ? sRows[0] : null;
      if (!staff) {
        return res.json({ success: true, role: roleLower, staff: null });
      }
      const fullName = `${staff.first_name || ''} ${staff.middle_name ? staff.middle_name + ' ' : ''}${staff.last_name || ''}`.trim() || 'Staff Member';
      const resolvedPhoto = staff.profile_photo
        ? (staff.profile_photo.startsWith('http') || staff.profile_photo.startsWith('/')
          ? staff.profile_photo
          : `/uploads/profiles/${staff.profile_photo}`)
        : null;
      const isRescuer = String(staff.staff_type || '').toUpperCase() === 'RESCUER' || roleLower === 'rescuer';
      return res.json({
        success: true,
        role: isRescuer ? 'rescuer' : 'staff',
        staff: {
          id: staff.id,
          staff_id: staff.id,
          user_id: user.id,
          userId: user.id,
          name: fullName,
          full_name: fullName,
          first_name: staff.first_name || '',
          middle_name: staff.middle_name || '',
          last_name: staff.last_name || '',
          email: user.email,
          role: isRescuer ? 'rescuer' : 'staff',
          staff_type: staff.staff_type || (isRescuer ? 'RESCUER' : 'EVACUATION'),
          occupation: staff.occupation || (isRescuer ? 'Emergency Rescuer' : 'Evacuation Site Staff'),
          contact_number: staff.contact_number || '',
          assigned_center_id: staff.assigned_center_id || null,
          assigned_center_name: staff.assigned_center_name || 'Unassigned',
          profile_photo: resolvedPhoto
        }
      });
    }

    const [rRows] = await db.query('SELECT * FROM residents WHERE user_id = ? LIMIT 1', [user.id]);
    const resident = rRows && rRows[0] ? rRows[0] : null;
    if (!resident) {
      return res.json({ success: true, role: 'resident', resident: null, members: [] });
    }
    const [members] = await db.query('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [resident.id]);
    const fullName = `${resident.first_name || ''} ${resident.last_name || ''}`.trim() || 'Resident';
    const resolvedPhoto = resident.profile_photo
      ? (resident.profile_photo.startsWith('http') || resident.profile_photo.startsWith('/')
        ? resident.profile_photo
        : `/uploads/profiles/${resident.profile_photo}`)
      : null;
    return res.json({
      success: true,
      role: 'resident',
      resident: {
        id: resident.id,
        user_id: user.id,
        resident_id: resident.id,
        name: fullName,
        full_name: fullName,
        first_name: resident.first_name || '',
        middle_name: resident.middle_name || '',
        last_name: resident.last_name || '',
        email: user.email,
        role: 'resident',
        contact_number: resident.contact_number || '',
        barangay: resident.barangay || 'San Rafael',
        home_address: resident.home_address || '',
        sex: resident.sex || 'Male',
        birthdate: resident.birthdate || null,
        age: resident.age || 0,
        family_size: resident.family_size || 1,
        vulnerability: resident.vulnerability || 'NONE',
        has_special_needs: Boolean(resident.has_special_needs),
        is_4ps: Boolean(resident.is_4ps),
        is_pregnant: Boolean(resident.is_pregnant),
        is_lactating: Boolean(resident.is_lactating),
        is_pwd: Boolean(resident.is_pwd),
        is_single_head: Boolean(resident.is_single_head),
        has_serious_illness: Boolean(resident.has_serious_illness),
        serious_illness_details: resident.serious_illness_details || '',
        emergency_contact_name: resident.emergency_contact_name || '',
        emergency_contact_phone: resident.emergency_contact_phone || '',
        profile_photo: resolvedPhoto,
        qr_code_uuid: resident.qr_code_uuid || `evw-resident-${resident.id}`,
        approval_status: resident.approval_status || (user.is_verified ? 'APPROVED' : 'PENDING')
      },
      members: members || []
    });
  } catch (err) {
    console.error('Error in GET /api/mobile/me:', err);
    return res.status(500).json({ success: false, message: 'Server error loading profile.' });
  }
});

// =========================================================================
// POST /api/mobile/profile/update
// Updates profile info, avatar photo, and password in MySQL for Residents, Staff & Rescuers
// =========================================================================
router.post('/api/mobile/profile/update', upload.single('profile_photo'), async (req, res) => {
  try {
    const userId = Number(
      req.body.user_id ||
      req.body.userId ||
      (req.session && req.session.userId) ||
      req.headers['x-evakwar-mobile-user-id'] ||
      0
    );
    const residentId = Number(req.body.resident_id || req.body.residentId || (req.session && req.session.residentId) || 0);
    const staffId = Number(req.body.staff_id || req.body.staffId || 0);

    if (!userId && !residentId && !staffId) {
      return res.status(400).json({ success: false, message: 'Missing authenticated user ID.' });
    }

    // Look up user account first
    let userRow = null;
    if (userId) {
      const [uRows] = await db.query('SELECT id, email, role, password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
      userRow = uRows && uRows[0] ? uRows[0] : null;
    }

    // 1. Handle Password Change (for ANY role: Resident, Staff, Rescuer, Admin)
    const { current_password, new_password, confirm_password } = req.body;
    if (current_password || new_password || confirm_password) {
      if (!userRow) {
        return res.status(404).json({ success: false, message: 'User account not found.' });
      }
      if (!current_password || !new_password || !confirm_password) {
        return res.status(400).json({ success: false, message: 'Please fill out all password fields.' });
      }
      if (new_password !== confirm_password) {
        return res.status(400).json({ success: false, message: 'New password and confirmation password do not match.' });
      }
      if (String(new_password).length < 8 || !/[a-zA-Z]/.test(new_password) || !/[0-9]/.test(new_password)) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters with both letters and numbers.' });
      }
      const bcrypt = require('bcryptjs');
      const isMatch = await bcrypt.compare(String(current_password), userRow.password_hash);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(String(new_password), salt);
      await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userRow.id]);
      return res.json({ success: true, message: 'Password updated successfully!' });
    }

    // Guard against dummy build-time placeholder emails accidentally overwriting real emails
    const PLACEHOLDER_EMAILS = new Set(['resident@sanrafael.gov.ph', 'staff@sanrafael.gov.ph', 'rescuer@sanrafael.gov.ph']);
    const validateAndUpdateEmail = async (targetUserId, currentEmail) => {
      if (!req.body.email || !targetUserId) return currentEmail;
      const cleanEmail = String(req.body.email).trim().toLowerCase();
      if (!cleanEmail || cleanEmail === String(currentEmail || '').toLowerCase()) return currentEmail;
      if (PLACEHOLDER_EMAILS.has(cleanEmail) && currentEmail && !PLACEHOLDER_EMAILS.has(String(currentEmail).toLowerCase())) {
        return currentEmail;
      }
      const [dup] = await db.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [cleanEmail, targetUserId]);
      if (dup && dup.length > 0) {
        throw new Error('That email address is already used by another account.');
      }
      await db.query('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, targetUserId]);
      return cleanEmail;
    };

    const roleLower = String((userRow && userRow.role) || req.body.role || '').toLowerCase();

    // 2. Staff & Rescuer Profile Update (MySQL `staff` + `users`)
    if (roleLower === 'staff' || roleLower === 'rescuer' || roleLower === 'barangay_council' || (staffId && !residentId)) {
      const [sRows] = staffId
        ? await db.query('SELECT * FROM staff WHERE id = ? LIMIT 1', [staffId])
        : await db.query('SELECT * FROM staff WHERE user_id = ? LIMIT 1', [userId]);
      if (!sRows || sRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Staff record not found.' });
      }
      const curStaff = sRows[0];
      if (!userRow && curStaff.user_id) {
        const [uRows2] = await db.query('SELECT id, email, role FROM users WHERE id = ? LIMIT 1', [curStaff.user_id]);
        userRow = uRows2 && uRows2[0] ? uRows2[0] : null;
      }

      const firstName = (req.body.first_name !== undefined && String(req.body.first_name).trim() !== '') ? String(req.body.first_name).trim() : curStaff.first_name;
      const middleName = req.body.middle_name !== undefined ? String(req.body.middle_name).trim() : curStaff.middle_name;
      const lastName = (req.body.last_name !== undefined && String(req.body.last_name).trim() !== '') ? String(req.body.last_name).trim() : curStaff.last_name;
      const occupation = req.body.occupation !== undefined ? String(req.body.occupation).trim() : curStaff.occupation;
      const contact = req.body.contact_number !== undefined ? String(req.body.contact_number).trim() : curStaff.contact_number;
      let profilePhoto = curStaff.profile_photo;
      if (req.file && req.file.filename) {
        profilePhoto = req.file.filename;
        await persistentPhotoStore.save(req.file.filename, req.file.path, req.file.mimetype).catch(() => {});
      }

      let updatedEmail = userRow ? userRow.email : '';
      try {
        updatedEmail = await validateAndUpdateEmail(curStaff.user_id, updatedEmail);
      } catch (emailErr) {
        return res.status(400).json({ success: false, message: emailErr.message });
      }

      await db.query(
        `UPDATE staff SET first_name = ?, middle_name = ?, last_name = ?, occupation = ?, contact_number = ?, profile_photo = ? WHERE id = ?`,
        [firstName, middleName || null, lastName, occupation || null, contact || null, profilePhoto, curStaff.id]
      );

      const [updatedStaffRows] = await db.query(
        `SELECT s.*, ec.name AS assigned_center_name FROM staff s LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id WHERE s.id = ? LIMIT 1`,
        [curStaff.id]
      );
      const upd = updatedStaffRows[0];
      const fullName = `${upd.first_name || ''} ${upd.middle_name ? upd.middle_name + ' ' : ''}${upd.last_name || ''}`.trim();
      let resolvedPhoto = upd.profile_photo
        ? (upd.profile_photo.startsWith('http') || upd.profile_photo.startsWith('/') ? upd.profile_photo : `/uploads/profiles/${upd.profile_photo}`)
        : null;
      if (resolvedPhoto && req.file && req.file.filename) {
        resolvedPhoto = `${resolvedPhoto}?t=${Date.now()}`;
      }
      const isRescuer = String(upd.staff_type || '').toUpperCase() === 'RESCUER' || roleLower === 'rescuer';

      return res.json({
        success: true,
        message: 'Profile updated successfully!',
        role: isRescuer ? 'rescuer' : 'staff',
        staff: {
          ...upd,
          staff_id: upd.id,
          userId: upd.user_id,
          name: fullName,
          full_name: fullName,
          email: updatedEmail,
          role: isRescuer ? 'rescuer' : 'staff',
          profile_photo: resolvedPhoto
        }
      });
    }

    // 3. Resident Profile Update (MySQL `residents` + `users`)
    let query = 'SELECT * FROM residents WHERE id = ? LIMIT 1';
    let param = residentId;
    if (!residentId) {
      query = 'SELECT * FROM residents WHERE user_id = ? LIMIT 1';
      param = userId;
    }
    const [rows] = await db.query(query, [param]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Resident record not found.' });
    }
    const current = rows[0];
    if (!userRow && current.user_id) {
      const [uRows3] = await db.query('SELECT id, email, role FROM users WHERE id = ? LIMIT 1', [current.user_id]);
      userRow = uRows3 && uRows3[0] ? uRows3[0] : null;
    }

    const firstName = (req.body.first_name !== undefined && String(req.body.first_name).trim() !== '') ? String(req.body.first_name).trim() : current.first_name;
    const middleName = req.body.middle_name !== undefined ? String(req.body.middle_name).trim() : current.middle_name;
    const lastName = (req.body.last_name !== undefined && String(req.body.last_name).trim() !== '') ? String(req.body.last_name).trim() : current.last_name;
    const contact = req.body.contact_number !== undefined ? String(req.body.contact_number).trim() : current.contact_number;
    const address = req.body.home_address !== undefined ? String(req.body.home_address).trim() : current.home_address;
    const barangay = req.body.barangay !== undefined ? String(req.body.barangay).trim() : (current.barangay || 'San Rafael');
    const sex = req.body.sex !== undefined ? req.body.sex : current.sex;
    const birthdate = req.body.birthdate !== undefined ? (String(req.body.birthdate).trim() || null) : current.birthdate;
    let age = req.body.age !== undefined ? (parseInt(req.body.age, 10) || current.age) : current.age;
    if (req.body.birthdate !== undefined && birthdate && (req.body.age === undefined || req.body.age === '')) {
      const bDate = new Date(birthdate);
      if (!isNaN(bDate.getTime())) {
        const now = new Date();
        let computed = now.getFullYear() - bDate.getFullYear();
        const mDiff = now.getMonth() - bDate.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < bDate.getDate())) computed--;
        if (computed >= 0 && computed <= 130) age = computed;
      }
    }
    const familySize = req.body.family_size !== undefined ? (parseInt(req.body.family_size, 10) || current.family_size) : current.family_size;
    const vulnerability = req.body.vulnerability !== undefined ? String(req.body.vulnerability).trim() : current.vulnerability;

    const is4ps = req.body.is_4ps !== undefined ? (req.body.is_4ps === '1' || req.body.is_4ps === true || req.body.is_4ps === 'true' ? 1 : 0) : current.is_4ps;
    const isPregnant = req.body.is_pregnant !== undefined ? (req.body.is_pregnant === '1' || req.body.is_pregnant === true || req.body.is_pregnant === 'true' ? 1 : 0) : current.is_pregnant;
    const isLactating = req.body.is_lactating !== undefined ? (req.body.is_lactating === '1' || req.body.is_lactating === true || req.body.is_lactating === 'true' ? 1 : 0) : current.is_lactating;
    const isPwd = req.body.is_pwd !== undefined ? (req.body.is_pwd === '1' || req.body.is_pwd === true || req.body.is_pwd === 'true' ? 1 : 0) : current.is_pwd;
    const isSingleHead = req.body.is_single_head !== undefined ? (req.body.is_single_head === '1' || req.body.is_single_head === true || req.body.is_single_head === 'true' ? 1 : 0) : current.is_single_head;
    const hasSeriousIllness = req.body.has_serious_illness !== undefined ? (req.body.has_serious_illness === '1' || req.body.has_serious_illness === true || req.body.has_serious_illness === 'true' ? 1 : 0) : current.has_serious_illness;
    const seriousIllnessDetails = req.body.serious_illness_details !== undefined ? String(req.body.serious_illness_details).trim() : current.serious_illness_details;
    const emergName = req.body.emergency_contact_name !== undefined ? String(req.body.emergency_contact_name).trim() : current.emergency_contact_name;
    const emergPhone = req.body.emergency_contact_phone !== undefined ? String(req.body.emergency_contact_phone).trim() : current.emergency_contact_phone;

    let profilePhoto = current.profile_photo;
    if (req.file && req.file.filename) {
      profilePhoto = req.file.filename;
      await persistentPhotoStore.save(req.file.filename, req.file.path, req.file.mimetype).catch(() => {});
    }

    let updatedEmail = userRow ? userRow.email : '';
    try {
      updatedEmail = await validateAndUpdateEmail(current.user_id, updatedEmail);
    } catch (emailErr) {
      return res.status(400).json({ success: false, message: emailErr.message });
    }

    await db.query(`
      UPDATE residents SET
        first_name = ?,
        middle_name = ?,
        last_name = ?,
        contact_number = ?,
        home_address = ?,
        barangay = ?,
        sex = ?,
        birthdate = ?,
        age = ?,
        family_size = ?,
        vulnerability = ?,
        is_4ps = ?,
        is_pregnant = ?,
        is_lactating = ?,
        is_pwd = ?,
        is_single_head = ?,
        has_serious_illness = ?,
        serious_illness_details = ?,
        emergency_contact_name = ?,
        emergency_contact_phone = ?,
        profile_photo = ?
      WHERE id = ?
    `, [
      firstName, middleName, lastName, contact, address, barangay, sex, birthdate || null,
      age || null, familySize || 1, vulnerability || 'NONE', is4ps, isPregnant, isLactating,
      isPwd, isSingleHead, hasSeriousIllness, seriousIllnessDetails || null, emergName || null,
      emergPhone || null, profilePhoto, current.id
    ]);

    // Return updated resident profile WITH live email & resolved profile_photo path
    const [updatedRows] = await db.query('SELECT * FROM residents WHERE id = ?', [current.id]);
    const updated = updatedRows[0];
    const fullName = `${updated.first_name || ''} ${updated.last_name || ''}`.trim();
    const resolvedPhoto = updated.profile_photo
      ? (updated.profile_photo.startsWith('http') || updated.profile_photo.startsWith('/') ? updated.profile_photo : `/uploads/profiles/${updated.profile_photo}`)
      : null;

    return res.json({
      success: true,
      message: 'Profile updated successfully!',
      role: 'resident',
      resident: {
        ...updated,
        resident_id: updated.id,
        name: fullName,
        full_name: fullName,
        email: updatedEmail,
        role: 'resident',
        profile_photo: resolvedPhoto
      }
    });
  } catch (err) {
    console.error('Error in /api/mobile/profile/update:', err);
    return res.status(500).json({ success: false, message: 'Server error updating profile: ' + err.message });
  }
});

// =========================================================================
// POST /api/mobile/members/save
// Adds or edits a household member in MySQL
// =========================================================================
router.post('/api/mobile/members/save', upload.single('profile_photo'), async (req, res) => {
  try {
    const residentId = req.body.resident_id || req.body.residentId || (req.session && req.session.residentId);
    if (!residentId) {
      return res.status(400).json({ success: false, message: 'Missing resident_id.' });
    }

    const memberId = req.body.id ? parseInt(req.body.id, 10) : null;
    const firstName = String(req.body.first_name || '').trim();
    const middleName = String(req.body.middle_name || '').trim();
    const lastName = String(req.body.last_name || '').trim();
    const relation = String(req.body.relation || 'Dependent').trim();
    const sex = req.body.sex || 'Male';
    const birthdate = req.body.birthdate || null;
    const age = req.body.age ? parseInt(req.body.age, 10) : null;
    const isPregnant = (req.body.is_pregnant === '1' || req.body.is_pregnant === true || req.body.is_pregnant === 'true') ? 1 : 0;
    const isLactating = (req.body.is_lactating === '1' || req.body.is_lactating === true || req.body.is_lactating === 'true') ? 1 : 0;
    const isPwd = (req.body.is_pwd === '1' || req.body.is_pwd === true || req.body.is_pwd === 'true') ? 1 : 0;
    const hasSeriousIllness = (req.body.has_serious_illness === '1' || req.body.has_serious_illness === true || req.body.has_serious_illness === 'true') ? 1 : 0;
    const seriousIllnessDetails = String(req.body.serious_illness_details || '').trim();
    const profilePhoto = req.file ? req.file.filename : (req.body.profile_photo || null);
    if (req.file && req.file.filename) {
      await persistentPhotoStore.save(req.file.filename, req.file.path, req.file.mimetype).catch(() => {});
    }

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'First name and last name are required.' });
    }

    if (memberId) {
      await db.query(`
        UPDATE household_members SET
          first_name = ?, middle_name = ?, last_name = ?, relation = ?,
          sex = ?, birthdate = ?, age = ?, is_pregnant = ?, is_lactating = ?,
          is_pwd = ?, has_serious_illness = ?, serious_illness_details = ?, profile_photo = COALESCE(?, profile_photo)
        WHERE id = ? AND resident_id = ?
      `, [
        firstName, middleName, lastName, relation, sex, birthdate, age,
        isPregnant, isLactating, isPwd, hasSeriousIllness, seriousIllnessDetails || null,
        profilePhoto, memberId, residentId
      ]);
    } else {
      await db.query(`
        INSERT INTO household_members
        (resident_id, first_name, middle_name, last_name, relation, sex, birthdate, age, status, is_pregnant, is_lactating, is_pwd, has_serious_illness, serious_illness_details, profile_photo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NORMAL', ?, ?, ?, ?, ?, ?)
      `, [
        residentId, firstName, middleName, lastName, relation, sex, birthdate,
        age, isPregnant, isLactating, isPwd, hasSeriousIllness, seriousIllnessDetails || null,
        profilePhoto
      ]);
    }

    // Refresh member list
    const [members] = await db.query('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [residentId]);
    return res.json({ success: true, message: 'Household member saved successfully!', members: members || [] });
  } catch (err) {
    console.error('Error in /api/mobile/members/save:', err);
    return res.status(500).json({ success: false, message: 'Server error saving household member: ' + err.message });
  }
});

// =========================================================================
// POST /api/mobile/members/delete
// Deletes a household member from MySQL
// =========================================================================
router.post('/api/mobile/members/delete', async (req, res) => {
  try {
    const memberId = req.body.id || req.body.memberId;
    const residentId = req.body.resident_id || req.body.residentId || (req.session && req.session.residentId);

    if (!memberId) {
      return res.status(400).json({ success: false, message: 'Missing member id.' });
    }

    if (residentId) {
      await db.query('DELETE FROM household_members WHERE id = ? AND resident_id = ?', [memberId, residentId]);
    } else {
      await db.query('DELETE FROM household_members WHERE id = ?', [memberId]);
    }

    const [members] = residentId ? await db.query('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [residentId]) : [[]];
    return res.json({ success: true, message: 'Member deleted successfully.', members: members || [] });
  } catch (err) {
    console.error('Error in /api/mobile/members/delete:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting member: ' + err.message });
  }
});

// =========================================================================
// GET /api/mobile/resident/:id
// Fetches fresh resident record + household members for sync
// =========================================================================
router.get('/api/mobile/resident/:id', async (req, res) => {
  try {
    const resId = req.params.id;
    const [rows] = await db.query('SELECT * FROM residents WHERE id = ? OR user_id = ? LIMIT 1', [resId, resId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Resident not found.' });
    }
    const resident = rows[0];
    const [members] = await db.query('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [resident.id]);
    return res.json({ success: true, resident, members: members || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
