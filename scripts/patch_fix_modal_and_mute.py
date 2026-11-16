import os

# 1. Patch header.ejs
header_path = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/header.ejs'
with open(header_path, 'r', encoding='utf-8') as f:
    c = f.read()

target = '''                        window.__evwMutedAlertIds = window.__evwMutedAlertIds || new Set();
                        window.__evwProcessedAlerts = window.__evwProcessedAlerts || new Set();

                        window.triggerEmergencyAlarm = function (alertData) {
                          if (!alertData) return;

                          // Do NOT play resident emergency siren on Admin or Staff Broadcast sender console
                          const pathNow = window.location.pathname || '';
                          if (currentUserRole === 'admin' || pathNow.startsWith('/admin') || pathNow.startsWith('/staff/broadcast')) {
                            if (typeof window.updateSystemAlertBanner === 'function') {
                              window.updateSystemAlertBanner(alertData);
                            }
                            return;
                          }

                          const alertIdStr = String(alertData.alertId || alertData.id || '').trim();
                          const alertKey = (alertIdStr ? alertIdStr + '|' : '') + String(alertData.title || '') + '|' + String(alertData.message || '');

                          // Read persistent muted set from localStorage
                          try {
                            const savedMuted = JSON.parse(localStorage.getItem('evw_muted_alert_ids') || '[]');
                            if (Array.isArray(savedMuted)) {
                              savedMuted.forEach(id => window.__evwMutedAlertIds.add(String(id)));
                            }
                          } catch (_) {}

                          // If resident already muted or acknowledged this alert, NEVER trigger siren/modal again!
                          if ((alertIdStr && window.__evwMutedAlertIds.has(alertIdStr)) || window.__evwMutedAlertIds.has(alertKey)) {
                            if (typeof window.updateSystemAlertBanner === 'function') {
                              window.updateSystemAlertBanner(alertData);
                            }
                            return;
                          }

                          // Permanent session deduplication: if this alert was already triggered, do not re-trigger siren!
                          if (window.__evwProcessedAlerts.has(alertKey) || (alertIdStr && window.__evwProcessedAlerts.has(alertIdStr))) {
                            return;
                          }
                          window.__evwProcessedAlerts.add(alertKey);
                          if (alertIdStr) window.__evwProcessedAlerts.add(alertIdStr);

                          window.__currentActiveAlertData = alertData;'''

replacement = '''                        window.__evwCurrentPlayingSirenId = null;

                        window.triggerEmergencyAlarm = function (alertData) {
                          if (!alertData) return;

                          // Do NOT play resident emergency siren on Admin or Staff Broadcast sender console
                          const pathNow = window.location.pathname || '';
                          if (currentUserRole === 'admin' || pathNow.startsWith('/admin') || pathNow.startsWith('/staff/broadcast')) {
                            if (typeof window.updateSystemAlertBanner === 'function') {
                              window.updateSystemAlertBanner(alertData);
                            }
                            return;
                          }

                          window.__currentActiveAlertData = alertData;

                          // 1. ALWAYS Open Emergency Warning Modal so resident sees disaster info & acknowledge button!
                          if (typeof window.openGlobalEmergencyModal === 'function') {
                            window.openGlobalEmergencyModal(alertData);
                          }
                          if (typeof window.updateSystemAlertBanner === 'function') {
                            window.updateSystemAlertBanner(alertData);
                          }

                          // 2. Check if Siren audio should play:
                          const alertIdStr = String(alertData.alertId || alertData.id || '').trim();
                          let mutedArr = [];
                          try {
                            mutedArr = JSON.parse(localStorage.getItem('evw_muted_alert_ids') || '[]');
                          } catch (_) {}

                          // If resident already acknowledged & muted this alert, do NOT play siren sound!
                          if (alertIdStr && mutedArr.includes(alertIdStr)) {
                            console.log('[EvakWar] Alert is acknowledged/muted. Siren kept silent:', alertIdStr);
                            return;
                          }

                          // If siren is already playing for this alert in this session, do not restart
                          if (alertIdStr && window.__evwCurrentPlayingSirenId === alertIdStr) {
                            return;
                          }
                          window.__evwCurrentPlayingSirenId = alertIdStr;'''

if target in c:
    c = c.replace(target, replacement, 1)
    with open(header_path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("header.ejs patched successfully!")
else:
    print("Failed to find target in header.ejs")

# 2. Patch capacitor-resident-bridge.js
bridge_path = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/js/capacitor-resident-bridge.js'
with open(bridge_path, 'r', encoding='utf-8') as f:
    bc = f.read()

target_b = '''        if (alert && (alert.id || alert.alertId)) {
          const alertIdStr = String(alert.alertId || alert.id);
          let mutedList = [];
          try { mutedList = JSON.parse(localStorage.getItem('evw_muted_alert_ids') || '[]'); } catch (_) {}
          if (mutedList.includes(alertIdStr)) return;

          const lastTriggered = localStorage.getItem('evw_last_triggered_alert_id');
          if (lastTriggered === alertIdStr) return; // Already triggered once for this session

          const sentMs = alert.timestampMs || (alert.sent_at ? new Date(alert.sent_at).getTime() : 0);
          const ageMs = sentMs ? (Date.now() - sentMs) : 0;

          // If this alert hasn't been triggered on this phone yet and was broadcast within the last 15 minutes
          if (ageMs >= -60000 && ageMs < 15 * 60 * 1000) {
            localStorage.setItem('evw_last_triggered_alert_id', alertIdStr);
            if (typeof global.triggerEmergencyAlarm === 'function') {
              global.triggerEmergencyAlarm(alert);
            }
          }
        }'''

replacement_b = '''        if (alert && (alert.id || alert.alertId)) {
          const alertIdStr = String(alert.alertId || alert.id);
          let mutedList = [];
          try { mutedList = JSON.parse(localStorage.getItem('evw_muted_alert_ids') || '[]'); } catch (_) {}
          if (mutedList.includes(alertIdStr)) {
            // Already muted by resident, skip sounding alarm
            return;
          }

          const sentMs = alert.timestampMs || (alert.sent_at ? new Date(alert.sent_at).getTime() : 0);
          const ageMs = sentMs ? (Date.now() - sentMs) : 0;

          // If alert is fresh (broadcast within the last 15 minutes) and not yet presented this session
          if (global.__lastTriggeredAlertId !== alertIdStr && ageMs >= -60000 && ageMs < 15 * 60 * 1000) {
            global.__lastTriggeredAlertId = alertIdStr;
            if (typeof global.triggerEmergencyAlarm === 'function') {
              global.triggerEmergencyAlarm(alert);
            }
          }
        }'''

if target_b in bc:
    bc = bc.replace(target_b, replacement_b, 1)
    with open(bridge_path, 'w', encoding='utf-8') as f:
        f.write(bc)
    print("capacitor-resident-bridge.js patched successfully!")
else:
    print("Failed to find target in capacitor-resident-bridge.js")
