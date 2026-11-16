const db = require('../config/db');

async function test() {
  try {
    const [cols] = await db.execute("DESCRIBE residents");
    console.log("Columns:", cols.map(c => c.Field));
    const [rows] = await db.execute("SELECT id, first_name, last_name, barangay FROM residents WHERE last_name LIKE '%Sinfuego%' OR first_name LIKE '%Laurence%'");
    console.log("Matched residents:", rows);
    const [all] = await db.execute("SELECT id, first_name, last_name, barangay FROM residents LIMIT 5");
    console.log("Sample residents:", all);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
