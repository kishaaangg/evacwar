const fs = require('fs');
const p = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/lora-chat-room.ejs';
let c = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// 1. Update updateTransportUi
const oldTransportUi = `    function updateTransportUi() {
      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isBleOrUsb = Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));`;

const newTransportUi = `    function updateTransportUi() {
      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isNativeBle = Boolean(typeof window !== 'undefined' && window.AndroidBleBridge && typeof window.AndroidBleBridge.isConnected === 'function' && window.AndroidBleBridge.isConnected());
      const isBleOrUsb = isNativeBle || Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));`;

c = c.replace(oldTransportUi, newTransportUi);

// 2. Update handleSendMessage
const oldSendCheck = `      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isLoraConnected = Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));
      const isOnline = Boolean(navigator.onLine);`;

const newSendCheck = `      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isNativeBle = Boolean(typeof window !== 'undefined' && window.AndroidBleBridge && typeof window.AndroidBleBridge.isConnected === 'function' && window.AndroidBleBridge.isConnected());
      const isLoraConnected = isNativeBle || Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));
      const isOnline = Boolean(navigator.onLine);`;

c = c.replace(oldSendCheck, newSendCheck);

// 3. Update LoRa RF send task in handleSendMessage
const oldRfTask = `      // A. 433.875 MHz RF LoRa
      if (lora && isLoraConnected && typeof lora.sendChatMessage === 'function') {`;

const newRfTask = `      // A. 433.875 MHz RF LoRa
      if (isLoraConnected) {
        if (lora && typeof lora.sendChatMessage === 'function') {
          tasks.push(
            lora.sendChatMessage({
              msgId: msgId,
              senderRole: currentRole,
              senderName: currentName,
              text: cleanText
            }).then(() => {
              newMsg.transport = 'LORA_433MHZ';
              newMsg.status = 'sent';
            }).catch(rfErr => {
              console.warn('[LoRaChat] RF transmit note:', rfErr.message);
            })
          );
        } else if (isNativeBle && typeof window.AndroidBleBridge.writeHex === 'function') {
          try {
            const rawPacket = \`EVW|MSG|\${msgId}|\${currentRole}|\${currentName}|!f4e213d4|\${Math.floor(Date.now() / 1000)}|\${cleanText}\`;
            if (typeof encodeMeshtasticTextToRadio === 'function') {
              const protoBytes = encodeMeshtasticTextToRadio(rawPacket);
              window.AndroidBleBridge.writeHex(bytesToHex(protoBytes));
            }
            newMsg.transport = 'LORA_433MHZ';
            newMsg.status = 'sent';
          } catch (_e) {}
        }
      }
      if (false) {`;

c = c.replace(oldRfTask, newRfTask);

// 4. Update mount lifecycle to clear unread badge and notify setChatOpen
const mountHook = `    // Clear unread red dot on bottom nav when entering chat
    try {
      localStorage.removeItem('evw_chat_has_unread');
      document.querySelectorAll('.chat-nav-red-dot').forEach(d => d.classList.add('hidden'));
    } catch (_) {}

    // Tell Android BLE bridge chat is open in foreground (suppresses noisy notification banners)
    if (window.AndroidBleBridge && typeof window.AndroidBleBridge.setChatOpen === 'function') {
      try { window.AndroidBleBridge.setChatOpen(true); } catch (_) {}
    }
    window.addEventListener('beforeunload', function () {
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.setChatOpen === 'function') {
        try { window.AndroidBleBridge.setChatOpen(false); } catch (_) {}
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.setChatOpen === 'function') {
        try { window.AndroidBleBridge.setChatOpen(document.visibilityState === 'visible'); } catch (_) {}
      }
    });\n`;

const targetPos = c.indexOf("bindChatSocket();");
if (targetPos >= 0) {
  c = c.substring(0, targetPos) + mountHook + c.substring(targetPos);
  console.log('Inserted mountHook into lora-chat-room.ejs');
}

fs.writeFileSync(p, c, 'utf8');
console.log('views/partials/lora-chat-room.ejs patched successfully!');
