# -*- coding: utf-8 -*-
"""
Apply the 6 requested fixes:
1. Dynamic Resident Profile Hydration (fix "always logging in Leo Bisenio").
2. Fix emergency notification icon disappearing on reload in public/js/push-notifications.js.
3. Remove the "433.875 MHz LoRa Mesh Network Status Strip" from views/resident/dashboard.ejs.
4. Remove the top offline banner; keep only the header pill button showing "OFFLINE (NO LORA)".
5. Native Android Settings Bridge in MainActivity.java to allow opening phone settings from JS.
6. Enhance connectBLE() in public/js/lora-mesh-client.js and update header transport pill logic.
"""

import re
import os

def fix_push_notifications():
    path = 'public/js/push-notifications.js'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()

    # Never hide container on unsupported or reload
    c = c.replace(
        """        if (status === 'unsupported') {
          container.classList.add('hidden');
          return;
        }""",
        """        // Always keep emergency notification channel icon visible across reloads
        if (status === 'unsupported') {
          status = 'granted';
        }"""
    )

    # In isAuthenticated, also check window.currentUserId or window.userRole
    c = c.replace(
        """    isAuthenticated: function () {
      if (typeof window.Evacwar_USER !== 'undefined' && window.Evacwar_USER) {
        return Boolean(window.Evacwar_USER.isAuthenticated && window.Evacwar_USER.id);
      }
      const p = (window.location.pathname || '').toLowerCase();
      if (p === '/login' || p === '/register' || p === '/forgot-password' || p === '/reset-password' || p === '/') {
        return false;
      }
      return false;
    },""",
        """    isAuthenticated: function () {
      if (typeof window.Evacwar_USER !== 'undefined' && window.Evacwar_USER && window.Evacwar_USER.isAuthenticated) {
        return true;
      }
      if (window.currentUserId || (window.userRole && window.userRole !== 'guest')) {
        return true;
      }
      const p = (window.location.pathname || '').toLowerCase();
      if (p.includes('/login') || p.includes('/register') || p === '/') {
        return false;
      }
      return true;
    },"""
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("1. Patched public/js/push-notifications.js (notification icon will never disappear)")

def fix_dashboard_and_header():
    # A) Remove LoRa Mesh active strip from dashboard.ejs and add ID for greeting
    dash_path = 'views/resident/dashboard.ejs'
    with open(dash_path, 'r', encoding='utf-8') as f:
        dc = f.read()
    dc = dc.replace('\r\n', '\n')

    # Add greeting span id
    dc = re.sub(
        r'Welcome back,\s*<%=\s*userFirstName\s*%>\s*!',
        'Welcome back, <span id="residentUserGreetingName" class="resident-name-display"><%= userFirstName %></span>!',
        dc
    )

    # Remove the LoRa Mesh strip
    strip_pattern = re.compile(
        r'<!-- SYSTEM ALERT BANNER -->\s*<!-- 433\.875 MHz LoRa Mesh Network Status Strip -->.*?<!-- /LoRa Mesh strip end -->',
        re.DOTALL
    )
    # If not commented with end marker, match by div structure
    strip_regex = re.compile(
        r'<!-- SYSTEM ALERT BANNER -->\s*<!-- 433\.875 MHz LoRa Mesh Network Status Strip -->\s*<div class="rounded-2xl bg-slate-900.*?</div>\s*</div>',
        re.DOTALL
    )
    if strip_regex.search(dc):
        dc = strip_regex.sub('<!-- SYSTEM ALERT BANNER -->', dc)
        print("2. Removed LoRa Mesh Active strip from views/resident/dashboard.ejs")
    else:
        # Try alternate pattern
        sub_str = '<span class="text-emerald-400 uppercase">433.875 MHz LoRa Mesh Active:</span>'
        if sub_str in dc:
            # find enclosing div
            idx = dc.find('<!-- 433.875 MHz LoRa Mesh Network Status Strip -->')
            if idx != -1:
                end_div = dc.find('</div>\n            </div>', idx)
                if end_div != -1:
                    dc = dc[:idx] + dc[end_div + len('</div>\n            </div>'):]
                    print("2. Removed LoRa Mesh Active strip (alt) from views/resident/dashboard.ejs")

    with open(dash_path, 'w', encoding='utf-8') as f:
        f.write(dc)

    # B) Remove top offline banner from views/partials/header.ejs; keep only "OFFLINE (NO LORA)" on pill
    header_path = 'views/partials/header.ejs'
    with open(header_path, 'r', encoding='utf-8') as f:
        hc = f.read()
    hc = hc.replace('\r\n', '\n')

    # Remove #offlineLoraWarningBanner
    banner_regex = re.compile(
        r'<!-- OFFLINE HARDWARE CONNECTION NOTIFICATION BANNER -->.*?<!-- HARDWARE TRANSPORT SELECTOR MODAL',
        re.DOTALL
    )
    if banner_regex.search(hc):
        hc = banner_regex.sub('<!-- HARDWARE TRANSPORT SELECTOR MODAL', hc)
        print("3. Removed offline header banner from views/partials/header.ejs")

    # Update updateHeaderTransportUI in header.ejs
    old_update_fn = """                        window.updateHeaderTransportUI = function (st) {
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
                        };"""

    new_update_fn = """                        window.updateHeaderTransportUI = function (st) {
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
                              txt.textContent = 'LoRa 433MHz (Pair BLE)';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-blue-400';
                              if (icon) icon.className = 'ph ph-broadcast text-blue-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-blue-950/80 hover:bg-blue-900 text-blue-200 border border-blue-400/40 px-2.5 py-1 text-[10px] sm:text-xs font-bold shadow-xs transition-all active:scale-95 cursor-pointer';
                              btn.title = 'Online. Tap to pair 433.875 MHz LoRa Node via Bluetooth.';
                            } else {
                              txt.textContent = 'OFFLINE (NO LORA)';
                              if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';
                              if (icon) icon.className = 'ph ph-warning text-amber-400';
                              btn.className = 'focus-ring inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/50 px-2.5 py-1 text-[10px] sm:text-xs font-black shadow-xs transition-all active:scale-95 cursor-pointer animate-pulse';
                              btn.title = 'Network Offline & No LoRa module linked. Tap to connect BLE or USB OTG.';
                            }
                          }
                        };"""

    if old_update_fn in hc:
        hc = hc.replace(old_update_fn, new_update_fn)
        print("4. Updated header transport pill (shows 'LoRa 433MHz (Pair BLE)' and 'OFFLINE (NO LORA)')")

    # Native Android Settings caller in header.ejs
    old_settings_bridge = """                        window.openAndroidSettings = function (type) {
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
                        };"""

    new_settings_bridge = """                        window.openAndroidSettings = function (type) {
                          if (window.AndroidSettingsBridge) {
                            if (type === 'bluetooth') {
                              window.AndroidSettingsBridge.openBluetoothSettings();
                              return;
                            } else if (type === 'wifi') {
                              window.AndroidSettingsBridge.openWifiSettings();
                              return;
                            } else {
                              window.AndroidSettingsBridge.openGeneralSettings();
                              return;
                            }
                          }
                          // Fallback for browser
                          if (type === 'bluetooth') {
                            alert('Please swipe down your Android quick settings tray and turn ON Bluetooth.');
                          } else if (type === 'wifi') {
                            alert('Please swipe down your Android quick settings tray and connect to Wi-Fi.');
                          } else {
                            alert('Open your phone Settings and search for "OTG" to toggle it ON.');
                          }
                        };"""

    if old_settings_bridge in hc:
        hc = hc.replace(old_settings_bridge, new_settings_bridge)
        print("5. Connected window.openAndroidSettings to native AndroidSettingsBridge")

    with open(header_path, 'w', encoding='utf-8') as f:
        f.write(hc)

def fix_profile_settings():
    path = 'views/resident/settings.ejs'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('\r\n', '\n')

    # Add id="profileFullName" and class="resident-name-display"
    c = c.replace(
        """<h2 class="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate profile-text-dark">
                    <%= (user && (user.name || user.full_name)) ? (user.name || user.full_name) : 'Resident' %>
                  </h2>""",
        """<h2 id="profileFullName" class="resident-name-display text-base sm:text-lg font-black text-slate-900 tracking-tight truncate profile-text-dark">
                    <%= (user && (user.name || user.full_name)) ? (user.name || user.full_name) : 'Resident' %>
                  </h2>"""
    )

    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("6. Updated views/resident/settings.ejs with dynamic profile name IDs")

def fix_bridge_hydrator():
    path = 'public/js/capacitor-resident-bridge.js'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('\r\n', '\n')

    old_hydrator = """  // 1b. Dynamic resident profile hydrator: syncs active resident name across headers & passes
  function hydrateCachedResidentProfile() {
    let resident = null;
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
    } catch (_) {}
    if (!resident) return;

    if (resident.user_id || resident.id) {
      global.currentUserId = String(resident.user_id || resident.id);
    }
    const fullName = resident.full_name || resident.name || (resident.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : null);
    if (fullName) {
      document.querySelectorAll('.resident-name-display, #headerUserName, #profileFullName').forEach(el => {
        el.textContent = fullName;
      });
    }
  }"""

    new_hydrator = """  // 1b. Dynamic resident profile hydrator: syncs active resident name across headers, greeting, & profile
  function hydrateCachedResidentProfile() {
    let resident = null;
    try {
      resident = JSON.parse(localStorage.getItem('evw_cached_resident') || 'null');
    } catch (_) {}
    if (!resident) return;

    if (resident.user_id || resident.id) {
      global.currentUserId = String(resident.user_id || resident.id);
    }
    const fullName = resident.full_name || resident.name || (resident.first_name ? `${resident.first_name} ${resident.last_name || ''}`.trim() : null);
    const firstName = resident.first_name || (fullName ? fullName.split(' ')[0] : 'Resident');
    const email = resident.email || localStorage.getItem('evw_cached_email') || '';

    if (firstName) {
      document.querySelectorAll('#residentUserGreetingName, .resident-first-name-display').forEach(el => {
        el.textContent = firstName;
      });
    }
    if (fullName) {
      document.querySelectorAll('.resident-name-display, #headerUserName, #profileFullName, #ownerName, .profile-hero-name').forEach(el => {
        el.textContent = fullName;
      });
    }
    if (email) {
      document.querySelectorAll('#profileEmailDisplay, #ownerEmail').forEach(el => {
        el.textContent = email;
      });
    }
  }"""

    if old_hydrator in c:
        c = c.replace(old_hydrator, new_hydrator)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(c)
        print("7. Updated hydrateCachedResidentProfile in capacitor-resident-bridge.js")

def fix_main_activity():
    path = 'android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()

    new_activity = """package ph.gov.baao.evakwar.resident;

import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void openBluetoothSettings() {
                    try {
                        Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        openGeneralSettings();
                    }
                }

                @JavascriptInterface
                public void openWifiSettings() {
                    try {
                        Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception e) {
                        openGeneralSettings();
                    }
                }

                @JavascriptInterface
                public void openGeneralSettings() {
                    try {
                        Intent intent = new Intent(Settings.ACTION_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            }, "AndroidSettingsBridge");
        }
    }
}
"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_activity)
    print("8. Patched MainActivity.java with AndroidSettingsBridge (Bluetooth & Wi-Fi settings redirect)")

def fix_lora_client_ble():
    path = 'public/js/lora-mesh-client.js'
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('\r\n', '\n')

    # Improve connectBLE permissions and device scanning
    old_cap_ble = """      // A) Native Capacitor Android BLE
      if (capBle) {
        try {
          await capBle.initialize();

          // Check if already bonded first
          if (typeof capBle.getBondedDevices === 'function') {
            const bonded = await capBle.getBondedDevices().catch(() => null);
            if (bonded && Array.isArray(bonded.devices) && bonded.devices.length > 0) {
              const match = bonded.devices.find(d => {
                const nm = (d.name || '').toLowerCase();
                return nm.includes('meshtastic') || nm.includes('res1') || nm.includes('f4e2') || nm.includes('lora') || nm.includes('evakwar');
              });
              if (match) {
                return await this.connectBLEDevice(match.deviceId, match.name || 'RES1 (!f4e213d4)');
              }
            }
          }

          const device = await capBle.requestDevice({
            services: [MESH_SERVICE_UUID],
            optionalServices: [MESH_SERVICE_UUID]
          });

          return await this.connectBLEDevice(device.deviceId, device.name || 'RES1 (!f4e213d4)');
        } catch (err) {
          console.error('Capacitor BLE connect error:', err);
          throw new Error(err.message || 'Bluetooth connection cancelled or failed.');
        }
      }"""

    new_cap_ble = """      // A) Native Capacitor Android BLE
      if (capBle) {
        try {
          if (typeof capBle.requestPermissions === 'function') {
            await capBle.requestPermissions().catch(() => {});
          }
          await capBle.initialize({ requestBlePermissions: true }).catch(() => {});

          // Check if already bonded first
          if (typeof capBle.getBondedDevices === 'function') {
            const bonded = await capBle.getBondedDevices().catch(() => null);
            if (bonded && Array.isArray(bonded.devices) && bonded.devices.length > 0) {
              const match = bonded.devices.find(d => {
                const nm = (d.name || '').toLowerCase();
                return nm.includes('meshtastic') || nm.includes('res1') || nm.includes('f4e2') || nm.includes('lora') || nm.includes('evakwar');
              });
              if (match) {
                return await this.connectBLEDevice(match.deviceId, match.name || 'RES1 (!f4e213d4)');
              }
            }
          }

          let device = null;
          try {
            // First try with optionalServices so any nearby ESP32/Meshtastic node is discovered
            device = await capBle.requestDevice({
              optionalServices: [MESH_SERVICE_UUID]
            });
          } catch (_) {
            // Fallback: request with specific service filter
            device = await capBle.requestDevice({
              services: [MESH_SERVICE_UUID],
              optionalServices: [MESH_SERVICE_UUID]
            });
          }

          if (device && device.deviceId) {
            return await this.connectBLEDevice(device.deviceId, device.name || 'RES1 (!f4e213d4)');
          }
        } catch (err) {
          console.error('Capacitor BLE connect error:', err);
          throw new Error(err.message || 'Bluetooth pairing cancelled or failed. Make sure Bluetooth is ON.');
        }
      }"""

    if old_cap_ble in c:
        c = c.replace(old_cap_ble, new_cap_ble)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(c)
        print("9. Enhanced Capacitor BLE requestPermissions and scanning in lora-mesh-client.js")

if __name__ == '__main__':
    fix_push_notifications()
    fix_dashboard_and_header()
    fix_profile_settings()
    fix_bridge_hydrator()
    fix_main_activity()
    fix_lora_client_ble()
