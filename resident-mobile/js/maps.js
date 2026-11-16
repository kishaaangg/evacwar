/* global L */
(function () {
  function safeParseJson(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (_e) {
      return null;
    }
  }

  function levelColor(level) {
    const v = String(level || "").toUpperCase();
    if (v === "RED") return "#E94E77";
    if (v === "ORANGE") return "#F5A623";
    return "#50C878";
  }

  function availabilityColor(availability, occupancy, capacity) {
    const a = String(availability || "").toLowerCase();
    if (a === "full" || (typeof occupancy === "number" && typeof capacity === "number" && occupancy >= capacity)) return "#E94E77";
    if (a === "limited") return "#F5A623";
    return "#50C878";
  }

  function initMap(containerId, opts) {
    const el = document.getElementById(containerId);
    if (!el || typeof L === "undefined") return null;

    const center = opts.center || { lat: 13.5102, lng: 123.3470 };
    const map = L.map(containerId, { zoomControl: true }).setView([center.lat, center.lng], opts.zoom || 14);

    const satTileUrl = (window.MAP_CONFIG && window.MAP_CONFIG.satelliteUrl)
      ? window.MAP_CONFIG.satelliteUrl
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    const osmTileUrl = (window.MAP_CONFIG && window.MAP_CONFIG.osmUrl)
      ? window.MAP_CONFIG.osmUrl
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const cartoKey = (window.MAP_CONFIG && window.MAP_CONFIG.cartoApiKey) || 'cb1_3yqn_1_e8e7aa49f848f5be5735ded9';
    let labelsTileUrl = (window.MAP_CONFIG && window.MAP_CONFIG.labelsUrl)
      ? window.MAP_CONFIG.labelsUrl
      : `https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoKey)}`;
    if (cartoKey && !labelsTileUrl.includes('key=')) {
      labelsTileUrl += (labelsTileUrl.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(cartoKey);
    }

    const satBase = L.tileLayer(satTileUrl, {
      maxZoom: 19,
      attribution: "Esri, Maxar, Earthstar Geographics"
    }).addTo(map);

    const osmBase = L.tileLayer(osmTileUrl, {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    });

    const labelsOverlay = L.tileLayer(labelsTileUrl, {
      maxZoom: 19
    }).addTo(map);

    L.control.layers({
      "Satellite View": satBase,
      "Standard Map": osmBase
    }, {
      "Roads & Labels": labelsOverlay
    }, { position: "topright" }).addTo(map);

    return map;
  }

  function addCenters(map, centers, highlightId) {
    if (!map || !Array.isArray(centers)) return;
    centers.forEach((c) => {
      const color = availabilityColor(c.availability, c.occupancy, c.capacity);
      const ring = String(c.id) === String(highlightId);
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: ring ? 10 : 8,
        color: ring ? "#1f2937" : color,
        weight: ring ? 3 : 2,
        fillColor: color,
        fillOpacity: 0.9
      }).addTo(map);

      const pct = typeof c.occupancy === "number" && typeof c.capacity === "number" ? Math.round((c.occupancy / c.capacity) * 100) : null;
      marker.bindPopup(
        `<div style="font-family: system-ui; min-width: 220px;">
          <div style="font-weight:700; margin-bottom:4px;">${c.name}</div>
          <div style="color:#374151; font-size:12px; margin-bottom:6px;">${c.type || "Evacuation Center"}</div>
          <div style="display:flex; gap:10px; font-size:12px; color:#111827;">
            <div><b>Capacity</b>: ${c.capacity ?? "—"}</div>
            <div><b>Occupancy</b>: ${c.occupancy ?? "—"}${pct !== null ? ` (${pct}%)` : ""}</div>
          </div>
        </div>`
      );
    });
  }

  function addSos(map, sos) {
    if (!map || !Array.isArray(sos)) return;
    sos.forEach((s) => {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") return;
      const sev = String(s.severity || "").toLowerCase();
      const color = sev === "high" ? "#E94E77" : sev === "medium" ? "#F5A623" : "#4A90E2";
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.9
      }).addTo(map);
      marker.bindPopup(`<div style="font-family: system-ui;"><b>${s.name}</b><div style="font-size:12px;color:#374151;">${s.location || ""}</div></div>`);
    });
  }

  // Core overview map initialization
  const adminData = safeParseJson("pageData");
  if (adminData && adminData.pageKey === "admin") {
    const map = initMap("adminMap", { center: { lat: 13.442, lng: 123.366 }, zoom: 14 });
    if (map) {
      const centers = adminData.centers || [];
      // add a few SOS points near the center (UI-only)
      const sos = (adminData.sos || []).map((s, idx) => ({
        ...s,
        lat: 13.442 + (idx - 1) * 0.003,
        lng: 123.366 + (idx - 1) * 0.004
      }));
      addCenters(map, centers);
      addSos(map, sos);
    }
  }

  // RESIDENT MAP
  if (adminData && adminData.pageKey === "resident") {
    const map = initMap("residentMap", { center: { lat: 13.442, lng: 123.366 }, zoom: 14 });
    if (map) {
      addCenters(map, adminData.centersNearby || []);
    }
  }

  // OWNER MAP
  if (adminData && adminData.pageKey === "owner") {
    const map = initMap("ownerMap", { center: adminData.center || { lat: 13.446, lng: 123.371 }, zoom: 15 });
    if (map) {
      addCenters(map, [adminData.center].filter(Boolean), adminData.center && adminData.center.id);
    }
  }

  // Small helper for alert badge color (used by UI templates)
  window.EvacWarLevelColor = levelColor;
})();

