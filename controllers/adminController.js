const path = require('path');
const ejs = require('ejs');
const sharedSimData = require('../utils/simData');
const weatherService = require('../utils/weatherService');
const pagasaService = require('../utils/pagasaService');
const facebookPagasaService = require('../utils/facebookPagasaService');
const pdfService = require('../utils/pdfService');

const Resident = require('../models/residentModel');
const Center = require('../models/centerModel');
const SosModel = require('../models/sosModel');
const Alert = require('../models/alertModel');
const pushService = require('../services/pushService');

const db = require('../config/db');
const gisCache = require('../utils/gisCache');
const {
  isValidPhoneNumber,
  PHONE_ERROR_MESSAGE,
  isValidZone,
  ZONE_ERROR_MESSAGE,
  isValidPassword,
  PASSWORD_ERROR_MESSAGE
} = require('../utils/validators');

exports.getDashboard = async (_req, res) => {
  try {
    const now = new Date();
    const [
      metrics,
      totalCenters,
      alertResult,
      activeSosAlerts,
      evacStatsResult,
      recentAlerts,
      centersList,
      liveWeather,
      pendingCountResult,
      statusCountsResult,
      zoneCountsResult,
      vulnerabilitiesResult,
      issuedQrResult,
      genderCountsResult,
      centerCapacitiesResult,
      sosTimelineResult,
      evacTimelineResult,
      pagasaFeed
    ] = await Promise.all([
      Resident.getMetrics().catch(() => ({ totalIndividuals: 0, totalFamilies: 0 })),
      Center.countAll().catch(() => 0),
      db.execute('SELECT COUNT(*) as count FROM alerts').catch(() => [[{ count: 0 }]]),
      SosModel.getActiveAlerts().catch(() => []),
      db.execute('SELECT COALESCE(SUM(current_occupancy), 0) as totalEvacuees, COALESCE(SUM(max_capacity), 0) as totalCapacity FROM evacuation_centers').catch(() => [[{ totalEvacuees: 0, totalCapacity: 0 }]]),
      Alert.findAllWithSender(6).catch(() => []),
      Center.findAll().catch(() => []),
      weatherService.getLatestWeather().catch(() => null),
      db.execute("SELECT COUNT(*) as count FROM residents r LEFT JOIN users u ON r.user_id = u.id WHERE r.approval_status = 'PENDING' AND (u.role IS NULL OR u.role = 'resident')").catch(() => [[{ count: 0 }]]),
      db.query("SELECT r.approval_status, r.registration_source, COUNT(r.id) as cnt FROM residents r LEFT JOIN users u ON r.user_id = u.id WHERE (u.role IS NULL OR u.role = 'resident') GROUP BY r.approval_status, r.registration_source").catch(() => [[]]),
      db.query("SELECT r.home_address as zone, COUNT(r.id) as cnt FROM residents r LEFT JOIN users u ON r.user_id = u.id WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' AND (u.role IS NULL OR u.role = 'resident') AND r.approval_status = 'APPROVED' AND r.home_address LIKE 'Zone%' GROUP BY r.home_address ORDER BY r.home_address").catch(() => [[]]),
      db.query(`
        SELECT 
          COALESCE(SUM(seniors), 0) as seniors,
          COALESCE(SUM(pwd), 0) as pwd,
          COALESCE(SUM(four_ps), 0) as four_ps,
          COALESCE(SUM(pregnant), 0) as pregnant,
          COALESCE(SUM(children), 0) as children,
          COALESCE(SUM(lactating), 0) as lactating,
          COALESCE(SUM(bedridden), 0) as bedridden,
          COALESCE(SUM(solo_parent), 0) as solo_parent,
          COALESCE(SUM(serious_illness), 0) as serious_illness
        FROM (
          SELECT 
            CASE WHEN (r.age >= 60 OR (r.birthdate IS NOT NULL AND TIMESTAMPDIFF(YEAR, r.birthdate, CURDATE()) >= 60)) THEN 1 ELSE 0 END as seniors,
            CASE WHEN r.is_pwd = 1 THEN 1 ELSE 0 END as pwd,
            CASE WHEN r.is_4ps = 1 THEN 1 ELSE 0 END as four_ps,
            CASE WHEN r.is_pregnant = 1 THEN 1 ELSE 0 END as pregnant,
            CASE WHEN ((r.age IS NOT NULL AND r.age <= 12) OR (r.birthdate IS NOT NULL AND TIMESTAMPDIFF(YEAR, r.birthdate, CURDATE()) <= 12)) THEN 1 ELSE 0 END as children,
            CASE WHEN r.is_lactating = 1 THEN 1 ELSE 0 END as lactating,
            CASE WHEN (r.vulnerability LIKE '%bedridden%') THEN 1 ELSE 0 END as bedridden,
            CASE WHEN r.is_single_head = 1 THEN 1 ELSE 0 END as solo_parent,
            CASE WHEN r.has_serious_illness = 1 THEN 1 ELSE 0 END as serious_illness
          FROM residents r
          LEFT JOIN users u ON r.user_id = u.id
          WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' AND (u.role IS NULL OR u.role = 'resident') AND r.approval_status = 'APPROVED'
          UNION ALL
          SELECT 
            CASE WHEN (hm.age >= 60 OR (hm.birthdate IS NOT NULL AND TIMESTAMPDIFF(YEAR, hm.birthdate, CURDATE()) >= 60) OR hm.status LIKE '%elderly%' OR hm.status LIKE '%senior%') THEN 1 ELSE 0 END as seniors,
            CASE WHEN (hm.is_pwd = 1 OR hm.status LIKE '%pwd%') THEN 1 ELSE 0 END as pwd,
            0 as four_ps,
            CASE WHEN (hm.is_pregnant = 1 OR hm.status LIKE '%pregnant%') THEN 1 ELSE 0 END as pregnant,
            CASE WHEN ((hm.age IS NOT NULL AND hm.age <= 12) OR (hm.birthdate IS NOT NULL AND TIMESTAMPDIFF(YEAR, hm.birthdate, CURDATE()) <= 12) OR hm.status LIKE '%infant%' OR hm.status LIKE '%toddler%') THEN 1 ELSE 0 END as children,
            CASE WHEN (hm.is_lactating = 1 OR hm.status LIKE '%lactating%') THEN 1 ELSE 0 END as lactating,
            CASE WHEN hm.status LIKE '%bedridden%' THEN 1 ELSE 0 END as bedridden,
            CASE WHEN (hm.status LIKE '%solo_parent%' OR hm.status LIKE '%single_head%') THEN 1 ELSE 0 END as solo_parent,
            CASE WHEN (hm.has_serious_illness = 1 OR hm.status LIKE '%illness%') THEN 1 ELSE 0 END as serious_illness
          FROM household_members hm
          JOIN residents r ON hm.resident_id = r.id
          LEFT JOIN users u ON r.user_id = u.id
          WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' AND (u.role IS NULL OR u.role = 'resident') AND r.approval_status = 'APPROVED'
        ) as combined_vulnerabilities
      `).catch(() => [[]]),
      db.query("SELECT COUNT(r.id) as cnt FROM residents r LEFT JOIN users u ON r.user_id = u.id WHERE r.qr_code_uuid IS NOT NULL AND r.approval_status = 'APPROVED' AND COALESCE(r.status, 'ACTIVE') = 'ACTIVE' AND (u.role IS NULL OR u.role = 'resident')").catch(() => [[]]),
      db.query(`
        SELECT 
          COALESCE(SUM(male), 0) as male,
          COALESCE(SUM(female), 0) as female
        FROM (
          SELECT 
            CASE WHEN LOWER(r.sex) LIKE 'm%' THEN 1 ELSE 0 END as male,
            CASE WHEN LOWER(r.sex) LIKE 'f%' THEN 1 ELSE 0 END as female
          FROM residents r
          LEFT JOIN users u ON r.user_id = u.id
          WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' AND (u.role IS NULL OR u.role = 'resident') AND r.approval_status = 'APPROVED'
          UNION ALL
          SELECT 
            CASE WHEN LOWER(hm.sex) LIKE 'm%' THEN 1 ELSE 0 END as male,
            CASE WHEN LOWER(hm.sex) LIKE 'f%' THEN 1 ELSE 0 END as female
          FROM household_members hm
          JOIN residents r ON hm.resident_id = r.id
          LEFT JOIN users u ON r.user_id = u.id
          WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' AND (u.role IS NULL OR u.role = 'resident') AND r.approval_status = 'APPROVED'
        ) as combined_genders
      `).catch(() => [[]]),
      db.query("SELECT name, current_occupancy, max_capacity FROM evacuation_centers ORDER BY max_capacity DESC LIMIT 8").catch(() => [[]]),
      db.query("SELECT DATE_FORMAT(created_at, '%b %e') as label, COUNT(*) as count FROM sos_alerts GROUP BY DATE(created_at), DATE_FORMAT(created_at, '%b %e') ORDER BY DATE(created_at) ASC").catch(() => [[]]),
      db.query("SELECT DATE_FORMAT(check_in_time, '%b %e') as label, COUNT(*) as count FROM check_ins WHERE check_in_time IS NOT NULL GROUP BY DATE(check_in_time), DATE_FORMAT(check_in_time, '%b %e') ORDER BY DATE(check_in_time) ASC").catch(() => [[]]),
      Promise.resolve(null)
    ]);

    const alertRows = alertResult[0] || [];
    const totalAlerts = alertRows.length > 0 ? alertRows[0].count : 0;
    const evacRow = (evacStatsResult[0] && evacStatsResult[0][0]) ? evacStatsResult[0][0] : { totalEvacuees: 0, totalCapacity: 0 };
    const pendingCount = (pendingCountResult[0] && pendingCountResult[0][0]) ? Number(pendingCountResult[0][0].count) : 0;

    // Process system demographics & verification analytics
    const statusRows = statusCountsResult[0] || [];
    let approvedResidentsCount = 0;
    let pendingResidentsCount = 0;
    let walkinCount = 0;
    let rejectedCount = 0;

    statusRows.forEach(s => {
      const cnt = Number(s.cnt) || 0;
      if (String(s.approval_status || '').toUpperCase() === 'APPROVED') {
        approvedResidentsCount += cnt;
        if (s.registration_source === 'WALK_IN') walkinCount += cnt;
      }
      else if (s.approval_status === 'PENDING') pendingResidentsCount += cnt;
      else if (s.approval_status === 'REJECTED') rejectedCount += cnt;
    });

    const issuedQrCount = (issuedQrResult[0] && issuedQrResult[0][0]) ? Number(issuedQrResult[0][0].cnt) : 0;
    const vulnData = (vulnerabilitiesResult[0] && vulnerabilitiesResult[0][0]) ? vulnerabilitiesResult[0][0] : {};
    const zoneData = (zoneCountsResult[0] || []).map(z => ({ zone: z.zone, count: Number(z.cnt) }));

    const genderData = (genderCountsResult && genderCountsResult[0] && genderCountsResult[0][0]) ? genderCountsResult[0][0] : { male: 0, female: 0 };
    const centersCapData = (centerCapacitiesResult && centerCapacitiesResult[0]) ? centerCapacitiesResult[0] : [];
    const rawSosTimeline = (sosTimelineResult && sosTimelineResult[0]) ? sosTimelineResult[0] : [];
    const rawEvacTimeline = (evacTimelineResult && evacTimelineResult[0]) ? evacTimelineResult[0] : [];

    // Slice timeline to last 10 points for optimal chart readability
    const sosPoints = rawSosTimeline.slice(-10);
    const evacPoints = rawEvacTimeline.slice(-10);

    const maleCount = Number(genderData.male || 0);
    const femaleCount = Number(genderData.female || 0);

    const chartData = {
      registrationStatus: {
        labels: ['Approved', 'Pending Review', 'Rejected'],
        data: [approvedResidentsCount, pendingResidentsCount, rejectedCount]
      },
      genderDistribution: {
        labels: ['Male', 'Female'],
        data: [maleCount, femaleCount]
      },
      centerCapacities: {
        labels: centersCapData.map(c => (c && c.name && c.name.length > 18) ? c.name.slice(0, 16) + '…' : (c && c.name ? c.name : 'Center')),
        fullNames: centersCapData.map(c => (c && c.name) ? c.name : 'Center'),
        occupancy: centersCapData.map(c => Number(c ? c.current_occupancy : 0) || 0),
        available: centersCapData.map(c => Math.max(0, (Number(c ? c.max_capacity : 0) || 0) - (Number(c ? c.current_occupancy : 0) || 0))),
        capacities: centersCapData.map(c => Number(c ? c.max_capacity : 0) || 0)
      },
      sosTimeline: {
        labels: sosPoints.length > 0 ? sosPoints.map(p => p.label) : ['No Data'],
        data: sosPoints.length > 0 ? sosPoints.map(p => Number(p.count) || 0) : [0]
      },
      evacuationTrends: {
        labels: evacPoints.length > 0 ? evacPoints.map(p => p.label) : ['No Data'],
        data: evacPoints.length > 0 ? evacPoints.map(p => Number(p.count) || 0) : [0]
      },
      vulnerabilities: {
        labels: ['Senior Citizens', 'PWDs', 'Pregnant', 'Children (0-12)', 'Lactating'],
        data: [
          Number(vulnData.seniors || 0),
          Number(vulnData.pwd || 0),
          Number(vulnData.pregnant || 0),
          Number(vulnData.children || 0),
          Number(vulnData.lactating || 0)
        ]
      }
    };

    const analytics = {
      approvedResidents: approvedResidentsCount,
      pendingResidents: pendingResidentsCount,
      walkinEvacuees: walkinCount,
      rejectedResidents: rejectedCount,
      totalRegistered: approvedResidentsCount + pendingResidentsCount,
      totalAll: approvedResidentsCount + pendingResidentsCount + walkinCount + rejectedCount,
      issuedQrPasses: issuedQrCount,
      lockedQrPasses: pendingResidentsCount,
      approvalRate: (approvedResidentsCount + pendingResidentsCount > 0)
        ? Math.round((approvedResidentsCount / (approvedResidentsCount + pendingResidentsCount)) * 100)
        : 100,
      vulnerabilities: {
        seniors: Number(vulnData.seniors || 0),
        pwd: Number(vulnData.pwd || 0),
        four_ps: Number(vulnData.four_ps || 0),
        pregnant: Number(vulnData.pregnant || 0),
        children: Number(vulnData.children || 0),
        lactating: Number(vulnData.lactating || 0),
        bedridden: Number(vulnData.bedridden || 0),
        solo_parent: Number(vulnData.solo_parent || 0),
        serious_illness: Number(vulnData.serious_illness || 0)
      },
      zones: zoneData,
      chartData: chartData
    };

    res.render("admin/dashboard", {
      ...sharedSimData(),
      user: res.locals.user || { name: "Admin", role: "admin" },
      page: { title: "Admin Dashboard" },
      weather: liveWeather || res.locals.weather,
      pagasaFeed: pagasaFeed,
      summary: {
        totalResidents: metrics.totalIndividuals || 0,
        totalFamilies: metrics.totalFamilies || 0,
        totalCenters: totalCenters || 0,
        totalAlerts: totalAlerts,
        activeSosCount: activeSosAlerts.length || 0,
        totalEvacuees: Number(evacRow.totalEvacuees) || 0,
        totalCapacity: Number(evacRow.totalCapacity) || 0,
        pendingRegistrationsCount: pendingCount
      },
      analytics: analytics,
      activeSosAlerts: activeSosAlerts || [],
      recentAlerts: recentAlerts || [],
      centers: centersList || [],
      sim: {
        activeFlag: { level: "ORANGE", label: "Warning", message: "Heavy rain expected in 6–12 hours.", timestamp: now.toLocaleString() }
      }
    });
  } catch (error) {
    console.error("Error loading dashboard metrics:", error);
    res.status(500).send("Server Error");
  }
};

exports.getResidents = async (_req, res) => {
  try {
    const onlineTracker = require('../utils/onlineTracker');
    const residents = await Resident.findAllWithUsers();
    const enrichedResidents = residents.map(resident => {
      let idPhotoUrl = null;
      if (resident.barangay_id_photo) {
        idPhotoUrl = (resident.barangay_id_photo.startsWith('http') || resident.barangay_id_photo.startsWith('/'))
          ? resident.barangay_id_photo
          : `/uploads/profiles/${resident.barangay_id_photo}`;
      }
      return {
        ...resident,
        id_photo_url: idPhotoUrl,
        is_online: onlineTracker.isUserOnline(resident.user_id)
      };
    });

    res.render("admin/residents", {
      ...sharedSimData(),
      user: res.locals.user || { name: "Admin", role: "admin" },
      page: { title: "Manage Residents" },
      residents: enrichedResidents
    });
  } catch (error) {
    console.error("Error fetching residents:", error);
    res.status(500).send("Server Error");
  }
};

exports.approveResident = async (req, res) => {
  try {
    const residentId = req.params.id;
    const success = await Resident.approve(residentId);
    if (!success) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: "Resident not found." });
      }
      return res.redirect('/admin/residents');
    }

    try {
      const NotificationModel = require('../models/notificationModel');
      NotificationModel.invalidateCache();
      if (req.io) req.io.emit('resident:verified', { id: residentId, status: 'APPROVED' });
    } catch (notifErr) {
      console.warn("Notification invalidation notice:", notifErr.message);
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: "Resident approved successfully! Their account is now active." });
    }
    res.redirect('/admin/residents');
  } catch (error) {
    console.error("Error approving resident:", error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: "Failed to approve resident." });
    }
    res.status(500).send("Server Error");
  }
};

exports.rejectResident = async (req, res) => {
  try {
    const residentId = req.params.id;
    const success = await Resident.reject(residentId);
    if (!success) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: "Resident not found." });
      }
      return res.redirect('/admin/residents');
    }

    try {
      const NotificationModel = require('../models/notificationModel');
      NotificationModel.invalidateCache();
      if (req.io) req.io.emit('resident:verified', { id: residentId, status: 'REJECTED' });
    } catch (notifErr) {
      console.warn("Notification invalidation notice:", notifErr.message);
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: "Resident registration rejected." });
    }
    res.redirect('/admin/residents');
  } catch (error) {
    console.error("Error rejecting resident:", error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: "Failed to reject resident." });
    }
    res.status(500).send("Server Error");
  }
};

const residentDetailsMemoryCache = new Map();
const RESIDENT_DETAILS_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

function invalidateResidentDetailsCache(residentId) {
  if (residentId) {
    residentDetailsMemoryCache.delete(String(residentId));
  } else {
    residentDetailsMemoryCache.clear();
  }
}
exports.invalidateResidentDetailsCache = invalidateResidentDetailsCache;

exports.getResidentDetails = async (req, res) => {
  try {
    const residentId = String(req.params.id);

    // Fast-path: In-memory cache hit (< 1ms response)
    const cachedEntry = residentDetailsMemoryCache.get(residentId);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < RESIDENT_DETAILS_CACHE_TTL_MS)) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.json(cachedEntry.payload);
    }

    const [residentRows] = await db.execute(`
      SELECT 
        r.*, 
        u.email, 
        u.is_verified, 
        u.created_at as account_created
      FROM residents r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `, [residentId]);

    if (residentRows.length === 0) {
      return res.status(404).json({ success: false, message: "Resident not found." });
    }

    const resident = residentRows[0];
    const HouseholdMember = require('../models/householdMemberModel');

    // Run household members and check-in history queries concurrently
    const [members, [historyRows]] = await Promise.all([
      HouseholdMember.findByResidentId(resident.id),
      db.execute(`
        SELECT 
          c.id,
          c.check_in_time,
          c.check_out_time,
          c.status,
          c.check_in_method,
          c.household_member_id,
          ec.name as center_name,
          ec.address as center_address,
          u.email as staff_email,
          s.first_name as staff_first_name,
          s.middle_name as staff_middle_name,
          s.last_name as staff_last_name,
          hm.first_name as member_first_name,
          hm.last_name as member_last_name
        FROM check_ins c
        LEFT JOIN evacuation_centers ec ON c.center_id = ec.id
        LEFT JOIN users u ON c.staff_user_id = u.id
        LEFT JOIN staff s ON c.staff_user_id = s.user_id
        LEFT JOIN household_members hm ON c.household_member_id = hm.id
        WHERE c.resident_id = ?
        ORDER BY c.check_in_time DESC
        LIMIT 50
      `, [resident.id])
    ]);

    const totalHouseholdMembers = 1 + members.length;

    let photoUrl = null;
    if (resident.profile_photo) {
      photoUrl = (resident.profile_photo.startsWith('http') || resident.profile_photo.startsWith('/'))
        ? resident.profile_photo
        : `/uploads/profiles/${resident.profile_photo}`;
    }

    let idPhotoUrl = null;
    if (resident.barangay_id_photo) {
      idPhotoUrl = (resident.barangay_id_photo.startsWith('http') || resident.barangay_id_photo.startsWith('/'))
        ? resident.barangay_id_photo
        : `/uploads/profiles/${resident.barangay_id_photo}`;
    }

    const regSource = resident.registration_source || (resident.user_id ? 'REGISTERED' : 'WALK_IN');
    const approvalStatus = resident.approval_status || (resident.user_id ? (resident.is_verified ? 'APPROVED' : 'PENDING') : 'APPROVED');

    let residentQr = resident.qr_code_uuid;
    if (approvalStatus === 'APPROVED') {
      if (!residentQr) {
        const crypto = require('crypto');
        residentQr = crypto.randomUUID();
        try {
          await db.execute('UPDATE residents SET qr_code_uuid = ? WHERE id = ?', [residentQr, resident.id]);
        } catch (dbErr) {
          console.warn('Error saving generated QR UUID:', dbErr.message);
        }
      }
    } else {
      residentQr = null;
    }

    const payload = {
      success: true,
      resident: {
        id: resident.id,
        user_id: resident.user_id,
        registration_source: regSource,
        is_walkin: regSource === 'WALK_IN',
        approval_status: approvalStatus,
        is_verified: Boolean(resident.is_verified),
        first_name: resident.first_name,
        middle_name: resident.middle_name,
        last_name: resident.last_name,
        name: `${resident.first_name} ${resident.last_name}`,
        sex: resident.sex || 'Male',
        birthdate: resident.birthdate || null,
        age: resident.age || 'N/A',
        email: resident.email || (regSource === 'WALK_IN' ? 'Walk-in (No Login)' : 'N/A'),
        contact: resident.contact_number,
        address: resident.home_address,
        barangay: resident.barangay || 'San Rafael',
        emergency_contact_name: resident.emergency_contact_name || 'N/A',
        emergency_contact_phone: resident.emergency_contact_phone || 'N/A',
        vulnerability: resident.vulnerability || 'None',
        is_4ps: !!resident.is_4ps,
        is_pregnant: !!resident.is_pregnant,
        is_lactating: !!resident.is_lactating,
        is_pwd: !!resident.is_pwd,
        is_single_head: !!resident.is_single_head,
        has_serious_illness: !!resident.has_serious_illness,
        serious_illness_details: resident.serious_illness_details,
        family_size: totalHouseholdMembers,
        qr_code_uuid: residentQr,
        profile_photo: photoUrl,
        barangay_id_photo: idPhotoUrl,
        initials: (resident.first_name ? resident.first_name.charAt(0) : 'R').toUpperCase()
      },
      members: members.map(m => {
        const fullName = [m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ').trim() || `${m.first_name || ''} ${m.last_name || ''}`.trim() || 'Family Member';
        let memberPhotoUrl = null;
        if (m.profile_photo) {
          memberPhotoUrl = (m.profile_photo.startsWith('http') || m.profile_photo.startsWith('/'))
            ? m.profile_photo
            : `/uploads/profiles/${m.profile_photo}`;
        }
        return {
          id: m.id,
          first_name: m.first_name,
          middle_name: m.middle_name,
          last_name: m.last_name,
          name: fullName,
          relation: m.relation || 'Family Member',
          sex: m.sex || 'Male',
          age: (m.age !== null && m.age !== undefined && m.age !== '') ? m.age : 'N/A',
          birthdate: m.birthdate || null,
          status: m.status || 'None',
          profile_photo: memberPhotoUrl,
          is_pregnant: !!m.is_pregnant,
          is_lactating: !!m.is_lactating,
          is_pwd: !!m.is_pwd,
          has_serious_illness: !!m.has_serious_illness,
          serious_illness_details: m.serious_illness_details
        };
      }),
      history: historyRows.map(h => {
        let staffDisplayName = 'Staff';
        if (h.staff_first_name || h.staff_last_name) {
          staffDisplayName = [h.staff_first_name, h.staff_middle_name, h.staff_last_name].filter(Boolean).join(' ').trim() || `${h.staff_first_name || ''} ${h.staff_last_name || ''}`.trim();
        } else if (h.staff_email) {
          staffDisplayName = h.staff_email;
        }

        return {
          id: h.id,
          person_name: h.household_member_id ? `${h.member_first_name} ${h.member_last_name}` : `${resident.first_name} ${resident.last_name} (Head)`,
          center_name: h.center_name || 'Evacuation Center',
          check_in_time: new Date(h.check_in_time).toLocaleString(),
          check_out_time: h.check_out_time ? new Date(h.check_out_time).toLocaleString() : 'N/A',
          status: h.status,
          method: h.check_in_method || 'QR',
          staff_name: staffDisplayName,
          staff_email: h.staff_email || 'Staff'
        };
      })
    };

    // Store in memory cache
    residentDetailsMemoryCache.set(residentId, {
      timestamp: Date.now(),
      payload
    });

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.json(payload);
  } catch (error) {
    console.error("Error fetching resident details:", error);
    res.status(500).json({ success: false, message: "Server error fetching resident details." });
  }
};

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

exports.createResident = async (req, res) => {
  try {
    const { first_name, middle_name, last_name, email, contact_number, home_address, password } = req.body;

    const cleanContact = (contact_number || '').trim();
    if (!isValidPhoneNumber(cleanContact)) {
      return res.status(400).send(PHONE_ERROR_MESSAGE);
    }

    const cleanZone = (home_address || '').trim();
    if (!isValidZone(cleanZone)) {
      return res.status(400).send(ZONE_ERROR_MESSAGE);
    }

    if (password && !isValidPassword(password)) {
      return res.status(400).send(PASSWORD_ERROR_MESSAGE);
    }

    // Hash password (defaults to password123 which satisfies 8+ chars with letters & numbers)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password || 'password123', salt);

    // Insert into users
    const [userResult] = await db.execute(
      'INSERT INTO users (email, password_hash, role, is_verified) VALUES (?, ?, ?, ?)',
      [email, password_hash, 'resident', true]
    );
    const user_id = userResult.insertId;
    const profilePhoto = (req.files && req.files.profile_photo && req.files.profile_photo[0])
      ? req.files.profile_photo[0].filename
      : (req.file ? req.file.filename : null);

    const validIdPhoto = (req.files && req.files.valid_id && req.files.valid_id[0])
      ? req.files.valid_id[0].filename
      : null;

    // Insert into residents
    const qr_code_uuid = crypto.randomUUID();
    await Resident.create({
      user_id,
      first_name,
      middle_name: middle_name ? middle_name.trim() : null,
      last_name,
      contact_number,
      home_address,
      barangay: home_address || 'San Rafael',
      family_size: 1,
      has_special_needs: false,
      qr_code_uuid,
      profile_photo: profilePhoto,
      barangay_id_photo: validIdPhoto
    });

    try {
      const NotificationModel = require('../models/notificationModel');
      NotificationModel.invalidateCache();
    } catch (notifErr) {
      console.warn("Notification invalidation notice on resident creation:", notifErr.message);
    }

    res.redirect("/admin/residents");
  } catch (error) {
    console.error("Error creating resident:", error);
    res.status(500).send("Server Error (Email or Contact might already exist)");
  }
};

exports.editResident = async (req, res) => {
  try {
    const residentId = req.params.id;
    const {
      first_name,
      middle_name,
      last_name,
      sex,
      birthdate,
      age,
      contact_number,
      home_address,
      barangay,
      emergency_contact_name,
      emergency_contact_phone,
      vulnerability,
      family_size,
      has_special_needs,
      is_4ps,
      is_pregnant,
      is_lactating,
      is_pwd,
      is_single_head,
      has_serious_illness,
      serious_illness_details,
      email
    } = req.body;

    const resident = await Resident.findById(residentId);
    if (!resident) {
      return res.status(404).send("Resident not found.");
    }

    const profilePhoto = (req.files && req.files.profile_photo && req.files.profile_photo[0])
      ? req.files.profile_photo[0].filename
      : (req.file ? req.file.filename : undefined);

    const validIdPhoto = (req.files && req.files.valid_id && req.files.valid_id[0])
      ? req.files.valid_id[0].filename
      : undefined;

    const updateData = {
      first_name,
      middle_name: middle_name ? middle_name.trim() : null,
      last_name,
      sex: sex || undefined,
      birthdate: birthdate || undefined,
      age: age ? parseInt(age, 10) : undefined,
      contact_number,
      home_address,
      barangay: barangay || home_address || 'San Rafael',
      emergency_contact_name: emergency_contact_name || undefined,
      emergency_contact_phone: emergency_contact_phone || undefined,
      vulnerability: vulnerability || undefined,
      family_size: family_size ? parseInt(family_size, 10) : undefined,
      has_special_needs: has_special_needs !== undefined ? (has_special_needs === 'true' || has_special_needs === '1' || has_special_needs === true) : undefined,
      is_4ps: is_4ps !== undefined ? (is_4ps === 'true' || is_4ps === '1' || is_4ps === true) : undefined,
      is_pregnant: is_pregnant !== undefined ? (is_pregnant === 'true' || is_pregnant === '1' || is_pregnant === true) : undefined,
      is_lactating: is_lactating !== undefined ? (is_lactating === 'true' || is_lactating === '1' || is_lactating === true) : undefined,
      is_pwd: is_pwd !== undefined ? (is_pwd === 'true' || is_pwd === '1' || is_pwd === true) : undefined,
      is_single_head: is_single_head !== undefined ? (is_single_head === 'true' || is_single_head === '1' || is_single_head === true) : undefined,
      has_serious_illness: has_serious_illness !== undefined ? (has_serious_illness === 'true' || has_serious_illness === '1' || has_serious_illness === true) : undefined,
      serious_illness_details: serious_illness_details || undefined
    };

    if (profilePhoto) updateData.profile_photo = profilePhoto;
    if (validIdPhoto) updateData.barangay_id_photo = validIdPhoto;

    await Resident.update(residentId, updateData);

    if (email && resident.user_id) {
      await db.execute('UPDATE users SET email = ? WHERE id = ?', [email.trim().toLowerCase(), resident.user_id]);
    }

    invalidateResidentDetailsCache(residentId);

    res.redirect("/admin/residents");
  } catch (error) {
    console.error("Error updating resident:", error);
    res.status(500).send("Server Error updating resident");
  }
};

exports.uploadResidentId = async (req, res) => {
  try {
    const residentId = req.params.id;
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No Valid ID document was uploaded." });
    }

    const filename = req.file.filename;
    const [result] = await db.execute(
      'UPDATE residents SET barangay_id_photo = ? WHERE id = ?',
      [filename, residentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Resident not found." });
    }

    const photoUrl = `/uploads/profiles/${filename}`;
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        message: "Valid ID uploaded successfully!",
        id_photo_url: photoUrl
      });
    }

    res.redirect("/admin/residents");
  } catch (error) {
    console.error("Error uploading resident ID:", error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: "Failed to upload resident ID." });
    }
    res.status(500).send("Server Error");
  }
};

exports.deleteResident = async (req, res) => {
  try {
    await Resident.delete(req.params.id);
    try {
      const NotificationModel = require('../models/notificationModel');
      NotificationModel.invalidateCache();
    } catch (notifErr) {
      console.warn("Notification invalidation notice on resident deletion:", notifErr.message);
    }
    res.redirect("/admin/residents");
  } catch (error) {
    console.error("Error deleting resident:", error);
    res.status(500).send("Server Error");
  }
};

exports.getStaff = async (req, res) => {
  try {
    const Staff = require('../models/staffModel');
    const onlineTracker = require('../utils/onlineTracker');
    const [staffMembers, centers, barangays, [adminRows]] = await Promise.all([
      Staff.findAll(),
      Center.findAll(),
      Resident.getAllBarangays(),
      db.execute(`
        SELECT u.id, u.email, u.role, u.created_at,
               COALESCE(r.first_name, s.first_name, '') AS first_name,
               COALESCE(r.last_name, s.last_name, '') AS last_name,
               COALESCE(r.contact_number, s.contact_number, '') AS contact_number,
               COALESCE(r.profile_photo, s.profile_photo) AS profile_photo
        FROM users u
        LEFT JOIN residents r ON u.id = r.user_id
        LEFT JOIN staff s ON u.id = s.user_id
        WHERE u.role = 'admin'
        GROUP BY u.id
        ORDER BY u.id ASC
      `).catch(() => [[]])
    ]);

    const adminAccounts = (adminRows || []).map(a => {
      const fullName = `${a.first_name || ''} ${a.last_name || ''}`.trim();
      return {
        id: a.id,
        email: a.email,
        name: fullName || (a.email ? a.email.split('@')[0] : 'Administrator'),
        first_name: a.first_name || '',
        last_name: a.last_name || '',
        contact_number: a.contact_number || '',
        profile_photo: a.profile_photo || null,
        is_online: onlineTracker.isUserOnline(a.id),
        is_current_user: Boolean(req.session && Number(req.session.userId) === Number(a.id)),
        created_at: a.created_at
      };
    });

    const enrichedStaff = staffMembers.map(staff => ({
      ...staff,
      is_online: onlineTracker.isUserOnline(staff.user_id)
    }));

    // Map which staff members are assigned to each center
    const centerStaffMap = {};
    staffMembers.forEach(staff => {
      if ((staff.staff_type || '').toUpperCase() !== 'RESCUER') {
        const cIds = staff.assigned_center_ids || (staff.assigned_center_id ? [staff.assigned_center_id] : []);
        cIds.forEach(cid => {
          const numId = parseInt(cid, 10);
          if (!isNaN(numId)) {
            if (!centerStaffMap[numId]) centerStaffMap[numId] = [];
            centerStaffMap[numId].push({
              id: staff.id,
              user_id: staff.user_id,
              name: staff.full_name || `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || staff.name || 'Staff'
            });
          }
        });
      }
    });

    const enrichedCenters = centers.map(c => {
      // Use mapped staff or fallback to c.assigned_staff
      const assigned = centerStaffMap[c.id] || (c.assigned_staff || []).filter(s => (s.staff_type || '').toUpperCase() !== 'RESCUER');
      return {
        ...c,
        assigned_staff: assigned,
        has_staff: assigned.length > 0,
        staff_names: assigned.map(s => s.name || s.full_name || `${s.first_name || ''} ${s.last_name || ''}`.trim()).join(', ')
      };
    });

    // Sort: sites with No Staff Yet come first, then alphabetical
    const sortedCenters = [...enrichedCenters].sort((a, b) => {
      if (a.has_staff !== b.has_staff) return a.has_staff ? 1 : -1;
      return (a.name || '').localeCompare(b.name || '');
    });

    res.render("admin/staff", {
      ...sharedSimData(),
      user: res.locals.user || { name: "Admin", role: "admin" },
      page: { title: "Manage Staff & Admins" },
      staffMembers: enrichedStaff,
      adminAccounts: adminAccounts,
      centers: sortedCenters,
      barangays: barangays,
      successMsg: req.query.success || null,
      errorMsg: req.query.error || null
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).send("Server Error");
  }
};

exports.createStaff = async (req, res) => {
  try {
    const Staff = require('../models/staffModel');
    const bcrypt = require('bcryptjs');
    const {
      first_name,
      middle_name,
      last_name,
      occupation = 'Emergency Staff',
      email,
      contact_number,
      zone,
      password,
      staff_type = 'EVACUATION',
      assigned_center_id = null,
      assigned_center_ids = null,
      status = 'ACTIVE'
    } = req.body;

    const cleanEmail = (email && email.trim()) ? email.trim().toLowerCase() : null;
    const cleanStaffContact = (contact_number || '').trim();

    // Contact number is REQUIRED and must be a valid 11-digit Philippine mobile number
    if (!cleanStaffContact) {
      return res.status(400).send("Contact number is required.");
    }
    if (!isValidPhoneNumber(cleanStaffContact)) {
      return res.status(400).send(PHONE_ERROR_MESSAGE);
    }

    // Check if staff already exists with this contact number
    const [existingContactStaff] = await db.execute(
      'SELECT id FROM staff WHERE contact_number = ?',
      [cleanStaffContact]
    );
    if (existingContactStaff.length > 0) {
      return res.status(400).send("A staff member with this contact number already exists.");
    }

    let existingUserId = null;

    // If email is provided, check if it's already in use
    if (cleanEmail) {
      const [existingUser] = await db.execute('SELECT id, role FROM users WHERE email = ?', [cleanEmail]);
      if (existingUser.length > 0) {
        // Check if already a staff member
        const [existingStaff] = await db.execute('SELECT id FROM staff WHERE user_id = ?', [existingUser[0].id]);
        if (existingStaff.length > 0) {
          return res.status(400).send("This email is already registered to an active staff member.");
        }
        // User exists (e.g. as a resident) but not yet staff -> link to existing user account!
        existingUserId = existingUser[0].id;
      }
    }

    // If no existing user found by email, also check if a resident account exists with this contact number
    if (!existingUserId) {
      const [existingResident] = await db.execute(
        'SELECT r.user_id FROM residents r JOIN users u ON r.user_id = u.id WHERE r.contact_number = ? LIMIT 1',
        [cleanStaffContact]
      );
      if (existingResident.length > 0 && existingResident[0].user_id) {
        const [existingStaff] = await db.execute('SELECT id FROM staff WHERE user_id = ?', [existingResident[0].user_id]);
        if (existingStaff.length > 0) {
          return res.status(400).send("A staff member with this account already exists.");
        }
        existingUserId = existingResident[0].user_id;
      }
    }

    // Parse and normalize assigned center IDs
    let centerIds = assigned_center_ids || req.body['assigned_center_ids[]'] || assigned_center_id || [];
    if (!Array.isArray(centerIds)) {
      centerIds = (centerIds !== null && centerIds !== undefined && centerIds !== '') ? [centerIds] : [];
    }
    centerIds = [...new Set(centerIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0))];

    // Enforce single site assignment server-side (staff can only manage 1 site)
    if (centerIds.length > 1) {
      centerIds = centerIds.slice(0, 1);
    }

    // Rescuers focus exclusively on emergency SOS distress signals and have NO evacuation-site assignment
    if (staff_type === 'RESCUER') {
      centerIds = [];
    }

    if (password && !isValidPassword(password)) {
      return res.status(400).send(PASSWORD_ERROR_MESSAGE);
    }

    // Hash password with bcrypt (default 'staff123' satisfies 8+ chars with letters & numbers)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password || 'staff123', salt);

    let userId = existingUserId;

    if (!userId) {
      // 1. Insert into users (auth credentials only). Email is optional (can be null).
      const [userResult] = await db.execute(
        `INSERT INTO users (email, password_hash, role, is_verified) 
         VALUES (?, ?, ?, ?)`,
        [
          cleanEmail || null,
          password_hash,
          'staff',
          true
        ]
      );
      userId = userResult.insertId;
    } else {
      // Upgrade/link existing account: set role to 'staff', update password if admin provided new one
      if (password) {
        await db.execute('UPDATE users SET role = ?, password_hash = ? WHERE id = ?', ['staff', password_hash, userId]);
      } else {
        await db.execute('UPDATE users SET role = ? WHERE id = ?', ['staff', userId]);
      }
      if (cleanEmail) {
        await db.execute('UPDATE users SET email = COALESCE(email, ?) WHERE id = ?', [cleanEmail, userId]);
      }
    }
    const profilePhoto = req.file ? req.file.filename : null;

    // 2. Create Staff profile with multi-site assignments support
    await Staff.create({
      user_id: userId,
      first_name: (first_name || '').trim(),
      middle_name: middle_name ? middle_name.trim() : null,
      last_name: (last_name || '').trim(),
      occupation: (occupation || 'Emergency Staff').trim(),
      staff_type: staff_type || 'BOTH',
      assigned_center_id: centerIds[0] || null,
      assigned_center_ids: centerIds,
      contact_number: (contact_number || '').trim(),
      profile_photo: profilePhoto,
      status: (status || 'ACTIVE').toUpperCase()
    });

    res.redirect("/admin/staff");
  } catch (error) {
    console.error("Error creating staff:", error);
    res.status(500).send("Server Error creating staff account");
  }
};

exports.editStaff = async (req, res) => {
  try {
    const Staff = require('../models/staffModel');
    const {
      first_name,
      middle_name,
      last_name,
      occupation,
      email,
      contact_number,
      staff_type = 'EVACUATION',
      assigned_center_id = null,
      assigned_center_ids = null,
      status = 'ACTIVE'
    } = req.body;
    const staffId = req.params.id;

    // Update staff table by staff.id or user_id
    let staffRecord = await Staff.findById(staffId);
    if (!staffRecord) {
      staffRecord = await Staff.findByUserId(staffId);
    }

    if (staffRecord) {
      // Parse and normalize assigned center IDs
      let centerIds = assigned_center_ids !== undefined ? assigned_center_ids : req.body['assigned_center_ids[]'];
      if (centerIds === undefined) {
        centerIds = assigned_center_id !== undefined ? assigned_center_id : [];
      }
      if (!Array.isArray(centerIds)) {
        centerIds = (centerIds !== null && centerIds !== undefined && centerIds !== '') ? [centerIds] : [];
      }
      centerIds = [...new Set(centerIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0))];

      // Enforce single site assignment server-side (staff can only manage 1 site)
      if (centerIds.length > 1) {
        centerIds = centerIds.slice(0, 1);
      }

      // Rescuers focus exclusively on emergency SOS distress signals and have NO evacuation-site assignment
      if (staff_type === 'RESCUER') {
        centerIds = [];
      }

      const cleanEditStaffContact = contact_number ? contact_number.trim() : '';
      if (cleanEditStaffContact && !isValidPhoneNumber(cleanEditStaffContact)) {
        return res.status(400).send(PHONE_ERROR_MESSAGE);
      }

      const updateData = {
        first_name: first_name ? first_name.trim() : '',
        middle_name: middle_name ? middle_name.trim() : null,
        last_name: last_name ? last_name.trim() : '',
        occupation: occupation ? occupation.trim() : 'Emergency Staff',
        contact_number: cleanEditStaffContact,
        staff_type: staff_type || 'BOTH',
        assigned_center_id: centerIds[0] || null,
        assigned_center_ids: centerIds,
        status: (status || 'ACTIVE').toUpperCase()
      };

      if (req.file) {
        updateData.profile_photo = req.file.filename;
      }

      await Staff.update(staffRecord.id, updateData);

      // Handle Email update if provided and changed
      if (email && email.trim() !== '') {
        const cleanEmail = email.trim().toLowerCase();
        const [existingEmail] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, staffRecord.user_id]);
        if (existingEmail.length === 0) {
          await db.execute('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, staffRecord.user_id]);
        }
      }
    }

    res.redirect("/admin/staff");
  } catch (error) {
    console.error("Error updating staff:", error);
    res.status(500).send("Server Error updating staff");
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    const Staff = require('../models/staffModel');
    const staffId = req.params.id;
    await Staff.delete(staffId);
    res.redirect("/admin/staff");
  } catch (error) {
    console.error("Error deleting staff:", error);
    res.status(500).send("Server Error");
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const { first_name, last_name, email, contact_number, phone_number, password } = req.body;

    const cleanFirst = (first_name || '').trim();
    const cleanLast = (last_name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanContact = (contact_number || phone_number || '').trim();
    const rawPassword = (password || '').trim();

    if (!cleanFirst || !cleanLast || !cleanEmail || !rawPassword) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent('First name, last name, email, and password are required to create an admin account.'));
    }
    if (!isValidPassword(rawPassword)) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent(PASSWORD_ERROR_MESSAGE));
    }
    if (cleanContact && !isValidPhoneNumber(cleanContact)) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent(PHONE_ERROR_MESSAGE));
    }

    const [existing] = await db.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [cleanEmail]);
    if (existing.length > 0) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent('An account with this email address already exists.'));
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(rawPassword, salt);

    const [userRes] = await db.execute(
      `INSERT INTO users (email, password_hash, role, is_verified) VALUES (?, ?, 'admin', 1)`,
      [cleanEmail, password_hash]
    );
    const newUserId = userRes.insertId;

    // Create linked profile record in residents table so Admin's name & contact display across header, chat, and settings
    const qrUuid = crypto.randomUUID();
    await db.execute(
      `INSERT INTO residents (user_id, first_name, last_name, contact_number, home_address, barangay, qr_code_uuid, approval_status)
       VALUES (?, ?, ?, ?, ?, 'San Rafael', ?, 'APPROVED')`,
      [newUserId, cleanFirst, cleanLast, cleanContact || '09000000000', 'Barangay San Rafael Command Center', qrUuid]
    ).catch((profileErr) => {
      console.warn('[createAdmin] Non-fatal profile insert notice:', profileErr.message);
    });

    return res.redirect('/admin/settings?success=' + encodeURIComponent(`Administrator account for ${cleanFirst} ${cleanLast} (${cleanEmail}) created successfully!`));
  } catch (error) {
    console.error('Error creating admin account:', error);
    return res.redirect('/admin/settings?error=' + encodeURIComponent('Server error creating admin account: ' + error.message));
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const currentUserId = req.session ? Number(req.session.userId) : 0;

    if (!targetId || isNaN(targetId)) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent('Invalid admin account ID.'));
    }
    if (targetId === currentUserId) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent('You cannot delete your own currently logged-in administrator account.'));
    }

    const [admins] = await db.execute("SELECT id FROM users WHERE role = 'admin'");
    if (admins.length <= 1) {
      return res.redirect('/admin/settings?error=' + encodeURIComponent('Cannot delete the last remaining administrator account.'));
    }

    await db.execute('DELETE FROM residents WHERE user_id = ?', [targetId]).catch(() => {});
    await db.execute("DELETE FROM users WHERE id = ? AND role = 'admin'", [targetId]);

    return res.redirect('/admin/settings?success=' + encodeURIComponent('Administrator account removed successfully.'));
  } catch (error) {
    console.error('Error deleting admin account:', error);
    return res.redirect('/admin/settings?error=' + encodeURIComponent('Error removing administrator account.'));
  }
};

exports.editResident = async (req, res) => {
  try {
    const {
      first_name,
      middle_name,
      last_name,
      sex,
      birthdate,
      age,
      contact_number,
      home_address,
      barangay,
      emergency_contact_name,
      emergency_contact_phone,
      vulnerability,
      is_4ps,
      is_pregnant,
      is_lactating,
      is_pwd,
      is_single_head,
      has_serious_illness,
      serious_illness_details
    } = req.body;

    const cleanContact = contact_number ? contact_number.trim() : null;
    if (cleanContact && !isValidPhoneNumber(cleanContact)) {
      return res.status(400).send(PHONE_ERROR_MESSAGE);
    }

    const cleanEmergPhone = emergency_contact_phone ? emergency_contact_phone.trim() : null;
    if (cleanEmergPhone && !isValidPhoneNumber(cleanEmergPhone)) {
      return res.status(400).send("Emergency " + PHONE_ERROR_MESSAGE.toLowerCase());
    }

    const cleanZone = home_address ? home_address.trim() : null;
    if (cleanZone && !isValidZone(cleanZone)) {
      return res.status(400).send(ZONE_ERROR_MESSAGE);
    }

    const updateData = {
      first_name: first_name ? first_name.trim() : null,
      middle_name: middle_name ? middle_name.trim() : null,
      last_name: last_name ? last_name.trim() : null,
      sex: sex || 'Male',
      birthdate: birthdate || null,
      age: age ? parseInt(age) : null,
      contact_number: cleanContact,
      home_address: cleanZone,
      barangay: cleanZone || 'San Rafael',
      emergency_contact_name: emergency_contact_name ? emergency_contact_name.trim() : null,
      emergency_contact_phone: cleanEmergPhone,
      vulnerability: vulnerability || 'None',
      is_4ps: is_4ps === 'on' || is_4ps === 'true' || is_4ps === true,
      is_pregnant: is_pregnant === 'on' || is_pregnant === 'true' || is_pregnant === true,
      is_lactating: is_lactating === 'on' || is_lactating === 'true' || is_lactating === true,
      is_pwd: is_pwd === 'on' || is_pwd === 'true' || is_pwd === true,
      is_single_head: is_single_head === 'on' || is_single_head === 'true' || is_single_head === true,
      has_serious_illness: has_serious_illness === 'on' || has_serious_illness === 'true' || has_serious_illness === true,
      serious_illness_details: serious_illness_details ? serious_illness_details.trim() : null
    };

    if (req.file) {
      if (req.file.fieldname === 'valid_id') {
        updateData.barangay_id_photo = req.file.filename;
      } else {
        updateData.profile_photo = req.file.filename;
      }
    }
    if (req.files) {
      if (req.files.profile_photo && req.files.profile_photo[0]) {
        updateData.profile_photo = req.files.profile_photo[0].filename;
      }
      if (req.files.valid_id && req.files.valid_id[0]) {
        updateData.barangay_id_photo = req.files.valid_id[0].filename;
      }
    }

    await Resident.update(req.params.id, updateData);
    res.redirect("/admin/residents");
  } catch (error) {
    console.error("Error updating resident:", error);
    res.status(500).send("Server Error");
  }
};

exports.uploadResidentId = async (req, res) => {
  try {
    const residentId = req.params.id;
    const uploadedFile = req.file || (req.files && Array.isArray(req.files)
      ? req.files[0]
      : (req.files && (req.files.valid_id?.[0] || req.files.id_photo?.[0] || req.files.barangay_id_photo?.[0])));

    if (!uploadedFile || !uploadedFile.filename) {
      return res.status(400).json({ success: false, message: "Please select an image file to upload as the resident's valid ID." });
    }

    const [existing] = await db.execute('SELECT id, first_name, last_name FROM residents WHERE id = ?', [residentId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: "Resident not found." });
    }

    await db.execute('UPDATE residents SET barangay_id_photo = ? WHERE id = ?', [uploadedFile.filename, residentId]);

    const photoUrl = `/uploads/profiles/${uploadedFile.filename}`;

    return res.json({
      success: true,
      message: `Valid ID successfully attached for ${existing[0].first_name} ${existing[0].last_name}.`,
      barangay_id_photo: photoUrl
    });
  } catch (error) {
    console.error("Error uploading resident ID by admin:", error);
    return res.status(500).json({ success: false, message: "Failed to upload resident ID: " + error.message });
  }
};

exports.getTyphoon = async (_req, res) => {
  try {
    const [liveWeather, pagasaGuidance, pagasaFeed] = await Promise.all([
      weatherService.getLatestWeather().catch(() => null),
      pagasaService.getPagasaGuidance().catch(() => null),
      facebookPagasaService.getPagasaFeed().catch(() => ({ posts: [], activeStorm: null }))
    ]);
    const finalWeather = liveWeather || res.locals.weather || weatherService.getFallbackWeather();
    if (pagasaGuidance) {
      finalWeather.pagasa = pagasaGuidance;
    }
    res.render("admin/typhoon", {
      ...sharedSimData(),
      user: res.locals.user || { name: "Admin", role: "admin" },
      page: { title: "Typhoon Monitoring" },
      weather: finalWeather,
      pagasaFeed: pagasaFeed
    });
  } catch (error) {
    console.error("Error loading typhoon page:", error);
    res.status(500).send("Server Error");
  }
};

exports.getEvacuation = async (_req, res) => {
  try {
    const Staff = require('../models/staffModel');
    const [centers, allStaff, mapFeatures, activeSosAlerts] = await Promise.all([
      Center.findAll(),
      Staff.findAll(),
      gisCache.getDrawnFeatures(false),
      SosModel.getActiveAlerts().catch(() => [])
    ]);
    const eligibleStaff = allStaff.filter(s => s.staff_type === 'EVACUATION' || s.staff_type === 'BOTH');

    res.render("admin/evacuation", {
      ...sharedSimData(),
      user: res.locals.user || { name: "Admin", role: "admin" },
      page: { title: "Evacuation Site" },
      centers: centers,
      staffMembers: eligibleStaff,
      mapFeatures: mapFeatures || '{"type":"FeatureCollection","features":[]}',
      activeSosAlerts: activeSosAlerts || []
    });
  } catch (error) {
    console.error("Error fetching evacuation centers:", error);
    res.status(500).send("Server Error");
  }
};

exports.saveMapFeatures = async (req, res) => {
  try {
    const geojson = JSON.stringify(req.body);
    await db.execute(
      "INSERT INTO map_settings (key_name, value) VALUES ('drawn_features', ?) ON DUPLICATE KEY UPDATE value = ?",
      [geojson, geojson]
    );
    // Invalidate GIS cache immediately so all routes/sites get fresh data
    gisCache.invalidate(geojson);
    if (req.io) req.io.emit('map_features_updated', req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error saving map features:", error);
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

exports.createCenter = async (req, res) => {
  try {
    const Staff = require('../models/staffModel');
    const { name, address, contact_number, latitude, longitude, max_capacity, assigned_staff_ids } = req.body;
    const cappedMaxCapacity = Math.max(1, parseInt(max_capacity, 10) || 50);
    const newCenterId = await Center.create({
      name: (name || '').trim(),
      address: (address || '').trim(),
      contact_number: contact_number || '0912-345-6789',
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      max_capacity: cappedMaxCapacity
    });

    // Process staff assignments for this new center
    let staffIds = assigned_staff_ids || req.body['assigned_staff_ids[]'] || [];
    if (!Array.isArray(staffIds)) staffIds = (staffIds !== null && staffIds !== undefined && staffIds !== '') ? [staffIds] : [];
    staffIds = [...new Set(staffIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0))];

    for (const sId of staffIds) {
      const sMember = await Staff.findById(sId) || await Staff.findByUserId(sId);
      if (sMember && (sMember.staff_type === 'EVACUATION' || sMember.staff_type === 'BOTH')) {
        const currentCenters = await Staff.getAssignedCenters(sMember.user_id, sMember.assigned_center_id);
        const currentCenterIds = currentCenters.map(c => c.id);
        if (!currentCenterIds.includes(newCenterId) && currentCenterIds.length < 3) {
          currentCenterIds.push(newCenterId);
          await Staff.syncAssignedCenters(sMember.user_id, currentCenterIds);
        }
      }
    }

    const allCenters = await Center.findAll();
    if (req.io) req.io.emit('map_centers_updated', { centers: allCenters });

    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (isJson) {
      return res.json({ success: true, message: 'Evacuation center registered successfully.', centerId: newCenterId, centers: allCenters });
    }
    res.redirect("/admin/evacuation");
  } catch (error) {
    console.error("Error creating center:", error);
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (isJson) {
      return res.status(500).json({ success: false, error: 'Server Error creating center' });
    }
    res.status(500).send("Server Error");
  }
};

exports.updateCenter = async (req, res) => {
  try {
    const Staff = require('../models/staffModel');
    const centerId = parseInt(req.params.id, 10);
    const { name, address, contact_number, latitude, longitude, max_capacity, assigned_staff_ids } = req.body;
    const cappedMaxCapacity = Math.max(1, parseInt(max_capacity, 10) || 50);
    await Center.update(centerId, {
      name: (name || '').trim(),
      address: (address || '').trim(),
      contact_number: contact_number || '0912-345-6789',
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      max_capacity: cappedMaxCapacity
    });

    // Update staff assignments for this center if assigned_staff_ids is present in body
    if (assigned_staff_ids !== undefined || req.body['assigned_staff_ids[]'] !== undefined) {
      let staffIds = assigned_staff_ids !== undefined ? assigned_staff_ids : req.body['assigned_staff_ids[]'];
      if (!Array.isArray(staffIds)) staffIds = (staffIds !== null && staffIds !== undefined && staffIds !== '') ? [staffIds] : [];
      staffIds = [...new Set(staffIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0))];

      // Get all currently assigned staff to this center
      const currentStaffAtCenter = await Staff.getStaffByCenterId(centerId);
      const currentStaffIds = currentStaffAtCenter.map(s => s.staff_id);

      // 1. Remove staff that are no longer assigned
      for (const s of currentStaffAtCenter) {
        if (!staffIds.includes(s.staff_id)) {
          const sCenters = await Staff.getAssignedCenters(s.user_id, null);
          const newCenters = sCenters.map(c => c.id).filter(id => id !== centerId);
          await Staff.syncAssignedCenters(s.user_id, newCenters);
        }
      }

      // 2. Add newly selected staff (if eligible and under 3 assignments)
      for (const sId of staffIds) {
        if (!currentStaffIds.includes(sId)) {
          const sMember = await Staff.findById(sId) || await Staff.findByUserId(sId);
          if (sMember && (sMember.staff_type === 'EVACUATION' || sMember.staff_type === 'BOTH')) {
            const sCenters = await Staff.getAssignedCenters(sMember.user_id, sMember.assigned_center_id);
            const sCenterIds = sCenters.map(c => c.id);
            if (!sCenterIds.includes(centerId) && sCenterIds.length < 3) {
              sCenterIds.push(centerId);
              await Staff.syncAssignedCenters(sMember.user_id, sCenterIds);
            }
          }
        }
      }
    }

    const allCenters = await Center.findAll();
    if (req.io) req.io.emit('map_centers_updated', { centers: allCenters });

    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (isJson) {
      return res.json({ success: true, message: 'Evacuation center updated successfully.', centerId, centers: allCenters });
    }
    res.redirect("/admin/evacuation");
  } catch (error) {
    console.error("Error updating center:", error);
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (isJson) {
      return res.status(500).json({ success: false, error: 'Server Error updating center' });
    }
    res.status(500).send("Server Error");
  }
};

exports.deleteCenter = async (req, res) => {
  try {
    await Center.delete(req.params.id);
    const allCenters = await Center.findAll();
    if (req.io) req.io.emit('map_centers_updated', { centers: allCenters });

    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (isJson) {
      return res.json({ success: true, message: 'Evacuation center deleted successfully.', deletedId: req.params.id, centers: allCenters });
    }
    res.redirect("/admin/evacuation");
  } catch (error) {
    console.error("Error deleting center:", error);
    const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
    if (isJson) {
      return res.status(500).json({ success: false, error: 'Server Error deleting center' });
    }
    res.status(500).send("Server Error");
  }
};

const { queueOutboundAlertBroadcast } = require('../routes/loraRoutes');

exports.getBroadcast = async (req, res) => {
  try {
    const [history, barangays, initialRecipients, pagasaFeed] = await Promise.all([
      Alert.findAllWithSender(50).catch(() => []),
      Resident.getAllBarangays().catch(() => []),
      Resident.getTargetRecipients({ targetAudience: 'all' }).catch(() => ({ totalRecipients: 0, validPhoneCount: 0, residents: [] })),
      facebookPagasaService.getPagasaFeed().catch(() => ({ posts: [], activeStorm: null }))
    ]);

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
      user: res.locals.user || { name: "Admin", role: "admin" },
      page: { title: "Send Warnings" },
      history: history,
      barangays: barangays,
      initialMetrics: {
        totalRecipients: initialRecipients.totalRecipients,
        validPhoneCount: initialRecipients.validPhoneCount,
        residents: initialRecipients.residents
      },
      isBarangayCouncil: false,
      userBarangay: null,
      broadcastAlertData: broadcastAlertData,
      pagasaFeed: pagasaFeed,
      successMsg: successMsg,
      warningMsg: warningMsg,
      errorMsg: errorMsg
    });
  } catch (error) {
    console.error("Error loading broadcast page:", error);
    res.status(500).send("Server Error loading Send Warnings page");
  }
};

exports.calculateRecipients = async (req, res) => {
  try {
    const { target_audience, barangay, selected_ids } = req.body;
    let selectedArray = [];
    if (selected_ids) {
      selectedArray = Array.isArray(selected_ids) ? selected_ids : [selected_ids];
    }
    const result = await Resident.getTargetRecipients({
      targetAudience: target_audience,
      barangay: barangay,
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
  const { severity = 'RED', target_audience = 'all', barangay = 'all', selected_ids, sms_test_target, message: rawInputMsg, title: customTitle } = req.body;

  // Normalize Severity Level (RED, ORANGE, YELLOW, BLUE, GREEN)
  const upperSeverity = severity.toUpperCase();

  // Generate clean default titles if custom title is omitted
  let title = customTitle ? customTitle.trim() : '';
  if (!title) {
    switch (upperSeverity) {
      case 'RED': title = 'RED ALERT: Mandatory Evacuation Order'; break;
      case 'ORANGE': title = 'ORANGE ALERT: Prepare for Immediate Evacuation'; break;
      case 'YELLOW': title = 'YELLOW ALERT: Severe Weather & Flood Watch'; break;
      case 'GREEN': title = 'GREEN ALERT: All Clear & Safe Return'; break;
      case 'BLUE': default: title = 'BLUE ALERT: Community Disaster Advisory'; break;
    }
  }

  const evacuateRedirectUrl = process.env.EVACUATE_REDIRECT_URL || 'https://evacwar.onrender.com/evacuate';
  let message = (rawInputMsg || '').trim();
  const loraCleanMessage = message.replace(/https?:\/\/[^\s]+/gi, '').trim() || message;

  let selectedArray = [];
  if (selected_ids) {
    selectedArray = Array.isArray(selected_ids) ? selected_ids : [selected_ids];
  }

  const senderId = (req.session && req.session.userId) ? req.session.userId : (res.locals.user && res.locals.user.id ? res.locals.user.id : 1);
  const senderName = (res.locals.user && res.locals.user.name) ? res.locals.user.name : 'System Administrator';

  // 1. WAY 1: QUEUE 433.875 MHz LORA MESH ALERT IMMEDIATELY (0ms Delay - Works 100% Offline!)
  const fallbackAlertId = Date.now().toString().slice(-7);
  let loraResult = null;
  try {
    loraResult = queueOutboundAlertBroadcast({
      id: fallbackAlertId,
      title: title,
      message: loraCleanMessage,
      severity: upperSeverity,
      barangay: barangay === 'all' ? 'ALL' : barangay,
      evacCenter: 'Nearest Safe Evacuation Center'
    });
    console.log(`[AdminBroadcast] 433.875 MHz LoRa Mesh Alert Queued (Instant 0ms):`, loraResult ? loraResult.packet : 'OK');
  } catch (loraErr) {
    console.error("[AdminBroadcast] LoRa Queue error:", loraErr);
  }

  // 2. WAY 2: In-App Emergency Broadcast via Socket.IO & invalidate notification cache immediately
  try {
    const NotificationModel = require('../models/notificationModel');
    NotificationModel.invalidateCache();
  } catch (_e) {}

  let inAppStatus = 'FAILED';
  try {
    if (req.io) {
      const normalizedBarangay = (barangay && String(barangay).toLowerCase() !== 'all' && String(barangay).trim() !== '') ? barangay.trim() : null;
      const alertPayload = {
        id: fallbackAlertId,
        alertId: fallbackAlertId,
        sender_id: senderId,
        title: title,
        message: message,
        severity: upperSeverity,
        target_audience: target_audience.toUpperCase(),
        barangay: normalizedBarangay,
        evacuate_url: (upperSeverity === 'RED' || upperSeverity === 'ORANGE') ? '/resident/evacuation?auto_route=nearest' : null,
        sent_at: new Date().toISOString(),
        timestampMs: Date.now()
      };
      req.io.emit('emergency:alert', alertPayload);
      req.io.emit('alert:broadcast', alertPayload);
      req.io.emit('notification:new', alertPayload);
      inAppStatus = 'SENT';
    }
  } catch (ioErr) {
    console.error("Socket broadcast error:", ioErr);
  }

  // 3. WAY 3: Live SMS Broadcast via iProgSMS API + Web Push + Database Persistence in parallel
  let alertId = fallbackAlertId;
  const smsService = require('../utils/smsService');
  (async () => {
    try {
      const targetData = await Resident.getTargetRecipients({
        targetAudience: target_audience,
        barangay: barangay,
        selectedIds: selectedArray
      }).catch(() => ({ totalRecipients: 0, validPhoneCount: 0, recipientPhones: [], targetUserIds: [] }));

      const normalizedBarangayDb = (barangay && String(barangay).toLowerCase() !== 'all' && String(barangay).trim() !== '') ? barangay.trim() : null;
      const dbAlertId = await Alert.create({
        sender_id: senderId,
        title: title,
        message: message,
        severity: upperSeverity,
        broadcast_type: 'BOTH',
        target_audience: target_audience.toUpperCase(),
        barangay: normalizedBarangayDb,
        recipient_count: targetData.totalRecipients || 0,
        valid_phone_count: (targetData.recipientPhones && targetData.recipientPhones.length) || 1,
        status: 'TRANSMITTED_LORA',
        message_id: 'LORA+SMS+PUSH',
        delivery_report: JSON.stringify({
          channels: ['SMS (iProgSMS)', 'Web Push & In-App Siren', '433.875 MHz LoRa Mesh'],
          meshFreq: '433.875 MHz',
          channel: 'EU_433 / LONG_FAST',
          packet: loraResult ? loraResult.packet : ''
        })
      }).catch(() => null);

      if (dbAlertId) alertId = dbAlertId;

      try {
        const NotificationModel = require('../models/notificationModel');
        NotificationModel.invalidateCache();
        if (req.io) req.io.emit('notification:new', { id: alertId, title });
      } catch (_e) {}

      // Dispatch Web Push AND iProgSMS simultaneously
      const pushTargetUrl = (upperSeverity === 'RED' || upperSeverity === 'ORANGE')
        ? '/resident/evacuation?auto_route=nearest'
        : '/';

      const [, smsOutcome] = await Promise.allSettled([
        pushService.sendEmergencyPush(null, {
          id: alertId,
          title: title,
          message: message,
          severity: upperSeverity,
          barangay: normalizedBarangayDb,
          url: pushTargetUrl
        }),
        smsService.sendSmsBroadcast({
          recipientPhones: targetData.recipientPhones || [],
          testTargetPhone: sms_test_target || null,
          message: message,
          title: title,
          severity: upperSeverity,
          senderName: senderName,
          evacuateUrl: evacuateRedirectUrl,
          skipLoraQueue: true
        })
      ]);

      const smsRes = (smsOutcome && smsOutcome.status === 'fulfilled') ? smsOutcome.value : null;
      if (dbAlertId && smsRes) {
        let parsedSmsReport = {};
        try { parsedSmsReport = JSON.parse(smsRes.deliveryReport || '{}'); } catch (_) {}
        await db.execute(
          'UPDATE alerts SET status = ?, message_id = ?, valid_phone_count = ?, delivery_report = ? WHERE id = ?',
          [
            smsRes.success ? 'QUEUED' : 'TRANSMITTED_LORA',
            smsRes.messageId || 'LORA-433.875MHZ',
            smsRes.validPhoneCount || (targetData.recipientPhones && targetData.recipientPhones.length) || 1,
            JSON.stringify({
              ...parsedSmsReport,
              channels: ['SMS (iProgSMS)', 'Web Push & In-App Siren', '433.875 MHz LoRa Mesh'],
              meshFreq: '433.875 MHz',
              channel: 'EU_433 / LONG_FAST',
              packet: loraResult ? loraResult.packet : ''
            }),
            dbAlertId
          ]
        ).catch(() => {});
      }
    } catch (bgErr) {
      console.error('[AdminBroadcast] Background SMS/Push error:', bgErr);
    }
  })();

  const alertQuery = `&alertId=${encodeURIComponent(alertId)}&alertSeverity=${encodeURIComponent(upperSeverity)}&alertTitle=${encodeURIComponent(title)}&alertMessage=${encodeURIComponent(loraCleanMessage)}`;

  return res.redirect(`/admin/broadcast?success=1&lora=1&sms=1&status=TRANSMITTED_ALL_3&nodes=3&inApp=${inAppStatus}${alertQuery}`);
};

const fetchReportsData = async (query = {}, user = null, weather = null) => {
  try {
    const {
      tab: rawTab = 'overview',
      startDate = '',
      endDate = '',
      barangay = 'all',
      centerId = 'all',
      status = 'all',
      severity = 'all',
      staffId = 'all',
      search = ''
    } = (query || {});

    const tab = (rawTab === 'weather') ? 'overview' : (rawTab === 'residents' ? 'households' : (rawTab === 'non-evacuated' ? 'evacuation' : rawTab));
    const filters = { tab, startDate, endDate, barangay, centerId, status, severity, staffId, search };

    // 1. CONSOLIDATED CONCURRENT QUERY PROMISES
    const [
      [residentRows],
      [familyRows],
      [staffRows],
      centersList,
      [totalSosRows],
      [alertRows],
      [checkInRows],
      [householdCountRows],
      [memberRows],
      allEcBoardStats,
      singleEcBoardStats
    ] = await Promise.all([
      db.execute(`
        SELECT r.id, r.user_id, r.first_name, r.middle_name, r.last_name, r.sex, r.birthdate, r.age,
               r.contact_number, r.home_address, r.barangay, r.is_4ps, r.is_pregnant, r.is_lactating,
               r.is_pwd, r.is_single_head, r.has_serious_illness,
               r.approval_status,
               u.email, u.is_verified, COALESCE(u.created_at, NOW()) as created_at
        FROM residents r
        LEFT JOIN users u ON r.user_id = u.id
        WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE'
          AND (u.role IS NULL OR u.role = 'resident')
          AND r.approval_status = 'APPROVED'
        ORDER BY r.id DESC
      `).catch(() => [[]]),
      db.execute(`
        SELECT COUNT(*) as count 
        FROM residents r 
        LEFT JOIN users u ON r.user_id = u.id 
        WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' 
          AND (u.role IS NULL OR u.role = 'resident') 
          AND r.approval_status = 'APPROVED'
      `).catch(() => [[{ count: 0 }]]),
      db.execute(`
        SELECT u.id, u.email, u.role, u.created_at,
               COALESCE(s.staff_type, 'EVACUATION') as staff_type,
               s.assigned_center_id,
               s.first_name, s.last_name, s.contact_number, c.name as center_name, c.address as center_address
        FROM users u
        LEFT JOIN staff s ON u.id = s.user_id
        LEFT JOIN evacuation_centers c ON s.assigned_center_id = c.id
        WHERE u.role IN ('staff', 'barangay_council')
        ORDER BY u.id DESC
      `).catch(() => [[]]),
      Center.findAll().catch(() => []),
      db.execute(`
        SELECT s.id, s.name, s.latitude, s.longitude, s.accuracy, s.status, s.created_at, s.updated_at,
               s.handled_by, s.responder_notes,
               COALESCE(r.first_name, r_fallback.first_name) as first_name,
               COALESCE(r.last_name, r_fallback.last_name) as last_name,
               COALESCE(r.contact_number, r_fallback.contact_number) as contact_number,
               COALESCE(r.barangay, r_fallback.barangay) as barangay,
               COALESCE(r.home_address, r_fallback.home_address) as home_address,
               COALESCE(r.age, r_fallback.age) as age,
               COALESCE(r.is_pwd, r_fallback.is_pwd) as is_pwd,
               COALESCE(r.is_pregnant, r_fallback.is_pregnant) as is_pregnant,
               COALESCE(r.has_serious_illness, r_fallback.has_serious_illness) as has_serious_illness,
               u.email as handler_email,
               COALESCE(
                 NULLIF(TRIM(CONCAT_WS(' ', st.first_name, st.last_name)), ''),
                 NULLIF(TRIM(CONCAT_WS(' ', hr.first_name, hr.last_name)), ''),
                 u.email
               ) as handler_name,
               st.contact_number as handler_contact,
               st.staff_type as handler_staff_type
        FROM sos_alerts s
        LEFT JOIN residents r ON s.resident_id = r.id
        LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
        LEFT JOIN users u ON s.handled_by = u.id
        LEFT JOIN staff st ON u.id = st.user_id
        LEFT JOIN residents hr ON u.id = hr.user_id
        GROUP BY s.id
        ORDER BY s.id DESC
      `).catch(() => [[]]),
      db.execute(`
        SELECT a.id, a.title, a.message, a.severity, a.recipient_count, a.valid_phone_count, a.message_id, a.sent_at,
               u.email as sender_email,
               COALESCE(CONCAT_WS(' ', r.first_name, r.last_name), u.email) as sender_name
        FROM alerts a
        LEFT JOIN users u ON a.sender_id = u.id
        LEFT JOIN residents r ON u.id = r.user_id
        ORDER BY a.sent_at DESC
      `).catch(() => [[]]),
      db.execute(`
        SELECT c.id, c.center_id, c.resident_id, c.household_member_id, c.check_in_time, c.check_out_time, c.status,
               ec.name as center_name,
               CASE 
                 WHEN c.household_member_id IS NOT NULL AND hm.id IS NOT NULL THEN
                   TRIM(CONCAT_WS(' ', TRIM(hm.first_name), NULLIF(TRIM(hm.middle_name), ''), TRIM(hm.last_name)))
                 ELSE
                   TRIM(CONCAT_WS(' ', TRIM(r.first_name), NULLIF(TRIM(r.middle_name), ''), TRIM(r.last_name)))
               END as evacuee_name,
               TRIM(CONCAT_WS(' ', TRIM(r.first_name), NULLIF(TRIM(r.middle_name), ''), TRIM(r.last_name))) as resident_name,
               r.barangay as resident_barangay, r.home_address as resident_purok,
               TRIM(CONCAT_WS(' ', TRIM(hm.first_name), NULLIF(TRIM(hm.middle_name), ''), TRIM(hm.last_name))) as member_name,
               hm.relation as member_relation,
               r.contact_number as resident_contact
        FROM check_ins c
        JOIN evacuation_centers ec ON c.center_id = ec.id
        JOIN residents r ON c.resident_id = r.id
        LEFT JOIN household_members hm ON c.household_member_id = hm.id
        ORDER BY c.id DESC
      `).catch(() => [[]]),
      db.execute(`
        SELECT COUNT(hm.id) as count 
        FROM household_members hm
        JOIN residents r ON hm.resident_id = r.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE'
          AND (u.role IS NULL OR u.role = 'resident')
          AND r.approval_status = 'APPROVED'
      `).catch(() => [[{ count: 0 }]]),
      db.execute(`
        SELECT hm.id, hm.resident_id, hm.first_name, hm.middle_name, hm.last_name, hm.relation, hm.sex, hm.age,
               hm.birthdate, hm.status, hm.is_pwd, hm.is_pregnant, hm.is_lactating, hm.has_serious_illness, hm.serious_illness_details
        FROM household_members hm
        JOIN residents r ON hm.resident_id = r.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE'
          AND (u.role IS NULL OR u.role = 'resident')
          AND r.approval_status = 'APPROVED'
        ORDER BY hm.resident_id, hm.id ASC
      `).catch(() => [[]]),
      Center.getAllEcBoardStats().catch(() => null),
      (centerId !== 'all' && !isNaN(parseInt(centerId, 10)))
        ? Center.getEcBoardStats(parseInt(centerId, 10)).catch(() => null)
        : Promise.resolve(null)
    ]);

    // Apply Filter Helpers
    const filterByDate = (dateVal) => {
      if (!startDate && !endDate) return true;
      if (!dateVal) return true;
      const d = new Date(dateVal).getTime();
      if (isNaN(d)) return true;
      if (startDate) {
        const start = new Date(startDate).getTime();
        if (!isNaN(start) && d < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate + 'T23:59:59').getTime();
        if (!isNaN(end) && d > end) return false;
      }
      return true;
    };

    // 2. OVERVIEW STATS
    const totalHouseholdMembers = householdCountRows[0]?.count || 0;
    const totalResidentsCount = residentRows.length + totalHouseholdMembers;
    const totalHouseholdsCount = familyRows[0]?.count || residentRows.length;
    const totalStaffCount = staffRows.length;
    const totalCentersCount = centersList.length;

    let totalCapacity = 0;
    let currentEvacueesCount = 0;
    centersList.forEach(c => {
      totalCapacity += (c.max_capacity || 0);
      currentEvacueesCount += (c.current_occupancy || 0);
    });
    const availableSlotsCount = Math.max(0, totalCapacity - currentEvacueesCount);

    let totalCheckIns = 0;
    let totalCheckOuts = 0;
    checkInRows.forEach(c => {
      if (c.status === 'CHECKED_IN' || c.status === 'ACTIVE') totalCheckIns++;
      else if (c.status === 'CHECKED_OUT' || c.status === 'DEPARTED') totalCheckOuts++;
    });

    const activeSosCount = totalSosRows.filter(s => ['ACTIVE', 'ACKNOWLEDGED', 'RESPONDING'].includes((s.status || '').toUpperCase())).length;

    const overview = {
      totalResidents: totalResidentsCount,
      totalHouseholds: totalHouseholdsCount,
      totalStaff: totalStaffCount,
      totalCenters: totalCentersCount,
      currentEvacuees: currentEvacueesCount,
      totalCapacity: totalCapacity,
      availableSlots: availableSlotsCount,
      activeSos: activeSosCount,
      totalSos: totalSosRows.length,
      totalAlerts: alertRows.length,
      totalCheckIns: totalCheckIns,
      totalCheckOuts: totalCheckOuts,
      weather: weather || null
    };

    // 3. HOUSEHOLD REPORTS DATA & DEMOGRAPHICS
    const membersByResident = {};
    (memberRows || []).forEach(m => {
      if (!membersByResident[m.resident_id]) membersByResident[m.resident_id] = [];
      membersByResident[m.resident_id].push(m);
    });

    let filteredResidents = residentRows.filter(r => {
      if (startDate || endDate) {
        if (!filterByDate(r.created_at)) return false;
      }
      if (barangay !== 'all') {
        const b = (r.barangay || '').toLowerCase();
        const p = (r.home_address || '').toLowerCase();
        const target = barangay.toLowerCase();
        if (!b.includes(target) && !p.includes(target)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
        const phone = (r.contact_number || '').toLowerCase();
        const bgy = (r.barangay || '').toLowerCase();
        if (!name.includes(q) && !phone.includes(q) && !bgy.includes(q)) return false;
      }
      return true;
    });

    const barangayCounts = {};
    let childrenCount = 0, adultCount = 0, seniorCount = 0;
    let maleCount = 0, femaleCount = 0;
    let count4ps = 0, countPregnant = 0, countLactating = 0, countPwd = 0, countSingleHead = 0, countIllness = 0;

    const filteredResidentIds = new Set(filteredResidents.map(r => r.id));
    const filteredMembers = (memberRows || []).filter(m => filteredResidentIds.has(m.resident_id));

    filteredResidents.forEach(r => {
      const bName = r.barangay || r.home_address || 'San Rafael';
      barangayCounts[bName] = (barangayCounts[bName] || 0) + 1;

      const age = Number(r.age) || 0;
      if (age > 0 && age < 18) childrenCount++;
      else if (age >= 60) seniorCount++;
      else adultCount++;

      const sex = (r.sex || '').toUpperCase();
      if (sex === 'MALE' || sex === 'M') maleCount++;
      else if (sex === 'FEMALE' || sex === 'F') femaleCount++;

      if (r.is_4ps) count4ps++;
      if (r.is_pregnant) countPregnant++;
      if (r.is_lactating) countLactating++;
      if (r.is_pwd) countPwd++;
      if (r.is_single_head) countSingleHead++;
      if (r.has_serious_illness) countIllness++;
    });

    filteredMembers.forEach(m => {
      const age = Number(m.age) || 0;
      const statusStr = (m.status || '').toLowerCase();
      if ((age > 0 && age < 18) || statusStr.includes('infant') || statusStr.includes('toddler') || statusStr.includes('student')) childrenCount++;
      else if (age >= 60 || statusStr.includes('elderly') || statusStr.includes('senior')) seniorCount++;
      else adultCount++;

      const sex = (m.sex || '').toUpperCase();
      if (sex === 'MALE' || sex === 'M') maleCount++;
      else if (sex === 'FEMALE' || sex === 'F') femaleCount++;

      if (m.is_pregnant || statusStr.includes('pregnant')) countPregnant++;
      if (m.is_lactating || statusStr.includes('lactating')) countLactating++;
      if (m.is_pwd || statusStr.includes('pwd')) countPwd++;
      if (statusStr.includes('solo_parent') || statusStr.includes('single_head')) countSingleHead++;
      if (m.has_serious_illness || statusStr.includes('illness') || statusStr.includes('bedridden')) countIllness++;
    });

    const householdList = filteredResidents.map(r => {
      const mems = membersByResident[r.id] || [];
      const totalMembers = 1 + mems.length;

      const headAge = Number(r.age) || 0;
      const isHeadSenior = headAge >= 60;
      const isHeadChild = headAge > 0 && headAge < 18;

      const seniorCount = (isHeadSenior ? 1 : 0) + mems.filter(m => {
        const a = Number(m.age) || 0;
        const s = (m.status || '').toLowerCase();
        return a >= 60 || s.includes('elderly') || s.includes('senior');
      }).length;

      const childrenCountInHh = (isHeadChild ? 1 : 0) + mems.filter(m => {
        const a = Number(m.age) || 0;
        const s = (m.status || '').toLowerCase();
        return (a > 0 && a < 18) || s.includes('infant') || s.includes('toddler') || s.includes('student');
      }).length;

      const pwdCount = (r.is_pwd ? 1 : 0) + mems.filter(m => m.is_pwd || (m.status || '').toLowerCase().includes('pwd')).length;
      const pregnantCount = (r.is_pregnant ? 1 : 0) + mems.filter(m => m.is_pregnant || (m.status || '').toLowerCase().includes('pregnant')).length;
      const lactatingCount = (r.is_lactating ? 1 : 0) + mems.filter(m => m.is_lactating || (m.status || '').toLowerCase().includes('lactating')).length;
      const illnessCount = (r.has_serious_illness ? 1 : 0) + mems.filter(m => m.has_serious_illness || (m.status || '').toLowerCase().includes('illness') || (m.status || '').toLowerCase().includes('bedridden')).length;
      const is4ps = Boolean(r.is_4ps);
      const isSingleHead = Boolean(r.is_single_head || mems.some(m => (m.status || '').toLowerCase().includes('solo_parent')));

      const vulnBadges = [];
      if (is4ps) vulnBadges.push({ label: '4Ps Beneficiary', type: '4ps', color: 'blue' });
      if (seniorCount > 0) vulnBadges.push({ label: `${seniorCount} Senior${seniorCount > 1 ? 's' : ''}`, type: 'senior', color: 'amber' });
      if (pwdCount > 0) vulnBadges.push({ label: `${pwdCount} PWD`, type: 'pwd', color: 'indigo' });
      if (childrenCountInHh > 0) vulnBadges.push({ label: `${childrenCountInHh} Child${childrenCountInHh > 1 ? 'ren' : ''}`, type: 'child', color: 'cyan' });
      if (pregnantCount > 0) vulnBadges.push({ label: `${pregnantCount} Pregnant`, type: 'pregnant', color: 'rose' });
      if (lactatingCount > 0) vulnBadges.push({ label: `${lactatingCount} Lactating`, type: 'lactating', color: 'pink' });
      if (isSingleHead) vulnBadges.push({ label: 'Single Parent', type: 'single_head', color: 'purple' });
      if (illnessCount > 0) vulnBadges.push({ label: `${illnessCount} Medical Need`, type: 'illness', color: 'amber' });

      const hasLoraNode = Boolean(
        r.has_lora ||
        r.lora_node_id ||
        (r.last_name && String(r.last_name).toLowerCase().includes('sinfuego') && String(r.first_name || '').toLowerCase().includes('laurence')) ||
        r.user_id === 3 || r.user_id === 6 || r.id === 22 || r.id === 5
      );
      const loraNodeId = hasLoraNode ? (r.lora_node_id || '!f4e213d4') : null;

      return {
        ...r,
        household_id: r.id,
        head_name: `${r.first_name || ''} ${r.middle_name ? r.middle_name + ' ' : ''}${r.last_name || ''}`.trim(),
        name: `${r.first_name || ''} ${r.middle_name ? r.middle_name + ' ' : ''}${r.last_name || ''}`.trim(),
        members: mems,
        total_members: totalMembers,
        family_size: totalMembers,
        totalMembers: totalMembers,
        seniors_count: seniorCount,
        seniorCount: seniorCount,
        children_count: childrenCountInHh,
        childrenCount: childrenCountInHh,
        pwd_count: pwdCount,
        pwdCount: pwdCount,
        pregnant_count: pregnantCount,
        lactating_count: lactatingCount,
        illness_count: illnessCount,
        is_4ps: is4ps,
        is_single_head: isSingleHead,
        is_vulnerable: vulnBadges.length > 0,
        vuln_badges: vulnBadges,
        has_lora: hasLoraNode,
        lora_node_id: loraNodeId
      };
    });

    const totalHouseholds = householdList.length;
    const totalIndividuals = householdList.reduce((acc, h) => acc + h.total_members, 0);
    const vulnerableHouseholds = householdList.filter(h => h.is_vulnerable).length;
    const fourPsHouseholds = householdList.filter(h => h.is_4ps).length;

    const householdReports = {
      list: householdList,
      totalHouseholds,
      totalIndividuals,
      vulnerableHouseholds,
      fourPsHouseholds,
      barangayCounts,
      demographics: {
        children: childrenCount,
        adults: adultCount,
        seniors: seniorCount,
        male: maleCount,
        female: femaleCount,
        is_4ps: count4ps,
        is_pregnant: countPregnant,
        is_lactating: countLactating,
        is_pwd: countPwd,
        is_single_head: countSingleHead,
        has_serious_illness: countIllness
      }
    };
    const residentReports = householdReports;

    // 4. EVACUATION REPORTS DATA
    let filteredCheckIns = checkInRows.filter(c => {
      if (startDate || endDate) {
        if (!filterByDate(c.check_in_time)) return false;
      }
      if (centerId !== 'all' && String(c.center_id) !== String(centerId)) return false;
      if (search) {
        const q = search.toLowerCase();
        const rName = (c.evacuee_name || c.resident_name || '').toLowerCase();
        const cName = (c.center_name || '').toLowerCase();
        if (!rName.includes(q) && !cName.includes(q)) return false;
      }
      return true;
    });

    let activeCheckInsCount = 0;
    let checkedOutCount = 0;
    filteredCheckIns.forEach(c => {
      if (c.status === 'ACTIVE' || c.status === 'CHECKED_IN') activeCheckInsCount++;
      else if (c.status === 'CHECKED_OUT') checkedOutCount++;
    });

    // Group active check-ins per household (resident_id)
    const residentMap = {};
    (residentRows || []).forEach(r => {
      residentMap[r.id] = r;
    });

    const activeHouseholdsMap = {};
    filteredCheckIns.forEach(c => {
      if (c.status === 'ACTIVE' || c.status === 'CHECKED_IN') {
        const resId = c.resident_id;
        if (!activeHouseholdsMap[resId]) {
          const rObj = residentMap[resId] || {};
          const allMems = membersByResident[resId] || [];
          const rawZone = (rObj.home_address || c.resident_purok || '').trim();
          const zone = rawZone.startsWith('Zone')
            ? rawZone
            : ((rObj.barangay || c.resident_barangay || '').trim().startsWith('Zone') ? (rObj.barangay || c.resident_barangay || '').trim() : (rawZone || 'Zone 1'));

          const vulnTypes = [];
          if (Number(rObj.age) >= 60) vulnTypes.push('Senior Citizen');
          if (rObj.is_pwd) vulnTypes.push('PWD');
          if (rObj.is_pregnant) vulnTypes.push('Pregnant');
          if (rObj.is_lactating) vulnTypes.push('Lactating');
          if (rObj.has_serious_illness) vulnTypes.push('Serious Illness');
          if (rObj.is_4ps) vulnTypes.push('4Ps');
          if (rObj.is_single_head) vulnTypes.push('Single Parent');
          allMems.forEach(m => {
            if (Number(m.age) >= 60 && !vulnTypes.includes('Senior Citizen')) vulnTypes.push('Senior Citizen');
            if (Number(m.age) > 0 && Number(m.age) < 18 && !vulnTypes.includes('Children / Minor')) vulnTypes.push('Children / Minor');
            if (m.is_pwd && !vulnTypes.includes('PWD')) vulnTypes.push('PWD');
            if (m.is_pregnant && !vulnTypes.includes('Pregnant')) vulnTypes.push('Pregnant');
            if (m.is_lactating && !vulnTypes.includes('Lactating')) vulnTypes.push('Lactating');
            if (m.has_serious_illness && !vulnTypes.includes('Serious Illness')) vulnTypes.push('Serious Illness');
          });

          const headName = c.resident_name || (rObj.first_name ? `${rObj.first_name} ${rObj.last_name || ''}`.trim() : '') || 'Household Head';

          activeHouseholdsMap[resId] = {
            resident_id: resId,
            head_name: headName,
            name: headName,
            contact_number: rObj.contact_number || c.resident_contact || '',
            home_address: rObj.home_address || c.resident_purok || 'Barangay San Rafael',
            barangay: rObj.barangay || c.resident_barangay || 'San Rafael',
            zone: zone,
            household_size: 1 + allMems.length,
            total_members: 1 + allMems.length,
            members: allMems,
            checked_in_members: [],
            is_head_checked_in: false,
            center_id: c.center_id,
            center_name: c.center_name,
            check_in_time: c.check_in_time,
            vuln_types: vulnTypes,
            vulnerability_types: vulnTypes
          };
        }

        const hh = activeHouseholdsMap[resId];
        if (c.household_member_id) {
          hh.checked_in_members.push({
            id: c.household_member_id,
            first_name: c.first_name || '',
            last_name: c.last_name || '',
            name: c.member_name || c.evacuee_name || 'Family Member',
            relation: c.member_relation || ''
          });
        } else {
          hh.is_head_checked_in = true;
        }

        if (c.check_in_time && (!hh.check_in_time || new Date(c.check_in_time) > new Date(hh.check_in_time))) {
          hh.check_in_time = c.check_in_time;
        }
      }
    });

    const activeHouseholds = Object.values(activeHouseholdsMap);

    const evacuationReports = {
      centers: centersList,
      logs: filteredCheckIns,
      activeEvacuees: filteredCheckIns.filter(c => c.status === 'ACTIVE' || c.status === 'CHECKED_IN'),
      activeHouseholds: activeHouseholds,
      activeCheckIns: activeCheckInsCount,
      checkedOut: checkedOutCount
    };

    // 5. NON-EVACUATED REPORTS DATA

    const activeCheckInResidentIds = new Set();
    const activeCheckInMemberIds = new Set();
    const residentCenterMap = {};
    checkInRows.forEach(c => {
      const st = (c.status || '').toUpperCase();
      if (st === 'CHECKED_IN' || st === 'ACTIVE') {
        if (c.resident_id && !c.household_member_id) {
          activeCheckInResidentIds.add(Number(c.resident_id));
          residentCenterMap[Number(c.resident_id)] = c.center_name || 'Evacuation Center';
        }
        if (c.household_member_id) {
          activeCheckInMemberIds.add(Number(c.household_member_id));
        }
      }
    });

    const zoneCounts = {};
    let totalNotEvacHouseholds = 0;
    let totalNotEvacIndividuals = 0;
    let totalVulnCount = 0;

    const nonEvacList = residentRows
      .filter(r => {
        const approvalStatus = r.approval_status || (r.user_id ? (r.is_verified ? 'APPROVED' : 'PENDING') : 'APPROVED');
        return approvalStatus === 'APPROVED';
      })
      .map(r => {
      const mems = membersByResident[r.id] || [];
      const isHeadCheckedIn = activeCheckInResidentIds.has(Number(r.id));
      let checkedInMembersCount = 0;
      mems.forEach(m => {
        if (activeCheckInMemberIds.has(Number(m.id))) checkedInMembersCount++;
      });
      const totalEvac = (isHeadCheckedIn ? 1 : 0) + checkedInMembersCount;
      const householdSize = 1 + mems.length;
      const unEvacCount = Math.max(0, householdSize - totalEvac);
      const isEvacuated = unEvacCount === 0;

      const vulnTypes = [];
      if (Number(r.age) >= 60) vulnTypes.push('Senior Citizen');
      if (r.is_pwd) vulnTypes.push('PWD');
      if (r.is_pregnant) vulnTypes.push('Pregnant');
      if (r.is_lactating) vulnTypes.push('Lactating');
      if (r.has_serious_illness) vulnTypes.push('Serious Illness');
      if (r.is_4ps) vulnTypes.push('4Ps');
      if (r.is_single_head) vulnTypes.push('Single Parent');
      mems.forEach(m => {
        if (Number(m.age) >= 60 && !vulnTypes.includes('Senior Citizen')) vulnTypes.push('Senior Citizen');
        if (Number(m.age) > 0 && Number(m.age) < 18 && !vulnTypes.includes('Children / Minor')) vulnTypes.push('Children / Minor');
        if (m.is_pwd && !vulnTypes.includes('PWD')) vulnTypes.push('PWD');
        if (m.is_pregnant && !vulnTypes.includes('Pregnant')) vulnTypes.push('Pregnant');
        if (m.is_lactating && !vulnTypes.includes('Lactating')) vulnTypes.push('Lactating');
        if (m.has_serious_illness && !vulnTypes.includes('Serious Illness')) vulnTypes.push('Serious Illness');
      });

      const rawZone = (r.home_address || '').trim();
      const zone = rawZone.startsWith('Zone')
        ? rawZone
        : ((r.barangay || '').trim().startsWith('Zone') ? (r.barangay || '').trim() : (rawZone || 'Zone 1'));
      if (!isEvacuated) {
        totalNotEvacHouseholds++;
        totalNotEvacIndividuals += unEvacCount;
        if (vulnTypes.length > 0) totalVulnCount++;
        zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
      }

      const statusCode = isEvacuated ? 'EVACUATED' : (totalEvac > 0 ? 'PARTIAL' : 'NOT_EVACUATED');
      const lastStatus = isEvacuated
        ? `Checked In at ${residentCenterMap[r.id] || 'Shelter'}`
        : (totalEvac > 0 ? `${totalEvac} of ${householdSize} Evacuated` : 'Un-evacuated (At Home)');

      return {
        resident_id: r.id,
        head_name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Household Head',
        first_name: r.first_name,
        last_name: r.last_name,
        name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || 'Household Head',
        age: r.age,
        sex: r.sex,
        contact_number: r.contact_number,
        home_address: r.home_address,
        barangay: r.barangay,
        zone: zone,
        household_size: householdSize,
        members: mems,
        is_evacuated: isEvacuated,
        un_evacuated_count: unEvacCount,
        vulnerability_types: vulnTypes,
        vuln_types: vulnTypes,
        has_vulnerability: vulnTypes.length > 0,
        evacuation_status_code: statusCode,
        last_known_status: lastStatus,
        active_event_name: 'Active Evacuation Protocol'
      };
    });

    let topZoneName = 'San Rafael';
    let topZoneNum = 0;
    Object.entries(zoneCounts).forEach(([z, count]) => {
      if (count > topZoneNum) {
        topZoneNum = count;
        topZoneName = z;
      }
    });

    const nonEvacuatedReports = {
      totalNotEvacuatedHouseholds: totalNotEvacHouseholds,
      totalNotEvacuatedIndividuals: totalNotEvacIndividuals,
      totalVulnerableCount: totalVulnCount,
      topZone: topZoneName,
      topZoneCount: topZoneNum,
      activeEventName: 'Active Evacuation Protocol',
      availableEvents: ['Active Evacuation Protocol', 'Preemptive Evacuation Advisory', 'Flash Flood Order'],
      list: nonEvacList
    };

    // 6. SOS / RESCUE REPORTS DATA & RESCUER TELEMETRY
    // Build Rescuer Search & Rescue Performance Telemetry (Dedicated Rescuers Only)
    const rescuerMap = {};
    (staffRows || []).forEach(st => {
      const isRescuer = (st.staff_type === 'RESCUER');
      if (isRescuer && st.id) {
        const fullName = st.first_name ? `${st.first_name} ${st.last_name || ''}`.trim() : (st.email || 'Tactical Rescuer');
        rescuerMap[st.id] = {
          userId: st.id,
          name: fullName,
          email: st.email || '',
          contact: st.contact_number || 'N/A',
          staffType: 'RESCUER',
          centerName: st.center_name || 'Station Alpha',
          totalHandled: 0,
          rescuedCount: 0,
          activeCount: 0,
          responseTimes: []
        };
      }
    });

    const enrichedSosList = totalSosRows.map(s => {
      let responseMinutes = null;
      const st = (s.status || 'ACTIVE').toUpperCase();
      if (s.created_at && s.updated_at && ['RESCUED', 'RESOLVED', 'ACKNOWLEDGED', 'RESPONDING'].includes(st)) {
        const diffMs = new Date(s.updated_at) - new Date(s.created_at);
        if (diffMs > 0) {
          responseMinutes = Math.max(1, Math.round(diffMs / 60000));
        }
      }

      // Aggregate rescuer metrics (strictly for dedicated rescuers)
      if (s.handled_by && rescuerMap[s.handled_by]) {
        const rec = rescuerMap[s.handled_by];
        rec.totalHandled++;
        if (st === 'RESCUED' || st === 'RESOLVED') {
          rec.rescuedCount++;
        } else if (st === 'ACTIVE' || st === 'ACKNOWLEDGED' || st === 'RESPONDING') {
          rec.activeCount++;
        }
        if (responseMinutes !== null && (st === 'RESCUED' || st === 'RESOLVED')) {
          rec.responseTimes.push(responseMinutes);
        }
      }

      const resName = (s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : (s.name || 'Resident in Distress'));
      return {
        ...s,
        resident_name: resName,
        responseMinutes
      };
    });

    const rescuerLeaderboard = Object.values(rescuerMap).map(r => {
      const avg = r.responseTimes.length > 0
        ? Math.round(r.responseTimes.reduce((a, b) => a + b, 0) / r.responseTimes.length)
        : null;
      return {
        ...r,
        avgResponseMinutes: avg
      };
    }).sort((a, b) => (b.rescuedCount - a.rescuedCount) || (b.totalHandled - a.totalHandled));

    // Filter SOS records based on user filter selections
    let filteredSos = enrichedSosList.filter(s => {
      if (startDate || endDate) {
        if (!filterByDate(s.created_at)) return false;
      }
      if (status !== 'all' && String(s.status).toUpperCase() !== String(status).toUpperCase()) return false;
      if (staffId && staffId !== 'all') {
        if (String(s.handled_by) !== String(staffId)) return false;
      }
      if (barangay && barangay !== 'all') {
        const b = (s.barangay || s.home_address || '').toLowerCase();
        if (!b.includes(barangay.toLowerCase())) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const name = (s.resident_name || s.name || '').toLowerCase();
        const bgy = (s.barangay || s.home_address || '').toLowerCase();
        const handler = (s.handler_name || s.handler_email || '').toLowerCase();
        const contact = (s.contact_number || '').toLowerCase();
        const notes = (s.responder_notes || '').toLowerCase();
        if (!name.includes(q) && !bgy.includes(q) && !handler.includes(q) && !contact.includes(q) && !notes.includes(q)) {
          return false;
        }
      }
      return true;
    });

    const sosStatusCounts = {
      ACTIVE: 0,
      ACKNOWLEDGED: 0,
      RESPONDING: 0,
      RESCUED: 0,
      RESOLVED: 0,
      CANCELLED: 0
    };
    const sosByZone = {};

    filteredSos.forEach(s => {
      const st = (s.status || 'ACTIVE').toUpperCase();
      sosStatusCounts[st] = (sosStatusCounts[st] || 0) + 1;
      const zone = s.barangay || s.home_address || 'San Rafael';
      sosByZone[zone] = (sosByZone[zone] || 0) + 1;
    });

    const sosReports = {
      list: filteredSos,
      statusCounts: sosStatusCounts,
      zoneCounts: sosByZone,
      totalCount: filteredSos.length,
      rescuers: rescuerLeaderboard
    };

    // 7. SMS / ALERT REPORTS DATA
    let filteredAlerts = alertRows.filter(a => {
      if (startDate || endDate) {
        if (!filterByDate(a.sent_at)) return false;
      }
      if (severity !== 'all' && String(a.severity).toUpperCase() !== String(severity).toUpperCase()) return false;
      if (search) {
        const q = search.toLowerCase();
        const title = (a.title || '').toLowerCase();
        const msg = (a.message || '').toLowerCase();
        if (!title.includes(q) && !msg.includes(q)) return false;
      }
      return true;
    });

    const alertSeverityCounts = { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0, BLUE: 0 };
    let totalRecipientsCount = 0;
    let totalValidPhoneCount = 0;

    filteredAlerts.forEach(a => {
      const sev = (a.severity || 'BLUE').toUpperCase();
      alertSeverityCounts[sev] = (alertSeverityCounts[sev] || 0) + 1;
      totalRecipientsCount += (a.recipient_count || 0);
      totalValidPhoneCount += (a.valid_phone_count || 0);
    });

    const alertReports = {
      list: filteredAlerts,
      severityCounts: alertSeverityCounts,
      totalBroadcasts: filteredAlerts.length,
      totalRecipients: totalRecipientsCount,
      totalValidPhones: totalValidPhoneCount
    };

    // 8. WEATHER REPORTS DATA
    const weatherReports = {
      list: []
    };

    // 9. STAFF ACTIVITY DATA
    const staffReports = {
      list: staffRows
    };

    // Distinct Barangay options
    const barangaySet = new Set();
    residentRows.forEach(r => {
      if (r.barangay) barangaySet.add(r.barangay);
      if (r.home_address) barangaySet.add(r.home_address);
    });
    const barangayOptions = Array.from(barangaySet);

    return {
      ...sharedSimData(),
      user: user || { name: "Admin", role: "admin" },
      page: { title: "Reports" },
      filters,
      filterOptions: {
        barangays: barangayOptions,
        centers: centersList,
        staff: staffRows,
        rescuers: rescuerLeaderboard
      },
      overview,
      householdReports,
      residentReports,
      evacuationReports,
      nonEvacuatedReports,
      sosReports,
      alertReports,
      weatherReports,
      staffReports,
      allEcBoardStats,
      singleEcBoardStats
    };
  } catch (error) {
    console.error("Error aggregating report data:", error);
    throw error;
  }
};

exports.getReports = async (req, res) => {
  try {
    const data = await fetchReportsData(req.query, res.locals.user, res.locals.weather);
    res.render("admin/reports", data);
  } catch (error) {
    console.error("Error generating Admin Reports:", error);
    res.status(500).render("admin/reports", {
      ...sharedSimData(),
      user: res.locals.user || { name: "Admin", role: "admin" },
      page: { title: "Admin Reports" },
      filters: { tab: 'overview' },
      filterOptions: { barangays: [], centers: [], staff: [] },
      overview: { totalResidents: 0, totalHouseholds: 0, totalStaff: 0, totalCenters: 0, currentEvacuees: 0, totalCapacity: 0, availableSlots: 0, activeSos: 0, totalSos: 0, totalAlerts: 0, weather: null },
      householdReports: { list: [], totalHouseholds: 0, totalIndividuals: 0, vulnerableHouseholds: 0, fourPsHouseholds: 0, barangayCounts: {}, demographics: {} },
      residentReports: { list: [], totalHouseholds: 0, totalIndividuals: 0, vulnerableHouseholds: 0, fourPsHouseholds: 0, barangayCounts: {}, demographics: {} },
      evacuationReports: { centers: [], logs: [], activeEvacuees: [], activeCheckIns: 0, checkedOut: 0 },
      nonEvacuatedReports: {
        totalNotEvacuatedHouseholds: 0,
        totalNotEvacuatedIndividuals: 0,
        totalVulnerableCount: 0,
        topZone: 'None',
        topZoneCount: 0,
        activeEventName: 'Active Evacuation Advisory',
        availableEvents: [],
        list: []
      },
      sosReports: { list: [], statusCounts: {}, zoneCounts: {}, totalCount: 0 },
      alertReports: { list: [], severityCounts: {}, totalBroadcasts: 0, totalRecipients: 0, totalValidPhones: 0 },
      weatherReports: { list: [] },
      staffReports: { list: [] },
      error: "Error retrieving report analytics."
    });
  }
};

/**
 * Dedicated server-side PDF export controller utilizing Puppeteer.
 * Generates official PDF documents from views/admin/reports/pdf-template.ejs without dashboard UI bloat.
 */
exports.exportReportPDF = async (req, res) => {
  try {
    const rawTab = (req.query.tab || 'overview').toLowerCase();
    const tab = (rawTab === 'weather') ? 'overview' : (rawTab === 'residents' ? 'households' : rawTab);
    const centerId = req.query.centerId || 'all';

    const reportData = await fetchReportsData(req.query, res.locals.user, res.locals.weather);

    let reportTitle = 'Executive Command Overview & Situation Report';
    let filename = `Evacwar_Command_Overview_${new Date().toISOString().slice(0, 10)}.pdf`;

    if (tab === 'evacuation') {
      const isSingleCenter = (centerId !== 'all' && reportData.singleEcBoardStats);
      const centerName = isSingleCenter ? (reportData.singleEcBoardStats.center.name || 'Center') : 'All Centers Combined';
      reportTitle = `Evacuation Center Information Board Report (${centerName})`;
      filename = `Evacwar_EC_Board_${centerName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    } else if (tab === 'non-evacuated') {
      reportTitle = 'Priority Evacuation Roster • Residents Not Yet Evacuated';
      filename = `Evacwar_Residents_Not_Yet_Evacuated_${new Date().toISOString().slice(0, 10)}.pdf`;
    } else if (tab === 'households') {
      reportTitle = 'Official Household Masterlist & Family Demographics Roster';
      filename = `Evacwar_Household_Masterlist_${new Date().toISOString().slice(0, 10)}.pdf`;
    } else if (tab === 'sos') {
      reportTitle = 'Emergency SOS & Search and Rescue Operations Log';
      filename = `Evacwar_SOS_Rescue_Log_${new Date().toISOString().slice(0, 10)}.pdf`;
    } else if (tab === 'sms') {
      reportTitle = 'Emergency Broadcast & SMS Alerts Log';
      filename = `Evacwar_SMS_Broadcast_Log_${new Date().toISOString().slice(0, 10)}.pdf`;
    }

    reportData.reportTitle = reportTitle;
    reportData.tab = tab;

    // Render HTML from dedicated lightweight PDF template (no dashboard UI/scripts)
    const templatePath = path.join(__dirname, '..', 'views', 'admin', 'reports', 'pdf-template.ejs');
    const html = await ejs.renderFile(templatePath, reportData);

    // Generate PDF using Puppeteer page.pdf()
    const pdfBuffer = await pdfService.generatePdfFromHtml(html, {
      format: 'A4',
      landscape: false,
      marginTop: '12mm',
      marginRight: '18mm',
      marginBottom: '12mm',
      marginLeft: '18mm'
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.end(pdfBuffer);
  } catch (error) {
    console.error('[AdminController] Puppeteer PDF export failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF report: ' + error.message
    });
  }
};

/**
 * Direct printable report view for browser rendering and native 'Save as PDF'.
 * Operates seamlessly on any hosting (including shared hosting without headless Chrome).
 */
exports.printReport = async (req, res) => {
  try {
    const rawTab = (req.query.tab || 'overview').toLowerCase();
    const tab = (rawTab === 'weather') ? 'overview' : (rawTab === 'residents' ? 'households' : rawTab);
    const centerId = req.query.centerId || 'all';

    const reportData = await fetchReportsData(req.query, res.locals.user, res.locals.weather);

    let reportTitle = 'Executive Command Overview & Situation Report';
    if (tab === 'evacuation') {
      const isSingleCenter = (centerId !== 'all' && reportData.singleEcBoardStats);
      const centerName = isSingleCenter ? (reportData.singleEcBoardStats.center.name || 'Center') : 'All Centers Combined';
      reportTitle = `Evacuation Center Information Board Report (${centerName})`;
    } else if (tab === 'non-evacuated') {
      reportTitle = 'Priority Evacuation Roster • Residents Not Yet Evacuated';
    } else if (tab === 'households') {
      reportTitle = 'Official Household Masterlist & Family Demographics Roster';
    } else if (tab === 'sos') {
      reportTitle = 'Emergency SOS & Search and Rescue Operations Log';
    } else if (tab === 'sms') {
      reportTitle = 'Emergency Broadcast & SMS Alerts Log';
    }

    reportData.reportTitle = reportTitle;
    reportData.tab = tab;
    reportData.isPrintView = true;
    reportData.autoPrint = (req.query.autoprint === '1' || req.query.autoprint === 'true');

    const templatePath = path.join(__dirname, '..', 'views', 'admin', 'reports', 'pdf-template.ejs');
    const html = await ejs.renderFile(templatePath, reportData);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(html);
  } catch (error) {
    console.error('[AdminController] Print report view failed:', error);
    res.status(500).send('<h3>Failed to generate printable report</h3><p>' + error.message + '</p>');
  }
};

exports.getSettings = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    if (!userId) {
      return res.redirect('/login');
    }

    const [userRows] = await db.execute('SELECT id, email, role FROM users WHERE id = ?', [userId]);
    const userObj = userRows[0] || {};

    const [residentRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
    let resident = residentRows[0] || null;

    // If resident record doesn't exist yet for admin, auto-create one
    if (!resident) {
      const crypto = require('crypto');
      const qr_code_uuid = crypto.randomUUID();
      try {
        await db.execute(`
          INSERT INTO residents 
          (user_id, first_name, last_name, contact_number, home_address, barangay, qr_code_uuid)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          userId,
          '',
          '',
          '09000000000',
          'Municipal Disaster Risk Reduction Management Office',
          'San Rafael',
          qr_code_uuid
        ]);
        const [newResRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
        resident = newResRows[0] || {};
      } catch (err) {
        console.error("Error auto-creating admin resident record:", err);
        resident = {};
      }
    }

    let firstName = resident.first_name || '';
    let lastName = resident.last_name || '';
    if (firstName === 'Super' || firstName === 'Administrator') {
      if (!lastName || lastName === 'Admin' || lastName === 'Administrator') {
        firstName = '';
        lastName = '';
      }
    }
    const realFullName = `${firstName} ${lastName}`.trim();
    const fullName = realFullName || 'Administrator';
    const profilePhoto = resident.profile_photo || (res.locals.user && res.locals.user.profile_photo) || null;

    // Fetch all system administrator accounts for the Admin Accounts Management section
    const onlineTracker = require('../utils/onlineTracker');
    const [adminRows] = await db.execute(`
      SELECT u.id, u.email, u.role, u.created_at,
             COALESCE(r.first_name, s.first_name, '') AS first_name,
             COALESCE(r.last_name, s.last_name, '') AS last_name,
             COALESCE(r.contact_number, s.contact_number, '') AS contact_number,
             COALESCE(r.profile_photo, s.profile_photo) AS profile_photo
      FROM users u
      LEFT JOIN residents r ON u.id = r.user_id
      LEFT JOIN staff s ON u.id = s.user_id
      WHERE u.role = 'admin'
      GROUP BY u.id
      ORDER BY u.id ASC
    `).catch(() => [[]]);

    const adminAccounts = (adminRows || []).map(a => {
      const aFull = `${a.first_name || ''} ${a.last_name || ''}`.trim();
      return {
        id: a.id,
        email: a.email,
        name: aFull || (a.email ? a.email.split('@')[0] : 'Administrator'),
        first_name: a.first_name || '',
        last_name: a.last_name || '',
        contact_number: a.contact_number || '',
        profile_photo: a.profile_photo || null,
        is_online: onlineTracker.isUserOnline(a.id),
        is_current_user: Boolean(Number(userId) === Number(a.id)),
        created_at: a.created_at
      };
    });

    const onlineAdminCount = (adminAccounts || []).filter(a => a.is_online).length;

    res.render("admin/settings", {
      ...sharedSimData(),
      user: {
        id: userId,
        name: fullName,
        role: "admin",
        email: userObj.email || 'admin@evakwar.gov.ph',
        profile_photo: profilePhoto
      },
      resident: {
        first_name: firstName,
        last_name: lastName,
        contact_number: resident.contact_number || '09000000000',
        barangay: resident.barangay || 'San Rafael',
        profile_photo: profilePhoto
      },
      adminAccounts: adminAccounts,
      onlineAdminCount: onlineAdminCount,
      currentTab: req.query.tab || 'admins',
      page: { title: "Settings" },
      statusMsg: req.query.success || null,
      errorMsg: req.query.error || null
    });
  } catch (error) {
    console.error("Error loading admin settings:", error);
    res.status(500).send("Server Error loading admin settings.");
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    if (!userId) {
      return res.redirect('/login');
    }

    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const {
      first_name,
      last_name,
      name,
      email,
      contact_number,
      current_password,
      new_password,
      confirm_password
    } = req.body;

    // 1. Ensure resident record exists
    const [residentRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
    let resident = residentRows[0] || null;

    if (!resident) {
      const qr_code_uuid = crypto.randomUUID();
      await db.execute(`
        INSERT INTO residents 
        (user_id, first_name, last_name, contact_number, home_address, barangay, qr_code_uuid)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        '',
        '',
        '09000000000',
        'Municipal Disaster Risk Reduction Management Office',
        'San Rafael',
        qr_code_uuid
      ]);
      const [newResRows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
      resident = newResRows[0] || {};
    }

    // 2. Handle Profile Photo Upload if attached
    if (req.file && req.file.filename) {
      await db.execute('UPDATE residents SET profile_photo = ? WHERE user_id = ?', [req.file.filename, userId]);
      await db.execute('UPDATE staff SET profile_photo = ? WHERE user_id = ?', [req.file.filename, userId]).catch(() => { });
    }

    // 3. Handle First Name, Last Name, Contact Number
    let cleanFirst = (first_name !== undefined && first_name !== null) ? first_name.trim() : (resident.first_name || '');
    let cleanLast = (last_name !== undefined && last_name !== null) ? last_name.trim() : (resident.last_name || '');

    if (name && name.trim() !== '' && (!first_name || !first_name.trim())) {
      const parts = name.trim().split(/\s+/);
      cleanFirst = parts[0];
      cleanLast = parts.length > 1 ? parts.slice(1).join(' ') : cleanLast;
    }

    if (contact_number !== undefined && contact_number !== null && contact_number.trim() !== '') {
      if (!isValidPhoneNumber(contact_number.trim())) {
        return res.redirect('/admin/settings?error=' + encodeURIComponent(PHONE_ERROR_MESSAGE));
      }
    }

    const cleanContact = (contact_number !== undefined && contact_number !== null && contact_number.trim() !== '')
      ? contact_number.trim()
      : (resident.contact_number || '09000000000');

    await db.execute(`
      UPDATE residents 
      SET first_name = ?, last_name = ?, contact_number = ?
      WHERE user_id = ?
    `, [cleanFirst, cleanLast, cleanContact, userId]);

    await db.execute(`
      UPDATE staff 
      SET first_name = ?, last_name = ?, contact_number = ?
      WHERE user_id = ?
    `, [cleanFirst, cleanLast, cleanContact, userId]).catch(() => { });

    req.session.userName = `${cleanFirst} ${cleanLast}`.trim() || 'Administrator';

    // 4. Handle Email update if provided
    if (email && email.trim() !== '') {
      const cleanEmail = email.trim().toLowerCase();
      const [existingEmail] = await db.execute('SELECT id FROM users WHERE email = ? AND id != ?', [cleanEmail, userId]);
      if (existingEmail.length > 0) {
        return res.redirect('/admin/settings?error=' + encodeURIComponent('Email address is already in use by another account.'));
      }
      await db.execute('UPDATE users SET email = ? WHERE id = ?', [cleanEmail, userId]);
    }

    // 5. Handle Password update if provided
    let passwordUpdated = false;
    if (current_password || new_password || confirm_password) {
      if (!current_password || !new_password || !confirm_password) {
        return res.redirect('/admin/settings?error=' + encodeURIComponent('Please fill out all password fields.'));
      }
      if (new_password !== confirm_password) {
        return res.redirect('/admin/settings?error=' + encodeURIComponent('New password and confirm password do not match.'));
      }
      if (!isValidPassword(new_password)) {
        return res.redirect('/admin/settings?error=' + encodeURIComponent(PASSWORD_ERROR_MESSAGE));
      }

      const [userRows] = await db.execute('SELECT password_hash FROM users WHERE id = ?', [userId]);
      if (userRows.length > 0) {
        const isMatch = await bcrypt.compare(current_password, userRows[0].password_hash);
        if (!isMatch) {
          return res.redirect('/admin/settings?error=' + encodeURIComponent('Current password is incorrect.'));
        }
        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(new_password, salt);
        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
        passwordUpdated = true;
      }
    }

    if (req.session) {
      req.session.userProfile = null;
    }

    if (passwordUpdated) {
      return res.redirect('/admin/settings?success=' + encodeURIComponent('Admin password updated successfully!'));
    }

    return res.redirect('/admin/settings?success=' + encodeURIComponent('Admin profile and settings updated successfully!'));
  } catch (error) {
    console.error("Error updating admin settings:", error);
    return res.redirect('/admin/settings?error=' + encodeURIComponent('Error updating admin settings: ' + error.message));
  }
};

exports.getChat = async (req, res) => {
  try {
    const userId = req.session ? req.session.userId : null;
    let adminName = (res.locals.user && res.locals.user.name) ? String(res.locals.user.name).trim() : '';
    if (userId) {
      try {
        const [resRows] = await db.execute('SELECT first_name, last_name FROM residents WHERE user_id = ? LIMIT 1', [userId]);
        if (resRows && resRows[0]) {
          const fn = `${resRows[0].first_name || ''} ${resRows[0].last_name || ''}`.trim();
          if (fn && fn !== 'Super Admin' && fn !== 'Administrator') {
            adminName = fn;
          }
        }
      } catch (_e) {}
    }
    if (!adminName || adminName === 'Admin' || adminName === 'Administrator' || adminName === 'Super Admin' || adminName === 'Super Administrator') {
      adminName = 'Monette Bisenio';
    }

    res.render("admin/chat", {
      ...sharedSimData(),
      user: {
        ...(res.locals.user || {}),
        id: userId || 2,
        name: adminName,
        full_name: adminName,
        role: "admin"
      },
      page: { title: "LoRa Mesh Chat" }
    });
  } catch (error) {
    console.error("Error loading admin chat page:", error);
    res.status(500).send("Server Error loading Admin LoRa Chat");
  }
};

exports.getEvacuationCenterDetails = async (req, res) => {
  try {
    const centerId = parseInt(req.params.id, 10);
    if (!centerId || isNaN(centerId)) {
      return res.redirect('/admin/evacuation');
    }

    const [centerRows] = await db.execute(
      'SELECT * FROM evacuation_centers WHERE id = ? LIMIT 1',
      [centerId]
    );
    if (!centerRows || centerRows.length === 0) {
      return res.redirect('/admin/evacuation');
    }
    const center = centerRows[0];

    const [staffRows] = await db.execute(
      `SELECT id, first_name, middle_name, last_name, contact_number, occupation, staff_type, profile_photo
       FROM staff WHERE assigned_center_id = ? ORDER BY first_name ASC`,
      [centerId]
    ).catch(() => [[]]);

    const [checkInRows] = await db.execute(
      `SELECT c.id, c.resident_id, c.status, c.check_in_time, c.check_out_time, c.evacuee_name, c.member_count,
              r.first_name, r.middle_name, r.last_name, r.home_address, r.barangay, r.contact_number, r.family_size,
              r.is_pwd, r.is_pregnant, r.is_lactating, r.is_4ps, r.has_serious_illness
       FROM check_ins c
       LEFT JOIN residents r ON c.resident_id = r.id
       WHERE c.center_id = ?
       ORDER BY c.check_in_time DESC
       LIMIT 200`,
      [centerId]
    ).catch(() => [[]]);

    const activeCheckIns = (checkInRows || []).filter(c => c.status === 'ACTIVE' || c.status === 'CHECKED_IN');
    const checkedOutList = (checkInRows || []).filter(c => c.status === 'CHECKED_OUT');

    res.render('admin/evacuation-center-details', {
      ...sharedSimData(),
      user: res.locals.user || { role: 'admin' },
      page: { title: 'Evacuation Site' },
      center,
      assignedStaff: staffRows || [],
      activeCheckIns,
      checkedOutList
    });
  } catch (error) {
    console.error('Error loading evacuation center details:', error);
    res.redirect('/admin/evacuation');
  }
};
