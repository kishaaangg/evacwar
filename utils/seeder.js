const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seedAdmin() {
    try {
        // Check if any admin account already exists
        const [adminRows] = await db.execute("SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1");

        if (adminRows.length > 0) {
            console.log(`Admin account present (ID: ${adminRows[0].id}, Email: ${adminRows[0].email}). Seeder skipped.`);
            return;
        }

        // Only create a default admin if the users table has zero admin accounts
        const [allUsers] = await db.execute("SELECT COUNT(*) as count FROM users");
        if (allUsers[0].count === 0) {
            console.log('No user accounts found in database. Initializing default admin...');
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash('admin123', salt);
            await User.create({
                email: 'admin@evacwar.gov.ph',
                password_hash,
                role: 'admin',
                is_verified: true
            });

        }
    } catch (error) {
        console.error('Error in seeder check:', error.message);
    }
}

module.exports = { seedAdmin };

