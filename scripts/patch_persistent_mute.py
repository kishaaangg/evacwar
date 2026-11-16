import os

header_path = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/header.ejs'
with open(header_path, 'r', encoding='utf-8') as f:
    c = f.read()

target1 = '''                        let lastTriggeredAlarmKey = null;
                        let lastTriggeredAlarmTs = 0;

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

                          // Deduplicate identical alert triggers within 12 seconds (e.g., Socket.IO + HTTP Poll + LoRa 2nd burst)
                          const alarmKey = String(alertData.alertId || alertData.id || (alertData.title + '|' + alertData.message));
                          if (lastTriggeredAlarmKey === alarmKey && (Date.now() - lastTriggeredAlarmTs < 12000)) {
                            return;
                          }
                          lastTriggeredAlarmKey = alarmKey;
                          lastTriggeredAlarmTs = Date.now();'''

replacement1 = '''                        window.__evwMutedAlertIds = window.__evwMutedAlertIds || new Set();
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

target2 = '''                        window.closeGlobalEmergencyModal = function () {
                          window.stopEmergencyAlertSound();
                          const modal = document.getElementById('realtimeEmergencyModal');
                          if (modal) {
                            modal.style.display = 'none';
                          }
                        };'''

replacement2 = '''                        window.closeGlobalEmergencyModal = function () {
                          try {
                            const activeData = window.__currentActiveAlertData;
                            const alertId = activeData ? String(activeData.alertId || activeData.id || '').trim() : '';
                            const alertKey = activeData ? ((alertId ? alertId + '|' : '') + String(activeData.title || '') + '|' + String(activeData.message || '')) : '';

                            window.__evwMutedAlertIds = window.__evwMutedAlertIds || new Set();
                            if (alertId) window.__evwMutedAlertIds.add(alertId);
                            if (alertKey) window.__evwMutedAlertIds.add(alertKey);

                            let mutedArr = [];
                            try {
                              mutedArr = JSON.parse(localStorage.getItem('evw_muted_alert_ids') || '[]');
                            } catch (_) {}
                            if (alertId && !mutedArr.includes(alertId)) {
                              mutedArr.push(alertId);
                            }
                            try {
                              localStorage.setItem('evw_muted_alert_ids', JSON.stringify(mutedArr));
                            } catch (_) {}

                            if (window.AndroidBleBridge && typeof window.AndroidBleBridge.muteAlert === 'function') {
                              window.AndroidBleBridge.muteAlert(alertId || alertKey);
                            }
                          } catch (mErr) {
                            console.warn('Mute alert note:', mErr);
                          }

                          window.stopEmergencyAlertSound();
                          const modal = document.getElementById('realtimeEmergencyModal');
                          if (modal) {
                            modal.style.display = 'none';
                          }
                        };'''

target3 = '''                        window.stopEmergencyAlertSound = function () {
                          // 0. Stop Native Android Alarm Stream + Vibrator if running in Android App
                          if (window.AndroidBleBridge && typeof window.AndroidBleBridge.stopNativeEmergencyAlarm === 'function') {
                            try { window.AndroidBleBridge.stopNativeEmergencyAlarm(); } catch (_) {}
                          }'''

replacement3 = '''                        window.stopEmergencyAlertSound = function () {
                          // 0. Stop Native Android Alarm Stream + Vibrator if running in Android App
                          if (window.AndroidBleBridge) {
                            try {
                              if (typeof window.AndroidBleBridge.muteAlert === 'function' && window.__currentActiveAlertData) {
                                const aid = String(window.__currentActiveAlertData.alertId || window.__currentActiveAlertData.id || '');
                                if (aid) window.AndroidBleBridge.muteAlert(aid);
                              }
                              if (typeof window.AndroidBleBridge.stopNativeEmergencyAlarm === 'function') {
                                window.AndroidBleBridge.stopNativeEmergencyAlarm();
                              }
                            } catch (_) {}
                          }'''

if target1 in c and target2 in c and target3 in c:
    c = c.replace(target1, replacement1, 1)
    c = c.replace(target2, replacement2, 1)
    c = c.replace(target3, replacement3, 1)
    with open(header_path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("header.ejs patched successfully!")
else:
    print("Failed to find targets in header.ejs:", target1 in c, target2 in c, target3 in c)
