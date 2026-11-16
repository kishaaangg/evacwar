# -*- coding: utf-8 -*-
"""
Patch views/partials/header.ejs and views/resident/dashboard.ejs:
1. Dynamic multi-transport header indicator (BLE, USB OTG, Wi-Fi, Standby).
2. Offline notification banner prompting resident to connect via BLE or USB OTG.
3. LoRa hardware link selector modal.
4. Minimalist, professional emergency alert modal.
"""

import sys

def patch_header():
    header_path = 'views/partials/header.ejs'
    with open(header_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Normalize CRLF
    content = content.replace('\r\n', '\n')

    # 1. Update Header Button (#btnHeaderLoraBle)
    old_btn_pattern = """                  <!-- 433.875 MHz LoRa BLE Quick Connect Pill (Resident & Rescuer) -->
                  <% if (user.role === 'resident' || user.role === 'rescuer' || user.role === 'staff') { %>
                  <button id="btnHeaderLoraBle" type="button" onclick="window.connectGlobalLoraBle && window.connectGlobalLoraBle()"
                    class="focus-ring inline-flex items-center gap-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2.5 py-1 text-[10px] sm:text-xs font-extrabold shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Connect 433.875 MHz LoRa Node via Bluetooth (PIN 123456)">
                    <i id="headerLoraIcon" class="ph ph-broadcast text-xs sm:text-sm text-emerald-400 animate-pulse"></i>
                    <span id="headerLoraText" class="hidden xs:inline">LoRa 433MHz</span>
                  </button>
                  <% } %>"""

    new_btn_code = """                  <!-- Hardware Transport Status Indicator (BLE / USB OTG / WI-FI / DISCONNECTED) -->
                  <% if (user.role === 'resident' || user.role === 'rescuer' || user.role === 'staff') { %>
                  <button id="btnHeaderLoraBle" type="button" onclick="window.openLoraHardwarePicker ? window.openLoraHardwarePicker() : (window.connectGlobalLoraBle && window.connectGlobalLoraBle())"
                    class="focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Hardware LoRa Transport Status (Tap to switch BLE / USB OTG / Wi-Fi)">
                    <span id="headerLoraDot" class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <i id="headerLoraIcon" class="ph ph-wifi-high text-xs sm:text-sm text-emerald-400"></i>
                    <span id="headerLoraText" class="truncate max-w-[125px] sm:max-w-[200px]">WI-FI LINK</span>
                  </button>
                  <% } %>"""

    if old_btn_pattern in content:
        content = content.replace(old_btn_pattern, new_btn_code)
        print("Patched #btnHeaderLoraBle in header.ejs")
    else:
        print("Warning: old_btn_pattern not matched exactly in header.ejs")

    # 2. Add Offline Warning Banner & Hardware Link Modal right under </header>
    old_header_end = """      </div>
    </header>

    <!-- CENTRAL NOTIFICATION PANEL DROPDOWN / OVERLAY DRAWER -->"""

    new_header_extras = """      </div>
    </header>

    <!-- OFFLINE HARDWARE CONNECTION NOTIFICATION BANNER -->
    <% if (user && user.role !== 'admin') { %>
    <div id="offlineLoraWarningBanner" class="hidden bg-gradient-to-r from-amber-700 via-orange-600 to-red-600 text-white px-3 sm:px-4 py-2.5 shadow-xl border-b border-white/20 transition-all duration-300 z-[100] relative">
      <div class="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2.5 text-xs sm:text-sm">
        <div class="flex items-center gap-2.5 text-center md:text-left">
          <div class="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center shrink-0 border border-amber-300/40">
            <i class="ph ph-wifi-slash text-lg text-yellow-300 animate-pulse"></i>
          </div>
          <div>
            <div class="font-black tracking-wide text-white flex items-center gap-1.5 justify-center md:justify-start">
              <span>⚠️ Wi-Fi Offline / Network Lost</span>
              <span class="text-[10px] font-bold bg-black/40 text-amber-200 px-2 py-0.5 rounded-full uppercase border border-amber-400/30">Disaster Mode</span>
            </div>
            <p class="opacity-95 text-amber-100 text-[11px] sm:text-xs mt-0.5">
              Connect your LoRa module via <strong>Bluetooth (BLE)</strong> or <strong>USB OTG Cable</strong> to receive emergency alerts & send SOS.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="window.connectGlobalLoraBle && window.connectGlobalLoraBle()"
            class="px-3 py-1.5 rounded-xl bg-white text-slate-950 font-black text-[11px] sm:text-xs hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-1.5 shadow-md cursor-pointer">
            <i class="ph ph-bluetooth text-blue-600 text-sm"></i> Connect BLE
          </button>
          <button type="button" onclick="window.connectGlobalLoraOtg && window.connectGlobalLoraOtg()"
            class="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-white font-black text-[11px] sm:text-xs border border-white/30 active:scale-95 transition-all flex items-center gap-1.5 shadow-md cursor-pointer">
            <i class="ph ph-plugs text-emerald-400 text-sm"></i> Connect OTG
          </button>
          <button type="button" onclick="window.dismissOfflineBanner && window.dismissOfflineBanner()"
            class="w-7 h-7 rounded-full hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
            title="Dismiss notice">
            <i class="ph ph-x text-sm"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- HARDWARE TRANSPORT SELECTOR MODAL (BLE / USB OTG / WI-FI) -->
    <div id="modalLoraHardwarePicker" class="hidden fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-slate-900 text-white rounded-3xl border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Modal Header -->
        <div class="px-5 py-4 bg-slate-950/80 border-b border-white/10 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <i class="ph ph-broadcast text-lg"></i>
            </div>
            <div>
              <h3 class="font-black text-sm text-white">LoRa Hardware Link</h3>
              <p class="text-[10px] text-slate-400">Choose phone transport to ESP32 LoRa Node</p>
            </div>
          </div>
          <button type="button" onclick="window.closeLoraHardwarePicker && window.closeLoraHardwarePicker()" class="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
            <i class="ph ph-x text-sm"></i>
          </button>
        </div>

        <!-- Transport Choices -->
        <div class="p-5 space-y-3">
          <!-- 1. BLE (Bluetooth) -->
          <button type="button" onclick="window.connectGlobalLoraBle && window.connectGlobalLoraBle(); window.closeLoraHardwarePicker();"
            class="w-full text-left p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500/60 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-400/30">
                <i class="ph ph-bluetooth text-xl"></i>
              </div>
              <div>
                <div class="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                  <span>Bluetooth Low Energy (BLE)</span>
                  <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">Wireless</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">Pair with Node 3 RES1 (<code>!f4e213d4</code>). PIN: 123456</p>
              </div>
            </div>
            <i class="ph ph-caret-right text-slate-500 group-hover:text-indigo-400 transition-colors"></i>
          </button>

          <!-- 2. USB OTG Cable -->
          <button type="button" onclick="window.connectGlobalLoraOtg && window.connectGlobalLoraOtg(); window.closeLoraHardwarePicker();"
            class="w-full text-left p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-cyan-500/60 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-400/30">
                <i class="ph ph-plugs text-xl"></i>
              </div>
              <div>
                <div class="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                  <span>USB OTG Cable (Type-C / Micro)</span>
                  <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300">Direct Serial</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">Wired link at 115200 baud for phones plugged into ESP32</p>
              </div>
            </div>
            <i class="ph ph-caret-right text-slate-500 group-hover:text-cyan-400 transition-colors"></i>
          </button>

          <!-- 3. Wi-Fi / LAN -->
          <button type="button" onclick="window.syncWiFiTransport && window.syncWiFiTransport(); window.closeLoraHardwarePicker();"
            class="w-full text-left p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500/60 transition-all flex items-center justify-between group cursor-pointer">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/30">
                <i class="ph ph-wifi-high text-xl"></i>
              </div>
              <div>
                <div class="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                  <span>Wi-Fi / Barangay Hall Server</span>
                  <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">Network</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">Sync via local LAN gateway (<code>192.168.0.100:8080</code>)</p>
              </div>
            </div>
            <i class="ph ph-caret-right text-slate-500 group-hover:text-emerald-400 transition-colors"></i>
          </button>
        </div>

        <div class="px-5 py-3 bg-slate-950/60 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Active Transport: <strong id="modalActiveTransportLabel" class="text-white">Detecting...</strong></span>
          <button type="button" onclick="window.closeLoraHardwarePicker && window.closeLoraHardwarePicker()" class="text-slate-300 hover:text-white font-bold cursor-pointer">Close</button>
        </div>
      </div>
    </div>
    <% } %>

    <!-- CENTRAL NOTIFICATION PANEL DROPDOWN / OVERLAY DRAWER -->"""

    if old_header_end in content:
        content = content.replace(old_header_end, new_header_extras)
        print("Patched offline banner & hardware picker modal in header.ejs")
    else:
        print("Warning: old_header_end not matched in header.ejs")

    # 3. Redesign window.openGlobalEmergencyModal to be minimalist, professional, less text
    old_modal_start = """                        // ---- 5. Full-Screen Emergency Warning Modal ----
                        const currentUserRole = "<%= (locals.user && locals.user.role) ? locals.user.role : (locals.resident ? 'resident' : 'guest') %>";

                        window.openGlobalEmergencyModal = function (data) {"""

    old_modal_end = """                        window.closeGlobalEmergencyModal = function () {
                          window.stopEmergencyAlertSound();
                          const modal = document.getElementById('realtimeEmergencyModal');
                          if (modal) {
                            modal.style.display = 'none';
                          }
                        };"""

    idx_start = content.find(old_modal_start)
    idx_end = content.find(old_modal_end)

    if idx_start != -1 and idx_end != -1:
        target_modal_block = content[idx_start:idx_end + len(old_modal_end)]
        new_modal_code = """                        // ---- 5. Full-Screen Minimalist Emergency Warning Modal ----
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
                          let themeColor = '#ef4444'; // Red
                          let badgeText = 'CRITICAL RED ALERT';
                          let badgeBg = 'rgba(239, 68, 68, 0.18)';
                          let iconClass = 'ph-siren';

                          if (sev === 'ORANGE' || sev === 'WARNING') {
                            themeColor = '#f97316';
                            badgeText = 'ORANGE WARNING';
                            badgeBg = 'rgba(249, 115, 22, 0.18)';
                            iconClass = 'ph-warning-circle';
                          } else if (sev === 'YELLOW') {
                            themeColor = '#eab308';
                            badgeText = 'YELLOW WATCH';
                            badgeBg = 'rgba(234, 179, 8, 0.18)';
                            iconClass = 'ph-warning';
                          } else if (sev === 'GREEN') {
                            themeColor = '#10b981';
                            badgeText = 'ALL CLEAR';
                            badgeBg = 'rgba(16, 185, 129, 0.18)';
                            iconClass = 'ph-check-circle';
                          } else if (sev === 'BLUE') {
                            themeColor = '#3b82f6';
                            badgeText = 'ADVISORY';
                            badgeBg = 'rgba(59, 130, 246, 0.18)';
                            iconClass = 'ph-info';
                          }

                          let modal = document.getElementById('realtimeEmergencyModal');
                          if (!modal) {
                            modal = document.createElement('div');
                            modal.id = 'realtimeEmergencyModal';
                            document.body.appendChild(modal);
                          } else if (modal.parentElement !== document.body) {
                            document.body.appendChild(modal);
                          }

                          modal.style.cssText = 'position: fixed !important; inset: 0px !important; width: 100vw !important; height: 100vh !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important; background: rgba(2, 6, 23, 0.94) !important; backdrop-filter: blur(10px) !important; padding: 16px !important; box-sizing: border-box !important; margin: 0 !important;';

                          const sentTime = data.sent_at ? new Date(data.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                          const evacCenter = data.evacCenter || 'San Rafael Evacuation Center';
                          const targetArea = (data.barangay && data.barangay !== 'all' && data.barangay !== 'ALL') ? data.barangay : 'Barangay San Rafael';
                          const cleanTitle = (data.title || 'Official Emergency Alert').replace(/^[🚨⚠️⚡📢\s]+/, '');
                          const cleanMessage = (data.message || 'Proceed immediately to your designated evacuation center and follow barangay instructions.').trim();

                          modal.innerHTML = `
                            <div style="position: relative; width: 100%; max-width: 440px; background: #080d1a; color: #ffffff; border-radius: 20px; border: 2px solid ${themeColor}; box-shadow: 0 0 35px ${themeColor}33, 0 25px 50px -12px rgba(0,0,0,0.85); overflow: hidden; display: flex; flex-direction: column; font-family: inherit;">
                              
                              <!-- Sleek Top HUD Header -->
                              <div style="padding: 12px 16px; background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                  <span style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 9999px; background: ${badgeBg}; border: 1px solid ${themeColor}; font-size: 11px; font-weight: 900; letter-spacing: 0.05em; color: ${themeColor}; text-transform: uppercase;">
                                    <i class="ph ${iconClass}" style="font-size: 13px;"></i>
                                    <span>${badgeText}</span>
                                  </span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #94a3b8; font-weight: 600;">
                                  <span>📻 LoRa Mesh</span>
                                  <span>•</span>
                                  <span>${sentTime}</span>
                                </div>
                              </div>

                              <!-- Minimalist Alert Content -->
                              <div style="padding: 20px 20px 16px 20px; display: flex; flex-direction: column; gap: 12px;">
                                <!-- Alert Headline -->
                                <h2 style="font-size: 20px; font-weight: 900; line-height: 1.25; margin: 0; color: #ffffff; letter-spacing: -0.01em;">
                                  ${cleanTitle}
                                </h2>

                                <!-- Alert Core Instruction (Clean & High Contrast) -->
                                <div style="font-size: 13.5px; line-height: 1.5; color: #f1f5f9; background: rgba(15, 23, 42, 0.65); padding: 12px 14px; border-radius: 12px; border-left: 3px solid ${themeColor};">
                                  ${cleanMessage}
                                </div>

                                <!-- Shelter & Target Grid (Compact) -->
                                <div style="display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 2px;">
                                  <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 9px 12px; display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                      <i class="ph ph-map-pin" style="font-size: 16px; color: #34d399;"></i>
                                      <span style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Safe Shelter:</span>
                                    </div>
                                    <strong style="font-size: 12.5px; color: #ffffff; font-weight: 800;">${evacCenter}</strong>
                                  </div>

                                  <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 7px 12px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #94a3b8;">
                                    <span>Coverage Area:</span>
                                    <span style="color: #cbd5e1; font-weight: 600;">${targetArea}</span>
                                  </div>
                                </div>
                              </div>

                              <!-- Action Buttons (High Impact, Minimalist) -->
                              <div style="padding: 12px 20px 18px 20px; background: rgba(8, 13, 26, 0.95); border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 8px;">
                                <a href="${(window.Capacitor && window.Capacitor.isNativePlatform()) ? '/resident/evacuation/index.html' : '/resident/evacuation'}?target=${encodeURIComponent(evacCenter)}"
                                   onclick="window.stopEmergencyAlertSound()"
                                   style="width: 100%; padding: 12px 16px; border-radius: 12px; background: #10b981; color: #022c22; font-size: 13px; font-weight: 900; text-decoration: none; text-align: center; text-transform: uppercase; letter-spacing: 0.04em; display: flex; align-items: center; justify-content: center; gap: 7px; box-sizing: border-box; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);">
                                  <i class="ph ph-navigation-arrow" style="font-size: 16px;"></i>
                                  <span>View Safe Evacuation Route</span>
                                </a>
                                <button type="button" onclick="window.closeGlobalEmergencyModal()"
                                        style="width: 100%; padding: 10px 16px; border-radius: 10px; background: rgba(255, 255, 255, 0.07); color: #cbd5e1; font-size: 12px; font-weight: 700; border: 1px solid rgba(255, 255, 255, 0.12); cursor: pointer; text-transform: uppercase; letter-spacing: 0.03em; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                  <i class="ph ph-bell-slash" style="font-size: 14px;"></i>
                                  <span>Acknowledge & Mute Siren</span>
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
                        };"""
        content = content[:idx_start] + new_modal_code + content[idx_end + len(old_modal_end):]
        print("Patched window.openGlobalEmergencyModal with minimalist disaster HUD")
    else:
        print("Warning: openGlobalEmergencyModal block indices not found")

    # 4. Update transport management functions in <script>
    old_status_listener = """                        // Update Top Header LoRa BLE Pill
                        lora.on('status', (st) => {
                          const btn = document.getElementById('btnHeaderLoraBle');
                          const txt = document.getElementById('headerLoraText');
                          if (btn && txt) {
                            if (st.connected) {
                              txt.textContent = `${st.transport}: ${st.deviceName}`;
                              btn.className = 'focus-ring inline-flex items-center gap-1 rounded-full bg-emerald-500 text-slate-950 border border-emerald-300 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer';
                            } else {
                              txt.textContent = 'LoRa 433MHz';
                              btn.className = 'focus-ring inline-flex items-center gap-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2.5 py-1 text-[10px] sm:text-xs font-extrabold shadow-xs transition-all active:scale-95 cursor-pointer';
                            }
                          }
                        });

                        window.connectGlobalLoraBle = async function () {
                          try {
                            const res = await lora.connectBLE();
                            if (typeof window.EvacWarToast === 'function' && res) {
                              window.EvacWarToast(`Connected to 433.875 MHz LoRa Node: ${res.deviceName}`);
                            }
                          } catch (err) {
                            // Fallback to USB Serial if user prefers USB-OTG
                            if (navigator.serial) {
                              try {
                                const uRes = await lora.connectUSBSerial();
                                if (typeof window.EvacWarToast === 'function' && uRes) {
                                  window.EvacWarToast(`Connected via USB-OTG: ${uRes.deviceName}`);
                                }
                                return;
                              } catch (_) {}
                            }
                            alert(err.message || 'Could not pair with LoRa node. Ensure Bluetooth is ON and node !f4e213d4 is powered.');
                          }
                        };
                        window.connectWebLoraBle = window.connectGlobalLoraBle;"""

    new_status_listener = """                        // Dynamic Header Transport Status & Offline Banner Controller
                        window.updateHeaderTransportUI = function (st) {
                          const btn = document.getElementById('btnHeaderLoraBle');
                          const dot = document.getElementById('headerLoraDot');
                          const icon = document.getElementById('headerLoraIcon');
                          const txt = document.getElementById('headerLoraText');
                          const offlineBanner = document.getElementById('offlineLoraWarningBanner');
                          const modalLabel = document.getElementById('modalActiveTransportLabel');

                          const isOnline = navigator.onLine;
                          const hasLoraPeripheral = Boolean(st && st.connected && (st.transport === 'BLE' || st.transport === 'USB_SERIAL'));

                          if (modalLabel) {
                            if (hasLoraPeripheral) {
                              modalLabel.textContent = `${st.transport}: ${st.deviceName || 'Connected'}`;
                            } else if (isOnline) {
                              modalLabel.textContent = 'Wi-Fi / LAN (Barangay Hall)';
                            } else {
                              modalLabel.textContent = 'Offline (Standby)';
                            }
                          }

                          if (btn && txt) {
                            if (hasLoraPeripheral && st.transport === 'BLE') {
                              const shortName = (st.deviceName || 'RES1').split(' ')[0];
                              txt.textContent = `BLE (${shortName})`;
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
                              if (icon) icon.className = 'ph ph-bluetooth text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-indigo-950/90 hover:bg-indigo-900 text-emerald-300 border border-emerald-400/50 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer';
                              btn.title = `Connected via BLE: ${st.deviceName || 'RES1 !f4e213d4'}`;
                            } else if (hasLoraPeripheral && st.transport === 'USB_SERIAL') {
                              txt.textContent = 'USB OTG LINK';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-cyan-400 animate-pulse';
                              if (icon) icon.className = 'ph ph-plugs text-cyan-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-cyan-950/90 hover:bg-cyan-900 text-cyan-300 border border-cyan-400/50 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-sm transition-all active:scale-95 cursor-pointer';
                              btn.title = 'Connected via Type-C/Micro-USB OTG Serial';
                            } else if (isOnline) {
                              txt.textContent = 'WI-FI LINK';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
                              if (icon) icon.className = 'ph ph-wifi-high text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[10px] sm:text-xs font-extrabold shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'Connected to EvakWar Server via Wi-Fi. Tap to switch to LoRa BLE or USB OTG.';
                            } else {
                              txt.textContent = 'OFFLINE (NO LORA)';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
                              if (icon) icon.className = 'ph ph-warning text-amber-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer animate-pulse';
                              btn.title = 'Wi-Fi Offline & No LoRa module linked. Tap to connect BLE or USB OTG.';
                            }
                          }

                          // Offline Banner Visibility: Show when offline and no LoRa module linked
                          if (offlineBanner && !window._offlineBannerDismissed) {
                            if (!isOnline && !hasLoraPeripheral) {
                              offlineBanner.classList.remove('hidden');
                            } else {
                              offlineBanner.classList.add('hidden');
                            }
                          }
                        };

                        lora.on('status', (st) => {
                          window.updateHeaderTransportUI(st);
                        });

                        window.addEventListener('online', () => {
                          window.updateHeaderTransportUI(lora);
                        });

                        window.addEventListener('offline', () => {
                          window.updateHeaderTransportUI(lora);
                        });

                        window.openLoraHardwarePicker = function () {
                          const modal = document.getElementById('modalLoraHardwarePicker');
                          if (modal) {
                            window.updateHeaderTransportUI(lora);
                            modal.classList.remove('hidden');
                          }
                        };

                        window.closeLoraHardwarePicker = function () {
                          const modal = document.getElementById('modalLoraHardwarePicker');
                          if (modal) modal.classList.add('hidden');
                        };

                        window.dismissOfflineBanner = function () {
                          window._offlineBannerDismissed = true;
                          const banner = document.getElementById('offlineLoraWarningBanner');
                          if (banner) banner.classList.add('hidden');
                        };

                        window.connectGlobalLoraBle = async function () {
                          try {
                            const res = await lora.connectBLE();
                            if (typeof window.EvacWarToast === 'function' && res) {
                              window.EvacWarToast(`Connected to LoRa Node via BLE: ${res.deviceName}`);
                            }
                            window.updateHeaderTransportUI(lora);
                          } catch (err) {
                            alert(err.message || 'Could not pair with LoRa node via Bluetooth. Ensure Bluetooth is ON.');
                          }
                        };
                        window.connectWebLoraBle = window.connectGlobalLoraBle;

                        window.connectGlobalLoraOtg = async function () {
                          try {
                            const res = await lora.connectUSBSerial();
                            if (typeof window.EvacWarToast === 'function' && res) {
                              window.EvacWarToast(`Connected via USB OTG Cable: ${res.deviceName}`);
                            } else {
                              alert(`Connected via USB OTG: ${res.deviceName}`);
                            }
                            window.updateHeaderTransportUI(lora);
                          } catch (err) {
                            alert(err.message || 'USB-OTG Serial requires WebSerial support or a connected USB LoRa module.');
                          }
                        };

                        window.syncWiFiTransport = async function () {
                          try {
                            const res = await lora.connectWiFiBridge();
                            if (typeof window.EvacWarToast === 'function' && res) {
                              window.EvacWarToast(`Synced with EvakWar Server: ${res.deviceName}`);
                            }
                            window.updateHeaderTransportUI(lora);
                          } catch (err) {
                            alert(err.message || 'Could not reach Barangay Hall Server.');
                          }
                        };

                        // Initial evaluation
                        if (document.readyState === 'loading') {
                          document.addEventListener('DOMContentLoaded', () => window.updateHeaderTransportUI(lora));
                        } else {
                          window.updateHeaderTransportUI(lora);
                        }"""

    if old_status_listener in content:
        content = content.replace(old_status_listener, new_status_listener)
        print("Patched transport manager & offline listeners in header.ejs")
    else:
        print("Warning: old_status_listener not matched in header.ejs")

    with open(header_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Saved views/partials/header.ejs successfully")

def patch_dashboard():
    dash_path = 'views/resident/dashboard.ejs'
    with open(dash_path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace('\r\n', '\n')

    # Update dashboard LoRa Mesh active strip to include OTG connect button
    old_strip = """              <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button type="button" onclick="window.connectWebLoraBle ? window.connectWebLoraBle() : (window.evakwarLoraClient && window.evakwarLoraClient.connectBLE())"
                  class="px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer">
                  <i class="ph ph-bluetooth"></i> Pair BLE (!f4e213d4)
                </button>
                <a href="/resident/sos" class="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors">
                  <i class="ph ph-siren"></i> LoRa SOS
                </a>
              </div>"""

    new_strip = """              <div class="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                <button type="button" onclick="window.connectGlobalLoraBle ? window.connectGlobalLoraBle() : (window.evakwarLoraClient && window.evakwarLoraClient.connectBLE())"
                  class="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer shadow-xs">
                  <i class="ph ph-bluetooth"></i> BLE (RES1)
                </button>
                <button type="button" onclick="window.connectGlobalLoraOtg ? window.connectGlobalLoraOtg() : (window.evakwarLoraClient && window.evakwarLoraClient.connectUSBSerial())"
                  class="px-2.5 py-1 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors cursor-pointer shadow-xs">
                  <i class="ph ph-plugs"></i> USB OTG
                </button>
                <a href="/resident/sos" class="px-2.5 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors shadow-xs">
                  <i class="ph ph-siren"></i> LoRa SOS
                </a>
              </div>"""

    if old_strip in content:
        content = content.replace(old_strip, new_strip)
        with open(dash_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Patched views/resident/dashboard.ejs successfully")
    else:
        print("Warning: old_strip not matched in views/resident/dashboard.ejs")

if __name__ == '__main__':
    patch_header()
    patch_dashboard()
