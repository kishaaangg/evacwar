const fs = require('fs');

const paths = [
  'public/js/lora-mesh-client.js',
  'resident-mobile/js/lora-mesh-client.js',
  'android/app/src/main/assets/public/js/lora-mesh-client.js'
];

paths.forEach(p => {
  if (fs.existsSync(p)) {
    let code = fs.readFileSync(p, 'utf8');

    // 1. Remove node ID from senderBadge
    const oldBadge = "senderBadge: `${cleanRole} | ${cleanName} | ${resolvedNode}`";
    const newBadge = "senderBadge: `${cleanRole} | ${cleanName}`";
    if (code.includes(oldBadge)) {
      code = code.replace(oldBadge, newBadge);
    }

    // 2. Notify native bridge about self-sent message and active user
    const oldProc = "this._processedChatIds.add(id);";
    const newProc = `this._processedChatIds.add(id);
      if (typeof window !== 'undefined' && window.AndroidBleBridge) {
        if (typeof window.AndroidBleBridge.markMessageSentBySelf === 'function') {
          try { window.AndroidBleBridge.markMessageSentBySelf(id); } catch (_) {}
        }
        if (typeof window.AndroidBleBridge.setActiveUser === 'function') {
          try { window.AndroidBleBridge.setActiveUser(cleanName, cleanRole); } catch (_) {}
        }
      }`;

    if (code.includes(oldProc) && !code.includes('markMessageSentBySelf')) {
      code = code.replace(oldProc, newProc);
    }

    fs.writeFileSync(p, code, 'utf8');
    console.log('Successfully patched ' + p);
  }
});
