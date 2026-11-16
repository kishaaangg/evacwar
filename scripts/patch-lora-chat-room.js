const fs = require('fs');
const p = 'views/partials/lora-chat-room.ejs';
let code = fs.readFileSync(p, 'utf8');

// 1. Add CSS style block at top if not present
if (!code.includes('body.chat-keyboard-active')) {
  const styleBlock = `<style>
  body.chat-keyboard-active #residentBottomNav,
  body.chat-keyboard-active #staffBottomNav,
  body.chat-keyboard-active nav.fixed.bottom-0 {
    display: none !important;
  }
</style>
`;
  code = styleBlock + code;
}

// 2. Add data-offline-enabled and data-lora-chat to form
code = code.replace(
  '<form id="loraChatForm" class="',
  '<form id="loraChatForm" data-offline-enabled="true" data-lora-chat="true" class="'
);

// 3. Fix badgeText parsing in renderMessageBubble
const oldBadgeLine = "const sName = msg.senderName || 'Resident';";
const newBadgeLine = `let sName = msg.senderName || 'Resident';
      if (sName.includes(' | !')) {
        sName = sName.split(' | !')[0].trim();
      }`;
if (code.includes(oldBadgeLine) && !code.includes("sName.includes(' | !')")) {
  code = code.replace(oldBadgeLine, newBadgeLine);
}

// 4. Update adjustHeightForViewport and add bottom nav hiding
const oldViewportFuncStart = '// Viewport keyboard resize handler for mobile screens (1080x2400 etc.)';
const oldViewportFuncEnd = 'function resolveActiveIdentity() {';

const idxStart = code.indexOf(oldViewportFuncStart);
const idxEnd = code.indexOf(oldViewportFuncEnd);

if (idxStart !== -1 && idxEnd !== -1) {
  const newKeyboardCode = `// Keyboard and bottom navbar visibility handler
    function hideBottomNav() {
      document.body.classList.add('chat-keyboard-active');
      const navs = document.querySelectorAll('#residentBottomNav, #staffBottomNav, nav.fixed.bottom-0');
      navs.forEach(n => { n.style.setProperty('display', 'none', 'important'); });
      adjustHeightForViewport();
    }

    function showBottomNav() {
      document.body.classList.remove('chat-keyboard-active');
      const navs = document.querySelectorAll('#residentBottomNav, #staffBottomNav, nav.fixed.bottom-0');
      navs.forEach(n => { n.style.removeProperty('display'); });
      adjustHeightForViewport();
    }

    function checkKeyboardState() {
      const isInputFocused = (document.activeElement === chatInputEl);
      const isVisualShrunk = (window.visualViewport && (window.visualViewport.height < window.innerHeight - 130));
      if (isInputFocused || isVisualShrunk) {
        hideBottomNav();
      } else {
        showBottomNav();
      }
    }

    function adjustHeightForViewport() {
      const isKeyboard = document.body.classList.contains('chat-keyboard-active') || 
                         (document.activeElement === chatInputEl) ||
                         (window.visualViewport && (window.visualViewport.height < window.innerHeight - 130));
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      const navEl = isKeyboard ? null : document.querySelector('nav.fixed.bottom-0, #residentBottomNav, #staffBottomNav');
      const navHeight = (navEl && navEl.offsetHeight && navEl.style.display !== 'none') ? navEl.offsetHeight : 0;
      const headerEl = document.querySelector('header.app-header');
      const headerHeight = (headerEl && headerEl.offsetHeight) ? headerEl.offsetHeight : 52;
      
      const available = vh - headerHeight - navHeight - 8;
      if (chatContainerEl && available > 200) {
        chatContainerEl.style.height = \`\${available}px\`;
        chatContainerEl.style.maxHeight = \`\${available}px\`;
      }
      if (messagesListEl) {
        messagesListEl.scrollTop = messagesListEl.scrollHeight;
      }
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', checkKeyboardState);
      window.visualViewport.addEventListener('scroll', checkKeyboardState);
    }
    window.addEventListener('resize', checkKeyboardState);
    setTimeout(adjustHeightForViewport, 150);

    if (chatInputEl) {
      chatInputEl.addEventListener('focus', () => {
        hideBottomNav();
        setTimeout(() => {
          adjustHeightForViewport();
          chatInputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 150);
      });

      chatInputEl.addEventListener('blur', () => {
        setTimeout(() => {
          if (document.activeElement !== chatInputEl) {
            checkKeyboardState();
          }
        }, 120);
      });

      chatInputEl.addEventListener('input', () => {
        hideBottomNav();
      });
    }

    `;

  code = code.substring(0, idxStart) + newKeyboardCode + code.substring(idxEnd);
  console.log('Replaced viewport and keyboard handler successfully!');
}

// 5. In resolveActiveIdentity: register user with Android bridge
const targetIdentitySync = "if (identityBadgeEl) {\n        identityBadgeEl.textContent = `${currentRole} | ${currentName}`;\n      }";
const newIdentitySync = `// Notify Android bridge so native background service suppresses self-notifications
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.setActiveUser === 'function') {
        try { window.AndroidBleBridge.setActiveUser(currentName, currentRole); } catch (_) {}
      }

      if (identityBadgeEl) {
        identityBadgeEl.textContent = \`\${currentRole} | \${currentName}\`;
      }`;
if (code.includes(targetIdentitySync)) {
  code = code.replace(targetIdentitySync, newIdentitySync);
  console.log('Added Android bridge active user sync in resolveActiveIdentity!');
}

// 6. In handleSendMessage: mark msgId sent by self
const targetSendCall = "if (lora && isLoraConnected && typeof lora.sendChatMessage === 'function') {";
const additionSendCall = `// Notify Android bridge to register msgId as sent by self
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.markMessageSentBySelf === 'function') {
        try { window.AndroidBleBridge.markMessageSentBySelf(msgId); } catch (_) {}
      }

      if (lora && isLoraConnected && typeof lora.sendChatMessage === 'function') {`;
if (code.includes(targetSendCall) && !code.includes('markMessageSentBySelf')) {
  code = code.replace(targetSendCall, additionSendCall);
  console.log('Added markMessageSentBySelf in handleSendMessage!');
}

fs.writeFileSync(p, code, 'utf8');
console.log('views/partials/lora-chat-room.ejs updated successfully!');
