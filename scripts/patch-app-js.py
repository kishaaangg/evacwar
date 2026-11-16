with open('resident-mobile/js/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

target = """  // Listen for LoRa Emergency Broadcasts (433.875 MHz)
  loraClient.on('alert', (alertObj) => {
    console.log('[ResidentMobile] Received LoRa Emergency Alert:', alertObj);
    if (navigator.vibrate) {
      try { navigator.vibrate([400, 150, 400, 150, 600]); } catch (_) {}
    }
    if (typeof window.openGlobalEmergencyModal === 'function') {
      window.openGlobalEmergencyModal(alertObj);
    }
  });"""

replacement = """  // Listen for LoRa Emergency Broadcasts (433.875 MHz)
  loraClient.on('alert', (alertObj) => {
    console.log('[ResidentMobile] Received LoRa Emergency Alert:', alertObj);
    if (typeof window.triggerEmergencyAlarm === 'function') {
      window.triggerEmergencyAlarm(alertObj);
    } else {
      if (navigator.vibrate) {
        try { navigator.vibrate([500, 150, 500, 150, 1000]); } catch (_) {}
      }
      if (typeof window.openGlobalEmergencyModal === 'function') {
        window.openGlobalEmergencyModal(alertObj);
      }
      if (typeof window.updateSystemAlertBanner === 'function') {
        window.updateSystemAlertBanner(alertObj);
      }
    }
  });"""

text = text.replace(target.replace('\r\n', '\n'), replacement)
text = text.replace(target.replace('\n', '\r\n'), replacement)

with open('resident-mobile/js/app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated resident-mobile/js/app.js successfully!")
