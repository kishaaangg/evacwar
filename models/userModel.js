const db = require('../config/db');

const User = {
    findByEmail: async (email) => {
        const cleanEmail = email ? email.trim() : '';
        const [rows] = await db.execute(`
            SELECT u.id, u.email, u.password_hash, u.role, u.is_verified, u.created_at,
                   COALESCE(s.first_name, r.first_name) as first_name,
                   COALESCE(s.middle_name, r.middle_name) as middle_name,
                   COALESCE(s.last_name, r.last_name) as last_name,
                   COALESCE(s.contact_number, r.contact_number) as contact_number,
                   COALESCE(s.profile_photo, r.profile_photo) as profile_photo,
                   COALESCE(s.staff_type, 'BOTH') as staff_type,
                   s.assigned_center_id,
                   COALESCE(r.barangay, ec.address, 'San Rafael') as assigned_barangay,
                   ec.name as assigned_center_name, ec.max_capacity as assigned_center_capacity, ec.current_occupancy as assigned_center_occupancy
            FROM users u
            LEFT JOIN staff s ON u.id = s.user_id
            LEFT JOIN residents r ON u.id = r.user_id
            LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
            WHERE u.email = ? OR (LOWER(?) = 'admin' AND (u.email = 'admin' OR u.role = 'admin'))
        `, [cleanEmail, cleanEmail]);
        return rows[0];
    },
    findByEmailOrContact: async (identifier) => {
        const cleanIdentifier = identifier ? identifier.trim() : '';
        const [rows] = await db.execute(`
            SELECT u.id, u.email, u.password_hash, u.role, u.is_verified, u.created_at,
                   COALESCE(s.first_name, r.first_name) as first_name,
                   COALESCE(s.middle_name, r.middle_name) as middle_name,
                   COALESCE(s.last_name, r.last_name) as last_name,
                   COALESCE(s.contact_number, r.contact_number) as contact_number,
                   COALESCE(s.profile_photo, r.profile_photo) as profile_photo,
                   COALESCE(s.staff_type, 'BOTH') as staff_type,
                   s.assigned_center_id,
                   COALESCE(r.barangay, ec.address, 'San Rafael') as assigned_barangay,
                   ec.name as assigned_center_name
            FROM users u
            LEFT JOIN staff s ON u.id = s.user_id
            LEFT JOIN residents r ON u.id = r.user_id
            LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
            WHERE u.email = ?
               OR (LOWER(?) IN ('admin', 'monette', 'monettes', 'monette@gmail.com', 'monettes@gmail.com', 'monette@gmai.com') AND (u.role = 'admin' OR u.email = 'monette@gmail.com' OR u.email = 'monette@gmai.com'))
               OR (LOWER(?) = 'admin' AND (u.email = 'admin' OR u.email LIKE 'admin@%' OR u.role = 'admin'))
               OR r.contact_number = ?
               OR s.contact_number = ?
        `, [cleanIdentifier, cleanIdentifier, cleanIdentifier, cleanIdentifier, cleanIdentifier]);
        return rows[0];
    },
    findById: async (id) => {
        const [rows] = await db.execute(`
            SELECT u.id, u.email, u.password_hash, u.role, u.is_verified, u.created_at,
                   COALESCE(s.first_name, r.first_name) as first_name,
                   COALESCE(s.middle_name, r.middle_name) as middle_name,
                   COALESCE(s.last_name, r.last_name) as last_name,
                   COALESCE(s.contact_number, r.contact_number) as contact_number,
                   r.home_address, r.barangay, r.emergency_contact_name, r.emergency_contact_phone, r.vulnerability,
                   COALESCE(s.profile_photo, r.profile_photo) as profile_photo,
                   COALESCE(s.staff_type, 'BOTH') as staff_type,
                   s.assigned_center_id,
                   COALESCE(r.barangay, ec.address, 'San Rafael') as assigned_barangay,
                   ec.name as assigned_center_name, ec.max_capacity as assigned_center_capacity, ec.current_occupancy as assigned_center_occupancy
            FROM users u
            LEFT JOIN staff s ON u.id = s.user_id
            LEFT JOIN residents r ON u.id = r.user_id
            LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
            WHERE u.id = ?
        `, [id]);
        return rows[0];
    },
    existsByEmailOrContact: async (email, contact) => {
        const [rows] = await db.execute(`
            SELECT u.id FROM users u
            LEFT JOIN staff s ON u.id = s.user_id
            LEFT JOIN residents r ON u.id = r.user_id
            WHERE u.email = ? OR (r.contact_number IS NOT NULL AND r.contact_number = ?) OR (s.contact_number IS NOT NULL AND s.contact_number = ?)
        `, [email, contact, contact]);
        return rows.length > 0;
    },
    create: async (userData) => {
        const { email, password_hash, role = 'resident', is_verified = true } = userData;
        const [result] = await db.execute(
            'INSERT INTO users (email, password_hash, role, is_verified) VALUES (?, ?, ?, ?)',
            [email.trim().toLowerCase(), password_hash, role, is_verified]
        );
        return result.insertId;
    }
};

module.exports = User;


