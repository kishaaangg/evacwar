const db = require('../config/db');
const { isValidPhPhoneNumber, formatPhPhoneNumber } = require('../utils/smsService');

const Resident = {
    findAll: async () => {
        const [rows] = await db.execute("SELECT * FROM residents WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE' AND approval_status = 'APPROVED'");
        return rows;
    },
    findAllWithUsers: async () => {
        const [rows] = await db.execute(`
            SELECT 
                r.id, 
                r.user_id,
                r.registration_source,
                r.status as resident_status,
                TRIM(CONCAT_WS(' ', TRIM(r.first_name), NULLIF(TRIM(r.middle_name), ''), TRIM(r.last_name))) AS name, 
                r.first_name,
                r.middle_name,
                r.last_name,
                r.sex,
                r.birthdate,
                r.age,
                r.contact_number AS contact, 
                r.home_address AS purok,
                r.barangay,
                r.emergency_contact_name,
                r.emergency_contact_phone,
                r.vulnerability,
                r.family_size,
                r.is_4ps,
                r.is_pregnant,
                r.is_lactating,
                r.is_pwd,
                r.is_single_head,
                r.has_serious_illness,
                r.serious_illness_details,
                r.qr_code_uuid,
                r.profile_photo,
                r.barangay_id_photo,
                COALESCE(r.approval_status, IF(r.user_id IS NULL, 'APPROVED', IF(u.is_verified = 1, 'APPROVED', 'PENDING'))) as approval_status,
                u.email, 
                COALESCE(u.is_verified, 0) as is_verified,
                u.role,
                (SELECT GROUP_CONCAT(CONCAT(hm.first_name, ' ', hm.last_name) SEPARATOR ', ') FROM household_members hm WHERE hm.resident_id = r.id) as household_names
            FROM residents r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE (u.role IS NULL OR u.role = 'resident')
              AND COALESCE(r.status, 'ACTIVE') = 'ACTIVE'
            ORDER BY 
              CASE WHEN r.id IN (161, 159, 157, 156, 155, 154) THEN 2 ELSE 1 END,
              r.id DESC
        `);
        return rows.map(row => {
            const displayPurok = (row.purok && row.purok.trim())
                ? row.purok.trim()
                : ((row.barangay && row.barangay.trim()) ? row.barangay.trim() : 'San Rafael');
            const regSource = row.registration_source || (row.user_id ? 'REGISTERED' : 'WALK_IN');
            const approvalStatus = row.approval_status || (row.user_id ? (row.is_verified ? 'APPROVED' : 'PENDING') : 'APPROVED');
            let displayStatus = 'Pending Approval';
            if (regSource === 'WALK_IN' || !row.user_id) {
                displayStatus = 'Walk-In';
            } else if (approvalStatus === 'APPROVED') {
                displayStatus = 'Approved';
            } else if (approvalStatus === 'REJECTED') {
                displayStatus = 'Rejected';
            } else {
                displayStatus = 'Pending Approval';
            }
            return {
                ...row,
                purok: displayPurok,
                barangay: row.barangay || 'San Rafael',
                registration_source: regSource,
                is_walkin: regSource === 'WALK_IN' || !row.user_id,
                approval_status: approvalStatus,
                status: displayStatus
            };
        });
    },
    findAllStaff: async () => {
        const Staff = require('./staffModel');
        return Staff.findAll();
    },
    delete: async (id) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [residentRows] = await conn.execute(
                'SELECT id, user_id, contact_number, status FROM residents WHERE id = ?',
                [id]
            );

            if (residentRows.length === 0) {
                await conn.commit();
                return false;
            }

            const resident = residentRows[0];
            const userId = resident.user_id;

            // 1. Check if this resident has historical evacuation check-ins or emergency records
            const [checkIns] = await conn.execute(
                'SELECT COUNT(*) as count FROM check_ins WHERE resident_id = ?',
                [id]
            );
            const [resolvedAlerts] = await conn.execute(
                "SELECT COUNT(*) as count FROM sos_alerts WHERE resident_id = ? AND status IN ('RESCUED', 'RESOLVED')",
                [id]
            );

            const hasHistoricalData = (checkIns[0]?.count > 0) || (resolvedAlerts[0]?.count > 0);

            // 2. Cancel any pending active SOS alerts for this resident to prevent ghost alerts
            await conn.execute(
                "UPDATE sos_alerts SET status = 'CANCELLED' WHERE resident_id = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING')",
                [id]
            ).catch(() => { });

            if (hasHistoricalData) {
                // Preserve the resident record as ARCHIVED for check-in masterlists and DRRM reports,
                // but CRITICALLY disconnect user_id (set to NULL) so the user account can be deleted
                // and the email is freed without triggering CASCADE deletion of check_ins.
                await conn.execute(
                    "UPDATE residents SET status = 'ARCHIVED', user_id = NULL WHERE id = ?",
                    [id]
                );
            } else {
                // No historical check-in or emergency records depend on this resident.
                // Disconnect user_id first to prevent CASCADE issues, then cleanly delete resident & members.
                await conn.execute("UPDATE residents SET user_id = NULL WHERE id = ?", [id]);
                await conn.execute("DELETE FROM household_members WHERE resident_id = ?", [id]).catch(() => { });
                await conn.execute("DELETE FROM sos_alerts WHERE resident_id = ?", [id]).catch(() => { });
                await conn.execute("DELETE FROM residents WHERE id = ?", [id]);
            }

            // 3. If there was an associated user account, delete it permanently to free the email
            if (userId) {
                // Remove push subscriptions first
                await conn.execute('DELETE FROM push_subscriptions WHERE user_id = ?', [userId]).catch(() => { });
                // In user_logs, alerts, and sos_emergency, foreign keys are ON DELETE SET NULL,
                // preserving all administrative/audit log history.
                await conn.execute('DELETE FROM users WHERE id = ?', [userId]);
            }

            await conn.commit();
            return true;
        } catch (error) {
            await conn.rollback();
            console.error(`[Resident.delete] Transaction failed for resident ID ${id}:`, error);
            throw error;
        } finally {
            conn.release();
        }
    },
    getMetrics: async () => {
        const [familiesResult] = await db.execute(`
            SELECT COUNT(r.id) as count 
            FROM residents r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE'
              AND (u.role IS NULL OR u.role = 'resident')
              AND r.approval_status = 'APPROVED'
        `);
        const [individualsResult] = await db.execute(`
            SELECT 
              (
                (SELECT COUNT(r.id) 
                 FROM residents r 
                 LEFT JOIN users u ON r.user_id = u.id 
                 WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' 
                   AND (u.role IS NULL OR u.role = 'resident') 
                   AND r.approval_status = 'APPROVED')
                +
                (SELECT COUNT(hm.id) 
                 FROM household_members hm 
                 JOIN residents r ON hm.resident_id = r.id 
                 LEFT JOIN users u ON r.user_id = u.id 
                 WHERE COALESCE(r.status, 'ACTIVE') = 'ACTIVE' 
                   AND (u.role IS NULL OR u.role = 'resident') 
                   AND r.approval_status = 'APPROVED')
              ) as count
        `);
        return {
            totalFamilies: familiesResult[0]?.count || 0,
            totalIndividuals: Number(individualsResult[0]?.count || 0)
        };
    },
    findById: async (id) => {
        const [rows] = await db.execute('SELECT * FROM residents WHERE id = ?', [id]);
        return rows[0];
    },
    findByUserId: async (userId) => {
        const [rows] = await db.execute('SELECT * FROM residents WHERE user_id = ?', [userId]);
        return rows[0];
    },
    findByQrUuid: async (qrCodeUuid) => {
        const [rows] = await db.execute('SELECT * FROM residents WHERE qr_code_uuid = ?', [qrCodeUuid]);
        return rows[0];
    },
    create: async (residentData) => {
        const {
            user_id = null,
            first_name,
            middle_name = null,
            last_name,
            sex = 'Male',
            birthdate = null,
            age = null,
            contact_number,
            home_address,
            barangay = 'San Rafael',
            emergency_contact_name = null,
            emergency_contact_phone = null,
            vulnerability = 'None',
            family_size = 1,
            has_special_needs = false,
            is_4ps = false,
            is_pregnant = false,
            is_lactating = false,
            is_pwd = false,
            is_single_head = false,
            has_serious_illness = false,
            serious_illness_details = null,
            qr_code_uuid,
            profile_photo = null,
            barangay_id_photo = null,
            approval_status = null,
            registration_source = null
        } = residentData;

        const regSource = registration_source || (user_id ? 'REGISTERED' : 'WALK_IN');
        const finalApprovalStatus = approval_status || (user_id ? 'PENDING' : 'APPROVED');
        const finalQrUuid = (finalApprovalStatus === 'APPROVED')
            ? (qr_code_uuid || require('crypto').randomUUID())
            : null;

        const [result] = await db.execute(
            `INSERT INTO residents 
            (user_id, first_name, middle_name, last_name, sex, birthdate, age, contact_number, home_address, barangay, emergency_contact_name, emergency_contact_phone, vulnerability, family_size, has_special_needs, is_4ps, is_pregnant, is_lactating, is_pwd, is_single_head, has_serious_illness, serious_illness_details, qr_code_uuid, profile_photo, barangay_id_photo, approval_status, registration_source, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
            [
                user_id,
                first_name,
                middle_name || null,
                last_name,
                sex || 'Male',
                birthdate || null,
                age || null,
                contact_number,
                home_address,
                barangay,
                emergency_contact_name,
                emergency_contact_phone,
                vulnerability,
                family_size,
                has_special_needs,
                !!is_4ps,
                !!is_pregnant,
                !!is_lactating,
                !!is_pwd,
                !!is_single_head,
                !!has_serious_illness,
                serious_illness_details || null,
                finalQrUuid,
                profile_photo || null,
                barangay_id_photo || null,
                finalApprovalStatus,
                regSource
            ]
        );
        return result.insertId;
    },
    approve: async (residentId) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [rows] = await conn.execute('SELECT user_id, qr_code_uuid FROM residents WHERE id = ?', [residentId]);
            if (rows.length === 0) {
                await conn.commit();
                return false;
            }
            const crypto = require('crypto');
            const qrCode = rows[0].qr_code_uuid || crypto.randomUUID();
            await conn.execute("UPDATE residents SET approval_status = 'APPROVED', qr_code_uuid = ? WHERE id = ?", [qrCode, residentId]);
            if (rows[0].user_id) {
                await conn.execute("UPDATE users SET is_verified = 1 WHERE id = ?", [rows[0].user_id]);
            }
            await conn.commit();
            return true;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },
    reject: async (residentId) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [rows] = await conn.execute('SELECT user_id FROM residents WHERE id = ?', [residentId]);
            if (rows.length === 0) {
                await conn.commit();
                return false;
            }
            await conn.execute("UPDATE residents SET approval_status = 'REJECTED', qr_code_uuid = NULL WHERE id = ?", [residentId]);
            if (rows[0].user_id) {
                await conn.execute("UPDATE users SET is_verified = 0 WHERE id = ?", [rows[0].user_id]);
            }
            await conn.commit();
            return true;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },
    update: async (id, residentData) => {
        const {
            first_name,
            middle_name = null,
            last_name,
            sex = 'Male',
            birthdate = null,
            age = null,
            contact_number,
            home_address,
            barangay = null,
            emergency_contact_name = null,
            emergency_contact_phone = null,
            vulnerability = null,
            is_4ps = false,
            is_pregnant = false,
            is_lactating = false,
            is_pwd = false,
            is_single_head = false,
            has_serious_illness = false,
            serious_illness_details = null,
            family_size = null,
            has_special_needs = null,
            profile_photo,
            barangay_id_photo
        } = residentData;

        const [result] = await db.execute(
            `UPDATE residents 
            SET first_name = ?, 
                middle_name = ?, 
                last_name = ?, 
                sex = COALESCE(?, sex),
                birthdate = COALESCE(?, birthdate),
                age = COALESCE(?, age),
                contact_number = ?, 
                home_address = ?,
                barangay = COALESCE(?, barangay),
                emergency_contact_name = COALESCE(?, emergency_contact_name),
                emergency_contact_phone = COALESCE(?, emergency_contact_phone),
                vulnerability = COALESCE(?, vulnerability),
                is_4ps = COALESCE(?, is_4ps),
                is_pregnant = COALESCE(?, is_pregnant),
                is_lactating = COALESCE(?, is_lactating),
                is_pwd = COALESCE(?, is_pwd),
                is_single_head = COALESCE(?, is_single_head),
                has_serious_illness = COALESCE(?, has_serious_illness),
                serious_illness_details = COALESCE(?, serious_illness_details),
                family_size = COALESCE(?, family_size),
                has_special_needs = COALESCE(?, has_special_needs),
                profile_photo = COALESCE(?, profile_photo),
                barangay_id_photo = COALESCE(?, barangay_id_photo)
            WHERE id = ?`,
            [
                first_name || null,
                middle_name || null,
                last_name || null,
                sex || null,
                birthdate || null,
                age || null,
                contact_number || null,
                home_address || null,
                barangay || null,
                emergency_contact_name || null,
                emergency_contact_phone || null,
                vulnerability || null,
                is_4ps !== undefined ? !!is_4ps : null,
                is_pregnant !== undefined ? !!is_pregnant : null,
                is_lactating !== undefined ? !!is_lactating : null,
                is_pwd !== undefined ? !!is_pwd : null,
                is_single_head !== undefined ? !!is_single_head : null,
                has_serious_illness !== undefined ? !!has_serious_illness : null,
                serious_illness_details || null,
                family_size || null,
                has_special_needs !== undefined ? !!has_special_needs : null,
                profile_photo !== undefined ? profile_photo : null,
                barangay_id_photo !== undefined ? barangay_id_photo : null,
                id
            ]
        );
        return result.affectedRows;
    },
    getAllBarangays: async () => {
        const [rows] = await db.execute("SELECT DISTINCT barangay FROM residents WHERE barangay IS NOT NULL AND barangay != '' ORDER BY barangay ASC");
        const barangays = rows.map(r => r.barangay).filter(Boolean);
        if (!barangays.includes('San Rafael')) barangays.push('San Rafael');
        return barangays;
    },
    getTargetRecipients: async ({ targetAudience = 'all', barangay = null, selectedIds = [] }) => {
        let query = `
            SELECT 
                r.id,
                r.user_id,
                r.first_name,
                r.last_name,
                r.contact_number,
                r.barangay,
                r.home_address,
                r.vulnerability,
                (SELECT COUNT(*) FROM check_ins c WHERE c.resident_id = r.id AND c.status IN ('ACTIVE', 'CHECKED_IN')) > 0 AS is_evacuated
            FROM residents r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE (u.role IS NULL OR u.role = 'resident')
              AND COALESCE(r.status, 'ACTIVE') = 'ACTIVE'
              AND r.approval_status = 'APPROVED'
        `;

        const params = [];

        // Barangay & Zone filtering (matches barangay OR home_address)
        if (barangay && barangay !== 'all' && barangay !== 'ALL') {
            query += ` AND (r.barangay = ? OR r.barangay LIKE ? OR r.home_address LIKE ?)`;
            params.push(barangay, `%${barangay}%`, `%${barangay}%`);
        }

        // Audience filtering
        const normalizedAudience = (targetAudience || 'all').toLowerCase();

        if (normalizedAudience === 'evacuation_center' || normalizedAudience === 'evacuated') {
            query += ` AND EXISTS (SELECT 1 FROM check_ins c WHERE c.resident_id = r.id AND c.status IN ('ACTIVE', 'CHECKED_IN'))`;
        } else if (normalizedAudience === 'not_evacuated') {
            query += ` AND NOT EXISTS (SELECT 1 FROM check_ins c WHERE c.resident_id = r.id AND c.status IN ('ACTIVE', 'CHECKED_IN'))`;
        } else if (normalizedAudience === 'selected' || normalizedAudience === 'selected_residents') {
            if (Array.isArray(selectedIds) && selectedIds.length > 0) {
                const placeholders = selectedIds.map(() => '?').join(',');
                query += ` AND r.id IN (${placeholders})`;
                params.push(...selectedIds);
            } else {
                query += ` AND 1 = 0`; // No residents selected
            }
        }

        query += ` ORDER BY r.last_name ASC, r.first_name ASC`;

        const [rows] = await db.execute(query, params);

        const recipientPhones = rows.map(r => r.contact_number).filter(Boolean);
        const validPhones = recipientPhones.filter(p => isValidPhPhoneNumber(p));
        const targetUserIds = rows.map(r => r.user_id).filter(Boolean);

        return {
            residents: rows.map(r => ({
                id: r.id,
                user_id: r.user_id,
                name: `${r.first_name} ${r.last_name}`,
                first_name: r.first_name,
                last_name: r.last_name,
                contact: r.contact_number,
                barangay: r.barangay,
                home_address: r.home_address,
                zone: r.home_address || r.barangay || 'N/A',
                is_evacuated: !!r.is_evacuated,
                has_valid_phone: isValidPhPhoneNumber(r.contact_number),
                normalized_phone: isValidPhPhoneNumber(r.contact_number) ? formatPhPhoneNumber(r.contact_number) : null
            })),
            totalRecipients: rows.length,
            validPhoneCount: validPhones.length,
            recipientPhones: recipientPhones,
            targetUserIds: targetUserIds
        };
    }
};

module.exports = Resident;

