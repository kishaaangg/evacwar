with open('public/js/lora-mesh-client.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the ALT handler inside handleIncomingRawPacket
old_alt = """      if (parsed.type === 'ACK') {
        this.emit('ack', parsed);
      } else if (parsed.type === 'ALT') {
        // Multi-pulse haptic vibration (Thesis Panel Spec: [400, 150, 400, 150, 600])
        if (navigator.vibrate) {
          try { navigator.vibrate([400, 150, 400, 150, 600]); } catch (_) {}
        }
        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-alert', { detail: parsed }));
        } catch (_) {}
        this.emit('alert', parsed);
      }"""

new_alt = """      if (parsed.type === 'ACK') {
        this.emit('ack', parsed);
      } else if (parsed.type === 'ALT') {
        console.log('[LoRaMeshClient] 🚨 LORA EMERGENCY ALERT PACKET RECEIVED:', parsed);
        
        // Multi-pulse haptic vibration (Thesis Panel Spec: [500, 150, 500, 150, 1000])
        if (navigator.vibrate) {
          try { navigator.vibrate([500, 150, 500, 150, 1000]); } catch (_) {}
        }

        const alertObj = {
          id: parsed.alertId || ('ALT-' + Date.now()),
          alertId: parsed.alertId || ('ALT-' + Date.now()),
          title: (parsed.disasterType || 'EMERGENCY').toUpperCase() + ' ALERT - ' + (parsed.level || 'WARNING').toUpperCase(),
          type: (parsed.level || 'red').toLowerCase(),
          severity: (parsed.level || 'P1').toUpperCase(),
          disasterType: parsed.disasterType || 'Disaster',
          message: parsed.message || 'Evacuation Warning Broadcasted over 433.875 MHz LoRa Mesh',
          action: parsed.actionCode === 'EVAC' ? 'IMMEDIATE EVACUATION' : (parsed.actionCode || 'TAKE SHELTER'),
          instructions: parsed.message || 'Proceed to designated evacuation zone.',
          evacCenter: 'San Rafael Evacuation Center',
          broadcast_time: new Date().toISOString(),
          viaLoRa: true
        };

        try {
          window.dispatchEvent(new CustomEvent('evakwar:lora-alert', { detail: alertObj }));
        } catch (_) {}

        if (typeof window.triggerEmergencyAlarm === 'function') {
          window.triggerEmergencyAlarm(alertObj);
        }

        this.emit('alert', alertObj);
      }"""

# Replace in content (handling CRLF or LF)
content = content.replace(old_alt.replace('\r\n', '\n'), new_alt)
content = content.replace(old_alt.replace('\n', '\r\n'), new_alt)

# Also update BLE notification listener + polling drain in connectBLEDevice
old_notify = """      // Subscribe to FromNum notifications and drain FromRadio
      try {
        await capBle.startNotifications({
          deviceId: this.bleDeviceId,
          service: MESH_SERVICE_UUID,
          characteristic: FROMNUM_UUID
        }, async () => {
          await this.drainCapacitorFromRadio(capBle);
        });
      } catch (e) {
        console.warn('BLE notification setup note:', e);
      }"""

new_notify = """      // Subscribe to FromNum notifications and drain FromRadio
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
      }, 1200);"""

content = content.replace(old_notify.replace('\r\n', '\n'), new_notify)
content = content.replace(old_notify.replace('\n', '\r\n'), new_notify)

with open('public/js/lora-mesh-client.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patched public/js/lora-mesh-client.js successfully!")
