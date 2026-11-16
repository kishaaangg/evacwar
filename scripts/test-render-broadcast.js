const ejs = require('ejs');
const path = require('path');

const filename = path.resolve('views/admin/broadcast.ejs');

ejs.renderFile(filename, {
  user: { role: 'admin', name: 'Admin', email: 'admin@evakwar.ph' },
  page: { title: 'Emergency LoRa Broadcast' },
  app: { name: 'EvakWar' },
  isBarangayCouncil: false,
  userBarangay: 'San Rafael',
  locals: {},
  barangays: ['San Rafael'],
  initialMetrics: { residents: [{ name: 'Juan Dela Cruz', zone: 'Zone 1', is_senior: true }] },
  history: []
}, (err, str) => {
  if (err) {
    console.error("EJS Render Error:", err);
    process.exit(1);
  } else {
    console.log("Rendered successfully! Output length:", str.length);
  }
});
