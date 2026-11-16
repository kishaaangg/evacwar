const db = require('../config/db');

const HouseholdMember = {
    syncFamilySize: async (residentId) => {
        try {
            const [rows] = await db.execute('SELECT COUNT(*) as count FROM household_members WHERE resident_id = ?', [residentId]);
            const memberCount = (rows[0] && rows[0].count) ? parseInt(rows[0].count, 10) : 0;
            const totalFamilySize = memberCount + 1; // 1 head of household + family members
            await db.execute('UPDATE residents SET family_size = ? WHERE id = ?', [totalFamilySize, residentId]);
            return totalFamilySize;
        } catch (err) {
            console.error('Error syncing family size:', err);
        }
    },
    findByResidentId: async (residentId) => {
        const [rows] = await db.execute('SELECT * FROM household_members WHERE resident_id = ? ORDER BY id ASC', [residentId]);
        return rows;
    },
    findById: async (id) => {
        const [rows] = await db.execute('SELECT * FROM household_members WHERE id = ?', [id]);
        return rows[0];
    },
    create: async (memberData) => {
        const {
            resident_id,
            first_name,
            middle_name = null,
            last_name,
            relation = 'Family Member',
            sex = 'Male',
            birthdate = null,
            age = 0,
            status = null,
            profile_photo = null,
            is_pregnant = false,
            is_lactating = false,
            is_pwd = false,
            has_serious_illness = false,
            serious_illness_details = null
        } = memberData;

        const [result] = await db.execute(
            `INSERT INTO household_members 
            (resident_id, first_name, middle_name, last_name, relation, sex, birthdate, age, status, profile_photo, is_pregnant, is_lactating, is_pwd, has_serious_illness, serious_illness_details) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                resident_id,
                first_name,
                middle_name || null,
                last_name,
                relation || 'Family Member',
                sex || 'Male',
                birthdate || null,
                age || 0,
                status || null,
                profile_photo || null,
                !!is_pregnant,
                !!is_lactating,
                !!is_pwd,
                !!has_serious_illness,
                serious_illness_details || null
            ]
        );
        await HouseholdMember.syncFamilySize(resident_id);
        return result.insertId;
    },
    delete: async (id, residentId) => {
        const [result] = await db.execute('DELETE FROM household_members WHERE id = ? AND resident_id = ?', [id, residentId]);
        if (result.affectedRows > 0) {
            await HouseholdMember.syncFamilySize(residentId);
        }
        return result.affectedRows;
    },
    update: async (id, residentId, memberData) => {
        const {
            first_name,
            middle_name = null,
            last_name,
            relation = 'Family Member',
            sex = 'Male',
            birthdate = null,
            age = 0,
            status = null,
            profile_photo,
            is_pregnant = false,
            is_lactating = false,
            is_pwd = false,
            has_serious_illness = false,
            serious_illness_details = null
        } = memberData;

        const [result] = await db.execute(
            `UPDATE household_members 
            SET first_name = ?, 
                middle_name = ?, 
                last_name = ?, 
                relation = ?, 
                sex = ?, 
                birthdate = ?, 
                age = ?, 
                status = ?, 
                profile_photo = COALESCE(?, profile_photo),
                is_pregnant = ?, 
                is_lactating = ?, 
                is_pwd = ?, 
                has_serious_illness = ?, 
                serious_illness_details = ?
            WHERE id = ? AND resident_id = ?`,
            [
                first_name,
                middle_name || null,
                last_name,
                relation || 'Family Member',
                sex || 'Male',
                birthdate || null,
                age || 0,
                status || null,
                profile_photo !== undefined ? profile_photo : null,
                !!is_pregnant,
                !!is_lactating,
                !!is_pwd,
                !!has_serious_illness,
                serious_illness_details || null,
                id,
                residentId
            ]
        );
        await HouseholdMember.syncFamilySize(residentId);
        return result.affectedRows;
    }
};

module.exports = HouseholdMember;

