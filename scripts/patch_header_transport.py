path = r"views/partials/header.ejs"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update initial button HTML
old_button = """                  <button id="btnHeaderLoraBle" type="button" onclick="window.openLoraHardwarePicker ? window.openLoraHardwarePicker() : (window.connectGlobalLoraBle && window.connectGlobalLoraBle())"
                    class="focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Hardware LoRa Transport Status (Tap to switch BLE / USB OTG / Wi-Fi)">
                    <span id="headerLoraDot" class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <i id="headerLoraIcon" class="ph ph-wifi-high text-xs sm:text-sm text-emerald-400"></i>
                    <span id="headerLoraText" class="truncate max-w-[125px] sm:max-w-[200px]">WI-FI LINK</span>
                  </button>"""

new_button = """                  <button id="btnHeaderLoraBle" type="button" onclick="window.openLoraHardwarePicker ? window.openLoraHardwarePicker() : (window.connectGlobalLoraBle && window.connectGlobalLoraBle())"
                    class="focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[10px] sm:text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                    title="Default connection active (Online). Tap for hardware transport options.">
                    <span id="headerLoraDot" class="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <i id="headerLoraIcon" class="ph ph-wifi-high text-xs sm:text-sm text-emerald-400"></i>
                    <span id="headerLoraText" class="truncate max-w-[125px] sm:max-w-[200px]">ONLINE</span>
                  </button>"""

if old_button in content:
    content = content.replace(old_button, new_button)
    print("Replaced header transport button successfully.")
else:
    print("Warning: old_button not found")

# 2. Update dynamic JS updateHeaderTransportUI
old_js = """                            } else if (isOnline) {
                              txt.textContent = 'LoRa 433MHz (Pair BLE)';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-blue-400';
                              if (icon) icon.className = 'ph ph-broadcast text-blue-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-400/40 px-2.5 py-1 text-[10px] sm:text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'Online. Tap to pair 433.875 MHz LoRa Node via Bluetooth.';"""

new_js = """                            } else if (isOnline) {
                              txt.textContent = 'ONLINE';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
                              if (icon) icon.className = 'ph ph-wifi-high text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 text-[10px] sm:text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'Default connection active (Online). Tap for hardware transport options.';"""

if old_js in content:
    content = content.replace(old_js, new_js)
    print("Replaced updateHeaderTransportUI JS successfully.")
else:
    print("Warning: old_js not found")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated header.ejs successfully.")
