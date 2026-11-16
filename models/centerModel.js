const db = require('../config/db');
const autoCheckout = require('../utils/autoCheckout');

const Center = {
    autoCheckoutExpired: async (io) => {
        return await autoCheckout.checkAndCheckoutExpired(io);
    },
    findAll: async () => {
        // Automatically check out any active check-ins older than 24 hours
        try {
            await autoCheckout.checkAndCheckoutExpired();
        } catch (e) {
            console.error('[Center.findAll] autoCheckout error:', e);
        }

        const [rows] = await db.execute('SELECT * FROM evacuation_centers');
        if (!rows || rows.length === 0) return [];

        // Fetch all active check-ins with household member details in a single batch query
        const [checkins] = await db.execute(`
            SELECT 
                c.center_id, 
                c.resident_id,
                c.household_member_id,
                r.first_name as res_first_name, 
                r.last_name as res_last_name,
                hm.first_name as mem_first_name,
                hm.last_name as mem_last_name,
                hm.relation as mem_relation
            FROM check_ins c 
            JOIN residents r ON c.resident_id = r.id 
            LEFT JOIN household_members hm ON c.household_member_id = hm.id
            WHERE c.status IN ('ACTIVE', 'CHECKED_IN') 
            ORDER BY c.check_in_time DESC
        `);

        // Fetch assigned staff across all centers (one site per staff via staff.assigned_center_id)
        const [legacyStaffRows] = await db.execute(`
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
                s.assigned_center_id as center_id
            FROM staff s
            WHERE s.assigned_center_id IS NOT NULL
            ORDER BY s.first_name ASC
        `);

        const checkinMap = {};
        const staffMap = {};
        const familyMap = {};

        for (let i = 0; i < rows.length; i++) {
            rows[i].checked_in_residents = [];
            rows[i].assigned_staff = [];
            checkinMap[rows[i].id] = rows[i].checked_in_residents;
            staffMap[rows[i].id] = rows[i].assigned_staff;
            familyMap[rows[i].id] = new Set();
        }

        for (let i = 0; i < checkins.length; i++) {
            const row = checkins[i];
            if (row.resident_id && familyMap[row.center_id]) {
                familyMap[row.center_id].add(row.resident_id);
            }
            if (checkinMap[row.center_id]) {
                const isMember = row.household_member_id !== null && row.mem_first_name;
                const personName = isMember
                    ? `${row.mem_first_name || ''} ${row.mem_last_name || ''}`.trim()
                    : `${row.res_first_name || ''} ${row.res_last_name || ''}`.trim();
                const relation = isMember ? (row.mem_relation || 'Family Member') : 'Head';

                checkinMap[row.center_id].push({
                    name: personName || 'Resident',
                    relation: relation,
                    is_head: !isMember,
                    toString: function() { return this.name; }
                });
            }
        }

        // Map assigned staff uniquely
        const seenStaffPerCenter = new Set();
        const addStaffToCenter = (item) => {
            if (!item.center_id || !staffMap[item.center_id]) return;
            const key = `${item.center_id}_${item.user_id}`;
            if (!seenStaffPerCenter.has(key)) {
                seenStaffPerCenter.add(key);
                staffMap[item.center_id].push({
                    id: item.staff_id,
                    user_id: item.user_id,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    name: item.full_name,
                    full_name: item.full_name,
                    contact: item.contact_number || 'N/A',
                    contact_number: item.contact_number || 'N/A',
                    occupation: item.occupation || 'Emergency Staff',
                    staff_type: item.staff_type || 'BOTH',
                    profile_photo: item.profile_photo || null
                });
            }
        };

        legacyStaffRows.forEach(addStaffToCenter);

        // Populate computed statistics for live cards and map consumers
        for (let i = 0; i < rows.length; i++) {
            const cap = parseInt(rows[i].max_capacity, 10) || 25;
            const occ = parseInt(rows[i].current_occupancy, 10) || 0;
            rows[i].families = familyMap[rows[i].id] ? familyMap[rows[i].id].size : 0;
            rows[i].total_families = rows[i].families;
            rows[i].available_slots = Math.max(0, cap - occ);
            rows[i].occupancy_pct = cap > 0 ? Math.min(100, Math.round((occ / cap) * 100)) : 0;
            rows[i].is_full = occ >= cap;
            rows[i].status = rows[i].is_full ? 'FULL CAPACITY' : 'ACCEPTING EVACUEES';
        }

        return rows;
    },
    countAll: async () => {
        const [rows] = await db.execute('SELECT COUNT(*) as count FROM evacuation_centers');
        return rows[0].count || 0;
    },
    findById: async (id) => {
        const [rows] = await db.execute('SELECT * FROM evacuation_centers WHERE id = ?', [id]);
        if (!rows[0]) return null;
        const center = rows[0];

        // Fetch assigned staff for this center
        const Staff = require('./staffModel');
        center.assigned_staff = await Staff.getStaffByCenterId(id);
        return center;
    },
    create: async (centerData) => {
        const contactNum = centerData.contact_number || centerData.contactNumber || '0912-345-6789';
        const ownerName = centerData.owner_name || centerData.ownerName || null;
        const cappedCapacity = Math.max(1, parseInt(centerData.max_capacity, 10) || 50);
        const [result] = await db.execute(
            'INSERT INTO evacuation_centers (name, owner_name, address, contact_number, latitude, longitude, max_capacity, current_occupancy, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [centerData.name, ownerName, centerData.address, contactNum, centerData.latitude, centerData.longitude, cappedCapacity, 0, 'OPEN']
        );
        return result.insertId;
    },
    delete: async (id) => {
        const [result] = await db.execute('DELETE FROM evacuation_centers WHERE id = ?', [id]);
        return result.affectedRows;
    },
    updateOccupancy: async (id, occupancy) => {
        const [result] = await db.execute(
            'UPDATE evacuation_centers SET current_occupancy = ? WHERE id = ?',
            [occupancy, id]
        );
        return result.affectedRows;
    },
    syncOccupancy: async (centerId) => {
        const [rows] = await db.execute(
            "SELECT COUNT(*) as count FROM check_ins WHERE center_id = ? AND status IN ('ACTIVE', 'CHECKED_IN')",
            [centerId]
        );
        const count = rows[0]?.count || 0;
        await db.execute('UPDATE evacuation_centers SET current_occupancy = ? WHERE id = ?', [count, centerId]);
        return count;
    },
    update: async (id, centerData) => {
        const contactNum = centerData.contact_number || centerData.contactNumber || '0912-345-6789';
        const ownerName = centerData.owner_name !== undefined ? (centerData.owner_name || null) : null;
        const cappedCapacity = Math.max(1, parseInt(centerData.max_capacity, 10) || 50);
        const [result] = await db.execute(
            'UPDATE evacuation_centers SET name = ?, owner_name = ?, address = ?, contact_number = ?, latitude = ?, longitude = ?, max_capacity = ? WHERE id = ?',
            [centerData.name, ownerName, centerData.address, contactNum, centerData.latitude, centerData.longitude, cappedCapacity, id]
        );
        return result.affectedRows;
    },
    syncAssignedStaff: async (centerId, staffUserIds) => {
        const Staff = require('./staffModel');
        const parsedCenterId = parseInt(centerId, 10);
        const validStaffUserIds = Array.isArray(staffUserIds) ? staffUserIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id) && id > 0) : [];
        
        // Get staff currently assigned to this center
        const currentStaff = await Staff.getStaffByCenterId(parsedCenterId);
        
        // Remove staff no longer selected
        for (const s of currentStaff) {
            if (!validStaffUserIds.includes(s.user_id)) {
                const sCenters = await Staff.getAssignedCenters(s.user_id, null);
                const newCenters = sCenters.map(c => c.id).filter(cid => cid !== parsedCenterId);
                await Staff.syncAssignedCenters(s.user_id, newCenters);
            }
        }
        
        // Add newly assigned staff (up to 3 sites max)
        for (const uId of validStaffUserIds) {
            const sMember = await Staff.findByUserId(uId);
            if (sMember && (sMember.staff_type === 'EVACUATION' || sMember.staff_type === 'BOTH')) {
                const currentCenters = await Staff.getAssignedCenters(uId, sMember.assigned_center_id);
                const currentCenterIds = currentCenters.map(c => c.id);
                if (!currentCenterIds.includes(parsedCenterId) && currentCenterIds.length < 3) {
                    currentCenterIds.push(parsedCenterId);
                    await Staff.syncAssignedCenters(uId, currentCenterIds);
                }
            }
        }
    },
    getEcBoardStats: async (centerId) => {
        // Fetch center details and stats in parallel
        const [center, [activeRows], [todayCheckInsResult], [todayCheckOutsResult]] = await Promise.all([
            Center.findById(centerId),
            db.execute(`
                SELECT 
                    c.id as check_in_id,
                    c.resident_id,
                    c.household_member_id,
                    c.check_in_time,
                    c.check_in_method,
                    r.first_name as res_first_name,
                    r.last_name as res_last_name,
                    r.sex as res_sex,
                    r.birthdate as res_birthdate,
                    r.age as res_age,
                    r.barangay as res_barangay,
                    r.is_4ps as res_is_4ps,
                    r.is_pregnant as res_is_pregnant,
                    r.is_lactating as res_is_lactating,
                    r.is_pwd as res_is_pwd,
                    r.is_single_head as res_is_single_head,
                    r.has_serious_illness as res_has_serious_illness,
                    r.serious_illness_details as res_serious_illness_details,
                    r.vulnerability as res_vulnerability,
                    hm.first_name as mem_first_name,
                    hm.last_name as mem_last_name,
                    hm.relation as mem_relation,
                    hm.sex as mem_sex,
                    hm.birthdate as mem_birthdate,
                    hm.age as mem_age,
                    hm.status as mem_status,
                    hm.is_pregnant as mem_is_pregnant,
                    hm.is_lactating as mem_is_lactating,
                    hm.is_pwd as mem_is_pwd,
                    hm.has_serious_illness as mem_has_serious_illness,
                    hm.serious_illness_details as mem_serious_illness_details
                FROM check_ins c
                JOIN residents r ON c.resident_id = r.id
                LEFT JOIN household_members hm ON c.household_member_id = hm.id
                WHERE c.center_id = ? AND c.status IN ('ACTIVE', 'CHECKED_IN')
                ORDER BY c.check_in_time DESC
            `, [centerId]),
            db.execute(`
                SELECT COUNT(*) as count FROM check_ins 
                WHERE center_id = ? AND DATE(check_in_time) = CURDATE()
            `, [centerId]),
            db.execute(`
                SELECT COUNT(*) as count FROM check_ins 
                WHERE center_id = ? AND status IN ('DEPARTED', 'CHECKED_OUT') AND DATE(check_out_time) = CURDATE()
            `, [centerId])
        ]);

        if (!center) return null;

        const checkInsToday = todayCheckInsResult[0]?.count || 0;
        const checkOutsToday = todayCheckOutsResult[0]?.count || 0;

        // Distinct families currently present
        const familySet = new Set();
        const fourPsFamilySet = new Set();

        // Special Categories counts
        let pregnantCount = 0;
        let lactatingCount = 0;
        let pwdCount = 0;
        let singleHeadCount = 0;
        let seriousIllnessCount = 0;

        // Age + Sex Matrix
        // Age groups: 0-11m, 1-3y, 4-5y, 6-12y, 13-18y, 19-59y, 60+y
        const ageGroups = {
            '0_11m': { label: '0–11 months', male: 0, female: 0, total: 0 },
            '1_3y':  { label: '1–3 years', male: 0, female: 0, total: 0 },
            '4_5y':  { label: '4–5 years', male: 0, female: 0, total: 0 },
            '6_12y': { label: '6–12 years', male: 0, female: 0, total: 0 },
            '13_18y':{ label: '13–18 years', male: 0, female: 0, total: 0 },
            '19_59y':{ label: '19–59 years', male: 0, female: 0, total: 0 },
            '60plus':{ label: '60+ years', male: 0, female: 0, total: 0 }
        };

        let totalMale = 0;
        let totalFemale = 0;

        // Process each checked-in individual
        activeRows.forEach(row => {
            const isHead = row.household_member_id === null;
            familySet.add(row.resident_id);

            if (row.res_is_4ps) {
                fourPsFamilySet.add(row.resident_id);
            }

            // Determine Sex (normalized)
            const rawSex = isHead ? (row.res_sex || 'Male') : (row.mem_sex || 'Male');
            const sex = (rawSex.toLowerCase() === 'female' || rawSex.toLowerCase() === 'f') ? 'Female' : 'Male';
            if (sex === 'Female') totalFemale++;
            else totalMale++;

            // Determine Age
            let age = 30; // default adult
            const birthdate = isHead ? row.res_birthdate : row.mem_birthdate;
            const explicitAge = isHead ? row.res_age : row.mem_age;

            if (birthdate) {
                const diffMs = Date.now() - new Date(birthdate).getTime();
                const ageDt = new Date(diffMs);
                age = Math.abs(ageDt.getUTCFullYear() - 1970);
            } else if (explicitAge !== null && explicitAge !== undefined && explicitAge !== '') {
                age = parseInt(explicitAge, 10) || 0;
            }

            // Categorize into age bucket
            let bucket = '19_59y';
            if (age < 1) bucket = '0_11m';
            else if (age >= 1 && age <= 3) bucket = '1_3y';
            else if (age >= 4 && age <= 5) bucket = '4_5y';
            else if (age >= 6 && age <= 12) bucket = '6_12y';
            else if (age >= 13 && age <= 18) bucket = '13_18y';
            else if (age >= 19 && age <= 59) bucket = '19_59y';
            else if (age >= 60) bucket = '60plus';

            if (sex === 'Female') {
                ageGroups[bucket].female++;
            } else {
                ageGroups[bucket].male++;
            }
            ageGroups[bucket].total++;

            // Special categories
            const isPregnant = isHead ? !!row.res_is_pregnant : !!row.mem_is_pregnant;
            const isLactating = isHead ? !!row.res_is_lactating : !!row.mem_is_lactating;
            const isPwd = isHead 
                ? (!!row.res_is_pwd || (row.res_vulnerability && row.res_vulnerability.toLowerCase().includes('pwd')))
                : (!!row.mem_is_pwd || (row.mem_status && row.mem_status.toLowerCase().includes('pwd')));
            const isSingleHead = isHead ? !!row.res_is_single_head : false;
            const hasSeriousIllness = isHead 
                ? (!!row.res_has_serious_illness || (row.res_vulnerability && (row.res_vulnerability.toLowerCase().includes('illness') || row.res_vulnerability.toLowerCase().includes('bedridden'))))
                : (!!row.mem_has_serious_illness || (row.mem_status && (row.mem_status.toLowerCase().includes('illness') || row.mem_status.toLowerCase().includes('bedridden'))));

            if (isPregnant) pregnantCount++;
            if (isLactating) lactatingCount++;
            if (isPwd) pwdCount++;
            if (isSingleHead) singleHeadCount++;
            if (hasSeriousIllness) seriousIllnessCount++;
        });

        const totalEvacuees = activeRows.length;
        const maxCapacity = center.max_capacity || 0;
        const availableSlots = Math.max(0, maxCapacity - totalEvacuees);
        const occupancyRate = maxCapacity > 0 ? Math.min(100, Math.round((totalEvacuees / maxCapacity) * 100)) : 0;

        const summaryObj = {
            total_checked_in: totalEvacuees,
            total_families: familySet.size,
            four_ps_count: fourPsFamilySet.size,
            total_male: totalMale,
            total_female: totalFemale,
            capacity: maxCapacity,
            available_slots: availableSlots,
            occupancy_rate: `${occupancyRate}%`,
            is_full: totalEvacuees >= maxCapacity,
            today_checkins: checkInsToday,
            today_checkouts: checkOutsToday
        };

        const ageBreakdownObj = {
            '0-11m': ageGroups['0_11m'],
            '1-3y': ageGroups['1_3y'],
            '4-5y': ageGroups['4_5y'],
            '6-12y': ageGroups['6_12y'],
            '13-18y': ageGroups['13_18y'],
            '19-59y': ageGroups['19_59y'],
            '60+y': ageGroups['60plus']
        };

        return {
            center: {
                id: center.id,
                name: center.name,
                address: center.address,
                contact_number: center.contact_number || '0912-345-6789',
                max_capacity: maxCapacity,
                current_occupancy: totalEvacuees,
                available_slots: availableSlots,
                occupancy_rate: occupancyRate,
                status: center.status || 'OPEN'
            },
            summary: summaryObj,
            metrics: {
                total_evacuees: totalEvacuees,
                total_families: familySet.size,
                total_4ps_beneficiaries: fourPsFamilySet.size,
                total_male: totalMale,
                total_female: totalFemale,
                check_ins_today: checkInsToday,
                check_outs_today: checkOutsToday
            },
            age_groups: ageGroups,
            age_breakdown: ageBreakdownObj,
            special_categories: {
                pregnant: pregnantCount,
                lactating: lactatingCount,
                pwd: pwdCount,
                single_headed: singleHeadCount,
                single_headed_households: singleHeadCount,
                serious_illness: seriousIllnessCount
            },
            evacuees: activeRows.map(r => ({
                check_in_id: r.check_in_id,
                resident_id: r.resident_id,
                household_member_id: r.household_member_id,
                is_head: r.household_member_id === null,
                name: r.household_member_id === null ? `${r.res_first_name} ${r.res_last_name}` : `${r.mem_first_name} ${r.mem_last_name}`,
                head_name: `${r.res_first_name} ${r.res_last_name}`,
                relation: r.household_member_id === null ? 'Head' : (r.mem_relation || 'Family'),
                sex: r.household_member_id === null ? (r.res_sex || 'Male') : (r.mem_sex || 'Male'),
                age: r.household_member_id === null ? r.res_age : r.mem_age,
                barangay: r.res_barangay || 'San Rafael',
                is_4ps: !!r.res_is_4ps,
                is_pregnant: r.household_member_id === null ? !!r.res_is_pregnant : !!r.mem_is_pregnant,
                is_lactating: r.household_member_id === null ? !!r.res_is_lactating : !!r.mem_is_lactating,
                is_pwd: r.household_member_id === null ? !!r.res_is_pwd : !!r.mem_is_pwd,
                has_serious_illness: r.household_member_id === null ? !!r.res_has_serious_illness : !!r.mem_has_serious_illness,
                check_in_time: r.check_in_time,
                check_in_method: r.check_in_method || 'QR'
            }))
        };
    },
    getAllEcBoardStats: async () => {
        // Fetch all centers, active check-ins across all centers, and today's stats in parallel
        const [centers, [allActiveRows], [todayStatsRows]] = await Promise.all([
            Center.findAll(),
            db.execute(`
                SELECT 
                    c.id as check_in_id,
                    c.center_id,
                    c.resident_id,
                    c.household_member_id,
                    c.check_in_time,
                    c.check_in_method,
                    r.first_name as res_first_name,
                    r.last_name as res_last_name,
                    r.sex as res_sex,
                    r.birthdate as res_birthdate,
                    r.age as res_age,
                    r.barangay as res_barangay,
                    r.is_4ps as res_is_4ps,
                    r.is_pregnant as res_is_pregnant,
                    r.is_lactating as res_is_lactating,
                    r.is_pwd as res_is_pwd,
                    r.is_single_head as res_is_single_head,
                    r.has_serious_illness as res_has_serious_illness,
                    r.vulnerability as res_vulnerability,
                    hm.first_name as mem_first_name,
                    hm.last_name as mem_last_name,
                    hm.relation as mem_relation,
                    hm.sex as mem_sex,
                    hm.birthdate as mem_birthdate,
                    hm.age as mem_age,
                    hm.status as mem_status,
                    hm.is_pregnant as mem_is_pregnant,
                    hm.is_lactating as mem_is_lactating,
                    hm.is_pwd as mem_is_pwd,
                    hm.has_serious_illness as mem_has_serious_illness,
                    hm.serious_illness_details as mem_serious_illness_details
                FROM check_ins c
                JOIN residents r ON c.resident_id = r.id
                LEFT JOIN household_members hm ON c.household_member_id = hm.id
                WHERE c.status IN ('ACTIVE', 'CHECKED_IN')
                ORDER BY c.check_in_time DESC
            `),
            db.execute(`
                SELECT center_id,
                       SUM(CASE WHEN DATE(check_in_time) = CURDATE() THEN 1 ELSE 0 END) as check_ins_today,
                       SUM(CASE WHEN status IN ('DEPARTED', 'CHECKED_OUT') AND DATE(check_out_time) = CURDATE() THEN 1 ELSE 0 END) as check_outs_today
                FROM check_ins
                GROUP BY center_id
            `)
        ]);

        // Group rows by center
        const rowsByCenter = {};
        allActiveRows.forEach(row => {
            if (!rowsByCenter[row.center_id]) rowsByCenter[row.center_id] = [];
            rowsByCenter[row.center_id].push(row);
        });

        let totalCapacity = 0;
        let totalEvacuees = 0;
        let totalMale = 0;
        let totalFemale = 0;

        let pregnantCount = 0;
        let lactatingCount = 0;
        let pwdCount = 0;
        let singleHeadCount = 0;
        let seriousIllnessCount = 0;

        const familySet = new Set();
        const fourPsFamilySet = new Set();

        const ageGroups = {
            '0_11m': { label: '0–11 months', male: 0, female: 0, total: 0 },
            '1_3y':  { label: '1–3 years', male: 0, female: 0, total: 0 },
            '4_5y':  { label: '4–5 years', male: 0, female: 0, total: 0 },
            '6_12y': { label: '6–12 years', male: 0, female: 0, total: 0 },
            '13_18y':{ label: '13–18 years', male: 0, female: 0, total: 0 },
            '19_59y':{ label: '19–59 years', male: 0, female: 0, total: 0 },
            '60plus':{ label: '60+ years', male: 0, female: 0, total: 0 }
        };

        const centerSummaries = [];

        for (const center of centers) {
            const activeRows = rowsByCenter[center.id] || [];
            const cCap = center.max_capacity || 0;
            const cOcc = activeRows.length;
            const cAvail = Math.max(0, cCap - cOcc);

            const centerFamilySet = new Set();

            activeRows.forEach(row => {
                const isHead = row.household_member_id === null;
                centerFamilySet.add(row.resident_id);

                const famKey = `${center.id}_${row.resident_id}`;
                familySet.add(famKey);
                if (row.res_is_4ps) fourPsFamilySet.add(famKey);

                const rawSex = isHead ? (row.res_sex || 'Male') : (row.mem_sex || 'Male');
                const sex = (rawSex.toLowerCase() === 'female' || rawSex.toLowerCase() === 'f') ? 'Female' : 'Male';
                if (sex === 'Female') {
                    totalFemale++;
                } else {
                    totalMale++;
                }

                let age = 30;
                const birthdate = isHead ? row.res_birthdate : row.mem_birthdate;
                const explicitAge = isHead ? row.res_age : row.mem_age;
                if (birthdate) {
                    const diffMs = Date.now() - new Date(birthdate).getTime();
                    const ageDt = new Date(diffMs);
                    age = Math.abs(ageDt.getUTCFullYear() - 1970);
                } else if (explicitAge !== null && explicitAge !== undefined && explicitAge !== '') {
                    age = parseInt(explicitAge, 10) || 0;
                }

                let bucket = '19_59y';
                if (age < 1) bucket = '0_11m';
                else if (age >= 1 && age <= 3) bucket = '1_3y';
                else if (age >= 4 && age <= 5) bucket = '4_5y';
                else if (age >= 6 && age <= 12) bucket = '6_12y';
                else if (age >= 13 && age <= 18) bucket = '13_18y';
                else if (age >= 19 && age <= 59) bucket = '19_59y';
                else if (age >= 60) bucket = '60plus';

                if (sex === 'Female') {
                    ageGroups[bucket].female++;
                } else {
                    ageGroups[bucket].male++;
                }
                ageGroups[bucket].total++;

                const isPregnant = isHead ? !!row.res_is_pregnant : !!row.mem_is_pregnant;
                const isLactating = isHead ? !!row.res_is_lactating : !!row.mem_is_lactating;
                const isPwd = isHead 
                    ? (!!row.res_is_pwd || (row.res_vulnerability && row.res_vulnerability.toLowerCase().includes('pwd')))
                    : (!!row.mem_is_pwd || (row.mem_status && row.mem_status.toLowerCase().includes('pwd')));
                const isSingleHead = isHead ? !!row.res_is_single_head : false;
                const hasSeriousIllness = isHead 
                    ? (!!row.res_has_serious_illness || (row.res_vulnerability && (row.res_vulnerability.toLowerCase().includes('illness') || row.res_vulnerability.toLowerCase().includes('bedridden'))))
                    : (!!row.mem_has_serious_illness || (row.mem_status && (row.mem_status.toLowerCase().includes('illness') || row.mem_status.toLowerCase().includes('bedridden'))));

                if (isPregnant) pregnantCount++;
                if (isLactating) lactatingCount++;
                if (isPwd) pwdCount++;
                if (isSingleHead) singleHeadCount++;
                if (hasSeriousIllness) seriousIllnessCount++;
            });

            totalCapacity += cCap;
            totalEvacuees += cOcc;

            centerSummaries.push({
                id: center.id,
                name: center.name,
                address: center.address,
                contact_number: center.contact_number || '0912-345-6789',
                capacity: cCap,
                occupied: cOcc,
                available: cAvail,
                families: centerFamilySet.size,
                status: center.status || 'OPEN'
            });
        }

        const totalAvailableSlots = Math.max(0, totalCapacity - totalEvacuees);

        return {
            summary: {
                total_checked_in: totalEvacuees,
                total_families: familySet.size,
                four_ps_count: fourPsFamilySet.size,
                total_male: totalMale,
                total_female: totalFemale,
                capacity: totalCapacity,
                total_occupied: totalEvacuees,
                available_slots: totalAvailableSlots,
                occupancy_rate: totalCapacity > 0 ? `${Math.round((totalEvacuees / totalCapacity) * 100)}%` : '0%'
            },
            metrics: {
                total_evacuees: totalEvacuees,
                total_families: familySet.size,
                total_4ps_beneficiaries: fourPsFamilySet.size,
                total_male: totalMale,
                total_female: totalFemale
            },
            age_groups: ageGroups,
            special_categories: {
                pregnant: pregnantCount,
                lactating: lactatingCount,
                pwd: pwdCount,
                single_headed: singleHeadCount,
                serious_illness: seriousIllnessCount
            },
            center_summaries: centerSummaries
        };
    }
};

module.exports = Center;

