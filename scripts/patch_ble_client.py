path = r"public/js/lora-mesh-client.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace connectBLEDevice, autoConnectBLE, and connectBLE
old_block = """    async connectBLEDevice(deviceId, deviceName) {
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;
      if (!capBle) throw new Error('Capacitor BluetoothLe plugin unavailable');

      this.bleDeviceId = deviceId;
      this.deviceId = deviceId;
      const name = deviceName || `EvakWar Node (${deviceId.slice(-5)})`;
      localStorage.setItem('evw_lora_ble_device_id', deviceId);
      localStorage.setItem('evw_lora_device_name', name);

      await capBle.connect({
        deviceId: this.bleDeviceId,
        onDisconnect: () => {
          this.setStatus(false, 'DISCONNECTED', `${name} (Disconnected)`);
        }
      });

      // Send WantConfig to wake Meshtastic BLE radio queue
      const wantCfg = encodeWantConfigToRadio();
      const hexStr = Array.from(wantCfg).map(b => b.toString(16).padStart(2, '0')).join('');
      try {
        await capBle.write({
          deviceId: this.bleDeviceId,
          service: MESH_SERVICE_UUID,
          characteristic: TORADIO_UUID,
          value: hexStr
        });
      } catch (e1) {
        try {
          await capBle.writeWithoutResponse({
            deviceId: this.bleDeviceId,
            service: MESH_SERVICE_UUID,
            characteristic: TORADIO_UUID,
            value: hexStr
          });
        } catch (_) {}
      }

      // Subscribe to FromNum notifications and drain FromRadio
      try {
        if (typeof capBle.addListener === 'function') {
          capBle.addListener('notification|' + this.bleDeviceId + '|' + MESH_SERVICE_UUID.toLowerCase() + '|' + FROMNUM_UUID.toLowerCase(), async () => {
            await this.drainCapacitorFromRadio(capBle);
          });
        }
        await capBle.startNotifications({
          deviceId: this.bleDeviceId,
          service: MESH_SERVICE_UUID,
          characteristic: FROMNUM_UUID
        }, async () => {
          await this.drainCapacitorFromRadio(capBle);
        });
      } catch (e) {
        console.warn('BLE notification setup note:', e);
      }

      // Continuous 1200ms background queue drain interval to ensure no packet is missed if BLE notification event was dropped
      if (this.bleDrainInterval) clearInterval(this.bleDrainInterval);
      this.bleDrainInterval = setInterval(() => {
        this.drainCapacitorFromRadio(capBle);
      }, 1200);

      this.setStatus(true, 'BLE', name);
      return { success: true, transport: 'BLE', deviceName: name };
    }

    async autoConnectBLE() {
      if (this.connected && this.transport === 'BLE') return true;
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;
      if (!capBle) return false;

      try {
        await capBle.initialize();

        let targetId = this.bleDeviceId || localStorage.getItem('evw_lora_ble_device_id');
        let targetName = this.deviceName || localStorage.getItem('evw_lora_device_name') || 'RES1 (!f4e213d4)';

        // If no targetId saved, look for already paired/bonded devices in Android
        if (!targetId && typeof capBle.getBondedDevices === 'function') {
          const bonded = await capBle.getBondedDevices();
          if (bonded && Array.isArray(bonded.devices) && bonded.devices.length > 0) {
            const match = bonded.devices.find(d => {
              const nm = (d.name || '').toLowerCase();
              return nm.includes('meshtastic') || nm.includes('res1') || nm.includes('f4e2') || nm.includes('lora') || nm.includes('evakwar');
            }) || bonded.devices[0];

            if (match) {
              targetId = match.deviceId;
              targetName = match.name || targetName;
            }
          }
        }

        if (!targetId) return false;

        console.log(`[LoRaMeshClient] Auto-connecting to LoRa BLE Node: ${targetName} (${targetId})`);
        const res = await this.connectBLEDevice(targetId, targetName);
        return res && res.success;
      } catch (err) {
        console.warn('[LoRaMeshClient] autoConnectBLE note:', err.message);
        return false;
      }
    }

    async connectBLE() {
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;

      // A) Native Capacitor Android BLE
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
      }

      // B) Web Bluetooth API (Chrome on Android / Desktop)
      if (navigator.bluetooth) {
        try {
          const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [MESH_SERVICE_UUID] }],
            optionalServices: [MESH_SERVICE_UUID]
          });"""

new_block = """    async connectBLEDevice(deviceId, deviceName) {
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;
      if (!capBle) throw new Error('Capacitor BluetoothLe plugin unavailable');

      this.bleDeviceId = deviceId;
      this.deviceId = deviceId;
      const name = deviceName || `EvakWar Node (${deviceId.slice(-5)})`;
      localStorage.setItem('evw_lora_ble_device_id', deviceId);
      localStorage.setItem('evw_lora_device_name', name);

      // Cleanly disconnect previous connection if any
      try {
        await capBle.disconnect({ deviceId: this.bleDeviceId });
      } catch (_) {}

      // Generous timeout (25s) allowing user to confirm Bluetooth pairing PIN / prompt
      await capBle.connect({
        deviceId: this.bleDeviceId,
        timeout: 25000
      });

      // Discover GATT services on the newly connected node
      try {
        if (typeof capBle.discoverServices === 'function') {
          await capBle.discoverServices({ deviceId: this.bleDeviceId });
        }
      } catch (discErr) {
        console.warn('[LoRaMeshClient] discoverServices note:', discErr);
      }

      // Send WantConfig to wake Meshtastic BLE radio queue
      const wantCfg = encodeWantConfigToRadio();
      const hexStr = Array.from(wantCfg).map(b => b.toString(16).padStart(2, '0')).join('');
      try {
        await capBle.write({
          deviceId: this.bleDeviceId,
          service: MESH_SERVICE_UUID,
          characteristic: TORADIO_UUID,
          value: hexStr
        });
      } catch (e1) {
        try {
          await capBle.writeWithoutResponse({
            deviceId: this.bleDeviceId,
            service: MESH_SERVICE_UUID,
            characteristic: TORADIO_UUID,
            value: hexStr
          });
        } catch (_) {}
      }

      // Subscribe to FromNum notifications and drain FromRadio
      try {
        if (typeof capBle.addListener === 'function') {
          capBle.addListener('notification|' + this.bleDeviceId + '|' + MESH_SERVICE_UUID.toLowerCase() + '|' + FROMNUM_UUID.toLowerCase(), async () => {
            await this.drainCapacitorFromRadio(capBle);
          });
        }
        await capBle.startNotifications({
          deviceId: this.bleDeviceId,
          service: MESH_SERVICE_UUID,
          characteristic: FROMNUM_UUID
        }, async () => {
          await this.drainCapacitorFromRadio(capBle);
        });
      } catch (e) {
        console.warn('[LoRaMeshClient] BLE notification setup note:', e);
      }

      // Continuous 1200ms background queue drain interval
      if (this.bleDrainInterval) clearInterval(this.bleDrainInterval);
      this.bleDrainInterval = setInterval(() => {
        this.drainCapacitorFromRadio(capBle);
      }, 1200);

      this.setStatus(true, 'BLE', name);
      return { success: true, transport: 'BLE', deviceName: name };
    }

    async autoConnectBLE() {
      if (this.connected && this.transport === 'BLE') return true;
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;
      if (!capBle) return false;

      try {
        await capBle.initialize({ androidNeverForLocation: true }).catch(() => {});

        let targetId = this.bleDeviceId || localStorage.getItem('evw_lora_ble_device_id');
        let targetName = this.deviceName || localStorage.getItem('evw_lora_device_name') || 'RES1 (!f4e213d4)';

        // If no targetId saved, look for already paired/bonded devices in Android
        if (!targetId && typeof capBle.getBondedDevices === 'function') {
          const bonded = await capBle.getBondedDevices();
          if (bonded && Array.isArray(bonded.devices) && bonded.devices.length > 0) {
            const match = bonded.devices.find(d => {
              const nm = (d.name || '').toLowerCase();
              return nm.includes('meshtastic') || nm.includes('res1') || nm.includes('f4e2') || nm.includes('lora') || nm.includes('evakwar') || nm.includes('esp32');
            }) || bonded.devices[0];

            if (match) {
              targetId = match.deviceId;
              targetName = match.name || targetName;
            }
          }
        }

        if (!targetId) return false;

        console.log(`[LoRaMeshClient] Auto-connecting to LoRa BLE Node: ${targetName} (${targetId})`);
        const res = await this.connectBLEDevice(targetId, targetName);
        return res && res.success;
      } catch (err) {
        console.warn('[LoRaMeshClient] autoConnectBLE note:', err.message);
        return false;
      }
    }

    async connectBLE() {
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;

      // A) Native Capacitor Android BLE
      if (capBle) {
        try {
          // 1. Initialize with androidNeverForLocation: true (required for Android 12+)
          await capBle.initialize({ androidNeverForLocation: true }).catch(() => {});

          // 2. Request BLE permissions
          if (typeof capBle.requestPermissions === 'function') {
            await capBle.requestPermissions({ androidNeverForLocation: true }).catch(() => {});
          }

          // 3. Verify Bluetooth is ON
          try {
            if (typeof capBle.isEnabled === 'function') {
              const isEnabledRes = await capBle.isEnabled();
              if (isEnabledRes && isEnabledRes.value === false) {
                if (window.AndroidSettingsBridge) {
                  window.AndroidSettingsBridge.openBluetoothSettings();
                } else if (typeof capBle.openBluetoothSettings === 'function') {
                  await capBle.openBluetoothSettings().catch(() => {});
                }
                throw new Error('Bluetooth is turned OFF. Please enable Bluetooth on your phone and try again.');
              }
            }
          } catch (enErr) {
            if (enErr.message && enErr.message.includes('Bluetooth is turned OFF')) {
              throw enErr;
            }
          }

          // 4. Check if a known/bonded LoRa node is already paired
          if (typeof capBle.getBondedDevices === 'function') {
            const bonded = await capBle.getBondedDevices().catch(() => null);
            if (bonded && Array.isArray(bonded.devices) && bonded.devices.length > 0) {
              const match = bonded.devices.find(d => {
                const nm = (d.name || '').toLowerCase();
                return nm.includes('meshtastic') || nm.includes('res1') || nm.includes('f4e2') || nm.includes('lora') || nm.includes('evakwar') || nm.includes('esp32');
              });
              if (match) {
                console.log('[LoRaMeshClient] Found bonded device:', match.name, match.deviceId);
                return await this.connectBLEDevice(match.deviceId, match.name || 'RES1 (!f4e213d4)');
              }
            }
          }

          // 5. Native Device Picker:
          // Do NOT filter by service UUID because ESP32 31-byte advertising packets omit 128-bit service UUID!
          let device = null;
          try {
            device = await capBle.requestDevice({});
          } catch (scanErr1) {
            console.warn('[LoRaMeshClient] requestDevice({}) fallback:', scanErr1);
            try {
              device = await capBle.requestDevice({
                optionalServices: [MESH_SERVICE_UUID]
              });
            } catch (scanErr2) {
              device = await capBle.requestDevice({
                services: [MESH_SERVICE_UUID]
              });
            }
          }

          if (device && device.deviceId) {
            return await this.connectBLEDevice(device.deviceId, device.name || 'RES1 (!f4e213d4)');
          } else {
            throw new Error('No Bluetooth device selected.');
          }
        } catch (err) {
          console.error('Capacitor BLE connect error:', err);
          throw new Error(err.message || 'Bluetooth pairing cancelled or failed. Make sure Bluetooth is ON.');
        }
      }

      // B) Web Bluetooth API (Chrome on Android / Desktop)
      if (navigator.bluetooth) {
        try {
          let device = null;
          try {
            device = await navigator.bluetooth.requestDevice({
              acceptAllDevices: true,
              optionalServices: [MESH_SERVICE_UUID]
            });
          } catch (_) {
            device = await navigator.bluetooth.requestDevice({
              filters: [
                { namePrefix: 'Meshtastic' },
                { namePrefix: 'RES' },
                { namePrefix: 'LoRa' },
                { services: [MESH_SERVICE_UUID] }
              ],
              optionalServices: [MESH_SERVICE_UUID]
            });
          }"""

if old_block in content:
    content = content.replace(old_block, new_block)
    print("Replaced BLE logic in lora-mesh-client.js successfully.")
else:
    old_crlf = old_block.replace('\n', '\r\n')
    if old_crlf in content:
        content = content.replace(old_crlf, new_block.replace('\n', '\r\n'))
        print("Replaced BLE logic (CRLF) in lora-mesh-client.js successfully.")
    else:
        print("Warning: old_block not found in lora-mesh-client.js!")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
