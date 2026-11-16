const fs = require('fs');
const p = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/header.ejs';
let c = fs.readFileSync(p, 'utf8');

if (!c.includes('initChatUnreadBadge')) {
  const badgeScript = `
  <!-- Global LoRa Chat Unread Red Dot on Bottom Navbar -->
  <script>
    (function initChatUnreadBadge() {
      function updateChatDots() {
        const path = window.location.pathname.toLowerCase();
        const isChatPage = path.includes('/chat');
        const dots = document.querySelectorAll('.chat-nav-red-dot');
        if (isChatPage) {
          try { localStorage.removeItem('evw_chat_has_unread'); } catch (_) {}
          dots.forEach(function (d) { d.classList.add('hidden'); });
        } else {
          var hasUnread = false;
          try { hasUnread = localStorage.getItem('evw_chat_has_unread') === 'true'; } catch (_) {}
          dots.forEach(function (d) {
            if (hasUnread) d.classList.remove('hidden');
            else d.classList.add('hidden');
          });
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateChatDots);
      } else {
        updateChatDots();
      }

      function onIncomingChat(msg) {
        if (!msg) return;
        const path = window.location.pathname.toLowerCase();
        if (path.includes('/chat')) return;

        // Skip self-sent messages
        var myName = '';
        try {
          myName = (localStorage.getItem('evw_user_full_name') || '').toLowerCase().trim();
        } catch (_) {}
        var sName = String(msg.senderName || '').toLowerCase().trim();
        if (myName && sName && (sName === myName || sName.includes(myName) || myName.includes(sName))) {
          return;
        }

        try { localStorage.setItem('evw_chat_has_unread', 'true'); } catch (_) {}
        updateChatDots();
      }

      window.addEventListener('evakwar:lora-chat', function (e) {
        if (e && e.detail) onIncomingChat(e.detail);
      });

      var socket = window.__appSocket || window.evakwarAlertSocket || (typeof io !== 'undefined' ? io() : null);
      if (socket && typeof socket.on === 'function') {
        socket.on('lora:chat', onIncomingChat);
      }
    })();
  </script>
`;

  c += badgeScript;
  fs.writeFileSync(p, c, 'utf8');
  console.log('views/partials/header.ejs patched with initChatUnreadBadge!');
}
