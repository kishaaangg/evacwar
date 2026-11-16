const db = require('../config/db');

const Staff = {
  /**
   * Get the evacuation center assigned to a staff member (one site per staff).
   * Returned as an array (0 or 1 item) for compatibility with existing callers.
   */
  getAssignedCenters: async (staffUserId, centerId = null) => {
    if (!staffUserId) return [];

    let targetCenterId = centerId;
    if (!targetCenterId) {
      const [sRows] = await db.execute('SELECT assigned_center_id FROM staff WHERE user_id = ?', [staffUserId]);
      targetCenterId = sRows[0] ? sRows[0].assigned_center_id : null;
    }
    if (!targetCenterId) return [];

    const [rows] = await db.execute(`
      SELECT id, name, address, contact_number, owner_name,
             latitude, longitude, max_capacity, current_occupancy, status
      FROM evacuation_centers
      WHERE id = ?
    `, [targetCenterId]);

    return rows.slice(0, 1);
  },

  /**
   * Set the evacuation center for a staff member (one site per staff).
   * Only the first valid center ID is used; stored in staff.assigned_center_id.
   */
  syncAssignedCenters: async (staffUserId, centerIds = []) => {
    if (!staffUserId) return [];

    // Normalize and enforce a single center
    let rawIds = [];
    if (Array.isArray(centerIds)) {
      rawIds = centerIds;
    } else if (centerIds !== null && centerIds !== undefined && centerIds !== '') {
      rawIds = [centerIds];
    }

    const validCenterIds = [];
    for (const raw of rawIds) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0 && !validCenterIds.includes(parsed)) {
        // Verify center exists
        const [exists] = await db.execute('SELECT id FROM evacuation_centers WHERE id = ?', [parsed]);
        if (exists.length > 0) {
          validCenterIds.push(parsed);
        }
      }
      if (validCenterIds.length === 1) break; // One site per staff
    }

    const primaryCenterId = validCenterIds.length > 0 ? validCenterIds[0] : null;

    await db.execute('UPDATE staff SET assigned_center_id = ? WHERE user_id = ?', [primaryCenterId, staffUserId]);

    return validCenterIds;
  },

  /**
   * Retrieve all staff assigned to a specific evacuation center (including contacts from staff.contact_number).
   */
  getStaffByCenterId: async (centerId) => {
    if (!centerId) return [];
    const parsedCenterId = parseInt(centerId, 10);
    if (isNaN(parsedCenterId)) return [];

    const [rows] = await db.execute(`
      SELECT 
        s.id as staff_id,
        s.user_id,
        s.first_name,
        s.middle_name,
        s.last_name,
        TRIM(CONCAT_WS(' ', NULLIF(TRIM(s.first_name), ''), NULLIF(TRIM(s.middle_name), ''), NULLIF(TRIM(s.last_name), ''))) as full_name,
        s.contact_number,
        s.occupation,
        s.staff_type,
        s.profile_photo,
        s.status,
        u.email
      FROM staff s
      JOIN users u ON s.user_id = u.id
      WHERE s.assigned_center_id = ?
      ORDER BY s.first_name ASC
    `, [parsedCenterId]);

    return rows;
  },

  create: async (data) => {
    let {
      user_id = null,
      first_name,
      middle_name = null,
      last_name,
      full_name,
      occupation = 'Emergency Staff',
      staff_type = 'BOTH',
      assigned_center_id = null,
      assigned_center_ids = null,
      contact_number = null,
      profile_photo = null,
      status = 'ACTIVE'
    } = data;

    if ((!first_name || !last_name) && full_name) {
      const parts = full_name.trim().split(/\s+/);
      first_name = first_name || parts[0] || '';
      last_name = last_name || (parts.length > 1 ? parts.slice(1).join(' ') : 'Staff');
    }

    // Collect all candidate center IDs
    let candidateIds = [];
    if (Array.isArray(assigned_center_ids)) {
      candidateIds = assigned_center_ids;
    } else if (assigned_center_id) {
      candidateIds = [assigned_center_id];
    }

    const validCenterIds = [];
    for (const c of candidateIds) {
      const parsed = parseInt(c, 10);
      if (!isNaN(parsed) && parsed > 0 && !validCenterIds.includes(parsed)) {
        const [cRows] = await db.execute('SELECT id FROM evacuation_centers WHERE id = ?', [parsed]);
        if (cRows.length > 0) validCenterIds.push(parsed);
      }
      if (validCenterIds.length === 1) break;
    }

    const primaryCenterId = validCenterIds.length > 0 ? validCenterIds[0] : null;

    const allowedStaffTypes = ['EVACUATION', 'RESCUER', 'BOTH'];
    const sanitizedStaffType = allowedStaffTypes.includes(String(staff_type).toUpperCase()) ? String(staff_type).toUpperCase() : 'BOTH';

    const [result] = await db.execute(`
      INSERT INTO staff (
        user_id, first_name, middle_name, last_name, occupation,
        staff_type, assigned_center_id, contact_number,
        profile_photo, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      user_id !== undefined ? user_id : null,
      first_name ? String(first_name).trim() : '',
      middle_name ? String(middle_name).trim() : null,
      last_name ? String(last_name).trim() : '',
      occupation ? String(occupation).trim() : 'Emergency Staff',
      sanitizedStaffType,
      primaryCenterId !== undefined ? primaryCenterId : null,
      contact_number ? String(contact_number).trim() : null,
      profile_photo !== undefined ? profile_photo : null,
      status ? String(status).toUpperCase() : 'ACTIVE'
    ]);

    return result.insertId;
  },

  findById: async (id) => {
    const [rows] = await db.execute(`
      SELECT 
        s.*,
        u.email,
        u.role,
        u.is_verified,
        TRIM(CONCAT_WS(' ', NULLIF(TRIM(s.first_name), ''), NULLIF(TRIM(s.middle_name), ''), NULLIF(TRIM(s.last_name), ''))) as full_name,
        ec.name as assigned_center_name,
        ec.address as assigned_center_address,
        ec.max_capacity as assigned_center_capacity,
        ec.current_occupancy as assigned_center_occupancy,
        ec.status as assigned_center_status
      FROM staff s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
      WHERE s.id = ?
    `, [id]);

    if (!rows[0]) return null;
    const staffRecord = rows[0];

    // Attach assigned center (one site per staff)
    const assignedCenters = await Staff.getAssignedCenters(staffRecord.user_id, staffRecord.assigned_center_id);
    staffRecord.assigned_centers = assignedCenters;
    staffRecord.assigned_center_ids = assignedCenters.map(c => c.id);
    if (assignedCenters.length > 0) {
      staffRecord.assigned_center_id = assignedCenters[0].id;
      staffRecord.assigned_center_name = assignedCenters[0].name;
    }

    return staffRecord;
  },

  findByUserId: async (userId) => {
    const [rows] = await db.execute(`
      SELECT 
        s.*,
        u.email,
        u.role,
        u.is_verified,
        TRIM(CONCAT_WS(' ', NULLIF(TRIM(s.first_name), ''), NULLIF(TRIM(s.middle_name), ''), NULLIF(TRIM(s.last_name), ''))) as full_name,
        ec.id as center_id,
        ec.name as assigned_center_name,
        ec.address as assigned_center_address,
        ec.max_capacity as assigned_center_capacity,
        ec.current_occupancy as assigned_center_occupancy,
        ec.status as assigned_center_status
      FROM staff s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
      WHERE s.user_id = ?
    `, [userId]);

    if (!rows[0]) return null;
    const staffRecord = rows[0];

    // Attach assigned center (one site per staff)
    const assignedCenters = await Staff.getAssignedCenters(staffRecord.user_id, staffRecord.assigned_center_id);
    staffRecord.assigned_centers = assignedCenters;
    staffRecord.assigned_center_ids = assignedCenters.map(c => c.id);
    if (assignedCenters.length > 0) {
      staffRecord.assigned_center_id = assignedCenters[0].id;
      staffRecord.assigned_center_name = assignedCenters[0].name;
    }

    return staffRecord;
  },

  findAll: async () => {
    const [rows] = await db.execute(`
      SELECT 
        s.id,
        s.user_id,
        s.first_name,
        s.middle_name,
        s.last_name,
        s.occupation,
        s.staff_type,
        s.assigned_center_id,
        s.contact_number as contact,
        s.profile_photo,
        s.status,
        s.created_at,
        u.email,
        u.role,
        u.is_verified,
        TRIM(CONCAT_WS(' ', NULLIF(TRIM(s.first_name), ''), NULLIF(TRIM(s.middle_name), ''), NULLIF(TRIM(s.last_name), ''))) as name,
        ec.name as assigned_center_name,
        ec.address as assigned_center_address
      FROM staff s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
      ORDER BY s.id DESC
    `);

    return rows.map(row => {
      // One site per staff: derived from staff.assigned_center_id
      const assignedCenters = (row.assigned_center_id && row.assigned_center_name)
        ? [{ id: row.assigned_center_id, name: row.assigned_center_name, address: row.assigned_center_address }]
        : [];

      const assignedCenterIds = assignedCenters.map(c => c.id);
      const assignedCenterNames = assignedCenters.map(c => c.name);

      const displayLocation = (row.assigned_center_address && row.assigned_center_address.trim())
        ? row.assigned_center_address.trim()
        : (row.assigned_center_name || 'San Rafael');

      return {
        ...row,
        assigned_centers: assignedCenters,
        assigned_center_ids: assignedCenterIds,
        assigned_center_name: assignedCenterNames.length > 0 ? assignedCenterNames.join(', ') : (row.assigned_center_name || 'No Center Assigned'),
        purok: displayLocation,
        barangay: displayLocation,
        statusText: row.is_verified ? 'Registered' : 'Needs Update'
      };
    });
  },

  update: async (id, data) => {
    const fields = [];
    const values = [];

    // Find existing staff record to get user_id
    const [currRows] = await db.execute('SELECT id, user_id, assigned_center_id FROM staff WHERE id = ?', [id]);
    if (currRows.length === 0) return 0;
    const currentStaff = currRows[0];

    if (data.first_name !== undefined) {
      fields.push('first_name = ?');
      values.push(data.first_name ? data.first_name.trim() : '');
    }
    if (data.middle_name !== undefined) {
      fields.push('middle_name = ?');
      values.push(data.middle_name ? data.middle_name.trim() : null);
    }
    if (data.last_name !== undefined) {
      fields.push('last_name = ?');
      values.push(data.last_name ? data.last_name.trim() : '');
    }
    if (data.occupation !== undefined) {
      fields.push('occupation = ?');
      values.push(data.occupation || 'Emergency Staff');
    }
    if (data.staff_type !== undefined) {
      fields.push('staff_type = ?');
      values.push(data.staff_type || 'BOTH');
    }
    if (data.contact_number !== undefined) {
      fields.push('contact_number = ?');
      values.push(data.contact_number ? data.contact_number.trim() : null);
    }
    if (data.profile_photo !== undefined) {
      fields.push('profile_photo = ?');
      values.push(data.profile_photo || null);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status || 'ACTIVE');
    }

    // Handle assigned center (one site per staff)
    const centerIdsProvided = data.assigned_center_ids !== undefined ? data.assigned_center_ids : data.assigned_center_id;
    if (centerIdsProvided !== undefined) {
      let candidateIds = [];
      if (Array.isArray(centerIdsProvided)) {
        candidateIds = centerIdsProvided;
      } else if (centerIdsProvided !== null && centerIdsProvided !== '') {
        candidateIds = [centerIdsProvided];
      }

      const validCenterIds = [];
      for (const c of candidateIds) {
        const parsed = parseInt(c, 10);
        if (!isNaN(parsed) && parsed > 0 && !validCenterIds.includes(parsed)) {
          const [cRows] = await db.execute('SELECT id FROM evacuation_centers WHERE id = ?', [parsed]);
          if (cRows.length > 0) validCenterIds.push(parsed);
        }
        if (validCenterIds.length === 1) break;
      }

      const primaryCenterId = validCenterIds.length > 0 ? validCenterIds[0] : null;
      fields.push('assigned_center_id = ?');
      values.push(primaryCenterId);
    }

    if (fields.length === 0) return 0;

    values.push(id);
    const [result] = await db.execute(`
      UPDATE staff SET ${fields.join(', ')} WHERE id = ?
    `, values);

    return result.affectedRows;
  },

  updateByUserId: async (userId, data) => {
    const [currRows] = await db.execute('SELECT id, user_id FROM staff WHERE user_id = ?', [userId]);
    if (currRows.length === 0) {
      return Staff.create({ user_id: userId, ...data });
    }
    return Staff.update(currRows[0].id, data);
  },

  delete: async (id) => {
    const [rows] = await db.execute('SELECT user_id FROM staff WHERE id = ?', [id]);
    if (rows.length > 0 && rows[0].user_id) {
      const uId = rows[0].user_id;
      await db.execute('DELETE FROM staff WHERE id = ?', [id]);
      const [residentRows] = await db.execute('SELECT id FROM residents WHERE user_id = ?', [uId]);
      if (residentRows.length > 0) {
        await db.execute("UPDATE users SET role = 'resident' WHERE id = ?", [uId]);
      } else {
        await db.execute('DELETE FROM users WHERE id = ?', [uId]);
      }
      return true;
    }
    return false;
  }
};

module.exports = Staff;
