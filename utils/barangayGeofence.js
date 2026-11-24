/**
 * Barangay San Rafael (Ikpan), Baao, Camarines Sur — Official Geofence & Auto-Rescuer Assignment Engine
 * - Enforces that SOS & Rescue operations are strictly available ONLY within Barangay San Rafael boundary.
 * - Automatically assigns the nearest rescuer (or an en-route rescuer passing along the path) to new SOS alerts.
 */

const db = require('../config/db');
const rescuerTracker = require('./rescuerTracker');
const onlineTracker = require('./onlineTracker');

// Official Barangay San Rafael (Ikpan) Boundary Polygon ([lng, lat] pairs)
const SAN_RAFAEL_BOUNDARY_RING = [
  [123.35050724792592, 13.520608603083488],
  [123.35202717153368, 13.519701180132046],
  [123.3523738207785, 13.519493768687],
  [123.35242715143079, 13.519156724702981],
  [123.35242715143079, 13.518664121099405],
  [123.3525604780636, 13.51806781011237],
  [123.35276046801141, 13.517601130907678],
  [123.35318711323538, 13.517769654058995],
  [123.35349376448914, 13.518249296222862],
  [123.35385374639668, 13.518430782195182],
  [123.3543470549356, 13.518417818915793],
  [123.35545366598507, 13.518145589890722],
  [123.35612029914563, 13.517704837481944],
  [123.35677324466582, 13.51753091879668],
  [123.35729382024465, 13.517227233182183],
  [123.35769206384663, 13.5169423932945],
  [123.35837119446899, 13.517021772445645],
  [123.35898207929097, 13.517111744468963],
  [123.35937326998703, 13.516741167978864],
  [123.35918389897722, 13.516252018667302],
  [123.35885359944143, 13.515791566372087],
  [123.35887529165285, 13.515232778576333],
  [123.35928193103422, 13.514748021136043],
  [123.35983561389412, 13.51463808609465],
  [123.36044176132458, 13.514207796164541],
  [123.36082763478453, 13.513466195981636],
  [123.36107225726562, 13.512825220499082],
  [123.36167083646842, 13.512315100250689],
  [123.36218141731473, 13.51161269430537],
  [123.36230184835517, 13.510762209069654],
  [123.36200026104882, 13.509765043840119],
  [123.35062210996165, 13.498381372142916],
  [123.3403898137691, 13.505892657063256],
  [123.33947932002093, 13.506342955555994],
  [123.33860981581995, 13.507293721858517],
  [123.33782649291618, 13.508129180778923],
  [123.33696178257031, 13.508329463271352],
  [123.33627201603571, 13.508671554339557],
  [123.33533897675557, 13.50943806543664],
  [123.33655619716075, 13.510110402026058],
  [123.33746554655693, 13.510748324065673],
  [123.33813658543136, 13.51158435584884],
  [123.34021695561518, 13.51393267464779],
  [123.34251081813477, 13.51374781573378],
  [123.34323046709653, 13.513776472877908],
  [123.34341951114493, 13.5144462141361],
  [123.34419740887256, 13.515244397724956],
  [123.34455114505391, 13.5156144197869],
  [123.34481286115954, 13.515266651812269],
  [123.34596366413365, 13.515059197195143],
  [123.34656632814534, 13.515299602722408],
  [123.34750457666115, 13.516051352959181],
  [123.34805508585504, 13.516847341100046],
  [123.34795292979658, 13.517936554096423],
  [123.3477691113344, 13.518627064528516],
  [123.34848571721551, 13.5196407220607],
  [123.34880347942749, 13.52045143757121],
  [123.34915939015343, 13.521053554139883],
  [123.34934811746683, 13.521394468845997],
  [123.350480325827, 13.520628907128753],
  [123.35050724792592, 13.520608603083488]
];

const BARANGAY_HALL_COORDS = { lat: 13.51037, lng: 123.34810 };

/**
 * Haversine distance in kilometers between two GPS coordinates.
 */
function computeHaversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Checks whether (lat, lng) is inside Barangay San Rafael (Ikpan) boundary polygon
 * (with a 220m edge tolerance buffer for smartphone GPS jitter along boundary roads).
 */
function isInsideBarangaySanRafael(lat, lng, bufferKm = 0.22) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!isFinite(nLat) || !isFinite(nLng) || (nLat === 0 && nLng === 0)) return false;

  // Quick bounding-box pre-filter around Barangay San Rafael
  if (nLat < 13.4960 || nLat > 13.5235 || nLng < 123.3330 || nLng > 123.3645) {
    return false;
  }

  // Ray-casting point-in-polygon check
  let inside = false;
  const ring = SAN_RAFAEL_BOUNDARY_RING;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > nLat !== yj > nLat &&
      nLng < ((xj - xi) * (nLat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  if (inside) return true;

  // Check distance to nearest polygon vertex/segment within bufferKm
  for (let i = 0; i < ring.length; i++) {
    const vLng = ring[i][0];
    const vLat = ring[i][1];
    if (computeHaversineKm(nLat, nLng, vLat, vLng) <= bufferKm) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the best Rescuer to automatically assign to a newly triggered SOS alert:
 * 1. En-Route / Along-the-Path Check ("dadaanan lang niya"):
 *    If a rescuer is already responding to another active SOS and the new SOS lies along their path
 *    (detour <= 0.45 km or within 0.50 km of the rescuer), assign that same rescuer for multi-rescue!
 * 2. Nearest Rescuer Check:
 *    Otherwise, compute Haversine distance from each available Rescuer's current GPS position
 *    (or default station position) to the new SOS and pick the nearest rescuer.
 */
async function findNearestRescuerForSos(sosLat, sosLng) {
  try {
    const nLat = Number(sosLat);
    const nLng = Number(sosLng);
    if (!isFinite(nLat) || !isFinite(nLng)) return null;

    // 1. Fetch all active/registered rescuers from database
    const [rescuerRows] = await db.execute(`
      SELECT u.id AS user_id, u.email, u.role,
             s.id AS staff_id, s.first_name, s.last_name, s.contact_number, s.staff_type, s.profile_photo, s.occupation,
             ec.latitude AS center_lat, ec.longitude AS center_lng
      FROM users u
      INNER JOIN staff s ON u.id = s.user_id
      LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
      WHERE (s.staff_type IN ('RESCUER', 'BOTH') OR u.role = 'rescuer')
      ORDER BY s.staff_type = 'RESCUER' DESC, u.id ASC
    `).catch((dbErr) => {
      console.warn('[barangayGeofence] rescuer query warning:', dbErr.message);
      return [[]];
    });

    // 2. Fetch live tracked rescuer GPS positions from rescuerTracker (both active responders AND standby rescuers)
    const liveTracked = (typeof rescuerTracker.getAllKnownRescuers === 'function')
      ? rescuerTracker.getAllKnownRescuers()
      : (rescuerTracker.getActiveRescuers() || []);
    const liveByUserId = new Map();
    liveTracked.forEach((tr) => {
      if (tr && tr.rescuer_user_id && isFinite(tr.latitude) && isFinite(tr.longitude)) {
        liveByUserId.set(Number(tr.rescuer_user_id), tr);
      }
    });

    // 3. Fetch currently active/assigned SOS alerts to check for En-Route ("dadaanan lang") paths
    const [activeSosRows] = await db.execute(`
      SELECT id, resident_id, name, latitude, longitude, status, handled_by
      FROM sos_alerts
      WHERE status IN ('ACKNOWLEDGED', 'RESPONDING')
        AND handled_by IS NOT NULL AND handled_by > 0
    `).catch(() => [[]]);

    const candidates = (rescuerRows || []).map((r) => {
      const uid = Number(r.user_id);
      const tracked = liveByUserId.get(uid);
      const isOnlineSocket = Boolean(onlineTracker && typeof onlineTracker.isUserOnline === 'function' && onlineTracker.isUserOnline(uid));
      const isLiveOnline = Boolean(tracked || isOnlineSocket);
      const rLat = tracked && isFinite(Number(tracked.latitude))
        ? Number(tracked.latitude)
        : (isFinite(Number(r.center_lat)) && Number(r.center_lat) !== 0 ? Number(r.center_lat) : BARANGAY_HALL_COORDS.lat);
      const rLng = tracked && isFinite(Number(tracked.longitude))
        ? Number(tracked.longitude)
        : (isFinite(Number(r.center_lng)) && Number(r.center_lng) !== 0 ? Number(r.center_lng) : BARANGAY_HALL_COORDS.lng);
      const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || 'Emergency Rescuer';
      let photo = (tracked && tracked.rescuer_photo) || r.profile_photo || null;
      if (photo && !String(photo).startsWith('http') && !String(photo).startsWith('/')) {
        photo = `/uploads/profiles/${photo}`;
      }
      const assignedAlerts = (activeSosRows || []).filter((a) => Number(a.handled_by) === uid);
      const distKm = computeHaversineKm(rLat, rLng, nLat, nLng);

      // Check if this rescuer is already en-route to an SOS and this new SOS is along their path ("dadaanan lang")
      let isEnRouteMatch = false;
      let minDetourKm = Infinity;
      assignedAlerts.forEach((targetSos) => {
        const tLat = Number(targetSos.latitude);
        const tLng = Number(targetSos.longitude);
        if (!isFinite(tLat) || !isFinite(tLng)) return;
        const directDist = computeHaversineKm(rLat, rLng, tLat, tLng);
        const viaNewSosDist = distKm + computeHaversineKm(nLat, nLng, tLat, tLng);
        const detourKm = Math.max(0, viaNewSosDist - directDist);
        const distBetweenSos = computeHaversineKm(nLat, nLng, tLat, tLng);
        if (detourKm <= 0.45 || distBetweenSos <= 0.35 || distKm <= 0.40) {
          isEnRouteMatch = true;
          if (detourKm < minDetourKm) minDetourKm = detourKm;
        }
      });

      return {
        user_id: uid,
        name: fullName,
        photo,
        contact_number: r.contact_number || null,
        role: r.occupation || 'Emergency Rescuer',
        latitude: rLat,
        longitude: rLng,
        distanceKm: distKm,
        assignedCount: assignedAlerts.length,
        isLiveOnline,
        isEnRouteMatch,
        minDetourKm
      };
    });

    if (candidates.length === 0) return null;

    // Priority 1: A rescuer whose active path passes right through/near the new SOS ("dadaanan lang niya")
    const enRouteCandidates = candidates
      .filter((c) => c.isEnRouteMatch)
      .sort((a, b) => {
        if (a.isLiveOnline !== b.isLiveOnline) return a.isLiveOnline ? -1 : 1;
        return a.distanceKm - b.distanceKm;
      });
    if (enRouteCandidates.length > 0) {
      return {
        ...enRouteCandidates[0],
        assignmentType: 'EN_ROUTE_MULTI_RESCUE'
      };
    }

    // Priority 2: Nearest live/online rescuer first, then nearest registered rescuer by Haversine distance
    candidates.sort((a, b) => {
      if (a.isLiveOnline !== b.isLiveOnline) return a.isLiveOnline ? -1 : 1;
      const scoreA = a.distanceKm + a.assignedCount * 0.25;
      const scoreB = b.distanceKm + b.assignedCount * 0.25;
      return scoreA - scoreB;
    });

    return {
      ...candidates[0],
      assignmentType: candidates[0].assignedCount > 0 ? 'MULTI_RESCUE_NEAREST' : 'NEAREST_RESCUER'
    };
  } catch (err) {
    console.warn('[barangayGeofence] findNearestRescuerForSos warning:', err.message);
    return null;
  }
}

module.exports = {
  SAN_RAFAEL_BOUNDARY_RING,
  BARANGAY_HALL_COORDS,
  computeHaversineKm,
  isInsideBarangaySanRafael,
  findNearestRescuerForSos
};
