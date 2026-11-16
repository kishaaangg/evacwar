const db = require('../config/db');
const fs = require('fs');
const path = require('path');

let migrationAlreadyRun = false;

async function runMigration() {
    if (migrationAlreadyRun) return;
    try {
        console.log("Checking migration status...");

        // Ensure resident verification & ID photo columns exist
        try {
            const [apprCol] = await db.query(`SHOW COLUMNS FROM residents LIKE 'approval_status'`);
            if (apprCol.length === 0) {
                await db.query(`ALTER TABLE residents ADD COLUMN approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING'`);
                console.log("Added column approval_status to residents");
                // Default existing active/seeded users and walk-ins to APPROVED so existing test data functions seamlessly
                await db.query(`
                    UPDATE residents r
                    LEFT JOIN users u ON r.user_id = u.id
                    SET r.approval_status = 'APPROVED'
                    WHERE r.user_id IS NULL OR u.is_verified = 1
                `);
            }
            const [idPhotoCol] = await db.query(`SHOW COLUMNS FROM residents LIKE 'barangay_id_photo'`);
            if (idPhotoCol.length === 0) {
                await db.query(`ALTER TABLE residents ADD COLUMN barangay_id_photo VARCHAR(255) DEFAULT NULL`);
                console.log("Added column barangay_id_photo to residents");
            }
            const [qrCol] = await db.query(`SHOW COLUMNS FROM residents LIKE 'qr_code_uuid'`);
            if (qrCol.length > 0 && qrCol[0].Null === 'NO') {
                await db.query(`ALTER TABLE residents MODIFY COLUMN qr_code_uuid VARCHAR(36) NULL DEFAULT NULL`);
                console.log("Modified residents.qr_code_uuid to allow NULL for pending accounts");
            }
            // Safeguard: Ensure all admin & staff accounts are verified and never queued for resident ID approval
            await db.query(`UPDATE users SET is_verified = 1 WHERE role IN ('admin', 'staff', 'barangay_council')`);
            await db.query(`UPDATE residents r JOIN users u ON r.user_id = u.id SET r.approval_status = 'APPROVED' WHERE u.role IN ('admin', 'staff', 'barangay_council')`);
        } catch (colErr) {
            console.warn("Resident approval columns check notice:", colErr.message);
        }

        // Retired table: staff now have one site via staff.assigned_center_id
        await db.query('DROP TABLE IF EXISTS staff_evacuation_assignments').catch(() => {});

        // Fast-path: Skip 35+ sequential DDL queries if core migration tables already exist
        const [existingTables] = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
              AND table_name IN ('offline_sync_log', 'push_subscriptions', 'sessions')
        `);

        if (existingTables && existingTables.length >= 3) {
            console.log("Schema already verified and up-to-date. Migration completed in fast mode.");
            migrationAlreadyRun = true;
            return;
        }

        console.log("Running migration...");

        // Ensure database tables exist by executing init.sql statements safely
        const initSqlPath = path.join(__dirname, '..', 'database', 'init.sql');
        if (fs.existsSync(initSqlPath)) {
            const sqlStatements = fs.readFileSync(initSqlPath, 'utf8');
            const statements = sqlStatements.split(';').map(s => s.trim()).filter(s => s.length > 0);
            for (const statement of statements) {
                try {
                    await db.query(statement);
                } catch (e) {
                    // Ignore already exists / duplicate table errors during setup
                }
            }
        }

        // Add missing columns safely
        const addColumnSafely = async (table, column, definition) => {
            try {
                const [cols] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
                if (cols.length === 0) {
                    await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
                    console.log(`Added column ${column} to ${table}`);
                }
            } catch (err) {
                console.error(`Error checking/adding column ${column} to ${table}:`, err.message);
            }
        };

        // Create staff table if not exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS staff (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL UNIQUE,
                first_name VARCHAR(100) NOT NULL,
                middle_name VARCHAR(100) DEFAULT NULL,
                last_name VARCHAR(100) NOT NULL,
                occupation VARCHAR(100) DEFAULT 'Emergency Staff',
                staff_type ENUM('EVACUATION', 'RESCUER', 'BOTH') DEFAULT 'BOTH',
                assigned_center_id INT DEFAULT NULL,
                contact_number VARCHAR(20) DEFAULT NULL,
                profile_photo VARCHAR(255) DEFAULT NULL,
                status ENUM('ACTIVE', 'INACTIVE', 'ON_DUTY', 'OFF_DUTY') DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                CONSTRAINT fk_staff_user
                    FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `);

        // Create persistent sessions table if not exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                sid VARCHAR(128) NOT NULL,
                session_data MEDIUMTEXT NOT NULL,
                expires BIGINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (sid),
                INDEX idx_sessions_expires (expires)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        // Migrate existing staff from users / residents into staff table
        try {
            const [staffUsers] = await db.query(`
                SELECT u.id as user_id, u.email,
                       r.id as resident_id, r.first_name, r.middle_name, r.last_name, r.contact_number, r.profile_photo
                FROM users u
                LEFT JOIN residents r ON u.id = r.user_id
                WHERE u.role IN ('staff', 'barangay_council')
            `);

            for (const su of staffUsers) {
                const [existingStaff] = await db.query('SELECT id FROM staff WHERE user_id = ?', [su.user_id]);
                if (existingStaff.length === 0) {
                    const firstName = su.first_name || (su.email ? su.email.split('@')[0] : 'Staff');
                    const lastName = su.last_name || 'Member';
                    const middleName = su.middle_name || null;
                    const staffType = 'BOTH';
                    const assignedCenterId = null;
                    const contactNumber = su.contact_number || null;
                    const profilePhoto = su.profile_photo || null;

                    await db.query(`
                        INSERT INTO staff (user_id, first_name, middle_name, last_name, occupation, staff_type, assigned_center_id, contact_number, profile_photo, status)
                        VALUES (?, ?, ?, ?, 'Emergency Staff', ?, ?, ?, ?, 'ACTIVE')
                    `, [
                        su.user_id,
                        firstName,
                        middleName,
                        lastName,
                        staffType,
                        assignedCenterId,
                        contactNumber,
                        profilePhoto
                    ]);
                    console.log(`Migrated staff record for user_id ${su.user_id} (${firstName} ${lastName})`);
                }
            }
        } catch (migErr) {
            console.error('Error during staff data migration:', migErr.message);
        }

        const dropColumnSafely = async (table, column) => {
            try {
                const [cols] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
                if (cols.length > 0) {
                    await db.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
                    console.log(`Dropped legacy column ${column} from ${table}`);
                }
            } catch (err) {
                console.error(`Error dropping column ${column} from ${table}:`, err.message);
            }
        };

        // Safely drop legacy staff-specific columns from users & staff tables
        await dropColumnSafely('users', 'staff_type');
        await dropColumnSafely('users', 'assigned_center_id');
        await dropColumnSafely('users', 'assigned_barangay');
        await dropColumnSafely('users', 'profile_photo');
        await dropColumnSafely('staff', 'assigned_barangay');

        // Residents table enhancements
        await addColumnSafely('residents', 'middle_name', "VARCHAR(100) DEFAULT NULL AFTER first_name");
        await addColumnSafely('residents', 'sex', "ENUM('Male', 'Female') DEFAULT 'Male' AFTER last_name");
        await addColumnSafely('residents', 'birthdate', "DATE DEFAULT NULL AFTER sex");
        await addColumnSafely('residents', 'age', "INT DEFAULT NULL AFTER birthdate");
        await addColumnSafely('residents', 'barangay', "VARCHAR(100) DEFAULT 'San Rafael'");
        await addColumnSafely('residents', 'emergency_contact_name', "VARCHAR(100) DEFAULT NULL");
        await addColumnSafely('residents', 'emergency_contact_phone', "VARCHAR(20) DEFAULT NULL");
        await addColumnSafely('residents', 'vulnerability', "VARCHAR(100) DEFAULT 'None'");
        await addColumnSafely('residents', 'is_4ps', "BOOLEAN DEFAULT FALSE AFTER has_special_needs");
        await addColumnSafely('residents', 'is_pregnant', "BOOLEAN DEFAULT FALSE AFTER is_4ps");
        await addColumnSafely('residents', 'is_lactating', "BOOLEAN DEFAULT FALSE AFTER is_pregnant");
        await addColumnSafely('residents', 'is_pwd', "BOOLEAN DEFAULT FALSE AFTER is_lactating");
        await addColumnSafely('residents', 'is_single_head', "BOOLEAN DEFAULT FALSE AFTER is_pwd");
        await addColumnSafely('residents', 'has_serious_illness', "BOOLEAN DEFAULT FALSE AFTER is_single_head");
        await addColumnSafely('residents', 'serious_illness_details', "VARCHAR(255) DEFAULT NULL AFTER has_serious_illness");
        await addColumnSafely('residents', 'profile_photo', "VARCHAR(255) DEFAULT NULL AFTER serious_illness_details");

        // Household members table enhancements
        await addColumnSafely('household_members', 'middle_name', "VARCHAR(100) DEFAULT NULL AFTER first_name");
        await addColumnSafely('household_members', 'sex', "ENUM('Male', 'Female') DEFAULT 'Male' AFTER relation");
        await addColumnSafely('household_members', 'birthdate', "DATE DEFAULT NULL AFTER sex");
        await addColumnSafely('household_members', 'profile_photo', "VARCHAR(255) DEFAULT NULL AFTER status");
        await addColumnSafely('household_members', 'is_pregnant', "BOOLEAN DEFAULT FALSE AFTER status");
        await addColumnSafely('household_members', 'is_lactating', "BOOLEAN DEFAULT FALSE AFTER is_pregnant");
        await addColumnSafely('household_members', 'is_pwd', "BOOLEAN DEFAULT FALSE AFTER is_lactating");
        await addColumnSafely('household_members', 'has_serious_illness', "BOOLEAN DEFAULT FALSE AFTER is_pwd");
        await addColumnSafely('household_members', 'serious_illness_details', "VARCHAR(255) DEFAULT NULL AFTER has_serious_illness");

        // Check-ins table enhancements
        await addColumnSafely('check_ins', 'household_member_id', "INT DEFAULT NULL AFTER resident_id");
        await addColumnSafely('check_ins', 'check_in_method', "ENUM('QR', 'MANUAL') DEFAULT 'QR' AFTER status");
        await addColumnSafely('check_ins', 'client_operation_id', "VARCHAR(100) DEFAULT NULL AFTER check_in_method");
        await addColumnSafely('evacuation_centers', 'contact_number', "VARCHAR(50) DEFAULT '0912-345-6789' AFTER address");
        await addColumnSafely('evacuation_centers', 'owner_name', "VARCHAR(150) DEFAULT NULL AFTER name");

        try {
            await db.query("ALTER TABLE check_ins MODIFY COLUMN status ENUM('ACTIVE', 'DEPARTED', 'CHECKED_IN', 'CHECKED_OUT') DEFAULT 'ACTIVE'");
        } catch (err) {
            // Ignore if status already modified
        }

        // Offline sync log table for idempotent duplicate protection
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS offline_sync_log (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    client_operation_id VARCHAR(100) NOT NULL UNIQUE,
                    operation_type ENUM('CHECK_IN', 'WALK_IN') NOT NULL,
                    staff_user_id INT NOT NULL,
                    entity_id INT DEFAULT NULL,
                    response_data JSON DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_offline_op (client_operation_id)
                )
            `);
        } catch (err) {
            console.error("Error creating offline_sync_log table:", err.message);
        }

        // SOS Alerts table enhancements
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS sos_alerts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    resident_id INT DEFAULT NULL,
                    name VARCHAR(150) NOT NULL,
                    latitude DECIMAL(10, 8) NOT NULL,
                    longitude DECIMAL(11, 8) NOT NULL,
                    accuracy DECIMAL(8, 2) DEFAULT 0,
                    status ENUM('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING', 'RESCUED', 'RESOLVED', 'CANCELLED') DEFAULT 'ACTIVE',
                    handled_by INT DEFAULT NULL,
                    responder_notes TEXT DEFAULT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                )
            `);
        } catch (err) {
            console.error("Error creating sos_alerts table:", err.message);
        }

        await addColumnSafely('sos_alerts', 'handled_by', "INT DEFAULT NULL AFTER status");
        await addColumnSafely('sos_alerts', 'responder_notes', "TEXT DEFAULT NULL AFTER handled_by");
        try {
            await db.query("ALTER TABLE sos_alerts MODIFY COLUMN status ENUM('ACTIVE', 'ACKNOWLEDGED', 'RESPONDING', 'RESCUED', 'RESOLVED', 'CANCELLED') DEFAULT 'ACTIVE'");
        } catch (err) { }

        // Ensure alerts table exists during startup migration
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS alerts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    sender_id INT,
                    title VARCHAR(150) NOT NULL,
                    message TEXT NOT NULL,
                    severity VARCHAR(50) NOT NULL DEFAULT 'BLUE',
                    broadcast_type ENUM('SMS', 'IN_APP', 'BOTH') NOT NULL DEFAULT 'SMS',
                    target_audience VARCHAR(100) DEFAULT 'ALL',
                    barangay VARCHAR(100) DEFAULT NULL,
                    recipient_count INT DEFAULT 0,
                    valid_phone_count INT DEFAULT 0,
                    status VARCHAR(50) DEFAULT 'MOCK_SENT',
                    message_id VARCHAR(255) DEFAULT NULL,
                    delivery_report TEXT DEFAULT NULL,
                    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
        } catch (err) { }

        // Add missing columns to alerts if table already exists
        await addColumnSafely('alerts', 'target_audience', "VARCHAR(100) DEFAULT 'ALL'");
        await addColumnSafely('alerts', 'barangay', "VARCHAR(100) DEFAULT NULL");
        await addColumnSafely('alerts', 'recipient_count', "INT DEFAULT 0");
        await addColumnSafely('alerts', 'valid_phone_count', "INT DEFAULT 0");
        await addColumnSafely('alerts', 'status', "VARCHAR(50) DEFAULT 'MOCK_SENT'");
        await addColumnSafely('alerts', 'message_id', "VARCHAR(255) DEFAULT NULL");
        await addColumnSafely('alerts', 'delivery_report', "TEXT DEFAULT NULL");

        try {
            await db.query("ALTER TABLE alerts MODIFY COLUMN severity VARCHAR(50) NOT NULL DEFAULT 'BLUE'");
        } catch (err) { }

        try {
            await db.query("ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'staff', 'barangay_council', 'resident') NOT NULL");
        } catch (err) { }

        // Create push_subscriptions table if not exists (Web Push Notifications)
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id BIGINT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    endpoint TEXT NOT NULL,
                    p256dh VARCHAR(255) NOT NULL,
                    auth VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_push_user_id (user_id),
                    UNIQUE KEY uq_push_endpoint (endpoint(500)),
                    CONSTRAINT fk_push_user
                        FOREIGN KEY (user_id)
                        REFERENCES users(id)
                        ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            `);
            console.log("Table push_subscriptions verified/created.");
        } catch (subErr) {
            console.warn("Notice checking push_subscriptions table:", subErr.message);
            try {
                await db.query(`
                    CREATE TABLE IF NOT EXISTS push_subscriptions (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        endpoint TEXT NOT NULL,
                        p256dh VARCHAR(255) NOT NULL,
                        auth VARCHAR(255) NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_push_user_id (user_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
                `);
            } catch (fallbackErr) {
                console.warn("push_subscriptions fallback creation warning:", fallbackErr.message);
            }
        }

        // Safe Database Indexes for High-Concurrency Performance (ITE-PT-DBP001, ITE-PT-DBP002)
        const addIndexSafely = async (table, indexName, columns) => {
            try {
                const [idxs] = await db.query(`SHOW INDEX FROM ${table} WHERE Key_name = '${indexName}'`);
                if (idxs.length === 0) {
                    await db.query(`ALTER TABLE ${table} ADD INDEX ${indexName} (${columns})`);
                    console.log(`Added index ${indexName} on ${table}(${columns})`);
                }
            } catch (err) {
                // Table might not exist yet or index already present
                console.warn(`Notice verifying index ${indexName} on ${table}:`, err.message);
            }
        };

        // Residents table indexes (rapid resident lookup, contact search, barangay grouping)
        await addIndexSafely('residents', 'idx_residents_contact', 'contact_number');
        await addIndexSafely('residents', 'idx_residents_barangay', 'barangay');
        await addIndexSafely('residents', 'idx_residents_status', 'status');

        // Check-ins table indexes (fast occupancy sync, active check-in lookups, race condition prevention)
        await addIndexSafely('check_ins', 'idx_checkins_res_status', 'resident_id, status');
        await addIndexSafely('check_ins', 'idx_checkins_center_status', 'center_id, status');
        await addIndexSafely('check_ins', 'idx_checkins_hm', 'household_member_id');
        await addIndexSafely('check_ins', 'idx_checkins_client_op', 'client_operation_id');

        // SOS Distress Alerts table indexes (instant real-time status queries, dispatch & map display)
        await addIndexSafely('sos_alerts', 'idx_sos_status_created', 'status, created_at');
        await addIndexSafely('sos_alerts', 'idx_sos_res_status', 'resident_id, status');

        // Alerts & Notifications table indexes (chronological broadcast retrieval)
        await addIndexSafely('alerts', 'idx_alerts_sent_at', 'sent_at');

        // Users table role index
        await addIndexSafely('users', 'idx_users_role', 'role');

        console.log("Migration completed successfully!");
    } catch (error) {
        console.error("Migration warning/error:", error);
    }
}

if (require.main === module) {
    runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runMigration };

