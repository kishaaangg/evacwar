with open('routes/authRoutes.js', 'r', encoding='utf-8') as f:
    c = f.read()

mobile_login_code = """
const db = require('../config/db');
const User = require('../models/userModel');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// =========================================================================
// POST /api/mobile/login (CAPACITOR NATIVE RESIDENT AUTHENTICATION)
// Authenticates credentials against Barangay Hall MySQL database and returns
// offline-cacheable verification salt & hash (PBKDF2/SHA-256) for offline fallback.
// =========================================================================
router.post('/api/mobile/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email/username and password.' });
    }

    const trimmed = String(email).trim();
    const user = await User.findByEmailOrContact(trimmed);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    const isMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password.' });
    }

    if (user.role !== 'resident') {
      return res.status(403).json({ success: false, message: 'This mobile app is exclusively for registered residents.' });
    }

    const approvalStatus = user.approval_status || (user.is_verified ? 'APPROVED' : 'PENDING');
    if (approvalStatus === 'REJECTED') {
      return res.status(403).json({ success: false, message: 'Your resident registration was rejected. Please contact Barangay San Rafael office.' });
    }
    if (approvalStatus === 'PENDING' || !user.is_verified) {
      return res.status(403).json({ success: false, message: 'Your account is pending verification and approval by Barangay San Rafael office.' });
    }

    // Fetch resident record and household members
    const [residentRows] = await db.query('SELECT * FROM residents WHERE user_id = ? LIMIT 1', [user.id]);
    const resident = residentRows && residentRows[0] ? residentRows[0] : null;

    if (!resident) {
      return res.status(404).json({ success: false, message: 'Resident record not found in database.' });
    }

    const [members] = await db.query('SELECT * FROM household_members WHERE resident_id = ?', [resident.id]);

    // Generate secure offline verification salt & hash (SHA-256 with 16-byte random salt)
    const salt = crypto.randomBytes(16).toString('hex');
    const offlineHash = crypto.createHash('sha256').update(String(password) + ':' + salt).digest('hex');

    const fullName = `${resident.first_name || ''} ${resident.last_name || ''}`.trim() || user.email.split('@')[0];
    const resolvedPhoto = resident.profile_photo
      ? (resident.profile_photo.startsWith('http') || resident.profile_photo.startsWith('/')
        ? resident.profile_photo
        : `/uploads/profiles/${resident.profile_photo}`)
      : null;

    const userContext = {
      id: resident.user_id || user.id,
      resident_id: resident.id,
      name: fullName,
      full_name: fullName,
      first_name: resident.first_name || 'Resident',
      middle_name: resident.middle_name || '',
      last_name: resident.last_name || '',
      email: user.email,
      role: 'resident',
      contact_number: resident.contact_number || '',
      barangay: resident.barangay || 'San Rafael',
      home_address: resident.home_address || '',
      profile_photo: resolvedPhoto,
      vulnerability: resident.vulnerability || 'NONE'
    };

    return res.json({
      success: true,
      message: 'Authentication successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      resident: userContext,
      members: members || [],
      offlineAuth: {
        salt: salt,
        hash: offlineHash
      }
    });
  } catch (err) {
    console.error('Error in /api/mobile/login:', err);
    return res.status(500).json({ success: false, message: 'Server error during mobile authentication.' });
  }
});

"""

# Insert before module.exports = router;
target = "module.exports = router;"
if target in c:
    c = c.replace(target, mobile_login_code + "\n" + target, 1)
    with open('routes/authRoutes.js', 'w', encoding='utf-8') as f:
        f.write(c)
    print('SUCCESS: routes/authRoutes.js updated with /api/mobile/login')
else:
    print('ERROR: module.exports not found')
