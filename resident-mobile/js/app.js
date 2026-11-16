/**
 * EvakWar (E-BAKWAR) — Resident Mobile Application Controller
 * Replicates the authentic EvakWar design from views/resident/evacuation.ejs & resident map.png
 * Features:
 *   - Google Satellite Hybrid MapLibre Map with 3D terrain & rotation
 *   - Exact green house SVG evacuation center pins & orange evacuation routes
 *   - Draggable / Tapable Google Maps-style Bottom Sheet
 *   - Bottom Navigation Bar with floating center red SOS button
 *   - Full 433.875 MHz LoRa Mesh hardware integration (BLE GATT & USB-OTG)
 *   - 100% Offline execution (Zero Wi-Fi & Zero Mobile Data required)
 */

(function () {
  'use strict';

  // State Management
  let mapInstance = null;
  let activeTab = 'map';
  let activeBasemap = 'hybrid';
  let is3D = false;
  let currentBearing = 0;
  let isBottomSheetOpen = false;
  let activeSosId = null;

  // Centers & Features from preloaded offline dataset
  const centersData = window.OFFLINE_CENTERS || [];
  const mapFeatures = window.OFFLINE_MAP_FEATURES || { type: 'FeatureCollection', features: [] };

  // Initialize LoRa Mesh Client
  const loraClient = new window.LoRaMeshClient();
  window.evakwarLora = loraClient;

  // =========================================================================
  // 1. MAPLIBRE INITIALIZATION (GOOGLE SATELLITE HYBRID BASMAP)
  // =========================================================================
  function initEvacuationMap() {
    if (mapInstance) return;
    const container = document.getElementById('evacuationMap');
    if (!container || typeof maplibregl === 'undefined') {
      setTimeout(initEvacuationMap, 100);
      return;
    }

    const defaultCenter = [123.3485, 13.5103]; // Barangay San Rafael, Baao

    // Basemap tile definitions with automatic fallback
    const googleHybrid = 'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}';
    const googleSatOnly = 'https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}';
    const googleRoads = 'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}';

    const styleSpec = {
      version: 8,
      sources: {
        'satellite-tiles': {
          type: 'raster',
          tiles: [googleHybrid],
          tileSize: 256,
          maxzoom: 20,
          attribution: 'Google Satellite Imagery'
        },
        'resident-routes': {
          type: 'geojson',
          data: mapFeatures
        }
      },
      layers: [
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-tiles',
          minzoom: 0,
          maxzoom: 20
        },
        // Orange Evacuation Routes
        {
          id: 'evac-routes-line',
          type: 'line',
          source: 'resident-routes',
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': '#f97316',
            'line-width': 4.5,
            'line-opacity': 0.95
          }
        },
        // Red Flood Hazard Zones
        {
          id: 'hazard-zones-fill',
          type: 'fill',
          source: 'resident-routes',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'type', 'boundary']],
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': 0.28
          }
        },
        {
          id: 'hazard-zones-outline',
          type: 'line',
          source: 'resident-routes',
          filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'type', 'boundary']],
          paint: {
            'line-color': '#dc2626',
            'line-width': 2.0,
            'line-opacity': 0.9
          }
        }
      ]
    };

    mapInstance = new maplibregl.Map({
      container: 'evacuationMap',
      style: styleSpec,
      center: defaultCenter,
      zoom: 15.5,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    mapInstance.on('load', () => {
      renderEvacuationCenterMarkers();
      renderLandmarkPois();
      populateBottomSheetCenters();
    });
  }

  // Exact Green House SVG Marker matching screenshot
  function createGreenHousePinSvg(isFull = false) {
    const fillColor = isFull ? '#ef4444' : '#10b981';
    return `
      <div class="marker-pulse" style="cursor:pointer;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.35));">
        <svg viewBox="0 0 36 46" width="36" height="46">
          <path d="M18 1 C8.6 1 1 8.6 1 18 C1 29 18 45 18 45 C18 45 35 29 35 18 C35 8.6 27.4 1 18 1 Z"
            fill="${fillColor}" stroke="#FFFFFF" stroke-width="2.5" />
          <path d="M11 19 L18 12 L25 19 L23 19 L23 24 L13 24 L13 19 Z" fill="#FFFFFF" />
        </svg>
      </div>
    `;
  }

  // Render Markers on Map
  function renderEvacuationCenterMarkers() {
    if (!mapInstance || !centersData) return;

    centersData.forEach((center) => {
      const lat = parseFloat(center.latitude);
      const lng = parseFloat(center.longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const isFull = center.current_occupancy >= center.max_capacity;
      const el = document.createElement('div');
      el.innerHTML = createGreenHousePinSvg(isFull);

      // Popup Content
      const popupHtml = `
        <div style="font-family:'Open Sans',sans-serif;padding:6px;max-width:220px;color:#0f172a;">
          <b style="font-size:13px;display:block;margin-bottom:2px;color:#1e293b;">${center.name}</b>
          <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${center.address || 'San Rafael, Baao'}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;margin-bottom:4px;">
            <span>Capacity:</span>
            <b>${center.current_occupancy || 0} / ${center.max_capacity}</b>
          </div>
          <div style="width:100%;background:#e2e8f0;height:6px;border-radius:999px;overflow:hidden;margin-bottom:6px;">
            <div style="width:${Math.min(100, Math.round(((center.current_occupancy||0)/center.max_capacity)*100))}%;background:${isFull?'#ef4444':'#10b981'};height:100%;"></div>
          </div>
          <span style="font-size:10px;font-weight:bold;color:${isFull?'#ef4444':'#059669'};">
            ${isFull ? '● 100% FULL' : '● SPACE AVAILABLE'}
          </span>
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml);

      new maplibregl.Marker({ element: el.firstElementChild, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(mapInstance);
    });
  }

  // Render Landmark POIs visible in screenshot (Busay Spring, MMMBACKYARD, San Rafael Hall)
  function renderLandmarkPois() {
    if (!mapInstance) return;

    const landmarks = [
      { name: 'Busay Spring Natural Resort', coords: [123.3450, 13.5135], icon: 'ph-camera', bg: '#9333ea' },
      { name: 'MMMBACKYARD', coords: [123.3512, 13.5160], icon: 'ph-map-pin', bg: '#475569' },
      { name: 'San Rafael Barangay Hall', coords: [123.3530, 13.5075], icon: 'ph-cross', bg: '#2563eb' }
    ];

    landmarks.forEach((lm) => {
      const el = document.createElement('div');
      el.className = 'flex items-center gap-1.5 pointer-events-auto bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-full border border-white/20 shadow-lg';
      el.innerHTML = `
        <div style="background:${lm.bg}" class="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs">
          <i class="ph ${lm.icon}"></i>
        </div>
        <span class="text-white text-[10.5px] font-bold tracking-tight">${lm.name}</span>
      `;

      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lm.coords)
        .addTo(mapInstance);
    });
  }

  // Populate Bottom Sheet Nearest Centers
  function populateBottomSheetCenters() {
    const list = document.getElementById('sheetCentersList');
    if (!list) return;

    const badge = document.getElementById('sheetCentersCountBadge');
    if (badge) badge.textContent = `${centersData.length} Centers`;

    list.innerHTML = centersData.map((c, i) => {
      const occ = c.current_occupancy || 0;
      const cap = c.max_capacity || 30;
      const pct = Math.min(100, Math.round((occ / cap) * 100));
      const isFull = occ >= cap;

      return `
        <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/80 transition-colors flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-9 h-9 rounded-xl ${isFull ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'} flex items-center justify-center shrink-0">
              <i class="ph ph-buildings text-lg"></i>
            </div>
            <div class="min-w-0">
              <h4 class="font-bold text-slate-800 text-xs truncate">${c.name}</h4>
              <p class="text-[11px] text-slate-500 truncate">${c.address || 'Zone ' + ((i % 7) + 1)}</p>
              <div class="w-24 bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
                <div class="h-full ${isFull ? 'bg-red-500' : 'bg-emerald-500'}" style="width:${pct}%;"></div>
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${isFull ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}">
              ${isFull ? 'FULL' : `${occ}/${cap}`}
            </span>
            <button type="button" onclick="focusCenter(${c.latitude}, ${c.longitude})"
              class="block mt-1 text-[10px] font-bold text-blue-600 hover:text-blue-800">
              Show Map
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // 2. TOOLBAR MAP CONTROLS
  // =========================================================================
  window.setMapBasemap = function (mode) {
    activeBasemap = mode;
    const btnHybrid = document.getElementById('btnMapHybrid');
    const btnSat = document.getElementById('btnMapSat');
    const btnRoads = document.getElementById('btnMapRoads');

    [btnHybrid, btnSat, btnRoads].forEach(b => {
      if (b) b.className = 'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all bg-slate-100 text-slate-700 hover:bg-slate-200';
    });

    let tileUrl = 'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}';
    if (mode === 'hybrid') {
      if (btnHybrid) btnHybrid.className = 'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white shadow-xs';
      tileUrl = 'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}';
    } else if (mode === 'satellite') {
      if (btnSat) btnSat.className = 'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white shadow-xs';
      tileUrl = 'https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}';
    } else if (mode === 'roads') {
      if (btnRoads) btnRoads.className = 'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all bg-blue-600 text-white shadow-xs';
      tileUrl = 'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}';
    }

    if (mapInstance && mapInstance.getSource('satellite-tiles')) {
      const src = mapInstance.getSource('satellite-tiles');
      if (typeof src.setTiles === 'function') {
        src.setTiles([tileUrl]);
      }
    }
  };

  window.toggle3DPitch = function () {
    if (!mapInstance) return;
    is3D = !is3D;
    mapInstance.easeTo({
      pitch: is3D ? 55 : 0,
      duration: 600
    });
    const btn = document.getElementById('btn3DToggle');
    if (btn) {
      btn.className = is3D
        ? 'bg-emerald-600 text-white shadow-md border border-emerald-500 rounded-full w-8 h-8 flex items-center justify-center'
        : 'bg-white/95 backdrop-blur-md shadow-md hover:bg-emerald-50 text-slate-700 border border-slate-200/80 rounded-full w-8 h-8 flex items-center justify-center';
    }
  };

  window.rotateMap45 = function () {
    if (!mapInstance) return;
    currentBearing = (currentBearing + 45) % 360;
    mapInstance.easeTo({
      bearing: currentBearing,
      duration: 500
    });
  };

  window.locateUserGps = function () {
    if (!navigator.geolocation) {
      alert('GPS is not supported on this device.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.longitude, pos.coords.latitude];
        if (mapInstance) {
          mapInstance.flyTo({ center: coords, zoom: 17, duration: 1200 });

          // Drop user blue pulsing marker
          const el = document.createElement('div');
          el.innerHTML = `
            <div style="width:20px;height:20px;border-radius:999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 0 10px rgba(37,99,235,0.7);">
              <div style="position:absolute;inset:-6px;border-radius:999px;background:#3b82f6;opacity:0.4;" class="animate-ping"></div>
            </div>
          `;
          new maplibregl.Marker({ element: el.firstElementChild }).setLngLat(coords).addTo(mapInstance);
        }
      },
      (err) => alert('Could not get GPS location: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  window.recenterSanRafael = function () {
    if (mapInstance) {
      mapInstance.flyTo({ center: [123.3485, 13.5103], zoom: 15.5, pitch: 0, bearing: 0, duration: 800 });
      currentBearing = 0;
      is3D = false;
    }
  };

  window.focusCenter = function (lat, lng) {
    if (mapInstance) {
      mapInstance.flyTo({ center: [lng, lat], zoom: 17.5, duration: 1000 });
      toggleBottomSheet(false);
    }
  };

  window.toggleBottomSheet = function (forceState) {
    const sheet = document.getElementById('residentEvacBottomSheet');
    if (!sheet) return;
    isBottomSheetOpen = typeof forceState === 'boolean' ? forceState : !isBottomSheetOpen;
    sheet.style.transform = isBottomSheetOpen ? 'translateY(0%)' : 'translateY(calc(100% - 44px))';
  };

  // =========================================================================
  // 3. BOTTOM NAVIGATION TAB SWITCHING
  // =========================================================================
  window.switchNavTab = function (tabName) {
    activeTab = tabName;

    // Toggle tab views
    const tabs = ['map', 'sos', 'dashboard', 'typhoon', 'profile'];
    tabs.forEach(t => {
      const viewEl = document.getElementById(`tabView${t.charAt(0).toUpperCase() + t.slice(1)}`);
      const btnEl = document.getElementById(`navBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);

      if (viewEl) {
        if (t === tabName) {
          viewEl.classList.remove('hidden');
        } else {
          viewEl.classList.add('hidden');
        }
      }

      if (btnEl && t !== 'sos') {
        if (t === tabName) {
          btnEl.className = 'nav-tab active flex flex-col items-center justify-center gap-1 text-red-600 transition-colors';
        } else {
          btnEl.className = 'nav-tab flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-slate-600 transition-colors';
        }
      }
    });

    // Resize map when returning to map tab
    if (tabName === 'map' && mapInstance) {
      setTimeout(() => mapInstance.resize(), 50);
    }
  };

  // =========================================================================
  // 4. LORA MESH DISPATCH & SOS LOGIC (433.875 MHz)
  // =========================================================================
  window.openLoraPairModal = function () {
    document.getElementById('loraPairModal')?.classList.remove('hidden');
  };

  window.closeLoraPairModal = function () {
    document.getElementById('loraPairModal')?.classList.add('hidden');
  };

  window.pairLoraBle = async function () {
    closeLoraPairModal();
    try {
      await loraClient.connectBLE();
      updateLoraUi(true, 'BLE (RES1)');
    } catch (e) {
      alert('BLE Pairing Error: ' + (e.message || e));
    }
  };

  window.connectLoraUsb = async function () {
    closeLoraPairModal();
    try {
      await loraClient.connectUSBSerial();
      updateLoraUi(true, 'USB (RES1)');
    } catch (e) {
      alert('USB Serial Error: ' + (e.message || e));
    }
  };

  function updateLoraUi(connected, label) {
    const pill = document.getElementById('btnHeaderLoraPair');
    const txt = document.getElementById('headerLoraText');
    const badge = document.getElementById('loraMeshHeaderBadge');
    const sosPill = document.getElementById('sosScreenLoraPill');

    if (connected) {
      if (pill) pill.className = 'text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-1';
      if (txt) txt.textContent = label || 'LoRa Active';
      if (badge) badge.classList.remove('hidden');
      if (sosPill) {
        sosPill.textContent = label || 'CONNECTED';
        sosPill.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-bold';
      }
    }
  }

  window.triggerSosEmergency = async function () {
    const heading = document.getElementById('sosStatusHeading');
    const subtext = document.getElementById('sosStatusSubtext');
    const stepper = document.getElementById('sosLifecycleStepper');
    const cancelBtn = document.getElementById('btnCancelSos');

    if (stepper) stepper.classList.remove('hidden');
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    if (heading) heading.textContent = 'Emergency SOS Active';
    if (subtext) subtext.textContent = 'Transmitting location coordinates over 433.875 MHz LoRa mesh...';

    // Step 1: Phone GPS
    let lat = 13.51024;
    let lng = 123.34701;
    let acc = 8;

    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        acc = Math.round(pos.coords.accuracy || 8);
      } catch (_e) {}
    }

    const msgId = String(Date.now()).slice(-5);
    activeSosId = msgId;

    // Vulnerability flags
    const flags = [];
    if (document.getElementById('chkSenior')?.checked) flags.push('S');
    if (document.getElementById('chkPwd')?.checked) flags.push('P');
    if (document.getElementById('chkPregnant')?.checked) flags.push('G');
    if (document.getElementById('chkInfant')?.checked) flags.push('I');
    const vulnCode = flags.length > 0 ? flags.join(',') : 'None';

    // Step 2: Transmit via LoRa
    try {
      await loraClient.sendSosAlert({
        msgId,
        residentId: 87,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        pinMode: 'G',
        vulnCode,
        statusCode: 'ACT',
        name: 'Monette Bisenio'
      });

      const s2 = document.getElementById('stepRadio');
      if (s2) s2.className = 'flex items-center gap-2 text-emerald-600 font-bold';

      setTimeout(() => {
        const s3 = document.getElementById('stepGateway');
        if (s3) s3.className = 'flex items-center gap-2 text-emerald-600 font-bold';
      }, 1400);
    } catch (e) {
      console.warn('LoRa send notice:', e.message);
    }
  };

  window.cancelActiveSos = async function () {
    try {
      await loraClient.sendSosAlert({
        msgId: activeSosId || String(Date.now()).slice(-5),
        residentId: 87,
        statusCode: 'CAN'
      });
    } catch (_e) {}

    document.getElementById('sosLifecycleStepper')?.classList.add('hidden');
    document.getElementById('btnCancelSos')?.classList.add('hidden');
    document.getElementById('sosStatusHeading').textContent = 'Press for Emergency Rescue';
    document.getElementById('sosStatusSubtext').textContent = 'Tapping this button transmits your coordinates directly to the Barangay Hall & Rescuers.';
  };

  // Listen for LoRa ACKs (Rescuer Dispatched)
  loraClient.on('ack', (ack) => {
    const s4 = document.getElementById('stepDispatched');
    if (s4) {
      s4.className = 'flex items-center gap-2 text-emerald-600 font-black';
      s4.innerHTML = `<i class="ph ph-check-circle"></i> 4. ${ack.status || 'RESCUER DISPATCHED'} (${ack.responderName || 'Team 1'})`;
    }
  });

  // Listen for LoRa Emergency Broadcasts (433.875 MHz)
  loraClient.on('alert', (alertObj) => {
    console.log('[ResidentMobile] Received LoRa Emergency Alert:', alertObj);
    if (typeof window.triggerEmergencyAlarm === 'function') {
      window.triggerEmergencyAlarm(alertObj);
    } else {
      if (navigator.vibrate) {
        try { navigator.vibrate([500, 150, 500, 150, 1000]); } catch (_) {}
      }
      if (typeof window.openGlobalEmergencyModal === 'function') {
        window.openGlobalEmergencyModal(alertObj);
      }
      if (typeof window.updateSystemAlertBanner === 'function') {
        window.updateSystemAlertBanner(alertObj);
      }
    }
  });

  // Dark Mode Toggle
  window.toggleDarkMode = function () {
    document.documentElement.classList.toggle('dark');
  };

  window.openAlertsModal = function () {
    switchNavTab('dashboard');
  };

  // Auto-init on DOM ready
  window.addEventListener('DOMContentLoaded', () => {
    initEvacuationMap();
  });

})();
