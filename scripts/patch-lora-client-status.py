with open('public/js/lora-mesh-client.js', 'r', encoding='utf-8') as f:
    text = f.read()

target = """    setStatus(connected, transport, deviceName, extra = {}) {
      this.connected = connected;
      this.transport = transport;
      if (deviceName) {
        this.deviceName = deviceName;
        localStorage.setItem('evw_lora_device_name', deviceName);
      }
      this.emit('status', {
        connected: this.connected,
        transport: this.transport,
        deviceName: this.deviceName,
        deviceId: this.deviceId,
        frequency: '433.875 MHz',
        ...extra
      });
    }"""

replacement = """    setStatus(connected, transport, deviceName, extra = {}) {
      this.connected = connected;
      this.transport = transport;
      if (deviceName) {
        this.deviceName = deviceName;
        localStorage.setItem('evw_lora_device_name', deviceName);
      }
      this.emit('status', {
        connected: this.connected,
        transport: this.transport,
        deviceName: this.deviceName,
        deviceId: this.deviceId,
        frequency: '433.875 MHz',
        ...extra
      });

      // Synchronize pairing status with server so Admin sees real-time Bluetooth pairing
      try {
        fetch('/api/lora/resident-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: this.deviceId || '!f4e213d4',
            paired: Boolean(connected),
            online: Boolean(connected),
            transport: transport,
            rssi: extra.rssi || -50
          })
        }).catch(() => {});
      } catch (_) {}
    }

    async disconnect() {
      const capBle = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.BluetoothLe;
      if (capBle && this.bleDeviceId) {
        try { await capBle.disconnect({ deviceId: this.bleDeviceId }); } catch (_) {}
      }
      localStorage.removeItem('evw_lora_ble_device_id');
      this.setStatus(false, 'DISCONNECTED', 'Not Paired');
    }"""

assert target in text, "target not found in public/js/lora-mesh-client.js"
text = text.replace(target, replacement, 1)

with open('public/js/lora-mesh-client.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated public/js/lora-mesh-client.js with resident-status syncing!")
