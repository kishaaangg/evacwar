import re

with open('views/admin/broadcast.ejs', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Page Header Title & Subtitle
c = c.replace(
    '<h1 class="text-lg sm:text-xl font-black text-slate-900 tracking-tight">SMS Broadcast</h1>',
    '<h1 class="text-lg sm:text-xl font-black text-slate-900 tracking-tight">433.875 MHz LoRa Mesh Emergency Broadcast</h1>'
)
c = c.replace(
    'Dispatch urgent emergency notifications and safety advisories directly to registered residents via cellular SMS.',
    'Dispatch urgent disaster warnings directly across our 433.875 MHz LoRa Mesh network (Hall !d88b1a58 -> Rel1 !0f778ab0 -> Res1 !f4e213d4) without internet or cellular SMS dependency.'
)

# 2. Gateway Status Badge
c = c.replace(
    '<i class="ph ph-cell-tower text-xs"></i> iProgSMS Active',
    '<i class="ph ph-broadcast text-xs"></i> 433.875 MHz Mesh Active'
)
c = c.replace(
    '<div class="text-[9px] text-slate-400 font-mono leading-none">iprogsms.com/api/v1</div>',
    '<div class="text-[9px] text-slate-400 font-mono leading-none">Gateway COM3 (!d88b1a58) | EU_433</div>'
)

# 3. Card Title & Subtitle
c = c.replace(
    '<i class="ph ph-paper-plane-tilt text-blue-600 text-lg" id="headerIcon"></i> Emergency SMS Broadcaster',
    '<i class="ph ph-broadcast text-blue-600 text-lg" id="headerIcon"></i> Emergency LoRa Mesh Broadcaster'
)
c = c.replace(
    '<span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">iProgSMS Engine</span>',
    '<span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">433.875 MHz RF Engine</span>'
)

# 4. Target Card Header & Est Credits -> Mesh Nodes
c = c.replace(
    '<i class="ph ph-cell-tower text-xs text-blue-400"></i> iProgSMS Delivery & Audience Target',
    '<i class="ph ph-broadcast text-xs text-blue-400"></i> 433.875 MHz LoRa Mesh Broadcast Reach'
)
c = c.replace(
    '<div class="text-[9px] uppercase font-bold text-slate-400">Est. Credits</div>',
    '<div class="text-[9px] uppercase font-bold text-slate-400">Active Mesh Nodes</div>'
)
c = c.replace(
    '0 Credits\n                        </div>',
    '3 Nodes (Hall/Rel/Res)\n                        </div>'
)

# 5. Message Content Textarea
c = c.replace(
    '4. SMS Text Message Content *',
    '4. LoRa Mesh Alert Message * (Max 95 chars for optimal RF mesh transmission)'
)
c = c.replace(
    'placeholder="Type your emergency alert text message here... (Note: iProgSMS provides the official sender header automatically)"',
    'placeholder="Type emergency alert message here... (Encoded as EVW|ALT|<id>|<severity>|<zone>|<title>|<evacCenter>|<message> over 433.875 MHz RF)"'
)

# 6. Action Button
c = c.replace(
    '<i class="ph ph-paper-plane-tilt text-base"></i> Dispatch via iProgSMS',
    '<i class="ph ph-broadcast text-base"></i> Broadcast via 433.875 MHz LoRa Mesh'
)
c = c.replace(
    'submitBtn.innerHTML = \'<i class="ph ph-circle-notch animate-spin text-base"></i> Dispatching via iProgSMS...\';',
    'submitBtn.innerHTML = \'<i class="ph ph-circle-notch animate-spin text-base"></i> Broadcasting over 433.875 MHz LoRa Mesh...\';'
)

# 7. Phone Preview
c = c.replace(
    'Resident Phone Live SMS Preview',
    'Resident Phone Live LoRa Warning Preview'
)
c = c.replace(
    "<%= isBarangayCouncil ? 'Barangay ' + userBarangay : 'iProgSMS Gateway' %>",
    "<%= isBarangayCouncil ? 'Barangay ' + userBarangay + ' (LoRa Mesh)' : '433.875 MHz LoRa Mesh Gateway' %>"
)

# 8. Guidelines
c = c.replace(
    '<i class="ph ph-book-open text-blue-600 text-base"></i> iProgSMS Guidelines & Specifications',
    '<i class="ph ph-broadcast text-blue-600 text-base"></i> 433.875 MHz LoRa Mesh Alerting Protocol (`EVW|ALT|...`)'
)

# Replace confirmation modal text
c = c.replace(
    'Confirm & Dispatch SMS',
    'Confirm & Broadcast via 433.875 MHz LoRa Mesh'
)

with open('views/admin/broadcast.ejs', 'w', encoding='utf-8') as f:
    f.write(c)

print("Updated views/admin/broadcast.ejs successfully!")
