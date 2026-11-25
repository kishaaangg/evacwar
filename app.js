process.env.TZ = process.env.TZ || 'Asia/Manila';
if (require('fs').existsSync('/etc/secrets/.env')) {
  require('dotenv').config({ path: '/etc/secrets/.env' });
}
require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");
const session = require("express-session");
const MySQLSessionStore = require("./utils/mysqlSessionStore");

const { runMigration } = require("./utils/migrate");
const { seedAdmin } = require("./utils/seeder");
const Alert = require("./models/alertModel");
const db = require("./config/db");
const weatherService = require("./utils/weatherService");
const persistentPhotoStore = require("./utils/persistentPhotoStore");

app.disable('x-powered-by');
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Enable HTTP response compression for JSON API payloads, HTML, and assets > 1KB (Optional)
let compression = null;
try {
  compression = require("compression");
} catch (_err) {
  // compression optional if module not installed
}
if (compression) {
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      if (req.url && req.url.toLowerCase().includes('.apk')) return false;
      return compression.filter(req, res);
    },
    threshold: 1024
  }));
}

// Comprehensive Security Headers & Method Filter Middleware
app.use((req, res, next) => {
  // Reject unsupported/unnecessary HTTP methods (preserve GET, POST, PUT, DELETE, HEAD, OPTIONS)
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];
  if (!allowedMethods.includes(req.method)) {
    return res.status(405).send('Method Not Allowed');
  }

  // Enforce HTTPS in production environments without breaking local development
  if (process.env.NODE_ENV === 'production') {
    if (!req.secure && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
  }

  // Clickjacking protection
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Legacy XSS filter protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions Policy (Camera for QR, Geolocation for SOS, microphone disabled)
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
  // HSTS (HTTP Strict Transport Security) when on HTTPS or in production
  if (req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy tailored for MapLibre, Windy, OpenStreetMap, ArcGIS, Tailwind, Fonts, and YouTube
  const host = req.get('host');
  const wsDirectives = host ? `'self' ws://${host} wss://${host} wss://*.onrender.com https://*.onrender.com wss://*.evacwar-sanrafel.xyz ws://*.evacwar-sanrafel.xyz https://*.evacwar-sanrafel.xyz` : "'self' wss://*.onrender.com https://*.onrender.com wss://*.evacwar-sanrafel.xyz ws://*.evacwar-sanrafel.xyz";
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://cdn.socket.io https://cdn.tailwindcss.com https://www.youtube.com https://s.ytimg.com https://maps.googleapis.com https://connect.facebook.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net data:",
    "img-src 'self' data: blob: https://mt0.google.com https://mt1.google.com https://mt2.google.com https://mt3.google.com https://*.google.com https://*.googleapis.com https://*.gstatic.com https://s3.amazonaws.com https://*.amazonaws.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr https://*.basemaps.cartocdn.com https://api.qrserver.com https://maps.googleapis.com https://maps.gstatic.com https://*.ytimg.com https://bagong.pagasa.dost.gov.ph https://*.fbcdn.net https://*.facebook.com https://scontent*.fbcdn.net https://graph.facebook.com https://unpkg.com",
    `connect-src ${wsDirectives} https://mt0.google.com https://mt1.google.com https://mt2.google.com https://mt3.google.com https://*.google.com https://*.googleapis.com https://*.gstatic.com https://s3.amazonaws.com https://*.amazonaws.com https://server.arcgisonline.com https://services.arcgisonline.com https://*.arcgisonline.com https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr https://*.basemaps.cartocdn.com https://maps.googleapis.com https://bagong.pagasa.dost.gov.ph https://graph.facebook.com https://*.fbcdn.net https://*.facebook.com https://api.weatherapi.com https://cdn.tailwindcss.com https://unpkg.com https://fonts.googleapis.com https://fonts.gstatic.com https://api.qrserver.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.socket.io`,
    "worker-src 'self' blob:",
    "child-src 'self' blob: https://www.youtube.com https://www.youtube-nocookie.com",
    "frame-src 'self' https://embed.windy.com https://www.youtube.com https://www.youtube-nocookie.com https://www.facebook.com https://web.facebook.com https://*.facebook.com",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join('; ');
  res.setHeader('Content-Security-Policy', cspHeader);

  if (req.url.startsWith('/api/') || req.url.startsWith('/staff/') || req.url.startsWith('/rescuer/') || req.url.startsWith('/resident/') || req.url.startsWith('/resident-mobile') || req.url.startsWith('/register') || req.url.startsWith('/login') || req.url.startsWith('/logout')) {
    const reqOrigin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', reqOrigin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-XSRF-Token, Accept, X-Requested-With, X-Evakwar-Mobile-User-Id, X-Evakwar-Mobile-Role, X-Evakwar-Mobile-Resident-Id, X-Evakwar-Mobile-Staff-Type, X-Evakwar-Mobile-Name');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }

  next();
});

// ITE-SEC-SM-003: Block dangerous/unnecessary HTTP methods
// TRACE enables Cross-Site Tracing (XST) attacks; CONNECT is a proxy tunneling method
app.use((req, res, next) => {
  const blocked = ['TRACE', 'CONNECT'];
  if (blocked.includes(req.method.toUpperCase())) {
    res.setHeader('Allow', 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS');
    return res.status(405).send('Method Not Allowed');
  }
  next();
});

// Provide backwards/case-insensitive route compatibility for Evacwar/EvakWar offline DB scripts
app.get(['/js/Evacwar-db.js', '/js/evacwar-db.js', '/js/EvakWar-db.js', '/js/evakwar-db.js'], (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'js', 'evakwar-db.js'));
});

// Persistent profile photos endpoint: Serves from fast disk cache, self-heals from MySQL on restart, or falls back to default avatar SVG
app.get('/uploads/profiles/:filename', async (req, res) => {
  const uploadDir = persistentPhotoStore.getUploadDir();
  const filePath = path.join(uploadDir, req.params.filename);

  // 1. Check local disk cache (fast 0ms path)
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  // 2. Self-healing check: If missing on disk (e.g. after Hostinger restart), retrieve from persistent MySQL store
  try {
    const photo = await persistentPhotoStore.get(req.params.filename);
    if (photo && photo.data) {
      // Restore to local disk cache asynchronously for future 0ms requests
      fs.promises.writeFile(filePath, photo.data).catch(_err => { });
      res.setHeader('Content-Type', photo.mime_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(photo.data);
    }
  } catch (err) {
    console.warn(`[Profile Photo Error]: Failed to retrieve ${req.params.filename} from persistent store:`, err.message);
  }

  // 3. Graceful fallback to default avatar SVG
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.send(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">' +
    '<rect width="128" height="128" rx="28" fill="#e2e8f0"/>' +
    '<circle cx="64" cy="48" r="24" fill="#94a3b8"/>' +
    '<path d="M28 112 C28 88 44 76 64 76 C84 76 100 88 100 112 Z" fill="#94a3b8"/>' +
    '</svg>'
  );
});

// Favicon route to prevent browser 404 console errors
app.get('/favicon.ico', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'icons', 'favicon-32x32.png'));
});

// Android App Links Digital Asset Links verification (/.well-known/assetlinks.json)
// Allows Android SMS links to open the installed EvakWar Native App (ph.gov.baao.evakwar.resident) directly without Chrome
app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'ph.gov.baao.evakwar.resident',
        sha256_cert_fingerprints: [
          '3A:0F:CE:A0:43:21:CE:96:FA:C8:04:3E:18:18:D2:8F:C3:58:B8:5E:FD:2C:C1:94:FF:D7:3A:D7:1D:A0:83:5C'
        ]
      }
    }
  ]);
});

// Built-in In-App Directions API (Hybrid Admin-Drawn Evacuation Routes + Road Routing + Hazard Avoidance)
const gisCacheForRouting = require('./utils/gisCache');
app.get('/api/directions', async (req, res) => {
  const oLat = parseFloat(req.query.originLat);
  const oLng = parseFloat(req.query.originLng);
  const dLat = parseFloat(req.query.destLat);
  const dLng = parseFloat(req.query.destLng);

  if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
    return res.status(400).json({ success: false, error: 'Invalid coordinates' });
  }

  const toRad = (deg) => (deg * Math.PI) / 180;
  const haversine = (a, b) => {
    const R = 6371000;
    const dPhi = toRad(b[1] - a[1]);
    const dLambda = toRad(b[0] - a[0]);
    const x = Math.sin(dPhi / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLambda / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const pointInPolygon = (pt, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const segmentsIntersect = (p1, p2, p3, p4) => {
    const ccw = (A, B, C) => (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
  };

  const segmentHitsHazard = (a, b, hazardRings) => {
    if (!hazardRings || hazardRings.length === 0) return false;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const ring of hazardRings) {
      if (pointInPolygon(a, ring) || pointInPolygon(b, ring) || pointInPolygon(mid, ring)) return true;
      for (let i = 0; i < ring.length - 1; i++) {
        if (segmentsIntersect(a, b, ring[i], ring[i + 1])) return true;
      }
    }
    return false;
  };

  const densifyLine = (coords, maxStepMeters = 18) => {
    const out = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const a = coords[i], b = coords[i + 1];
      out.push(a);
      const d = haversine(a, b);
      if (d > maxStepMeters) {
        const steps = Math.ceil(d / maxStepMeters);
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
    }
    if (coords.length > 0) out.push(coords[coords.length - 1]);
    return out;
  };

  let osrmGeometry = null;
  let osrmSteps = [];
  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=full&geometries=geojson&steps=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3800);
    const response = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (response.ok) {
      const data = await response.json();
      if (data && data.routes && data.routes[0] && data.routes[0].geometry) {
        osrmGeometry = data.routes[0].geometry;
        const route = data.routes[0];
        osrmSteps = (route.legs && route.legs[0] && route.legs[0].steps) ? route.legs[0].steps.map(s => ({
          instruction: (s.maneuver && s.maneuver.type) ? `${s.maneuver.type.replace(/_/g, ' ')} ${s.maneuver.modifier || ''}`.trim() + (s.name ? ` onto ${s.name}` : '') : (s.name || 'Continue on route'),
          distance: Math.round(s.distance || 0)
        })) : [];
      }
    }
  } catch (_err) {
    // Continue with Admin-drawn route network
  }

  try {
    const drawn = await gisCacheForRouting.getDrawnFeatures(true);
    const features = (drawn && Array.isArray(drawn.features)) ? drawn.features : [];
    const adminLines = [];
    const hazardRings = [];

    features.forEach(f => {
      if (!f || !f.geometry) return;
      if (f.geometry.type === 'LineString' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2) {
        adminLines.push({ coords: densifyLine(f.geometry.coordinates, 8), isAdmin: true });
      } else if (f.geometry.type === 'Polygon' && Array.isArray(f.geometry.coordinates) && Array.isArray(f.geometry.coordinates[0])) {
        if (!f.properties || (f.properties.type !== 'boundary' && f.properties.boundaryType !== 'barangay_boundary')) {
          hazardRings.push(f.geometry.coordinates[0]);
        }
      }
    });

    if (adminLines.length > 0) {
      const originCoord = [oLng, oLat];
      const destCoord = [dLng, dLat];

      // Check if both origin and destination are within 350m of the Admin-drawn route network
      let minOriginAdminDist = Infinity;
      let minDestAdminDist = Infinity;
      adminLines.forEach(l => {
        l.coords.forEach(pt => {
          const doD = haversine(originCoord, pt);
          if (doD < minOriginAdminDist) minOriginAdminDist = doD;
          const ddD = haversine(destCoord, pt);
          if (ddD < minDestAdminDist) minDestAdminDist = ddD;
        });
      });

      const allLines = [...adminLines];
      // Only include OSRM road geometry if origin or destination is far (>450m) from the Admin-drawn route network
      if ((minOriginAdminDist > 450 || minDestAdminDist > 450) && osrmGeometry && Array.isArray(osrmGeometry.coordinates) && osrmGeometry.coordinates.length >= 2) {
        const smartOsrm = [];
        const rawOsrm = osrmGeometry.coordinates;
        for (let i = 0; i < rawOsrm.length - 1; i++) {
          const a = rawOsrm[i], b = rawOsrm[i + 1];
          smartOsrm.push(a);
          if (haversine(a, destCoord) < 2500 || haversine(b, destCoord) < 2500) {
            const d = haversine(a, b);
            if (d > 16) {
              const steps = Math.ceil(d / 16);
              for (let s = 1; s < steps; s++) {
                const t = s / steps;
                smartOsrm.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
              }
            }
          }
        }
        smartOsrm.push(rawOsrm[rawOsrm.length - 1]);
        allLines.push({ coords: smartOsrm, isAdmin: false });
      }

      const nodes = [];
      const adj = [];
      const addNode = (coord, lineIdx, isAdmin, isEndpoint = false) => {
        const id = nodes.length;
        nodes.push({ coord, lineIdx, isAdmin, isEndpoint });
        adj.push([]);
        return id;
      };
      const addEdge = (u, v, w, isHazard = false, isAdmin = true) => {
        adj[u].push({ to: v, w, isHazard, isAdmin });
        adj[v].push({ to: u, w, isHazard, isAdmin });
      };

      let osrmFirstNodeId = -1;
      allLines.forEach((lineObj, lIdx) => {
        let prev = null;
        const mult = lineObj.isAdmin ? 1.0 : 3.2;
        const len = lineObj.coords.length;
        lineObj.coords.forEach((c, cIdx) => {
          const isEp = (cIdx === 0 || cIdx === len - 1);
          const id = addNode(c, lIdx, lineObj.isAdmin, isEp);
          if (!lineObj.isAdmin && cIdx === 0) osrmFirstNodeId = id;
          if (prev !== null) {
            const segDist = haversine(nodes[prev].coord, c);
            const hitsHazard = segmentHitsHazard(nodes[prev].coord, c, hazardRings);
            const cost = segDist * mult * (hitsHazard ? 30 : 1);
            addEdge(prev, id, cost, hitsHazard, lineObj.isAdmin);
          }
          prev = id;
        });
      });

      const networkNodeCount = nodes.length;
      // Connect junctions between different Admin-drawn orange route lines at intersections (<=28m) or branch endpoints (<=65m)
      for (let i = 0; i < networkNodeCount; i++) {
        for (let j = i + 1; j < networkNodeCount; j++) {
          if (nodes[i].lineIdx !== nodes[j].lineIdx) {
            const dist = haversine(nodes[i].coord, nodes[j].coord);
            if (dist <= 28 || ((nodes[i].isEndpoint || nodes[j].isEndpoint) && dist <= 65)) {
              const hitsHazard = segmentHitsHazard(nodes[i].coord, nodes[j].coord, hazardRings);
              addEdge(i, j, dist * 1.8 * (hitsHazard ? 30 : 1), hitsHazard, nodes[i].isAdmin || nodes[j].isAdmin);
            }
          }
        }
      }

      const oId = addNode(originCoord, -1, false, true);
      const dId = addNode(destCoord, -2, false, true);

      let minOriginDist = Infinity, closestOriginNode = -1;
      let minAdminOriginDist = Infinity, closestAdminOriginNode = -1;
      let minDestDist = Infinity, closestDestNode = -1;
      let minAdminDestDist = Infinity, closestAdminDestNode = -1;

      for (let i = 0; i < networkNodeCount; i++) {
        const doDist = haversine(originCoord, nodes[i].coord);
        if (doDist < minOriginDist) { minOriginDist = doDist; closestOriginNode = i; }
        if (nodes[i].isAdmin && doDist < minAdminOriginDist) {
          minAdminOriginDist = doDist;
          closestAdminOriginNode = i;
        }

        const ddDist = haversine(destCoord, nodes[i].coord);
        if (ddDist < minDestDist) { minDestDist = ddDist; closestDestNode = i; }
        if (nodes[i].isAdmin && ddDist < minAdminDestDist) {
          minAdminDestDist = ddDist;
          closestAdminDestNode = i;
        }
      }

      // Snap Origin strictly to its closest Admin-drawn orange road node when inside Barangay San Rafael
      if (closestAdminOriginNode !== -1 && minAdminOriginDist <= 450) {
        const hitsH = segmentHitsHazard(originCoord, nodes[closestAdminOriginNode].coord, hazardRings);
        addEdge(oId, closestAdminOriginNode, minAdminOriginDist * (hitsH ? 30 : 1), hitsH, true);
      } else if (closestOriginNode !== -1) {
        const hitsH = segmentHitsHazard(originCoord, nodes[closestOriginNode].coord, hazardRings);
        addEdge(oId, closestOriginNode, minOriginDist * (hitsH ? 30 : 1), hitsH, nodes[closestOriginNode].isAdmin);
      }
      if (osrmFirstNodeId !== -1 && minAdminOriginDist > 450) {
        const dOsrmStart = haversine(originCoord, nodes[osrmFirstNodeId].coord);
        addEdge(oId, osrmFirstNodeId, dOsrmStart * 1.2, false, false);
      }

      // Snap Destination strictly to its single closest Admin-route node so every branch trail is followed right to the pin
      if (closestAdminDestNode !== -1 && minAdminDestDist <= 450) {
        const hitsH = segmentHitsHazard(destCoord, nodes[closestAdminDestNode].coord, hazardRings);
        addEdge(dId, closestAdminDestNode, minAdminDestDist * (hitsH ? 30 : 1), hitsH, true);
      } else if (closestDestNode !== -1) {
        const hitsH = segmentHitsHazard(destCoord, nodes[closestDestNode].coord, hazardRings);
        addEdge(dId, closestDestNode, minDestDist * (hitsH ? 30 : 1), hitsH, nodes[closestDestNode].isAdmin);
      }

      // Dijkstra shortest safe path
      const totalN = nodes.length;
      const distArr = new Array(totalN).fill(Infinity);
      const prevArr = new Array(totalN).fill(-1);
      const prevEdgeHazard = new Array(totalN).fill(false);
      const prevEdgeAdmin = new Array(totalN).fill(false);
      const visited = new Array(totalN).fill(false);
      distArr[oId] = 0;

      for (let step = 0; step < totalN; step++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < totalN; i++) {
          if (!visited[i] && distArr[i] < best) {
            best = distArr[i];
            u = i;
          }
        }
        if (u === -1 || u === dId) break;
        visited[u] = true;
        for (const e of adj[u]) {
          if (distArr[u] + e.w < distArr[e.to]) {
            distArr[e.to] = distArr[u] + e.w;
            prevArr[e.to] = u;
            prevEdgeHazard[e.to] = e.isHazard;
            prevEdgeAdmin[e.to] = e.isAdmin;
          }
        }
      }

      if (distArr[dId] < Infinity) {
        const pathCoords = [];
        let cur = dId;
        let usedAdminRoute = false;
        let passedHazard = false;
        while (cur !== -1) {
          pathCoords.push(nodes[cur].coord);
          if (prevEdgeAdmin[cur]) usedAdminRoute = true;
          if (prevEdgeHazard[cur]) passedHazard = true;
          cur = prevArr[cur];
        }
        pathCoords.reverse();

        // Compute true physical distance in meters along the path
        let trueDistMeters = 0;
        for (let i = 0; i < pathCoords.length - 1; i++) {
          trueDistMeters += haversine(pathCoords[i], pathCoords[i + 1]);
        }
        trueDistMeters = Math.round(trueDistMeters);

        const stepLabel = passedHazard
          ? '⚠️ Caution: Follows Admin Evacuation Route (passes near Hazard Zone)'
          : (usedAdminRoute ? 'Follow Admin-Drawn Evacuation Route to destination' : (osrmSteps[0]?.instruction || 'Follow road route to destination'));

        return res.json({
          success: true,
          source: usedAdminRoute ? 'admin_route' : 'road',
          passedHazard,
          distanceMeters: trueDistMeters,
          durationSeconds: Math.round(trueDistMeters / 1.35),
          geometry: {
            type: 'LineString',
            coordinates: pathCoords
          },
          steps: [{ instruction: stepLabel, distance: trueDistMeters }, ...osrmSteps]
        });
      }
    }
  } catch (adminRouteErr) {
    console.warn('[Directions] Admin route graph fallback notice:', adminRouteErr.message);
  }

  if (osrmGeometry) {
    let osrmDist = 0;
    const coords = osrmGeometry.coordinates || [];
    for (let i = 0; i < coords.length - 1; i++) osrmDist += haversine(coords[i], coords[i + 1]);
    return res.json({
      success: true,
      source: 'road',
      distanceMeters: Math.round(osrmDist),
      durationSeconds: Math.round(osrmDist / 8.3),
      geometry: osrmGeometry,
      steps: osrmSteps
    });
  }

  // Direct Haversine path fallback
  const distMeters = Math.round(haversine([oLng, oLat], [dLng, dLat]));

  return res.json({
    success: true,
    source: 'direct',
    distanceMeters: distMeters,
    durationSeconds: Math.round(distMeters / 8.3),
    geometry: {
      type: 'LineString',
      coordinates: [
        [oLng, oLat],
        [dLng, dLat]
      ]
    },
    steps: []
  });
});

// Serve root-scope Service Worker with no-cache headers to ensure immediate background updates
app.get('/service-worker.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'public', 'service-worker.js'));
});

// Force-fresh APK download endpoints (supports reliable Android Download Manager byte-range resume)
const APK_ROUTES = ['/evakwar-resident-v2.9.7.apk', '/evakwar-resident-v2.9.6.apk', '/evakwar-resident-v2.9.5.apk', '/evakwar-resident-v2.9.4.apk', '/evakwar-resident-v2.9.apk', '/evakwar-resident-v2.8.apk', '/evakwar-resident-v2.apk', '/evakwar-latest.apk', '/evakwar-update.apk', '/evakwar-resident.apk', '/evakwar-mobile.apk'];
app.get(APK_ROUTES, (_req, res) => {
  const apkPath = path.join(__dirname, 'public', 'evakwar-resident.apk');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="evakwar-resident-v2.9.7.apk"');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(apkPath);
});

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production' || (res.req && (res.req.secure || res.req.headers['x-forwarded-proto'] === 'https'))) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Lightweight health check endpoint verifying application server responsiveness
app.get('/health', (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.status(200).send('OK');
});

// Mobile App Download Page & Fresh APK Deliveries (Zero Cache)
app.get(['/download', '/get-app', '/app-update'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.render('download-app');
});

// Database connectivity diagnostics endpoint
app.get('/health/db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    res.status(200).json({
      database: 'connected',
      result: rows
    });
  } catch (error) {
    console.error('DB health check failed:', error);
    res.status(500).json({
      database: 'failed',
      error: 'Database connection failed'
    });
  }
});
const SosModel = require("./models/sosModel");
const NotificationModel = require("./models/notificationModel");
const onlineTracker = require("./utils/onlineTracker");
const autoCheckout = require("./utils/autoCheckout");
const rescuerTracker = require("./utils/rescuerTracker");

// Configure Persistent Session with MySQL Store and 30-day rolling expiration
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const sessionMiddleware = session({
  name: 'evakwar.sid',
  secret: process.env.SESSION_SECRET || 'evacwar_secret_key_123',
  store: new MySQLSessionStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true, // Renews cookie expiration on every user interaction/request
  cookie: {
    maxAge: SESSION_MAX_AGE,
    httpOnly: true, // Safeguards against client-side script access
    sameSite: 'lax', // Preserves cookie across app restarts, redirects & PWA launches
    secure: process.env.COOKIE_SECURE === 'true' // Automatically toggled via env (safe for HTTP and HTTPS)
  }
});

app.use(sessionMiddleware);

// Restore authenticated session context for Capacitor Android WebView requests where cross-origin cookies are blocked
app.use((req, _res, next) => {
  if (req.session && !req.session.userId) {
    const mobileUserId = Number(req.headers['x-evakwar-mobile-user-id'] || 0);
    const mobileRole = String(req.headers['x-evakwar-mobile-role'] || '').trim().toLowerCase();
    const mobileResId = Number(req.headers['x-evakwar-mobile-resident-id'] || 0);
    const mobileStaffType = String(req.headers['x-evakwar-mobile-staff-type'] || '').trim();
    const mobileName = String(req.headers['x-evakwar-mobile-name'] || '').trim();
    if (mobileUserId > 0 && ['resident', 'staff', 'rescuer', 'barangay_council'].includes(mobileRole)) {
      req.session.userId = mobileUserId;
      req.session.role = mobileRole === 'rescuer' ? 'staff' : mobileRole;
      if (mobileResId > 0) req.session.residentId = mobileResId;
      if (mobileStaffType) req.session.staffType = mobileStaffType;
      if (mobileName) req.session.userName = mobileName;
    }
  }
  next();
});

const csrfMiddleware = require("./middleware/csrfMiddleware");
app.use(csrfMiddleware);

const server = http.createServer(app);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().toLowerCase())
  : [];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin header (same-origin browser navigation, curl, mobile clients)
      if (!origin) return callback(null, true);

      const lowerOrigin = origin.toLowerCase();

      // Allow local development origins & private LAN IPs
      if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(lowerOrigin)) {
        return callback(null, true);
      }

      // Allow production domains & popular development cloud hosting platforms
      const isEvacwarDomain = /^https?:\/\/([a-z0-9-]+\.)*evacwar-sanrafel\.xyz(:\d+)?$/.test(lowerOrigin);
      const isHostingerDomain = lowerOrigin.endsWith('.hostingersite.com');
      const isExplicitlyAllowed = allowedOrigins.includes(lowerOrigin);
      let isDevHosting = false;
      try {
        const uHost = new URL(lowerOrigin).hostname;
        isDevHosting = /\.(railway\.app|onrender\.com|vercel\.app|ngrok-free\.app|ngrok\.io|fly\.dev|loca\.lt|glitch\.me|up\.railway\.app)$/.test(uHost);
      } catch (_) {}

      if (isEvacwarDomain || isHostingerDomain || isDevHosting || isExplicitlyAllowed) {
        return callback(null, true);
      }

      // Reject untrusted cross-origin requests
      console.warn('[Socket.IO CORS] Rejected origin:', origin);
      return callback(new Error('CORS origin not allowed by Evacwar security policy'));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});
try { require("./routes/loraRoutes").attachIo(io); } catch (_) {}
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, () => {
    const sess = socket.request && socket.request.session;
    if (sess && !sess.userId) {
      const auth = (socket.handshake && socket.handshake.auth) || {};
      const hdrs = (socket.handshake && socket.handshake.headers) || {};
      const mUserId = Number(auth.userId || hdrs['x-evakwar-mobile-user-id'] || 0);
      const mRole = String(auth.role || hdrs['x-evakwar-mobile-role'] || '').trim().toLowerCase();
      const mResId = Number(auth.residentId || hdrs['x-evakwar-mobile-resident-id'] || 0);
      const mStaffType = String(auth.staffType || hdrs['x-evakwar-mobile-staff-type'] || '').trim();
      const mName = String(auth.userName || hdrs['x-evakwar-mobile-name'] || '').trim();
      if (mUserId > 0 && ['resident', 'staff', 'rescuer', 'barangay_council'].includes(mRole)) {
        sess.userId = mUserId;
        sess.role = mRole === 'rescuer' ? 'staff' : mRole;
        if (mResId > 0) sess.residentId = mResId;
        if (mStaffType) sess.staffType = mStaffType;
        if (mName) sess.userName = mName;
      }
    }
    next();
  });
});
onlineTracker.setIo(io);
autoCheckout.startScheduler(io, 60 * 1000);

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Authorize staff and admin sockets into dedicated channel for rescuer telemetry
  const sess = socket.request && socket.request.session;
  if (sess && sess.userId) {
    onlineTracker.addUserSocket(sess.userId, socket.id);
  }
  if (sess && ['admin', 'staff', 'barangay_council'].includes(sess.role)) {
    socket.join('staff_admin_channel');
  }

  socket.on('user:online', async (data) => {
    if (data && data.userId) {
      onlineTracker.addUserSocket(data.userId, socket.id);
      try {
        const [uRows] = await db.execute('SELECT role FROM users WHERE id = ? LIMIT 1', [data.userId]);
        if (uRows.length > 0 && ['admin', 'staff', 'barangay_council'].includes(uRows[0].role)) {
          socket.join('staff_admin_channel');
        }
      } catch (_e) { }
    }
  });

  socket.on('sos:new', async (data) => {
    console.log('SOS New Alert received:', data);
    try {
      if (!data) return;

      const lat = Number(data.latitude);
      const lng = Number(data.longitude);

      // Strict validation: Coordinates must be valid, finite numbers within legal bounds, and not (0,0)
      if (
        data.latitude === null || data.latitude === undefined ||
        data.longitude === null || data.longitude === undefined ||
        isNaN(lat) || isNaN(lng) ||
        !isFinite(lat) || !isFinite(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180 ||
        (lat === 0 && lng === 0)
      ) {
        console.warn('Socket sos:new rejected: Missing or invalid GPS coordinates:', data);
        socket.emit('sos:error', { message: 'Valid GPS coordinates are required to trigger an SOS alert.' });
        return;
      }

      let residentId = data.resident_id || data.residentId || null;
      let residentName = data.name || data.residentName || 'Resident';

      if (residentId) {
        let [resRows] = await db.execute('SELECT id, first_name, last_name FROM residents WHERE id = ?', [residentId]);
        if (!resRows || resRows.length === 0) {
          [resRows] = await db.execute('SELECT id, first_name, last_name FROM residents WHERE user_id = ?', [residentId]);
        }
        if (resRows && resRows.length > 0) {
          residentId = resRows[0].id;
          residentName = `${resRows[0].first_name} ${resRows[0].last_name || ''}`.trim();
        }
      }

      const created = await SosModel.createAlert({
        resident_id: residentId,
        name: residentName,
        latitude: lat,
        longitude: lng,
        accuracy: Number(data.accuracy || 0)
      });

      if (!created) {
        console.warn('SosModel.createAlert returned null, alert creation skipped.');
        return;
      }
      if (created.error === 'OUTSIDE_BARANGAY') {
        socket.emit('sos:error', {
          error: 'OUTSIDE_BARANGAY',
          message: created.message || 'SOS & Rescue option is available ONLY within Barangay San Rafael boundary.'
        });
        return;
      }

      io.emit('sos:new', created);
      if (created.auto_assigned && created.responder_name) {
        try {
          const loraRoutes = require('./routes/loraRoutes');
          loraRoutes.queueOutboundSosAck(created, created.status || 'ACKNOWLEDGED', created.responder_name, {
            lat: created.rescuer_lat || 13.51037,
            lng: created.rescuer_lng || 123.34810
          });
        } catch (_e) {}
        const rPhoto = created.rescuer_photo || created.handler_photo || null;
        io.emit('sos:update_status', {
          id: Number(created.id),
          sos_id: Number(created.id),
          resident_id: created.resident_id ? Number(created.resident_id) : null,
          status: created.status || 'ACKNOWLEDGED',
          handled_by: created.handled_by || null,
          responder_name: created.responder_name,
          handler_name: created.handler_name || created.responder_name,
          rescuer_photo: rPhoto,
          handler_photo: rPhoto,
          rescuer_lat: created.rescuer_lat || 13.51037,
          rescuer_lng: created.rescuer_lng || 123.34810,
          auto_assigned: true,
          auto_assigned_type: created.auto_assigned_type || 'NEAREST_RESCUER',
          alert: created
        });
        io.emit('rescuer:location_update', {
          sos_id: Number(created.id),
          rescuer_user_id: created.handled_by || null,
          rescuer_name: created.responder_name,
          rescuer_role: 'Emergency Rescuer',
          rescuer_photo: rPhoto,
          latitude: created.rescuer_lat || 13.51037,
          longitude: created.rescuer_lng || 123.34810,
          lat: created.rescuer_lat || 13.51037,
          lng: created.rescuer_lng || 123.34810,
          status: created.status || 'ACKNOWLEDGED',
          resident_id: created.resident_id ? Number(created.resident_id) : null,
          resident_lat: Number(created.latitude) || null,
          resident_lng: Number(created.longitude) || null,
          updated_at: new Date().toISOString()
        });
      }
      NotificationModel.invalidateCache();
    } catch (err) {
      console.error('Error handling socket sos:new:', err);
    }
  });

  socket.on('sos:update', async (data) => {
    try {
      let targetAlertId = data.id;
      let updated = null;

      if (targetAlertId) {
        updated = await SosModel.updateLocation(targetAlertId, {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          accuracy: Number(data.accuracy || 0)
        });
      }

      if (!updated && data.resident_id) {
        const activeSos = await SosModel.getActiveByResidentId(data.resident_id);
        if (activeSos) {
          updated = await SosModel.updateLocation(activeSos.id, {
            latitude: Number(data.latitude),
            longitude: Number(data.longitude),
            accuracy: Number(data.accuracy || 0)
          });
        }
      }

      if (updated) {
        io.emit('sos:update', updated);
      }
    } catch (err) {
      console.error('Error handling socket sos:update:', err);
    }
  });

  socket.on('rescuer:location', async (data) => {
    try {
      if (!data || !data.sos_id) return;

      // Strictly authenticate user session (Never trust client-supplied userId or role)
      const sess = socket.request && socket.request.session;
      const authUserId = sess ? sess.userId : null;
      if (!authUserId) return;

      // Validate role & fetch rescuer identity directly from database
      const [userRows] = await db.execute(
        `SELECT u.id, u.role, s.first_name, s.middle_name, s.last_name, s.occupation, s.profile_photo, s.staff_type
         FROM users u
         LEFT JOIN staff s ON u.id = s.user_id
         WHERE u.id = ? LIMIT 1`,
        [authUserId]
      );
      if (userRows.length === 0) return;
      const u = userRows[0];
      if (!['staff', 'barangay_council', 'admin'].includes(u.role)) return;

      const lat = Number(data.latitude);
      const lng = Number(data.longitude);
      if (
        data.latitude === null || data.latitude === undefined ||
        data.longitude === null || data.longitude === undefined ||
        isNaN(lat) || isNaN(lng) ||
        !isFinite(lat) || !isFinite(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180 ||
        (lat === 0 && lng === 0)
      ) {
        return;
      }

      const sosAlert = await SosModel.getById(data.sos_id);
      if (!sosAlert) return;

      // Track while active in ACKNOWLEDGED, RESPONDING, or RESCUED state
      if (!['ACKNOWLEDGED', 'RESPONDING', 'RESCUED'].includes(sosAlert.status)) {
        rescuerTracker.clearRescuerLocation(data.sos_id);
        io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(data.sos_id) });
        return;
      }

      const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || (u.role === 'admin' ? 'Administrator' : 'Emergency Rescuer');
      let photo = u.profile_photo || null;
      if (photo && !photo.startsWith('http') && !photo.startsWith('/')) {
        photo = `/uploads/profiles/${photo}`;
      }

      const rescuerPayload = {
        sos_id: Number(data.sos_id),
        rescuer_user_id: u.id,
        rescuer_name: fullName,
        rescuer_role: u.occupation || (u.role === 'admin' ? 'Administrator' : 'Emergency Rescuer'),
        rescuer_photo: photo,
        latitude: lat,
        longitude: lng,
        lat: lat,
        lng: lng,
        accuracy: Number(data.accuracy || 0),
        status: sosAlert.status,
        updated_at: new Date().toISOString()
      };

      rescuerTracker.updateRescuerLocation(data.sos_id, rescuerPayload);
      io.emit('rescuer:location_update', {
        ...rescuerPayload,
        resident_id: sosAlert.resident_id || null,
        resident_lat: Number(sosAlert.latitude) || null,
        resident_lng: Number(sosAlert.longitude) || null
      });
    } catch (err) {
      console.error('Error handling socket rescuer:location:', err);
    }
  });

  // Standby GPS heartbeat so nearest-rescuer auto-assignment always uses real live coordinates
  socket.on('rescuer:standby_location', async (data) => {
    try {
      const sUserId = Number((sess && sess.userId) || (socket.handshake && socket.handshake.auth && socket.handshake.auth.userId) || (data && data.userId) || 0);
      if (!sUserId || !data) return;
      const lat = Number(data.latitude !== undefined ? data.latitude : data.lat);
      const lng = Number(data.longitude !== undefined ? data.longitude : data.lng);
      if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return;

      const cached = rescuerTracker.getRescuerLocation(sUserId);
      let sName = (data.rescuer_name && data.rescuer_name !== 'Emergency Rescuer' && data.rescuer_name !== 'Rescuer Unit')
        ? data.rescuer_name
        : ((cached && cached.rescuer_name && cached.rescuer_name !== 'Emergency Rescuer') ? cached.rescuer_name : null);
      let sPhoto = data.rescuer_photo || (cached && cached.rescuer_photo) || null;
      let sRole = (cached && cached.rescuer_role) || null;

      if (!sName || !sPhoto) {
        const [pRows] = await db.execute('SELECT first_name, last_name, profile_photo, occupation, staff_type FROM staff WHERE user_id = ? LIMIT 1', [sUserId]).catch(() => [[]]);
        if (pRows && pRows.length > 0) {
          // Strictly only track Rescuer accounts on the map
          if (pRows[0].staff_type && !['RESCUER', 'BOTH'].includes(String(pRows[0].staff_type).toUpperCase())) {
            return;
          }
          const dbName = `${pRows[0].first_name || ''} ${pRows[0].last_name || ''}`.trim();
          if (dbName) sName = dbName;
          if (!sPhoto && pRows[0].profile_photo) sPhoto = pRows[0].profile_photo;
          if (pRows[0].occupation) sRole = pRows[0].occupation;
        }
      }
      if (!sName) {
        sName = (sess && sess.userName) || (socket.handshake && socket.handshake.auth && socket.handshake.auth.userName) || null;
      }
      if (!sName) return;

      if (sPhoto && !String(sPhoto).startsWith('http') && !String(sPhoto).startsWith('/')) {
        sPhoto = `/uploads/profiles/${sPhoto}`;
      }
      rescuerTracker.updateRescuerLocation(null, {
        rescuer_user_id: sUserId,
        rescuer_name: sName,
        rescuer_photo: sPhoto,
        rescuer_role: sRole || sName,
        latitude: lat,
        longitude: lng,
        accuracy: Number(data.accuracy || 0)
      });
      io.emit('rescuer:location_update', {
        sos_id: `standby_${sUserId}`,
        rescuer_user_id: sUserId,
        rescuer_name: sName,
        rescuer_photo: sPhoto,
        rescuer_role: sRole || sName,
        latitude: lat,
        longitude: lng,
        lat: lat,
        lng: lng,
        accuracy: Number(data.accuracy || 0),
        status: 'STANDBY',
        updated_at: new Date().toISOString()
      });

      // Automatically assign any pending/unassigned SOS alerts (or alerts assigned to an offline rescuer) to the nearest online rescuer!
      const { autoAssignPendingSosToOnlineRescuer } = require('./utils/barangayGeofence');
      if (typeof autoAssignPendingSosToOnlineRescuer === 'function') {
        await autoAssignPendingSosToOnlineRescuer(io);
      }
    } catch (_) {}
  });

  socket.on('sos:cancel', async (data) => {
    try {
      if (!data) return;
      const cancelledAlerts = await SosModel.cancelAlert(data.id, data.resident_id);
      NotificationModel.invalidateCache();

      if (cancelledAlerts && cancelledAlerts.length > 0) {
        cancelledAlerts.forEach(alert => {
          rescuerTracker.clearRescuerLocation(alert.id);
          io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(alert.id) });
          io.emit('sos:cancel', { id: Number(alert.id), sos_id: Number(alert.id), resident_id: alert.resident_id ? Number(alert.resident_id) : null, status: 'CANCELLED' });
          io.emit('sos:update_status', { id: Number(alert.id), sos_id: Number(alert.id), resident_id: alert.resident_id ? Number(alert.resident_id) : null, status: 'CANCELLED' });
        });
      } else {
        const alertId = data.id ? Number(data.id) : null;
        const resId = data.resident_id ? Number(data.resident_id) : null;
        if (alertId) {
          rescuerTracker.clearRescuerLocation(alertId);
          io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: alertId });
        }
        io.emit('sos:cancel', { id: alertId, sos_id: alertId, resident_id: resId, status: 'CANCELLED' });
        if (alertId) {
          io.emit('sos:update_status', { id: alertId, sos_id: alertId, resident_id: resId, status: 'CANCELLED' });
        }
      }
    } catch (err) {
      console.error('Error handling socket sos:cancel:', err);
    }
  });

  socket.on('sos:resolve', async (data) => {
    try {
      if (data.id) {
        const socketUserId = socket.request?.session?.userId || (data.handled_by || null);
        const socketRole = socket.request?.session?.role || null;
        const result = await SosModel.updateStatus(data.id, 'RESOLVED', socketUserId, null, socketRole);
        if (result && result.error) {
          socket.emit('sos:error', { id: data.id, message: result.message, alert: result.alert });
          return;
        }
        rescuerTracker.clearRescuerLocation(data.id);
        io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(data.id) });
        NotificationModel.invalidateCache();
        io.emit('sos:resolve', { id: Number(data.id), status: 'RESOLVED' });
        try {
          const loraRoutes = require('./routes/loraRoutes');
          loraRoutes.queueOutboundSosAck(result, 'RESOLVED', (result && result.handler_name) || 'Rescue Team');
        } catch (_e) {}
      }
    } catch (err) {
      console.error('Error handling socket sos:resolve:', err);
    }
  });

  socket.on('sos:update_status', async (data) => {
    try {
      if (data && data.id && data.status) {
        const nextStatus = String(data.status).toUpperCase();
        const socketUserId = socket.request?.session?.userId || (data.handled_by || null);
        const socketRole = socket.request?.session?.role || null;
        const result = await SosModel.updateStatus(data.id, nextStatus, socketUserId, data.notes || null, socketRole);
        if (result && result.error) {
          socket.emit('sos:error', { id: data.id, message: result.message, alert: result.alert });
          return;
        }
        const updated = result;
        try {
          const loraRoutes = require('./routes/loraRoutes');
          loraRoutes.queueOutboundSosAck(updated, nextStatus, (updated && updated.handler_name) || data.handler_name || 'Staff Responder');
        } catch (_e) {}
        NotificationModel.invalidateCache();
        io.emit('sos:update_status', {
          id: Number(data.id),
          status: nextStatus,
          handled_by: (updated && updated.handled_by) ? updated.handled_by : (data.handled_by || null),
          handler_name: (updated && updated.handler_name) ? updated.handler_name : (data.handler_name || 'Staff Responder'),
          handler_contact: (updated && updated.handler_contact) ? updated.handler_contact : null,
          notes: data.notes || null,
          alert: updated,
          updated_at: new Date().toISOString()
        });
        if (nextStatus === 'RESOLVED' || nextStatus === 'CANCELLED') {
          rescuerTracker.clearRescuerLocation(data.id);
          io.to('staff_admin_channel').emit('rescuer:location_cleared', { sos_id: Number(data.id) });
          io.emit('sos:resolve', { id: Number(data.id), status: nextStatus });
        }
      }
    } catch (err) {
      console.error('Error handling socket sos:update_status:', err);
    }
  });

  socket.on('sos_alert', async (data) => {
    console.log('Legacy SOS Alert received:', data);
    try {
      if (!data) return;

      const lat = Number(data.latitude);
      const lng = Number(data.longitude);

      if (
        data.latitude === null || data.latitude === undefined ||
        data.longitude === null || data.longitude === undefined ||
        isNaN(lat) || isNaN(lng) ||
        !isFinite(lat) || !isFinite(lng) ||
        lat < -90 || lat > 90 ||
        lng < -180 || lng > 180 ||
        (lat === 0 && lng === 0)
      ) {
        console.warn('Socket sos_alert rejected: Missing or invalid coordinates', data);
        return;
      }

      let residentId = data.resident_id || data.residentId || null;
      let residentName = data.residentName || data.name || 'Resident';

      if (residentId) {
        const [resRows] = await db.execute('SELECT id, first_name, last_name FROM residents WHERE id = ? OR user_id = ? LIMIT 1', [residentId, residentId]);
        if (resRows.length > 0) {
          residentId = resRows[0].id;
          if (!data.name && !data.residentName) {
            residentName = `${resRows[0].first_name} ${resRows[0].last_name || ''}`.trim();
          }
        }
      }

      const created = await SosModel.createAlert({
        resident_id: residentId,
        name: residentName,
        latitude: lat,
        longitude: lng,
        accuracy: Number(data.accuracy || 0)
      });

      if (created) {
        io.emit('sos:new', created);
        io.emit('sos_alert', created);
      }
    } catch (err) {
      console.error('Error handling legacy sos_alert:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
    onlineTracker.removeSocket(socket.id);
    const disconnectedUid = Number((sess && sess.userId) || (socket.handshake && socket.handshake.auth && socket.handshake.auth.userId) || 0);
    if (disconnectedUid > 0) {
      setTimeout(() => {
        if (!onlineTracker.isUserOnline(disconnectedUid)) {
          const cleared = rescuerTracker.clearRescuerLocationByRescuerId(disconnectedUid);
          if (cleared) {
            io.emit('rescuer:location_cleared', {
              rescuer_user_id: disconnectedUid,
              sos_id: `standby_${disconnectedUid}`
            });
          }
        }
      }, 10000);
    }
  });
});

app.use((req, res, next) => {
  req.io = io;
  next();
});



// Server startup initialization moved to startServer() below

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const getMapConfig = require("./config/mapConfig");

// Global template middleware for active alert and logged-in user state (parallelized & non-blocking)
app.use(async (req, res, next) => {
  res.locals.activeAlert = null;
  res.locals.profilePhoto = null;
  res.locals.user = { name: "Guest", role: "guest" };
  res.locals.staff = null;
  res.locals.resident = null;
  res.locals.weather = weatherService.getFallbackWeather();
  res.locals.mapConfig = getMapConfig();

  // Unified Philippine Local Time Formatters (Asia/Manila UTC+8)
  res.locals.formatManilaTime = (dateVal) => {
    if (!dateVal) return 'Just now';
    let d = null;
    if (dateVal instanceof Date) d = dateVal;
    else if (typeof dateVal === 'number') d = new Date(dateVal);
    else if (typeof dateVal === 'string') {
      const trimmed = dateVal.trim();
      if (/^\d{10,13}$/.test(trimmed)) d = new Date(Number(trimmed));
      else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(trimmed)) {
        d = !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)
          ? new Date(trimmed.replace(' ', 'T') + 'Z')
          : new Date(trimmed);
      } else {
        d = new Date(trimmed);
      }
    }
    if (!d || isNaN(d.getTime())) return 'Just now';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  };

  res.locals.formatManilaDateTime = (dateVal) => {
    if (!dateVal) return 'N/A';
    let d = null;
    if (dateVal instanceof Date) d = dateVal;
    else if (typeof dateVal === 'number') d = new Date(dateVal);
    else if (typeof dateVal === 'string') {
      const trimmed = dateVal.trim();
      if (/^\d{10,13}$/.test(trimmed)) d = new Date(Number(trimmed));
      else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(trimmed)) {
        d = !trimmed.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(trimmed)
          ? new Date(trimmed.replace(' ', 'T') + 'Z')
          : new Date(trimmed);
      } else {
        d = new Date(trimmed);
      }
    }
    if (!d || isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' });
  };

  try {
    const userId = req.session ? req.session.userId : null;
    const now = Date.now();
    const cachedProfile = req.session ? req.session.userProfile : null;
    const isProfileFresh = cachedProfile && (now - (req.session.userProfileTime || 0) < 300000);

    // Fast in-memory cached alert lookup (15s cache)
    const alertPromise = Alert.getLatestActive().catch(() => null);

    let profilePromise = Promise.resolve();
    if (userId && !isProfileFresh) {
      profilePromise = db.execute(`
        SELECT 
          u.id, u.email, u.role, u.is_verified,
          s.id as staff_id, s.first_name as staff_first_name, s.middle_name as staff_middle_name, s.last_name as staff_last_name,
          s.contact_number as staff_contact, s.profile_photo as staff_photo, s.staff_type, s.assigned_center_id, s.occupation as staff_occupation,
          r.id as resident_id, r.first_name as resident_first_name, r.middle_name as resident_middle_name, r.last_name as resident_last_name,
          r.contact_number as resident_contact, r.profile_photo as resident_photo, r.barangay as resident_barangay,
          r.home_address, r.vulnerability, r.family_size, r.emergency_contact_name, r.emergency_contact_phone, r.qr_code_uuid,
          r.approval_status as resident_approval_status,
          ec.name as assigned_center_name, ec.address as assigned_center_address
        FROM users u 
        LEFT JOIN staff s ON u.id = s.user_id
        LEFT JOIN residents r ON u.id = r.user_id
        LEFT JOIN evacuation_centers ec ON s.assigned_center_id = ec.id
        WHERE u.id = ?
      `, [userId]).catch(() => [[]]);
    }

    const [latestAlert, userResult] = await Promise.all([
      alertPromise,
      profilePromise
    ]);

    if (latestAlert) {
      res.locals.activeAlert = latestAlert;
    }

    if (userId) {
      if (isProfileFresh) {
        res.locals.profilePhoto = cachedProfile.profilePhoto;
        res.locals.user = cachedProfile.user;
        res.locals.staff = cachedProfile.staff;
        res.locals.resident = cachedProfile.resident;
      } else if (userResult && userResult[0] && userResult[0].length > 0) {
        const u = userResult[0][0];
        const isStaffRole = u.role === 'staff' || u.role === 'barangay_council';
        const isResidentRole = u.role === 'resident';
        const isAdminRole = u.role === 'admin';

        let firstName = '';
        let middleName = '';
        let lastName = '';
        let profilePhoto = null;
        let contactNumber = '';

        if (isStaffRole) {
          firstName = u.staff_first_name || u.resident_first_name || '';
          middleName = u.staff_middle_name || u.resident_middle_name || '';
          lastName = u.staff_last_name || u.resident_last_name || '';
          profilePhoto = u.staff_photo || u.resident_photo || null;
          contactNumber = u.staff_contact || u.resident_contact || '';
        } else if (isResidentRole) {
          firstName = u.resident_first_name || '';
          middleName = u.resident_middle_name || '';
          lastName = u.resident_last_name || '';
          profilePhoto = u.resident_photo || null;
          contactNumber = u.resident_contact || '';
        } else if (isAdminRole) {
          firstName = u.resident_first_name || u.staff_first_name || 'Administrator';
          middleName = u.resident_middle_name || u.staff_middle_name || '';
          lastName = u.resident_last_name || u.staff_last_name || '';
          if (firstName === 'Super' && (!lastName || lastName === 'Admin' || lastName === 'Administrator')) {
            firstName = 'Administrator';
            lastName = '';
          }
          profilePhoto = u.resident_photo || u.staff_photo || null;
          contactNumber = u.resident_contact || u.staff_contact || '';
        }

        const nameParts = [firstName, middleName, lastName].filter(Boolean);
        const displayName = nameParts.length > 0 ? nameParts.join(' ') : (u.email ? u.email.split('@')[0] : (isAdminRole ? 'Administrator' : 'User'));

        let resolvedPhoto = profilePhoto;
        if (resolvedPhoto) {
          resolvedPhoto = (resolvedPhoto.startsWith('http') || resolvedPhoto.startsWith('/'))
            ? resolvedPhoto
            : `/uploads/profiles/${resolvedPhoto}`;
        }

        const newCachedProfile = {
          profilePhoto: resolvedPhoto,
          user: {
            id: u.id,
            email: u.email,
            role: u.role,
            staff_type: isStaffRole ? (u.staff_type || 'BOTH') : null,
            name: displayName,
            firstName: firstName,
            lastName: lastName,
            contact_number: contactNumber,
            profile_photo: resolvedPhoto,
            resident_id: isResidentRole ? u.resident_id : null
          },
          staff: isStaffRole ? {
            userId: u.id,
            id: u.staff_id || u.id,
            name: displayName,
            firstName: firstName,
            lastName: lastName,
            email: u.email,
            role: u.role,
            staff_type: u.staff_type || 'BOTH',
            assigned_center_id: u.assigned_center_id || null,
            assigned_barangay: u.assigned_center_address || 'San Rafael',
            profile_photo: resolvedPhoto,
            center: u.assigned_center_name ? {
              id: u.assigned_center_id,
              name: u.assigned_center_name,
              address: u.assigned_center_address
            } : null
          } : null,
          resident: isResidentRole ? {
            id: u.resident_id,
            user_id: u.id,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            contact_number: contactNumber,
            home_address: u.home_address,
            barangay: u.resident_barangay || 'San Rafael',
            vulnerability: u.vulnerability || 'None',
            family_size: u.family_size || 1,
            emergency_contact_name: u.emergency_contact_name,
            emergency_contact_phone: u.emergency_contact_phone,
            qr_code_uuid: u.qr_code_uuid,
            approval_status: u.resident_approval_status || (u.is_verified ? 'APPROVED' : 'PENDING'),
            profile_photo: resolvedPhoto
          } : null
        };

        if (req.session) {
          req.session.userProfile = newCachedProfile;
          req.session.userProfileTime = now;
          if (isStaffRole) {
            req.session.staffType = u.staff_type || 'BOTH';
          }
        }

        res.locals.profilePhoto = newCachedProfile.profilePhoto;
        res.locals.user = newCachedProfile.user;
        res.locals.staff = newCachedProfile.staff;
        res.locals.resident = newCachedProfile.resident;
      } else if (cachedProfile) {
        res.locals.profilePhoto = cachedProfile.profilePhoto;
        res.locals.user = cachedProfile.user;
        res.locals.staff = cachedProfile.staff;
        res.locals.resident = cachedProfile.resident;
      }
    }
  } catch (error) {
    console.error("Error in global template middleware:", error);
  }

  next();
});

// Serve Capacitor Resident Mobile App bundle at /resident-mobile
app.use("/resident-mobile", express.static(path.join(__dirname, "resident-mobile")));

app.use("/", require("./routes"));

// Bulletproof logout fallback for both /logout and /logout/index.html
app.all(["/logout", "/logout/index.html", "/logout/"], (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('evakwar.sid', { path: '/' });
      res.clearCookie('connect.sid', { path: '/' });
      res.redirect('/login');
    });
  } else {
    res.clearCookie('evakwar.sid', { path: '/' });
    res.clearCookie('connect.sid', { path: '/' });
    res.redirect('/login');
  }
});

// Custom 404 handler ensuring complete security headers are preserved on all unhandled requests
app.use((req, res) => {
  res.status(404);
  if (req.accepts('html')) {
    return res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>404 Not Found · Evacwar</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 1.5rem; text-align: center; box-sizing: border-box; }
    .card { max-width: 26rem; width: 100%; background: #1e293b; border-radius: 1.25rem; border: 1px solid #334155; padding: 2rem 1.5rem; box-shadow: 0 12px 30px rgba(0,0,0,0.35); }
    h1 { font-size: 1.5rem; font-weight: 800; margin: 0 0 0.5rem; color: #ffffff; }
    p { font-size: 0.875rem; color: #94a3b8; margin: 0 0 1.5rem; line-height: 1.5; }
    .btn { display: inline-flex; justify-content: center; align-items: center; width: 100%; padding: 0.75rem 1rem; border-radius: 0.75rem; font-weight: 700; font-size: 0.875rem; text-decoration: none; cursor: pointer; background: #2563eb; color: #ffffff; border: none; box-sizing: border-box; }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Page Not Found</h1>
    <p>The requested page or endpoint could not be found. Please return to the Evacwar dashboard.</p>
    <a href="/" class="btn">Return to Home</a>
  </div>
</body>
</html>`);
  }
  if (req.accepts('json') || (req.originalUrl && req.originalUrl.startsWith('/api/'))) {
    return res.json({ success: false, error: 'NOT_FOUND', message: 'Resource not found' });
  }
  return res.type('txt').send('404 Not Found');
});

const { handleControllerError } = require("./utils/dbError");
app.use((err, req, res, next) => {
  return handleControllerError(err, req, res, "Global Error Handler");
});

const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.HOST || '0.0.0.0';

async function startServer() {
  // Bind HTTP port immediately so cloud platforms (Render) pass port/health checks in <1s
  server.listen(PORT, HOSTNAME, () => {
    console.log(`EvakWar server is running on port ${PORT}`);

    if (!process.env.PORT) {
      console.log(`- Local access: http://localhost:${PORT}`);
      console.log(`- Wi-Fi LAN access: http://<your-computer-ip>:${PORT}`);
    }
  });

  // Run DB migrations, admin seeding, pool warm-up, and photo sync asynchronously
  (async () => {
    try {
      await runMigration();
      await seedAdmin();
      if (typeof db.prewarmPool === 'function') {
        await db.prewarmPool(4);
      }
      await persistentPhotoStore.init();
    } catch (err) {
      console.error("Initialization error:", err);
    }
  })();

  // Dual HTTP + HTTPS listener for Web Bluetooth and secure browser APIs on mobile LAN
  try {
    const sslKeyPath = path.join(__dirname, 'ssl', 'server.key');
    const sslCrtPath = path.join(__dirname, 'ssl', 'server.crt');
    if (!process.env.RENDER && fs.existsSync(sslKeyPath) && fs.existsSync(sslCrtPath)) {
      const httpsOptions = {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCrtPath)
      };
      const httpsServer = https.createServer(httpsOptions, app);
      io.attach(httpsServer);
      const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
      httpsServer.listen(HTTPS_PORT, HOSTNAME, () => {
        console.log(`[HTTPS] Secure EvakWar server active for BLE at https://localhost:${HTTPS_PORT}`);
        console.log(`[HTTPS] Mobile LAN access for Web Bluetooth: https://192.168.0.100:${HTTPS_PORT}`);
      });
    }
  } catch (httpsErr) {
    console.warn('[HTTPS] Could not start HTTPS listener:', httpsErr.message);
  }
}

startServer();