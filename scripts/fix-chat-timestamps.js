const fs = require('fs');
const path = require('path');

// 1. Fix routes/loraRoutes.js
const loraRoutesPath = path.join(__dirname, '..', 'routes', 'loraRoutes.js');
if (fs.existsSync(loraRoutesPath)) {
  let code = fs.readFileSync(loraRoutesPath, 'utf8');

  // Fix appendChatMessage
  const oldAppendTarget = "senderBadge: `${role} | ${name} | ${nodeId}`,";
  const newAppendBadge = "senderBadge: `${role} | ${name}`,";
  if (code.includes(oldAppendTarget)) {
    code = code.replace(oldAppendTarget, newAppendBadge);
  }

  // Ensure created_at is saved alongside sent_at
  const oldSentAt = "sent_at: new Date(ts).toISOString(),";
  const newSentAt = "sent_at: new Date(ts).toISOString(),\n    created_at: new Date(ts).toISOString(),";
  if (code.includes(oldSentAt) && !code.includes('created_at: new Date(ts).toISOString()')) {
    code = code.replace(oldSentAt, newSentAt);
  }

  // Ensure timestamp is always in ms
  const oldTsLine = "const ts = chatObj.timestamp ? Number(chatObj.timestamp) : Date.now();";
  const newTsLine = `const rawTs = chatObj.timestamp ? Number(chatObj.timestamp) : Date.now();
  const ts = (rawTs < 10000000000) ? (rawTs * 1000) : rawTs;`;
  if (code.includes(oldTsLine)) {
    code = code.replace(oldTsLine, newTsLine);
  }

  fs.writeFileSync(loraRoutesPath, code, 'utf8');
  console.log('routes/loraRoutes.js patched successfully!');
}

// 2. Normalize data/lora_chat_history.json
const historyPath = path.join(__dirname, '..', 'data', 'lora_chat_history.json');
if (fs.existsSync(historyPath)) {
  try {
    const list = JSON.parse(fs.readFileSync(historyPath, 'utf8') || '[]');
    if (Array.isArray(list)) {
      const fixed = list.map(m => {
        let ts = m.timestamp ? Number(m.timestamp) : Date.now();
        if (ts < 10000000000) ts = ts * 1000;
        else if (ts > 10000000000000) ts = Math.floor(ts / 1000);
        const iso = m.sent_at || m.created_at || new Date(ts).toISOString();
        const role = String(m.senderRole || 'Resident').trim();
        let name = String(m.senderName || 'Community Member').trim();
        if (name.includes(' | !')) name = name.split(' | !')[0].trim();
        return {
          ...m,
          senderName: name,
          senderBadge: `${role} | ${name}`,
          timestamp: ts,
          sent_at: iso,
          created_at: iso
        };
      });
      fs.writeFileSync(historyPath, JSON.stringify(fixed, null, 2), 'utf8');
      console.log('data/lora_chat_history.json normalized (' + fixed.length + ' messages)!');
    }
  } catch (err) {
    console.warn('Error normalizing history:', err.message);
  }
}
