/**
 * Evacwar Local-First Offline Architecture (Dexie.js / IndexedDB)
 * 
 * - Permanent Real Database: MySQL (on server)
 * - Browser Local Storage: IndexedDB via Dexie.js (for offline access & sync queue)
 * - Stores:
 *   1. pending_operations: Queued staff operations (CHECK_IN, WALK_IN) with idempotency UUIDs
 *   2. staff_assigned_sites: Staff's authorized evacuation centers snapshot
 *   3. resident_roster: Pre-cached resident & household directory for 100% offline QR lookup
 *   4. map_data: Evacuation centers, GeoJSON routes, and hazard danger zones
 *   5. app_state: Selected center ID, last sync timestamps, preferences
 * 
 * - Idempotency & Duplicate Protection:
 *   Unique clientOperationId (UUID v4) generated per queued operation.
 *   Server enforces idempotency via offline_sync_log table.
 * 
 * - Multi-trigger Automatic Background Sync:
 *   Online event, PWA focus/visibilitychange, startup, Service Worker SyncManager
 */

(function (window) {
  'use strict';

  // 1. Initialize Dexie Database
  let db = null;
  const DB_NAME = 'EvakWarLocalDB';

  function getDexieClass() {
    if (typeof Dexie !== 'undefined') return Dexie;
    if (typeof window !== 'undefined' && window.Dexie) return window.Dexie;
    if (typeof globalThis !== 'undefined' && globalThis.Dexie) return globalThis.Dexie;
    if (typeof self !== 'undefined' && self.Dexie) return self.Dexie;
    return null;
  }

  function initLocalDB() {
    if (db) return db;
    const DexieClass = getDexieClass();
    if (DexieClass) {
      try {
        db = new DexieClass(DB_NAME);
        db.version(1).stores({
          pending_operations: 'clientOperationId, operationType, centerId, staffId, syncStatus, createdAt',
          staff_assigned_sites: 'id, name, is_active',
          resident_roster: 'lookupKey, residentId, qrUuid, nameLower',
          map_data: 'id, updatedAt',
          app_state: 'key'
        });
        window.EvakWarLocalDB = db;
      } catch (e) {
        console.warn('[Evacwar LocalDB] Init error:', e);
      }
    }
    return db;
  }

  initLocalDB();

  let isSyncing = false;

  // UUID v4 Generator
  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'op-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10) + '-' + Math.random().toString(36).substring(2, 6);
  }

  async function ensureDB() {
    if (!db) {
      initLocalDB();
    }
    if (!db) {
      const DexieClass = getDexieClass();
      if (DexieClass) {
        db = new DexieClass(DB_NAME);
        db.version(1).stores({
          pending_operations: 'clientOperationId, operationType, centerId, staffId, syncStatus, createdAt',
          staff_assigned_sites: 'id, name, is_active',
          resident_roster: 'lookupKey, residentId, qrUuid, nameLower',
          map_data: 'id, updatedAt',
          app_state: 'key'
        });
      } else {
        throw new Error('Local Dexie database engine could not be initialized.');
      }
    }
    if (!db.isOpen()) {
      await db.open();
    }
    window.EvakWarLocalDB = db;
    return db;
  }

  /* --------------------------------------------------------------------------
     A. MAP DATA CACHING & LOCAL RETRIEVAL
     -------------------------------------------------------------------------- */
  async function saveMapData(centers, mapFeatures) {
    try {
      const d = await ensureDB();
      const existing = (await d.map_data.get('san_rafael_map')) || {};

      const newCenters = (Array.isArray(centers) && centers.length > 0)
        ? centers
        : (existing.centers || []);

      const newFeatures = (mapFeatures && typeof mapFeatures === 'object' && Array.isArray(mapFeatures.features))
        ? mapFeatures
        : (existing.mapFeatures || { type: 'FeatureCollection', features: [] });

      const record = {
        id: 'san_rafael_map',
        centers: newCenters,
        mapFeatures: newFeatures,
        updatedAt: new Date().toISOString()
      };
      await d.map_data.put(record);
      return true;
    } catch (err) {
      console.warn('[Evacwar LocalDB] Failed to cache map data:', err.message);
      return false;
    }
  }

  async function getMapData() {
    try {
      const d = await ensureDB();
      const record = await d.map_data.get('san_rafael_map');
      return record || null;
    } catch (err) {
      return null;
    }
  }

  /* --------------------------------------------------------------------------
     B. STAFF ASSIGNED SITES & ACTIVE SITE SELECTION
     -------------------------------------------------------------------------- */
  async function cacheAssignedSites(sites) {
    if (!Array.isArray(sites) || sites.length === 0) return false;
    try {
      const d = await ensureDB();
      await d.staff_assigned_sites.bulkPut(sites);
      return true;
    } catch (err) {
      console.warn('[Evacwar LocalDB] Failed to cache assigned sites:', err.message);
      return false;
    }
  }

  async function getAssignedSites() {
    try {
      const d = await ensureDB();
      return await d.staff_assigned_sites.toArray();
    } catch (err) {
      return [];
    }
  }

  async function isSiteAssigned(centerId) {
    if (!centerId) return false;
    try {
      const d = await ensureDB();
      const numId = parseInt(centerId, 10);
      const site = await d.staff_assigned_sites.get(numId);
      return !!site;
    } catch (err) {
      return false;
    }
  }

  async function saveSelectedCenterId(centerId) {
    try {
      const d = await ensureDB();
      await d.app_state.put({ key: 'selected_center_id', value: parseInt(centerId, 10) });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function getSelectedCenterId() {
    try {
      const d = await ensureDB();
      const rec = await d.app_state.get('selected_center_id');
      return rec ? rec.value : null;
    } catch (e) {
      return null;
    }
  }

  /* --------------------------------------------------------------------------
     C. RESIDENT DIRECTORY FOR OFFLINE QR & SEARCH
     -------------------------------------------------------------------------- */
  async function bulkCacheResidents(roster) {
    const d = await ensureDB();
    if (!Array.isArray(roster) || roster.length === 0) {
      console.warn('[Evacwar LocalDB] bulkCacheResidents called with empty roster. Preserving existing cached roster.');
      const currentCount = await d.resident_roster.count();
      return currentCount;
    }

    try {
      // Clear previous cached roster to eliminate stale records
      await d.resident_roster.clear();
      const records = [];
      let count = 0;

      for (const item of roster) {
        if (!item || !item.resident) continue;
        const resident = item.resident;
        const resId = resident.id;
        const rawUuid = String(resident.uuid || resident.qr_code_uuid || '').toLowerCase().trim();
        const searchStr = `${resident.first_name || ''} ${resident.last_name || ''}`.toLowerCase().trim();

        records.push({
          lookupKey: String(resId),
          residentId: resId,
          qrUuid: rawUuid,
          nameLower: searchStr,
          resident: resident,
          members: Array.isArray(item.members) ? item.members : [],
          household: item,
          updatedAt: Date.now()
        });
        count++;
      }

      if (records.length > 0) {
        await d.resident_roster.bulkPut(records);
      }

      await d.app_state.put({
        key: 'roster_metadata',
        value: { count: count, cachedAt: new Date().toISOString() }
      });

      console.log(`[Evacwar LocalDB] Stored ${count} residents in Dexie EvakWarLocalDB.resident_roster.`);
      return count;
    } catch (err) {
      console.warn('[Evacwar LocalDB] Bulk cache error:', err.message);
      throw err;
    }
  }

  async function cacheResident(householdData) {
    if (!householdData) return false;
    try {
      const d = await ensureDB();
      const resident = householdData.resident || householdData;
      if (!resident || !resident.id) return false;
      const resId = resident.id;
      const rawUuid = String(resident.uuid || resident.qr_code_uuid || '').toLowerCase().trim();
      const searchStr = `${resident.first_name || ''} ${resident.last_name || ''}`.toLowerCase().trim();
      const members = Array.isArray(householdData.members) ? householdData.members : [];

      await d.resident_roster.put({
        lookupKey: String(resId),
        residentId: resId,
        qrUuid: rawUuid,
        nameLower: searchStr,
        resident: resident,
        members: members,
        household: householdData,
        updatedAt: Date.now()
      });
      return true;
    } catch (e) {
      console.warn('[Evacwar LocalDB] cacheResident error:', e.message);
      return false;
    }
  }

  async function markResidentCheckedInLocally(residentId, checkInHead = true, memberIds = []) {
    if (!residentId) return false;
    try {
      const d = await ensureDB();
      const numId = parseInt(residentId, 10);
      let record = await d.resident_roster.get(String(residentId));
      if (!record && !isNaN(numId)) {
        record = await d.resident_roster.where('residentId').equals(numId).first();
      }
      if (record) {
        if (checkInHead && record.resident) {
          record.resident.evacuation_status = 'CHECKED_IN';
        }
        if (checkInHead && record.household && record.household.resident) {
          record.household.resident.evacuation_status = 'CHECKED_IN';
        }
        if (Array.isArray(memberIds) && memberIds.length > 0) {
          if (Array.isArray(record.members)) {
            record.members.forEach(m => {
              if (memberIds.includes(m.id)) m.evacuation_status = 'CHECKED_IN';
            });
          }
          if (record.household && Array.isArray(record.household.members)) {
            record.household.members.forEach(m => {
              if (memberIds.includes(m.id)) m.evacuation_status = 'CHECKED_IN';
            });
          }
        }
        record.updatedAt = Date.now();
        await d.resident_roster.put(record);
        console.log(`[Evacwar LocalDB] Resident ${residentId} marked checked in locally in Dexie.`);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Evacwar LocalDB] markResidentCheckedInLocally error:', e.message);
      return false;
    }
  }

  async function findResident(query) {
    if (!query) return null;
    try {
      const d = await ensureDB();
      const raw = String(query).trim();
      const cleanLower = raw.toLowerCase();
      const isPureDigits = /^\d+$/.test(cleanLower);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanLower) || (cleanLower.includes('-') && cleanLower.length >= 8);

      // 1. HIGHEST PRIORITY FOR QR SCAN: Indexed query on qrUuid
      if (cleanLower) {
        let record = await d.resident_roster.where('qrUuid').equals(cleanLower).first();
        if (record && (record.household || record.resident)) return formatHouseholdResult(record.household || record);
      }

      // 2. Direct key match by exact raw string
      let record = await d.resident_roster.get(raw);
      if (record && (record.household || record.resident)) return formatHouseholdResult(record.household || record);

      // 3. Match 'id_' prefix (e.g. 'id_5')
      if (raw.startsWith('id_')) {
        const idStr = raw.replace('id_', '');
        record = await d.resident_roster.get(idStr);
        if (record && (record.household || record.resident)) return formatHouseholdResult(record.household || record);
      }

      // 4. Pure numeric query (ONLY when query consists entirely of digits 0-9)
      // NEVER call parseInt on alphanumeric strings / UUIDs, as parseInt("9db14...", 10) returns 9!
      if (isPureDigits) {
        const numQuery = parseInt(cleanLower, 10);
        record = await d.resident_roster.get(cleanLower);
        if (record && (record.household || record.resident)) return formatHouseholdResult(record.household || record);

        record = await d.resident_roster.where('residentId').equals(numQuery).first();
        if (record && (record.household || record.resident)) return formatHouseholdResult(record.household || record);
      }

      // 5. Indexed query on name prefix (only if NOT a UUID)
      if (!isUuid && cleanLower.length >= 2) {
        record = await d.resident_roster.where('nameLower').startsWithIgnoreCase(cleanLower).first();
        if (record && (record.household || record.resident)) return formatHouseholdResult(record.household || record);
      }

      // 6. Linear scan over all cached households
      const allRecords = await d.resident_roster.toArray();
      const seenIds = new Set();

      // 6a. Exact QR UUID check in scan
      for (const rec of allRecords) {
        const item = rec.household || rec;
        if (!item || !item.resident) continue;
        const res = item.resident;
        const qrUuid = String(res.uuid || res.qr_code_uuid || '').toLowerCase().trim();
        if (qrUuid && (qrUuid === cleanLower || qrUuid === raw)) {
          return formatHouseholdResult(item);
        }
      }

      // 6b. If query is a UUID and wasn't found, do NOT match random substrings or names
      if (isUuid) {
        return null;
      }

      // 6c. Substring, reversed name, contact numbers, and family members
      for (const rec of allRecords) {
        const item = rec.household || rec;
        if (!item || !item.resident) continue;
        const res = item.resident;
        if (seenIds.has(res.id)) continue;
        seenIds.add(res.id);

        const headFirst = (res.first_name || '').toLowerCase().trim();
        const headMiddle = (res.middle_name || '').toLowerCase().trim();
        const headLast = (res.last_name || '').toLowerCase().trim();
        const headFull = `${headFirst} ${headLast}`.trim();
        const headFullWithMiddle = `${headFirst} ${headMiddle} ${headLast}`.trim();
        const reverseName = `${headLast}, ${headFirst}`.trim();
        const reverseNoComma = `${headLast} ${headFirst}`.trim();

        const contactDigits = String(res.contact || res.contact_number || '').replace(/\D/g, '');
        const cleanDigits = isPureDigits ? cleanLower : cleanLower.replace(/\D/g, '');
        const householdName = String(item.household_name || '').toLowerCase();

        // Check head match
        if (
          headFull.includes(cleanLower) ||
          headFullWithMiddle.includes(cleanLower) ||
          headFirst === cleanLower ||
          headLast === cleanLower ||
          reverseName.includes(cleanLower) ||
          reverseNoComma.includes(cleanLower) ||
          (cleanDigits.length >= 7 && contactDigits.includes(cleanDigits)) ||
          householdName.includes(cleanLower)
        ) {
          return formatHouseholdResult(item);
        }

        // Check household members match
        if (Array.isArray(item.members)) {
          for (const mem of item.members) {
            const mFirst = (mem.first_name || '').toLowerCase().trim();
            const mLast = (mem.last_name || '').toLowerCase().trim();
            const mFull = `${mFirst} ${mLast}`.trim();
            if (mFull.includes(cleanLower) || mFirst === cleanLower || mLast === cleanLower) {
              return formatHouseholdResult(item);
            }
          }
        }
      }

      return null;
    } catch (err) {
      console.warn('[Evacwar LocalDB] Resident lookup error:', err.message);
      return null;
    }
  }

  // Standardize result structure for UI consumption
  function formatHouseholdResult(household) {
    if (!household) return null;
    const res = household.resident || household;
    if (!res || !res.id) return null;
    const mems = Array.isArray(household.members) ? household.members : [];
    return {
      success: true,
      household_name: household.household_name || `${res.last_name || ''} Household`,
      resident: {
        id: res.id,
        uuid: res.uuid || res.qr_code_uuid,
        qr_code_uuid: res.qr_code_uuid || res.uuid,
        name: res.name || `${res.first_name || ''} ${res.last_name || ''}`.trim(),
        first_name: res.first_name || '',
        middle_name: res.middle_name || '',
        last_name: res.last_name || '',
        barangay: res.barangay || 'San Rafael',
        address: res.address || res.home_address || '',
        contact: res.contact || res.contact_number || '',
        contact_number: res.contact_number || res.contact || '',
        sex: res.sex || 'Male',
        age: res.age || 'N/A',
        is_4ps: !!res.is_4ps,
        is_pwd: !!res.is_pwd,
        is_pregnant: !!res.is_pregnant,
        is_lactating: !!res.is_lactating,
        is_single_head: !!res.is_single_head,
        has_serious_illness: !!res.has_serious_illness,
        serious_illness_details: res.serious_illness_details || null,
        family_size: res.family_size || (1 + mems.length),
        evacuation_status: res.evacuation_status || 'NOT_EVACUATED',
        checked_in_id: res.checked_in_id || null
      },
      members: mems.map(m => ({
        id: m.id,
        name: m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim(),
        first_name: m.first_name || '',
        middle_name: m.middle_name || '',
        last_name: m.last_name || '',
        relation: m.relation || 'Family Member',
        sex: m.sex || 'Male',
        age: m.age || 0,
        is_pwd: !!m.is_pwd,
        is_pregnant: !!m.is_pregnant,
        is_lactating: !!m.is_lactating,
        has_serious_illness: !!m.has_serious_illness,
        serious_illness_details: m.serious_illness_details || null,
        evacuation_status: m.evacuation_status || 'NOT_EVACUATED',
        checked_in_id: m.checked_in_id || null
      }))
    };
  }

  // Find matching resident in cached roster to prevent duplicate offline walk-in accounts
  async function findMatchingResident(payload) {
    if (!payload || !payload.first_name || !payload.last_name) return null;
    try {
      const d = await ensureDB();
      const cleanFirst = String(payload.first_name).trim().toLowerCase();
      const cleanLast = String(payload.last_name).trim().toLowerCase();
      const rawContact = payload.contact_number ? String(payload.contact_number).trim() : '';
      const cleanContact = (!rawContact.startsWith('WALKIN-') && rawContact.replace(/\D/g, '').length >= 7)
        ? rawContact.replace(/\D/g, '')
        : '';

      const allRecords = await d.resident_roster.toArray();
      const seenIds = new Set();

      for (const rec of allRecords) {
        const item = rec.household || rec;
        if (!item || !item.resident) continue;
        const res = item.resident;
        if (seenIds.has(res.id)) continue;
        seenIds.add(res.id);

        const rFirst = String(res.first_name || '').trim().toLowerCase();
        const rLast = String(res.last_name || '').trim().toLowerCase();
        const rContact = String(res.contact_number || res.contact || '').replace(/\D/g, '');

        // Match 1: Exact first name and last name
        const nameMatch = (rFirst === cleanFirst && rLast === cleanLast);

        // Match 2: Exact phone number if valid mobile provided
        const contactMatch = (cleanContact && rContact.length >= 7 && rContact === cleanContact);

        if (nameMatch || contactMatch) {
          return formatHouseholdResult(item);
        }
      }

      return null;
    } catch (err) {
      console.warn('[Evacwar LocalDB] findMatchingResident error:', err.message);
      return null;
    }
  }

  async function cacheResident(data) {
    if (!data || !data.resident) return false;
    return (await bulkCacheResidents([data])) > 0;
  }

  async function getRosterStatus() {
    try {
      const d = await ensureDB();
      const count = await d.resident_roster.count();
      const meta = await d.app_state.get('roster_metadata');
      if (count > 0) {
        return {
          count: count,
          cachedAt: meta && meta.value ? meta.value.cachedAt : null
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  async function downloadOfflineRoster() {
    try {
      console.log('[Evacwar LocalDB] Fetching offline roster from server (/api/offline/roster)...');
      let res = null;
      try {
        res = await fetch('/api/offline/roster', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-cache',
          credentials: 'same-origin'
        });
      } catch (netErr) {
        throw new Error(`Network connection failed: ${netErr.message}`);
      }

      // Fallback route check
      if (!res.ok && (res.status === 404 || res.status === 500)) {
        try {
          const altRes = await fetch('/staff/offline/roster', {
            headers: { 'Accept': 'application/json' },
            cache: 'no-cache',
            credentials: 'same-origin'
          });
          if (altRes.ok) res = altRes;
        } catch (e) { }
      }

      if (!res.ok) {
        let errorMsg = `Server error (HTTP ${res.status})`;
        try {
          const jsonErr = await res.json();
          if (jsonErr && jsonErr.message) errorMsg = jsonErr.message;
        } catch (e) { }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (!data || !data.success) {
        throw new Error(data && data.message ? data.message : 'Server returned an invalid response');
      }

      const rosterList = Array.isArray(data.roster) ? data.roster : [];
      // Store in Dexie EvakWarLocalDB.resident_roster
      const count = await bulkCacheResidents(rosterList);

      // Verify stored count directly in Dexie
      const d = await ensureDB();
      const verifiedCount = await d.resident_roster.count();

      // Cache assigned sites & map data
      if (Array.isArray(data.centers) && data.centers.length > 0) {
        await cacheAssignedSites(data.centers);
        await saveMapData(data.centers, data.mapFeatures || null);
      }

      return { success: true, count: verifiedCount };
    } catch (err) {
      console.warn('[Evacwar LocalDB] downloadOfflineRoster error:', err.message);
      return { success: false, error: err.message };
    }
  }

  /* --------------------------------------------------------------------------
     D. PENDING OPERATIONS QUEUE & IDEMPOTENCY
     -------------------------------------------------------------------------- */
  async function enqueueOperation(operationType, payload, centerId, staffIdOrDesc, description) {
    const d = await ensureDB();
    const clientOpId = generateUUID();

    let staffId = null;
    let descText = description;
    if (typeof staffIdOrDesc === 'string') {
      descText = staffIdOrDesc;
    } else if (typeof staffIdOrDesc === 'number') {
      staffId = staffIdOrDesc;
    }

    let numCenterId = parseInt(centerId, 10);
    const assigned = await getAssignedSites();
    if (!numCenterId && assigned.length > 0) {
      numCenterId = assigned[0].id;
    }
    if (!numCenterId) {
      numCenterId = 2; // fallback to valid evacuation center
    }

    const opRecord = {
      clientOperationId: clientOpId,
      operationType: operationType, // 'CHECK_IN' or 'WALK_IN'
      residentId: payload.resident_id ? parseInt(payload.resident_id, 10) : null,
      householdMemberId: payload.member_ids ? (Array.isArray(payload.member_ids) ? payload.member_ids[0] : payload.member_ids) : null,
      centerId: numCenterId,
      staffId: staffId,
      payload: payload,
      description: descText || `${operationType} Operation`,
      createdAt: new Date().toISOString(),
      syncStatus: 'PENDING',
      retryCount: 0,
      lastError: null
    };

    await d.pending_operations.put(opRecord);
    console.log(`[Evacwar LocalDB] Queued offline operation [${operationType}] with ID:`, clientOpId);

    notifyQueueChange();

    // Trigger background sync if online
    if (navigator.onLine) {
      setTimeout(() => syncPending(), 1500);
    }

    return clientOpId;
  }

  async function getPendingOperations() {
    try {
      const d = await ensureDB();
      return await d.pending_operations
        .where('syncStatus')
        .anyOf(['PENDING', 'FAILED'])
        .sortBy('createdAt');
    } catch (err) {
      return [];
    }
  }

  async function getQueueCount() {
    try {
      const d = await ensureDB();
      return await d.pending_operations
        .where('syncStatus')
        .anyOf(['PENDING', 'FAILED'])
        .count();
    } catch (err) {
      return 0;
    }
  }

  async function notifyQueueChange() {
    try {
      const count = await getQueueCount();
      const badges = document.querySelectorAll('.Evacwar-offline-queue-badge');
      badges.forEach(badge => {
        const text = badge.querySelector('.queue-count-text');
        if (text) {
          text.textContent = `${count} queued offline`;
        }
        if (count > 0) {
          badge.classList.remove('hidden');
          badge.classList.add('flex');
        } else {
          badge.classList.add('hidden');
          badge.classList.remove('flex');
        }
      });

      window.dispatchEvent(new CustomEvent('Evacwar:queue-changed', {
        detail: { count: count }
      }));
    } catch (e) { }
  }

  /* --------------------------------------------------------------------------
     E. SYNCHRONIZATION ENGINE (POST /api/offline/sync)
     -------------------------------------------------------------------------- */
  async function syncPending() {
    if (isSyncing || !navigator.onLine) return { success: false, reason: 'offline_or_busy' };
    isSyncing = true;

    try {
      const d = await ensureDB();
      const pendingOps = await d.pending_operations
        .where('syncStatus')
        .anyOf(['PENDING', 'FAILED'])
        .and(op => (op.retryCount || 0) < 6)
        .sortBy('createdAt');

      if (pendingOps.length === 0) {
        return { success: true, synced: 0 };
      }

      console.log(`[Evacwar LocalDB] Synchronizing ${pendingOps.length} offline operation(s)...`);

      // Mark as syncing in Dexie
      for (const op of pendingOps) {
        await d.pending_operations.update(op.clientOperationId, { syncStatus: 'SYNCING' });
      }

      // Format payload for server endpoint
      const body = {
        operations: pendingOps.map(op => ({
          clientOperationId: op.clientOperationId,
          operation: op.operationType,
          centerId: op.centerId,
          staffId: op.staffId,
          payload: op.payload
        }))
      };

      // Call server endpoint (tries /api/offline/sync first, falls back to /staff/offline/sync)
      let res = await fetch('/api/offline/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok && res.status === 404) {
        res = await fetch('/staff/offline/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(body)
        });
      }

      if (!res.ok) {
        throw new Error(`Sync HTTP error ${res.status}`);
      }

      const data = await res.json();
      const results = Array.isArray(data.results) ? data.results : [];
      let successCount = 0;
      let failCount = 0;

      for (const resItem of results) {
        const opId = resItem.clientOperationId;
        if (!opId) continue;

        if (resItem.success || resItem.status === 'ALREADY_SYNCED') {
          // Idempotent success: safely remove from local Dexie queue
          await d.pending_operations.delete(opId);
          successCount++;
        } else {
          // Server rejected operation: mark as failed with error details
          failCount++;
          const existing = await d.pending_operations.get(opId);
          const retries = (existing ? existing.retryCount || 0 : 0) + 1;
          await d.pending_operations.update(opId, {
            syncStatus: 'FAILED',
            retryCount: retries,
            lastError: resItem.message || 'Server rejected operation'
          });
        }
      }

      console.log(`[Evacwar LocalDB] Sync complete. ${successCount} confirmed, ${failCount} failed.`);

      // Dispatch global sync completed event
      window.dispatchEvent(new CustomEvent('Evacwar:sync-completed', {
        detail: {
          syncedCount: successCount,
          failedCount: failCount,
          results: results
        }
      }));

      notifyQueueChange();
      return { success: true, synced: successCount, failed: failCount };

    } catch (err) {
      console.warn('[Evacwar LocalDB] Sync error:', err.message);
      try {
        const d = await ensureDB();
        // Reset syncing items back to pending
        const syncingOps = await d.pending_operations.where('syncStatus').equals('SYNCING').toArray();
        for (const op of syncingOps) {
          const retries = (op.retryCount || 0) + 1;
          await d.pending_operations.update(op.clientOperationId, {
            syncStatus: 'FAILED',
            retryCount: retries,
            lastError: err.message
          });
        }
      } catch (e) { }

      notifyQueueChange();
      return { success: false, error: err.message };
    } finally {
      isSyncing = false;
    }
  }

  /* --------------------------------------------------------------------------
     F. AUTOMATIC TRIGGERS (Network online, focus, visibility, intervals)
     -------------------------------------------------------------------------- */
  // 1. Online network reconnection event
  window.addEventListener('online', () => {
    console.log('[Evacwar LocalDB] Online event detected. Triggering auto-sync...');
    setTimeout(() => syncPending(), 1200);
  });

  // 2. Page focus / visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      syncPending();
    }
  });

  window.addEventListener('focus', () => {
    if (navigator.onLine) {
      syncPending();
    }
  });

  // 3. Periodic background check (every 45 seconds when queue > 0)
  setInterval(() => {
    if (navigator.onLine && !isSyncing) {
      getQueueCount().then(count => {
        if (count > 0) syncPending();
      }).catch(() => { });
    }
  }, 45000);

  // 4. Initial load setup
  document.addEventListener('DOMContentLoaded', () => {
    ensureDB().then(async () => {
      notifyQueueChange();
      if (navigator.onLine) {
        setTimeout(() => syncPending(), 2000);
      }
    }).catch(err => {
      console.warn('[Evacwar LocalDB] Initial load open error:', err.message);
    });
  });

  // Export public API
  window.EvakWarDB = Object.assign(window.EvakWarDB || {}, {
    openDB: ensureDB,
    saveMapData,
    getMapData,
    cacheAssignedSites,
    getAssignedSites,
    isSiteAssigned,
    saveSelectedCenterId,
    getSelectedCenterId,
    cacheResident,
    bulkCacheResidents,
    findResident,
    findMatchingResident,
    DEFAULT_CENTER_ID: 2,
    getRosterStatus,
    downloadOfflineRoster,
    markResidentCheckedInLocally,
    enqueueOperation,
    getPendingOperations,
    getQueueCount,
    syncPending,
    syncPendingOperations: syncPending,
    notifyQueueChange
  });

  window.EvakWarLocalDB = db;
  window.EvacWarDB = window.EvakWarDB;
  window.EvacWarLocalDB = window.EvakWarLocalDB;

})(window);
