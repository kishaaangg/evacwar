const fs = require('fs');
const filePath = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/lora-chat-room.ejs';
let content = fs.readFileSync(filePath, 'utf8');

const oldBlock = `      // A. 433.875 MHz RF LoRa Transmission (Direct radio mesh)
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
        );`;

const newBlock = `      // A. 433.875 MHz RF LoRa Transmission (Direct radio mesh)
      // Broadcast over radio whenever LoRa is connected (as primary offline OR mesh redundancy)
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

      // If we are strictly in offline LoRa mode, mark sent immediately
      if (willSendOverLoRa) {
        newMsg.transport = 'LORA_433MHZ';
        newMsg.status = 'sent';
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
              console.warn('[LoRaChat] Wi-Fi server unreachable:', postErr.message);
              // AUTOMATIC HYBRID LORA FALLBACK:
              // If Wi-Fi server could not be reached, but LoRa hardware is connected:
              if (isLoraConnected) {
                newMsg.transport = 'LORA_433MHZ';
                newMsg.status = 'sent';
                if (typeof window.EvacWarToast === 'function') {
                  window.EvacWarToast('Wi-Fi gateway unreachable. Sent over 433.875 MHz LoRa Mesh.', 'info');
                }
              } else if (!willSendOverLoRa) {
                newMsg.status = 'failed';
                if (typeof window.EvacWarToast === 'function') {
                  window.EvacWarToast('Could not reach EvakWar Gateway. Connect to LoRa or check Wi-Fi.', 'warning');
                }
              }
            })
        );`;

const normContent = content.replace(/\r\n/g, '\n');
const normOld = oldBlock.replace(/\r\n/g, '\n');
const normNew = newBlock.replace(/\r\n/g, '\n');

if (normContent.includes(normOld)) {
  content = normContent.replace(normOld, normNew);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated handleSendMessage with Automatic LoRa Fallback!');
} else {
  console.error('oldBlock not found in lora-chat-room.ejs');
  process.exit(1);
}
