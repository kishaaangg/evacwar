const fs = require('fs');

function fixChatFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  // Locate mergeAndRenderMessages function
  const startMarker = 'function mergeAndRenderMessages(serverMessages) {';
  const endMarker = '    async function fetchChatHistory(';

  const sIdx = content.indexOf(startMarker);
  const eIdx = content.indexOf(endMarker, sIdx);

  if (sIdx === -1 || eIdx === -1) {
    console.error('Markers not found in', filePath, sIdx, eIdx);
    return;
  }

  const replacement = `function mergeAndRenderMessages(serverMessages, forceScrollToBottom = false) {
      const isFromServer = Array.isArray(serverMessages) && serverMessages.length > 0;
      const localMsgs = getLocalCachedMessages();
      const mapById = new Map();

      // 1. Process server messages first (Server is authoritative source of truth!)
      const srvList = isFromServer ? serverMessages : [];
      for (const sm of srvList) {
        if (!sm || !sm.text) continue;
        const key = getMessageUniqueKey(sm);
        mapById.set(key, Object.assign({}, sm, { status: 'sent' }));
      }

      // 2. Merge local cached messages
      // Discard stale unsequenced phantoms older than 2 minutes when server messages exist
      const nowMs = Date.now();
      for (const lm of localMsgs) {
        if (!lm || !lm.text) continue;
        const key = getMessageUniqueKey(lm);
        if (mapById.has(key)) {
          const srv = mapById.get(key);
          mapById.set(key, Object.assign({}, lm, srv, { status: 'sent' }));
        } else {
          const age = nowMs - getNormalizedTimestampMs(lm);
          // Only preserve if very recent (within 2 minutes) or actively pending
          if (!isFromServer || age < 120000 || lm.status === 'pending') {
            mapById.set(key, lm);
          }
        }
      }

      allMessages = Array.from(mapById.values()).sort((a, b) => {
        // Priority 1: Monotonic Server Sequence Number (Infallible cross-device chronological order)
        const hasSeqA = (typeof a.seq === 'number' && a.seq > 0);
        const hasSeqB = (typeof b.seq === 'number' && b.seq > 0);

        if (hasSeqA && hasSeqB) {
          return a.seq - b.seq;
        }

        // Priority 2: Absolute Timestamp Comparison
        const tsA = getNormalizedTimestampMs(a);
        const tsB = getNormalizedTimestampMs(b);

        // If timestamps differ by more than 2.5 seconds, absolute time ALWAYS dictates order!
        // (A 07:58 AM message can NEVER be placed after a 08:47 AM message!)
        if (Math.abs(tsA - tsB) > 2500) {
          return tsA - tsB;
        }

        // Within the 2.5s skew window: server-confirmed comes before local pending
        if (hasSeqA && !hasSeqB) return -1;
        if (!hasSeqA && hasSeqB) return 1;

        return tsA - tsB;
      });

      if (allMessages.length === 0) {
        const initIso = new Date().toISOString();
        allMessages = [{
          id: 'INIT01',
          msgId: 'INIT01',
          seq: 1,
          senderRole: 'Admin',
          senderName: 'Monette Bisenio',
          text: 'San Rafael 433.875 MHz LoRa Mesh Group Chat is online. Residents, Staff, and Rescuers can communicate here even without internet.',
          timestamp: Date.now() - 60000,
          created_at: initIso,
          sent_at: initIso,
          transport: 'LORA_433MHZ',
          status: 'sent'
        }];
      }

      saveLocalCachedMessages(allMessages);

      // Check if message count or keys/order changed before resetting DOM
      const currentKeys = allMessages.map(m => getMessageUniqueKey(m));
      const renderedElements = Array.from(messagesListEl.querySelectorAll('.chat-bubble-wrapper'));
      const renderedKeys = renderedElements.map(el => el.getAttribute('data-msg-key'));

      let needsReorder = (currentKeys.length !== renderedKeys.length);
      if (!needsReorder) {
        for (let i = 0; i < currentKeys.length; i++) {
          if (currentKeys[i] !== renderedKeys[i]) {
            needsReorder = true;
            break;
          }
        }
      }

      if (needsReorder) {
        const wasAtBottom = (messagesListEl.scrollHeight - messagesListEl.scrollTop - messagesListEl.clientHeight) < 120;
        messagesListEl.innerHTML = '';
        renderedMsgIds.clear();
        allMessages.forEach(m => renderMessageBubble(m, false));
        if (forceScrollToBottom || wasAtBottom || renderedKeys.length === 0) {
          messagesListEl.scrollTop = messagesListEl.scrollHeight;
        }
      } else {
        allMessages.forEach(m => {
          const k = getMessageUniqueKey(m);
          const el = document.getElementById(\`chat_msg_\${k}\`);
          if (el) updateMessageStatusInDom(el, m);
        });
        if (forceScrollToBottom) {
          messagesListEl.scrollTop = messagesListEl.scrollHeight;
        }
      }
    }

`;

  content = content.slice(0, sIdx) + replacement + content.slice(eIdx);

  // In fetchChatHistory: call mergeAndRenderMessages(data.messages, true) on first load
  content = content.replace(
    'mergeAndRenderMessages(data.messages);',
    'mergeAndRenderMessages(data.messages, (renderedMsgIds.size === 0));'
  );

  // In handleSendMessage: ensure scrollToBottom
  content = content.replace(
    'renderMessageBubble(newMsg, true);',
    'renderMessageBubble(newMsg, true);\n      if (messagesListEl) messagesListEl.scrollTop = messagesListEl.scrollHeight;'
  );

  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Fixed chat order in', filePath);
}

fixChatFile('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/lora-chat-room.ejs');
fixChatFile('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/views/partials/lora-chat-room.ejs');
