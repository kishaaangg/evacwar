const { runMigration } = require('./utils/migrate');
const { seedAdmin } = require('./utils/seeder');
const User = require('./models/userModel');
const Resident = require('./models/residentModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function testAuth() {
    console.log("--- Starting Authentication & System Test ---");

    // Step 1: Migration
    console.log("Testing migration...");
    await runMigration();

    // Step 2: Seeder
    console.log("Testing seeder...");
    await seedAdmin();

    // Step 3: Verify Admin user
    const admin = await User.findByEmailOrContact('admin');
    console.log("Admin account found by 'admin' identifier:", !!admin, admin ? `Role: ${admin.role}` : '');
    if (admin) {
        const isAdminPasswordValid = await bcrypt.compare('admin123', admin.password_hash);
        console.log("Admin password validation (bcrypt):", isAdminPasswordValid);
    }

    // Step 4: Verify Staff / Council user
    const staff = await User.findByEmailOrContact('staff@evacwar.gov.ph');
    console.log("Barangay Council / Staff account found:", !!staff, staff ? `Role: ${staff.role}` : '');
    if (staff) {
        const isStaffPasswordValid = await bcrypt.compare('staff123', staff.password_hash);
        console.log("Staff password validation (bcrypt):", isStaffPasswordValid);
    }

    // Step 5: Test Resident Registration
    const testEmail = `testresident_${Date.now()}@example.com`;
    const testPhone = `09${Math.floor(100000000 + Math.random() * 900000000)}`;
    console.log(`Registering test resident (${testEmail}, ${testPhone})...`);

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash('resident123', salt);

    const userId = await User.create({
        email: testEmail,
        password_hash,
        role: 'resident'
    });

    const residentId = await Resident.create({
        user_id: userId,
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        contact_number: testPhone,
        home_address: '123 Rizal St.',
        barangay: 'Zone 4',
        emergency_contact_name: 'Maria Dela Cruz',
        emergency_contact_phone: '09876543210',
        vulnerability: 'None',
        family_size: 4,
        has_special_needs: false,
        qr_code_uuid: crypto.randomUUID()
    });

    console.log(`Resident created! User ID: ${userId}, Resident ID: ${residentId}`);

    // Step 6: Verify User lookup by phone number
    const foundUser = await User.findByEmailOrContact(testPhone);
    console.log("Found resident by phone lookup:", foundUser ? `${foundUser.first_name} ${foundUser.last_name}` : 'Not found');
    console.log("Resident password hash verification:", foundUser ? await bcrypt.compare('resident123', foundUser.password_hash) : false);

    console.log("--- All Authentication & Database Tests Passed Successfully! ---");
    process.exit(0);
}

testAuth().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
