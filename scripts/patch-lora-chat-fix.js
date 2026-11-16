const fs = require('fs');
const p = 'views/partials/lora-chat-room.ejs';
let code = fs.readFileSync(p, 'utf8');

// Replace formatTimeLabel with getNormalizedTimestampMs and new formatTimeLabel
const oldTimeFunc = `    function formatTimeLabel(msg) {
      if (msg.created_at) {
        const d = new Date(msg.created_at);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }
      if (msg.timestamp) {
        const ts = Number(msg.timestamp) < 10000000000 ? Number(msg.timestamp) * 1000 : Number(msg.timestamp);
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }
      return 'Just now';
    }`;

const newTimeFunc = `    function getNormalizedTimestampMs(msg) {
      if (!msg) return Date.now();
      const iso = msg.created_at || msg.sent_at;
      if (iso) {
        const ms = new Date(iso).getTime();
        if (!isNaN(ms) && ms > 0) return ms;
      }
      if (msg.timestamp) {
        const num = Number(msg.timestamp);
        if (!isNaN(num) && num > 0) {
          if (num < 10000000000) return num * 1000;
          if (num < 10000000000000) return num;
          return Math.floor(num / 1000);
        }
      }
      return Date.now();
    }

    function formatTimeLabel(msg) {
      const ms = getNormalizedTimestampMs(msg);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return 'Just now';
    }`;

// Replace formatTimeLabel
code = code.replace(oldTimeFunc.replace(/\r\n/g, '\n'), newTimeFunc);

// Replace mergeAndRenderMessages block
const mergeStart = 'function mergeAndRenderMessages(serverMessages) {';
const mergeEnd = 'async function fetchChatHistory() {';

const idxMStart = code.indexOf(mergeStart);
const idxMEnd = code.indexOf(mergeEnd);

if (idxMStart !== -1 && idxMEnd !== -1) {
  const newMergeBlock = `function mergeAndRenderMessages(serverMessages) {
      const localMsgs = getLocalCachedMessages();
      const combined = [...(Array.isArray(serverMessages) ? serverMessages : []), ...localMsgs];

      const mapById = new Map();
      for (const m of combined) {
        if (!m || !m.text) continue;
        const key = String(m.msgId || m.id || \`\${m.senderName}-\${getNormalizedTimestampMs(m)}-\${m.text}\`);
        if (!mapById.has(key)) {
          mapById.set(key, m);
        } else {
          const curr = mapById.get(key);
          const resolvedStatus = (curr.status === 'sent' || m.status === 'sent') ? 'sent' : (curr.status || m.status || 'sent');
          mapById.set(key, Object.assign({}, curr, m, { status: resolvedStatus }));
        }
      }

      allMessages = Array.from(mapById.values()).sort((a, b) => {
        return getNormalizedTimestampMs(a) - getNormalizedTimestampMs(b);
      });

      if (allMessages.length === 0) {
        const initIso = new Date().toISOString();
        allMessages = [{
          id: 'INIT01',
          msgId: 'INIT01',
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

      // Check if message count or keys changed before resetting DOM
      const currentKeys = allMessages.map(m => String(m.msgId || m.id || \`\${m.senderName}-\${getNormalizedTimestampMs(m)}-\${m.text}\`));
      let needsFullRender = (messagesListEl.children.length === 0) || (currentKeys.length !== renderedMsgIds.size);
      if (!needsFullRender) {
        for (const k of currentKeys) {
          if (!renderedMsgIds.has(k)) {
            needsFullRender = true;
            break;
          }
        }
      }

      if (needsFullRender) {
        messagesListEl.innerHTML = '';
        renderedMsgIds.clear();
        allMessages.forEach(m => renderMessageBubble(m, false));
        messagesListEl.scrollTop = messagesListEl.scrollHeight;
      } else {
        allMessages.forEach(m => {
          const k = String(m.msgId || m.id || \`\${m.senderName}-\${getNormalizedTimestampMs(m)}-\${m.text}\`);
          const el = document.getElementById(\`chat_msg_\${k}\`);
          if (el) updateMessageStatusInDom(el, m);
        });
      }
    }

    `;

  code = code.substring(0, idxMStart) + newMergeBlock + code.substring(idxMEnd);
  console.log('Replaced mergeAndRenderMessages successfully!');
}

// Replace newMsg timestamp in handleSendMessage
const oldNewMsgStart = 'const nowSec = Math.floor(Date.now() / 1000);';
const oldNewMsgEnd = 'renderMessageBubble(newMsg, true);';

const idxNStart = code.indexOf(oldNewMsgStart);
const idxNEnd = code.indexOf(oldNewMsgEnd);

if (idxNStart !== -1 && idxNEnd !== -1) {
  const newNewMsgBlock = `const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      const initialTransport = isLoraConnected ? 'LORA_433MHZ' : (isOnline ? 'WIFI' : 'OFFLINE');
      const initialStatus = (!isOnline && !isLoraConnected && SERVER_ROLE !== 'Admin') ? 'failed' : 'pending';

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

      // Render immediately
      `;

  code = code.substring(0, idxNStart) + newNewMsgBlock + code.substring(idxNEnd);
  console.log('Replaced newMsg creation with ms timestamp successfully!');
}

// Replace form listener and send button handler
const oldFormHandler = `if (chatFormEl) {
      chatFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!chatInputEl) return;
        const val = chatInputEl.value;
        if (!val || !val.trim()) return;
        chatInputEl.value = '';
        handleSendMessage(val);
      });
    }`;

const newFormHandler = `function submitCurrentMessage() {
      if (!chatInputEl) return;
      const val = chatInputEl.value;
      if (!val || !val.trim()) return;
      chatInputEl.value = '';
      handleSendMessage(val);
    }

    if (chatFormEl) {
      chatFormEl.addEventListener('submit', function (e) {
        e.preventDefault();
        e.stopPropagation();
        submitCurrentMessage();
      });
    }

    const sendBtnEl = document.getElementById('loraChatSendBtn');
    if (sendBtnEl) {
      sendBtnEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        submitCurrentMessage();
      });
    }

    if (chatInputEl) {
      chatInputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submitCurrentMessage();
        }
      });
    }`;

code = code.replace(oldFormHandler.replace(/\r\n/g, '\n'), newFormHandler);

fs.writeFileSync(p, code, 'utf8');
console.log('views/partials/lora-chat-room.ejs updated successfully!');
