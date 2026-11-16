import re

# 1. Update views/partials/header.ejs
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    hc = f.read()

# Replace sound playing and stopping functions
old_sound_block = """                        window.playEmergencyAlertSound = function () {
                          const audio = getAlertAudio();
                          audio.currentTime = 0;
                          const playPromise = audio.play();
                          if (playPromise !== undefined) {
                            playPromise.then(() => {
                              const notice = document.getElementById('globalSoundBlockedNotice');
                              if (notice) notice.style.display = 'none';
                            }).catch((err) => {
                              console.warn("Audio autoplay blocked by browser policy:", err);
                              const notice = document.getElementById('globalSoundBlockedNotice');
                              if (notice) notice.style.display = 'flex';
                            });
                          }
                        };

                        window.stopEmergencyAlertSound = function () {
                          if (alertAudio) {
                            alertAudio.pause();
                            alertAudio.currentTime = 0;
                          }
                        };"""

new_sound_block = """                        // ---- WebAudio Synthesizer Dual-Tone Emergency Siren (100% Offline / Zero-Network) ----
                        let webAudioCtx = null;
                        let sirenOsc1 = null;
                        let sirenOsc2 = null;
                        let sirenGain = null;
                        let sirenInterval = null;

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
                            sirenGain.gain.setValueAtTime(0.35, webAudioCtx.currentTime);
                            sirenGain.connect(webAudioCtx.destination);

                            sirenOsc1 = webAudioCtx.createOscillator();
                            sirenOsc1.type = 'sawtooth';
                            sirenOsc1.frequency.setValueAtTime(960, webAudioCtx.currentTime);
                            sirenOsc1.connect(sirenGain);
                            sirenOsc1.start();

                            sirenOsc2 = webAudioCtx.createOscillator();
                            sirenOsc2.type = 'sine';
                            sirenOsc2.frequency.setValueAtTime(480, webAudioCtx.currentTime);
                            sirenOsc2.connect(sirenGain);
                            sirenOsc2.start();

                            let toggle = false;
                            sirenInterval = setInterval(() => {
                              if (!webAudioCtx || !sirenOsc1) return;
                              const t = webAudioCtx.currentTime;
                              toggle = !toggle;
                              if (toggle) {
                                sirenOsc1.frequency.setTargetAtTime(960, t, 0.06);
                                sirenOsc2.frequency.setTargetAtTime(480, t, 0.06);
                              } else {
                                sirenOsc1.frequency.setTargetAtTime(770, t, 0.06);
                                sirenOsc2.frequency.setTargetAtTime(385, t, 0.06);
                              }
                            }, 450);
                          } catch (e) {
                            console.warn("WebAudio siren error:", e);
                          }
                        }

                        function stopWebAudioSiren() {
                          if (sirenInterval) {
                            clearInterval(sirenInterval);
                            sirenInterval = null;
                          }
                          if (sirenOsc1) {
                            try { sirenOsc1.stop(); sirenOsc1.disconnect(); } catch (_) {}
                            sirenOsc1 = null;
                          }
                          if (sirenOsc2) {
                            try { sirenOsc2.stop(); sirenOsc2.disconnect(); } catch (_) {}
                            sirenOsc2 = null;
                          }
                          if (sirenGain) {
                            try { sirenGain.disconnect(); } catch (_) {}
                            sirenGain = null;
                          }
                        }

                        window.playEmergencyAlertSound = function () {
                          // 1. Multi-Pulse Haptic Vibration (Thesis Panel Spec: [400, 150, 400, 150, 600])
                          if (navigator.vibrate) {
                            try { navigator.vibrate([400, 150, 400, 150, 600]); } catch (_) {}
                          }
                          if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
                            try { window.Capacitor.Plugins.Haptics.vibrate({ duration: 1500 }).catch(() => {}); } catch (_) {}
                          }

                          // 2. Start 100% Offline WebAudio Dual-Tone Siren
                          startWebAudioSiren();

                          // 3. Also attempt MP3 audio if available
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
                          // Stop WebAudio synthesizer
                          stopWebAudioSiren();

                          // Stop MP3 audio
                          if (alertAudio) {
                            alertAudio.pause();
                            alertAudio.currentTime = 0;
                          }

                          // Stop vibration
                          if (navigator.vibrate) {
                            try { navigator.vibrate(0); } catch (_) {}
                          }
                        };"""

assert old_sound_block in hc, "old_sound_block not found in header.ejs"
hc = hc.replace(old_sound_block, new_sound_block)

# Replace modal HTML to include Designated Safe Evacuation Shelter and Dual Action Buttons
old_modal_html = """              <!-- Body -->
              <div style="padding: 24px; overflow-y: auto; flex: 1;">
                <h2 style="font-size: 22px; font-weight: 900; line-height: 1.25; margin: 0 0 12px 0; color: #ffffff;">
                  ${data.title || 'Official Emergency Alert'}
                </h2>
                <div style="font-size: 14px; line-height: 1.6; color: #e2e8f0; background: rgba(2, 6, 23, 0.6); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); white-space: pre-line;">
                  ${data.message || 'Please stay safe and follow instructions from emergency authorities.'}
                </div>
                ${targetLocation}
              </div>

              <!-- Footer Action -->
              <div style="padding: 16px 20px; background: rgba(2, 6, 23, 0.95); border-top: 1px solid rgba(255,255,255,0.1);">
                <button type="button" onclick="window.closeGlobalEmergencyModal()" style="width: 100%; padding: 14px 20px; border-radius: 16px; background: ${btnBg}; color: #ffffff; font-size: 15px; font-weight: 800; border: none; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);">
                  <i class="ph ph-check-circle" style="font-size: 20px;"></i>
                  <span>Acknowledge & Close Alert</span>
                </button>
              </div>"""

new_modal_html = """              <!-- Body -->
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
              </div>"""

assert old_modal_html in hc, "old_modal_html not found in header.ejs"
hc = hc.replace(old_modal_html, new_modal_html)

# Update lora.on('alert') to include evacCenter and trigger vibration
old_lora_alert = """                        // When Barangay Hall broadcasts EVW|ALT|... over 433.875 MHz LoRa:
                        lora.on('alert', (alertPacket) => {
                          if (!alertPacket) return;
                          const alertObj = {
                            id: 'lora_alt_' + (alertPacket.alertId || Date.now()),
                            title: alertPacket.title || 'EMERGENCY LORA ALERT',
                            message: alertPacket.message || alertPacket.instructions || 'Proceed to nearest evacuation center.',
                            severity: (alertPacket.severity || 'RED').toUpperCase(),
                            barangay: alertPacket.zone || 'San Rafael',
                            sent_at: new Date().toISOString()
                          };"""

new_lora_alert = """                        // When Barangay Hall broadcasts EVW|ALT|... over 433.875 MHz LoRa:
                        lora.on('alert', (alertPacket) => {
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
                          }"""

assert old_lora_alert in hc, "old_lora_alert not found in header.ejs"
hc = hc.replace(old_lora_alert, new_lora_alert)

with open('views/partials/header.ejs', 'w', encoding='utf-8') as f:
    f.write(hc)
print("Updated views/partials/header.ejs successfully!")


# 2. Update public/js/lora-mesh-client.js
with open('public/js/lora-mesh-client.js', 'r', encoding='utf-8') as f:
    lc = f.read()

# Update ALT parsing in parseEvwPacket
old_alt_parse = """    if (type === 'ALT') {
      const evacCenter = parts[6] || 'San Rafael Evacuation Center';
      const instructions = parts[7] || 'Proceed to nearest evacuation center immediately.';
      return {
        type: 'ALT',
        raw: trimmed,
        id: parts[2] || String(Date.now()),
        alertId: parts[2] || String(Date.now()),
        severity: parts[3] || 'RED',
        zone: parts[4] || 'ALL',
        barangay: parts[4] || 'San Rafael',
        title: parts[5] || 'EMERGENCY ALERT',
        evacCenter: evacCenter,
        instructions: instructions,
        message: evacCenter && evacCenter !== 'N/A'
          ? `${instructions}\\n\\nRecommended Shelter: ${evacCenter}`
          : instructions,
        sent_at: new Date().toISOString()
      };
    }"""

new_alt_parse = """    if (type === 'ALT') {
      const evacCenter = parts[6] || 'San Rafael Evacuation Center';
      const instructions = parts[7] || 'Proceed to nearest evacuation center immediately.';
      return {
        type: 'ALT',
        raw: trimmed,
        id: parts[2] || String(Date.now()),
        alertId: parts[2] || String(Date.now()),
        severity: parts[3] || 'RED',
        zone: parts[4] || 'ALL',
        barangay: parts[4] || 'San Rafael',
        title: parts[5] || 'EMERGENCY ALERT',
        evacCenter: evacCenter,
        instructions: instructions,
        message: instructions,
        source: 'LORA_433MHZ',
        sent_at: new Date().toISOString()
      };
    }"""

assert old_alt_parse in lc, "old_alt_parse not found in lora-mesh-client.js"
lc = lc.replace(old_alt_parse, new_alt_parse)

# Update handleIncomingRawPacket in lora-mesh-client.js
old_handle_pkt = """      if (parsed.type === 'ACK') {
        this.emit('ack', parsed);
      } else if (parsed.type === 'ALT') {
        this.emit('alert', parsed);
      }"""

new_handle_pkt = """      if (parsed.type === 'ACK') {
        this.emit('ack', parsed);
      } else if (parsed.type === 'ALT') {
        // Multi-pulse haptic vibration (Thesis Panel Spec: [400, 150, 400, 150, 600])
        if (navigator.vibrate) {
          try { navigator.vibrate([400, 150, 400, 150, 600]); } catch (_) {}
        }
        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-alert', { detail: parsed }));
        } catch (_) {}
        this.emit('alert', parsed);
      }"""

assert old_handle_pkt in lc, "old_handle_pkt not found in lora-mesh-client.js"
lc = lc.replace(old_handle_pkt, new_handle_pkt)

with open('public/js/lora-mesh-client.js', 'w', encoding='utf-8') as f:
    f.write(lc)
print("Updated public/js/lora-mesh-client.js successfully!")


# 3. Update resident-mobile/js/app.js
with open('resident-mobile/js/app.js', 'r', encoding='utf-8') as f:
    rc = f.read()

old_resident_ack = """  // Listen for LoRa ACKs (Rescuer Dispatched)
  loraClient.on('ack', (ack) => {
    const s4 = document.getElementById('stepDispatched');
    if (s4) {
      s4.className = 'flex items-center gap-2 text-emerald-600 font-black';
      s4.innerHTML = `<i class=\"ph ph-check-circle\"></i> 4. ${ack.status || 'RESCUER DISPATCHED'} (${ack.responderName || 'Team 1'})`;
    }
  });"""

new_resident_ack = """  // Listen for LoRa ACKs (Rescuer Dispatched)
  loraClient.on('ack', (ack) => {
    const s4 = document.getElementById('stepDispatched');
    if (s4) {
      s4.className = 'flex items-center gap-2 text-emerald-600 font-black';
      s4.innerHTML = `<i class=\"ph ph-check-circle\"></i> 4. ${ack.status || 'RESCUER DISPATCHED'} (${ack.responderName || 'Team 1'})`;
    }
  });

  // Listen for LoRa Emergency Broadcasts (433.875 MHz)
  loraClient.on('alert', (alertObj) => {
    console.log('[ResidentMobile] Received LoRa Emergency Alert:', alertObj);
    if (navigator.vibrate) {
      try { navigator.vibrate([400, 150, 400, 150, 600]); } catch (_) {}
    }
    if (typeof window.openGlobalEmergencyModal === 'function') {
      window.openGlobalEmergencyModal(alertObj);
    }
  });"""

assert old_resident_ack in rc, "old_resident_ack not found in resident-mobile/js/app.js"
rc = rc.replace(old_resident_ack, new_resident_ack)

with open('resident-mobile/js/app.js', 'w', encoding='utf-8') as f:
    f.write(rc)
print("Updated resident-mobile/js/app.js successfully!")
