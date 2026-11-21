const db = require('../config/db');
const gisCache = require('../utils/gisCache');
const HouseholdMember = require('../models/householdMemberModel');
const sharedSimData = require('../utils/simData');
const weatherService = require('../utils/weatherService');
const pagasaService = require('../utils/pagasaService');
const { handleControllerError } = require('../utils/dbError');
const { isValidPhoneNumber, isValidPassword, isValidZone, PHONE_ERROR_MESSAGE, PASSWORD_ERROR_MESSAGE } = require('../utils/validators');

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    let resident = res.locals.resident || (req.session && req.session.userProfile && req.session.userProfile.resident) || null;
    if (!resident && userId) {
      try {
        const [residentRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
        resident = residentRows[0] || null;
      } catch (dbErr) {
        console.warn('[Resident Dashboard] DB unavailable for resident lookup:', dbErr.message);
      }
    }

    const [liveWeather, pagasaGuidance] = await Promise.all([
      weatherService.getLatestWeather().catch(() => null),
      pagasaService.getPagasaGuidance().catch(() => null)
    ]);

    const userObj = res.locals.user || {};
    const name = (resident && (resident.first_name || resident.last_name))
      ? `${resident.first_name || ''} ${resident.last_name || ''}`.trim()
      : ((req.session && req.session.userName) || userObj.name || "Resident");
    const photo = (resident && resident.profile_photo) || userObj.profile_photo || null;

    const finalWeather = liveWeather || res.locals.weather || weatherService.getFallbackWeather();
    if (pagasaGuidance) {
      finalWeather.pagasa = pagasaGuidance;
    }

    res.render("resident/dashboard", {
      ...sharedSimData(),
      user: {
        ...userObj,
        name: name,
        role: "resident",
        profile_photo: photo
      },
      resident: resident,
      profilePhoto: photo,
      page: { title: "Resident Dashboard" },
      weather: finalWeather,
      sim: {
        alerts: [], // Handled by global activeAlert now
        lastUpdated: new Date().toLocaleString()
      }
    });
  } catch (error) {
    console.error("Error loading dashboard, rendering offline fallback:", error);
    res.render("resident/dashboard", {
      ...sharedSimData(),
      user: {
        name: (req.session && req.session.userName) || "Resident",
        role: "resident",
        profile_photo: null
      },
      resident: (res.locals && res.locals.resident) || null,
      profilePhoto: null,
      page: { title: "Resident Dashboard" },
      weather: weatherService.getFallbackWeather(),
      sim: {
        alerts: [],
        lastUpdated: new Date().toLocaleString()
      }
    });
  }
};

exports.getQr = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    let resident = (res.locals && res.locals.resident) || (req.session && req.session.userProfile && req.session.userProfile.resident) || null;
    let members = [];
    let evacuatedCount = 0;
    let totalHouseholdCount = 1;
    let qrDataUrl = null;

    try {
      if (userId) {
        const [residentRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
        if (residentRows && residentRows[0]) {
          resident = {
            ...(resident || {}),
            ...residentRows[0]
          };
        }
      }

      if (resident) {
        if (!resident.approval_status || resident.approval_status === 'Approved') {
          resident.approval_status = 'APPROVED';
        }
        members = await HouseholdMember.findByResidentId(resident.id).catch(() => []);
        const calculatedSize = members.length + 1;
        totalHouseholdCount = calculatedSize;
        if (resident.family_size !== calculatedSize) {
          await db.execute('UPDATE residents SET family_size = ? WHERE id = ?', [calculatedSize, resident.id]).catch(() => {});
          resident.family_size = calculatedSize;
        }

        // Fetch active check-in records for this household
        const [activeCheckIns] = await db.execute(`
          SELECT c.*, ec.name as center_name 
          FROM check_ins c 
          LEFT JOIN evacuation_centers ec ON c.center_id = ec.id 
          WHERE c.resident_id = ? AND c.status IN ('ACTIVE', 'CHECKED_IN')
        `, [resident.id]).catch(() => [[]]);

        const headActive = activeCheckIns.find(ci => ci.household_member_id === null);
        resident.is_checked_in = !!headActive;
        resident.checked_in_center = headActive ? headActive.center_name : null;
        resident.evacuation_status = headActive ? 'CHECKED_IN' : 'NOT_EVACUATED';
        if (headActive) evacuatedCount++;

        const memberCheckInMap = {};
        activeCheckIns.forEach(ci => {
          if (ci.household_member_id !== null) {
            memberCheckInMap[ci.household_member_id] = ci;
          }
        });

        members = members.map(m => {
          const isMemChecked = !!memberCheckInMap[m.id];
          if (isMemChecked) evacuatedCount++;
          return {
            ...m,
            is_checked_in: isMemChecked,
            evacuation_status: isMemChecked ? 'CHECKED_IN' : 'NOT_EVACUATED',
            checked_in_center: isMemChecked ? memberCheckInMap[m.id].center_name : null
          };
        });
      }
    } catch (dbErr) {
      console.warn('[Resident QR] DB unavailable, serving offline pass data:', dbErr.message);
    }

    const isApprovedResident = resident && (
      resident.approval_status === 'APPROVED' || 
      resident.approval_status === 'Approved' || 
      !resident.approval_status
    );

    if (isApprovedResident) {
      resident.approval_status = 'APPROVED';
      if (!resident.qr_code_uuid) {
        const crypto = require('crypto');
        resident.qr_code_uuid = crypto.randomUUID();
        try {
          await db.execute('UPDATE residents SET qr_code_uuid = ? WHERE id = ?', [resident.qr_code_uuid, resident.id]);
        } catch (dbErr) {
          console.warn('Error saving generated QR UUID in residentController:', dbErr.message);
        }
      }
      try {
        const QRCode = require('qrcode');
        qrDataUrl = await QRCode.toDataURL(resident.qr_code_uuid, {
          width: 360,
          margin: 1,
          color: { dark: '#1e3a8a', light: '#ffffff' }
        });
      } catch (qrErr) {
        console.warn('Notice generating inlined QR data URL:', qrErr.message);
      }
    }

    const queryError = req.query.error;
    let errorMessage = null;
    if (queryError) {
      if (queryError === 'name_required') {
        errorMessage = 'First name and last name are required to save a family member.';
      } else {
        errorMessage = queryError;
      }
    }
    const successMessage = req.query.success || null;

    res.render("resident/qr", {
      ...sharedSimData(),
      user: {
        id: userId,
        resident_id: resident ? resident.id : null,
        name: resident ? (resident.first_name || "Resident") : "Resident",
        role: "resident"
      },
      page: { title: "Household QR" },
      resident: resident,
      members: members,
      evacuatedCount: evacuatedCount,
      totalHouseholdCount: totalHouseholdCount,
      qrDataUrl: qrDataUrl,
      errorMessage: errorMessage,
      successMessage: successMessage
    });
  } catch (error) {
    console.error("Error loading QR page, rendering offline fallback:", error);
    res.render("resident/qr", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        resident_id: null,
        name: (req.session && req.session.userName) || "Resident",
        role: "resident"
      },
      page: { title: "Household QR" },
      resident: (res.locals && res.locals.resident) || {},
      members: [],
      evacuatedCount: 0,
      totalHouseholdCount: 1,
      qrDataUrl: null,
      errorMessage: req.query.error || null,
      successMessage: req.query.success || null
    });
  }
};

exports.addMember = async (req, res) => {
  try {
    if (!req.session || req.session.role !== 'resident') {
      return res.status(403).send('Forbidden: Only resident accounts can manage household members.');
    }
    const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json');
    const {
      first_name,
      middle_name,
      last_name,
      relation,
      sex,
      birthdate,
      age,
      status,
      is_pregnant,
      is_lactating,
      is_pwd,
      has_serious_illness,
      serious_illness_details
    } = req.body;

    const cleanFirst = (first_name || '').trim();
    const cleanLast = (last_name || '').trim();

    // Strict validation: Don't allow blank member records
    if (!cleanFirst || !cleanLast) {
      console.warn('Attempted to add member with missing first or last name:', req.body);
      const msg = 'First name and last name are required to save a family member.';
      if (isAjax) return res.status(400).json({ success: false, message: msg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(msg));
    }

    const [residentRows] = await db.execute('SELECT id, first_name, last_name FROM residents WHERE user_id = ?', [req.session.userId]);

    if (!residentRows || residentRows.length === 0) {
      const msg = 'Resident account not found.';
      if (isAjax) return res.status(404).json({ success: false, message: msg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(msg));
    }

    const currentResidentId = residentRows[0].id;

    // 1. Prevent adding someone who is already registered as an independent Household Head
    const [existingResidentHead] = await db.execute(`
      SELECT id, first_name, last_name, home_address
      FROM residents
      WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
        AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
      LIMIT 1
    `, [cleanFirst, cleanLast]);

    if (existingResidentHead.length > 0) {
      const head = existingResidentHead[0];
      const loc = head.home_address ? ` in ${head.home_address}` : '';
      const errorMsg = `Cannot add "${cleanFirst} ${cleanLast}": This person is already registered as an independent Household Head${loc}. A resident cannot be listed both as a household head and a family member.`;
      if (isAjax) return res.status(400).json({ success: false, message: errorMsg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(errorMsg));
    }

    // 2. Prevent adding someone who is already registered as a household member
    const [existingMemberRow] = await db.execute(`
      SELECT hm.id, hm.resident_id, hm.first_name, hm.last_name, hm.relation,
             r.first_name as head_first_name, r.last_name as head_last_name, r.home_address as head_zone
      FROM household_members hm
      JOIN residents r ON hm.resident_id = r.id
      WHERE LOWER(TRIM(hm.first_name)) = LOWER(TRIM(?))
        AND LOWER(TRIM(hm.last_name)) = LOWER(TRIM(?))
      LIMIT 1
    `, [cleanFirst, cleanLast]);

    if (existingMemberRow.length > 0) {
      const mem = existingMemberRow[0];
      let errorMsg;
      if (mem.resident_id === currentResidentId) {
        errorMsg = `Cannot add member: "${cleanFirst} ${cleanLast}" is already registered in your family members list.`;
      } else {
        const headName = `${mem.head_first_name || ''} ${mem.head_last_name || ''}`.trim() || 'another resident';
        const loc = mem.head_zone ? ` in ${mem.head_zone}` : '';
        errorMsg = `Cannot add "${cleanFirst} ${cleanLast}": This person is already registered as a family member under the household of ${headName}${loc}.`;
      }
      if (isAjax) return res.status(400).json({ success: false, message: errorMsg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(errorMsg));
    }

    const profilePhoto = req.file ? req.file.filename : null;

    let statusArr = [];
    if (Array.isArray(status)) {
      statusArr = [...status];
    } else if (status) {
      statusArr = [status];
    }

    let computedAge = 0;
    if (birthdate) {
      const today = new Date();
      const bDate = new Date(birthdate);
      if (!isNaN(bDate.getTime())) {
        computedAge = today.getFullYear() - bDate.getFullYear();
        const m = today.getMonth() - bDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
          computedAge--;
        }
        if (computedAge < 0) computedAge = 0;
      }
    } else if (age !== undefined && age !== null && age !== '') {
      computedAge = parseInt(age, 10) || 0;
    }

    const isPwdBool = is_pwd === 'on' || is_pwd === 'true' || is_pwd === true || statusArr.includes('pwd');
    const isPregBool = is_pregnant === 'on' || is_pregnant === 'true' || is_pregnant === true || statusArr.includes('pregnant');
    const isLactBool = is_lactating === 'on' || is_lactating === 'true' || is_lactating === true || statusArr.includes('lactating');
    const hasIllnessBool = has_serious_illness === 'on' || has_serious_illness === 'true' || has_serious_illness === true || statusArr.includes('illness');

    if (isPwdBool && !statusArr.includes('pwd')) statusArr.push('pwd');
    if (isPregBool && !statusArr.includes('pregnant')) statusArr.push('pregnant');
    if (isLactBool && !statusArr.includes('lactating')) statusArr.push('lactating');
    if (hasIllnessBool && !statusArr.includes('illness')) statusArr.push('illness');
    if (computedAge >= 60 && !statusArr.includes('elderly') && !statusArr.includes('senior')) statusArr.push('elderly');
    if (computedAge <= 4 && !statusArr.includes('infant')) statusArr.push('infant');

    await HouseholdMember.create({
      resident_id: currentResidentId,
      first_name: cleanFirst,
      middle_name: middle_name && middle_name.trim() ? middle_name.trim() : null,
      last_name: cleanLast,
      relation: relation && relation.trim() ? relation.trim() : 'Family Member',
      sex: sex || 'Male',
      birthdate: birthdate || null,
      age: computedAge,
      status: statusArr.join(','),
      profile_photo: profilePhoto,
      is_pregnant: isPregBool,
      is_lactating: isLactBool,
      is_pwd: isPwdBool,
      has_serious_illness: hasIllnessBool,
      serious_illness_details: serious_illness_details ? serious_illness_details.trim() : null
    });

    if (isAjax) {
      return res.json({ success: true, message: `Member ${cleanFirst} ${cleanLast} added successfully.`, redirect: '/resident/qr' });
    }
    res.redirect("/resident/qr?success=" + encodeURIComponent(`Family member ${cleanFirst} ${cleanLast} added successfully.`));
  } catch (error) {
    console.error("Error adding member:", error);
    res.status(500).send("Server Error");
  }
};

exports.deleteMember = async (req, res) => {
  try {
    if (!req.session || req.session.role !== 'resident') {
      return res.status(403).send('Forbidden: Only resident accounts can delete household members.');
    }
    const memberId = req.params.id;
    const [residentRows] = await db.execute('SELECT id FROM residents WHERE user_id = ?', [req.session.userId]);

    if (residentRows.length > 0) {
      const residentId = residentRows[0].id;
      await HouseholdMember.delete(memberId, residentId);
    }

    res.redirect("/resident/qr");
  } catch (error) {
    console.error("Error deleting member:", error);
    res.status(500).send("Server Error");
  }
};

exports.editMember = async (req, res) => {
  try {
    if (!req.session || req.session.role !== 'resident') {
      return res.status(403).send('Forbidden: Only resident accounts can edit household members.');
    }
    const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('json');
    const memberId = req.params.id;
    const {
      first_name,
      middle_name,
      last_name,
      relation,
      sex,
      birthdate,
      age,
      status,
      is_pregnant,
      is_lactating,
      is_pwd,
      has_serious_illness,
      serious_illness_details
    } = req.body;

    const cleanFirst = (first_name || '').trim();
    const cleanLast = (last_name || '').trim();

    if (!cleanFirst || !cleanLast) {
      console.warn('Attempted to update member with missing first or last name:', req.body);
      const msg = 'First name and last name are required to save a family member.';
      if (isAjax) return res.status(400).json({ success: false, message: msg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(msg));
    }

    const [residentRows] = await db.execute('SELECT id FROM residents WHERE user_id = ?', [req.session.userId]);
    if (!residentRows || residentRows.length === 0) {
      const msg = 'Resident account not found.';
      if (isAjax) return res.status(404).json({ success: false, message: msg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(msg));
    }
    const currentResidentId = residentRows[0].id;

    // 1. Prevent updating to a name that already exists as an independent Household Head
    const [existingResidentHead] = await db.execute(`
      SELECT id, first_name, last_name, home_address
      FROM residents
      WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?))
        AND LOWER(TRIM(last_name)) = LOWER(TRIM(?))
      LIMIT 1
    `, [cleanFirst, cleanLast]);

    if (existingResidentHead.length > 0) {
      const head = existingResidentHead[0];
      const loc = head.home_address ? ` in ${head.home_address}` : '';
      const errorMsg = `Cannot update to "${cleanFirst} ${cleanLast}": This person is already registered as an independent Household Head${loc}.`;
      if (isAjax) return res.status(400).json({ success: false, message: errorMsg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(errorMsg));
    }

    // 2. Prevent updating to a name that already exists in household_members (excluding this member id)
    const [existingMemberRow] = await db.execute(`
      SELECT hm.id, hm.resident_id, hm.first_name, hm.last_name, hm.relation,
             r.first_name as head_first_name, r.last_name as head_last_name, r.home_address as head_zone
      FROM household_members hm
      JOIN residents r ON hm.resident_id = r.id
      WHERE LOWER(TRIM(hm.first_name)) = LOWER(TRIM(?))
        AND LOWER(TRIM(hm.last_name)) = LOWER(TRIM(?))
        AND hm.id != ?
      LIMIT 1
    `, [cleanFirst, cleanLast, memberId]);

    if (existingMemberRow.length > 0) {
      const mem = existingMemberRow[0];
      let errorMsg;
      if (mem.resident_id === currentResidentId) {
        errorMsg = `Cannot update member: Another family member named "${cleanFirst} ${cleanLast}" already exists in your household list.`;
      } else {
        const headName = `${mem.head_first_name || ''} ${mem.head_last_name || ''}`.trim() || 'another resident';
        const loc = mem.head_zone ? ` in ${mem.head_zone}` : '';
        errorMsg = `Cannot update to "${cleanFirst} ${cleanLast}": This person is already registered as a family member under the household of ${headName}${loc}.`;
      }
      if (isAjax) return res.status(400).json({ success: false, message: errorMsg });
      return res.redirect('/resident/qr?error=' + encodeURIComponent(errorMsg));
    }

    const profilePhoto = req.file ? req.file.filename : undefined;

    let statusArr = [];
    if (Array.isArray(status)) {
      statusArr = [...status];
    } else if (status) {
      statusArr = [status];
    }

    let computedAge = 0;
    if (birthdate) {
      const today = new Date();
      const bDate = new Date(birthdate);
      if (!isNaN(bDate.getTime())) {
        computedAge = today.getFullYear() - bDate.getFullYear();
        const m = today.getMonth() - bDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
          computedAge--;
        }
        if (computedAge < 0) computedAge = 0;
      }
    } else if (age !== undefined && age !== null && age !== '') {
      computedAge = parseInt(age, 10) || 0;
    }

    const isPwdBool = is_pwd === 'on' || is_pwd === 'true' || is_pwd === true || statusArr.includes('pwd');
    const isPregBool = is_pregnant === 'on' || is_pregnant === 'true' || is_pregnant === true || statusArr.includes('pregnant');
    const isLactBool = is_lactating === 'on' || is_lactating === 'true' || is_lactating === true || statusArr.includes('lactating');
    const hasIllnessBool = has_serious_illness === 'on' || has_serious_illness === 'true' || has_serious_illness === true || statusArr.includes('illness');

    if (isPwdBool && !statusArr.includes('pwd')) statusArr.push('pwd');
    if (isPregBool && !statusArr.includes('pregnant')) statusArr.push('pregnant');
    if (isLactBool && !statusArr.includes('lactating')) statusArr.push('lactating');
    if (hasIllnessBool && !statusArr.includes('illness')) statusArr.push('illness');
    if (computedAge >= 60 && !statusArr.includes('elderly') && !statusArr.includes('senior')) statusArr.push('elderly');
    if (computedAge <= 4 && !statusArr.includes('infant')) statusArr.push('infant');

    await HouseholdMember.update(memberId, currentResidentId, {
      first_name: cleanFirst,
      middle_name: middle_name && middle_name.trim() ? middle_name.trim() : null,
      last_name: cleanLast,
      relation: relation && relation.trim() ? relation.trim() : 'Family Member',
      sex: sex || 'Male',
      birthdate: birthdate || null,
      age: computedAge,
      status: statusArr.join(','),
      profile_photo: profilePhoto,
      is_pregnant: isPregBool,
      is_lactating: isLactBool,
      is_pwd: isPwdBool,
      has_serious_illness: hasIllnessBool,
      serious_illness_details: serious_illness_details ? serious_illness_details.trim() : null
    });

    if (isAjax) {
      return res.json({ success: true, message: `Member ${cleanFirst} ${cleanLast} updated successfully.`, redirect: '/resident/qr' });
    }
    res.redirect("/resident/qr?success=" + encodeURIComponent(`Family member ${cleanFirst} ${cleanLast} updated successfully.`));
  } catch (error) {
    console.error("Error editing member:", error);
    res.status(500).send("Server Error");
  }
};

const Center = require('../models/centerModel');

exports.manualCheckin = async (req, res) => {
  try {
    const { center_id } = req.body;
    const [residentRows] = await db.execute('SELECT id, first_name, last_name FROM residents WHERE user_id = ?', [req.session.userId]);
    if (!residentRows.length) return res.status(403).json({ success: false, message: 'Resident not found.' });

    const resident = residentRows[0];

    // Check if already actively checked in anywhere
    const [existing] = await db.execute(
      "SELECT id FROM check_ins WHERE resident_id = ? AND status = 'ACTIVE'",
      [resident.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'You are already checked in to an evacuation center.' });
    }

    // Fetch center to verify it exists and get current occupancy
    const center = await Center.findById(center_id);
    if (!center) return res.status(404).json({ success: false, message: 'Center not found.' });

    if (center.current_occupancy >= center.max_capacity) {
      return res.status(409).json({ success: false, message: 'This center is at full capacity.' });
    }

    // Insert check_in record
    await db.execute(
      "INSERT INTO check_ins (resident_id, center_id, status) VALUES (?, ?, 'ACTIVE')",
      [resident.id, center_id]
    );

    // Update center occupancy
    const newOccupancy = center.current_occupancy + 1;
    await Center.updateOccupancy(center_id, newOccupancy);

    // Emit socket.io event for real-time admin/resident update
    const fullName = resident.first_name + ' ' + resident.last_name;
    if (req.io) {
      req.io.emit('center_updated', {
        centerId: center_id,
        occupancy: newOccupancy,
        newResident: fullName
      });
      try {
        const allCenters = await Center.findAll();
        req.io.emit('map_centers_updated', { centers: allCenters });
      } catch (err) {
        console.error('Error broadcasting centers update after manual check-in:', err);
      }
    }

    return res.status(200).json({
      success: true,
      message: `You have been checked in to ${center.name}.`,
      center: { id: center_id, name: center.name, occupancy: newOccupancy }
    });
  } catch (error) {
    console.error('Error during manual check-in:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getEvacuation = async (req, res) => {
  try {
    let firstName = (req.session && req.session.userName) ? req.session.userName.split(' ')[0] : "Resident";
    let residentId = (res.locals && res.locals.resident && res.locals.resident.id) || null;
    let centers = [];
    let mapFeatures = '{"type":"FeatureCollection","features":[]}';
    let activeCheckin = null;

    try {
      const [[residentRows], centersRes, cachedFeatures] = await Promise.all([
        db.execute('SELECT id, first_name FROM residents WHERE user_id = ?', [(req.session && req.session.userId) ? req.session.userId : 0]).catch(() => [[]]),
        Center.findAll().catch(() => []),
        gisCache.getDrawnFeatures(false).catch(() => '{"type":"FeatureCollection","features":[]}')
      ]);
      if (residentRows && residentRows.length > 0) {
        firstName = residentRows[0].first_name || firstName;
        residentId = residentRows[0].id;
      }
      centers = centersRes || [];
      if (cachedFeatures) {
        mapFeatures = cachedFeatures;
      }

      if (residentId) {
        const [checkinRows] = await db.execute(
          "SELECT ci.center_id, ec.name as center_name FROM check_ins ci JOIN evacuation_centers ec ON ci.center_id = ec.id WHERE ci.resident_id = ? AND ci.status = 'ACTIVE' LIMIT 1",
          [residentId]
        ).catch(() => [[]]);
        if (checkinRows && checkinRows.length > 0) activeCheckin = checkinRows[0];
      }
    } catch (dbErr) {
      console.warn('[Resident Evacuation] DB unavailable, serving offline evacuation shell:', dbErr.message);
    }

    res.render("resident/evacuation", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        resident_id: residentId,
        name: firstName,
        role: "resident"
      },
      page: { title: "Evacuation Map" },
      centers: centers,
      mapFeatures: mapFeatures,
      activeCheckin: activeCheckin
    });
  } catch (error) {
    console.error("Error loading evacuation map, rendering offline fallback:", error);
    res.render("resident/evacuation", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        resident_id: null,
        name: (req.session && req.session.userName) || "Resident",
        role: "resident"
      },
      page: { title: "Evacuation Map" },
      centers: [],
      mapFeatures: '{"type":"FeatureCollection","features":[]}',
      activeCheckin: null
    });
  }
};


exports.getTyphoon = async (req, res) => {
  try {
    const name = (res.locals.user && res.locals.user.name) ? res.locals.user.name : ((req.session && req.session.userName) || "Resident");
    const residentId = res.locals.resident ? res.locals.resident.id : null;
    const [liveWeather, pagasaGuidance] = await Promise.all([
      weatherService.getLatestWeather().catch(() => null),
      pagasaService.getPagasaGuidance().catch(() => null)
    ]);
    const finalWeather = liveWeather || res.locals.weather || weatherService.getFallbackWeather();
    if (pagasaGuidance) {
      finalWeather.pagasa = pagasaGuidance;
    }

    res.render("resident/typhoon", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        resident_id: residentId,
        name: name,
        role: "resident"
      },
      page: { title: "Typhoon Monitoring" },
      weather: finalWeather
    });
  } catch (error) {
    console.error("Error loading typhoon page, rendering offline fallback:", error);
    res.render("resident/typhoon", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        resident_id: null,
        name: (req.session && req.session.userName) || "Resident",
        role: "resident"
      },
      page: { title: "Typhoon Monitoring" },
      weather: weatherService.getFallbackWeather()
    });
  }
};

exports.getChat = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    let resident = (res.locals && res.locals.resident) || {};
    if (userId && !resident.first_name) {
      try {
        const [rows] = await db.execute('SELECT id, first_name, last_name, profile_photo FROM residents WHERE user_id = ? LIMIT 1', [userId]);
        if (rows && rows[0]) resident = rows[0];
      } catch (_e) {}
    }
    const fullName = resident.first_name
      ? `${resident.first_name} ${resident.last_name || ''}`.trim()
      : ((res.locals.user && res.locals.user.name) || (req.session && req.session.userName) || "Resident");

    res.render("resident/chat", {
      ...sharedSimData(),
      user: {
        id: userId,
        resident_id: resident.id || null,
        name: fullName,
        full_name: fullName,
        profile_photo: resident.profile_photo || null,
        role: "resident"
      },
      resident: resident,
      page: { title: "LoRa Mesh Chat" }
    });
  } catch (error) {
    console.error("Error loading resident chat page:", error);
    res.render("resident/chat", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        name: (req.session && req.session.userName) || "Resident",
        role: "resident"
      },
      page: { title: "LoRa Mesh Chat" }
    });
  }
};

exports.getSos = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    let userObj = { id: userId, email: (req.session && req.session.email) || '' };
    let resident = (res.locals && res.locals.resident) || (req.session && req.session.userProfile && req.session.userProfile.resident) || {};
    try {
      if (userId) {
        const [userRows] = await db.execute('SELECT id, email FROM users WHERE id = ?', [userId]);
        if (userRows && userRows[0]) userObj = userRows[0];

        const [residentRows] = await db.execute('SELECT id, first_name, last_name, contact_number, barangay, profile_photo FROM residents WHERE user_id = ?', [userId]);
        if (residentRows && residentRows[0]) resident = residentRows[0];
      }
    } catch (dbErr) {
      console.warn('[Resident SOS] DB offline, rendering with session data:', dbErr.message);
    }

    const fullName = resident.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : (res.locals.user ? res.locals.user.name : ((req.session && req.session.userName) || "Resident"));

    res.render("resident/sos", {
      ...sharedSimData(),
      user: {
        id: userId,
        resident_id: resident.id || userId,
        name: fullName,
        profile_photo: resident.profile_photo || null,
        role: "resident"
      },
      resident: resident,
      page: { title: "Emergency SOS" }
    });
  } catch (error) {
    console.error("Error loading SOS page, rendering offline fallback:", error);
    res.render("resident/sos", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        resident_id: req.session ? req.session.userId : null,
        name: (req.session && req.session.userName) || "Resident",
        profile_photo: null,
        role: "resident"
      },
      resident: (res.locals && res.locals.resident) || {},
      page: { title: "Emergency SOS" }
    });
  }
};

exports.getSettings = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    let userObj = { id: userId, email: (req.session && req.session.email) || '', role: 'resident' };
    let resident = (res.locals && res.locals.resident) || (req.session && req.session.userProfile && req.session.userProfile.resident) || {};
    let members = [];

    try {
      if (userId) {
        const [userRows] = await db.execute('SELECT id, email, role FROM users WHERE id = ?', [userId]);
        if (userRows && userRows[0]) userObj = userRows[0];

        const [residentRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
        if (residentRows && residentRows[0]) resident = residentRows[0];

        if (resident.id) {
          members = await HouseholdMember.findByResidentId(resident.id).catch(() => []);
        }
      }
    } catch (dbErr) {
      console.warn('[Resident Settings] DB offline or query failed, serving session/offline profile data:', dbErr.message);
    }

    // Clean string fields
    if (resident.first_name) resident.first_name = resident.first_name.trim();
    if (resident.middle_name) resident.middle_name = resident.middle_name.trim();
    if (resident.last_name) resident.last_name = resident.last_name.trim();
    if (resident.contact_number) resident.contact_number = resident.contact_number.trim();
    if (resident.home_address) resident.home_address = resident.home_address.trim();
    if (resident.barangay) resident.barangay = resident.barangay.trim();
    if (resident.emergency_contact_name) resident.emergency_contact_name = resident.emergency_contact_name.trim();
    if (resident.emergency_contact_phone) resident.emergency_contact_phone = resident.emergency_contact_phone.trim();
    if (resident.vulnerability) resident.vulnerability = resident.vulnerability.trim();

    const nameParts = [resident.first_name, resident.middle_name, resident.last_name].filter(Boolean);
    const fullName = nameParts.length > 0
      ? nameParts.join(' ')
      : ((req.session && req.session.userName) || (userObj.email ? userObj.email.split('@')[0] : 'Resident'));

    const residentUser = {
      id: userObj.id,
      name: fullName,
      full_name: fullName,
      first_name: resident.first_name || '',
      middle_name: resident.middle_name || '',
      last_name: resident.last_name || '',
      role: "resident",
      email: userObj.email || '',
      profile_photo: resident.profile_photo || null
    };

    res.locals = res.locals || {};
    res.locals.resident = resident;
    res.locals.user = residentUser;

    res.render("resident/settings", {
      ...sharedSimData(),
      user: residentUser,
      resident: resident,
      members: members,
      page: { title: "Profile & Settings" },
      statusMsg: req.query.success || null,
      errorMsg: req.query.error || null
    });
  } catch (error) {
    console.error("Error loading settings page, rendering offline fallback:", error);
    res.render("resident/settings", {
      ...sharedSimData(),
      user: {
        id: req.session ? req.session.userId : null,
        name: (req.session && req.session.userName) || "Resident",
        role: "resident",
        email: (req.session && req.session.email) || '',
        profile_photo: null
      },
      resident: (res.locals && res.locals.resident) || {},
      members: [],
      page: { title: "Profile & Settings" },
      statusMsg: null,
      errorMsg: null
    });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    if (!req.session || req.session.role !== 'resident') {
      return res.status(403).send('Forbidden: Only resident accounts can update resident settings.');
    }
    const userId = req.session.userId;
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const {
      first_name,
      middle_name,
      last_name,
      email,
      contact_number,
      barangay,
      home_address,
      vulnerability,
      family_size,
      emergency_contact_name,
      emergency_contact_phone,
      current_password,
      new_password,
      confirm_password
    } = req.body;

    // Fetch existing resident data first to preserve data if fields are missing
    const [existingRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
    const currentRes = existingRows[0] || {};

    const cleanFirst = (first_name !== undefined && first_name !== null) ? first_name.trim() : (currentRes.first_name || '');
    const cleanMiddle = (middle_name !== undefined && middle_name !== null) ? middle_name.trim() : (currentRes.middle_name || null);
    const cleanLast = (last_name !== undefined && last_name !== null) ? last_name.trim() : (currentRes.last_name || '');
    const cleanContact = (contact_number !== undefined && contact_number !== null) ? contact_number.trim() : (currentRes.contact_number || '');
    const cleanAddress = (home_address !== undefined && home_address !== null) ? home_address.trim() : (currentRes.home_address || 'San Rafael');
    const cleanBarangay = (barangay !== undefined && barangay !== null) ? barangay.trim() : (currentRes.barangay || 'San Rafael');
    const cleanVulnerability = (vulnerability !== undefined && vulnerability !== null) ? vulnerability.trim() : (currentRes.vulnerability || 'None');
    const cleanEmergName = (emergency_contact_name !== undefined && emergency_contact_name !== null) ? emergency_contact_name.trim() : (currentRes.emergency_contact_name || null);
    const cleanEmergPhone = (emergency_contact_phone !== undefined && emergency_contact_phone !== null) ? emergency_contact_phone.trim() : (currentRes.emergency_contact_phone || null);

    // 1. Handle Profile Photo Upload if attached
    if (req.file) {
      await db.execute('UPDATE residents SET profile_photo = ? WHERE user_id = ?', [req.file.filename, userId]);
    }

    // 2. Handle Email update if changed
    if (email && email.trim() !== '') {
      const cleanEmail = email.trim().toLowerCase();
      const [existingEmail] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, userId]);
      if (existingEmail.length > 0) {
        return res.redirect('/resident/profile?error=' + encodeURIComponent('Email address is already registered to another account.'));
      }
      await db.execute('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, userId]);
    }

    // 3. Handle Password update if provided
    if (new_password && new_password.trim() !== '') {
      if (!current_password) {
        return res.redirect('/resident/profile?error=' + encodeURIComponent('Please enter your current password to set a new password.'));
      }
      const [userRow] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
      const isMatch = userRow.length > 0 ? await bcrypt.compare(current_password, userRow[0].password_hash) : false;
      if (!isMatch) {
        return res.redirect('/resident/profile?error=' + encodeURIComponent('Current password is incorrect.'));
      }
      if (new_password !== confirm_password) {
        return res.redirect('/resident/profile?error=' + encodeURIComponent('New passwords do not match.'));
      }
      if (!isValidPassword(new_password)) {
        return res.redirect('/resident/profile?error=' + encodeURIComponent(PASSWORD_ERROR_MESSAGE));
      }
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(new_password, salt);
      await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
    }

    // 4. Validate phone numbers
    if (cleanContact && !isValidPhoneNumber(cleanContact)) {
      return res.redirect('/resident/profile?error=' + encodeURIComponent(PHONE_ERROR_MESSAGE));
    }
    if (cleanEmergPhone && !isValidPhoneNumber(cleanEmergPhone)) {
      return res.redirect('/resident/profile?error=' + encodeURIComponent('Emergency Contact Phone: ' + PHONE_ERROR_MESSAGE));
    }

    // 5. Validate contact number uniqueness if changed
    if (cleanContact && cleanContact !== currentRes.contact_number) {
      const [existingContact] = await db.execute('SELECT id FROM residents WHERE contact_number = ? AND user_id != ?', [cleanContact, userId]);
      if (existingContact.length > 0) {
        return res.redirect('/resident/profile?error=' + encodeURIComponent('Contact number is already registered to another resident.'));
      }
    }

    // 5. UPSERT Resident Record
    const parsedFamilySize = (family_size !== undefined && family_size !== '') ? (parseInt(family_size, 10) || 1) : (currentRes.family_size || 1);

    const sex = req.body.sex || currentRes.sex || 'Male';
    const birthdate = req.body.birthdate || currentRes.birthdate || null;
    let age = req.body.age !== undefined && req.body.age !== '' ? parseInt(req.body.age, 10) : currentRes.age;
    if (!age && birthdate) {
      const diffMs = Date.now() - new Date(birthdate).getTime();
      age = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
    }

    const is_4ps = req.body.is_4ps !== undefined ? (req.body.is_4ps === '1' || req.body.is_4ps === 'true' || req.body.is_4ps === true || req.body.is_4ps === 'on') : currentRes.is_4ps;
    const is_pregnant = req.body.is_pregnant !== undefined ? (req.body.is_pregnant === '1' || req.body.is_pregnant === 'true' || req.body.is_pregnant === true || req.body.is_pregnant === 'on') : currentRes.is_pregnant;
    const is_lactating = req.body.is_lactating !== undefined ? (req.body.is_lactating === '1' || req.body.is_lactating === 'true' || req.body.is_lactating === true || req.body.is_lactating === 'on') : currentRes.is_lactating;
    const is_pwd = req.body.is_pwd !== undefined ? (req.body.is_pwd === '1' || req.body.is_pwd === 'true' || req.body.is_pwd === true || req.body.is_pwd === 'on') : currentRes.is_pwd;
    const is_single_head = req.body.is_single_head !== undefined ? (req.body.is_single_head === '1' || req.body.is_single_head === 'true' || req.body.is_single_head === true || req.body.is_single_head === 'on') : currentRes.is_single_head;
    const has_serious_illness = req.body.has_serious_illness !== undefined ? (req.body.has_serious_illness === '1' || req.body.has_serious_illness === 'true' || req.body.has_serious_illness === true || req.body.has_serious_illness === 'on') : currentRes.has_serious_illness;
    const serious_illness_details = req.body.serious_illness_details !== undefined ? req.body.serious_illness_details : currentRes.serious_illness_details;

    const hasSpecialNeeds = cleanVulnerability !== 'None' || is_pwd || is_pregnant || has_serious_illness;

    if (existingRows.length > 0) {
      const residentId = currentRes.id;
      await db.execute(`
        UPDATE residents 
        SET first_name = ?, 
            middle_name = ?,
            last_name = ?, 
            sex = ?,
            birthdate = ?,
            age = ?,
            contact_number = ?, 
            home_address = ?, 
            barangay = ?, 
            vulnerability = ?, 
            family_size = ?, 
            has_special_needs = ?, 
            is_4ps = ?,
            is_pregnant = ?,
            is_lactating = ?,
            is_pwd = ?,
            is_single_head = ?,
            has_serious_illness = ?,
            serious_illness_details = ?,
            emergency_contact_name = ?, 
            emergency_contact_phone = ? 
        WHERE id = ?
      `, [
        cleanFirst,
        cleanMiddle || null,
        cleanLast,
        sex,
        birthdate || null,
        age || null,
        cleanContact,
        cleanAddress,
        cleanBarangay,
        cleanVulnerability,
        parsedFamilySize,
        hasSpecialNeeds,
        is_4ps ? 1 : 0,
        is_pregnant ? 1 : 0,
        is_lactating ? 1 : 0,
        is_pwd ? 1 : 0,
        is_single_head ? 1 : 0,
        has_serious_illness ? 1 : 0,
        serious_illness_details || null,
        cleanEmergName,
        cleanEmergPhone,
        residentId
      ]);
    } else {
      if (!req.session || req.session.role !== 'resident') {
        return res.status(403).send('Forbidden: Non-resident accounts cannot create resident records.');
      }
      const qr_code_uuid = crypto.randomUUID();
      await db.execute(`
        INSERT INTO residents 
        (user_id, first_name, middle_name, last_name, sex, birthdate, age, contact_number, home_address, barangay, vulnerability, family_size, has_special_needs, is_4ps, is_pregnant, is_lactating, is_pwd, is_single_head, has_serious_illness, serious_illness_details, emergency_contact_name, emergency_contact_phone, qr_code_uuid)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        cleanFirst,
        cleanMiddle || null,
        cleanLast,
        sex,
        birthdate || null,
        age || null,
        cleanContact,
        cleanAddress,
        cleanBarangay,
        cleanVulnerability,
        parsedFamilySize,
        hasSpecialNeeds,
        is_4ps ? 1 : 0,
        is_pregnant ? 1 : 0,
        is_lactating ? 1 : 0,
        is_pwd ? 1 : 0,
        is_single_head ? 1 : 0,
        has_serious_illness ? 1 : 0,
        serious_illness_details || null,
        cleanEmergName,
        cleanEmergPhone,
        qr_code_uuid
      ]);
    }

    const updatedNameParts = [cleanFirst, cleanMiddle, cleanLast].filter(Boolean);
    if (updatedNameParts.length > 0) {
      req.session.userName = updatedNameParts.join(' ');
    }
    if (req.session) {
      req.session.userProfile = null;
      req.session.userProfileTime = 0;
    }

    const returnTo = (req.body.returnTo && req.body.returnTo.startsWith('/resident')) ? req.body.returnTo : '/resident/profile';
    const glue = returnTo.includes('?') ? '&' : '?';
    return res.redirect(returnTo + glue + 'success=' + encodeURIComponent('Profile details updated successfully!'));
  } catch (error) {
    console.error("Error updating resident settings:", error);
    const returnTo = (req.body.returnTo && req.body.returnTo.startsWith('/resident')) ? req.body.returnTo : '/resident/profile';
    const glue = returnTo.includes('?') ? '&' : '?';
    return res.redirect(returnTo + glue + 'error=' + encodeURIComponent('Failed to update settings: ' + (error.message || 'Server error')));
  }
};
