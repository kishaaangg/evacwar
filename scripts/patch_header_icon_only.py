path = r"views/partials/header.ejs"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update button to be icon-only
old_btn = """                  <!-- Hardware Transport Status Indicator (BLE / USB OTG / WI-FI / DISCONNECTED) -->
                  <% if (user.role === 'resident' || user.role === 'rescuer' || user.role === 'staff') { %>
                  <button id="btnHeaderLoraBle" type="button" onclick="window.openLoraHardwarePicker ? window.openLoraHardwarePicker() : (window.connectGlobalLoraBle && window.connectGlobalLoraBle())"
                    class="focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[10px] sm:text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Default connection active (Online). Tap for hardware transport options.">
                    <span id="headerLoraDot" class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <i id="headerLoraIcon" class="ph ph-wifi-high text-xs sm:text-sm text-emerald-400"></i>
                    <span id="headerLoraText" class="truncate max-w-[125px] sm:max-w-[200px]">ONLINE</span>
                  </button>
                  <% } %>"""

new_btn = """                  <!-- Hardware Transport Status Indicator (Icon Only) -->
                  <% if (user.role === 'resident' || user.role === 'rescuer' || user.role === 'staff') { %>
                  <button id="btnHeaderLoraBle" type="button" onclick="window.openLoraHardwarePicker ? window.openLoraHardwarePicker() : (window.connectGlobalLoraBle && window.connectGlobalLoraBle())"
                    class="focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white/10 hover:bg-white/20 text-emerald-300 border border-emerald-500/30 shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Online (Internet Connection). Tap for LoRa options.">
                    <i id="headerLoraIcon" class="ph ph-wifi-high text-base sm:text-lg text-emerald-400"></i>
                    <span id="headerLoraDot" class="hidden"></span>
                    <span id="headerLoraText" class="hidden">ONLINE</span>
                  </button>
                  <% } %>"""

if old_btn in content:
    content = content.replace(old_btn, new_btn)
    print("Replaced header transport button with icon-only successfully.")
else:
    old_btn_crlf = old_btn.replace('\n', '\r\n')
    if old_btn_crlf in content:
        content = content.replace(old_btn_crlf, new_btn.replace('\n', '\r\n'))
        print("Replaced header transport button with icon-only (CRLF) successfully.")
    else:
        print("Warning: old_btn not found!")

# 2. Add top offline notification banner right after </header>
old_header_end = "</header>"
new_header_end = """</header>

    <!-- TOP OFFLINE EMERGENCY NOTIFICATION BANNER (WITH CONNECT TO LORA BUTTON) -->
    <div id="offlineLoraNotificationBanner" class="hidden w-full bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 text-amber-200 border-b border-amber-500/40 px-3 sm:px-4 py-2.5 transition-all shadow-md z-40">
      <div class="max-w-6xl mx-auto flex items-center justify-between gap-2.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="flex h-2.5 w-2.5 relative shrink-0">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          <div class="text-xs sm:text-sm font-semibold truncate">
            <span class="font-bold text-amber-300">You are offline.</span>
            <span class="hidden xs:inline text-amber-200/90 ml-1">Connect to LoRa to send emergency alerts & passes.</span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button type="button" onclick="window.openLoraHardwarePicker ? window.openLoraHardwarePicker() : (window.connectGlobalLoraBle && window.connectGlobalLoraBle())"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-xs active:scale-95 transition-all cursor-pointer">
            <i class="ph ph-broadcast text-sm"></i>
            <span>Connect to LoRa</span>
          </button>
          <button type="button" onclick="window.dismissOfflineLoraBanner()" class="text-amber-400/80 hover:text-white text-base p-1 active:scale-90 transition-transform cursor-pointer" title="Dismiss">
            <i class="ph ph-x"></i>
          </button>
        </div>
      </div>
    </div>"""

# Only replace the first occurrence of </header>
if old_header_end in content and "id=\"offlineLoraNotificationBanner\"" not in content:
    content = content.replace(old_header_end, new_header_end, 1)
    print("Added offlineLoraNotificationBanner after header.")

# 3. Update updateHeaderTransportUI
old_ui_func = """                        // Dynamic Header Transport Status & Offline Banner Controller
                        window.updateHeaderTransportUI = function (st) {
                          const btn = document.getElementById('btnHeaderLoraBle');
                          const dot = document.getElementById('headerLoraDot');
                          const icon = document.getElementById('headerLoraIcon');
                          const txt = document.getElementById('headerLoraText');
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
                              txt.textContent = 'ONLINE';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
                              if (icon) icon.className = 'ph ph-wifi-high text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[10px] sm:text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'Default connection active (Online). Tap for hardware transport options.';
                            } else {
                              txt.textContent = 'OFFLINE (NO LORA)';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
                              if (icon) icon.className = 'ph ph-warning text-amber-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer animate-pulse';
                              btn.title = 'Network Offline & No LoRa module linked. Tap to connect BLE or USB OTG.';
                            }
                          }
                        };"""

new_ui_func = """                        // Dynamic Header Transport Status (Icon-Only) & Top Offline Banner Controller
                        window.dismissOfflineLoraBanner = function () {
                          window._offlineBannerDismissed = true;
                          const banner = document.getElementById('offlineLoraNotificationBanner');
                          if (banner) banner.classList.add('hidden');
                        };

                        window.updateHeaderTransportUI = function (st) {
                          const btn = document.getElementById('btnHeaderLoraBle');
                          const icon = document.getElementById('headerLoraIcon');
                          const dot = document.getElementById('headerLoraDot');
                          const txt = document.getElementById('headerLoraText');
                          const modalLabel = document.getElementById('modalActiveTransportLabel');

                          const isOnline = navigator.onLine;
                          const hasLoraPeripheral = Boolean(st && st.connected && (st.transport === 'BLE' || st.transport === 'USB_SERIAL' || st.transport === 'ESP_WIFI'));

                          if (modalLabel) {
                            if (hasLoraPeripheral) {
                              modalLabel.textContent = `${st.transport}: ${st.deviceName || 'Connected'}`;
                            } else if (isOnline) {
                              modalLabel.textContent = 'Wi-Fi / Internet (Online)';
                            } else {
                              modalLabel.textContent = 'Offline (No Connection)';
                            }
                          }

                          // 1. Icon-only button states in header (clean, compact circular button)
                          if (btn && icon) {
                            if (hasLoraPeripheral && st.transport === 'BLE') {
                              const shortName = (st.deviceName || 'RES1').split(' ')[0];
                              icon.className = 'ph ph-bluetooth text-base sm:text-lg text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-indigo-950 hover:bg-indigo-900 text-emerald-300 border border-emerald-400/50 shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = `LoRa BLE Connected: ${shortName}`;
                              if (txt) txt.textContent = 'BLE';
                            } else if (hasLoraPeripheral && st.transport === 'USB_SERIAL') {
                              icon.className = 'ph ph-plugs text-base sm:text-lg text-cyan-400';
                              btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-400/50 shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'LoRa USB OTG Connected';
                              if (txt) txt.textContent = 'USB OTG';
                            } else if (hasLoraPeripheral && st.transport === 'ESP_WIFI') {
                              icon.className = 'ph ph-broadcast text-base sm:text-lg text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-400/50 shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'ESP Wi-Fi LoRa Connected';
                              if (txt) txt.textContent = 'ESP WIFI';
                            } else if (isOnline) {
                              icon.className = 'ph ph-wifi-high text-base sm:text-lg text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white/10 hover:bg-white/20 text-emerald-300 border border-emerald-500/30 shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'Online (Internet Connection). Tap for LoRa options.';
                              if (txt) txt.textContent = 'ONLINE';
                            } else {
                              icon.className = 'ph ph-warning text-base sm:text-lg text-amber-400 animate-pulse';
                              btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 shadow-xs transition-all active:scale-95 cursor-pointer animate-pulse';
                              btn.title = 'Offline (No LoRa linked). Tap to connect LoRa.';
                              if (txt) txt.textContent = 'OFFLINE (NO LORA)';
                            }
                          }

                          // 2. Top Offline Emergency Notification Banner with "Connect to LoRa" button
                          const banner = document.getElementById('offlineLoraNotificationBanner');
                          if (banner) {
                            if (!isOnline && !hasLoraPeripheral && !window._offlineBannerDismissed) {
                              banner.classList.remove('hidden');
                            } else {
                              banner.classList.add('hidden');
                            }
                          }
                        };"""

if old_ui_func in content:
    content = content.replace(old_ui_func, new_ui_func)
    print("Replaced updateHeaderTransportUI successfully.")
else:
    old_ui_crlf = old_ui_func.replace('\n', '\r\n')
    if old_ui_crlf in content:
        content = content.replace(old_ui_crlf, new_ui_func.replace('\n', '\r\n'))
        print("Replaced updateHeaderTransportUI (CRLF) successfully.")
    else:
        print("Warning: old_ui_func not found!")

# Reset banner dismissal on re-gaining internet
old_online_ev = "window.addEventListener('online', () => {\n                          window.updateHeaderTransportUI(lora);\n                        });"
new_online_ev = """window.addEventListener('online', () => {
                          window._offlineBannerDismissed = false;
                          window.updateHeaderTransportUI(lora);
                        });"""

if old_online_ev in content:
    content = content.replace(old_online_ev, new_online_ev)
else:
    old_online_crlf = old_online_ev.replace('\n', '\r\n')
    if old_online_crlf in content:
        content = content.replace(old_online_crlf, new_online_ev.replace('\n', '\r\n'))

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated header.ejs successfully.")
