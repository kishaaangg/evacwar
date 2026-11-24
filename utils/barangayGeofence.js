/**
 * Barangay San Rafael (Ikpan), Baao, Camarines Sur — Official Geofence & Auto-Rescuer Assignment Engine
 * - Enforces that SOS & Rescue operations are strictly available ONLY within Barangay San Rafael boundary.
 * - Automatically assigns the nearest rescuer (or an en-route rescuer passing along the path) to new SOS alerts.
 */

const db = require('../config/db');
const rescuerTracker = require('./rescuerTracker');
const onlineTracker = require('./onlineTracker');
const gisCache = require('./gisCache');

let _cachedOrangeGraph = null;
async function getSanRafaelOrangeRoadDistanceFn() {
  try {
    const fc = await gisCache.getDrawnFeatures(true);
    const lineFeatures = ((fc && fc.features) || []).filter(
      f => f && f.geometry && f.geometry.type === 'LineString' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2
    );
    if (lineFeatures.length === 0) return computeHaversineKm;

    const cacheKey = `${lineFeatures.length}_${lineFeatures[0].geometry.coordinates.length}`;
    if (!_cachedOrangeGraph || _cachedOrangeGraph.key !== cacheKey) {
      const havM = (a, b) => computeHaversineKm(a[1], a[0], b[1], b[0]) * 1000;
      const densify = (coords, stepM = 6) => {
        const out = [];
        for (let i = 0; i < coords.length - 1; i++) {
          const a = coords[i], b = coords[i + 1];
          out.push(a);
          const d = havM(a, b);
          if (d > stepM) {
            const steps = Math.ceil(d / stepM);
            for (let s = 1; s < steps; s++) {
              const t = s / steps;
              out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
          }
        }
        if (coords.length > 0) out.push(coords[coords.length - 1]);
        return out;
      };

      const nodes = [];
      const adj = [];
      const addNode = (coord, lineIdx, isEp) => {
        const id = nodes.length;
        nodes.push({ coord, lineIdx, isEp });
        adj.push([]);
        return id;
      };
      const addEdge = (u, v, w) => {
        adj[u].push({ to: v, w });
        adj[v].push({ to: u, w });
      };

      lineFeatures.forEach((f, lIdx) => {
        const pts = densify(f.geometry.coordinates, 6);
        let prev = null;
        pts.forEach((c, idx) => {
          const id = addNode(c, lIdx, idx === 0 || idx === pts.length - 1);
          if (prev !== null) addEdge(prev, id, havM(nodes[prev].coord, c));
          prev = id;
        });
      });

      const N = nodes.length;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          if (nodes[i].lineIdx !== nodes[j].lineIdx) {
            const d = havM(nodes[i].coord, nodes[j].coord);
            if (d <= 28 || ((nodes[i].isEp || nodes[j].isEp) && d <= 65)) {
              addEdge(i, j, d * 1.4);
            }
          }
        }
      }
      _cachedOrangeGraph = { key: cacheKey, nodes, adj };
    }

    const { nodes, adj } = _cachedOrangeGraph;
    const N = nodes.length;
    const havM = (a, b) => computeHaversineKm(a[1], a[0], b[1], b[0]) * 1000;

    return (lat1, lng1, lat2, lng2) => {
      const originCoord = [Number(lng1), Number(lat1)];
      const destCoord = [Number(lng2), Number(lat2)];
      let minODist = Infinity, closestONode = -1;
      let minDDist = Infinity, closestDNode = -1;
      for (let i = 0; i < N; i++) {
        const doD = havM(originCoord, nodes[i].coord);
        if (doD < minODist) { minODist = doD; closestONode = i; }
        const ddD = havM(destCoord, nodes[i].coord);
        if (ddD < minDDist) { minDDist = ddD; closestDNode = i; }
      }
      if (closestONode === -1 || closestDNode === -1) return computeHaversineKm(lat1, lng1, lat2, lng2);

      const distArr = new Array(N).fill(Infinity);
      const visited = new Array(N).fill(false);
      distArr[closestONode] = 0;
      for (let step = 0; step < N; step++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < N; i++) {
          if (!visited[i] && distArr[i] < best) { best = distArr[i]; u = i; }
        }
        if (u === -1 || u === closestDNode) break;
        visited[u] = true;
        for (const e of adj[u]) {
          if (distArr[u] + e.w < distArr[e.to]) distArr[e.to] = distArr[u] + e.w;
        }
      }
      if (distArr[closestDNode] >= Infinity) return computeHaversineKm(lat1, lng1, lat2, lng2);
      return (minODist + distArr[closestDNode] + minDDist) / 1000;
    };
  } catch (_) {
    return computeHaversineKm;
  }
}

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
 * Finds the best ONLINE Rescuer to automatically assign to a newly triggered SOS alert:
 * - STRICT ONLINE-ONLY RULE: Only rescuers who are currently ONLINE and have reported real live GPS
 *   coordinates in `rescuerTracker` can be auto-assigned or plotted on the map. Offline rescuers (such as
 *   uninstalled/logged-out accounts) and default Elementary School / Barangay Hall fallback coordinates
 *   are NEVER used.
 * - Supports Multi-SOS Assignment (2 or more SOS alerts assigned to 1 online rescuer):
 *   1. En-Route / Along-the-Path Check ("dadaanan lang niya"):
 *      If an online rescuer is already assigned to another active SOS and the new SOS is along their
 *      San Rafael orange-road path or nearby (detour <= 0.65 km or within 0.75 km), assign that same online rescuer!
 *   2. Nearest Online Rescuer Check:
 *      Otherwise, pick the nearest online rescuer along the San Rafael orange-road network (even if they already
 *      have 1 or more SOS assigned).
 */
async function findNearestRescuerForSos(sosLat, sosLng) {
  try {
    const nLat = Number(sosLat);
    const nLng = Number(sosLng);
    if (!isFinite(nLat) || !isFinite(nLng)) return null;

    // 1. Fetch live tracked ONLINE rescuer GPS positions from rescuerTracker
    const liveTracked = (typeof rescuerTracker.getAllKnownRescuers === 'function')
      ? rescuerTracker.getAllKnownRescuers(3 * 60 * 1000)
      : (rescuerTracker.getActiveRescuers() || []);
    const liveByUserId = new Map();
    liveTracked.forEach((tr) => {
      if (tr && tr.rescuer_user_id && isFinite(Number(tr.latitude)) && isFinite(Number(tr.longitude))) {
        liveByUserId.set(Number(tr.rescuer_user_id), tr);
      }
    });

    // If no rescuer has a live GPS fix online right now, do NOT assign any offline database account!
    if (liveByUserId.size === 0) {
      return null;
    }

    // 2. Fetch registered rescuer account details from database for the online user IDs
    const onlineUids = Array.from(liveByUserId.keys());
    const placeholders = onlineUids.map(() => '?').join(',');
    const [rescuerRows] = await db.execute(`
      SELECT u.id AS user_id, u.email, u.role,
             s.id AS staff_id, s.first_name, s.last_name, s.contact_number, s.staff_type, s.profile_photo, s.occupation
      FROM users u
      INNER JOIN staff s ON u.id = s.user_id
      WHERE u.id IN (${placeholders})
        AND (s.staff_type IN ('RESCUER', 'BOTH') OR u.role = 'rescuer')
    `, onlineUids).catch((dbErr) => {
      console.warn('[barangayGeofence] rescuer query warning:', dbErr.message);
      return [[]];
    });

    if (!rescuerRows || rescuerRows.length === 0) {
      return null;
    }

    // 3. Fetch currently active/assigned SOS alerts to check for En-Route ("dadaanan lang") multi-SOS paths
    const [activeSosRows] = await db.execute(`
      SELECT id, resident_id, name, latitude, longitude, status, handled_by
      FROM sos_alerts
      WHERE status IN ('ACKNOWLEDGED', 'RESPONDING')
        AND handled_by IS NOT NULL AND handled_by > 0
    `).catch(() => [[]]);

    // 4. Use the Admin-drawn Orange Road Network of Barangay San Rafael to compute distances & en-route paths
    const computeRoadDistKm = await getSanRafaelOrangeRoadDistanceFn();

    const candidates = [];
    for (const r of rescuerRows) {
      const uid = Number(r.user_id);
      const tracked = liveByUserId.get(uid);
      if (!tracked || !isFinite(Number(tracked.latitude)) || !isFinite(Number(tracked.longitude))) {
        continue; // Strictly skip any rescuer without real live GPS
      }
      const rLat = Number(tracked.latitude);
      const rLng = Number(tracked.longitude);
      const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || tracked.rescuer_name;
      if (!fullName) continue;

      let photo = r.profile_photo || tracked.rescuer_photo || null;
      if (photo && !String(photo).startsWith('http') && !String(photo).startsWith('/')) {
        photo = `/uploads/profiles/${photo}`;
      }
      const assignedAlerts = (activeSosRows || []).filter((a) => Number(a.handled_by) === uid);
      const distKm = computeRoadDistKm(rLat, rLng, nLat, nLng);

      // Check if this online rescuer is already handling an SOS and this 2nd SOS is near them or along their orange-road path
      let isEnRouteMatch = false;
      let minDetourKm = Infinity;
      assignedAlerts.forEach((targetSos) => {
        const tLat = Number(targetSos.latitude);
        const tLng = Number(targetSos.longitude);
        if (!isFinite(tLat) || !isFinite(tLng)) return;
        const directDist = computeRoadDistKm(rLat, rLng, tLat, tLng);
        const viaNewSosDist = distKm + computeRoadDistKm(nLat, nLng, tLat, tLng);
        const detourKm = Math.max(0, viaNewSosDist - directDist);
        const distBetweenSos = computeRoadDistKm(nLat, nLng, tLat, tLng);
        if (detourKm <= 0.65 || distBetweenSos <= 0.60 || distKm <= 0.75) {
          isEnRouteMatch = true;
          if (detourKm < minDetourKm) minDetourKm = detourKm;
        }
      });

      candidates.push({
        user_id: uid,
        name: fullName,
        photo,
        contact_number: r.contact_number || null,
        role: r.occupation || `${fullName} (Rescuer)`,
        latitude: rLat,
        longitude: rLng,
        distanceKm: distKm,
        assignedCount: assignedAlerts.length,
        isLiveOnline: true,
        isEnRouteMatch,
        minDetourKm
      });
    }

    if (candidates.length === 0) return null;

    // Priority 1: Online rescuer whose active orange-road path passes near the new 2nd SOS ("along the path")
    const enRouteCandidates = candidates
      .filter((c) => c.isEnRouteMatch)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (enRouteCandidates.length > 0) {
      return {
        ...enRouteCandidates[0],
        assignmentType: 'EN_ROUTE_MULTI_RESCUE'
      };
    }

    // Priority 2: Nearest online rescuer along the San Rafael orange road network (can be assigned to 2+ SOS alerts)
    candidates.sort((a, b) => {
      const scoreA = a.distanceKm + a.assignedCount * 0.15;
      const scoreB = b.distanceKm + b.assignedCount * 0.15;
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

/**
 * Automatically assigns any unassigned ACTIVE SOS alerts (or SOS alerts that were stuck on an offline rescuer)
 * to the nearest ONLINE Rescuer as soon as that rescuer reports live GPS.
 * Supports assigning 2 or more nearby/along-the-path SOS alerts to the same online rescuer!
 */
async function autoAssignPendingSosToOnlineRescuer(io = null) {
  try {
    const liveTracked = (typeof rescuerTracker.getAllKnownRescuers === 'function')
      ? rescuerTracker.getAllKnownRescuers(3 * 60 * 1000)
      : [];
    if (!liveTracked || liveTracked.length === 0) return [];
    const onlineUids = new Set(liveTracked.map(r => Number(r.rescuer_user_id)).filter(Boolean));
    if (onlineUids.size === 0) return [];

    const [activeAlerts] = await db.execute(`
      SELECT id, resident_id, name, latitude, longitude, status, handled_by
      FROM sos_alerts
      WHERE status IN ('ACTIVE', 'ACKNOWLEDGED')
      ORDER BY id ASC
    `).catch(() => [[]]);

    if (!activeAlerts || activeAlerts.length === 0) return [];

    const reassigned = [];
    for (const alert of activeAlerts) {
      const currentHandler = alert.handled_by ? Number(alert.handled_by) : 0;
      // Reassign if unassigned OR if currently assigned to an offline rescuer (not in onlineUids)
      if (!currentHandler || !onlineUids.has(currentHandler)) {
        const autoRescuer = await findNearestRescuerForSos(alert.latitude, alert.longitude);
        if (autoRescuer && autoRescuer.user_id) {
          const autoNotes = (autoRescuer.assignmentType === 'EN_ROUTE_MULTI_RESCUE' || autoRescuer.assignmentType === 'MULTI_RESCUE_NEAREST')
            ? `Auto-assigned to En-Route Rescuer (${autoRescuer.name} • ${autoRescuer.distanceKm.toFixed(2)} km)`
            : `Auto-assigned to Nearest Rescuer (${autoRescuer.name} • ${autoRescuer.distanceKm.toFixed(2)} km)`;
          await db.execute(
            `UPDATE sos_alerts SET status = 'ACKNOWLEDGED', handled_by = ?, responder_notes = ?, updated_at = NOW() WHERE id = ?`,
            [autoRescuer.user_id, autoNotes, alert.id]
          ).catch(() => {});

          rescuerTracker.updateRescuerLocation(alert.id, {
            rescuer_user_id: autoRescuer.user_id,
            rescuer_name: autoRescuer.name,
            rescuer_photo: autoRescuer.photo || null,
            rescuer_role: autoRescuer.role || autoRescuer.name,
            latitude: autoRescuer.latitude,
            longitude: autoRescuer.longitude,
            status: 'ACKNOWLEDGED'
          });

          const updatePayload = {
            id: Number(alert.id),
            sos_id: Number(alert.id),
            resident_id: alert.resident_id ? Number(alert.resident_id) : null,
            status: 'ACKNOWLEDGED',
            handled_by: autoRescuer.user_id,
            responder_name: autoRescuer.name,
            handler_name: autoRescuer.name,
            rescuer_photo: autoRescuer.photo || null,
            handler_photo: autoRescuer.photo || null,
            rescuer_lat: autoRescuer.latitude,
            rescuer_lng: autoRescuer.longitude,
            auto_assigned: true,
            auto_assigned_type: autoRescuer.assignmentType
          };
          reassigned.push(updatePayload);

          if (io) {
            io.emit('sos:update_status', updatePayload);
            io.emit('rescuer:location_update', {
              sos_id: Number(alert.id),
              rescuer_user_id: autoRescuer.user_id,
              rescuer_name: autoRescuer.name,
              rescuer_role: autoRescuer.role || autoRescuer.name,
              rescuer_photo: autoRescuer.photo || null,
              latitude: autoRescuer.latitude,
              longitude: autoRescuer.longitude,
              lat: autoRescuer.latitude,
              lng: autoRescuer.longitude,
              status: 'ACKNOWLEDGED',
              resident_id: alert.resident_id ? Number(alert.resident_id) : null,
              resident_lat: Number(alert.latitude) || null,
              resident_lng: Number(alert.longitude) || null,
              updated_at: new Date().toISOString()
            });
          }
        }
      }
    }
    return reassigned;
  } catch (err) {
    console.warn('[barangayGeofence] autoAssignPendingSosToOnlineRescuer warning:', err.message);
    return [];
  }
}

module.exports = {
  SAN_RAFAEL_BOUNDARY_RING,
  BARANGAY_HALL_COORDS,
  computeHaversineKm,
  isInsideBarangaySanRafael,
  findNearestRescuerForSos,
  autoAssignPendingSosToOnlineRescuer
};
