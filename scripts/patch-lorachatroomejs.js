const fs = require('fs');
const filePath = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/lora-chat-room.ejs';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace updateTransportUi()
const oldTransportUi = `    function updateTransportUi() {
      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isNativeBle = Boolean(typeof window !== 'undefined' && window.AndroidBleBridge && typeof window.AndroidBleBridge.isConnected === 'function' && window.AndroidBleBridge.isConnected());
      const isBleOrUsb = isNativeBle || Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));
      const isOnline = Boolean(navigator.onLine);

      if (SERVER_ROLE === 'Admin') {
        if (transportTextEl) transportTextEl.textContent = 'Hall Gateway';
        if (transportBadgeEl) {
          transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1';
        }
        return;
      }

      if (isBleOrUsb) {
        const modeLabel = lora.transport === 'BLE' ? 'LoRa BLE' : 'LoRa USB';
        if (transportTextEl) transportTextEl.textContent = modeLabel;
        if (transportBadgeEl) {
          transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1';
        }
      } else if (isOnline) {
        if (transportTextEl) transportTextEl.textContent = 'Online (Wi-Fi)';
        if (transportBadgeEl) {
          transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center gap-1';
        }
      } else {
        if (transportTextEl) transportTextEl.textContent = 'Offline (No Link)';
        if (transportBadgeEl) {
          transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1';
        }
      }
    }`;

const newTransportUi = `    function updateTransportUi() {
      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isNativeBle = Boolean(typeof window !== 'undefined' && window.AndroidBleBridge && typeof window.AndroidBleBridge.isConnected === 'function' && window.AndroidBleBridge.isConnected());
      const isBleOrUsb = isNativeBle || Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));
      const isOnline = Boolean(navigator.onLine);

      if (SERVER_ROLE === 'Admin') {
        const isGwConnected = Boolean(window._adminGatewayConnected);
        if (transportTextEl) {
          if (isOnline && isGwConnected) {
            transportTextEl.textContent = 'Wi-Fi + LoRa Gateway';
          } else if (isOnline) {
            transportTextEl.textContent = 'Online (Wi-Fi)';
          } else if (isGwConnected) {
            transportTextEl.textContent = 'LoRa Gateway (COM3)';
          } else {
            transportTextEl.textContent = 'Offline (No Link)';
          }
        }
        if (transportBadgeEl) {
          if (isOnline || isGwConnected) {
            transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1';
          } else {
            transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1';
          }
        }
        return;
      }

      if (isBleOrUsb) {
        const modeLabel = (lora && lora.transport === 'USB_SERIAL') ? 'LoRa USB' : 'LoRa BLE';
        if (transportTextEl) transportTextEl.textContent = modeLabel;
        if (transportBadgeEl) {
          transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1';
        }
      } else if (isOnline) {
        if (transportTextEl) transportTextEl.textContent = 'Online (Wi-Fi)';
        if (transportBadgeEl) {
          transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 flex items-center gap-1';
        }
      } else {
        if (transportTextEl) transportTextEl.textContent = 'Offline (No Link)';
        if (transportBadgeEl) {
          transportBadgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 flex items-center gap-1';
        }
      }
    }`;

// Normalize newlines for replacement
const normContent = content.replace(/\r\n/g, '\n');
const normOldTransport = oldTransportUi.replace(/\r\n/g, '\n');

if (!normContent.includes(normOldTransport)) {
  console.error('Could not find oldTransportUi in lora-chat-room.ejs');
  process.exit(1);
}
let updated = normContent.replace(normOldTransport, newTransportUi);

// 2. Replace handleSendMessage
const oldSendStart = '    function handleSendMessage(rawText, existingMsgId = null) {';
const oldSendEnd = '    function retryMessage(msg) {';

const sendStartIndex = updated.indexOf(oldSendStart);
const sendEndIndex = updated.indexOf(oldSendEnd);

if (sendStartIndex === -1 || sendEndIndex === -1) {
  console.error('Could not find handleSendMessage bounds in lora-chat-room.ejs');
  process.exit(1);
}

const newSendMessage = `    function handleSendMessage(rawText, existingMsgId = null) {
      const cleanText = String(rawText || '').trim();
      if (!cleanText) return;

      resolveActiveIdentity();
      const lora = window.evakwarLoraClient;
      const isNativeBle = Boolean(typeof window !== 'undefined' && window.AndroidBleBridge && typeof window.AndroidBleBridge.isConnected === 'function' && window.AndroidBleBridge.isConnected());
      const isLoraConnected = isNativeBle || Boolean(lora && lora.connected && (lora.transport === 'BLE' || lora.transport === 'USB_SERIAL' || lora.transport === 'ESP_WIFI'));
      const isOnline = Boolean(navigator.onLine);
      const isLocalhost = Boolean(
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '0.0.0.0'
      );
      const isAdminRole = Boolean(SERVER_ROLE === 'Admin');
      const isGatewayActive = Boolean(window._adminGatewayConnected);
      const canLoRa = isLoraConnected || (isAdminRole && (isGatewayActive || isLocalhost));

      // 1. Strict User Requirement:
      // - Online on Wi-Fi -> Transport is WIFI ("Wi-Fi / Internet")
      // - Offline with LoRa -> Transport is LORA_433MHZ ("433.875 MHz LoRa")
      // - Offline without LoRa -> Message is NOT SENT (Red "Not Sent", failed status)
      let initialTransport = 'WIFI';
      let willSendOverLoRa = false;
      let willSendOverWifi = false;

      if (isOnline) {
        initialTransport = 'WIFI';
        willSendOverWifi = true;
      } else if (canLoRa) {
        initialTransport = 'LORA_433MHZ';
        willSendOverLoRa = true;
      } else {
        initialTransport = 'OFFLINE';
      }

      const msgId = existingMsgId || (String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90 + 10)));
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const newMsg = {
        id: msgId,
        msgId: msgId,
        seq: null,
        senderRole: currentRole,
        senderName: currentName,
        text: cleanText,
        message: cleanText,
        timestamp: nowMs,
        sent_at: nowIso,
        created_at: nowIso,
        transport: initialTransport,
        status: (initialTransport === 'OFFLINE') ? 'failed' : 'pending'
      };

      // Instant optimistic rendering in 0ms
      renderMessageBubble(newMsg, true);
      if (messagesListEl) messagesListEl.scrollTop = messagesListEl.scrollHeight;
      const cached = getLocalCachedMessages();
      const existingIdx = cached.findIndex(m => getMessageUniqueKey(m) === msgId);
      if (existingIdx >= 0) cached[existingIdx] = newMsg;
      else cached.push(newMsg);
      saveLocalCachedMessages(cached);

      // Register self-sent ID immediately so sender is never self-notified
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.markMessageSentBySelf === 'function') {
        try { window.AndroidBleBridge.markMessageSentBySelf(msgId); } catch (_) {}
      }

      // Offline without LoRa -> Fail immediately with red status and toast
      if (initialTransport === 'OFFLINE') {
        newMsg.status = 'failed';
        newMsg.transport = 'OFFLINE';
        const el = document.getElementById(\`chat_msg_\${msgId}\`);
        if (el) updateMessageStatusInDom(el, newMsg);
        saveLocalCachedMessages(cached);
        if (typeof window.EvacWarToast === 'function') {
          window.EvacWarToast('Message not sent. You are offline without LoRa connection.', 'warning');
        }
        return;
      }

      const tasks = [];

      // A. 433.875 MHz RF LoRa Transmission (Direct radio mesh)
      if (willSendOverLoRa || (isLoraConnected && !isAdminRole)) {
        if (lora && typeof lora.sendChatMessage === 'function') {
          tasks.push(
            lora.sendChatMessage({
              msgId: msgId,
              senderRole: currentRole,
              senderName: currentName,
              text: cleanText
            }).then(() => {
              if (willSendOverLoRa) {
                newMsg.transport = 'LORA_433MHZ';
                newMsg.status = 'sent';
              }
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
            if (willSendOverLoRa) {
              newMsg.transport = 'LORA_433MHZ';
              newMsg.status = 'sent';
            }
          } catch (_e) {}
        }
      }

      // B. Wi-Fi / Local Server POST (Works over Wi-Fi network OR on localhost Admin Gateway)
      if (willSendOverWifi || (isAdminRole && isLocalhost)) {
        const hallBase = getHallServerUrl();
        const primaryUrl = (hallBase && !hallBase.includes('localhost') && window.location.origin !== hallBase)
          ? \`\${hallBase}/api/lora/chat\`
          : '/api/lora/chat';

        const isOfflineLoraAdmin = Boolean(isAdminRole && !isOnline);
        const doSend = (url) => {
          return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              msgId: msgId,
              senderRole: currentRole,
              senderName: currentName,
              text: cleanText,
              viaLoRa: Boolean(willSendOverLoRa || isOfflineLoraAdmin),
              isOfflineLora: Boolean(willSendOverLoRa || isOfflineLoraAdmin)
            })
          });
        };

        tasks.push(
          doSend(primaryUrl)
            .catch(err => {
              if (isAdminRole || isLocalhost) {
                return doSend('http://127.0.0.1:8080/api/lora/chat');
              }
              throw err;
            })
            .then(async res => {
              if (res.ok) {
                const resData = await res.json().catch(() => null);
                if (resData && resData.chatMessage) {
                  const srv = resData.chatMessage;
                  newMsg.seq = srv.seq || newMsg.seq;
                  newMsg.timestamp = srv.timestamp || newMsg.timestamp;
                  newMsg.created_at = srv.created_at || newMsg.created_at;
                  newMsg.sent_at = srv.sent_at || newMsg.sent_at;
                  newMsg.transport = (srv.transport === 'LORA_433MHZ' || willSendOverLoRa || isOfflineLoraAdmin) ? 'LORA_433MHZ' : 'WIFI';
                  newMsg.status = 'sent';
                } else {
                  newMsg.transport = (willSendOverLoRa || isOfflineLoraAdmin) ? 'LORA_433MHZ' : 'WIFI';
                  newMsg.status = 'sent';
                }
              } else {
                throw new Error('Server returned HTTP ' + res.status);
              }
            })
            .catch(postErr => {
              console.warn('[LoRaChat] Server transmit error:', postErr.message);
              if (!willSendOverLoRa) {
                newMsg.status = 'failed';
              }
            })
        );

        // Direct Socket emit for real-time LAN speed
        try {
          const socket = window.__appSocket || window.evakwarAlertSocket || (typeof io !== 'undefined' ? io() : null);
          if (socket && socket.connected) {
            socket.emit('lora:chat:outbound', newMsg);
          }
        } catch (_) {}
      }

      Promise.allSettled(tasks).then(() => {
        const el = document.getElementById(\`chat_msg_\${msgId}\`);
        if (el) updateMessageStatusInDom(el, newMsg);
        const idx = cached.findIndex(m => getMessageUniqueKey(m) === msgId);
        if (idx >= 0) cached[idx] = newMsg;
        saveLocalCachedMessages(cached);
      });
    }

`;

updated = updated.slice(0, sendStartIndex) + newSendMessage + updated.slice(sendEndIndex);

fs.writeFileSync(filePath, updated, 'utf8');
console.log('Successfully updated lora-chat-room.ejs!');
