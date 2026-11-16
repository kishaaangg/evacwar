const db = require('../config/db');

async function cleanupOrphanedUsers() {
  console.log('=== STARTING ORPHANED RESIDENT USER CLEANUP ===');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Find archived residents that still have an active user_id link
    const [archivedWithUser] = await conn.execute(
      "SELECT id, user_id FROM residents WHERE status = 'ARCHIVED' AND user_id IS NOT NULL"
    );

    console.log(`Found ${archivedWithUser.length} archived resident(s) still linked to a user account.`);
    for (const r of archivedWithUser) {
      const oldUserId = r.user_id;
      // Disconnect user_id so check_ins and historical records are preserved
      await conn.execute('UPDATE residents SET user_id = NULL WHERE id = ?', [r.id]);
      // Remove the user account so the email can be re-registered
      await conn.execute('DELETE FROM users WHERE id = ?', [oldUserId]);
      console.log(`[CLEANED] Disconnected resident ID ${r.id} and removed user ID ${oldUserId}`);
    }

    // 2. Find orphaned resident users that have no resident row in the database
    const [orphanedUsers] = await conn.execute(`
      SELECT u.id, u.email 
      FROM users u 
      LEFT JOIN residents r ON u.id = r.user_id 
      WHERE u.role = 'resident' AND r.id IS NULL
    `);

    console.log(`Found ${orphanedUsers.length} orphaned resident user account(s) without a resident profile.`);
    for (const u of orphanedUsers) {
      await conn.execute('DELETE FROM users WHERE id = ?', [u.id]);
      console.log(`[CLEANED] Deleted orphaned user account ID ${u.id} (${u.email})`);
    }

    await conn.commit();
    console.log('=== CLEANUP COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    await conn.rollback();
    console.error('=== CLEANUP FAILED (ROLLED BACK) ===', error);
    throw error;
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  cleanupOrphanedUsers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = cleanupOrphanedUsers;
