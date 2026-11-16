/**
 * Evacwar Progressive Web App — Offline-First Storage & Queue Utility
 * - Manages IndexedDB for EvakWarOfflineDB:
 *   1. pending_operations: Queued staff actions (CHECK_IN, WALK_IN) with idempotency UUIDs.
 *   2. map_cache: Evacuation centers, capacities, GeoJSON routes, and hazard zones.
 *   3. resident_directory: Cached resident households for offline selective manual check-in.
 * - Automatic background synchronization on connectivity return.
 * - Idempotency & duplicate protection support.
 */

(function (window) {
  'use strict';

  const DB_NAME = 'EvakWarOfflineDB';
  const DB_VERSION = 1;
  const STORE_OPERATIONS = 'pending_operations';
  const STORE_MAP = 'map_cache';
  const STORE_RESIDENTS = 'resident_directory';

  let dbPromise = null;
  let isSyncing = false;

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'op-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  }

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        console.warn('[Evacwar Offline] IndexedDB is not supported in this browser.');
        return reject(new Error('IndexedDB not supported'));
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Pending staff operations store
        if (!db.objectStoreNames.contains(STORE_OPERATIONS)) {
          const opStore = db.createObjectStore(STORE_OPERATIONS, { keyPath: 'clientOperationId' });
          opStore.createIndex('by_status', 'status', { unique: false });
          opStore.createIndex('by_timestamp', 'timestamp', { unique: false });
        }

        // 2. Map data store
        if (!db.objectStoreNames.contains(STORE_MAP)) {
          db.createObjectStore(STORE_MAP, { keyPath: 'id' });
        }

        // 3. Resident lookup cache store
        if (!db.objectStoreNames.contains(STORE_RESIDENTS)) {
          const resStore = db.createObjectStore(STORE_RESIDENTS, { keyPath: 'queryKey' });
          resStore.createIndex('by_name', 'nameSearch', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.error('[Evacwar Offline] Failed to open IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });

    return dbPromise;
  }

  /* --------------------------------------------------------------------------
     MAP DATA STORAGE & RETRIEVAL
     -------------------------------------------------------------------------- */
  async function saveMapData(centers, mapFeatures) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MAP, 'readwrite');
        const store = tx.objectStore(STORE_MAP);
        const record = {
          id: 'resident_map_data',
          centers: Array.isArray(centers) ? centers : [],
          mapFeatures: mapFeatures || { type: 'FeatureCollection', features: [] },
          cachedAt: new Date().toISOString()
        };
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('[Evacwar Offline] Failed to save map data to IndexedDB:', err.message);
      return false;
    }
  }

  async function getMapData() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_MAP, 'readonly');
        const store = tx.objectStore(STORE_MAP);
        const req = store.get('resident_map_data');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      return null;
    }
  }

  /* --------------------------------------------------------------------------
     RESIDENT LOOKUP CACHING FOR OFFLINE INTAKE
     -------------------------------------------------------------------------- */
  async function cacheResident(data) {
    if (!data || !data.resident) return false;
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_RESIDENTS, 'readwrite');
      const store = tx.objectStore(STORE_RESIDENTS);

      const resident = data.resident;
      const searchStr = `${resident.first_name || ''} ${resident.last_name || ''}`.toLowerCase().trim();

      // Store by resident ID
      if (resident.id) {
        store.put({
          queryKey: 'id_' + resident.id,
          nameSearch: searchStr,
          data: data,
          cachedAt: Date.now()
        });
      }

      // Store by QR code UUID if present
      if (resident.qr_code_uuid) {
        store.put({
          queryKey: 'uuid_' + String(resident.qr_code_uuid).toLowerCase().trim(),
          nameSearch: searchStr,
          data: data,
          cachedAt: Date.now()
        });
      }

      // Store by search string key
      if (searchStr) {
        store.put({
          queryKey: 'name_' + searchStr,
          nameSearch: searchStr,
          data: data,
          cachedAt: Date.now()
        });
      }

      return true;
    } catch (err) {
      console.warn('[Evacwar Offline] Could not cache resident for offline lookup:', err.message);
      return false;
    }
  }

  async function findResident(query) {
    if (!query) return null;
    const cleanQuery = String(query).trim().toLowerCase();
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_RESIDENTS, 'readonly');
        const store = tx.objectStore(STORE_RESIDENTS);

        // 1. Direct key match (by id or uuid or name key)
        const directReq = store.get('uuid_' + cleanQuery);
        directReq.onsuccess = () => {
          if (directReq.result && directReq.result.data) {
            return resolve(directReq.result.data);
          }

          const idReq = store.get('id_' + cleanQuery);
          idReq.onsuccess = () => {
            if (idReq.result && idReq.result.data) {
              return resolve(idReq.result.data);
            }

            const nameReq = store.get('name_' + cleanQuery);
            nameReq.onsuccess = () => {
              if (nameReq.result && nameReq.result.data) {
                return resolve(nameReq.result.data);
              }

              // 2. Scan by name search prefix / containment
              const cursorReq = store.openCursor();
              let matched = null;
              cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                  const item = cursor.value;
                  if (item.nameSearch && item.nameSearch.includes(cleanQuery)) {
                    matched = item.data;
                    return resolve(matched);
                  }
                  cursor.continue();
                } else {
                  resolve(matched);
                }
              };
              cursorReq.onerror = () => resolve(null);
            };
            nameReq.onerror = () => resolve(null);
          };
          idReq.onerror = () => resolve(null);
        };
        directReq.onerror = () => resolve(null);
      });
    } catch (err) {
      return null;
    }
  }

  /* --------------------------------------------------------------------------
     OFFLINE QUEUE MANAGEMENT (CHECK_IN & WALK_IN)
     -------------------------------------------------------------------------- */
  async function enqueueOperation(operationType, payload, staffUserId, displaySummary) {
    const clientOperationId = generateUUID();
    const item = {
      clientOperationId: clientOperationId,
      operation: operationType, // 'CHECK_IN' or 'WALK_IN'
      payload: payload,
      staffUserId: staffUserId || null,
      displaySummary: displaySummary || `${operationType} recorded offline`,
      timestamp: new Date().toISOString(),
      status: 'PENDING', // PENDING, SYNCING, SYNCED, FAILED
      retryCount: 0,
      lastError: null
    };

    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
        const store = tx.objectStore(STORE_OPERATIONS);
        const req = store.add(item);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });

      console.log('[Evacwar Offline Queue] Enqueued operation:', item.clientOperationId, operationType);
      notifyQueueChange();
      return item;
    } catch (err) {
      console.error('[Evacwar Offline Queue] Failed to enqueue operation:', err);
      throw err;
    }
  }

  async function getPendingOperations() {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_OPERATIONS, 'readonly');
        const store = tx.objectStore(STORE_OPERATIONS);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = (req.result || []).filter(item => item.status === 'PENDING' || item.status === 'FAILED');
          resolve(items);
        };
        req.onerror = () => resolve([]);
      });
    } catch (err) {
      return [];
    }
  }

  async function getQueueCount() {
    const items = await getPendingOperations();
    return items.length;
  }

  async function updateOperationStatus(clientOperationId, status, extra = {}) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
        const store = tx.objectStore(STORE_OPERATIONS);
        const getReq = store.get(clientOperationId);
        getReq.onsuccess = () => {
          if (getReq.result) {
            const updated = Object.assign({}, getReq.result, { status: status }, extra);
            store.put(updated);
          }
          resolve(true);
        };
        getReq.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  async function removeOperation(clientOperationId) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
        const store = tx.objectStore(STORE_OPERATIONS);
        store.delete(clientOperationId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (err) {
      return false;
    }
  }

  function notifyQueueChange() {
    getQueueCount().then(count => {
      window.dispatchEvent(new CustomEvent('Evacwar:queue-changed', { detail: { count: count } }));
      updateUiQueueBadge(count);
    }).catch(() => { });
  }

  function updateUiQueueBadge(count) {
    const pills = document.querySelectorAll('.Evacwar-offline-queue-badge');
    pills.forEach(pill => {
      if (count > 0) {
        pill.classList.remove('hidden');
        pill.style.display = 'inline-flex';
        const countText = pill.querySelector('.queue-count-text');
        if (countText) {
          countText.textContent = `${count} offline action${count > 1 ? 's' : ''} queued`;
        }
      } else {
        pill.classList.add('hidden');
        pill.style.display = 'none';
      }
    });
  }

  /* --------------------------------------------------------------------------
     AUTOMATIC SYNCHRONIZATION
     -------------------------------------------------------------------------- */
  async function testServerReachability() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/health', {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async function syncPending() {
    if (isSyncing) return { success: false, reason: 'ALREADY_SYNCING' };

    const pending = await getPendingOperations();
    if (pending.length === 0) {
      return { success: true, count: 0 };
    }

    // Step 1: Verify actual server reachability
    const reachable = await testServerReachability();
    if (!reachable) {
      console.log('[Evacwar Offline Sync] Server unreachable, postponing sync.');
      return { success: false, reason: 'SERVER_UNREACHABLE' };
    }

    isSyncing = true;
    console.log(`[Evacwar Offline Sync] Starting synchronization of ${pending.length} operation(s)...`);

    try {
      // Mark as SYNCING locally
      for (const op of pending) {
        await updateOperationStatus(op.clientOperationId, 'SYNCING');
      }

      const res = await fetch('/staff/offline/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations: pending })
      });

      if (!res.ok) {
        throw new Error(`Sync endpoint responded with HTTP ${res.status}`);
      }

      const result = await res.json();
      const serverResults = result.results || [];
      let successCount = 0;

      for (const sRes of serverResults) {
        if (sRes.success) {
          successCount++;
          // Mark as SYNCED, then remove from queue after acknowledgement
          await updateOperationStatus(sRes.clientOperationId, 'SYNCED', {
            syncedAt: new Date().toISOString()
          });
          await removeOperation(sRes.clientOperationId);
        } else {
          await updateOperationStatus(sRes.clientOperationId, 'FAILED', {
            lastError: sRes.message || 'Server error'
          });
        }
      }

      console.log(`[Evacwar Offline Sync] Completed. Synced: ${successCount}/${pending.length}.`);

      notifyQueueChange();
      window.dispatchEvent(new CustomEvent('Evacwar:sync-completed', {
        detail: {
          syncedCount: successCount,
          total: pending.length,
          results: serverResults
        }
      }));

      return { success: true, syncedCount: successCount, total: pending.length };
    } catch (err) {
      console.warn('[Evacwar Offline Sync] Sync run failed:', err.message);
      // Revert items back to PENDING with incremented retry
      for (const op of pending) {
        await updateOperationStatus(op.clientOperationId, 'PENDING', {
          retryCount: (op.retryCount || 0) + 1,
          lastError: err.message
        });
      }
      notifyQueueChange();
      return { success: false, error: err.message };
    } finally {
      isSyncing = false;
    }
  }

  // Automatic triggers:
  // 1. When network returns online
  window.addEventListener('online', () => {
    console.log('[Evacwar Offline Queue] Network online detected. Triggering auto-sync...');
    setTimeout(() => {
      syncPending();
    }, 1200);
  });

  // 2. On DOMContentLoaded, check if any pending items exist and test sync
  document.addEventListener('DOMContentLoaded', () => {
    openDB().then(() => {
      notifyQueueChange();
      if (navigator.onLine) {
        setTimeout(() => syncPending(), 2000);
      }
    }).catch(() => { });
  });

  // Fallback download and roster status methods
  async function downloadOfflineRoster() {
    try {
      let res = null;
      try {
        res = await fetch('/api/offline/roster', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-cache',
          credentials: 'same-origin'
        });
      } catch (netErr) {
        res = await fetch('/staff/offline/roster', {
          headers: { 'Accept': 'application/json' },
          cache: 'no-cache',
          credentials: 'same-origin'
        });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.success) throw new Error(data?.message || 'Failed to fetch roster');
      const DexieClass = (typeof Dexie !== 'undefined' ? Dexie : null) || window.Dexie || (typeof globalThis !== 'undefined' ? globalThis.Dexie : null);
      if (DexieClass) {
        const d = new DexieClass('EvakWarLocalDB');
        d.version(1).stores({
          pending_operations: 'clientOperationId, operationType, centerId, staffId, syncStatus, createdAt',
          staff_assigned_sites: 'id, name, is_active',
          resident_roster: 'lookupKey, residentId, qrUuid, nameLower',
          map_data: 'id, updatedAt',
          app_state: 'key'
        });
        await d.open();
        await d.resident_roster.clear();
        const records = (data.roster || []).map(item => ({
          lookupKey: String(item.resident?.id || Math.random()),
          residentId: item.resident?.id,
          qrUuid: String(item.resident?.uuid || item.resident?.qr_code_uuid || '').toLowerCase().trim(),
          nameLower: `${item.resident?.first_name || ''} ${item.resident?.last_name || ''}`.toLowerCase().trim(),
          resident: item.resident,
          members: item.members || [],
          household: item,
          updatedAt: Date.now()
        }));
        if (records.length > 0) await d.resident_roster.bulkPut(records);
        await d.app_state.put({ key: 'roster_metadata', value: { count: records.length, cachedAt: new Date().toISOString() } });
        if (Array.isArray(data.centers) && data.centers.length > 0) {
          await d.staff_assigned_sites.bulkPut(data.centers);
          await d.map_data.put({
            id: 'san_rafael_map',
            centers: data.centers,
            mapFeatures: data.mapFeatures || { type: 'FeatureCollection', features: [] },
            updatedAt: new Date().toISOString()
          });
        }
        window.EvakWarLocalDB = d;
        return { success: true, count: records.length };
      }
      return { success: true, count: (data.roster || []).length };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function getRosterStatus() {
    try {
      const DexieClass = (typeof Dexie !== 'undefined' ? Dexie : null) || window.Dexie || (typeof globalThis !== 'undefined' ? globalThis.Dexie : null);
      if (DexieClass) {
        const d = new DexieClass('EvakWarLocalDB');
        d.version(1).stores({ resident_roster: 'lookupKey, residentId, qrUuid, nameLower' });
        const count = await d.resident_roster.count();
        if (count > 0) return { count: count };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Export public API
  window.EvakWarOfflineDB = {
    openDB,
    saveMapData,
    getMapData,
    cacheResident,
    findResident,
    enqueueOperation,
    getPendingOperations,
    getQueueCount,
    syncPending,
    downloadOfflineRoster,
    getRosterStatus
  };

  // Safely augment window.EvakWarDB without clobbering existing Dexie functions
  if (!window.EvakWarDB) {
    window.EvakWarDB = window.EvakWarOfflineDB;
  } else {
    for (const key of Object.keys(window.EvakWarOfflineDB)) {
      if (typeof window.EvakWarDB[key] === 'undefined') {
        window.EvakWarDB[key] = window.EvakWarOfflineDB[key];
      }
    }
  }

})(window);
