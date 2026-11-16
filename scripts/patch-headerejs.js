const fs = require('fs');
const filePath = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/header.ejs';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Line 2282: allow admin to render btnHeaderLoraBle
const targetRoleCheck = "<% if (user.role === 'resident' || user.role === 'rescuer' || user.role === 'staff') { %>";
const newRoleCheck = "<% if (user && (user.role === 'resident' || user.role === 'rescuer' || user.role === 'staff' || user.role === 'admin')) { %>";
if (content.includes(targetRoleCheck)) {
  content = content.replace(targetRoleCheck, newRoleCheck);
  console.log('Updated line 2282 for btnHeaderLoraBle role check.');
} else {
  console.log('Line 2282 already patched or not matched.');
}

// 2. Line 2354: allow admin to render modalLoraHardwarePicker
const targetModalCheck = '<% if (user && user.role !== "admin") { %>';
const targetModalCheckSingle = "<% if (user && user.role !== 'admin') { %>";
const newModalCheck = '<% if (user) { %>';
if (content.includes(targetModalCheck)) {
  content = content.replace(targetModalCheck, newModalCheck);
  console.log('Updated line 2354 modal check (double quotes).');
} else if (content.includes(targetModalCheckSingle)) {
  content = content.replace(targetModalCheckSingle, newModalCheck);
  console.log('Updated line 2354 modal check (single quotes).');
}

// 3. Update onIncomingChat(msg) to trigger AndroidBleBridge.showChatNotification
const targetOnIncomingChat = `      function onIncomingChat(msg) {
        if (!msg) return;
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/chat')) return;

        // Skip self-sent messages
        var myName = '';
        try {
          myName = (localStorage.getItem('evw_user_full_name') || '').toLowerCase().trim();
        } catch (_) {}
        var sName = String(msg.senderName || '').toLowerCase().trim();
        if (myName && sName && (sName === myName || sName.includes(myName) || myName.includes(sName))) {
          return;
        }

        try { localStorage.setItem('evw_chat_has_unread', 'true'); } catch (_) {}
        updateChatDots();
      }`;

const newOnIncomingChat = `      function onIncomingChat(msg) {
        if (!msg) return;
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/chat')) return;

        // Skip self-sent messages
        var myName = '';
        try {
          myName = (localStorage.getItem('evw_user_full_name') || '').toLowerCase().trim();
        } catch (_) {}
        var sName = String(msg.senderName || '').toLowerCase().trim();
        if (myName && sName && (sName === myName || sName.includes(myName) || myName.includes(sName))) {
          return;
        }

        try { localStorage.setItem('evw_chat_has_unread', 'true'); } catch (_) {}
        updateChatDots();

        // Native Android notification trigger (Wi-Fi / LAN or LoRa)
        if (window.AndroidBleBridge && typeof window.AndroidBleBridge.showChatNotification === 'function') {
          try {
            window.AndroidBleBridge.showChatNotification(
              String(msg.msgId || msg.id || ''),
              String(msg.senderRole || 'Resident'),
              String(msg.senderName || 'Member'),
              String(msg.text || msg.message || '')
            );
          } catch (_) {}
        }
      }`;

const normContent = content.replace(/\r\n/g, '\n');
const normTarget = targetOnIncomingChat.replace(/\r\n/g, '\n');
const normNew = newOnIncomingChat.replace(/\r\n/g, '\n');

if (normContent.includes(normTarget)) {
  content = normContent.replace(normTarget, normNew);
  console.log('Successfully updated onIncomingChat with AndroidBleBridge.showChatNotification!');
} else {
  console.warn('targetOnIncomingChat not matched directly, inspecting...');
}

// 4. Update window.updateHeaderTransportUI to handle Admin with /api/lora/status
const oldUpdateStart = '                        window.updateHeaderTransportUI = function (st) {';
const oldUpdateEnd = '                        lora.on(\'status\', (st) => {';

const startIdx = content.indexOf(oldUpdateStart);
const endIdx = content.indexOf(oldUpdateEnd);

if (startIdx !== -1 && endIdx !== -1) {
  const newUpdateCode = `                        const currentUserRole = '<%= (typeof user !== "undefined" && user && user.role) ? user.role : "" %>';

                        window.updateHeaderTransportUI = function (st) {
                          const btn = document.getElementById('btnHeaderLoraBle');
                          const icon = document.getElementById('headerLoraIcon');
                          const dot = document.getElementById('headerLoraDot');
                          const txt = document.getElementById('headerLoraText');
                          const modalLabel = document.getElementById('modalActiveTransportLabel');
                          const banner = document.getElementById('offlineLoraNotificationBanner');
                          const isOnline = Boolean(navigator.onLine);

                          // A. Admin PC Gateway Check (USB Serial / COM3)
                          if (currentUserRole === 'admin') {
                            fetch('/api/lora/status')
                              .then(r => r.json())
                              .then(data => {
                                const gwConnected = Boolean(data && data.gateway && data.gateway.connected);
                                window._adminGatewayConnected = gwConnected;
                                if (modalLabel) {
                                  if (gwConnected && isOnline) {
                                    modalLabel.textContent = 'Wi-Fi (Online) + LoRa Gateway (COM3)';
                                  } else if (gwConnected) {
                                    modalLabel.textContent = 'LoRa Gateway COM3 (Wi-Fi Offline)';
                                  } else if (isOnline) {
                                    modalLabel.textContent = 'Wi-Fi / Internet (Online)';
                                  } else {
                                    modalLabel.textContent = 'Offline (No Connection)';
                                  }
                                }
                                if (btn && icon) {
                                  if (isOnline) {
                                    icon.className = 'ph ph-wifi-high text-base sm:text-lg text-emerald-400';
                                    btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-white/10 hover:bg-white/20 text-emerald-300 border border-emerald-500/30 shadow-xs transition-all active:scale-95 cursor-pointer';
                                    btn.title = gwConnected ? 'Online (Wi-Fi) • ESP LoRa Gateway Active (COM3)' : 'Online (Wi-Fi / Internet)';
                                    if (txt) txt.textContent = 'ONLINE';
                                  } else if (gwConnected) {
                                    icon.className = 'ph ph-plugs text-base sm:text-lg text-cyan-400';
                                    btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-400/50 shadow-xs transition-all active:scale-95 cursor-pointer';
                                    btn.title = 'LoRa Gateway Active (COM3) • Wi-Fi Offline';
                                    if (txt) txt.textContent = 'USB COM3';
                                  } else {
                                    icon.className = 'ph ph-warning text-base sm:text-lg text-amber-400 animate-pulse';
                                    btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 shadow-xs transition-all active:scale-95 cursor-pointer animate-pulse';
                                    btn.title = 'Offline (No Internet & No LoRa Gateway). Plug ESP LoRa via USB.';
                                    if (txt) txt.textContent = 'OFFLINE (NO LORA)';
                                  }
                                }
                                if (banner) {
                                  if (!isOnline && !gwConnected && !window._offlineBannerDismissed) {
                                    banner.classList.remove('hidden');
                                  } else {
                                    banner.classList.add('hidden');
                                  }
                                }
                              })
                              .catch(() => {});
                            return;
                          }

                          // B. Resident / Rescuer / Staff Mobile UI
                          const hasLoraPeripheral = Boolean(st && st.connected && (st.transport === 'BLE' || st.transport === 'USB_SERIAL' || st.transport === 'ESP_WIFI'));

                          if (modalLabel) {
                            if (hasLoraPeripheral) {
                              modalLabel.textContent = \`\${st.transport}: \${st.deviceName || 'Connected'}\`;
                            } else if (isOnline) {
                              modalLabel.textContent = 'Wi-Fi / Internet (Online)';
                            } else {
                              modalLabel.textContent = 'Offline (No Connection)';
                            }
                          }

                          if (btn && icon) {
                            if (hasLoraPeripheral && st.transport === 'BLE') {
                              const shortName = (st.deviceName || 'RES1').split(' ')[0];
                              icon.className = 'ph ph-bluetooth text-base sm:text-lg text-emerald-400';
                              btn.className = 'focus-ring inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-indigo-950 hover:bg-indigo-900 text-emerald-300 border border-emerald-400/50 shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = \`LoRa BLE Connected: \${shortName}\`;
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

                          if (banner) {
                            if (!isOnline && !hasLoraPeripheral && !window._offlineBannerDismissed) {
                              banner.classList.remove('hidden');
                            } else {
                              banner.classList.add('hidden');
                            }
                          }
                        };

                        if (currentUserRole === 'admin') {
                          window.updateHeaderTransportUI();
                          setInterval(() => { window.updateHeaderTransportUI(); }, 5000);
                        }

`;
  content = content.slice(0, startIdx) + newUpdateCode + content.slice(endIdx);
  console.log('Successfully updated updateHeaderTransportUI for Admin and Mobile!');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved changes to header.ejs!');
