const ejs = require('ejs');
const path = require('path');
const sharedSimData = require('../utils/simData');

const VIEWS_DIR = path.resolve(__dirname, '..', 'views');

const staffData = {
  ...sharedSimData(),
  csrfToken: '',
  page: { title: 'Staff Dashboard' },
  user: { id: 55, name: 'Virgil Vasquez', email: 'toto@gmail.com', role: 'staff', staff_type: 'EVACUATION' },
  staff: { id: 14, user_id: 55, name: 'Virgil Vasquez', full_name: 'Virgil Vasquez', first_name: 'Virgil', last_name: 'Vasquez', staff_type: 'EVACUATION', assigned_center_id: 13 },
  rescuer: null,
  activeCenter: { id: 13, name: 'San Rafael Evacuation Center', capacity: 300, current_evacuees: 45 },
  activeCenterId: 13,
  assignedSites: [{ id: 13, name: 'San Rafael Evacuation Center', capacity: 300, current_evacuees: 45 }],
  centers: [{ id: 13, name: 'San Rafael Evacuation Center', capacity: 300, current_evacuees: 45 }],
  allCenters: [{ id: 13, name: 'San Rafael Evacuation Center', capacity: 300, current_evacuees: 45 }],
  recentScanned: [],
  weather: { temp: 28, condition: 'Clear', humidity: 75 },
  mapFeatures: '{"type":"FeatureCollection","features":[]}',
  activeAlert: null,
  activeSosAlerts: [],
  recentSosAlerts: [],
  ecStats: {
    summary: {
      total_families: 12,
      four_ps_count: 5,
      pregnant_lactating: 2,
      pwd_count: 3,
      seniors_count: 4,
      infants_toddlers: 2
    },
    totalFamilies: 12,
    totalIndividuals: 45,
    capacity: 300,
    available: 255,
    occupiedRate: 15
  },
  sosReports: [],
  sosStats: { total: 0, pending: 0, dispatched: 0, rescued: 0, resolved: 0 },
  myStats: { assigned: 0, resolved: 0 },
  activeEvacuees: [],
  departedEvacuees: [],
  selectedCenterId: 13,
  statusMsg: null, errorMsg: null, errorMessage: null, successMessage: null,
  formatManilaTime: () => '10:00 AM',
  formatManilaDateTime: () => 'Nov 10, 2026, 10:00 AM'
};
staffData.locals = staffData;

async function test() {
  const staffViews = ['dashboard', 'map', 'qr-scanner', 'reports', 'settings', 'typhoon'];
  for (const v of staffViews) {
    try {
      const p = path.join(VIEWS_DIR, 'staff', `${v}.ejs`);
      const h = await ejs.renderFile(p, staffData, { views: [VIEWS_DIR], filename: p });
      console.log(`✅ Staff view '${v}' rendered successfully (${h.length} bytes)`);
    } catch (e) {
      console.error(`❌ Staff view '${v}' FAILED:`, e.message);
    }
  }

  const rescuerData = {
    ...staffData,
    user: { id: 9, name: 'Staff Three', email: 'staff3@yahoo.com', role: 'staff', staff_type: 'RESCUER' },
    staff: { id: 1, user_id: 9, name: 'Staff Three', full_name: 'Staff Three', first_name: 'Staff', last_name: 'Three', staff_type: 'RESCUER' },
    rescuer: { id: 1, user_id: 9, name: 'Staff Three', full_name: 'Staff Three', first_name: 'Staff', last_name: 'Three', staff_type: 'RESCUER' },
    page: { title: 'Rescuer Command Dashboard' }
  };
  rescuerData.locals = rescuerData;

  const rescuerViews = ['dashboard', 'map', 'reports', 'settings', 'typhoon'];
  for (const v of rescuerViews) {
    try {
      const p = path.join(VIEWS_DIR, 'rescuer', `${v}.ejs`);
      const h = await ejs.renderFile(p, rescuerData, { views: [VIEWS_DIR], filename: p });
      console.log(`✅ Rescuer view '${v}' rendered successfully (${h.length} bytes)`);
    } catch (e) {
      console.error(`❌ Rescuer view '${v}' FAILED:`, e.message);
    }
  }
}

test();
