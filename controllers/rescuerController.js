const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const gisCache = require('../utils/gisCache');
const sharedSimData = require('../utils/simData');
const weatherService = require('../utils/weatherService');
const Center = require('../models/centerModel');
const SosModel = require('../models/sosModel');
const Staff = require('../models/staffModel');
const User = require('../models/userModel');
const rescuerTracker = require('../utils/rescuerTracker');
const { isValidPhoneNumber, isValidPassword, PHONE_ERROR_MESSAGE, PASSWORD_ERROR_MESSAGE } = require('../utils/validators');

// Helper to retrieve Rescuer session context
async function getRescuerContext(userId, existingStaff) {
  if (!userId) {
    return {
      userId: null,
      staffId: null,
      name: "Emergency Rescuer",
      firstName: "Rescuer",
      lastName: "",
      role: "staff",
      staff_type: "RESCUER",
      assigned_center_id: null,
      assigned_centers: [],
      assignedCenterIds: [],
      assigned_barangay: "San Rafael",
      center: null
    };
  }

  let staff = await Staff.findByUserId(userId);
  if (!staff) {
    const [staffRows] = await db.execute(
      `SELECT s.*, u.email, u.role, u.profile_photo as user_photo,
              COALESCE(r.profile_photo, s.profile_photo) as profile_photo,
              COALESCE(r.first_name, s.first_name) as first_name,
              COALESCE(r.last_name, s.last_name) as last_name,
              CONCAT(COALESCE(r.first_name, s.first_name), ' ', COALESCE(r.last_name, s.last_name)) as full_name
       FROM staff s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN residents r ON s.user_id = r.user_id
       WHERE s.user_id = ? LIMIT 1`,
      [userId]
    );
    staff = staffRows[0] || null;
  }

  const firstName = staff ? staff.first_name : (existingStaff ? existingStaff.firstName : 'Rescuer');
  const lastName = staff ? staff.last_name : (existingStaff ? existingStaff.lastName : '');
  const fullName = staff ? (staff.full_name || `${firstName} ${lastName}`.trim()) : (existingStaff ? existingStaff.name : 'Emergency Rescuer');

  return {
    userId: staff ? staff.user_id : userId,
    staffId: staff ? staff.id : (existingStaff ? existingStaff.id : null),
    name: fullName,
    firstName: firstName,
    lastName: lastName,
    email: staff ? staff.email : (existingStaff ? existingStaff.email : ''),
    profile_photo: staff ? staff.profile_photo : (existingStaff ? existingStaff.profile_photo : null),
    role: staff ? staff.role : 'staff',
    staff_type: 'RESCUER',
    assigned_center_id: null,
    assigned_centers: [],
    assignedCenterIds: [],
    assigned_barangay: "San Rafael",
    contact_number: staff ? staff.contact_number : (existingStaff ? existingStaff.contact_number : null),
    occupation: staff ? (staff.occupation || 'Barangay Emergency Rescuer') : 'Emergency Rescuer',
    zone: 'San Rafael',
    center: null
  };
}

// 1. RESCUER DASHBOARD
exports.getDashboard = async (req, res) => {
  try {
    const rescuer = await getRescuerContext(req.session.userId, res.locals.staff);

    // Rescuers focus strictly on live SOS alerts & distress radar
    const [activeSosAlerts, recentSosAlerts, liveWeather] = await Promise.all([
      SosModel.getActiveAlerts().catch(() => []),
      SosModel.getAllRecentAlerts(15).catch(() => []),
      (res.locals && res.locals.weather) ? Promise.resolve(res.locals.weather) : weatherService.getLatestWeather().catch(() => null)
    ]);

    res.render("rescuer/dashboard", {
      ...sharedSimData(),
      user: {
        id: rescuer.userId,
        name: rescuer.name,
        email: rescuer.email,
        profile_photo: rescuer.profile_photo,
        role: rescuer.role,
        staff_type: 'RESCUER'
      },
      page: { title: "Rescuer Command Dashboard" },
      weather: liveWeather || res.locals.weather,
      staff: rescuer,
      rescuer: rescuer,
      activeSosAlerts: activeSosAlerts || [],
      recentSosAlerts: recentSosAlerts || []
    });
  } catch (error) {
    console.error("Error loading rescuer dashboard:", error);
    res.status(500).send("Server Error loading Rescuer Dashboard.");
  }
};

// 2. RESCUER TACTICAL SOS RADAR MAP
exports.getMap = async (req, res) => {
  try {
    const rescuer = await getRescuerContext(req.session.userId);

    const [activeSosAlerts, recentSosAlerts, centers, mapFeatures] = await Promise.all([
      SosModel.getActiveAlerts().catch(() => []),
      SosModel.getAllRecentAlerts(30).catch(() => []),
      Center.findAll().catch(() => []),
      gisCache.getDrawnFeatures(false).catch(() => [])
    ]);

    res.render("rescuer/map", {
      ...sharedSimData(),
      user: {
        id: rescuer.userId,
        name: rescuer.name,
        role: rescuer.role,
        staff_type: 'RESCUER'
      },
      page: { title: "Rescuer SOS Tactical Radar Map" },
      staff: rescuer,
      rescuer: rescuer,
      activeSosAlerts: activeSosAlerts || [],
      recentSosAlerts: recentSosAlerts || [],
      centers: centers || [],
      mapFeatures: mapFeatures || []
    });
  } catch (error) {
    console.error("Error loading rescuer map:", error);
    res.status(500).send("Server Error loading Rescuer Tactical Map.");
  }
};

// 3. RESCUER SOS EMERGENCY REPORTS
exports.getReports = async (req, res) => {
  try {
    const rescuer = await getRescuerContext(req.session.userId);
    const rescuerUserId = rescuer.userId || req.session.userId;
    const rescuerStaffId = rescuer.staffId || rescuerUserId;

    // Fetch ONLY the distress alerts handled/rescued by this specific rescuer
    const [sosRows] = await db.execute(`
      SELECT 
        s.id, s.resident_id, s.name, s.latitude, s.longitude, s.accuracy, s.status, s.handled_by, s.responder_notes, s.created_at, s.updated_at,
        COALESCE(r.first_name, r_fallback.first_name) as res_first_name,
        COALESCE(r.last_name, r_fallback.last_name) as res_last_name,
        COALESCE(r.contact_number, r_fallback.contact_number) as contact_number,
        COALESCE(r.home_address, r_fallback.home_address) as home_address,
        COALESCE(r.barangay, r_fallback.barangay) as barangay,
        COALESCE(r.vulnerability, r_fallback.vulnerability) as vulnerability,
        COALESCE(r.is_pregnant, r_fallback.is_pregnant) as is_pregnant,
        COALESCE(r.is_pwd, r_fallback.is_pwd) as is_pwd,
        COALESCE(r.has_serious_illness, r_fallback.has_serious_illness) as has_serious_illness,
        COALESCE(r.age, r_fallback.age) as age,
        COALESCE(r.sex, r_fallback.sex) as sex,
        COALESCE(r.profile_photo, r_fallback.profile_photo) as resident_profile_photo,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', COALESCE(r.first_name, r_fallback.first_name), COALESCE(r.last_name, r_fallback.last_name))), ''),
          s.name
        ) as resident_display_name,
        u.email as handler_email,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', st.first_name, st.last_name)), ''),
          u.email
        ) as handler_name,
        st.contact_number as handler_contact
      FROM sos_alerts s
      LEFT JOIN residents r ON s.resident_id = r.id
      LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
      LEFT JOIN users u ON s.handled_by = u.id
      LEFT JOIN staff st ON u.id = st.user_id
      WHERE (s.handled_by = ? OR (st.id IS NOT NULL AND st.id = ?))
      GROUP BY s.id
      ORDER BY s.updated_at DESC, s.created_at DESC
    `, [rescuerUserId, rescuerStaffId]);

    const sosStats = {
      total: sosRows.length,
      active: 0,
      acknowledged: 0,
      responding: 0,
      rescued: 0,
      resolved: 0,
      cancelled: 0,
      seniors: 0,
      pwd: 0,
      pregnant: 0,
      medical: 0,
      todayCount: 0,
      purokCounts: {},
      avgResponseMinutes: 0
    };

    const myStats = {
      myHandledTotal: sosRows.length,
      myActiveOps: 0,
      myRescued: 0,
      myTodayCount: 0,
      mySeniors: 0,
      myPwd: 0,
      myPregnant: 0,
      myMedical: 0,
      myAvgResponseMinutes: 0
    };

    const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
    const todayStr = manilaDateFormatter.format(new Date());
    let totalResponseMinutes = 0;
    let resolvedWithDuration = 0;

    sosRows.forEach(row => {
      row.isMine = true;

      const st = (row.status || 'ACTIVE').toUpperCase();
      if (st === 'ACTIVE') {
        sosStats.active++;
        myStats.myActiveOps++;
      } else if (st === 'ACKNOWLEDGED') {
        sosStats.acknowledged++;
        myStats.myActiveOps++;
      } else if (st === 'RESPONDING') {
        sosStats.responding++;
        myStats.myActiveOps++;
      } else if (st === 'RESCUED') {
        sosStats.rescued++;
        myStats.myRescued++;
      } else if (st === 'RESOLVED') {
        sosStats.resolved++;
        myStats.myRescued++;
      } else if (st === 'CANCELLED') {
        sosStats.cancelled++;
      }

      let diffMinutes = null;
      if (row.created_at && row.updated_at) {
        const diffMs = new Date(row.updated_at).getTime() - new Date(row.created_at).getTime();
        if (diffMs > 0 && diffMs < 86400000) {
          diffMinutes = Math.round(diffMs / 60000);
        }
      }
      row.responseMinutes = diffMinutes;

      const isSenior = (Number(row.age) >= 60 || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('senior')));
      const isPwd = !!(row.is_pwd || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('pwd')));
      const isPregnant = !!(row.is_pregnant || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('pregnant')));
      const isMedical = !!(row.has_serious_illness || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('illness')));

      if (isSenior) { sosStats.seniors++; myStats.mySeniors++; }
      if (isPwd) { sosStats.pwd++; myStats.myPwd++; }
      if (isPregnant) { sosStats.pregnant++; myStats.myPregnant++; }
      if (isMedical) { sosStats.medical++; myStats.myMedical++; }

      if (row.created_at) {
        try {
          const rowDateStr = manilaDateFormatter.format(new Date(row.created_at));
          if (rowDateStr === todayStr) {
            sosStats.todayCount++;
            myStats.myTodayCount++;
          }
        } catch (_e) { }
      }

      const address = row.home_address || row.barangay || 'San Rafael';
      sosStats.purokCounts[address] = (sosStats.purokCounts[address] || 0) + 1;

      if ((st === 'RESOLVED' || st === 'RESCUED') && diffMinutes !== null) {
        totalResponseMinutes += diffMinutes;
        resolvedWithDuration++;
      }
    });

    const avg = resolvedWithDuration > 0
      ? Math.round(totalResponseMinutes / resolvedWithDuration)
      : 0;
    sosStats.avgResponseMinutes = avg;
    myStats.myAvgResponseMinutes = avg;

    res.render("rescuer/reports", {
      ...sharedSimData(),
      user: {
        id: rescuer.userId,
        name: rescuer.name,
        role: rescuer.role,
        staff_type: 'RESCUER'
      },
      page: { title: "Rescuer SOS Incident Reports" },
      staff: rescuer,
      rescuer: rescuer,
      sosReports: sosRows,
      sosStats: sosStats,
      myStats: myStats
    });
  } catch (error) {
    console.error("Error loading rescuer reports:", error);
    res.status(500).send("Server Error loading Rescuer Emergency Reports.");
  }
};

// 4. RESCUER TYPHOON MONITORING
exports.getTyphoon = async (req, res) => {
  try {
    const rescuer = await getRescuerContext(req.session.userId);
    const liveWeather = (res.locals && res.locals.weather)
      ? res.locals.weather
      : await weatherService.getLatestWeather().catch(() => null);

    res.render("rescuer/typhoon", {
      ...sharedSimData(),
      user: {
        id: rescuer.userId,
        name: rescuer.name,
        role: rescuer.role,
        staff_type: 'RESCUER'
      },
      page: { title: "Rescuer Typhoon & Weather Radar" },
      staff: rescuer,
      rescuer: rescuer,
      weather: liveWeather || res.locals.weather
    });
  } catch (error) {
    console.error("Error loading rescuer typhoon:", error);
    res.status(500).send("Server Error loading Typhoon Monitoring.");
  }
};

// 4B. RESCUER LORA MESH CHAT
exports.getChat = async (req, res) => {
  try {
    const rescuer = await getRescuerContext(req.session.userId, res.locals.staff);
    res.render("rescuer/chat", {
      ...sharedSimData(),
      user: {
        id: rescuer.userId,
        name: rescuer.name,
        full_name: rescuer.name,
        profile_photo: rescuer.profile_photo,
        role: rescuer.role,
        staff_type: 'RESCUER'
      },
      page: { title: "LoRa Mesh Chat" },
      staff: rescuer,
      rescuer: rescuer
    });
  } catch (error) {
    console.error("Error loading rescuer chat:", error);
    res.status(500).send("Server Error loading Rescuer LoRa Chat.");
  }
};

// 5. RESCUER PROFILE & SETTINGS
exports.getSettings = async (req, res) => {
  try {
    const userId = req.session.userId;
    const rescuer = await getRescuerContext(userId);
    const staff = await Staff.findByUserId(userId);
    const user = await User.findById(userId);

    const firstName = staff ? (staff.first_name || '') : (user ? (user.first_name || '') : rescuer.firstName);
    const middleName = staff ? (staff.middle_name || '') : (user ? (user.middle_name || '') : '');
    const lastName = staff ? (staff.last_name || '') : (user ? (user.last_name || '') : rescuer.lastName);
    const nameParts = [firstName, middleName, lastName].filter(Boolean);
    const fullName = nameParts.length > 0 ? nameParts.join(' ') : rescuer.name;
    const profilePhoto = staff ? staff.profile_photo : rescuer.profile_photo;
    const email = (user && user.email) ? user.email : (staff && staff.email ? staff.email : rescuer.email);
    const occupation = staff ? (staff.occupation || 'Barangay Emergency Rescuer') : 'Emergency Rescuer';
    const contactNumber = staff ? (staff.contact_number || '') : rescuer.contact_number;
    const assignedCenters = staff && staff.assigned_centers ? staff.assigned_centers : [];

    const staffObj = {
      ...rescuer,
      name: fullName,
      full_name: fullName,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      contact_number: contactNumber,
      occupation: occupation,
      email: email,
      assigned_centers: assignedCenters,
      profile_photo: profilePhoto
    };

    const userObj = {
      id: rescuer.userId,
      name: fullName,
      email: email,
      profile_photo: profilePhoto,
      role: rescuer.role,
      staff_type: 'RESCUER'
    };

    res.locals = res.locals || {};
    res.locals.staff = staffObj;
    res.locals.user = userObj;

    res.render("rescuer/settings", {
      ...sharedSimData(),
      user: userObj,
      page: { title: "Rescuer Profile & Settings" },
      staff: staffObj,
      rescuer: rescuer,
      statusMsg: req.query.success || null,
      errorMsg: req.query.error || null
    });
  } catch (error) {
    console.error("Error loading rescuer profile:", error);
    res.status(500).send("Server Error loading Rescuer Profile.");
  }
};

// 6. UPDATE RESCUER PROFILE & SETTINGS
exports.updateSettings = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const {
      first_name,
      middle_name,
      last_name,
      occupation,
      contact_number,
      email,
      current_password,
      new_password,
      confirm_password
    } = req.body;

    // Handle Profile Photo Upload
    if (req.file) {
      const photoFilename = req.file.filename;
      await Staff.updateByUserId(userId, { profile_photo: photoFilename });
      await db.execute("UPDATE residents SET profile_photo = ? WHERE user_id = ?", [photoFilename, userId]).catch(() => {});
    }

    // Handle Password Change
    if (current_password || new_password || confirm_password) {
      if (!current_password || !new_password || !confirm_password) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(400).json({ success: false, message: "Please fill out all password fields." });
        }
        return res.redirect('/rescuer/profile?error=' + encodeURIComponent('Please fill out all password fields.'));
      }
      if (new_password !== confirm_password) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(400).json({ success: false, message: "New password and confirm password do not match." });
        }
        return res.redirect('/rescuer/profile?error=' + encodeURIComponent('New password and confirm password do not match.'));
      }
      if (!isValidPassword(new_password)) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(400).json({ success: false, message: PASSWORD_ERROR_MESSAGE });
        }
        return res.redirect('/rescuer/profile?error=' + encodeURIComponent(PASSWORD_ERROR_MESSAGE));
      }

      const [uRows] = await db.execute("SELECT password_hash FROM users WHERE id = ? LIMIT 1", [userId]);
      if (uRows.length === 0) {
        return res.redirect('/rescuer/profile?error=' + encodeURIComponent('User account not found.'));
      }
      const matches = await bcrypt.compare(current_password, uRows[0].password_hash);
      if (!matches) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(400).json({ success: false, message: "Current password does not match." });
        }
        return res.redirect('/rescuer/profile?error=' + encodeURIComponent('Current password does not match.'));
      }
      const hashed = await bcrypt.hash(new_password, 10);
      await db.execute("UPDATE users SET password_hash = ? WHERE id = ?", [hashed, userId]);

      if (req.session) {
        req.session.userProfile = null;
        req.session.userProfileTime = 0;
      }

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: "Password updated successfully!" });
      }
      return res.redirect('/rescuer/profile?success=' + encodeURIComponent('Password updated successfully!'));
    }

    // Sanitize and Validate Phone Number
    let cleanContact = contact_number !== undefined && contact_number !== null ? String(contact_number).trim() : null;
    if (cleanContact) {
      cleanContact = cleanContact.replace(/[\s\-\(\)]/g, '');
      if (cleanContact.startsWith('+63')) cleanContact = '0' + cleanContact.slice(3);
      if (cleanContact.startsWith('63')) cleanContact = '0' + cleanContact.slice(2);
      if (!isValidPhoneNumber(cleanContact)) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(400).json({ success: false, message: PHONE_ERROR_MESSAGE });
        }
        return res.redirect('/rescuer/profile?error=' + encodeURIComponent(PHONE_ERROR_MESSAGE));
      }
    }

    // Update Email in users table if changed
    if (email && email.trim()) {
      const trimmedEmail = email.trim().toLowerCase();
      const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [trimmedEmail, userId]);
      if (existingUser.length > 0) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          return res.status(400).json({ success: false, message: "Email address is already in use by another account." });
        }
        return res.redirect('/rescuer/profile?error=' + encodeURIComponent('Email address is already in use by another account.'));
      }
      await db.execute('UPDATE users SET email = ? WHERE id = ?', [trimmedEmail, userId]);
    }

    // Update Staff Profile info
    const cleanFirst = first_name !== undefined ? first_name.trim() : undefined;
    const cleanMiddle = middle_name !== undefined ? middle_name.trim() : undefined;
    const cleanLast = last_name !== undefined ? last_name.trim() : undefined;
    const cleanOccupation = occupation !== undefined ? occupation.trim() : undefined;

    await Staff.updateByUserId(userId, {
      first_name: cleanFirst,
      middle_name: cleanMiddle,
      last_name: cleanLast,
      occupation: cleanOccupation,
      contact_number: cleanContact !== null ? cleanContact : undefined
    });

    // Also sync residents table if resident record exists
    if (cleanFirst !== undefined || cleanLast !== undefined || cleanContact) {
      await db.execute(
        `UPDATE residents SET 
          first_name = COALESCE(?, first_name), 
          middle_name = COALESCE(?, middle_name),
          last_name = COALESCE(?, last_name), 
          contact_number = COALESCE(?, contact_number)
         WHERE user_id = ?`,
        [cleanFirst || null, cleanMiddle || null, cleanLast || null, cleanContact || null, userId]
      ).catch(() => {});
    }

    // Update session caches
    const updatedNameParts = [cleanFirst, cleanMiddle, cleanLast].filter(Boolean);
    if (updatedNameParts.length > 0) {
      req.session.userName = updatedNameParts.join(' ');
    }
    if (req.session) {
      req.session.userProfile = null;
      req.session.userProfileTime = 0;
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: "Rescuer profile updated successfully!" });
    }
    return res.redirect('/rescuer/profile?success=' + encodeURIComponent('Rescuer profile updated successfully!'));
  } catch (error) {
    console.error("Error updating rescuer profile:", error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: "Server error updating rescuer profile: " + error.message });
    }
    return res.redirect('/rescuer/profile?error=' + encodeURIComponent('Failed to update profile: ' + error.message));
  }
};

// 7. UPDATE SOS STATUS (ACTIVE -> ACKNOWLEDGED -> RESPONDING -> RESCUED -> RESOLVED)
exports.updateSosStatus = async (req, res) => {
  try {
    const { id, status, notes } = req.body;
    const rescuer = await getRescuerContext(req.session.userId);

    if (!id || !status) {
      return res.status(400).json({ success: false, message: "SOS ID and Status are required." });
    }

    const userRole = req.session ? req.session.role : rescuer.role;
    const result = await SosModel.updateStatus(id, status.toUpperCase(), rescuer.userId, notes || null, userRole);

    if (result && result.error === 'ALREADY_ASSIGNED') {
      return res.status(409).json({
        success: false,
        message: result.message || "This SOS has already been assigned to another rescuer.",
        alert: result.alert
      });
    }

    if (!result || result.error) {
      return res.status(400).json({
        success: false,
        message: result ? result.message : "Server error updating SOS status.",
        alert: result ? result.alert : null
      });
    }

    const updated = result;

    if (req.io && updated) {
      req.io.emit('sos:update_status', {
        id: Number(id),
        status: status.toUpperCase(),
        handled_by: rescuer.userId,
        handler_name: updated.handler_name || rescuer.name,
        handler_contact: updated.handler_contact || null,
        notes: notes || null,
        alert: updated,
        updated_at: new Date().toISOString()
      });
      if (status.toUpperCase() === 'RESOLVED' || status.toUpperCase() === 'CANCELLED') {
        rescuerTracker.clearRescuerLocation(id);
        req.io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(id) });
        req.io.emit('sos:resolve', { id: Number(id), status: status.toUpperCase() });
      }
    }

    return res.json({ success: true, message: `SOS #${id} status updated to ${status.toUpperCase()}.`, alert: updated });
  } catch (error) {
    console.error("Error updating SOS status:", error);
    return res.status(500).json({ success: false, message: "Server error updating SOS status." });
  }
};
