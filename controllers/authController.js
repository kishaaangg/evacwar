const db = require('../config/db');
const sharedSimData = require('../utils/simData');
const User = require('../models/userModel');
const Resident = require('../models/residentModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { 
  isValidPhoneNumber, 
  PHONE_ERROR_MESSAGE, 
  isValidZone, 
  ZONE_ERROR_MESSAGE, 
  isValidPassword, 
  PASSWORD_ERROR_MESSAGE 
} = require('../utils/validators');
const { setNoCacheHeaders } = require('../middleware/authMiddleware');

exports.getWelcome = (req, res) => {
  setNoCacheHeaders(res);
  // Inside the native Android APK WebView, skip the public website Welcome/Download page and go straight to /login
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  const isAndroidAppWebView = /; wv\)/i.test(ua) || String((req && req.headers && req.headers['x-requested-with']) || '').includes('ph.gov.baao.evakwar');
  if (isAndroidAppWebView) {
    return res.redirect('/login');
  }
  res.render("auth/welcome", {
    ...sharedSimData(),
    user: res.locals.user || { name: "Guest", role: "guest" },
    page: { title: "Welcome" }
  });
};

exports.getLogin = (_req, res) => {
  setNoCacheHeaders(res);
  res.render("auth/login", {
    ...sharedSimData(),
    user: res.locals.user || { name: "Guest", role: "guest" },
    page: { title: "Login" }
  });
};

exports.getRegister = (_req, res) => {
  res.render("auth/register", {
    ...sharedSimData(),
    user: res.locals.user || { name: "Guest", role: "guest" },
    page: { title: "Register" },
    sim: {
      assignedCenters: [
        "Ekpan Elementary School",
        "Simplicio Agnas Residence",
        "Susan Ornido Residence",
        "Bernadita Baracena Residence",
        "Ronie Barcelona Sr. Residence",
        "Estrella Cadag Residence",
        "Gerly Payra Residence",
        "Joel Bayos Residence"
      ]
    }
  });
};

exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const respondError = (status, msg, extra = {}) => {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(status).json({ success: false, message: msg, ...extra });
      }
      return res.status(status).render("auth/login", {
        ...sharedSimData(),
        user: { name: "Guest", role: "guest" },
        page: { title: "Login" },
        error: msg
      });
    };

    if (!email || !password) {
      return respondError(400, "Please provide both username/email and password.");
    }

    const trimmedIdentifier = email.trim();
    const user = await User.findByEmailOrContact(trimmedIdentifier);
    if (!user) {
      return respondError(401, "Invalid username/email or password.");
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return respondError(401, "Invalid username/email or password.");
    }

    // Step 2 Requirement: Only approved residents can log in and generate their QR evacuation pass
    if (user.role === 'resident') {
      const approvalStatus = user.approval_status || (user.is_verified ? 'APPROVED' : 'PENDING');
      if (approvalStatus === 'REJECTED') {
        return respondError(403, "Your resident registration was not approved by the Barangay San Rafael office. Please visit the Barangay Hall for assistance.", { status: 'REJECTED' });
      }
      if (approvalStatus === 'PENDING' || !user.is_verified) {
        return respondError(403, "Your account is pending verification and approval by Barangay San Rafael administrators or staff. You will be able to log in and access your QR pass once approved.", { status: 'PENDING' });
      }
    }

    // Cleanly establish fresh session on login (prevents session fixation or account bleed)
    const establishSession = () => {
      req.session.userId = user.id;
      req.session.role = user.role;
      req.session.staffType = (user.role === 'staff' || user.role === 'barangay_council') ? (user.staff_type || 'BOTH') : null;
      req.session.userName = (user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user.email.split('@')[0]);

      // Generate and attach a fresh CSRF token for the new authenticated session
      const crypto = require('crypto');
      const freshCsrf = crypto.randomBytes(32).toString('hex');
      req.session._csrfToken = freshCsrf;
      res.cookie('XSRF-TOKEN', freshCsrf, {
        path: '/',
        sameSite: 'lax',
        secure: Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true'),
        httpOnly: false
      });

      // Target dashboard based on role
      let redirectUrl = '/resident';
      if (user.role === 'admin') {
        redirectUrl = '/admin';
      } else if (user.role === 'staff' || user.role === 'barangay_council') {
        if (user.staff_type === 'RESCUER') {
          redirectUrl = '/rescuer';
        } else {
          redirectUrl = '/staff';
        }
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("Session save error during login:", saveErr);
        }

        if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
          return res.json({ success: true, redirect: redirectUrl });
        }

        return res.redirect(redirectUrl);
      });
    };

    if (req.session && typeof req.session.regenerate === 'function') {
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.warn("Session regeneration notice:", regenErr.message);
        }
        establishSession();
      });
    } else {
      establishSession();
    }
  } catch (error) {
    console.error("Login error:", error);
    if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
      return res.status(500).json({ success: false, message: "An unexpected error occurred during login. Please check database connection." });
    }
    return res.status(500).render("auth/login", {
      ...sharedSimData(),
      user: { name: "Guest", role: "guest" },
      page: { title: "Login" },
      error: "An unexpected server error occurred during login. Please try again."
    });
  }
};

exports.logout = (req, res) => {
  setNoCacheHeaders(res);

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true'
  };

  const clearAuthCookies = () => {
    // Clear with precise cookie attributes matching session configuration
    res.clearCookie('evakwar.sid', cookieOptions);
    res.clearCookie('connect.sid', cookieOptions);
    res.clearCookie('evakwar.sid', { path: '/' });
    res.clearCookie('connect.sid', { path: '/' });
    res.clearCookie('XSRF-TOKEN', { path: '/' });

    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, redirect: '/login' });
    }
    return res.redirect('/login');
  };

  try {
    if (req.session && req.session.userId) {
      const onlineTracker = require('../utils/onlineTracker');
      onlineTracker.removeUser(req.session.userId);
    }
  } catch (_e) {}

  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session on logout:", err);
      }
      req.session = null;
      clearAuthCookies();
    });
  } else {
    clearAuthCookies();
  }
};

exports.postRegister = async (req, res) => {
  try {
    const { 
      fullName, 
      first_name: reqFirstName, 
      middle_name: reqMiddleName,
      last_name: reqLastName, 
      contact, 
      address, 
      home_address, 
      barangay, 
      zone, 
      email, 
      password, 
      confirm_password, 
      emergency_contact_name, 
      emergency_contact_phone, 
      family_size, 
      vulnerability 
    } = req.body;
    
    // Parse name
    let firstName = (reqFirstName || '').trim();
    let middleName = (reqMiddleName || '').trim() || null;
    let lastName = (reqLastName || '').trim();

    if (!firstName && fullName) {
      const nameParts = fullName.trim().split(/\s+/);
      firstName = nameParts[0] || '';
      if (nameParts.length > 2) {
        middleName = nameParts.slice(1, -1).join(' ');
        lastName = nameParts[nameParts.length - 1];
      } else if (nameParts.length === 2) {
        lastName = nameParts[1];
      }
    }

    const residentZone = (zone || (barangay && barangay.startsWith('Zone') ? barangay : '') || '').trim();
    const residentBarangay = 'Barangay San Rafael';
    const residentAddress = residentZone || 'Barangay San Rafael';
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanContact = (contact || '').trim();

    // Validation
    if (!firstName || !lastName || !cleanEmail || !password || !cleanContact || !residentZone) {
      const msg = "Please complete all required registration fields (First Name, Last Name, Mobile Number, Zone Location, Email, Password).";
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.status(400).send(msg);
    }

    // 0. Name Format Validation — only letters, spaces, hyphens, apostrophes, periods (no HTML/scripts)
    const validNamePattern = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'\-\.]+$/;
    if (!validNamePattern.test(firstName) || !validNamePattern.test(lastName)) {
      const msg = "First Name and Last Name must contain only letters, spaces, hyphens, or apostrophes. Special characters and HTML tags are not allowed.";
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.status(400).send(msg);
    }

    // 1. Mobile Phone Validation (Strictly 11 digits starting with 09)
    if (!isValidPhoneNumber(cleanContact)) {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: PHONE_ERROR_MESSAGE });
      }
      return res.status(400).send(PHONE_ERROR_MESSAGE);
    }

    // 2. Zone Validation (Strictly official Barangay San Rafael zones: Zone 1 to Zone 7)
    if (!isValidZone(residentZone)) {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: ZONE_ERROR_MESSAGE });
      }
      return res.status(400).send(ZONE_ERROR_MESSAGE);
    }

    if (password !== confirm_password) {
      const msg = "Passwords do not match.";
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.status(400).send(msg);
    }

    // 3. Password Strength Validation (Min 8 chars, must contain both letters and numbers)
    if (!isValidPassword(password)) {
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: PASSWORD_ERROR_MESSAGE });
      }
      return res.status(400).send(PASSWORD_ERROR_MESSAGE);
    }

    // Extract uploaded valid ID photo (from req.file or req.files)
    const uploadedIdFile = req.file || (req.files && Array.isArray(req.files)
      ? (req.files.find(f => ['valid_id', 'barangay_id_photo', 'id_photo'].includes(f.fieldname)) || req.files[0])
      : (req.files && (req.files.valid_id?.[0] || req.files.barangay_id_photo?.[0] || req.files.id_photo?.[0])));

    const idPhotoFilename = (uploadedIdFile && uploadedIdFile.filename) ? uploadedIdFile.filename : null;

    if (!idPhotoFilename) {
      const msg = "Please upload a clear photo or copy of your Valid ID / Barangay ID for resident account verification.";
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.status(400).send(msg);
    }

    // Check if applicant already exists as a family member under an existing Household Head
    const [existingHouseholdMembers] = await db.execute(`
      SELECT hm.id, hm.first_name, hm.last_name, hm.relation,
             r.id as head_resident_id, r.first_name as head_first_name, r.last_name as head_last_name,
             r.home_address as head_zone
      FROM household_members hm
      JOIN residents r ON hm.resident_id = r.id
      WHERE LOWER(TRIM(hm.first_name)) = LOWER(TRIM(?)) 
        AND LOWER(TRIM(hm.last_name)) = LOWER(TRIM(?))
      LIMIT 1
    `, [firstName, lastName]);

    if (existingHouseholdMembers.length > 0) {
      const member = existingHouseholdMembers[0];
      const headName = `${member.head_first_name || ''} ${member.head_last_name || ''}`.trim() || 'another resident';
      const relationText = member.relation ? ` (${member.relation})` : '';
      const locationText = member.head_zone ? ` in ${member.head_zone}` : '';
      const msg = `Registration blocked: "${firstName} ${lastName}" is already registered as a family member${relationText} under the household of ${headName}${locationText}. Multiple accounts for the same resident are not permitted. If you need your own separate household head account, please ask ${headName} to remove you from their family member list, or contact Barangay San Rafael staff.`;

      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.status(400).send(msg);
    }

    // Check if applicant is already registered as an independent Household Head
    const [existingResidents] = await db.execute(`
      SELECT id, first_name, last_name, home_address, barangay, approval_status
      FROM residents
      WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?)) 
        AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
      LIMIT 1
    `, [firstName, lastName]);

    if (existingResidents.length > 0) {
      const resRecord = existingResidents[0];
      const locationText = resRecord.home_address ? ` (${resRecord.home_address})` : '';
      const msg = `Registration blocked: A Household Head account for "${firstName} ${lastName}" is already registered${locationText}. If this is your account, please log in with your credentials or reset your password. If you are a different resident or need assistance, please visit the Barangay San Rafael office.`;

      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.status(400).send(msg);
    }

    // Check if user or resident contact already exists
    const exists = await User.existsByEmailOrContact(cleanEmail, cleanContact);
    if (exists) {
      const msg = "Email address or contact number is already registered.";
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.status(400).send(msg);
    }

    // Hash the password securely
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create User record with is_verified = 0 (Requires Staff/Admin Approval)
    const userId = await User.create({
      email: cleanEmail,
      password_hash,
      role: 'resident',
      is_verified: 0
    });

    // For pending online registrations, do NOT issue a QR code until staff approves the resident!
    const qr_code_uuid = null;
    const parsedFamilySize = parseInt(family_size, 10) || 1;
    const hasSpecialNeeds = vulnerability && vulnerability !== 'None';

    const newResidentId = await Resident.create({
      user_id: userId,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName || '',
      contact_number: cleanContact,
      home_address: residentZone,
      barangay: residentBarangay,
      emergency_contact_name: emergency_contact_name || null,
      emergency_contact_phone: emergency_contact_phone || null,
      vulnerability: vulnerability || 'None',
      family_size: parsedFamilySize,
      has_special_needs: hasSpecialNeeds,
      barangay_id_photo: idPhotoFilename,
      approval_status: 'PENDING',
      qr_code_uuid
    });

    // Notify Admin & Staff via notification cache invalidation and real-time Socket.IO
    try {
      const NotificationModel = require('../models/notificationModel');
      NotificationModel.invalidateCache();
      if (req.io) {
        req.io.emit('resident:registered', {
          id: newResidentId,
          name: `${firstName} ${lastName || ''}`.trim(),
          zone: residentZone,
          barangay: residentBarangay,
          has_id: true
        });
      }
    } catch (notifErr) {
      console.warn("Notification dispatch notice on registration:", notifErr.message);
    }

    // Destroy any existing session and clear session cookie so user MUST log in manually
    req.session.destroy((err) => {
      res.clearCookie('evakwar.sid', { path: '/' });
      res.clearCookie('connect.sid', { path: '/' });
      
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
        return res.json({ 
          success: true, 
          message: "Registration submitted successfully! Your account is pending verification and approval by Barangay San Rafael administrators or staff.", 
          redirect: '/?registered=1' 
        });
      }

      return res.redirect('/?registered=1');
    });
  } catch (error) {
    console.error("Error in postRegister:", error);
    if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json')) {
      return res.status(500).json({ success: false, message: "An unexpected error occurred during registration." });
    }
    return res.status(500).send("Server Error during registration.");
  }
};
