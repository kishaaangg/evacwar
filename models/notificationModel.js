const db = require('../config/db');

const notifCache = new Map();
const NOTIF_CACHE_TTL = 15000; // 15 seconds

const NotificationModel = {
  invalidateCache: () => {
    notifCache.clear();
  },
  getAll: async (userRole = 'resident', barangay = 'San Rafael', staffType = null) => {
    try {
      const role = (userRole || 'resident').toLowerCase();
      const bg = barangay || 'San Rafael';
      const stType = staffType ? String(staffType).toUpperCase() : null;
      const cacheKey = `${role}_${bg}_${stType || 'ALL'}`;
      const now = Date.now();

      const cached = notifCache.get(cacheKey);
      if (cached && (now - cached.timestamp < NOTIF_CACHE_TTL)) {
        return cached.data;
      }

      const items = [];
      const isEvacuationStaff = (role === 'staff' || role === 'barangay_council') && stType === 'EVACUATION';
      const isRescuer = (role === 'rescuer' || stType === 'RESCUER');
      // SOS alerts are strictly for Admin and Rescuer staff (site staff focusing on evacuation/check-ins do NOT receive SOS)
      const shouldIncludeSos = (role === 'admin' || isRescuer || ((role === 'staff' || role === 'barangay_council') && !isEvacuationStaff));
      const shouldIncludeCheckin = (role === 'admin');
      const shouldIncludeBroadcast = (role !== 'admin' && (role === 'resident' || role === 'staff' || role === 'barangay_council' || role === 'rescuer'));

      // 1. SOS Alerts (For Admin & Staff/Rescuers)
      if (shouldIncludeSos) {
        const [sosRows] = await db.execute(`
          SELECT 
            s.id, s.resident_id, s.name, s.latitude, s.longitude, s.status, s.created_at,
            COALESCE(r.first_name, r_fallback.first_name) as first_name,
            COALESCE(r.last_name, r_fallback.last_name) as last_name,
            COALESCE(r.barangay, r_fallback.barangay) as barangay
          FROM sos_alerts s
          LEFT JOIN residents r ON s.resident_id = r.id
          LEFT JOIN residents r_fallback ON (r.id IS NULL AND s.resident_id = r_fallback.user_id)
          GROUP BY s.id
          ORDER BY s.created_at DESC
          LIMIT 25
        `);

        sosRows.forEach(s => {
          const resName = s.name || (s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : 'Resident');
          const dt = new Date(s.created_at || Date.now());
          const isActiveSos = (s.status === 'ACTIVE' || s.status === 'PENDING' || s.status === 'DISPATCHED');
          const actionUrl = role === 'admin'
            ? `/admin/evacuation?sos_id=${s.id}&lat=${s.latitude || ''}&lng=${s.longitude || ''}`
            : (isRescuer
                ? `/rescuer/map?sos_id=${s.id}&lat=${s.latitude || ''}&lng=${s.longitude || ''}`
                : `/staff/map?sos_id=${s.id}&lat=${s.latitude || ''}&lng=${s.longitude || ''}`);
          items.push({
            id: `sos-${s.id}`,
            type: 'sos',
            category: 'sos',
            icon: 'ph-siren',
            color: 'red',
            title: `🚨 Emergency SOS: ${resName}`,
            message: `Distress call at ${s.barangay || 'San Rafael'} (Status: ${s.status})`,
            date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }),
            time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }),
            timestamp: dt.getTime(),
            isActionRequired: isActiveSos,
            actionUrl: actionUrl,
            actionLabel: 'View Map'
          });
        });
      }

      // 2. Check-Ins & Check-Outs (For Admin Only - limited to recent 8)
      if (shouldIncludeCheckin) {
        const [checkInRows] = await db.execute(`
          SELECT 
            c.id, c.resident_id, c.household_member_id, c.center_id, c.staff_user_id, c.status, c.check_in_time, c.check_out_time, c.check_in_method,
            r.first_name as res_first_name, r.last_name as res_last_name, r.barangay,
            hm.first_name as mem_first_name, hm.last_name as mem_last_name,
            ec.name as center_name,
            u.email as staff_email
          FROM check_ins c
          JOIN residents r ON c.resident_id = r.id
          LEFT JOIN household_members hm ON c.household_member_id = hm.id
          LEFT JOIN evacuation_centers ec ON c.center_id = ec.id
          LEFT JOIN users u ON c.staff_user_id = u.id
          ORDER BY c.id DESC
          LIMIT 30
        `);

        checkInRows.forEach(c => {
          const personName = c.household_member_id === null ? `${c.res_first_name} ${c.res_last_name}` : `${c.mem_first_name} ${c.mem_last_name}`;
          const centerName = c.center_name || 'Evacuation Center';
          const isOut = c.status === 'DEPARTED' || c.status === 'CHECKED_OUT';
          const rawTime = isOut && c.check_out_time ? c.check_out_time : c.check_in_time;
          const dt = new Date(rawTime || Date.now());
          const actionUrl = '/admin/reports';

          if (isOut) {
            items.push({
              id: `checkout-${c.id}`,
              type: 'checkout',
              category: 'checkin',
              icon: 'ph-sign-out',
              color: 'slate',
              title: `🚪 Departed: ${personName}`,
              message: `${personName} checked out from ${centerName}`,
              date: dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
              time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: dt.getTime(),
              isActionRequired: false,
              actionUrl: actionUrl,
              actionLabel: 'View Masterlist'
            });
          } else {
            items.push({
              id: `checkin-${c.id}`,
              type: 'checkin',
              category: 'checkin',
              icon: 'ph-house',
              color: 'emerald',
              title: `🏠 Check-In: ${personName}`,
              message: `${personName} checked in to ${centerName} (${c.check_in_method || 'QR'})`,
              date: dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
              time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              timestamp: dt.getTime(),
              isActionRequired: false,
              actionUrl: actionUrl,
              actionLabel: 'View Masterlist'
            });
          }
        });
      }

      // 3. Emergency Broadcasts / Advisories (For Resident, Staff, Rescuer - Admin excluded)
      if (shouldIncludeBroadcast) {
        let alertRows = [];
        try {
          if (role === 'admin' || isRescuer || role === 'staff' || role === 'barangay_council') {
            // Admin, Rescuers, and Staff see ALL emergency alerts across the municipality
            const [rows] = await db.execute(`
              SELECT * FROM alerts
              ORDER BY sent_at DESC
              LIMIT 20
            `);
            alertRows = rows || [];
          } else {
            // Residents see alerts for ALL, San Rafael, or matching their specific zone
            const [rows] = await db.execute(`
              SELECT * FROM alerts
              WHERE barangay IS NULL 
                 OR TRIM(barangay) = ''
                 OR UPPER(barangay) = 'ALL' 
                 OR UPPER(barangay) = 'SAN RAFAEL' 
                 OR UPPER(barangay) = UPPER(?) 
                 OR ? LIKE CONCAT('%', barangay, '%')
                 OR barangay LIKE CONCAT('%', ?, '%')
              ORDER BY sent_at DESC
              LIMIT 20
            `, [bg, bg, bg]);
            alertRows = rows || [];
          }
        } catch (alertDbErr) {
          console.error("Error querying alerts for notifications:", alertDbErr);
        }

        alertRows.forEach(a => {
          const dt = new Date(a.sent_at || Date.now());
          const actionUrl = role === 'admin'
            ? '/admin/broadcast'
            : (isRescuer ? '/rescuer/dashboard' : ((role === 'staff' || role === 'barangay_council') ? '/staff/dashboard' : '/resident/typhoon'));
          items.push({
            id: `alert-${a.id}`,
            type: 'broadcast',
            category: 'broadcast',
            icon: 'ph-megaphone-simple',
            color: (a.severity === 'RED' ? 'red' : (a.severity === 'ORANGE' ? 'amber' : 'blue')),
            title: `📢 Advisory: ${a.title}`,
            message: a.message,
            date: dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
            time: dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: dt.getTime(),
            isActionRequired: (a.severity === 'RED' || a.severity === 'ORANGE'),
            actionUrl: actionUrl,
            actionLabel: 'View Advisory'
          });
        });
      }

      // 4. Resident Registrations (For Admin - Pending Verifications & Registered Residents)
      const shouldIncludeRegistrations = (role === 'admin');
      if (shouldIncludeRegistrations) {
        const [regRows] = await db.execute(`
          SELECT 
            r.id, r.first_name, r.last_name, r.home_address, r.barangay, r.barangay_id_photo,
            r.approval_status, r.registration_source, r.user_id,
            u.email, u.created_at as user_created_at
          FROM residents r
          LEFT JOIN users u ON r.user_id = u.id
          WHERE (u.role IS NULL OR u.role = 'resident')
            AND (r.user_id IS NOT NULL OR r.registration_source = 'REGISTERED' OR r.approval_status = 'PENDING')
          ORDER BY 
            (CASE WHEN r.approval_status = 'PENDING' THEN 0 ELSE 1 END),
            COALESCE(u.created_at, '1970-01-01') DESC,
            r.id DESC
          LIMIT 50
        `);

        regRows.forEach(p => {
          const resName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'New Resident';
          const regDate = p.user_created_at || Date.now();
          const dt = new Date(regDate);
          const status = (p.approval_status || 'APPROVED').toUpperCase();
          const actionUrl = `/admin/residents?search=${encodeURIComponent(resName)}`;

          if (status === 'PENDING') {
            items.push({
              id: `pending-reg-${p.id}`,
              type: 'registration',
              category: 'registration',
              icon: 'ph-user-focus',
              color: 'amber',
              title: `👤 Pending Verification: ${resName}`,
              message: `${resName} registered from ${p.home_address || 'San Rafael'}. Barangay ID verification required.`,
              date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }),
              time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }),
              timestamp: Date.now(), // Active pending items always float to the top of the feed!
              isActionRequired: true,
              actionUrl: `/admin/residents?status=pending&search=${encodeURIComponent(resName)}`,
              actionLabel: 'Review & Verify'
            });
          } else if (status === 'APPROVED') {
            items.push({
              id: `approved-reg-${p.id}`,
              type: 'registration',
              category: 'registration',
              icon: 'ph-user-check',
              color: 'emerald',
              title: `✅ Registration Approved: ${resName}`,
              message: `${resName} from ${p.home_address || 'San Rafael'} was approved and verified.`,
              date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }),
              time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }),
              timestamp: p.user_created_at ? new Date(p.user_created_at).getTime() : dt.getTime(),
              isActionRequired: false,
              actionUrl: actionUrl,
              actionLabel: 'View Resident'
            });
          } else if (status === 'REJECTED') {
            items.push({
              id: `rejected-reg-${p.id}`,
              type: 'registration',
              category: 'registration',
              icon: 'ph-user-minus',
              color: 'slate',
              title: `❌ Registration Rejected: ${resName}`,
              message: `Registration request for ${resName} was reviewed and rejected.`,
              date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }),
              time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }),
              timestamp: p.user_created_at ? new Date(p.user_created_at).getTime() : dt.getTime(),
              isActionRequired: false,
              actionUrl: actionUrl,
              actionLabel: 'View Details'
            });
          }
        });
      }

      // Sort all items: actionable items first (pending verifications & active SOS), then by timestamp descending
      items.sort((a, b) => {
        if (a.isActionRequired && !b.isActionRequired) return -1;
        if (!a.isActionRequired && b.isActionRequired) return 1;
        return b.timestamp - a.timestamp;
      });

      // Strictly guarantee registration notifications are only returned to admin
      const finalItems = (role === 'admin')
        ? items
        : items.filter(n => n.type !== 'registration' && n.category !== 'registration');

      notifCache.set(cacheKey, { data: finalItems, timestamp: now });
      return finalItems;
    } catch (err) {
      console.error("Error in NotificationModel.getAll:", err);
      return [];
    }
  }
};

module.exports = NotificationModel;
