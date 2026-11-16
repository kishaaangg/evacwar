const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java');
let code = fs.readFileSync(targetFile, 'utf8');

// 1. instance = this in onCreate
if (!code.includes('instance = this;')) {
  code = code.replace(
    'super.onCreate(savedInstanceState);',
    'super.onCreate(savedInstanceState);\n        instance = this;'
  );
}

// 2. if (instance == this) instance = null; in onDestroy
if (!code.includes('if (instance == this) instance = null;')) {
  code = code.replace(
    'super.onDestroy();',
    'if (instance == this) instance = null;\n        super.onDestroy();'
  );
}

// 3. Add onChatPacketReceived helper method
if (!code.includes('onChatPacketReceived(')) {
  const methodCode = `
    public void onChatPacketReceived(final String msgId, final String sRole, final String sName, final String text) {
        mainHandler.post(() -> {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                try {
                    String escapedMsgId = JSONObject.quote(msgId != null ? msgId : "");
                    String escapedRole = JSONObject.quote(sRole != null ? sRole : "Resident");
                    String escapedName = JSONObject.quote(sName != null ? sName : "Resident");
                    String escapedText = JSONObject.quote(text != null ? text : "");
                    String js = "(function(){\\n" +
                                "  try {\\n" +
                                "    var msg = { msgId: " + escapedMsgId + ", senderRole: " + escapedRole + ", senderName: " + escapedName + ", text: " + escapedText + ", transport: 'LORA_433MHZ', viaLoRa: true };\\n" +
                                "    var myName = '';\\n" +
                                "    try { myName = (localStorage.getItem('evw_user_full_name') || '').toLowerCase().trim(); } catch(_) {}\\n" +
                                "    var sName = " + escapedName + ".toLowerCase().trim();\\n" +
                                "    var isSelf = (myName && sName && (sName === myName || sName.indexOf(myName) !== -1 || myName.indexOf(sName) !== -1));\\n" +
                                "    if (!isSelf) {\\n" +
                                "      try { localStorage.setItem('evw_chat_has_unread', 'true'); } catch(_) {}\\n" +
                                "      var p = (window.location.pathname || '').toLowerCase();\\n" +
                                "      if (!p.includes('/chat')) {\\n" +
                                "        document.querySelectorAll('.chat-nav-red-dot').forEach(function(d){ d.classList.remove('hidden'); });\\n" +
                                "      }\\n" +
                                "    }\\n" +
                                "    window.dispatchEvent(new CustomEvent('evakwar:lora-chat', { detail: msg }));\\n" +
                                "  } catch(e) {}\\n" +
                                "})();";
                    this.bridge.getWebView().evaluateJavascript(js, null);
                } catch (Exception ignored) {}
            }
        });
    }
`;
  code = code.replace(
    'public void onResume() {',
    methodCode + '\n    @Override\n    public void onResume() {'
  );
}

// 4. Update onResume() to light up red dot if unread chat arrived while paused
if (!code.includes('hasUnreadChatFromPrefs')) {
  const onResumeInjection = `        // Restore unread chat red dot if message arrived while paused or offline
        try {
            SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
            boolean hasUnreadChatFromPrefs = prefs.getBoolean("evw_chat_has_unread", false) || LoraMeshService.hasUnreadChatStatic;
            if (hasUnreadChatFromPrefs) {
                mainHandler.postDelayed(() -> {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        String js = "(function(){\\n" +
                                    "  try {\\n" +
                                    "    localStorage.setItem('evw_chat_has_unread', 'true');\\n" +
                                    "    var p = (window.location.pathname || '').toLowerCase();\\n" +
                                    "    if (!p.includes('/chat')) {\\n" +
                                    "      document.querySelectorAll('.chat-nav-red-dot').forEach(function(d){ d.classList.remove('hidden'); });\\n" +
                                    "    }\\n" +
                                    "  } catch(e) {}\\n" +
                                    "})();";
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                }, 350);
            }
        } catch (Exception ignored) {}
`;
  code = code.replace(
    'handleAlertLaunchIntent(getIntent());',
    'handleAlertLaunchIntent(getIntent());\n' + onResumeInjection
  );
}

// 5. Add hasUnreadChat and clearUnreadChat to AndroidBleBridge
if (!code.includes('public boolean hasUnreadChat()')) {
  const bridgeMethods = `
        @JavascriptInterface
        public boolean hasUnreadChat() {
            try {
                SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
                return prefs.getBoolean("evw_chat_has_unread", false) || LoraMeshService.hasUnreadChatStatic;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void clearUnreadChat() {
            try {
                SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
                prefs.edit().putBoolean("evw_chat_has_unread", false).apply();
            } catch (Exception ignored) {}
            LoraMeshService.hasUnreadChatStatic = false;
        }
`;
  code = code.replace(
    'public void setChatOpen(boolean isOpen) {',
    bridgeMethods + '\n        @JavascriptInterface\n        public void setChatOpen(boolean isOpen) {'
  );
}

fs.writeFileSync(targetFile, code, 'utf8');
console.log('MainActivity.java successfully patched!');
