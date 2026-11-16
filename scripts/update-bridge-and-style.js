const fs = require('fs');

function updateBridge(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  const oldCode = `const pendingMsg = {
                id: body.msgId || String(Date.now()),
                msgId: body.msgId || String(Date.now()),
                senderRole: body.senderRole || 'Resident',`;

  const newCode = `const pendingMsg = {
                id: body.msgId || String(Date.now()),
                msgId: body.msgId || String(Date.now()),
                seq: null,
                senderRole: body.senderRole || 'Resident',`;

  if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
    console.log('Updated bridge:', filePath);
  }
}

function updateChatContainer(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

  content = content.replace(
    'style="height: 100dvh; max-height: 100dvh; box-sizing: border-box;"',
    'style="height: calc(100dvh - 130px); max-height: calc(100dvh - 130px); box-sizing: border-box;"'
  );

  content = content.replace(
    'const available = vh - headerHeight - navHeight - 8;',
    'const available = vh - headerHeight - navHeight - 14;'
  );

  content = content.replace(
    'setTimeout(adjustHeightForViewport, 150);',
    'adjustHeightForViewport();\n    setTimeout(adjustHeightForViewport, 50);\n    setTimeout(adjustHeightForViewport, 180);'
  );

  fs.writeFileSync(filePath, content.replace(/\n/g, '\r\n'), 'utf8');
  console.log('Updated chat container style:', filePath);
}

updateBridge('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/js/capacitor-resident-bridge.js');
updateBridge('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/public/js/capacitor-resident-bridge.js');

updateChatContainer('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/lora-chat-room.ejs');
updateChatContainer('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/views/partials/lora-chat-room.ejs');
