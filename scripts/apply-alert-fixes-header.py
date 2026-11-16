import re

with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    hc = f.read()

target_start = hc.find('<!-- 4. GLOBAL REAL-TIME IN-APP EMERGENCY ALERT MODAL')
target_end = hc.find('<!-- 5. GLOBAL 433.875 MHz LORA MESH CLIENT')

assert target_start != -1, "target_start not found"
assert target_end != -1, "target_end not found"

new_section_4 = """<!-- 4. REAL-TIME EMERGENCY ALERT MODAL & EMERGENCY SOUND / VIBRATION SYSTEM -->
                    <script>
                      (function () {
                        // Global state
                        let alertAudio = null;
                        let activeAlertId = null;
                        let emergencyVibrateInterval = null;
                        let webAudioCtx = null;
                        let sirenOsc1 = null;
                        let sirenOsc2 = null;
                        let sirenOsc3 = null;
                        let sirenGain = null;
                        let sirenInterval = null;

                        // ---- 1. Native Capacitor Local Notification Channel Setup ----
                        function initNotificationChannel() {
                          const capNotif = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
                          if (capNotif) {
                            if (typeof capNotif.requestPermissions === 'function') {
                              capNotif.requestPermissions().catch(() => {});
                            }
                            if (typeof capNotif.createChannel === 'function') {
                              capNotif.createChannel({
                                id: 'emergency-alerts',
                                name: 'Disaster Emergency Alerts',
                                description: 'High-priority emergency alerts and evacuation orders',
                                importance: 5, // IMPORTANCE_HIGH (pops on lockscreen & over apps)
                                visibility: 1, // VISIBILITY_PUBLIC
                                sound: 'res_emergency_alert.wav',
                                vibration: true,
                                lights: true,
                                lightColor: '#FF0000'
                              }).catch(() => {});
                            }
                          }
                        }
                        if (document.readyState === 'loading') {
                          document.addEventListener('DOMContentLoaded', initNotificationChannel);
                        } else {
                          initNotificationChannel();
                        }

                        // ---- 2. High-Volume Dual-Tone WebAudio Synthesizer Siren (100% Offline) ----
                        function startWebAudioSiren() {
                          try {
                            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                            if (!AudioContextClass) return;
                            if (!webAudioCtx) {
                              webAudioCtx = new AudioContextClass();
                            }
                            if (webAudioCtx.state === 'suspended') {
                              webAudioCtx.resume().catch(() => {});
                            }
                            if (sirenOsc1 || sirenOsc2) return;

                            sirenGain = webAudioCtx.createGain();
                            sirenGain.gain.setValueAtTime(0.75, webAudioCtx.currentTime); // High volume!
                            sirenGain.connect(webAudioCtx.destination);

                            // Primary warble oscillator
                            sirenOsc1 = webAudioCtx.createOscillator();
                            sirenOsc1.type = 'sawtooth';
                            sirenOsc1.frequency.setValueAtTime(960, webAudioCtx.currentTime);
                            sirenOsc1.connect(sirenGain);
                            sirenOsc1.start();

                            // Sub-harmonic oscillator for thickness
                            sirenOsc2 = webAudioCtx.createOscillator();
                            sirenOsc2.type = 'square';
                            sirenOsc2.frequency.setValueAtTime(480, webAudioCtx.currentTime);
                            sirenOsc2.connect(sirenGain);
                            sirenOsc2.start();

                            // Bass pulse oscillator
                            sirenOsc3 = webAudioCtx.createOscillator();
                            sirenOsc3.type = 'sine';
                            sirenOsc3.frequency.setValueAtTime(240, webAudioCtx.currentTime);
                            sirenOsc3.connect(sirenGain);
                            sirenOsc3.start();

                            let toggle = false;
                            sirenInterval = setInterval(() => {
                              if (!webAudioCtx || !sirenOsc1) return;
                              const t = webAudioCtx.currentTime;
                              toggle = !toggle;
                              if (toggle) {
                                sirenOsc1.frequency.setTargetAtTime(960, t, 0.05);
                                sirenOsc2.frequency.setTargetAtTime(480, t, 0.05);
                                sirenOsc3.frequency.setTargetAtTime(240, t, 0.05);
                              } else {
                                sirenOsc1.frequency.setTargetAtTime(770, t, 0.05);
                                sirenOsc2.frequency.setTargetAtTime(385, t, 0.05);
                                sirenOsc3.frequency.setTargetAtTime(192, t, 0.05);
                              }
                            }, 350);
                          } catch (e) {
                            console.warn("WebAudio siren error:", e);
                          }
                        }

                        function stopWebAudioSiren() {
                          if (sirenInterval) {
                            clearInterval(sirenInterval);
                            sirenInterval = null;
                          }
                          [sirenOsc1, sirenOsc2, sirenOsc3].forEach(osc => {
                            if (osc) {
                              try { osc.stop(); osc.disconnect(); } catch (_) {}
                            }
                          });
                          sirenOsc1 = null;
                          sirenOsc2 = null;
                          sirenOsc3 = null;
                          if (sirenGain) {
                            try { sirenGain.disconnect(); } catch (_) {}
                            sirenGain = null;
                          }
                        }

                        function getAlertAudio() {
                          if (!alertAudio) {
                            alertAudio = new Audio('/sounds/emergency-alert-us-2.mp3');
                            alertAudio.loop = true;
                            alertAudio.preload = 'auto';
                          }
                          return alertAudio;
                        }

                        window.playEmergencyAlertSound = function () {
                          // Start WebAudio synthesizer
                          startWebAudioSiren();

                          // Simultaneously attempt MP3 audio element
                          try {
                            const audio = getAlertAudio();
                            audio.currentTime = 0;
                            const playPromise = audio.play();
                            if (playPromise !== undefined) {
                              playPromise.then(() => {
                                const notice = document.getElementById('globalSoundBlockedNotice');
                                if (notice) notice.style.display = 'none';
                              }).catch(() => {});
                            }
                          } catch (_) {}
                        };

                        window.stopEmergencyAlertSound = function () {
                          // 1. Stop repeating vibration
                          if (emergencyVibrateInterval) {
                            clearInterval(emergencyVibrateInterval);
                            emergencyVibrateInterval = null;
                          }
                          if (navigator.vibrate) {
                            try { navigator.vibrate(0); } catch (_) {}
                          }

                          // 2. Stop WebAudio synthesizer
                          stopWebAudioSiren();

                          // 3. Stop MP3 audio
                          if (alertAudio) {
                            alertAudio.pause();
                            alertAudio.currentTime = 0;
                          }
                        };

                        // ---- 3. Live Dashboard System Alert Banner Synchronizer ----
                        window.updateSystemAlertBanner = function (alertData) {
                          if (!alertData) return;
                          try {
                            localStorage.setItem('evw_active_alert', JSON.stringify(alertData));
                            localStorage.setItem('evw_last_lora_alert', JSON.stringify(alertData));
                          } catch (_) {}

                          const banner = document.getElementById('residentSystemAlertBanner');
                          if (!banner) return;

                          const titleEl = document.getElementById('residentAlertTitle');
                          const msgEl = document.getElementById('residentAlertMessage');
                          const bgIcon = document.getElementById('residentAlertBgIcon');
                          const pingDot = document.getElementById('residentAlertPingDot');
                          const statusLabel = document.getElementById('residentAlertStatusLabel');
                          const timeWrapper = document.getElementById('residentAlertTimeWrapper');
                          const timeText = document.getElementById('residentAlertTimeText');

                          const upperSev = (alertData.severity || alertData.level || 'RED').toUpperCase();
                          let gradient = "from-red-600 via-rose-600 to-red-700 text-white shadow-red-500/20";
                          let alertIcon = "ph-siren";
                          let labelText = "Official Emergency Alert (RED)";

                          if (upperSev === "ORANGE" || upperSev === "WARNING") {
                            gradient = "from-orange-500 via-amber-600 to-orange-600 text-white shadow-orange-500/20";
                            alertIcon = "ph-warning-circle";
                            labelText = "Pre-Evacuation Warning (ORANGE)";
                          } else if (upperSev === "YELLOW") {
                            gradient = "from-amber-400 via-yellow-400 to-amber-500 text-slate-950 shadow-amber-500/20";
                            alertIcon = "ph-warning";
                            labelText = "Severe Weather & Flood Watch (YELLOW)";
                          } else if (upperSev === "GREEN") {
                            gradient = "from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-emerald-500/20";
                            alertIcon = "ph-check-circle";
                            labelText = "All Clear Notice (GREEN)";
                          } else if (upperSev === "BLUE") {
                            gradient = "from-blue-600 via-indigo-600 to-blue-700 text-white shadow-blue-500/20";
                            alertIcon = "ph-info";
                            labelText = "Community Disaster Advisory (BLUE)";
                          }

                          banner.className = `rounded-3xl bg-gradient-to-br ${gradient} p-5 sm:p-6 shadow-md relative overflow-hidden border transition-all duration-300`;

                          if (titleEl) titleEl.textContent = alertData.title || "Official Emergency Alert";
                          if (msgEl) msgEl.textContent = alertData.message || "";
                          if (bgIcon) bgIcon.className = `ph ${alertIcon} text-9xl`;
                          if (pingDot) pingDot.className = "w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping";
                          if (statusLabel) statusLabel.textContent = labelText;

                          if (timeWrapper) {
                            timeWrapper.classList.remove('hidden');
                            if (timeText) {
                              const timeFormatted = alertData.sent_at
                                ? new Date(alertData.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              timeText.textContent = timeFormatted + ' • Active Alert';
                            }
                          }
                        };

                        // ---- 4. Master Emergency Alarm Trigger (Vibration + Siren + Local Push + Modal) ----
                        window.triggerEmergencyAlarm = function (alertData) {
                          if (!alertData) return;
                          console.log('[EvakWar] 🚨 MASTER EMERGENCY ALARM TRIGGERED:', alertData);

                          // Step A: Persist active alert
                          try {
                            localStorage.setItem('evw_active_alert', JSON.stringify(alertData));
                            localStorage.setItem('evw_last_lora_alert', JSON.stringify(alertData));
                          } catch (_) {}

                          // Step B: Trigger Android Vibration Motor: [500, 150, 500, 150, 1000]
                          if (navigator.vibrate) {
                            try { navigator.vibrate([500, 150, 500, 150, 1000]); } catch (_) {}
                          }
                          if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
                            try { window.Capacitor.Plugins.Haptics.vibrate({ duration: 2500 }).catch(() => {}); } catch (_) {}
                          }

                          // Repeating vibration pattern every 3.2s until acknowledged
                          if (emergencyVibrateInterval) clearInterval(emergencyVibrateInterval);
                          emergencyVibrateInterval = setInterval(() => {
                            const modal = document.getElementById('realtimeEmergencyModal');
                            if (!modal || modal.style.display !== 'flex') {
                              clearInterval(emergencyVibrateInterval);
                              emergencyVibrateInterval = null;
                              return;
                            }
                            if (navigator.vibrate) {
                              try { navigator.vibrate([500, 150, 500, 150, 1000]); } catch (_) {}
                            }
                          }, 3200);

                          // Step C: Play Emergency Siren Tone
                          window.playEmergencyAlertSound();

                          // Step D: Update Dashboard Advisory Status Banner
                          if (typeof window.updateSystemAlertBanner === 'function') {
                            window.updateSystemAlertBanner(alertData);
                          }
                          try {
                            window.dispatchEvent(new CustomEvent('evw:alert-updated', { detail: alertData }));
                          } catch (_) {}

                          // Step E: Pop High-Priority Local Push Notification (even if screen locked)
                          const capNotif = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
                          if (capNotif && typeof capNotif.schedule === 'function') {
                            try {
                              capNotif.schedule({
                                notifications: [{
                                  id: Math.floor(Math.random() * 100000) + 1,
                                  title: `🚨 ${alertData.title || 'MANDATORY EVACUATION ORDER'}`,
                                  body: `${alertData.message || 'Evacuate immediately.'}\\nRecommended Shelter: ${alertData.evacCenter || 'San Rafael Evacuation Center'}`,
                                  channelId: 'emergency-alerts',
                                  ongoing: true,
                                  autoCancel: false,
                                  priority: 2, // High priority heads-up
                                  schedule: { at: new Date(Date.now() + 50) }
                                }]
                              }).catch(err => console.warn('LocalNotifications schedule error:', err));
                            } catch (e) {
                              console.warn('LocalNotifications error:', e);
                            }
                          }

                          // Step F: Open Full-Screen Emergency Warning Modal with Safe Evacuation Route Guidance
                          if (typeof window.openGlobalEmergencyModal === 'function') {
                            window.openGlobalEmergencyModal(alertData);
                          }
                        };

                        // ---- 5. Full-Screen Emergency Warning Modal ----
                        const currentUserRole = "<%= (locals.user && locals.user.role) ? locals.user.role : (locals.resident ? 'resident' : 'guest') %>";

                        window.openGlobalEmergencyModal = function (data) {
                          if (!data) return;

                          // Update live system alert banner
                          if (typeof window.updateSystemAlertBanner === 'function') {
                            window.updateSystemAlertBanner(data);
                          }

                          // Do NOT display popup modal on admin side
                          if (currentUserRole === 'admin') return;

                          activeAlertId = data.id || Date.now();

                          const sev = (data.severity || 'RED').toUpperCase();
                          let headerBg = 'linear-gradient(135deg, #dc2626, #e11d48, #b91c1c)';
                          let borderColor = '#ef4444';
                          let glowClass = 'glow-pulse-red';
                          let badgeLabel = '🚨 RED ALERT';
                          let iconClass = 'ph-siren';
                          let btnBg = 'linear-gradient(135deg, #dc2626, #e11d48)';

                          if (sev === 'ORANGE' || sev === 'WARNING') {
                            headerBg = 'linear-gradient(135deg, #ea580c, #d97706, #c2410c)';
                            borderColor = '#f97316';
                            glowClass = 'glow-pulse-orange';
                            badgeLabel = '⚠️ ORANGE WARNING';
                            iconClass = 'ph-warning-circle';
                            btnBg = 'linear-gradient(135deg, #ea580c, #d97706)';
                          } else if (sev === 'YELLOW') {
                            headerBg = 'linear-gradient(135deg, #d97706, #ca8a04, #b45309)';
                            borderColor = '#eab308';
                            glowClass = 'glow-pulse-yellow';
                            badgeLabel = '⚡ YELLOW WATCH';
                            iconClass = 'ph-warning';
                            btnBg = 'linear-gradient(135deg, #d97706, #ca8a04)';
                          } else if (sev === 'GREEN') {
                            headerBg = 'linear-gradient(135deg, #059669, #0d9488, #047857)';
                            borderColor = '#10b981';
                            glowClass = 'glow-pulse-green';
                            badgeLabel = '✅ GREEN ALL CLEAR';
                            iconClass = 'ph-check-circle';
                            btnBg = 'linear-gradient(135deg, #059669, #0d9488)';
                          } else if (sev === 'BLUE') {
                            headerBg = 'linear-gradient(135deg, #2563eb, #4f46e5, #1d4ed8)';
                            borderColor = '#3b82f6';
                            glowClass = 'glow-pulse-blue';
                            badgeLabel = '📢 COMMUNITY ADVISORY';
                            iconClass = 'ph-info';
                            btnBg = 'linear-gradient(135deg, #2563eb, #4f46e5)';
                          }

                          let modal = document.getElementById('realtimeEmergencyModal');
                          if (!modal) {
                            modal = document.createElement('div');
                            modal.id = 'realtimeEmergencyModal';
                            document.body.appendChild(modal);
                          } else if (modal.parentElement !== document.body) {
                            document.body.appendChild(modal);
                          }

                          modal.style.cssText = 'position: fixed !important; inset: 0px !important; width: 100vw !important; height: 100vh !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important; background: rgba(2, 6, 23, 0.92) !important; backdrop-filter: blur(8px) !important; padding: 16px !important; box-sizing: border-box !important; margin: 0 !important;';

                          const sentTime = data.sent_at ? new Date(data.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const targetLocation = data.barangay && data.barangay !== 'all' && data.barangay !== 'ALL' ? `<div style="margin-top: 12px; font-size: 12px; color: #fde047; font-weight: 600;"><i class="ph ph-map-pin"></i> Target Area: <strong>${data.barangay}</strong></div>` : '';

                          modal.innerHTML = `
            <div class="${glowClass}" style="position: relative; width: 100%; max-width: 520px; background: #0f172a; color: #ffffff; border-radius: 24px; border: 2.5px solid ${borderColor}; overflow: hidden; display: flex; flex-direction: column; max-height: 92vh; font-family: inherit;">
              
              <!-- Header -->
              <div style="padding: 16px 20px; background: ${headerBg}; display: flex; align-items: center; justify-content: space-between; color: #ffffff;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <span style="font-size: 24px; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 12px;">
                    <i class="ph ${iconClass}"></i>
                  </span>
                  <div>
                    <span style="font-size: 11px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; background: #ffffff; color: #0f172a; padding: 2px 8px; border-radius: 9999px; display: inline-block;">
                      ${badgeLabel}
                    </span>
                    <div style="font-size: 11px; opacity: 0.9; margin-top: 2px;">
                      <i class="ph ph-clock"></i> ${sentTime}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Autoplay Blocked Notice -->
              <div id="globalSoundBlockedNotice" style="display: none; background: rgba(245, 158, 11, 0.2); border-bottom: 1px solid rgba(245, 158, 11, 0.4); padding: 10px 16px; font-size: 12px; color: #fef08a; font-weight: bold; align-items: center; justify-content: space-between; gap: 8px;">
                <span>⚠️ Alarm sound paused by browser.</span>
                <button type="button" onclick="window.playEmergencyAlertSound()" style="padding: 6px 12px; border-radius: 8px; background: #f59e0b; color: #020617; font-weight: 800; border: none; cursor: pointer; text-transform: uppercase; font-size: 11px;">
                  🔊 Enable Alert Sound
                </button>
              </div>

              <!-- Body -->
              <div style="padding: 24px; overflow-y: auto; flex: 1;">
                <h2 style="font-size: 22px; font-weight: 900; line-height: 1.25; margin: 0 0 12px 0; color: #ffffff;">
                  ${data.title || 'Official Emergency Alert'}
                </h2>
                <div style="font-size: 14px; line-height: 1.6; color: #e2e8f0; background: rgba(2, 6, 23, 0.6); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); white-space: pre-line;">
                  ${data.message || 'Please stay safe and follow instructions from emergency authorities.'}
                </div>
                ${targetLocation}

                <!-- Safe Evacuation Center Guidance -->
                <div style="margin-top: 14px; background: rgba(16, 185, 129, 0.15); border: 1.5px solid #10b981; border-radius: 14px; padding: 12px 14px;">
                  <div style="font-size: 11px; text-transform: uppercase; font-weight: 800; color: #34d399; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
                    <i class="ph ph-shield-check" style="font-size: 16px;"></i> Designated Safe Evacuation Shelter
                  </div>
                  <div style="font-size: 16px; font-weight: 800; color: #ffffff; margin-top: 3px;">
                    ${data.evacCenter || 'San Rafael Evacuation Center'}
                  </div>
                  <div style="font-size: 11px; color: #94a3b8; margin-top: 3px; display: flex; align-items: center; gap: 4px;">
                    <i class="ph ph-broadcast text-emerald-400"></i> Dispatched via 433.875 MHz LoRa Mesh
                  </div>
                </div>
              </div>

              <!-- Footer Actions (Dual Buttons) -->
              <div style="padding: 14px 20px; background: rgba(2, 6, 23, 0.95); border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; gap: 10px;">
                <a href="${(window.Capacitor && window.Capacitor.isNativePlatform()) ? '/resident/evacuation/index.html' : '/resident/evacuation'}?target=${encodeURIComponent(data.evacCenter || 'San Rafael Evacuation Center')}"
                   onclick="window.stopEmergencyAlertSound()"
                   style="width: 100%; padding: 14px 18px; border-radius: 14px; background: linear-gradient(135deg, #059669, #10b981); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; text-align: center; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); box-sizing: border-box;">
                  <i class="ph ph-navigation-arrow" style="font-size: 18px;"></i>
                  <span>View Safe Evacuation Route</span>
                </a>
                <button type="button" onclick="window.closeGlobalEmergencyModal()"
                        style="width: 100%; padding: 11px 18px; border-radius: 12px; background: rgba(255, 255, 255, 0.08); color: #cbd5e1; font-size: 13px; font-weight: 700; border: 1px solid rgba(255, 255, 255, 0.15); cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; gap: 6px;">
                  <i class="ph ph-bell-slash" style="font-size: 16px;"></i>
                  <span>Acknowledge & Silence Siren</span>
                </button>
              </div>

            </div>
          `;
                        };

                        window.closeGlobalEmergencyModal = function () {
                          window.stopEmergencyAlertSound();
                          const modal = document.getElementById('realtimeEmergencyModal');
                          if (modal) {
                            modal.style.display = 'none';
                          }
                        };

                        // Unlock WebAudio on first gesture
                        function unlockAudioOnGesture() {
                          if (webAudioCtx && webAudioCtx.state === 'suspended') {
                            webAudioCtx.resume().catch(() => {});
                          }
                        }
                        ['pointerdown', 'touchstart', 'keydown'].forEach(evt => {
                          document.addEventListener(evt, unlockAudioOnGesture, { capture: true, passive: true });
                        });

                        // ---- 6. Socket.IO Real-Time Network Listener (With Capacitor Mobile LAN Fallback) ----
                        const SERVER_ORIGIN = (window.Capacitor && window.Capacitor.isNativePlatform())
                          ? (localStorage.getItem('evw_server_url') || 'http://192.168.0.100:8080')
                          : window.location.origin;

                        let socket = null;
                        try {
                          if (typeof io !== 'undefined') {
                            socket = io(SERVER_ORIGIN, {
                              transports: ['websocket', 'polling'],
                              reconnectionAttempts: 10,
                              timeout: 5000
                            });
                            window.__appSocket = socket;

                            socket.on('emergency:alert', (data) => {
                              console.log('[Socket.IO] Received emergency:alert:', data);
                              window.triggerEmergencyAlarm(data);
                            });

                            socket.on('alert:broadcast', (data) => {
                              console.log('[Socket.IO] Received alert:broadcast:', data);
                              if (data && data.title) {
                                window.triggerEmergencyAlarm(data);
                              }
                            });
                          }
                        } catch (sErr) {
                          console.warn('Socket.IO connection note:', sErr);
                        }

                      })();
                    </script>

                    """

hc = hc[:target_start] + new_section_4 + hc[target_end:]

# Now also update Section 5 in header.ejs (lora.on('alert')) to call triggerEmergencyAlarm
old_lora_block = """                        lora.on('alert', (alertPacket) => {
                          if (!alertPacket) return;
                          const alertObj = {
                            id: 'lora_alt_' + (alertPacket.alertId || alertPacket.id || Date.now()),
                            title: alertPacket.title || 'EMERGENCY LORA ALERT',
                            message: alertPacket.message || alertPacket.instructions || 'Proceed to nearest evacuation center.',
                            severity: (alertPacket.severity || 'RED').toUpperCase(),
                            barangay: alertPacket.zone || 'San Rafael',
                            evacCenter: alertPacket.evacCenter || 'San Rafael Evacuation Center',
                            sent_at: new Date().toISOString()
                          };

                          // Multi-pulse vibration: [400ms on, 150ms off, 400ms on, 150ms off, 600ms on]
                          if (navigator.vibrate) {
                            try { navigator.vibrate([400, 150, 400, 150, 600]); } catch (_) {}
                          }

                          try {
                            localStorage.setItem('evw_last_lora_alert', JSON.stringify(alertObj));
                          } catch (_) {}

                          // 1. Open full-screen Emergency Alert Modal + Siren + Update Dashboard Banner
                          if (typeof window.openGlobalEmergencyModal === 'function') {
                            window.openGlobalEmergencyModal(alertObj);
                          } else if (typeof window.updateSystemAlertBanner === 'function') {
                            window.updateSystemAlertBanner(alertObj);
                          }"""

new_lora_block = """                        lora.on('alert', (alertPacket) => {
                          if (!alertPacket) return;
                          const alertObj = {
                            id: 'lora_alt_' + (alertPacket.alertId || alertPacket.id || Date.now()),
                            title: alertPacket.title || 'EMERGENCY LORA ALERT',
                            message: alertPacket.message || alertPacket.instructions || 'Proceed to nearest evacuation center.',
                            severity: (alertPacket.severity || 'RED').toUpperCase(),
                            barangay: alertPacket.zone || 'San Rafael',
                            evacCenter: alertPacket.evacCenter || 'San Rafael Evacuation Center',
                            sent_at: new Date().toISOString()
                          };

                          // Trigger Master Emergency Alarm (Vibration + WebAudio Siren + Local Push + Dashboard Banner + Modal)
                          if (typeof window.triggerEmergencyAlarm === 'function') {
                            window.triggerEmergencyAlarm(alertObj);
                          } else {
                            if (typeof window.openGlobalEmergencyModal === 'function') {
                              window.openGlobalEmergencyModal(alertObj);
                            }
                            if (typeof window.updateSystemAlertBanner === 'function') {
                              window.updateSystemAlertBanner(alertObj);
                            }
                          }"""

if old_lora_block in hc:
    hc = hc.replace(old_lora_block, new_lora_block)
    print("Replaced old_lora_block successfully")
else:
    print("Notice: old_lora_block not found exactly; using regex search")
    hc = re.sub(
        r"lora\.on\('alert',\s*\(alertPacket\)\s*=>\s*\{.*?if \(typeof window\.openGlobalEmergencyModal === 'function'\)\s*\{\s*window\.openGlobalEmergencyModal\(alertObj\);\s*\}\s*else if \(typeof window\.updateSystemAlertBanner === 'function'\)\s*\{\s*window\.updateSystemAlertBanner\(alertObj\);\s*\}",
        new_lora_block,
        hc,
        flags=re.DOTALL
    )

with open('views/partials/header.ejs', 'w', encoding='utf-8') as f:
    f.write(hc)

print("Updated views/partials/header.ejs successfully!")
