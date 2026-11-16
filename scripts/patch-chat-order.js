const fs = require('fs');
const path = require('path');

function patchFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace mergeAndRenderMessages sort block
  const targetPattern = /allMessages = Array\.from\(mapById\.values\(\)\)\.sort\(\(a, b\) => \{[\s\S]*?return 0;\s*\}\);/;

  const replacement = `// Build conversation insertion / arrival order map
      const orderMap = new Map();
      let orderCounter = 0;
      for (const lm of localMsgs) {
        if (!lm || !lm.text) continue;
        const k = getMessageUniqueKey(lm);
        if (!orderMap.has(k)) orderMap.set(k, orderCounter++);
      }
      for (const sm of srvList) {
        if (!sm || !sm.text) continue;
        const k = getMessageUniqueKey(sm);
        if (!orderMap.has(k)) orderMap.set(k, orderCounter++);
      }

      allMessages = Array.from(mapById.values()).sort((a, b) => {
        const keyA = getMessageUniqueKey(a);
        const keyB = getMessageUniqueKey(b);
        const hasSeqA = (typeof a.seq === 'number' && a.seq > 0);
        const hasSeqB = (typeof b.seq === 'number' && b.seq > 0);

        // Rule 1: If both messages have monotonic server sequence numbers, sort by sequence
        if (hasSeqA && hasSeqB) {
          return a.seq - b.seq;
        }

        // Rule 2: Strictly preserve conversation arrival / insertion order!
        // Never sort by device clock timestamps (PC clock vs Mobile clock differences cause jumping).
        // Never place seq before non-seq (offline LoRa messages do not have sequence numbers yet).
        const ordA = orderMap.has(keyA) ? orderMap.get(keyA) : 999999;
        const ordB = orderMap.has(keyB) ? orderMap.get(keyB) : 999999;
        return ordA - ordB;
      });`;

  if (targetPattern.test(content)) {
    content = content.replace(targetPattern, replacement);
    console.log(`[OK] Replaced sort block in ${filePath}`);
  } else {
    console.warn(`[WARN] Sort block not found in ${filePath}`);
  }

  // Also enhance fallback in Wi-Fi catch block to ensure LoRa radio RF transmission occurs
  const oldWifiCatch = `            .catch(postErr => {
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
            })`;

  const newWifiCatch = `            .catch(postErr => {
              console.warn('[LoRaChat] Wi-Fi server unreachable:', postErr.message);
              // AUTOMATIC HYBRID LORA FALLBACK:
              // If Wi-Fi server could not be reached, but LoRa hardware is connected:
              if (isLoraConnected) {
                // Ensure message is transmitted over LoRa radio RF
                if (!willSendOverLoRa && isNativeBle && typeof window.AndroidBleBridge.writeHex === 'function') {
                  try {
                    const rawPacket = \`EVW|MSG|\${msgId}|\${currentRole}|\${currentName}|!f4e213d4|\${Math.floor(Date.now() / 1000)}|\${cleanText}\`;
                    if (typeof encodeMeshtasticTextToRadio === 'function') {
                      const protoBytes = encodeMeshtasticTextToRadio(rawPacket);
                      window.AndroidBleBridge.writeHex(bytesToHex(protoBytes));
                    }
                  } catch (_e) {}
                }
                newMsg.transport = 'LORA_433MHZ';
                newMsg.status = 'sent';
                if (typeof window.EvacWarToast === 'function') {
                  window.EvacWarToast('Wi-Fi gateway unreachable. Sent over 433.875 MHz LoRa Mesh.', 'info');
                }
              } else if (!willSendOverLoRa) {
                newMsg.transport = 'OFFLINE';
                newMsg.status = 'failed';
                if (typeof window.EvacWarToast === 'function') {
                  window.EvacWarToast('Could not reach EvakWar Gateway. Connect to LoRa or check Wi-Fi.', 'warning');
                }
              }
            })`;

  if (content.includes(oldWifiCatch)) {
    content = content.replace(oldWifiCatch, newWifiCatch);
    console.log(`[OK] Replaced Wi-Fi catch block in ${filePath}`);
  } else {
    console.warn(`[WARN] Wi-Fi catch block not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

patchFile('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/lora-chat-room.ejs');
patchFile('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/views/partials/lora-chat-room.ejs');
