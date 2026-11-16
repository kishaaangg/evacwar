const db = require('../config/db');
db.query('SELECT s.*, u.email, u.password_hash, u.role FROM staff s JOIN users u ON s.user_id = u.id ORDER BY s.id ASC').then(([rows]) => {
  console.log('Total staff/rescuer in DB:', rows.length);
  rows.forEach(r => {
    console.log(r.id, r.user_id, r.role, r.staff_type, r.email, r.first_name, r.last_name, r.assigned_center_id);
  });
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
