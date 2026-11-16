const fs = require('fs');

function updateFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  const startMarker = 'function saveChatHistoryToDisk() {';
  const endMarker = '  saveChatHistoryToDisk();\n  return normalized;\n}';

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker, startIdx);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found in', filePath, startIdx, endIdx);
    return;
  }

  const replacement = `// Strict authoritative sequence counter to prevent client clock skew ordering bugs
let chatSeqCounter = 1;
loraChatHistory.forEach((m, idx) => {
  if (typeof m.seq === 'number' && m.seq > 0) {
    if (m.seq >= chatSeqCounter) chatSeqCounter = m.seq + 1;
  } else {
    m.seq = idx + 1;
    if (m.seq >= chatSeqCounter) chatSeqCounter = m.seq + 1;
  }
});

function saveChatHistoryToDisk() {
  try {
    fs.mkdirSync(path.dirname(CHAT_HISTORY_FILE), { recursive: true });
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(loraChatHistory.slice(-150), null, 2), 'utf8');
  } catch (_) {}
}

saveChatHistoryToDisk();

function appendChatMessage(chatObj) {
  if (!chatObj || !chatObj.text) return null;
  const msgId = String(chatObj.msgId || chatObj.id || Date.now());
  const existing = loraChatHistory.find(m => String(m.msgId || m.id) === msgId);
  if (existing) {
    if (!existing.seq) {
      existing.seq = chatSeqCounter++;
      saveChatHistoryToDisk();
    }
    return existing;
  }

  const role = String(chatObj.senderRole || 'Resident').trim();
  const name = String(chatObj.senderName || 'Community Member').trim();
  const nodeId = String(chatObj.nodeId || '!f4e213d4').trim();
  const rawTs = chatObj.timestamp ? Number(chatObj.timestamp) : Date.now();
  const ts = (rawTs < 10000000000) ? (rawTs * 1000) : rawTs;

  const normalized = {
    id: msgId,
    msgId,
    seq: chatSeqCounter++,
    senderRole: role,
    senderName: name,
    nodeId,
    senderBadge: \`\${role} | \${name}\`,
    text: String(chatObj.text || chatObj.message || '').trim(),
    message: String(chatObj.text || chatObj.message || '').trim(),
    timestamp: ts,
    sent_at: new Date(ts).toISOString(),
    created_at: new Date(ts).toISOString(),
    transport: chatObj.transport || 'LORA_433MHZ'
  };

  loraChatHistory.push(normalized);
  if (loraChatHistory.length > 150) {
    loraChatHistory = loraChatHistory.slice(-150);
  }
  saveChatHistoryToDisk();
  return normalized;
}`;

  content = content.slice(0, startIdx) + replacement + content.slice(endIdx + endMarker.length);
  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Successfully updated', filePath);
}

updateFile('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/routes/loraRoutes.js');
updateFile('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/routes/loraRoutes.js');
