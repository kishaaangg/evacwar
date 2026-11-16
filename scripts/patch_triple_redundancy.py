# -*- coding: utf-8 -*-
"""
Patch views/partials/header.ejs and views/resident/settings.ejs:
1. Ensure the offline banner has a prominent 'Connect LoRa' button opening the 3-option modal.
2. In the 3-option modal:
   - Bluetooth: provides Connect BLE + Open Bluetooth Settings.
   - Wi-Fi: provides Sync Wi-Fi + Open Wi-Fi Settings.
   - USB OTG: opens the step-by-step OTG instructions modal.
3. Add the OTG step-by-step instructions modal with reverse power & phone settings guidance.
4. Add the 'Triple Connection Redundancy (LoRa Hardware Link)' section into views/resident/settings.ejs.
"""

def patch_header():
    header_path = 'views/partials/header.ejs'
    with open(header_path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace('\r\n', '\n')

    # Update Offline Banner & Hardware Link Modal & add OTG instructions modal
    old_banner_start = '<!-- OFFLINE HARDWARE CONNECTION NOTIFICATION BANNER -->'
    old_banner_end = '<!-- CENTRAL NOTIFICATION PANEL DROPDOWN / OVERLAY DRAWER -->'

    idx_start = content.find(old_banner_start)
    idx_end = content.find(old_banner_end)

    if idx_start != -1 and idx_end != -1:
        new_banner_and_modals = """<!-- OFFLINE HARDWARE CONNECTION NOTIFICATION BANNER -->
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
              Cellular/Wi-Fi down. Connect your LoRa Emergency Module (Bluetooth, USB OTG, or Wi-Fi) to receive emergency alerts & send SOS.
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 flex-wrap justify-center">
          <button type="button" onclick="window.openLoraHardwarePicker && window.openLoraHardwarePicker()"
            class="px-3.5 py-1.5 rounded-xl bg-white text-slate-950 font-black text-xs hover:bg-slate-100 active:scale-95 transition-all flex items-center gap-1.5 shadow-md cursor-pointer">
            <i class="ph ph-broadcast text-emerald-600 text-sm"></i> Connect LoRa (3 Options)
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
              <h3 class="font-black text-sm text-white">Triple Connection Redundancy</h3>
              <p class="text-[10px] text-slate-400">Choose phone transport to connect with EvakWar LoRa</p>
            </div>
          </div>
          <button type="button" onclick="window.closeLoraHardwarePicker && window.closeLoraHardwarePicker()" class="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
            <i class="ph ph-x text-sm"></i>
          </button>
        </div>

        <!-- Transport Choices -->
        <div class="p-5 space-y-3">
          <!-- 1. BLE (Bluetooth) -->
          <div class="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 hover:border-indigo-500/60 transition-all flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-400/30">
                  <i class="ph ph-bluetooth text-xl"></i>
                </div>
                <div>
                  <div class="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                    <span>1. Bluetooth Low Energy (BLE)</span>
                    <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300">Primary</span>
                  </div>
                  <p class="text-[11px] text-slate-400 mt-0.5">Wireless link to Node 3 RES1 (<code>!f4e213d4</code>). PIN: 123456</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-white/5">
              <button type="button" onclick="window.connectGlobalLoraBle && window.connectGlobalLoraBle(); window.closeLoraHardwarePicker();"
                class="flex-1 py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer">
                <i class="ph ph-bluetooth"></i> Connect Bluetooth
              </button>
              <button type="button" onclick="window.openAndroidSettings && window.openAndroidSettings('bluetooth')"
                class="py-1.5 px-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Open Phone Bluetooth Settings">
                <i class="ph ph-gear"></i> Settings
              </button>
            </div>
          </div>

          <!-- 2. USB OTG Cable (Type-C / Micro-USB) -->
          <div class="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 hover:border-cyan-500/60 transition-all flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 border border-cyan-400/30">
                  <i class="ph ph-plugs text-xl"></i>
                </div>
                <div>
                  <div class="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                    <span>2. USB-OTG Cable</span>
                    <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300">Wired Fallback</span>
                  </div>
                  <p class="text-[11px] text-slate-400 mt-0.5">Powers dead LoRa node from phone battery + 115200 baud serial.</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-white/5">
              <button type="button" onclick="window.closeLoraHardwarePicker(); window.openLoraOtgInstructions();"
                class="flex-1 py-1.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer">
                <i class="ph ph-book-open"></i> View OTG Guide & Connect
              </button>
            </div>
          </div>

          <!-- 3. Wi-Fi / LAN -->
          <div class="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700 hover:border-emerald-500/60 transition-all flex flex-col gap-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/30">
                  <i class="ph ph-wifi-high text-xl"></i>
                </div>
                <div>
                  <div class="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                    <span>3. Wi-Fi / Local LAN</span>
                    <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">Hall Sync</span>
                  </div>
                  <p class="text-[11px] text-slate-400 mt-0.5">Direct sync at Barangay Hall or Evacuation Center router.</p>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-white/5">
              <button type="button" onclick="window.syncWiFiTransport && window.syncWiFiTransport(); window.closeLoraHardwarePicker();"
                class="flex-1 py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer">
                <i class="ph ph-arrows-clockwise"></i> Sync Wi-Fi
              </button>
              <button type="button" onclick="window.openAndroidSettings && window.openAndroidSettings('wifi')"
                class="py-1.5 px-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs flex items-center gap-1 active:scale-95 transition-all cursor-pointer" title="Open Phone Wi-Fi Settings">
                <i class="ph ph-gear"></i> Settings
              </button>
            </div>
          </div>
        </div>

        <div class="px-5 py-3 bg-slate-950/60 border-t border-white/5 flex items-center justify-between text-[11px] text-slate-400">
          <span>Active: <strong id="modalActiveTransportLabel" class="text-white">Detecting...</strong></span>
          <button type="button" onclick="window.closeLoraHardwarePicker && window.closeLoraHardwarePicker()" class="text-slate-300 hover:text-white font-bold cursor-pointer">Close</button>
        </div>
      </div>
    </div>

    <!-- USB OTG STEP-BY-STEP INSTRUCTIONS MODAL -->
    <div id="modalLoraOtgInstructions" class="hidden fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[210] flex items-center justify-center p-4">
      <div class="w-full max-w-lg bg-slate-900 text-white rounded-3xl border border-cyan-500/40 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <!-- Header -->
        <div class="px-5 py-4 bg-gradient-to-r from-cyan-950 via-slate-900 to-slate-950 border-b border-cyan-500/30 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 text-lg">
              <i class="ph ph-plugs"></i>
            </div>
            <div>
              <h3 class="font-black text-sm sm:text-base text-white">USB-OTG Cable Connection Guide</h3>
              <p class="text-[10px] text-cyan-300">Wired Hardware Backup & Emergency Reverse Phone Power</p>
            </div>
          </div>
          <button type="button" onclick="window.closeLoraOtgInstructions && window.closeLoraOtgInstructions()" class="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
            <i class="ph ph-x text-sm"></i>
          </button>
        </div>

        <!-- Step by Step Body -->
        <div class="p-5 space-y-3.5 text-xs text-slate-300 overflow-y-auto max-h-[72vh]">
          <!-- Step 1 -->
          <div class="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/70">
            <span class="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">1</span>
            <div>
              <h4 class="font-extrabold text-white text-xs sm:text-sm">Plug in the OTG Cable</h4>
              <p class="text-[11px] text-slate-300 mt-0.5">Plug the <strong>Type-C male end</strong> into your Android phone, and the <strong>Micro-USB male end</strong> into the ESP32 LoRa module.</p>
            </div>
          </div>

          <!-- Step 2 (Phone Power) -->
          <div class="flex items-start gap-3 p-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/30">
            <span class="w-6 h-6 rounded-full bg-cyan-400 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">2</span>
            <div>
              <h4 class="font-extrabold text-cyan-200 text-xs sm:text-sm">Reverse Power Sharing (Panel Defense Feature)</h4>
              <p class="text-[11px] text-slate-300 mt-0.5">Your phone automatically powers the ESP32 LoRa module via OTG! The red power LED on the module will illuminate even if the module's 18650 battery is completely dead.</p>
            </div>
          </div>

          <!-- Step 3 (Android OTG toggle) -->
          <div class="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/70">
            <span class="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">3</span>
            <div class="flex-1">
              <h4 class="font-extrabold text-white text-xs sm:text-sm">Enable OTG in Phone Settings (If Required)</h4>
              <p class="text-[11px] text-slate-300 mt-0.5">Brands like Oppo, Vivo, Realme, OnePlus, and Xiaomi require turning on OTG manually:</p>
              <p class="text-[10px] text-cyan-300 mt-1 font-mono">Settings &rarr; System / Additional Settings &rarr; OTG Connection (ON)</p>
              <button type="button" onclick="window.openAndroidSettings && window.openAndroidSettings('otg')" class="mt-2 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-[10px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer">
                <i class="ph ph-gear"></i> Open Phone Settings
              </button>
            </div>
          </div>

          <!-- Step 4 (Connect) -->
          <div class="flex items-start gap-3 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/70">
            <span class="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">4</span>
            <div class="flex-1">
              <h4 class="font-extrabold text-white text-xs sm:text-sm">Initiate Serial Connection</h4>
              <p class="text-[11px] text-slate-300 mt-0.5">Tap the button below. When prompted by Android/Browser, allow access to the USB Serial device (115200 baud).</p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="px-5 py-3.5 bg-slate-950/80 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <button type="button" onclick="window.closeLoraOtgInstructions && window.closeLoraOtgInstructions()" class="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs text-center cursor-pointer">
            Back
          </button>
          <button type="button" onclick="window.connectGlobalLoraOtg && window.connectGlobalLoraOtg(); window.closeLoraOtgInstructions();"
            class="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer">
            <i class="ph ph-plugs text-sm"></i> Connect OTG Cable Now
          </button>
        </div>
      </div>
    </div>
    <% } %>

    """
        content = content[:idx_start] + new_banner_and_modals + content[idx_end:]
        print("Patched header.ejs banner and OTG instruction modals successfully")
    else:
        print("Warning: banner markers not matched in header.ejs")

    # Update helper methods in <script> in header.ejs
    old_script_target = "window.closeLoraHardwarePicker = function () {"
    new_script_extras = """window.openLoraOtgInstructions = function () {
                          const modal = document.getElementById('modalLoraOtgInstructions');
                          if (modal) modal.classList.remove('hidden');
                        };

                        window.closeLoraOtgInstructions = function () {
                          const modal = document.getElementById('modalLoraOtgInstructions');
                          if (modal) modal.classList.add('hidden');
                        };

                        window.openAndroidSettings = function (type) {
                          const isAndroid = /android/i.test(navigator.userAgent) || (window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'android');
                          if (type === 'bluetooth') {
                            if (isAndroid) {
                              try {
                                window.location.href = 'intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end';
                                return;
                              } catch (_) {}
                            }
                            alert('Please swipe down your notification tray and turn ON Bluetooth.');
                          } else if (type === 'wifi') {
                            if (isAndroid) {
                              try {
                                window.location.href = 'intent:#Intent;action=android.settings.WIFI_SETTINGS;end';
                                return;
                              } catch (_) {}
                            }
                            alert('Please swipe down your notification tray and connect to Wi-Fi.');
                          } else if (type === 'otg') {
                            if (isAndroid) {
                              try {
                                window.location.href = 'intent:#Intent;action=android.settings.SETTINGS;end';
                                return;
                              } catch (_) {}
                            }
                            alert('Open phone Settings and search for "OTG" or "OTG Connection" to toggle it ON.');
                          }
                        };

                        window.closeLoraHardwarePicker = function () {"""

    if old_script_target in content:
        content = content.replace(old_script_target, new_script_extras)
        print("Patched openAndroidSettings & OTG modal helpers into header.ejs script")
    else:
        print("Warning: old_script_target not found in header.ejs")

    with open(header_path, 'w', encoding='utf-8') as f:
        f.write(content)


def patch_settings_page():
    settings_path = 'views/resident/settings.ejs'
    with open(settings_path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = content.replace('\r\n', '\n')

    # Add the Triple Connection Redundancy Section right before SECTION: EMERGENCY & PREFERENCES
    old_section_marker = '<!-- 3. SECTION: EMERGENCY & PREFERENCES -->'

    new_redundancy_section = """<!-- 2.5 SECTION: TRIPLE CONNECTION REDUNDANCY (LORA HARDWARE LINK) -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between px-3">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-500 profile-text-muted">
                Triple Connection Redundancy (LoRa Link)
              </h3>
              <span id="settingsActiveTransportBadge" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Detecting...
              </span>
            </div>

            <!-- Redundancy Defense Summary Banner -->
            <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white shadow-sm border border-slate-700/80 space-y-2.5">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-400/30 text-sm">
                  <i class="ph ph-shield-check"></i>
                </div>
                <div>
                  <h4 class="font-black text-xs sm:text-sm text-white">Disaster Panel Defense: Zero Point of Failure</h4>
                  <p class="text-[10px] text-slate-300">If cellular towers are destroyed or phone Bluetooth is off, residents retain 3 layers of connectivity:</p>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span class="text-[9px] font-extrabold uppercase tracking-wider text-indigo-300 block mb-1">1. Primary</span>
                    <strong class="text-white block text-xs">Bluetooth LE (BLE)</strong>
                    <span class="text-[10px] text-slate-300">Wireless link to Node 3 (PIN 123456).</span>
                  </div>
                  <button type="button" onclick="window.connectGlobalLoraBle && window.connectGlobalLoraBle()" class="mt-2 w-full py-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95 cursor-pointer">
                    Pair BLE
                  </button>
                </div>

                <div class="p-2.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex flex-col justify-between">
                  <div>
                    <span class="text-[9px] font-extrabold uppercase tracking-wider text-cyan-300 block mb-1">2. Fallback</span>
                    <strong class="text-cyan-100 block text-xs">USB-OTG Cable</strong>
                    <span class="text-[10px] text-slate-300">Powers dead ESP32 directly from phone battery.</span>
                  </div>
                  <button type="button" onclick="window.openLoraOtgInstructions && window.openLoraOtgInstructions()" class="mt-2 w-full py-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95 cursor-pointer">
                    OTG Guide
                  </button>
                </div>

                <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between">
                  <div>
                    <span class="text-[9px] font-extrabold uppercase tracking-wider text-emerald-300 block mb-1">3. Command Center</span>
                    <strong class="text-white block text-xs">Wi-Fi / Local LAN</strong>
                    <span class="text-[10px] text-slate-300">Direct sync at Hall / Evacuation Center router.</span>
                  </div>
                  <button type="button" onclick="window.syncWiFiTransport && window.syncWiFiTransport()" class="mt-2 w-full py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95 cursor-pointer">
                    Sync Wi-Fi
                  </button>
                </div>
              </div>
            </div>

            <!-- Detail List for Settings -->
            <div class="profile-section-card bg-white rounded-3xl shadow-xs border border-slate-200/90 overflow-hidden divide-y divide-slate-100">
              <!-- Row 1: LoRa Hardware Selector -->
              <button type="button" onclick="window.openLoraHardwarePicker && window.openLoraHardwarePicker()" class="profile-row w-full px-4 sm:px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors group">
                <div class="flex items-center gap-3.5 min-w-0">
                  <div class="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                    <i class="ph ph-broadcast"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-bold text-slate-800 profile-text-dark">LoRa Hardware Link Switcher</div>
                    <div class="text-[11px] text-slate-400 truncate profile-text-muted">Switch active channel: Bluetooth Low Energy, USB OTG, or Wi-Fi</div>
                  </div>
                </div>
                <i class="ph ph-caret-right text-slate-400 group-hover:text-slate-700 text-lg transition-transform group-hover:translate-x-0.5"></i>
              </button>

              <!-- Row 2: USB OTG Cable Instructions & Power Backup -->
              <button type="button" onclick="window.openLoraOtgInstructions && window.openLoraOtgInstructions()" class="profile-row w-full px-4 sm:px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors group">
                <div class="flex items-center gap-3.5 min-w-0">
                  <div class="w-9 h-9 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center text-lg shrink-0 group-hover:scale-105 transition-transform">
                    <i class="ph ph-plugs"></i>
                  </div>
                  <div class="min-w-0">
                    <div class="text-sm font-bold text-slate-800 profile-text-dark">USB-OTG Cable Instructions & Power Sharing</div>
                    <div class="text-[11px] text-slate-400 truncate profile-text-muted">Step-by-step wiring, Android OTG settings, and phone power sharing</div>
                  </div>
                </div>
                <i class="ph ph-caret-right text-slate-400 group-hover:text-slate-700 text-lg transition-transform group-hover:translate-x-0.5"></i>
              </button>

              <!-- Row 3: Android Device Settings Shortcuts -->
              <div class="px-4 sm:px-5 py-3 flex items-center justify-between bg-slate-50/70 text-xs">
                <span class="text-slate-600 font-bold flex items-center gap-1.5">
                  <i class="ph ph-gear text-slate-500"></i> Phone Settings Shortcuts:
                </span>
                <div class="flex items-center gap-1.5">
                  <button type="button" onclick="window.openAndroidSettings && window.openAndroidSettings('bluetooth')" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-extrabold text-[10px] hover:bg-slate-100 active:scale-95 transition-all">
                    Bluetooth
                  </button>
                  <button type="button" onclick="window.openAndroidSettings && window.openAndroidSettings('wifi')" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-extrabold text-[10px] hover:bg-slate-100 active:scale-95 transition-all">
                    Wi-Fi
                  </button>
                  <button type="button" onclick="window.openAndroidSettings && window.openAndroidSettings('otg')" class="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-extrabold text-[10px] hover:bg-slate-100 active:scale-95 transition-all">
                    OTG
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. SECTION: EMERGENCY & PREFERENCES -->"""

    if old_section_marker in content:
        content = content.replace(old_section_marker, new_redundancy_section)
        print("Patched Triple Redundancy section into views/resident/settings.ejs")
    else:
        print("Warning: old_section_marker not matched in views/resident/settings.ejs")

    # Add script hook at the bottom of settings.ejs to update badge in real time
    old_footer_hook = "</body>"
    new_footer_hook = """  <script>
    (function() {
      function syncSettingsTransportBadge() {
        const badge = document.getElementById('settingsActiveTransportBadge');
        if (!badge) return;
        const lora = window.evakwarLoraClient;
        const isOnline = navigator.onLine;
        if (lora && lora.connected) {
          if (lora.transport === 'BLE') {
            badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-300';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span> BLE: ' + (lora.deviceName ? lora.deviceName.split(' ')[0] : 'RES1');
          } else if (lora.transport === 'USB_SERIAL') {
            badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-100 text-cyan-800 border border-cyan-300';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span> USB-OTG CABLE';
          }
        } else if (isOnline) {
          badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> WI-FI ONLINE';
        } else {
          badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 animate-pulse';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> OFFLINE (NO LORA)';
        }
      }

      window.addEventListener('online', syncSettingsTransportBadge);
      window.addEventListener('offline', syncSettingsTransportBadge);
      if (window.evakwarLoraClient && typeof window.evakwarLoraClient.on === 'function') {
        window.evakwarLoraClient.on('status', syncSettingsTransportBadge);
      }
      setTimeout(syncSettingsTransportBadge, 200);
      setTimeout(syncSettingsTransportBadge, 1000);
    })();
  </script>
</body>"""

    if old_footer_hook in content:
        content = content.replace(old_footer_hook, new_footer_hook)
        print("Patched syncSettingsTransportBadge script into views/resident/settings.ejs")
    else:
        # Append before closing html or at end
        content += """\n<script>
    (function() {
      function syncSettingsTransportBadge() {
        const badge = document.getElementById('settingsActiveTransportBadge');
        if (!badge) return;
        const lora = window.evakwarLoraClient;
        const isOnline = navigator.onLine;
        if (lora && lora.connected) {
          if (lora.transport === 'BLE') {
            badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-300';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span> BLE: ' + (lora.deviceName ? lora.deviceName.split(' ')[0] : 'RES1');
          } else if (lora.transport === 'USB_SERIAL') {
            badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-100 text-cyan-800 border border-cyan-300';
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span> USB-OTG CABLE';
          }
        } else if (isOnline) {
          badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> WI-FI ONLINE';
        } else {
          badge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 animate-pulse';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> OFFLINE (NO LORA)';
        }
      }

      window.addEventListener('online', syncSettingsTransportBadge);
      window.addEventListener('offline', syncSettingsTransportBadge);
      if (window.evakwarLoraClient && typeof window.evakwarLoraClient.on === 'function') {
        window.evakwarLoraClient.on('status', syncSettingsTransportBadge);
      }
      setTimeout(syncSettingsTransportBadge, 200);
      setTimeout(syncSettingsTransportBadge, 1000);
    })();
  </script>"""

    with open(settings_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Saved views/resident/settings.ejs successfully")

if __name__ == '__main__':
    patch_header()
    patch_settings_page()
