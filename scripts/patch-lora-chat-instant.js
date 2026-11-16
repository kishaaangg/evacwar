const fs = require('fs');
const p = 'views/partials/lora-chat-room.ejs';
let code = fs.readFileSync(p, 'utf8');

// 1. Update button to type="button" and add attributes
const oldBtn = `<button
        type="submit"
        id="loraChatSendBtn"
        class="rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3.5 py-2 text-xs sm:text-sm flex items-center gap-1 shadow-xs transition-all cursor-pointer shrink-0">
        <i class="ph ph-paper-plane-right text-sm sm:text-base"></i>
        <span>Send</span>
      </button>`;

const newBtn = `<button
        type="button"
        id="loraChatSendBtn"
        data-offline-enabled="true"
        data-lora-chat="true"
        class="rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-3.5 py-2 text-xs sm:text-sm flex items-center gap-1 shadow-xs transition-all cursor-pointer shrink-0">
        <i class="ph ph-paper-plane-right text-sm sm:text-base pointer-events-none"></i>
        <span class="pointer-events-none">Send</span>
      </button>`;

code = code.replace(oldBtn.replace(/\r\n/g, '\n'), newBtn);

// 2. Add data-offline-enabled to input as well
code = code.replace(
  'id="loraChatInput"',
  'id="loraChatInput" data-offline-enabled="true" data-lora-chat="true"'
);

// 3. Update handleSendMessage for instant Messenger-style non-blocking dispatch
const oldSendStart = 'async function handleSendMessage(rawText, existingMsgId = null) {';
const oldSendEnd = 'function retryMessage(msg) {';

const idxSStart = code.indexOf(oldSendStart);
const idxSEnd = code.indexOf(oldSendEnd);

if (idxSStart !== -1 && idxSEnd !== -1) {
  const newSendBlock = `function handleSendMessage(rawText, existingMsgId = null) {
      const cleanText = String(rawText || '').trim();
      if (!cleanText) return;

      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isLoraConnected = Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));
      const isOnline = Boolean(navigator.onLine);

      const msgId = existingMsgId || (String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90 + 10)));
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const initialTransport = isLoraConnected ? 'LORA_433MHZ' : (isOnline ? 'WIFI' : 'OFFLINE');
      const initialStatus = (!isOnline && !isLoraConnected && SERVER_ROLE !== 'Admin') ? 'failed' : 'sent';

      const newMsg = {
        id: msgId,
        msgId: msgId,
        senderRole: currentRole,
        senderName: currentName,
        text: cleanText,
        message: cleanText,
        timestamp: nowMs,
        sent_at: nowIso,
        created_at: nowIso,
        transport: initialTransport,
        status: initialStatus
      };

      // 1. Messenger-style: Instant optimistic rendering in 0ms!
      renderMessageBubble(newMsg, true);
      const cached = getLocalCachedMessages();
      const existingIdx = cached.findIndex(m => String(m.msgId || m.id) === msgId);
      if (existingIdx >= 0) cached[existingIdx] = newMsg;
      else cached.push(newMsg);
      saveLocalCachedMessages(cached);

      // Register self-sent ID immediately
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.markMessageSentBySelf === 'function') {
        try { window.AndroidBleBridge.markMessageSentBySelf(msgId); } catch (_) {}
      }

      if (!isOnline && !isLoraConnected && SERVER_ROLE !== 'Admin') {
        newMsg.status = 'failed';
        renderMessageBubble(newMsg, false);
        saveLocalCachedMessages(cached);
        if (typeof window.EvacWarToast === 'function') {
          window.EvacWarToast('Message not sent. You are offline and no LoRa node is connected.');
        }
        return;
      }

      // 2. Parallel Zero-Lag Transmissions: RF & HTTP concurrently without blocking UI
      const tasks = [];

      // A. 433.875 MHz RF LoRa
      if (lora && isLoraConnected && typeof lora.sendChatMessage === 'function') {
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
      }

      // B. Wi-Fi / Local Server POST
      if (isOnline) {
        const hallBase = getHallServerUrl();
        const targetUrl = (hallBase && !hallBase.includes('localhost') && window.location.origin !== hallBase)
          ? \`\${hallBase}/api/lora/chat\`
          : '/api/lora/chat';

        tasks.push(
          fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              msgId: msgId,
              senderRole: currentRole,
              senderName: currentName,
              text: cleanText,
              viaLoRa: isLoraConnected
            })
          }).then(res => {
            if (res.ok) {
              if (!isLoraConnected) newMsg.transport = 'WIFI';
              newMsg.status = 'sent';
            }
          }).catch(postErr => {
            console.warn('[LoRaChat] POST error:', postErr.message);
          })
        );

        // C. Direct Socket emit for real-time LAN speed (<5ms)
        try {
          const socket = window.__appSocket || window.evakwarAlertSocket || (typeof io !== 'undefined' ? io() : null);
          if (socket && socket.connected) {
            socket.emit('lora:chat:outbound', newMsg);
          }
        } catch (_) {}
      }

      Promise.allSettled(tasks).then(() => {
        const updated = getLocalCachedMessages();
        const uIdx = updated.findIndex(m => String(m.msgId || m.id) === msgId);
        if (uIdx >= 0) updated[uIdx] = newMsg;
        saveLocalCachedMessages(updated);
        renderMessageBubble(newMsg, false);
      });
    }

    `;

  code = code.substring(0, idxSStart) + newSendBlock + code.substring(idxSEnd);
  console.log('Replaced handleSendMessage with instant parallel dispatcher!');
}

fs.writeFileSync(p, code, 'utf8');
console.log('views/partials/lora-chat-room.ejs updated successfully!');
