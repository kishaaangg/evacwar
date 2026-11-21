const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const gisCache = require('../utils/gisCache');
const sharedSimData = require('../utils/simData');
const weatherService = require('../utils/weatherService');
const Center = require('../models/centerModel');
const Resident = require('../models/residentModel');
const HouseholdMember = require('../models/householdMemberModel');
const User = require('../models/userModel');
const SosModel = require('../models/sosModel');
const Alert = require('../models/alertModel');
const pushService = require('../services/pushService');
const { queueOutboundAlertBroadcast } = require('../routes/loraRoutes');

const Staff = require('../models/staffModel');
const rescuerTracker = require('../utils/rescuerTracker');
const { isValidPhoneNumber, isValidPassword, PHONE_ERROR_MESSAGE, PASSWORD_ERROR_MESSAGE } = require('../utils/validators');

// Helper to broadcast live evacuation centers with resident rosters to tactical maps
async function broadcastLiveCenters(io, extra = {}) {
  if (!io) return [];
  try {
    const allCenters = await Center.findAll();
    io.emit('map_centers_updated', { centers: allCenters, ...extra });
    return allCenters;
  } catch (e) {
    console.error('Error broadcasting live centers to map:', e);
    return [];
  }
}

// Helper to get staff session context & assigned center
async function getStaffContext(userId, existingStaff) {
  if (!userId) {
    return {
      userId: null,
      staffId: null,
      name: "Staff",
      firstName: "Staff",
      lastName: "",
      role: "staff",
      staff_type: "BOTH",
      assigned_center_id: 1,
      assigned_centers: [],
      assignedCenterIds: [],
      assigned_barangay: "San Rafael",
      center: null
    };
  }

  let staff = await Staff.findByUserId(userId);
  if (!staff) {
    const user = await User.findById(userId);
    if (user && (user.role === 'staff' || user.role === 'barangay_council')) {
      await Staff.create({
        user_id: user.id,
        first_name: user.first_name || user.email.split('@')[0],
        last_name: user.last_name || 'Member',
        staff_type: user.staff_type || 'BOTH',
        assigned_center_id: user.assigned_center_id || null
      });
      staff = await Staff.findByUserId(userId);
    } else if (user) {
      // Safe fallback context without inserting a staff record for non-staff
      return {
        userId: user.id,
        staffId: null,
        name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email.split('@')[0],
        firstName: user.first_name || 'Staff',
        lastName: user.last_name || '',
        role: user.role,
        staff_type: 'BOTH',
        assigned_center_id: 1,
        assigned_centers: [],
        assignedCenterIds: [],
        assigned_barangay: "San Rafael",
        center: null
      };
    }
  }

  const staffType = staff ? (staff.staff_type || 'BOTH') : 'BOTH';
  let assignedCenters = [];
  let assignedCenterIds = [];
  let centerId = null;
  let center = null;

  // Rescuers do not have evacuation center assignments
  if (staffType !== 'RESCUER') {
    if (staff && staff.user_id) {
      assignedCenters = await Staff.getAssignedCenters(staff.user_id, staff.assigned_center_id);
    }
    assignedCenterIds = assignedCenters.map(c => c.id);
    centerId = assignedCenterIds.length > 0 ? assignedCenterIds[0] : null;

    if (centerId) {
      center = assignedCenters.find(c => c.id === centerId) || await Center.findById(centerId);
    }
  }

  let zone = 'San Rafael';
  if (center && center.address) {
    zone = center.address;
  } else if (center && center.name) {
    zone = center.name;
  }

  const firstName = staff ? staff.first_name : (existingStaff ? existingStaff.firstName : 'Staff');
  const lastName = staff ? staff.last_name : (existingStaff ? existingStaff.lastName : '');
  const fullName = staff ? (staff.full_name || `${firstName} ${lastName}`.trim()) : (existingStaff ? existingStaff.name : 'Staff Member');

  return {
    userId: staff ? staff.user_id : userId,
    staffId: staff ? staff.id : (existingStaff ? existingStaff.id : null),
    name: fullName,
    firstName: firstName,
    lastName: lastName,
    email: staff ? staff.email : (existingStaff ? existingStaff.email : ''),
    profile_photo: staff ? staff.profile_photo : (existingStaff ? existingStaff.profile_photo : null),
    role: staff ? staff.role : 'staff',
    staff_type: staff ? staff.staff_type : 'BOTH',
    assigned_center_id: centerId,
    assigned_centers: assignedCenters,
    assignedCenterIds: assignedCenterIds,
    assigned_barangay: zone,
    contact_number: staff ? staff.contact_number : (existingStaff ? existingStaff.contact_number : null),
    occupation: staff ? staff.occupation : 'Emergency Staff',
    zone: zone,
    center: center
  };
}

// 1. STAFF DASHBOARD
exports.getDashboard = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId, res.locals.staff);
    const isRescuer = staff.staff_type === 'RESCUER';
    const isEvacuation = staff.staff_type === 'EVACUATION';
    const isBoth = staff.staff_type === 'BOTH';

    let centerId = null;
    let ecStats = null;
    let formattedActivity = [];
    let allCenters = [];
    let assignedCentersWithSituations = [];

    console.log('[STAFF ROUTE] dashboard');
    console.log(`[STAFF ROUTE] assigned centers: ${(staff.assignedCenterIds || []).join(', ')}`);

    // Occupancy and center data is ONLY for EVACUATION and BOTH staff
    if (!isRescuer) {
      // Check for explicit center request via route param (/staff/site/:centerId) or query (?center_id=...)
      const rawRequested = req.params.centerId || req.query.center_id;
      const requestedCenterId = rawRequested ? parseInt(rawRequested, 10) : null;

      if (requestedCenterId) {
        console.log(`[STAFF ROUTE] requested center: ${requestedCenterId}`);
        const isAuthorized = staff.assignedCenterIds && staff.assignedCenterIds.includes(requestedCenterId);
        console.log(`[STAFF ROUTE] center authorized: ${isAuthorized}`);

        if (!isAuthorized) {
          // Strictly deny access to unassigned evacuation center
          return res.status(403).send("Access denied. You are not assigned to this evacuation center.");
        }

        centerId = requestedCenterId;
        req.session.activeCenterId = centerId;
      } else {
        // No explicit center requested: retrieve active center from session if valid, or default to first assigned
        if (req.session.activeCenterId && staff.assignedCenterIds.includes(req.session.activeCenterId)) {
          centerId = req.session.activeCenterId;
        } else if (staff.assignedCenterIds && staff.assignedCenterIds.length > 0) {
          centerId = staff.assignedCenterIds[0];
          req.session.activeCenterId = centerId;
        } else {
          centerId = null;
          req.session.activeCenterId = null;
        }
      }

      console.log(`[STAFF ROUTE] active center: ${centerId || 'none'}`);

      staff.assigned_center_id = centerId;
      if (centerId) {
        staff.center = (staff.assigned_centers || []).find(c => c.id === centerId) || await Center.findById(centerId);
      }

      // 1. Fetch live situations for ALL assigned centers
      const assignedCenters = (staff.assigned_centers && staff.assigned_centers.length > 0)
        ? staff.assigned_centers
        : (staff.center ? [staff.center] : []);

      if (assignedCenters.length > 0) {
        const assignedIds = assignedCenters.map(c => c.id);

        // Batch query assigned staff count per center (one site per staff)
        const staffCountMap = {};

        try {
          const [legacyStaffCountRows] = await db.execute(`
            SELECT assigned_center_id as center_id, COUNT(DISTINCT user_id) as staff_count
            FROM staff
            WHERE assigned_center_id IN (${assignedIds.map(() => '?').join(',')})
            GROUP BY assigned_center_id
          `, assignedIds);
          legacyStaffCountRows.forEach(r => {
            if (r.center_id) {
              staffCountMap[r.center_id] = Math.max(staffCountMap[r.center_id] || 0, r.staff_count || 0);
            }
          });
        } catch (lscErr) {
          console.warn("Could not batch query legacy staff count:", lscErr.message);
        }

        // Retrieve situations without fake numbers
        for (const c of assignedCenters) {
          const stats = await Center.getEcBoardStats(c.id).catch(() => null);
          const capacity = (stats && stats.summary && stats.summary.capacity) ? stats.summary.capacity : (c.max_capacity || 25);
          const occupancy = (stats && stats.summary && stats.summary.total_checked_in != null) ? stats.summary.total_checked_in : (c.current_occupancy || 0);
          const families = (stats && stats.summary && stats.summary.total_families != null) ? stats.summary.total_families : 0;
          const availableSlots = (stats && stats.summary && stats.summary.available_slots != null) ? stats.summary.available_slots : Math.max(0, capacity - occupancy);
          const occupancyPct = capacity > 0 ? Math.min(100, Math.round((occupancy / capacity) * 100)) : 0;
          const isFull = (stats && stats.summary && stats.summary.is_full) || (occupancy >= capacity);

          assignedCentersWithSituations.push({
            id: c.id,
            name: c.name,
            address: c.address || 'San Rafael',
            zone: c.address || c.name,
            capacity: capacity,
            occupancy: occupancy,
            families: families,
            available_slots: availableSlots,
            occupancy_pct: occupancyPct,
            is_full: isFull,
            status: isFull ? 'FULL CAPACITY' : 'ACCEPTING EVACUEES',
            assigned_staff_count: staffCountMap[c.id] || 1,
            is_active: c.id === centerId
          });
        }
      }

      if (centerId) {
        ecStats = await Center.getEcBoardStats(centerId);

        const [recentActivity] = await db.execute(`
          SELECT 
            c.id as check_in_id,
            c.check_in_time,
            c.check_out_time,
            c.status,
            c.check_in_method,
            c.household_member_id,
            r.first_name as res_first_name,
            r.last_name as res_last_name,
            hm.first_name as mem_first_name,
            hm.last_name as mem_last_name,
            r.barangay
          FROM check_ins c
          JOIN residents r ON c.resident_id = r.id
          LEFT JOIN household_members hm ON c.household_member_id = hm.id
          WHERE c.center_id = ?
          ORDER BY COALESCE(c.check_out_time, c.check_in_time) DESC
          LIMIT 10
        `, [centerId]);

        formattedActivity = recentActivity.map(act => {
          const isHead = act.household_member_id === null;
          const personName = isHead ? `${act.res_first_name} ${act.res_last_name}` : `${act.mem_first_name} ${act.mem_last_name}`;
          const isOut = act.status === 'DEPARTED' || act.status === 'CHECKED_OUT';
          const time = isOut && act.check_out_time ? act.check_out_time : act.check_in_time;

          return {
            id: act.check_in_id,
            name: personName,
            is_head: isHead,
            type: isOut ? 'CHECK_OUT' : 'CHECK_IN',
            method: act.check_in_method || 'QR',
            barangay: act.barangay || 'San Rafael',
            timeFormatted: new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            dateFormatted: new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric' })
          };
        });
      }

      allCenters = await Center.findAll();
    }

    // Fetch active SOS requests for RESCUER and BOTH
    let activeSosAlerts = [];
    if (isRescuer || isBoth) {
      activeSosAlerts = await SosModel.getActiveAlerts();
    }

    const liveWeather = (res.locals && res.locals.weather)
      ? res.locals.weather
      : await weatherService.getLatestWeather().catch(() => null);

    res.render("staff/dashboard", {
      ...sharedSimData(),
      user: {
        id: staff.userId,
        name: staff.name,
        email: staff.email,
        profile_photo: staff.profile_photo,
        role: staff.role,
        staff_type: staff.staff_type
      },
      page: { title: "Staff Dashboard" },
      weather: liveWeather || res.locals.weather,
      staff: {
        id: staff.staffId,
        staff_type: staff.staff_type,
        assigned_center_id: staff.assigned_center_id,
        assigned_centers: staff.assigned_centers,
        assignedCenterIds: staff.assignedCenterIds,
        occupation: staff.occupation,
        contact_number: staff.contact_number,
        center: staff.center
      },
      ecStats: ecStats,
      assignedCentersWithSituations: assignedCentersWithSituations,
      activeCenterId: centerId,
      activeSosAlerts: activeSosAlerts,
      recentActivity: formattedActivity,
      allCenters: allCenters
    });
  } catch (error) {
    console.error("Error loading staff dashboard:", error);
    res.status(500).send("Server Error loading Staff Dashboard.");
  }
};

// 2. DIGITAL EC INFORMATION BOARD
exports.getEcBoard = async (req, res) => {
  return res.redirect('/staff/reports');
};

// 3. DIGITAL EC BOARD JSON API (for live polling or auto-refresh)
exports.getEcBoardData = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    const rawRequested = req.query.center_id;
    const requestedCenterId = rawRequested ? parseInt(rawRequested, 10) : null;
    let centerId = requestedCenterId || req.session.activeCenterId || staff.assigned_center_id;

    if (!centerId || !staff.assignedCenterIds || !staff.assignedCenterIds.includes(centerId)) {
      return res.status(403).json({ success: false, error: "Unauthorized evacuation center." });
    }

    const ecStats = await Center.getEcBoardStats(centerId);
    if (!ecStats) {
      return res.status(404).json({ success: false, message: "Evacuation Center not found" });
    }

    res.json({ success: true, data: ecStats });
  } catch (error) {
    console.error("Error fetching EC Board data:", error);
    res.status(500).json({ success: false, error: "Failed to fetch EC statistics" });
  }
};

// 4. QR SCANNER & WALK-IN INTAKE INTERFACE
exports.getQr = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    const isRescuer = staff.staff_type === 'RESCUER';

    if (isRescuer) {
      return res.redirect('/staff');
    }

    const rawRequested = req.query.center_id;
    const requestedCenterId = rawRequested ? parseInt(rawRequested, 10) : null;
    let centerId = null;

    if (requestedCenterId) {
      const isAuthorized = staff.assignedCenterIds && staff.assignedCenterIds.includes(requestedCenterId);
      if (!isAuthorized) {
        return res.status(403).send("Access denied. You are not assigned to this evacuation center.");
      }
      centerId = requestedCenterId;
      req.session.activeCenterId = centerId;
    } else {
      if (req.session.activeCenterId && staff.assignedCenterIds.includes(req.session.activeCenterId)) {
        centerId = req.session.activeCenterId;
      } else if (staff.assignedCenterIds && staff.assignedCenterIds.length > 0) {
        centerId = staff.assignedCenterIds[0];
        req.session.activeCenterId = centerId;
      }
    }

    staff.assigned_center_id = centerId;
    if (centerId) {
      staff.center = (staff.assigned_centers || []).find(c => c.id === centerId) || await Center.findById(centerId);
    }

    const allCenters = await Center.findAll();

    const [recentRows] = await db.execute(`
      SELECT 
        c.id as check_in_id,
        c.check_in_time,
        c.check_in_method,
        r.id as resident_id,
        r.first_name,
        r.last_name,
        r.barangay,
        r.home_address,
        r.is_4ps, r.is_pwd, r.is_pregnant, r.is_lactating, r.has_serious_illness,
        ec.name as center_name,
        (SELECT COUNT(*) FROM check_ins c2 WHERE c2.resident_id = r.id AND c2.center_id = ? AND c2.status IN ('ACTIVE', 'CHECKED_IN')) as checked_in_count
      FROM check_ins c
      JOIN residents r ON c.resident_id = r.id
      JOIN evacuation_centers ec ON c.center_id = ec.id
      WHERE c.center_id = ? AND c.household_member_id IS NULL AND c.status IN ('ACTIVE', 'CHECKED_IN')
      ORDER BY c.check_in_time DESC
      LIMIT 25
    `, [centerId, centerId]);

    const formattedScanned = recentRows.map(row => ({
      check_in_id: row.check_in_id,
      resident_id: row.resident_id,
      name: `${row.first_name} ${row.last_name}`,
      barangay: row.barangay || 'San Rafael',
      address: row.home_address || '',
      center_name: row.center_name,
      checked_in_count: row.checked_in_count || 1,
      is_4ps: !!row.is_4ps,
      is_pwd: !!row.is_pwd,
      is_pregnant: !!row.is_pregnant,
      is_lactating: !!row.is_lactating,
      has_serious_illness: !!row.has_serious_illness,
      timeFormatted: new Date(row.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

    res.render("staff/qr-scanner", {
      ...sharedSimData(),
      user: {
        id: staff.userId,
        name: staff.name,
        role: staff.role,
        staff_type: staff.staff_type
      },
      page: { title: "QR Intake & Scanner" },
      staff: staff,
      centers: allCenters || [],
      recentScanned: formattedScanned
    });
  } catch (error) {
    console.error("Error loading staff QR scanner:", error);
    res.status(500).send("Server Error");
  }
};

// Helper: Enforce strict Evacuation Center full-capacity lock before QR scan, confirm check-in, or walk-in intake
async function getCenterCapacityStatus(centerId) {
  if (!centerId) return { isFull: false, occupancy: 0, maxCap: 25, availableSlots: 25, centerName: 'Evacuation Center' };
  const [cRows] = await db.execute(
    'SELECT id, name, max_capacity, current_occupancy, status FROM evacuation_centers WHERE id = ? LIMIT 1',
    [centerId]
  );
  if (!cRows || cRows.length === 0) {
    return { isFull: false, occupancy: 0, maxCap: 25, availableSlots: 25, centerName: 'Evacuation Center' };
  }
  const c = cRows[0];
  const [occRows] = await db.execute(
    `SELECT COUNT(*) AS cnt FROM check_ins WHERE center_id = ? AND status IN ('ACTIVE', 'CHECKED_IN')`,
    [centerId]
  ).catch(() => [[{ cnt: c.current_occupancy || 0 }]]);
  const liveOccupancy = Math.max(Number(occRows[0]?.cnt || 0), Number(c.current_occupancy || 0));
  const maxCap = Math.max(1, Number(c.max_capacity || 25));
  const availableSlots = Math.max(0, maxCap - liveOccupancy);
  const isFull = liveOccupancy >= maxCap || String(c.status || '').toUpperCase() === 'FULL';
  return {
    isFull,
    occupancy: liveOccupancy,
    maxCap,
    availableSlots,
    centerName: c.name || 'Evacuation Center'
  };
}

// 5. LOOKUP RESIDENT & HOUSEHOLD MEMBERS (via QR UUID or Search query)
exports.lookupQr = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    if (staff.staff_type === 'RESCUER') {
      return res.status(403).json({ success: false, message: "Access restricted: Rescuers do not scan or perform evacuation center check-ins. Your primary focus is SOS emergency response." });
    }

    const parsedCenterId = req.body.center_id ? parseInt(req.body.center_id, 10) : null;
    const targetCenterId = parsedCenterId || req.session.activeCenterId || staff.assigned_center_id;
    const cap = await getCenterCapacityStatus(targetCenterId);
    if (cap.isFull) {
      return res.status(403).json({
        success: false,
        center_full: true,
        occupancy: cap.occupancy,
        max_capacity: cap.maxCap,
        message: `🚫 Evacuation Center FULL CAPACITY (${cap.occupancy}/${cap.maxCap}): ${cap.centerName} is no longer accepting new evacuees. Please direct evacuees to the nearest available shelter.`
      });
    }

    const query = (req.body.uuid || req.body.query || '').trim();
    if (!query) {
      return res.status(400).json({ success: false, message: "Please provide a QR Code UUID, resident name, or contact number." });
    }

    let [residentRows] = await db.execute('SELECT * FROM residents WHERE qr_code_uuid = ?', [query]);

    if (residentRows.length === 0 && /^\d+$/.test(query)) {
      [residentRows] = await db.execute('SELECT * FROM residents WHERE id = ?', [parseInt(query, 10)]);
    }

    if (residentRows.length === 0) {
      [residentRows] = await db.execute(`
        SELECT * FROM residents 
        WHERE contact_number = ? 
           OR CONCAT(first_name, ' ', last_name) LIKE ? 
           OR CONCAT(first_name, ' ', COALESCE(middle_name, ''), ' ', last_name) LIKE ?
      `, [query, `%${query}%`, `%${query}%`]);
    }

    if (residentRows.length === 0) {
      // Also search by family member name
      [residentRows] = await db.execute(`
        SELECT DISTINCT r.* FROM residents r
        JOIN household_members hm ON hm.resident_id = r.id
        WHERE CONCAT(hm.first_name, ' ', hm.last_name) LIKE ? 
           OR CONCAT(hm.first_name, ' ', COALESCE(hm.middle_name, ''), ' ', hm.last_name) LIKE ?
      `, [`%${query}%`, `%${query}%`]);
    }

    if (residentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No registered resident found matching query. Please use 'Walk-in Registration' to log them in directly."
      });
    }

    // Helper to format a single household's resident, members, and check-in statuses
    const formatSingleHouseholdData = async (resItem) => {
      const members = await HouseholdMember.findByResidentId(resItem.id);

      // Fetch active check-in records for this household
      const [activeCheckIns] = await db.execute(`
        SELECT c.*, ec.name as center_name 
        FROM check_ins c 
        LEFT JOIN evacuation_centers ec ON c.center_id = ec.id 
        WHERE c.resident_id = ? AND c.status IN ('ACTIVE', 'CHECKED_IN')
      `, [resItem.id]);

      const headActive = activeCheckIns.find(ci => ci.household_member_id === null);
      const memberCheckInMap = {};
      activeCheckIns.forEach(ci => {
        if (ci.household_member_id !== null) {
          memberCheckInMap[ci.household_member_id] = ci;
        }
      });

      let evacuatedCount = headActive ? 1 : 0;
      members.forEach(m => {
        if (memberCheckInMap[m.id]) evacuatedCount++;
      });

      const totalHouseholdCount = 1 + members.length;

      let headAge = resItem.age;
      if (resItem.birthdate) {
        const diffMs = Date.now() - new Date(resItem.birthdate).getTime();
        headAge = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
      }

      return {
        success: true,
        household_name: `${resItem.last_name} Household`,
        evacuated_count: evacuatedCount,
        total_household_count: totalHouseholdCount,
        evacuation_summary: `${evacuatedCount} / ${totalHouseholdCount} members`,
        resident: {
          id: resItem.id,
          uuid: resItem.qr_code_uuid,
          first_name: resItem.first_name,
          middle_name: resItem.middle_name,
          last_name: resItem.last_name,
          name: `${resItem.first_name} ${resItem.last_name}`,
          relation: 'Head',
          sex: resItem.sex || 'Male',
          age: headAge || 'N/A',
          address: resItem.home_address,
          barangay: resItem.barangay || 'San Rafael',
          contact: resItem.contact_number,
          is_4ps: !!resItem.is_4ps,
          is_pregnant: !!resItem.is_pregnant,
          is_lactating: !!resItem.is_lactating,
          is_pwd: !!resItem.is_pwd,
          is_single_head: !!resItem.is_single_head,
          has_serious_illness: !!resItem.has_serious_illness,
          serious_illness_details: resItem.serious_illness_details,
          vulnerability: resItem.vulnerability || 'None',
          emergency_contact_name: resItem.emergency_contact_name || 'N/A',
          emergency_contact_phone: resItem.emergency_contact_phone || 'N/A',
          family_size: totalHouseholdCount,
          is_checked_in: !!headActive,
          evacuation_status: headActive ? 'CHECKED_IN' : 'NOT_EVACUATED',
          checked_in_center: headActive ? headActive.center_name : null,
          checked_in_id: headActive ? headActive.id : null,
          check_in_time: headActive ? new Date(headActive.check_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }) : null
        },
        members: members.map(m => {
          let memAge = m.age;
          if (m.birthdate) {
            const diffMs = Date.now() - new Date(m.birthdate).getTime();
            memAge = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
          }
          const isMemChecked = !!memberCheckInMap[m.id];
          return {
            id: m.id,
            first_name: m.first_name,
            middle_name: m.middle_name,
            last_name: m.last_name,
            name: `${m.first_name} ${m.last_name}`,
            relation: m.relation || 'Family',
            sex: m.sex || 'Male',
            age: memAge || 'N/A',
            status: m.status,
            is_pregnant: !!m.is_pregnant,
            is_lactating: !!m.is_lactating,
            is_pwd: !!m.is_pwd,
            has_serious_illness: !!m.has_serious_illness,
            serious_illness_details: m.serious_illness_details,
            is_checked_in: isMemChecked,
            evacuation_status: isMemChecked ? 'CHECKED_IN' : 'NOT_EVACUATED',
            checked_in_center: isMemChecked ? memberCheckInMap[m.id].center_name : null,
            checked_in_id: isMemChecked ? memberCheckInMap[m.id].id : null,
            check_in_time: isMemChecked ? new Date(memberCheckInMap[m.id].check_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }) : null
          };
        })
      };
    };

    // Case 1: Exact single resident match
    if (residentRows.length === 1) {
      const resident = residentRows[0];
      if (resident.approval_status === 'PENDING') {
        return res.status(403).json({
          success: false,
          message: "This resident account is currently PENDING verification. Please approve their account in Manage Residents before QR check-in, or register them as a walk-in."
        });
      }
      if (resident.approval_status === 'REJECTED') {
        return res.status(403).json({
          success: false,
          message: "This resident account has been REJECTED by barangay administration."
        });
      }
      const data = await formatSingleHouseholdData(resident);
      return res.json(data);
    }

    // Case 2: Multiple matching residents (e.g. searching common surname like 'Payra')
    const approvedResidents = residentRows.filter(r => r.approval_status !== 'REJECTED');
    if (approvedResidents.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Matching resident accounts have been rejected by administration."
      });
    }

    const households = [];
    for (const r of approvedResidents.slice(0, 25)) {
      households.push(await formatSingleHouseholdData(r));
    }

    return res.json({
      success: true,
      multiple: true,
      count: households.length,
      query: query,
      households: households
    });
  } catch (error) {
    console.error("Lookup QR Error:", error);
    res.status(500).json({ success: false, message: "Server Error during QR lookup" });
  }
};

// 6. CONFIRM CHECK-IN (QR selective intake)
exports.confirmCheckIn = async (req, res) => {
  try {
    const { resident_id, center_id, check_in_head, member_ids, check_in_method = 'QR' } = req.body;
    const staff = await getStaffContext(req.session.userId);

    if (staff.staff_type === 'RESCUER') {
      return res.status(403).json({ success: false, message: "Access restricted: Rescuers do not scan or perform evacuation center check-ins." });
    }

    const parsedCenterId = center_id ? parseInt(center_id, 10) : null;
    const targetCenterId = parsedCenterId || req.session.activeCenterId || staff.assigned_center_id;
    const staffUserId = staff.userId;

    // Verify staff is authorized for this center
    if (!targetCenterId || !staff.assignedCenterIds || !staff.assignedCenterIds.includes(targetCenterId)) {
      return res.status(403).json({ success: false, message: "You are not authorized to check residents into this evacuation center." });
    }

    // Enforce strict full-capacity lock (do not accept new evacuees when full or exceeding remaining slots)
    const cap = await getCenterCapacityStatus(targetCenterId);
    const shouldCheckInHeadPre = (check_in_head === true || check_in_head === 'true' || check_in_head === 1 || check_in_head === '1');
    const preMemberArray = Array.isArray(member_ids) ? member_ids : (member_ids ? [member_ids] : []);
    const requestedHeadCount = shouldCheckInHeadPre ? 1 : 0;
    const requestedTotalCount = Math.max(1, requestedHeadCount + preMemberArray.length);
    if (cap.isFull) {
      return res.status(403).json({
        success: false,
        center_full: true,
        occupancy: cap.occupancy,
        max_capacity: cap.maxCap,
        message: `🚫 Evacuation Center FULL CAPACITY (${cap.occupancy}/${cap.maxCap}): ${cap.centerName} is no longer accepting new evacuees.`
      });
    }
    if (requestedTotalCount > cap.availableSlots) {
      return res.status(403).json({
        success: false,
        center_full: true,
        occupancy: cap.occupancy,
        max_capacity: cap.maxCap,
        available_slots: cap.availableSlots,
        message: `⚠️ Insufficient capacity at ${cap.centerName}: only ${cap.availableSlots} slot(s) remaining (${cap.occupancy}/${cap.maxCap}). Cannot check in ${requestedTotalCount} evacuees.`
      });
    }

    const [residentRows] = await db.execute('SELECT * FROM residents WHERE id = ?', [resident_id]);
    if (residentRows.length === 0) {
      return res.status(404).json({ success: false, message: "Resident record not found." });
    }
    const resident = residentRows[0];

    let newlyCheckedInCount = 0;
    const checkedInNames = [];

    // 1. Check in Head of Household if selected
    const shouldCheckInHead = (check_in_head === true || check_in_head === 'true' || check_in_head === 1 || check_in_head === '1');
    if (shouldCheckInHead) {
      const [existingHead] = await db.execute(
        `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id IS NULL AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
        [resident_id]
      );
      if (existingHead.length === 0) {
        await db.execute(
          `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
           VALUES (?, NULL, ?, ?, 'ACTIVE', ?)`,
          [resident_id, targetCenterId, staffUserId, check_in_method]
        );
        newlyCheckedInCount++;
        checkedInNames.push(`${resident.first_name} ${resident.last_name} (Head)`);
      } else if (existingHead[0].center_id !== targetCenterId) {
        // Relocated / Transferred from another center: check out old center and intake to target center
        const oldCenterId = existingHead[0].center_id;
        await db.execute(
          `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
          [existingHead[0].id]
        );
        await Center.syncOccupancy(oldCenterId);
        await db.execute(
          `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
           VALUES (?, NULL, ?, ?, 'ACTIVE', ?)`,
          [resident_id, targetCenterId, staffUserId, check_in_method]
        );
        newlyCheckedInCount++;
        checkedInNames.push(`${resident.first_name} ${resident.last_name} (Head - Transferred)`);
      } else {
        // Already active in this center: refresh check-in timestamp to bring to top of intake feed
        await db.execute(
          `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`,
          [existingHead[0].id]
        );
        newlyCheckedInCount++;
        checkedInNames.push(`${resident.first_name} ${resident.last_name} (Head)`);
      }
    }

    // 2. Check in selected family members
    const memberArray = Array.isArray(member_ids) ? member_ids : (member_ids ? [member_ids] : []);
    if (memberArray.length > 0) {
      const allMembers = await HouseholdMember.findByResidentId(resident_id);

      for (const mId of memberArray) {
        const parsedMemberId = parseInt(mId, 10);
        if (!isNaN(parsedMemberId)) {
          const memberObj = allMembers.find(m => m.id === parsedMemberId);
          if (memberObj) {
            const [existingMemberCheckIn] = await db.execute(
              `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id = ? AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
              [resident_id, parsedMemberId]
            );
            if (existingMemberCheckIn.length === 0) {
              await db.execute(
                `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
                 VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
                [resident_id, parsedMemberId, targetCenterId, staffUserId, check_in_method]
              );
              newlyCheckedInCount++;
              checkedInNames.push(`${memberObj.first_name} ${memberObj.last_name}`);
            } else if (existingMemberCheckIn[0].center_id !== targetCenterId) {
              const oldCenterId = existingMemberCheckIn[0].center_id;
              await db.execute(
                `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
                [existingMemberCheckIn[0].id]
              );
              await Center.syncOccupancy(oldCenterId);
              await db.execute(
                `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
                 VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
                [resident_id, parsedMemberId, targetCenterId, staffUserId, check_in_method]
              );
              newlyCheckedInCount++;
              checkedInNames.push(`${memberObj.first_name} ${memberObj.last_name} (Transferred)`);
            } else {
              await db.execute(
                `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`,
                [existingMemberCheckIn[0].id]
              );
              newlyCheckedInCount++;
              checkedInNames.push(`${memberObj.first_name} ${memberObj.last_name}`);
            }
          }
        }
      }
    }

    // Sync Center Occupancy
    const newOccupancy = await Center.syncOccupancy(targetCenterId);
    let allCenters = [];
    if (req.io) {
      allCenters = await broadcastLiveCenters(req.io, {
        centerId: targetCenterId,
        occupancy: newOccupancy,
        newResident: checkedInNames.join(', ')
      });
    }
    const centerObj = (allCenters || []).find(c => Number(c.id) === Number(targetCenterId)) || await Center.findById(targetCenterId);

    // Emit Socket updates
    if (req.io) {
      req.io.emit('center_updated', {
        centerId: targetCenterId,
        occupancy: newOccupancy,
        newResident: checkedInNames.join(', '),
        center: centerObj,
        centers: allCenters
      });
      req.io.emit('ec_board_updated', {
        centerId: targetCenterId,
        occupancy: newOccupancy,
        center: centerObj,
        centers: allCenters
      });
      req.io.emit('checkin:new', {
        id: `checkin-${Date.now()}`,
        type: 'checkin',
        category: 'checkin',
        icon: 'ph-house',
        color: 'emerald',
        title: `🏠 Check-In: ${resident.first_name} ${resident.last_name}`,
        message: `${checkedInNames.length > 0 ? checkedInNames.join(', ') : resident.first_name + ' ' + resident.last_name} checked in to ${centerObj ? centerObj.name : 'Center'} by ${staff.name}`,
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        actionUrl: '/admin/reports',
        actionLabel: 'View Masterlist',
        center: centerObj,
        centers: allCenters
      });
    }

    // Auto-resolve any active SOS distress alerts for this resident upon successful check-in
    try {
      const resolvedSosIds = await SosModel.resolveByResidentId(
        resident_id,
        staffUserId,
        `Auto-resolved: Resident successfully checked into ${centerObj ? centerObj.name : 'Evacuation Center'}`
      );
      if (req.io && resolvedSosIds && resolvedSosIds.length > 0) {
        resolvedSosIds.forEach(sosId => {
          rescuerTracker.clearRescuerLocation(sosId);
          req.io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(sosId) });
          req.io.emit('sos:update_status', {
            id: Number(sosId),
            status: 'RESOLVED',
            handler_name: staff.name,
            notes: `Auto-resolved: Resident successfully checked into ${centerObj ? centerObj.name : 'Evacuation Center'}`,
            updated_at: new Date().toISOString()
          });
          req.io.emit('sos:resolve', { id: Number(sosId), status: 'RESOLVED' });
        });
      }
    } catch (sosErr) {
      console.error("Error auto-resolving SOS on check-in:", sosErr);
    }

    // Fetch updated active count for this household
    const [allHouseholdActive] = await db.execute(
      `SELECT COUNT(*) as count FROM check_ins WHERE resident_id = ? AND status IN ('ACTIVE', 'CHECKED_IN')`,
      [resident_id]
    );
    const [allHmRows] = await db.execute(
      `SELECT COUNT(*) as count FROM household_members WHERE resident_id = ?`,
      [resident_id]
    );
    const totalHouseholdMembers = 1 + (allHmRows[0]?.count || 0);
    const updatedEvacuatedCount = allHouseholdActive[0]?.count || 0;

    return res.json({
      success: true,
      message: newlyCheckedInCount > 0
        ? `Successfully checked in ${newlyCheckedInCount} person(s) to ${centerObj ? centerObj.name : 'Center'}.`
        : `Selected household member(s) are already actively checked in.`,
      newly_checked_in_count: newlyCheckedInCount,
      checked_in_names: checkedInNames,
      resident_name: `${resident.first_name} ${resident.last_name}`,
      center_name: centerObj ? centerObj.name : 'Evacuation Center',
      current_occupancy: newOccupancy,
      evacuated_count: updatedEvacuatedCount,
      total_household_count: totalHouseholdMembers,
      evacuation_summary: `${updatedEvacuatedCount} / ${totalHouseholdMembers} members`
    });
  } catch (error) {
    console.error("Confirm Check-in Error:", error);
    res.status(500).json({ success: false, message: "Server Error during check-in processing." });
  }
};

// 7. WALK-IN CHECK-IN (On-the-spot registration + intake)
exports.walkinCheckIn = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);

    if (staff.staff_type === 'RESCUER') {
      return res.status(403).json({ success: false, message: "Access restricted: Rescuers do not perform evacuation center walk-in intake." });
    }

    const parsedCenterId = req.body.center_id ? parseInt(req.body.center_id, 10) : null;
    const targetCenterId = parsedCenterId || req.session.activeCenterId || staff.assigned_center_id;

    // Verify staff is authorized for this center
    if (!targetCenterId || !staff.assignedCenterIds || !staff.assignedCenterIds.includes(targetCenterId)) {
      return res.status(403).json({ success: false, message: "You are not authorized to check residents into this evacuation center." });
    }

    // Enforce strict full-capacity lock for walk-in registration
    const cap = await getCenterCapacityStatus(targetCenterId);
    const walkinMembersArr = Array.isArray(req.body.members) ? req.body.members : [];
    const requestedTotalCount = 1 + walkinMembersArr.length;
    if (cap.isFull) {
      return res.status(403).json({
        success: false,
        center_full: true,
        occupancy: cap.occupancy,
        max_capacity: cap.maxCap,
        message: `🚫 Evacuation Center FULL CAPACITY (${cap.occupancy}/${cap.maxCap}): ${cap.centerName} is no longer accepting new evacuees.`
      });
    }
    if (requestedTotalCount > cap.availableSlots) {
      return res.status(403).json({
        success: false,
        center_full: true,
        occupancy: cap.occupancy,
        max_capacity: cap.maxCap,
        available_slots: cap.availableSlots,
        message: `⚠️ Insufficient capacity at ${cap.centerName}: only ${cap.availableSlots} slot(s) remaining (${cap.occupancy}/${cap.maxCap}). Cannot check in ${requestedTotalCount} evacuees.`
      });
    }

    const {
      first_name,
      middle_name,
      last_name,
      sex = 'Male',
      age,
      birthdate,
      contact_number,
      home_address,
      barangay = 'San Rafael',
      is_4ps,
      is_pregnant,
      is_lactating,
      is_pwd,
      is_single_head,
      has_serious_illness,
      serious_illness_details,
      members = []
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(400).json({ success: false, message: "First name and Last name are required for walk-in check-in." });
    }

    const cleanFirst = first_name.trim();
    const cleanLast = last_name.trim();
    const cleanContact = (contact_number && !contact_number.startsWith('WALKIN-') && contact_number.replace(/\D/g, '').length >= 7)
      ? contact_number.trim()
      : null;

    // Check for existing resident match before creating a new resident account
    let existingResident = null;
    if (cleanContact) {
      const [byContact] = await db.execute(
        'SELECT * FROM residents WHERE contact_number = ? LIMIT 1',
        [cleanContact]
      );
      if (byContact.length > 0) existingResident = byContact[0];
    }

    if (!existingResident) {
      const [byName] = await db.execute(
        'SELECT * FROM residents WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(last_name)) = LOWER(TRIM(?)) LIMIT 1',
        [cleanFirst, cleanLast]
      );
      if (byName.length > 0) existingResident = byName[0];
    }

    let residentId = null;
    let qr_code_uuid = null;
    let newlyCheckedInCount = 0;
    const checkedInNames = [];

    if (existingResident) {
      // Existing resident matched: reuse residentId and avoid duplicate account
      residentId = existingResident.id;
      qr_code_uuid = existingResident.qr_code_uuid;
      console.log(`[Walk-in Intake] Matched existing resident ID ${residentId} (${existingResident.first_name} ${existingResident.last_name}). Checking in without creating duplicate.`);

      // Check in Head if not already checked in
      const [existingHead] = await db.execute(
        `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id IS NULL AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
        [residentId]
      );
      if (existingHead.length === 0) {
        await db.execute(
          `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
           VALUES (?, NULL, ?, ?, 'ACTIVE', 'MANUAL')`,
          [residentId, targetCenterId, staff.userId]
        );
        newlyCheckedInCount++;
        checkedInNames.push(`${existingResident.first_name} ${existingResident.last_name} (Head)`);
      } else if (existingHead[0].center_id !== targetCenterId) {
        const oldCenterId = existingHead[0].center_id;
        await db.execute(
          `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
          [existingHead[0].id]
        );
        await Center.syncOccupancy(oldCenterId);
        await db.execute(
          `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
           VALUES (?, NULL, ?, ?, 'ACTIVE', 'MANUAL')`,
          [residentId, targetCenterId, staff.userId]
        );
        newlyCheckedInCount++;
        checkedInNames.push(`${existingResident.first_name} ${existingResident.last_name} (Head - Transferred)`);
      } else {
        await db.execute(
          `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`,
          [existingHead[0].id]
        );
        newlyCheckedInCount++;
        checkedInNames.push(`${existingResident.first_name} ${existingResident.last_name} (Head)`);
      }

      // Check accompanying members
      const memberArray = Array.isArray(members) ? members : [];
      for (const mem of memberArray) {
        if (mem.first_name && mem.last_name) {
          const [existingMems] = await db.execute(
            `SELECT * FROM household_members WHERE resident_id = ? AND LOWER(TRIM(first_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(last_name)) = LOWER(TRIM(?)) LIMIT 1`,
            [residentId, mem.first_name.trim(), mem.last_name.trim()]
          );
          let memId = null;
          if (existingMems.length > 0) {
            memId = existingMems[0].id;
          } else {
            memId = await HouseholdMember.create({
              resident_id: residentId,
              first_name: mem.first_name.trim(),
              middle_name: mem.middle_name ? mem.middle_name.trim() : null,
              last_name: mem.last_name.trim(),
              relation: mem.relation || 'Family',
              sex: mem.sex || 'Male',
              age: mem.age ? parseInt(mem.age, 10) : 0,
              birthdate: mem.birthdate || null,
              is_pregnant: !!mem.is_pregnant,
              is_lactating: !!mem.is_lactating,
              is_pwd: !!mem.is_pwd,
              has_serious_illness: !!mem.has_serious_illness,
              serious_illness_details: mem.serious_illness_details || null
            });
          }

          const [existingMemCheckIn] = await db.execute(
            `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id = ? AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
            [residentId, memId]
          );
          if (existingMemCheckIn.length === 0) {
            await db.execute(
              `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
               VALUES (?, ?, ?, ?, 'ACTIVE', 'MANUAL')`,
              [residentId, memId, targetCenterId, staff.userId]
            );
            newlyCheckedInCount++;
            checkedInNames.push(`${mem.first_name} ${mem.last_name}`);
          } else if (existingMemCheckIn[0].center_id !== targetCenterId) {
            const oldCenterId = existingMemCheckIn[0].center_id;
            await db.execute(
              `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
              [existingMemCheckIn[0].id]
            );
            await Center.syncOccupancy(oldCenterId);
            await db.execute(
              `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
               VALUES (?, ?, ?, ?, 'ACTIVE', 'MANUAL')`,
              [residentId, memId, targetCenterId, staff.userId]
            );
            newlyCheckedInCount++;
            checkedInNames.push(`${mem.first_name} ${mem.last_name} (Transferred)`);
          } else {
            await db.execute(
              `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, status = 'ACTIVE' WHERE id = ?`,
              [existingMemCheckIn[0].id]
            );
            newlyCheckedInCount++;
            checkedInNames.push(`${mem.first_name} ${mem.last_name}`);
          }
        }
      }
    } else {
      // Create new resident record
      qr_code_uuid = crypto.randomUUID();
      const cleanContactNum = contact_number ? contact_number.trim() : `WALKIN-${Date.now().toString().slice(-6)}`;

      residentId = await Resident.create({
        user_id: null,
        first_name: cleanFirst,
        middle_name: middle_name ? middle_name.trim() : null,
        last_name: cleanLast,
        sex: sex || 'Male',
        birthdate: birthdate || null,
        age: age ? parseInt(age, 10) : null,
        contact_number: cleanContactNum,
        home_address: home_address ? home_address.trim() : 'Walk-in Address',
        barangay: barangay || 'San Rafael',
        vulnerability: is_pwd ? 'PWD' : (has_serious_illness ? 'Illness' : 'None'),
        family_size: 1 + (Array.isArray(members) ? members.length : 0),
        has_special_needs: !!(is_pwd || has_serious_illness || is_pregnant),
        is_4ps: !!is_4ps,
        is_pregnant: !!is_pregnant,
        is_lactating: !!is_lactating,
        is_pwd: !!is_pwd,
        is_single_head: !!is_single_head,
        has_serious_illness: !!has_serious_illness,
        serious_illness_details: serious_illness_details || null,
        qr_code_uuid
      });

      checkedInNames.push(`${first_name} ${last_name} (Head)`);

      // Check in Head
      await db.execute(
        `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
         VALUES (?, NULL, ?, ?, 'ACTIVE', 'MANUAL')`,
        [residentId, targetCenterId, staff.userId]
      );

      // Create and check in accompanying members
      const memberArray = Array.isArray(members) ? members : [];
      for (const mem of memberArray) {
        if (mem.first_name && mem.last_name) {
          const memId = await HouseholdMember.create({
            resident_id: residentId,
            first_name: mem.first_name.trim(),
            middle_name: mem.middle_name ? mem.middle_name.trim() : null,
            last_name: mem.last_name.trim(),
            relation: mem.relation || 'Family',
            sex: mem.sex || 'Male',
            age: mem.age ? parseInt(mem.age, 10) : 0,
            birthdate: mem.birthdate || null,
            status: mem.status || null,
            is_pregnant: !!mem.is_pregnant,
            is_lactating: !!mem.is_lactating,
            is_pwd: !!mem.is_pwd,
            has_serious_illness: !!mem.has_serious_illness,
            serious_illness_details: mem.serious_illness_details || null
          });

          await db.execute(
            `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method) 
             VALUES (?, ?, ?, ?, 'ACTIVE', 'MANUAL')`,
            [residentId, memId, targetCenterId, staff.userId]
          );

          checkedInNames.push(`${mem.first_name} ${mem.last_name}`);
        }
      }
    }

    // Sync Occupancy
    const newOccupancy = await Center.syncOccupancy(targetCenterId);
    let allCenters = [];
    if (req.io) {
      allCenters = await broadcastLiveCenters(req.io, {
        centerId: targetCenterId,
        occupancy: newOccupancy,
        newResident: checkedInNames.join(', ')
      });
    }
    const centerObj = (allCenters || []).find(c => Number(c.id) === Number(targetCenterId)) || await Center.findById(targetCenterId);

    if (req.io) {
      req.io.emit('center_updated', {
        centerId: targetCenterId,
        occupancy: newOccupancy,
        newResident: checkedInNames.join(', '),
        center: centerObj,
        centers: allCenters
      });
      req.io.emit('ec_board_updated', {
        centerId: targetCenterId,
        occupancy: newOccupancy,
        center: centerObj,
        centers: allCenters
      });
      req.io.emit('checkin:new', {
        id: `checkin-${Date.now()}`,
        type: 'checkin',
        category: 'checkin',
        icon: 'ph-house',
        color: 'emerald',
        title: `🏠 Walk-in Intake: ${checkedInNames[0] || 'Evacuee'}`,
        message: `${checkedInNames.join(', ')} checked in to ${centerObj ? centerObj.name : 'Center'} by ${staff.name}`,
        date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        actionUrl: '/admin/reports',
        actionLabel: 'View Masterlist',
        center: centerObj,
        centers: allCenters
      });
    }

    // Auto-resolve any active SOS distress alerts for this resident upon successful walk-in check-in
    try {
      const resolvedSosIds = await SosModel.resolveByResidentId(
        residentId,
        staff.userId,
        `Auto-resolved: Resident registered & checked in at ${centerObj ? centerObj.name : 'Evacuation Center'}`
      );
      if (req.io && resolvedSosIds && resolvedSosIds.length > 0) {
        resolvedSosIds.forEach(sosId => {
          req.io.emit('sos:update_status', {
            id: Number(sosId),
            status: 'RESOLVED',
            handler_name: staff.name,
            notes: `Auto-resolved: Resident registered & checked in at ${centerObj ? centerObj.name : 'Evacuation Center'}`,
            updated_at: new Date().toISOString()
          });
          req.io.emit('sos:resolve', { id: Number(sosId), status: 'RESOLVED' });
        });
      }
    } catch (sosErr) {
      console.error("Error auto-resolving SOS on walkin check-in:", sosErr);
    }

    return res.json({
      success: true,
      message: `Walk-in intake complete: ${checkedInNames.length} person(s) checked in to ${centerObj ? centerObj.name : 'Center'}.`,
      resident_id: residentId,
      qr_code_uuid: qr_code_uuid,
      checked_in_names: checkedInNames,
      total_checked_in: checkedInNames.length
    });
  } catch (error) {
    console.error("Walk-in check-in error:", error);
    res.status(500).json({ success: false, message: "Server Error during walk-in intake: " + error.message });
  }
};

// 7.4. OFFLINE ROSTER & MAP DATA ENDPOINT (Pre-caches data for 100% offline intake & maps)
exports.getOfflineRosterData = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);

    // Fetch all active approved residents
    const [residents] = await db.execute(`
      SELECT 
        id, user_id, first_name, middle_name, last_name, 
        barangay, home_address, contact_number, 
        is_4ps, is_pwd, is_pregnant, is_lactating, is_single_head, 
        has_serious_illness, serious_illness_details,
        qr_code_uuid, family_size, vulnerability, sex, age
      FROM residents
      WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE' AND approval_status = 'APPROVED'
      ORDER BY last_name ASC, first_name ASC
    `);

    // Fetch household members for approved residents
    const [allMembers] = await db.execute(`
      SELECT 
        hm.id, hm.resident_id, hm.first_name, hm.middle_name, hm.last_name, 
        hm.relation, hm.sex, hm.age, hm.is_pwd, hm.is_pregnant, hm.is_lactating, 
        hm.has_serious_illness, hm.serious_illness_details
      FROM household_members hm
      JOIN residents r ON hm.resident_id = r.id
      WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' AND r.approval_status = 'APPROVED'
      ORDER BY hm.resident_id, hm.id ASC
    `);

    // Group members by resident_id
    const membersByResident = {};
    for (const m of allMembers) {
      if (!membersByResident[m.resident_id]) {
        membersByResident[m.resident_id] = [];
      }
      membersByResident[m.resident_id].push({
        id: m.id,
        name: `${m.first_name} ${m.last_name}`.trim(),
        first_name: m.first_name,
        last_name: m.last_name,
        relation: m.relation || 'Member',
        sex: m.sex || 'Male',
        age: m.age || 0,
        is_pwd: !!m.is_pwd,
        is_pregnant: !!m.is_pregnant,
        is_lactating: !!m.is_lactating,
        has_serious_illness: !!m.has_serious_illness,
        evacuation_status: 'NOT_EVACUATED'
      });
    }

    // Build roster items
    const roster = residents.map(r => {
      const mems = membersByResident[r.id] || [];
      return {
        resident: {
          id: r.id,
          name: `${r.first_name} ${r.last_name}`.trim(),
          first_name: r.first_name,
          last_name: r.last_name,
          barangay: r.barangay || 'San Rafael',
          address: r.home_address || '',
          contact_number: r.contact_number || '',
          is_4ps: !!r.is_4ps,
          is_pwd: !!r.is_pwd,
          is_pregnant: !!r.is_pregnant,
          is_lactating: !!r.is_lactating,
          is_single_head: !!r.is_single_head,
          has_serious_illness: !!r.has_serious_illness,
          qr_code_uuid: r.qr_code_uuid,
          uuid: r.qr_code_uuid,
          family_size: r.family_size || (1 + mems.length),
          evacuation_status: 'NOT_EVACUATED'
        },
        members: mems,
        household_name: `${r.last_name} Family`
      };
    });

    // Fetch Evacuation Centers
    const centers = await Center.findAll();

    // Fetch GeoJSON Map Features (routes and hazard zones) via static GIS cache
    const mapFeatures = await gisCache.getDrawnFeatures(true);

    res.json({
      success: true,
      roster: roster,
      centers: centers,
      mapFeatures: mapFeatures,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching offline roster data:", error);
    res.status(500).json({ success: false, message: "Error fetching offline roster data" });
  }
};

// 7.5. OFFLINE OPERATIONS SYNC (Idempotent background sync for offline intake)
exports.syncOfflineOperations = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    if (!staff || !staff.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized. Staff session required for offline sync." });
    }

    const operations = Array.isArray(req.body.operations) ? req.body.operations : [];
    if (operations.length === 0) {
      return res.json({ success: true, results: [], message: "No operations to synchronize." });
    }

    const results = [];

    for (const op of operations) {
      const { clientOperationId, operation, payload } = op;

      if (!clientOperationId) {
        results.push({ clientOperationId: null, success: false, message: "Missing clientOperationId." });
        continue;
      }

      // Idempotency check: Has this operation already been processed?
      const [existingSyncLog] = await db.execute(
        'SELECT * FROM offline_sync_log WHERE client_operation_id = ?',
        [clientOperationId]
      );

      if (existingSyncLog.length > 0) {
        console.log(`[Offline Sync] Operation ${clientOperationId} was already processed. Returning cached success.`);
        results.push({
          clientOperationId,
          operation,
          status: 'ALREADY_SYNCED',
          success: true,
          message: "Operation was already synchronized previously."
        });
        continue;
      }

      try {
        if (operation === 'CHECK_IN') {
          const { resident_id, center_id, check_in_head, member_ids, check_in_method = 'MANUAL' } = payload || {};
          let targetCenterId = (center_id || payload?.centerId || op.centerId) ? parseInt(center_id || payload?.centerId || op.centerId, 10) : (staff.assigned_center_id || (staff.assignedCenterIds && staff.assignedCenterIds[0]) || 1);
          const cleanMethod = (check_in_method && String(check_in_method).toUpperCase().includes('QR')) ? 'QR' : 'MANUAL';

          // Validate that centerId belongs to the staff's assigned site(s)
          if (staff.assignedCenterIds && staff.assignedCenterIds.length > 0 && !staff.assignedCenterIds.includes(targetCenterId)) {
            console.warn(`[Offline Sync] Center ${targetCenterId} not in staff assigned centers ${staff.assignedCenterIds}. Falling back to primary assigned center ${staff.assignedCenterIds[0]}.`);
            targetCenterId = staff.assignedCenterIds[0];
          }

          const [residentRows] = await db.execute('SELECT * FROM residents WHERE id = ?', [resident_id]);
          if (residentRows.length === 0) {
            results.push({ clientOperationId, operation, success: false, message: "Resident record not found." });
            continue;
          }
          const resident = residentRows[0];
          let newlyCheckedInCount = 0;
          const checkedInNames = [];

          // 1. Check in Head of Household
          const shouldCheckInHead = (check_in_head === true || check_in_head === 'true' || check_in_head === 1 || check_in_head === '1');
          if (shouldCheckInHead) {
            const [existingHead] = await db.execute(
              `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id IS NULL AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
              [resident_id]
            );
            if (existingHead.length === 0) {
              await db.execute(
                `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                 VALUES (?, NULL, ?, ?, 'ACTIVE', ?, ?)`,
                [resident_id, targetCenterId, staff.userId, cleanMethod, clientOperationId]
              );
              newlyCheckedInCount++;
              checkedInNames.push(`${resident.first_name} ${resident.last_name} (Head)`);
            } else if (existingHead[0].center_id !== targetCenterId) {
              // Relocated / Transferred from another center
              const oldCenterId = existingHead[0].center_id;
              await db.execute(
                `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
                [existingHead[0].id]
              );
              await Center.syncOccupancy(oldCenterId);
              await db.execute(
                `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                 VALUES (?, NULL, ?, ?, 'ACTIVE', ?, ?)`,
                [resident_id, targetCenterId, staff.userId, cleanMethod, clientOperationId]
              );
              newlyCheckedInCount++;
              checkedInNames.push(`${resident.first_name} ${resident.last_name} (Head - Transferred)`);
            } else {
              // Already active at this center; refresh check-in timestamp and client_operation_id
              await db.execute(
                `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, client_operation_id = COALESCE(client_operation_id, ?), status = 'ACTIVE' WHERE id = ?`,
                [clientOperationId, existingHead[0].id]
              );
              newlyCheckedInCount++;
              checkedInNames.push(`${resident.first_name} ${resident.last_name} (Head)`);
            }
          }

          // 2. Check in selected family members
          const memberArray = Array.isArray(member_ids) ? member_ids : (member_ids ? [member_ids] : []);
          if (memberArray.length > 0) {
            const allMembers = await HouseholdMember.findByResidentId(resident_id);
            for (const mId of memberArray) {
              const parsedMemberId = parseInt(mId, 10);
              if (!isNaN(parsedMemberId)) {
                const memberObj = allMembers.find(m => m.id === parsedMemberId);
                if (memberObj) {
                  const [existingMemberCheckIn] = await db.execute(
                    `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id = ? AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
                    [resident_id, parsedMemberId]
                  );
                  if (existingMemberCheckIn.length === 0) {
                    await db.execute(
                      `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
                      [resident_id, parsedMemberId, targetCenterId, staff.userId, cleanMethod, clientOperationId]
                    );
                    newlyCheckedInCount++;
                    checkedInNames.push(`${memberObj.first_name} ${memberObj.last_name}`);
                  } else if (existingMemberCheckIn[0].center_id !== targetCenterId) {
                    const oldCenterId = existingMemberCheckIn[0].center_id;
                    await db.execute(
                      `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
                      [existingMemberCheckIn[0].id]
                    );
                    await Center.syncOccupancy(oldCenterId);
                    await db.execute(
                      `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
                      [resident_id, parsedMemberId, targetCenterId, staff.userId, cleanMethod, clientOperationId]
                    );
                    newlyCheckedInCount++;
                    checkedInNames.push(`${memberObj.first_name} ${memberObj.last_name} (Transferred)`);
                  } else {
                    await db.execute(
                      `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, client_operation_id = COALESCE(client_operation_id, ?), status = 'ACTIVE' WHERE id = ?`,
                      [clientOperationId, existingMemberCheckIn[0].id]
                    );
                    newlyCheckedInCount++;
                    checkedInNames.push(`${memberObj.first_name} ${memberObj.last_name}`);
                  }
                }
              }
            }
          }

          // Sync Occupancy
          const newOccupancy = await Center.syncOccupancy(targetCenterId);
          const centerObj = await Center.findById(targetCenterId);

          // Socket Updates
          if (req.io) {
            req.io.emit('center_updated', {
              centerId: targetCenterId,
              occupancy: newOccupancy,
              newResident: checkedInNames.join(', ')
            });
            req.io.emit('ec_board_updated', {
              centerId: targetCenterId,
              occupancy: newOccupancy
            });
            req.io.emit('checkin:new', {
              id: `checkin-${Date.now()}`,
              type: 'checkin',
              category: 'checkin',
              icon: 'ph-house',
              color: 'emerald',
              title: `🏠 Offline Check-In Synced: ${resident.first_name} ${resident.last_name}`,
              message: `${checkedInNames.length > 0 ? checkedInNames.join(', ') : resident.first_name + ' ' + resident.last_name} synced to ${centerObj ? centerObj.name : 'Center'}`,
              date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: Date.now(),
              actionUrl: '/admin/reports',
              actionLabel: 'View Masterlist'
            });
            broadcastLiveCenters(req.io);
          }

          // Auto-resolve any active SOS distress alerts for this resident upon successful offline check-in sync
          try {
            const resolvedSosIds = await SosModel.resolveByResidentId(
              resident_id,
              staff.userId,
              `Auto-resolved: Resident synced to ${centerObj ? centerObj.name : 'Evacuation Center'}`
            );
            if (req.io && resolvedSosIds && resolvedSosIds.length > 0) {
              resolvedSosIds.forEach(sosId => {
                rescuerTracker.clearRescuerLocation(sosId);
                req.io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(sosId) });
                req.io.emit('sos:update_status', {
                  id: Number(sosId),
                  status: 'RESOLVED',
                  handler_name: staff.name,
                  notes: `Auto-resolved upon offline check-in sync at ${centerObj ? centerObj.name : 'Evacuation Center'}`,
                  updated_at: new Date().toISOString()
                });
                req.io.emit('sos:resolve', { id: Number(sosId), status: 'RESOLVED' });
              });
            }
          } catch (sosErr) {
            console.error("Error auto-resolving SOS in offline sync check-in:", sosErr);
          }

          // Record in idempotency log
          const responseData = {
            newly_checked_in_count: newlyCheckedInCount,
            checked_in_names: checkedInNames,
            center_name: centerObj ? centerObj.name : 'Center'
          };
          await db.execute(
            `INSERT INTO offline_sync_log (client_operation_id, operation_type, staff_user_id, entity_id, response_data) 
             VALUES (?, 'CHECK_IN', ?, ?, ?)`,
            [clientOperationId, staff.userId, resident_id, JSON.stringify(responseData)]
          );

          results.push({
            clientOperationId,
            operation,
            status: 'SYNCED',
            success: true,
            newly_checked_in_count: newlyCheckedInCount,
            checked_in_names: checkedInNames
          });

        } else if (operation === 'WALK_IN') {
          const {
            first_name, middle_name, last_name, sex = 'Male', age, birthdate,
            contact_number, home_address, barangay = 'San Rafael',
            is_4ps, is_pregnant, is_lactating, is_pwd, is_single_head,
            has_serious_illness, serious_illness_details, center_id, members = []
          } = payload || {};

          if (!first_name || !last_name) {
            results.push({ clientOperationId, operation, success: false, message: "Missing first_name or last_name." });
            continue;
          }

          let targetCenterId = (center_id || payload?.centerId || op.centerId) ? parseInt(center_id || payload?.centerId || op.centerId, 10) : (staff.assigned_center_id || (staff.assignedCenterIds && staff.assignedCenterIds[0]) || 1);

          // Validate that centerId belongs to the staff's assigned site(s)
          if (staff.assignedCenterIds && staff.assignedCenterIds.length > 0 && !staff.assignedCenterIds.includes(targetCenterId)) {
            console.warn(`[Offline Sync] Center ${targetCenterId} not in staff assigned centers ${staff.assignedCenterIds}. Falling back to primary assigned center ${staff.assignedCenterIds[0]}.`);
            targetCenterId = staff.assignedCenterIds[0];
          }

          const cleanFirst = first_name.trim();
          const cleanLast = last_name.trim();
          const cleanContact = (contact_number && !contact_number.startsWith('WALKIN-') && contact_number.replace(/\D/g, '').length >= 7)
            ? contact_number.trim()
            : null;

          // DUPLICATE PROTECTION: Search for existing resident match before creating a new resident account
          let existingResident = null;
          if (cleanContact) {
            const [byContact] = await db.execute(
              'SELECT * FROM residents WHERE contact_number = ? LIMIT 1',
              [cleanContact]
            );
            if (byContact.length > 0) existingResident = byContact[0];
          }

          if (!existingResident) {
            const [byName] = await db.execute(
              'SELECT * FROM residents WHERE LOWER(TRIM(first_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(last_name)) = LOWER(TRIM(?)) LIMIT 1',
              [cleanFirst, cleanLast]
            );
            if (byName.length > 0) existingResident = byName[0];
          }

          let residentId = null;
          const checkedInNames = [];

          if (existingResident) {
            // Existing resident match: reuse residentId, do not duplicate resident account
            residentId = existingResident.id;
            console.log(`[Offline Sync] Duplicate protection: Reusing existing resident ID ${residentId} (${existingResident.first_name} ${existingResident.last_name})`);

            // Check in Head if not already actively checked in
            const [existingHead] = await db.execute(
              `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id IS NULL AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
              [residentId]
            );
            if (existingHead.length === 0) {
              await db.execute(
                `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                 VALUES (?, NULL, ?, ?, 'ACTIVE', 'MANUAL', ?)`,
                [residentId, targetCenterId, staff.userId, clientOperationId]
              );
              checkedInNames.push(`${existingResident.first_name} ${existingResident.last_name} (Head)`);
            } else if (existingHead[0].center_id !== targetCenterId) {
              const oldCenterId = existingHead[0].center_id;
              await db.execute(
                `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
                [existingHead[0].id]
              );
              await Center.syncOccupancy(oldCenterId);
              await db.execute(
                `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                 VALUES (?, NULL, ?, ?, 'ACTIVE', 'MANUAL', ?)`,
                [residentId, targetCenterId, staff.userId, clientOperationId]
              );
              checkedInNames.push(`${existingResident.first_name} ${existingResident.last_name} (Head - Transferred)`);
            } else {
              await db.execute(
                `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, client_operation_id = COALESCE(client_operation_id, ?), status = 'ACTIVE' WHERE id = ?`,
                [clientOperationId, existingHead[0].id]
              );
              checkedInNames.push(`${existingResident.first_name} ${existingResident.last_name} (Head)`);
            }

            // Check accompanying members
            const memberArray = Array.isArray(members) ? members : [];
            for (const mem of memberArray) {
              if (mem.first_name && mem.last_name) {
                const [existingMems] = await db.execute(
                  `SELECT * FROM household_members WHERE resident_id = ? AND LOWER(TRIM(first_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(last_name)) = LOWER(TRIM(?)) LIMIT 1`,
                  [residentId, mem.first_name.trim(), mem.last_name.trim()]
                );
                let memId = null;
                if (existingMems.length > 0) {
                  memId = existingMems[0].id;
                } else {
                  memId = await HouseholdMember.create({
                    resident_id: residentId,
                    first_name: mem.first_name.trim(),
                    middle_name: mem.middle_name ? mem.middle_name.trim() : null,
                    last_name: mem.last_name.trim(),
                    relation: mem.relation || 'Family',
                    sex: mem.sex || 'Male',
                    age: mem.age ? parseInt(mem.age, 10) : 0,
                    birthdate: mem.birthdate || null,
                    is_pregnant: !!mem.is_pregnant,
                    is_lactating: !!mem.is_lactating,
                    is_pwd: !!mem.is_pwd,
                    has_serious_illness: !!mem.has_serious_illness,
                    serious_illness_details: mem.serious_illness_details || null
                  });
                }

                const [existingMemCheckIn] = await db.execute(
                  `SELECT id, center_id FROM check_ins WHERE resident_id = ? AND household_member_id = ? AND status IN ('ACTIVE', 'CHECKED_IN') ORDER BY check_in_time DESC`,
                  [residentId, memId]
                );
                if (existingMemCheckIn.length === 0) {
                  await db.execute(
                    `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                     VALUES (?, ?, ?, ?, 'ACTIVE', 'MANUAL', ?)`,
                    [residentId, memId, targetCenterId, staff.userId, clientOperationId]
                  );
                  checkedInNames.push(`${mem.first_name} ${mem.last_name}`);
                } else if (existingMemCheckIn[0].center_id !== targetCenterId) {
                  const oldCenterId = existingMemCheckIn[0].center_id;
                  await db.execute(
                    `UPDATE check_ins SET status = 'CHECKED_OUT', check_out_time = NOW() WHERE id = ?`,
                    [existingMemCheckIn[0].id]
                  );
                  await Center.syncOccupancy(oldCenterId);
                  await db.execute(
                    `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                     VALUES (?, ?, ?, ?, 'ACTIVE', 'MANUAL', ?)`,
                    [residentId, memId, targetCenterId, staff.userId, clientOperationId]
                  );
                  checkedInNames.push(`${mem.first_name} ${mem.last_name} (Transferred)`);
                } else {
                  await db.execute(
                    `UPDATE check_ins SET check_in_time = CURRENT_TIMESTAMP, client_operation_id = COALESCE(client_operation_id, ?), status = 'ACTIVE' WHERE id = ?`,
                    [clientOperationId, existingMemCheckIn[0].id]
                  );
                  checkedInNames.push(`${mem.first_name} ${mem.last_name}`);
                }
              }
            }
          } else {
            // Truly new resident: create resident record and check in
            const qr_code_uuid = crypto.randomUUID();
            const cleanContactNum = contact_number ? contact_number.trim() : `WALKIN-${Date.now().toString().slice(-6)}`;

            residentId = await Resident.create({
              user_id: null,
              first_name: cleanFirst,
              middle_name: middle_name ? middle_name.trim() : null,
              last_name: cleanLast,
              sex: sex || 'Male',
              birthdate: birthdate || null,
              age: age ? parseInt(age, 10) : null,
              contact_number: cleanContactNum,
              home_address: home_address ? home_address.trim() : 'Walk-in Address',
              barangay: barangay || 'San Rafael',
              vulnerability: is_pwd ? 'PWD' : (has_serious_illness ? 'Illness' : 'None'),
              family_size: 1 + (Array.isArray(members) ? members.length : 0),
              has_special_needs: !!(is_pwd || has_serious_illness || is_pregnant),
              is_4ps: !!is_4ps,
              is_pregnant: !!is_pregnant,
              is_lactating: !!is_lactating,
              is_pwd: !!is_pwd,
              is_single_head: !!is_single_head,
              has_serious_illness: !!has_serious_illness,
              serious_illness_details: serious_illness_details || null,
              qr_code_uuid
            });

            checkedInNames.push(`${first_name} ${last_name} (Head)`);

            // Check in Head with client_operation_id
            await db.execute(
              `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
               VALUES (?, NULL, ?, ?, 'ACTIVE', 'MANUAL', ?)`,
              [residentId, targetCenterId, staff.userId, clientOperationId]
            );

            // Create & check in accompanying members
            const memberArray = Array.isArray(members) ? members : [];
            for (const mem of memberArray) {
              if (mem.first_name && mem.last_name) {
                const memId = await HouseholdMember.create({
                  resident_id: residentId,
                  first_name: mem.first_name.trim(),
                  middle_name: mem.middle_name ? mem.middle_name.trim() : null,
                  last_name: mem.last_name.trim(),
                  relation: mem.relation || 'Family',
                  sex: mem.sex || 'Male',
                  age: mem.age ? parseInt(mem.age, 10) : 0,
                  birthdate: mem.birthdate || null,
                  status: mem.status || null,
                  is_pregnant: !!mem.is_pregnant,
                  is_lactating: !!mem.is_lactating,
                  is_pwd: !!mem.is_pwd,
                  has_serious_illness: !!mem.has_serious_illness,
                  serious_illness_details: mem.serious_illness_details || null
                });

                await db.execute(
                  `INSERT INTO check_ins (resident_id, household_member_id, center_id, staff_user_id, status, check_in_method, client_operation_id) 
                   VALUES (?, ?, ?, ?, 'ACTIVE', 'MANUAL', ?)`,
                  [residentId, memId, targetCenterId, staff.userId, clientOperationId]
                );

                checkedInNames.push(`${mem.first_name} ${mem.last_name}`);
              }
            }
          }

          // Sync Occupancy
          const newOccupancy = await Center.syncOccupancy(targetCenterId);
          const centerObj = await Center.findById(targetCenterId);

          if (req.io) {
            req.io.emit('center_updated', {
              centerId: targetCenterId,
              occupancy: newOccupancy,
              newResident: checkedInNames.join(', ')
            });
            req.io.emit('ec_board_updated', {
              centerId: targetCenterId,
              occupancy: newOccupancy
            });
            req.io.emit('checkin:new', {
              id: `checkin-${Date.now()}`,
              type: 'checkin',
              category: 'checkin',
              icon: 'ph-house',
              color: 'emerald',
              title: `🏠 Offline Walk-in Synced: ${checkedInNames[0] || 'Evacuee'}`,
              message: `${checkedInNames.join(', ')} synced to ${centerObj ? centerObj.name : 'Center'} by ${staff.name}`,
              date: new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: Date.now(),
              actionUrl: '/admin/reports',
              actionLabel: 'View Masterlist'
            });
            broadcastLiveCenters(req.io);
          }

          // Auto-resolve any active SOS distress alerts for this resident upon successful offline walk-in sync
          try {
            const resolvedSosIds = await SosModel.resolveByResidentId(
              residentId,
              staff.userId,
              `Auto-resolved: Resident registered & synced to ${centerObj ? centerObj.name : 'Evacuation Center'}`
            );
            if (req.io && resolvedSosIds && resolvedSosIds.length > 0) {
              resolvedSosIds.forEach(sosId => {
                req.io.emit('sos:update_status', {
                  id: Number(sosId),
                  status: 'RESOLVED',
                  handler_name: staff.name,
                  notes: `Auto-resolved upon offline walk-in sync at ${centerObj ? centerObj.name : 'Evacuation Center'}`,
                  updated_at: new Date().toISOString()
                });
                req.io.emit('sos:resolve', { id: Number(sosId), status: 'RESOLVED' });
              });
            }
          } catch (sosErr) {
            console.error("Error auto-resolving SOS in offline sync walk-in:", sosErr);
          }

          const newlyCheckedInCount = checkedInNames.length;
          // Record in idempotency log
          const responseData = {
            resident_id: residentId,
            newly_checked_in_count: newlyCheckedInCount,
            checked_in_names: checkedInNames,
            center_name: centerObj ? centerObj.name : 'Center'
          };
          await db.execute(
            `INSERT INTO offline_sync_log (client_operation_id, operation_type, staff_user_id, entity_id, response_data) 
             VALUES (?, 'WALK_IN', ?, ?, ?)`,
            [clientOperationId, staff.userId, residentId, JSON.stringify(responseData)]
          );

          results.push({
            clientOperationId,
            operation,
            status: 'SYNCED',
            success: true,
            resident_id: residentId,
            newly_checked_in_count: newlyCheckedInCount,
            checked_in_names: checkedInNames
          });
        } else {
          results.push({ clientOperationId, operation, success: false, message: `Unsupported operation: ${operation}` });
        }
      } catch (opErr) {
        console.error(`[Offline Sync] Error processing operation ${clientOperationId}:`, opErr);
        results.push({ clientOperationId, operation, success: false, message: opErr.message });
      }
    }

    return res.json({
      success: true,
      message: `Processed ${results.length} offline operation(s).`,
      results
    });
  } catch (error) {
    console.error("Offline sync error:", error);
    return res.status(500).json({ success: false, message: "Server Error during offline sync: " + error.message });
  }
};

// 7.6. REAL-TIME SITE INTAKE FEED (Returns JSON of recent check-ins for the active center)
exports.getRecentIntakeFeed = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    if (!staff || !staff.userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const queryCenterId = req.query.center_id ? parseInt(req.query.center_id, 10) : null;
    const activeCenterId = queryCenterId || req.session.activeCenterId || staff.assigned_center_id || (staff.assignedCenterIds && staff.assignedCenterIds[0]);

    if (!activeCenterId) {
      return res.json({ success: true, count: 0, recentScanned: [] });
    }

    const [recentRows] = await db.execute(`
      SELECT 
        c.id as check_in_id,
        c.check_in_time,
        c.check_in_method,
        r.id as resident_id,
        r.first_name,
        r.last_name,
        r.barangay,
        r.home_address,
        r.is_4ps, r.is_pwd, r.is_pregnant, r.is_lactating, r.has_serious_illness,
        ec.name as center_name,
        (SELECT COUNT(*) FROM check_ins c2 WHERE c2.resident_id = r.id AND c2.center_id = ? AND c2.status IN ('ACTIVE', 'CHECKED_IN')) as checked_in_count
      FROM check_ins c
      JOIN residents r ON c.resident_id = r.id
      JOIN evacuation_centers ec ON c.center_id = ec.id
      WHERE c.center_id = ? AND c.household_member_id IS NULL AND c.status IN ('ACTIVE', 'CHECKED_IN')
      ORDER BY c.check_in_time DESC
      LIMIT 50
    `, [activeCenterId, activeCenterId]);

    const formattedScanned = recentRows.map(row => ({
      check_in_id: row.check_in_id,
      resident_id: row.resident_id,
      name: `${row.first_name} ${row.last_name}`,
      barangay: row.barangay || 'San Rafael',
      address: row.home_address || '',
      center_name: row.center_name,
      checked_in_count: row.checked_in_count || 1,
      is_4ps: !!row.is_4ps,
      is_pwd: !!row.is_pwd,
      is_pregnant: !!row.is_pregnant,
      is_lactating: !!row.is_lactating,
      has_serious_illness: !!row.has_serious_illness,
      timeFormatted: new Date(row.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }));

    return res.json({
      success: true,
      count: formattedScanned.length,
      recentScanned: formattedScanned
    });
  } catch (error) {
    console.error("Error fetching recent intake feed:", error);
    return res.status(500).json({ success: false, message: "Error fetching intake feed: " + error.message });
  }
};

// 8. EVACUEE MASTERLIST & REPORTS
exports.getEvacuees = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    const isRescuer = staff.staff_type === 'RESCUER';

    // Rescuers focus entirely on SOS emergency distress signals, status, and rescue telemetry reports
    if (isRescuer) {
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
            NULLIF(TRIM(CONCAT_WS(' ', hr.first_name, hr.last_name)), ''),
            u.email
          ) as handler_name,
          st.contact_number as handler_contact
        FROM sos_alerts s
        LEFT JOIN residents r ON s.resident_id = r.id
        LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
        LEFT JOIN users u ON s.handled_by = u.id
        LEFT JOIN staff st ON u.id = st.user_id
        LEFT JOIN residents hr ON u.id = hr.user_id
        ORDER BY s.created_at DESC
        LIMIT 250
      `);

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

      let totalResponseTimeMs = 0;
      let responseCount = 0;
      const todayStr = new Date().toISOString().slice(0, 10);

      sosRows.forEach(row => {
        const st = (row.status || 'ACTIVE').toUpperCase();
        if (st === 'ACTIVE') sosStats.active++;
        else if (st === 'ACKNOWLEDGED') sosStats.acknowledged++;
        else if (st === 'RESPONDING') sosStats.responding++;
        else if (st === 'RESCUED') sosStats.rescued++;
        else if (st === 'RESOLVED') sosStats.resolved++;
        else if (st === 'CANCELLED') sosStats.cancelled++;

        const rowDate = row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '';
        if (rowDate === todayStr) sosStats.todayCount++;

        if (row.age >= 60 || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('senior'))) sosStats.seniors++;
        if (row.is_pwd || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('pwd'))) sosStats.pwd++;
        if (row.is_pregnant || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('pregnant'))) sosStats.pregnant++;
        if (row.has_serious_illness || (row.vulnerability && String(row.vulnerability).toLowerCase().includes('illness'))) sosStats.medical++;

        const area = row.home_address || row.barangay || 'San Rafael General';
        sosStats.purokCounts[area] = (sosStats.purokCounts[area] || 0) + 1;

        if ((st === 'RESCUED' || st === 'RESOLVED') && row.created_at && row.updated_at) {
          const diffMs = new Date(row.updated_at).getTime() - new Date(row.created_at).getTime();
          if (diffMs > 0 && diffMs < 86400000) {
            totalResponseTimeMs += diffMs;
            responseCount++;
          }
        }
      });

      if (responseCount > 0) {
        sosStats.avgResponseMinutes = Math.round((totalResponseTimeMs / responseCount) / 60000);
      }

      return res.render("staff/reports", {
        ...sharedSimData(),
        user: {
          id: staff.userId,
          name: staff.name,
          role: staff.role,
          staff_type: staff.staff_type
        },
        page: { title: "SOS Incident Reports" },
        staff: staff,
        isRescuer: true,
        sosReports: sosRows,
        sosStats: sosStats,
        ecStats: null,
        activeEvacuees: [],
        departedEvacuees: [],
        allCenters: [],
        selectedCenterId: null
      });
    }

    const rawRequested = req.query.center_id;
    const requestedCenterId = rawRequested ? parseInt(rawRequested, 10) : null;
    let centerId = null;

    if (requestedCenterId) {
      const isAuthorized = staff.assignedCenterIds && staff.assignedCenterIds.includes(requestedCenterId);
      if (!isAuthorized) {
        return res.status(403).send("Access denied. You are not assigned to this evacuation center.");
      }
      centerId = requestedCenterId;
      req.session.activeCenterId = centerId;
    } else {
      if (req.session.activeCenterId && staff.assignedCenterIds.includes(req.session.activeCenterId)) {
        centerId = req.session.activeCenterId;
      } else if (staff.assignedCenterIds && staff.assignedCenterIds.length > 0) {
        centerId = staff.assignedCenterIds[0];
        req.session.activeCenterId = centerId;
      }
    }

    staff.assigned_center_id = centerId;
    if (centerId) {
      staff.center = (staff.assigned_centers || []).find(c => c.id === centerId) || await Center.findById(centerId);
    }

    const [evacueeRows] = await db.execute(`
      SELECT 
        c.id as check_in_id,
        c.resident_id,
        c.household_member_id,
        c.check_in_time,
        c.check_out_time,
        c.status,
        c.check_in_method,
        r.first_name as res_first_name,
        r.last_name as res_last_name,
        r.contact_number,
        r.home_address,
        r.barangay,
        r.sex as res_sex,
        r.age as res_age,
        r.is_4ps,
        r.is_pregnant as res_pregnant,
        r.is_pwd as res_pwd,
        r.has_serious_illness as res_illness,
        r.vulnerability,
        hm.first_name as mem_first_name,
        hm.last_name as mem_last_name,
        hm.relation,
        hm.sex as mem_sex,
        hm.age as mem_age,
        hm.status as mem_status,
        hm.is_pregnant as mem_pregnant,
        hm.is_pwd as mem_pwd,
        hm.has_serious_illness as mem_illness,
        ec.name as center_name,
        u.email as staff_email
      FROM check_ins c
      JOIN residents r ON c.resident_id = r.id
      LEFT JOIN household_members hm ON c.household_member_id = hm.id
      LEFT JOIN evacuation_centers ec ON c.center_id = ec.id
      LEFT JOIN users u ON c.staff_user_id = u.id
      WHERE c.center_id = ?
      ORDER BY c.status = 'ACTIVE' DESC, c.check_in_time DESC
    `, [centerId]);

    const activeList = [];
    const departedList = [];

    evacueeRows.forEach(row => {
      const isHead = row.household_member_id === null;
      const personName = isHead ? `${row.res_first_name} ${row.res_last_name}` : `${row.mem_first_name} ${row.mem_last_name}`;
      const sex = isHead ? (row.res_sex || 'Male') : (row.mem_sex || 'Male');
      const age = isHead ? row.res_age : row.mem_age;
      const isPregnant = isHead ? row.res_pregnant : row.mem_pregnant;
      const isPwd = isHead ? (row.res_pwd || (row.vulnerability && row.vulnerability.includes('PWD'))) : row.mem_pwd;
      const isIll = isHead ? (row.res_illness || (row.vulnerability && row.vulnerability.includes('illness'))) : row.mem_illness;

      const item = {
        check_in_id: row.check_in_id,
        resident_id: row.resident_id,
        household_member_id: row.household_member_id,
        name: personName,
        head_name: `${row.res_first_name} ${row.res_last_name}`,
        is_head: isHead,
        relation: isHead ? 'Head' : (row.relation || 'Family'),
        sex: sex,
        age: age || 'N/A',
        purok: row.home_address || row.barangay || 'San Rafael',
        barangay: row.barangay || 'San Rafael',
        contact: row.contact_number,
        is_4ps: !!row.is_4ps,
        is_pregnant: !!isPregnant,
        is_pwd: !!isPwd,
        has_serious_illness: !!isIll,
        method: row.check_in_method || 'QR',
        check_in_time: new Date(row.check_in_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        check_out_time: row.check_out_time ? new Date(row.check_out_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'N/A',
        status: (row.status === 'ACTIVE' || row.status === 'CHECKED_IN') ? 'ACTIVE' : 'CHECKED_OUT',
        staff: row.staff_email ? row.staff_email.split('@')[0] : 'Staff'
      };

      if (item.status === 'ACTIVE') activeList.push(item);
      else departedList.push(item);
    });

    const allCenters = await Center.findAll();
    const ecStats = await Center.getEcBoardStats(centerId);

    res.render("staff/reports", {
      ...sharedSimData(),
      user: {
        id: staff.userId,
        name: staff.name,
        role: staff.role,
        staff_type: staff.staff_type
      },
      page: { title: "Reports & EC Board" },
      staff: staff,
      ecStats: ecStats,
      activeEvacuees: activeList,
      departedEvacuees: departedList,
      allCenters: allCenters,
      selectedCenterId: centerId
    });
  } catch (error) {
    console.error("Error loading evacuees masterlist:", error);
    try {
      const fallbackStaff = req.session.userId ? await getStaffContext(req.session.userId).catch(() => null) : null;
      return res.render("staff/reports", {
        ...sharedSimData(),
        user: fallbackStaff ? { id: fallbackStaff.userId, name: fallbackStaff.name, role: fallbackStaff.role, staff_type: fallbackStaff.staff_type } : (req.session.user || {}),
        page: { title: "Reports & EC Board" },
        staff: fallbackStaff || {},
        ecStats: null,
        activeEvacuees: [],
        departedEvacuees: [],
        allCenters: [],
        selectedCenterId: null
      });
    } catch (renderErr) {
      return res.status(500).send("Database temporarily unavailable. Please refresh the page in a moment.");
    }
  }
};

exports.getReports = exports.getEvacuees;

// 9. CHECK-OUT HANDLER
exports.checkOut = async (req, res) => {
  try {
    const { check_in_id, resident_id, checkout_all_family } = req.body;
    const staff = await getStaffContext(req.session.userId);

    let centerId = staff.assigned_center_id || 1;
    let checkedOutCount = 0;

    if (checkout_all_family && resident_id) {
      // Check out all active family members for this household
      const [rows] = await db.execute(
        `SELECT center_id FROM check_ins WHERE resident_id = ? AND status IN ('ACTIVE', 'CHECKED_IN')`,
        [resident_id]
      );
      if (rows.length > 0) centerId = rows[0].center_id;

      const [result] = await db.execute(`
        UPDATE check_ins 
        SET status = 'CHECKED_OUT', check_out_time = CURRENT_TIMESTAMP 
        WHERE resident_id = ? AND status IN ('ACTIVE', 'CHECKED_IN')
      `, [resident_id]);
      checkedOutCount = result.affectedRows;
    } else if (check_in_id) {
      // Check out individual check_in
      const [rows] = await db.execute(
        `SELECT center_id FROM check_ins WHERE id = ?`,
        [check_in_id]
      );
      if (rows.length > 0) centerId = rows[0].center_id;

      const [result] = await db.execute(`
        UPDATE check_ins 
        SET status = 'CHECKED_OUT', check_out_time = CURRENT_TIMESTAMP 
        WHERE id = ? AND status IN ('ACTIVE', 'CHECKED_IN')
      `, [check_in_id]);
      checkedOutCount = result.affectedRows;
    }

    // Sync Occupancy
    const newOccupancy = await Center.syncOccupancy(centerId);
    let allCenters = [];
    if (req.io) {
      allCenters = await broadcastLiveCenters(req.io, {
        centerId: centerId,
        occupancy: newOccupancy,
        departedCount: checkedOutCount
      });
      const centerObj = (allCenters || []).find(c => Number(c.id) === Number(centerId)) || await Center.findById(centerId);
      req.io.emit('center_updated', {
        centerId: centerId,
        occupancy: newOccupancy,
        departedCount: checkedOutCount,
        center: centerObj,
        centers: allCenters
      });
      req.io.emit('ec_board_updated', {
        centerId: centerId,
        occupancy: newOccupancy,
        center: centerObj,
        centers: allCenters
      });
    }

    return res.json({
      success: true,
      message: `Successfully checked out ${checkedOutCount} evacuee(s).`,
      checked_out_count: checkedOutCount,
      current_occupancy: newOccupancy
    });
  } catch (error) {
    console.error("Check-out error:", error);
    res.status(500).json({ success: false, message: "Server Error during check-out: " + error.message });
  }
};

// 10. RESCUER SOS MAP & STATUS MANAGEMENT
exports.getStaffMap = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    const isRescuer = staff.staff_type === 'RESCUER' || staff.staff_type === 'BOTH';

    const [activeSosAlerts, recentSosAlerts, centers, mapFeatures] = await Promise.all([
      SosModel.getActiveAlerts().catch(() => []),
      isRescuer ? SosModel.getAllRecentAlerts(20).catch(() => []) : Promise.resolve([]),
      Center.findAll(),
      gisCache.getDrawnFeatures(false)
    ]);

    res.render("staff/map", {
      ...sharedSimData(),
      user: {
        id: staff.userId,
        name: staff.name,
        role: staff.role,
        staff_type: staff.staff_type
      },
      page: { title: isRescuer ? "Rescuer SOS Map" : "Evacuation Map" },
      staff: staff,
      isRescuer: isRescuer,
      activeSosAlerts: activeSosAlerts,
      recentSosAlerts: recentSosAlerts,
      centers: centers,
      mapFeatures: mapFeatures
    });
  } catch (error) {
    console.error("Error loading staff map:", error);
    res.status(500).send("Server Error loading Staff Map.");
  }
};

exports.getRescueMap = exports.getStaffMap;

// 11. UPDATE SOS STATUS (ACTIVE -> ACKNOWLEDGED -> RESPONDING -> RESCUED -> RESOLVED)
exports.updateSosStatus = async (req, res) => {
  try {
    const { id, status, notes, rescuer_lat, rescuer_lng } = req.body;
    const staff = await getStaffContext(req.session.userId);

    if (!id || !status) {
      return res.status(400).json({ success: false, message: "SOS ID and Status are required." });
    }

    const userRole = req.session ? req.session.role : staff.role;
    const result = await SosModel.updateStatus(id, status.toUpperCase(), staff.userId, notes || null, userRole);

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
        message: result ? result.message : "Server Error updating SOS status.",
        alert: result ? result.alert : null
      });
    }

    const updated = result;
    const activeRescuerLoc = rescuerTracker.getRescuerLocation(id);
    const rLat = (rescuer_lat !== undefined && rescuer_lat !== null && isFinite(Number(rescuer_lat)))
      ? Number(rescuer_lat)
      : (activeRescuerLoc && isFinite(Number(activeRescuerLoc.latitude)) ? Number(activeRescuerLoc.latitude) : 13.51037);
    const rLng = (rescuer_lng !== undefined && rescuer_lng !== null && isFinite(Number(rescuer_lng)))
      ? Number(rescuer_lng)
      : (activeRescuerLoc && isFinite(Number(activeRescuerLoc.longitude)) ? Number(activeRescuerLoc.longitude) : 123.34810);

    try {
      const loraRoutes = require('../routes/loraRoutes');
      loraRoutes.queueOutboundSosAck(updated, status.toUpperCase(), updated.handler_name || staff.name || 'Rescue Team', { lat: rLat, lng: rLng });
    } catch (_) {}

    if (req.io && updated) {
      req.io.emit('sos:update_status', {
        id: Number(id),
        status: status.toUpperCase(),
        handled_by: staff.userId,
        handler_name: updated.handler_name || staff.name,
        handler_contact: updated.handler_contact || null,
        rescuer_lat: rLat,
        rescuer_lng: rLng,
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

    return res.json({
      success: true,
      message: `SOS Emergency Status updated to ${status.toUpperCase()}.`,
      alert: updated
    });
  } catch (error) {
    console.error("Error updating SOS status:", error);
    res.status(500).json({ success: false, message: "Server Error updating SOS status." });
  }
};

// 12. WARNINGS / BROADCAST (BARANGAY COUNCIL SCOPED)
exports.getBroadcast = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    const userBarangay = staff.zone || 'San Rafael';
    const history = await Alert.findAllByBarangayWithSender(userBarangay, 50);
    const initialRecipients = await Resident.getTargetRecipients({ targetAudience: 'all', barangay: userBarangay });
    let successMsg = null;
    let warningMsg = null;
    let errorMsg = null;
    let broadcastAlertData = null;

    if (req.query.alertId && req.query.alertTitle) {
      broadcastAlertData = {
        id: req.query.alertId,
        severity: req.query.alertSeverity || 'RED',
        title: req.query.alertTitle,
        message: req.query.alertMessage || '',
        sent_at: new Date().toISOString()
      };
    }

    if (req.query.lora || req.query.success) {
      const status = req.query.status || 'TRANSMITTED_LORA';
      const inApp = req.query.inApp || 'SENT';
      successMsg = `Emergency alert broadcast dispatched simultaneously across 3 channels: SMS Gateway (iProgSMS), Web Push / In-App Siren, and 433.875 MHz LoRa Mesh.`;
    } else if (req.query.warning) {
      const inApp = req.query.inApp || 'SENT';
      const reason = req.query.msg || 'Mesh delivery notice.';
      warningMsg = `In-App Alert: ${inApp} | LoRa Mesh Notice: ${reason}`;
    } else if (req.query.error) {
      errorMsg = req.query.msg || 'Failed to dispatch 433.875 MHz LoRa broadcast. Please check LoRa Gateway COM3 connection.';
    }

    res.render("admin/broadcast", {
      ...sharedSimData(),
      user: { name: staff.name, role: staff.role || "barangay_council" },
      page: { title: "Send Warnings" },
      history: history,
      barangays: [userBarangay],
      initialMetrics: {
        totalRecipients: initialRecipients.totalRecipients,
        validPhoneCount: initialRecipients.validPhoneCount,
        residents: initialRecipients.residents
      },
      isBarangayCouncil: true,
      userBarangay: userBarangay,
      broadcastAlertData: broadcastAlertData,
      successMsg: successMsg,
      warningMsg: warningMsg,
      errorMsg: errorMsg
    });
  } catch (error) {
    console.error("Error loading barangay broadcast page:", error);
    res.status(500).send("Server Error");
  }
};

exports.calculateRecipients = async (req, res) => {
  try {
    const staff = await getStaffContext(req.session.userId);
    const userBarangay = staff.zone || 'San Rafael';

    const { target_audience, selected_ids } = req.body;
    let selectedArray = [];
    if (selected_ids) {
      selectedArray = Array.isArray(selected_ids) ? selected_ids : [selected_ids];
    }
    const result = await Resident.getTargetRecipients({
      targetAudience: target_audience,
      barangay: userBarangay,
      selectedIds: selectedArray
    });
    res.json({
      success: true,
      totalRecipients: result.totalRecipients,
      validPhoneCount: result.validPhoneCount,
      residents: result.residents
    });
  } catch (error) {
    console.error("Error calculating recipients:", error);
    res.status(500).json({ success: false, error: 'Failed to calculate recipients' });
  }
};

exports.sendBroadcast = async (req, res) => {
  const staff = await getStaffContext(req.session.userId);
  const userBarangay = staff.zone || 'San Rafael';
  const senderName = staff.name || "Barangay Staff";

  const { severity = 'RED', target_audience = 'all', selected_ids, sms_test_target, message: rawInputMsg, title: customTitle } = req.body;
  const upperSeverity = severity.toUpperCase();

  let title = customTitle ? customTitle.trim() : '';
  if (!title) {
    switch (upperSeverity) {
      case 'RED': title = `RED ALERT: Mandatory Evacuation Order (${userBarangay})`; break;
      case 'ORANGE': title = `ORANGE ALERT: Prepare for Immediate Evacuation (${userBarangay})`; break;
      case 'YELLOW': title = `YELLOW ALERT: Weather & Flood Watch (${userBarangay})`; break;
      case 'GREEN': title = `GREEN ALERT: All Clear Notice (${userBarangay})`; break;
      case 'BLUE': default: title = `BLUE ALERT: Barangay Community Advisory (${userBarangay})`; break;
    }
  }

  const evacuateRedirectUrl = process.env.EVACUATE_REDIRECT_URL || 'https://evacwar.onrender.com/evacuate';
  let message = (rawInputMsg || '').trim();
  const loraCleanMessage = message.replace(/https?:\/\/[^\s]+/gi, '').trim() || message;

  let selectedArray = [];
  if (selected_ids) {
    selectedArray = Array.isArray(selected_ids) ? selected_ids : [selected_ids];
  }

  // 1. Recipient calculation
  let targetData = { totalRecipients: 0, validPhoneCount: 0, recipientPhones: [], targetUserIds: [] };
  try {
    targetData = await Resident.getTargetRecipients({
      targetAudience: target_audience,
      barangay: userBarangay,
      selectedIds: selectedArray
    });
  } catch (recipErr) {
    console.error("Error resolving staff recipients:", recipErr);
  }

  // 2. Alert creation in database
  let alertId = null;
  try {
    alertId = await Alert.create({
      sender_id: req.session.userId,
      title: title,
      message: message,
      severity: upperSeverity,
      broadcast_type: 'LORA_MESH',
      target_audience: target_audience.toUpperCase(),
      barangay: userBarangay,
      recipient_count: targetData.totalRecipients || 0,
      valid_phone_count: (targetData.recipientPhones && targetData.recipientPhones.length) || 0,
      status: 'QUEUED',
      message_id: null,
      delivery_report: null
    });
  } catch (dbCreateErr) {
    console.error("Error creating staff alert in database:", dbCreateErr);
    alertId = Date.now();
  }

  console.log(`Alert ID: ${alertId}`);
  console.log(`Sender ID: ${req.session.userId}`);
  console.log(`Target users:`, targetData.targetUserIds || 'ALL');

  // 2b. Queue 433.875 MHz LoRa Mesh Alert & update /api/lora/latest-alert for all mobile phones
  try {
    const loraRoutes = require('../routes/loraRoutes');
    if (loraRoutes && typeof loraRoutes.queueOutboundAlertBroadcast === 'function') {
      loraRoutes.queueOutboundAlertBroadcast({
        id: String(alertId || Date.now()).slice(-7),
        title: title,
        message: message,
        severity: upperSeverity,
        barangay: userBarangay || 'ALL',
        evacCenter: 'San Rafael Evacuation Center'
      });
    }
  } catch (_e) {}

  // 3. Socket.IO In-App Emergency Broadcast (INDEPENDENT OF SMS)
  let inAppStatus = 'FAILED';
  try {
    if (req.io) {
      const aidStr = String(alertId || Date.now()).slice(-7);
      const alertPayload = {
        id: aidStr,
        alertId: aidStr,
        sender_id: req.session.userId,
        title: title,
        message: message,
        severity: upperSeverity,
        target_audience: target_audience.toUpperCase(),
        barangay: userBarangay,
        target_user_ids: targetData.targetUserIds || null,
        sent_at: new Date().toISOString(),
        timestampMs: Date.now()
      };

      req.io.emit('emergency:alert', alertPayload);
      req.io.emit('alert:broadcast', alertPayload);
      req.io.emit('notification:new', alertPayload);
      inAppStatus = 'SENT';
    }
  } catch (ioErr) {
    console.error("Staff socket broadcast error:", ioErr);
  }
  console.log(`In-app broadcast: ${inAppStatus}`);

  // Invalidate central notifications cache so notification bell icons reflect the new alert immediately!
  try {
    const NotificationModel = require('../models/notificationModel');
    NotificationModel.invalidateCache();
  } catch (notifErr) {
    console.warn("Non-fatal: Error invalidating notification cache:", notifErr);
  }

  // 4. Web Push Delivery (Background / Inactive / Locked screens)
  try {
    const pushPayload = {
      id: alertId || Date.now(),
      title: title,
      message: message,
      severity: upperSeverity,
      barangay: barangay || null,
      url: '/'
    };

    // Query all emergency response personnel (Rescuers, Staff, Admin) so they ALWAYS receive emergency push broadcasts
    const [responderUsers] = await db.query(`
      SELECT DISTINCT u.id 
      FROM users u
      LEFT JOIN staff s ON u.id = s.user_id
      WHERE u.role IN ('admin', 'staff', 'barangay_council', 'rescuer')
         OR s.staff_type IN ('RESCUER', 'EVACUATION')
    `).catch(() => [[]]);
    const responderIds = (responderUsers || []).map(u => u.id);

    const isBroadcastToAll = (!target_audience || target_audience.toLowerCase() === 'all') && (!barangay || barangay.toLowerCase() === 'all');
    let targetPushUsers = null;
    if (!isBroadcastToAll) {
      // Include targeted residents PLUS all emergency responders (rescuers, staff, admin)
      const residentIds = (targetData.targetUserIds && targetData.targetUserIds.length > 0) ? targetData.targetUserIds : [];
      targetPushUsers = Array.from(new Set([...residentIds, ...responderIds]));
    }

    pushService.sendEmergencyPush(targetPushUsers, pushPayload).catch(pErr => {
      console.error("[StaffBroadcast] Web Push async failure:", pErr.message);
    });
  } catch (pushErr) {
    console.error("[StaffBroadcast] Web Push execution error:", pushErr);
  }

  // 5. 433.875 MHz LoRa Mesh Network Dispatch (Offline RF Mesh)
  let loraResult = null;
  try {
    loraResult = queueOutboundAlertBroadcast({
      id: alertId || Date.now().toString().slice(-7),
      title: title,
      message: loraCleanMessage,
      severity: upperSeverity,
      barangay: userBarangay || 'ALL',
      evacCenter: 'Nearest Safe Evacuation Center'
    });
    console.log(`[StaffBroadcast] 433.875 MHz LoRa Mesh Alert Queued (Instant):`, loraResult ? loraResult.packet : 'OK');
  } catch (loraErr) {
    console.error("[StaffBroadcast] LoRa Queue error:", loraErr);
  }

  const loraStatus = loraResult ? 'TRANSMITTED_LORA' : 'QUEUED';
  const loraPacketStr = loraResult ? loraResult.packet : `EVW|ALT|${alertId}|${upperSeverity}|${userBarangay}|${title.slice(0, 38)}|Nearest Safe Evacuation Center|${loraCleanMessage.slice(0, 95)}`;

  // 6. Live SMS Broadcast via iProgSMS API + Database Status Update
  const smsService = require('../utils/smsService');
  smsService.sendSmsBroadcast({
    recipientPhones: targetData.recipientPhones || [],
    testTargetPhone: sms_test_target || null,
    message: message,
    title: title,
    severity: upperSeverity,
    senderName: senderName,
    evacuateUrl: evacuateRedirectUrl,
    skipLoraQueue: true
  }).then(async (smsRes) => {
    if (alertId && typeof alertId === 'number') {
      try {
        const db = require('../config/db');
        let parsedSmsReport = {};
        try { parsedSmsReport = JSON.parse((smsRes && smsRes.deliveryReport) || '{}'); } catch (_) {}
        await db.execute(
          'UPDATE alerts SET status = ?, message_id = ?, broadcast_type = ?, delivery_report = ? WHERE id = ?',
          [
            (smsRes && smsRes.success) ? 'QUEUED' : loraStatus,
            (smsRes && smsRes.messageId) || 'LORA-433.875MHZ',
            'BOTH',
            JSON.stringify({
              ...parsedSmsReport,
              channels: ['SMS (iProgSMS)', 'Web Push & In-App Siren', '433.875 MHz LoRa Mesh'],
              meshFreq: '433.875 MHz',
              channel: 'EU_433 / LONG_FAST',
              nodes: ['HALL !d88b1a58', 'REL1 !0f778ab0', 'RES1 !f4e213d4'],
              packet: loraPacketStr
            }),
            alertId
          ]
        );
      } catch (dbUpdateErr) {
        console.warn("Non-fatal: Error updating alert status in DB:", dbUpdateErr);
      }
    }
  }).catch(() => {});

  const alertQuery = `&alertId=${encodeURIComponent(alertId)}&alertSeverity=${encodeURIComponent(upperSeverity)}&alertTitle=${encodeURIComponent(title)}&alertMessage=${encodeURIComponent(loraCleanMessage)}`;

  return res.redirect(`/staff/broadcast?success=1&lora=1&sms=1&status=TRANSMITTED_ALL_3&nodes=3&inApp=${inAppStatus}${alertQuery}`);
};

// 13. STAFF PROFILE & SETTINGS
exports.getSettings = async (req, res) => {
  try {
    const userId = req.session.userId;
    const staff = await Staff.findByUserId(userId);
    const user = await User.findById(userId);

    const firstName = staff ? (staff.first_name || '') : (user ? user.first_name : 'Staff');
    const middleName = staff ? (staff.middle_name || '') : '';
    const lastName = staff ? (staff.last_name || '') : (user ? user.last_name : '');
    const fullName = staff ? (staff.full_name || `${firstName} ${lastName}`.trim()) : 'Staff Member';
    const profilePhoto = staff ? staff.profile_photo : (user ? user.profile_photo : null);
    const email = (user && user.email) ? user.email : (staff && staff.email ? staff.email : '');
    const occupation = staff ? (staff.occupation || 'Emergency Response Staff') : 'Emergency Response Staff';
    const contactNumber = staff ? (staff.contact_number || '') : '';
    const staffType = staff ? (staff.staff_type || 'BOTH') : 'BOTH';
    const staffStatus = staff ? (staff.status || 'ACTIVE') : 'ACTIVE';
    const assignedCenterName = staff ? (staff.assigned_center_name || 'San Rafael Evacuation Center') : 'San Rafael Evacuation Center';
    const assignedCenterAddress = staff ? (staff.assigned_center_address || 'Barangay San Rafael, Baao, Camarines Sur') : 'Barangay San Rafael, Baao, Camarines Sur';
    const assignedCenters = staff && staff.assigned_centers ? staff.assigned_centers : [];
    const assignedBarangay = 'San Rafael';

    res.render("staff/settings", {
      ...sharedSimData(),
      user: {
        id: userId,
        name: fullName,
        role: (user && user.role) || "staff",
        email: email,
        profile_photo: profilePhoto,
        staff_type: staffType
      },
      staff: {
        id: staff ? staff.id : null,
        user_id: userId,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        full_name: fullName,
        occupation: occupation,
        contact_number: contactNumber,
        email: email,
        staff_type: staffType,
        status: staffStatus,
        assigned_barangay: assignedBarangay,
        assigned_center_id: staff ? staff.assigned_center_id : null,
        assigned_center_name: assignedCenterName,
        assigned_center_address: assignedCenterAddress,
        assigned_centers: assignedCenters,
        assigned_center_capacity: staff ? staff.assigned_center_capacity : null,
        assigned_center_occupancy: staff ? staff.assigned_center_occupancy : null,
        profile_photo: profilePhoto,
        created_at: staff ? staff.created_at : (user ? user.created_at : null),
        is_verified: user ? user.is_verified : true
      },
      page: { title: "Profile" },
      statusMsg: req.query.success || null,
      errorMsg: req.query.error || null
    });
  } catch (error) {
    console.error("Error loading staff profile/settings:", error);
    res.status(500).send("Server Error");
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }

    const bcrypt = require('bcryptjs');
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
        return res.redirect('/staff/profile?error=' + encodeURIComponent('Please fill out all password fields.'));
      }
      if (new_password !== confirm_password) {
        return res.redirect('/staff/profile?error=' + encodeURIComponent('New password and confirm password do not match.'));
      }
      if (!isValidPassword(new_password)) {
        return res.redirect('/staff/profile?error=' + encodeURIComponent(PASSWORD_ERROR_MESSAGE));
      }

      const [userRows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
      if (userRows.length > 0) {
        const isMatch = await bcrypt.compare(current_password, userRows[0].password_hash);
        if (!isMatch) {
          return res.redirect('/staff/profile?error=' + encodeURIComponent('Current password is incorrect.'));
        }
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(new_password, salt);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
      }

      if (req.session) {
        req.session.userProfile = null;
        req.session.userProfileTime = 0;
      }

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, message: 'Password updated successfully!' });
      }
      return res.redirect('/staff/profile?success=' + encodeURIComponent('Password updated successfully!'));
    }

    // Sanitize and Validate Phone Number
    let cleanContact = contact_number !== undefined && contact_number !== null ? String(contact_number).trim() : null;
    if (cleanContact) {
      cleanContact = cleanContact.replace(/[\s\-\(\)]/g, '');
      if (cleanContact.startsWith('+63')) cleanContact = '0' + cleanContact.slice(3);
      if (cleanContact.startsWith('63')) cleanContact = '0' + cleanContact.slice(2);
      if (!isValidPhoneNumber(cleanContact)) {
        return res.redirect('/staff/profile?error=' + encodeURIComponent(PHONE_ERROR_MESSAGE));
      }
    }

    // Update email in users table if changed
    if (email && email.trim()) {
      const trimmedEmail = email.trim().toLowerCase();
      const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [trimmedEmail, userId]);
      if (existingUser.length > 0) {
        return res.redirect('/staff/profile?error=' + encodeURIComponent('Email address is already in use by another account.'));
      }
      await db.execute('UPDATE users SET email = ? WHERE id = ?', [trimmedEmail, userId]);
    }

    // Update staff profile information (authorized fields only)
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

    if (cleanFirst) {
      req.session.userName = `${cleanFirst} ${cleanLast || ''}`.trim();
    }
    if (req.session) {
      req.session.userProfile = null;
      req.session.userProfileTime = 0;
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Staff profile updated successfully!' });
    }

    return res.redirect('/staff/profile?success=' + encodeURIComponent('Staff profile updated successfully!'));
  } catch (error) {
    console.error("Error updating staff profile/settings:", error);
    return res.redirect('/staff/profile?error=' + encodeURIComponent('Failed to update profile: ' + error.message));
  }
};

exports.getTyphoon = async (req, res) => {
  try {
    const [staffContext, liveWeather] = await Promise.all([
      getStaffContext(req.session.userId, res.locals.staff),
      weatherService.getLatestWeather().catch(() => null)
    ]);
    res.render("staff/typhoon", {
      ...sharedSimData(),
      user: { name: staffContext.name, role: "staff" },
      staff: staffContext,
      page: { title: "Typhoon Monitoring" },
      weather: liveWeather || res.locals.weather
    });
  } catch (error) {
    console.error("Error loading staff typhoon page:", error);
    res.status(500).send("Server Error");
  }
};

exports.getChat = async (req, res) => {
  try {
    const staffContext = await getStaffContext(req.session.userId, res.locals.staff);
    res.render("staff/chat", {
      ...sharedSimData(),
      user: {
        id: staffContext.userId,
        name: staffContext.name,
        full_name: staffContext.name,
        profile_photo: staffContext.profile_photo,
        role: "staff",
        staff_type: "EVACUATION"
      },
      staff: staffContext,
      page: { title: "LoRa Mesh Chat" }
    });
  } catch (error) {
    console.error("Error loading staff chat page:", error);
    res.status(500).send("Server Error loading Staff LoRa Chat");
  }
};
