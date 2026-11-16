const fs = require('fs');

function updateLoraChatRoom(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  // 1. Ensure getMessageUniqueKey is defined right before renderMessageBubble
  const getNormTsMarker = 'function getNormalizedTimestampMs(msg) {';
  const renderBubbleMarker = 'function renderMessageBubble(msg, autoScroll = true) {';

  if (!content.includes('function getMessageUniqueKey(')) {
    content = content.replace(renderBubbleMarker, `function getMessageUniqueKey(m) {
      if (!m) return '';
      if (m.msgId) return String(m.msgId);
      if (m.id) return String(m.id);
      return \`\${m.senderName || ''}_\${getNormalizedTimestampMs(m)}_\${m.text || ''}\`;
    }

    function renderMessageBubble(msg, autoScroll = true) {`);
  }

  // 2. Replace renderMessageBubble, updateMessageStatusInDom, mergeAndRenderMessages, fetchChatHistory, handleSendMessage, retryMessage, submitCurrentMessage, listeners
  const startReplaceMarker = 'function renderMessageBubble(msg, autoScroll = true) {';
  const endReplaceMarker = '    fetchChatHistory();\n    // Poll chat history every 4 seconds when online';

  const sIdx = content.indexOf(startReplaceMarker);
  const eIdx = content.indexOf(endReplaceMarker, sIdx);

  if (sIdx === -1 || eIdx === -1) {
    console.error('Failed to locate chat room markers in', filePath, sIdx, eIdx);
    return;
  }

  const replacementBody = `function renderMessageBubble(msg, autoScroll = true) {
      if (!msg || !msg.text) return;
      const msgKey = getMessageUniqueKey(msg);
      
      const existingEl = document.getElementById(\`chat_msg_\${msgKey}\`);
      if (existingEl) {
        updateMessageStatusInDom(existingEl, msg);
        return;
      }
      renderedMsgIds.add(msgKey);

      const sRole = msg.senderRole || 'Resident';
      let sName = msg.senderName || 'Resident';
      if (sName.includes(' | !')) {
        sName = sName.split(' | !')[0].trim();
      }
      const badgeText = \`\${sRole} | \${sName}\`;

      const isMine = (
        String(sName).trim().toLowerCase() === String(currentName).trim().toLowerCase() &&
        String(sRole).trim().toLowerCase() === String(currentRole).trim().toLowerCase()
      );

      const pillClass = getRoleBadgeStyle(sRole);
      const timeStr = formatTimeLabel(msg);

      // Determine transport badge: Sent via Wi-Fi vs Sent via LoRa
      const isLora = (msg.transport === 'LORA_433MHZ' || msg.via === 'LORA' || msg.viaLoRa);
      const transportLabel = isLora ? '433.875 MHz LoRa' : 'Wi-Fi / Internet';
      const transportIcon = isLora ? 'ph-broadcast' : 'ph-wifi-high';

      // Status indicator: sent / pending / failed
      let statusHtml = '';
      if (isMine) {
        if (msg.status === 'failed') {
          statusHtml = \`<span class="text-rose-300 font-extrabold flex items-center gap-0.5"><i class="ph ph-warning-circle"></i> Not Sent (Tap to retry)</span>\`;
        } else if (msg.status === 'pending') {
          statusHtml = \`<span class="text-amber-200 font-semibold flex items-center gap-0.5"><i class="ph ph-clock"></i> Sending...</span>\`;
        } else {
          statusHtml = \`<span class="flex items-center gap-0.5"><i class="ph \${transportIcon}"></i> \${transportLabel}</span>\`;
        }
      } else {
        statusHtml = \`<span class="flex items-center gap-0.5"><i class="ph \${transportIcon}"></i> \${transportLabel}</span>\`;
      }

      const wrapper = document.createElement('div');
      wrapper.id = \`chat_msg_\${msgKey}\`;
      wrapper.setAttribute('data-msg-key', msgKey);
      wrapper.className = \`chat-bubble-wrapper flex flex-col \${isMine ? 'items-end' : 'items-start'} animate-fade-in\`;

      wrapper.innerHTML = \`
        <div class="flex items-center gap-1.5 mb-0.5 px-1 max-w-[92%]">
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border \${pillClass} truncate">
            <span>\${escapeHtml(badgeText)}</span>
          </span>
          <span class="text-[9.5px] text-slate-400 font-medium shrink-0">\${escapeHtml(timeStr)}</span>
        </div>
        <div class="max-w-[88%] sm:max-w-[78%] rounded-2xl px-3 py-2 text-xs sm:text-sm leading-relaxed shadow-2xs \${
          isMine
            ? (msg.status === 'failed' ? 'bg-red-700 text-white rounded-tr-xs' : 'bg-blue-600 text-white rounded-tr-xs')
            : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs'
        }">
          <div class="break-words">\${escapeHtml(msg.text)}</div>
          <div class="msg-status-bar mt-1 flex items-center justify-end gap-1 text-[9px] \${isMine ? 'text-blue-200' : 'text-slate-400'}">
            \${statusHtml}
          </div>
        </div>
      \`;

      if (isMine && msg.status === 'failed') {
        wrapper.style.cursor = 'pointer';
        wrapper.title = 'Tap to retry sending';
        wrapper.onclick = () => retryMessage(msg);
      }

      messagesListEl.appendChild(wrapper);
      if (autoScroll) {
        messagesListEl.scrollTop = messagesListEl.scrollHeight;
      }
    }

    function updateMessageStatusInDom(el, msg) {
      const statusBar = el.querySelector('.msg-status-bar');
      if (!statusBar) return;
      const isLora = (msg.transport === 'LORA_433MHZ' || msg.via === 'LORA');
      const transportLabel = isLora ? '433.875 MHz LoRa' : 'Wi-Fi / Internet';
      const transportIcon = isLora ? 'ph-broadcast' : 'ph-wifi-high';

      if (msg.status === 'failed') {
        statusBar.innerHTML = \`<span class="text-rose-300 font-extrabold flex items-center gap-0.5"><i class="ph ph-warning-circle"></i> Not Sent (Tap to retry)</span>\`;
      } else if (msg.status === 'pending') {
        statusBar.innerHTML = \`<span class="text-amber-200 font-semibold flex items-center gap-0.5"><i class="ph ph-clock"></i> Sending...</span>\`;
      } else {
        statusBar.innerHTML = \`<span class="flex items-center gap-0.5"><i class="ph \${transportIcon}"></i> \${transportLabel}</span>\`;
      }
    }

    function mergeAndRenderMessages(serverMessages) {
      const localMsgs = getLocalCachedMessages();
      const mapById = new Map();

      // 1. Process server messages first (Server is authoritative source of truth!)
      const srvList = Array.isArray(serverMessages) ? serverMessages : [];
      for (const sm of srvList) {
        if (!sm || !sm.text) continue;
        const key = getMessageUniqueKey(sm);
        mapById.set(key, Object.assign({}, sm, { status: 'sent' }));
      }

      // 2. Merge local cached messages
      for (const lm of localMsgs) {
        if (!lm || !lm.text) continue;
        const key = getMessageUniqueKey(lm);
        if (mapById.has(key)) {
          // If server already has it, server's seq, timestamp, and metadata take precedence over local optimistic state!
          const srv = mapById.get(key);
          mapById.set(key, Object.assign({}, lm, srv, { status: 'sent' }));
        } else {
          // Unconfirmed message (offline LoRa or pending transmission)
          mapById.set(key, lm);
        }
      }

      allMessages = Array.from(mapById.values()).sort((a, b) => {
        // Priority 1: Monotonic Server Sequence Number (Infallible cross-device chronological order)
        const seqA = (typeof a.seq === 'number' && a.seq > 0) ? a.seq : null;
        const seqB = (typeof b.seq === 'number' && b.seq > 0) ? b.seq : null;

        if (seqA !== null && seqB !== null) {
          return seqA - seqB;
        }
        // Confirmed server messages appear before unconfirmed local pending messages
        if (seqA !== null && seqB === null) return -1;
        if (seqA === null && seqB !== null) return 1;

        // Priority 2: Fallback to normalized timestamp for unsequenced/offline messages
        return getNormalizedTimestampMs(a) - getNormalizedTimestampMs(b);
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
        const wasAtBottom = (messagesListEl.scrollHeight - messagesListEl.scrollTop - messagesListEl.clientHeight) < 80;
        messagesListEl.innerHTML = '';
        renderedMsgIds.clear();
        allMessages.forEach(m => renderMessageBubble(m, false));
        if (wasAtBottom || renderedKeys.length === 0) {
          messagesListEl.scrollTop = messagesListEl.scrollHeight;
        }
      } else {
        allMessages.forEach(m => {
          const k = getMessageUniqueKey(m);
          const el = document.getElementById(\`chat_msg_\${k}\`);
          if (el) updateMessageStatusInDom(el, m);
        });
      }
    }

    async function fetchChatHistory() {
      updateTransportUi();
      const hallBase = getHallServerUrl();
      const endpoints = ['/api/lora/chat'];
      if (hallBase && !hallBase.includes('localhost') && window.location.origin !== hallBase) {
        endpoints.unshift(\`\${hallBase}/api/lora/chat\`);
      }

      for (const ep of endpoints) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 2500);
          const res = await fetch(ep, { signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.messages)) {
              mergeAndRenderMessages(data.messages);
              return;
            }
          }
        } catch (_e) {}
      }
      mergeAndRenderMessages([]);
    }

    function handleSendMessage(rawText, existingMsgId = null) {
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
        seq: null,
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
      const existingIdx = cached.findIndex(m => getMessageUniqueKey(m) === msgId);
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
          window.EvacWarToast('Message queued locally. Connect LoRa or Wi-Fi to transmit.', 'warning');
        }
        return;
      }

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
          }).then(async res => {
            if (res.ok) {
              const resData = await res.json().catch(() => null);
              if (!isLoraConnected) newMsg.transport = 'WIFI';
              newMsg.status = 'sent';
              if (resData && resData.chatMessage) {
                if (resData.chatMessage.seq) newMsg.seq = resData.chatMessage.seq;
                if (resData.chatMessage.timestamp) newMsg.timestamp = resData.chatMessage.timestamp;
              }
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
        const uIdx = updated.findIndex(m => getMessageUniqueKey(m) === msgId);
        if (uIdx >= 0) updated[uIdx] = Object.assign(updated[uIdx], newMsg);
        else updated.push(newMsg);
        saveLocalCachedMessages(updated);
        mergeAndRenderMessages(updated);
      });
    }

    function retryMessage(msg) {
      if (!msg) return;
      msg.status = 'pending';
      renderMessageBubble(msg, false);
      handleSendMessage(msg.text, msg.msgId || msg.id);
    }

    function submitCurrentMessage() {
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
    }

    document.querySelectorAll('.lora-quick-chip').forEach(btn => {
      btn.addEventListener('click', function () {
        const preset = this.getAttribute('data-quick-msg');
        if (preset) {
          handleSendMessage(preset);
        }
      });
    });

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        fetchChatHistory();
      });
    }

    // Listen for inbound 433.875 MHz LoRa chat packets
    window.addEventListener('evakwar:lora-chat', function (ev) {
      if (ev && ev.detail) {
        const loraMsg = ev.detail;
        const cached = getLocalCachedMessages();
        const key = getMessageUniqueKey(loraMsg);
        const idx = cached.findIndex(m => getMessageUniqueKey(m) === key);
        if (idx >= 0) cached[idx] = Object.assign(cached[idx], loraMsg);
        else cached.push(loraMsg);
        saveLocalCachedMessages(cached);
        mergeAndRenderMessages(cached);
      }
    });

    // Listen for Socket.IO real-time chat broadcasts
    function bindChatSocket() {
      const socket = window.__appSocket || window.evakwarAlertSocket || (typeof io !== 'undefined' ? io() : null);
      if (socket) {
        socket.on('lora:chat', function (msg) {
          if (msg) {
            const cached = getLocalCachedMessages();
            const key = getMessageUniqueKey(msg);
            const idx = cached.findIndex(m => getMessageUniqueKey(m) === key);
            if (idx >= 0) cached[idx] = Object.assign(cached[idx], msg);
            else cached.push(msg);
            saveLocalCachedMessages(cached);
            mergeAndRenderMessages(cached);
          }
        });
      }
    }
    bindChatSocket();
    setTimeout(bindChatSocket, 600);

    // Update status when LoRa hardware connects/disconnects
    if (window.evakwarLoraClient && typeof window.evakwarLoraClient.on === 'function') {
      window.evakwarLoraClient.on('status', updateTransportUi);
    }
    window.addEventListener('online', updateTransportUi);
    window.addEventListener('offline', updateTransportUi);

`;

  content = content.slice(0, sIdx) + replacementBody + content.slice(eIdx);
  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully updated chat room in', filePath);
}

function updateBottomNav(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  // Replace all -top-2 sm:-top-2.5 with top-0 sm:top-0.5
  content = content.replace(/-top-2 sm:-top-2\.5/g, 'top-0 sm:top-0.5');

  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully updated bottom-nav in', filePath);
}

updateLoraChatRoom('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/lora-chat-room.ejs');
updateLoraChatRoom('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/views/partials/lora-chat-room.ejs');

updateBottomNav('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/bottom-nav.ejs');
updateBottomNav('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/views/partials/bottom-nav.ejs');
