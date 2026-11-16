import os

path = r"views/resident/dashboard.ejs"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove floating buttons between hero and alert banner
target_buttons = """            <!-- SYSTEM ALERT BANNER -->
              <div class="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
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
              </div>
            </div>"""

if target_buttons in content:
    content = content.replace(target_buttons, "            <!-- SYSTEM ALERT BANNER -->")
    print("Replaced target_buttons successfully.")
else:
    print("target_buttons not matched, checking alternate...")

# 2. Fix class on residentUserGreetingName
old_greeting = '<span id="residentUserGreetingName" class="resident-name-display"><%= userFirstName %></span>'
new_greeting = '<span id="residentUserGreetingName" class="resident-first-name-display"><%= userFirstName %></span>'
if old_greeting in content:
    content = content.replace(old_greeting, new_greeting)
    print("Replaced greeting class successfully.")

# 3. Add resident-avatar-initial class to avatar initial span
old_avatar = '<span class="w-full h-full flex items-center justify-center font-black text-sm text-white">\n                          <%= userInitial %>\n                        </span>'
new_avatar = '<span id="residentUserAvatarInitial" class="resident-avatar-initial w-full h-full flex items-center justify-center font-black text-sm text-white">\n                          <%= userInitial %>\n                        </span>'
if old_avatar in content:
    content = content.replace(old_avatar, new_avatar)
    print("Replaced avatar initial span successfully.")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated dashboard.ejs successfully.")
