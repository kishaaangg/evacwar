const fs = require('fs');

function patchMainActivity(filePath) {
  let raw = fs.readFileSync(filePath, 'utf8');
  let isCrlf = raw.includes('\r\n');
  let code = raw.replace(/\r\n/g, '\n');

  // 1. Add handleAlertLaunchIntent(getIntent()) in onCreate
  const targetOnCreate = `            String savedUrl = prefs.getString("server_url", "http://192.168.0.102:8080");
            if (LoraMeshService.instance != null) {
                LoraMeshService.instance.updateServerUrl(savedUrl);
            }
        } catch (Exception ignored) {}
    }`;

  const replaceOnCreate = `            String savedUrl = prefs.getString("server_url", "http://192.168.0.102:8080");
            if (LoraMeshService.instance != null) {
                LoraMeshService.instance.updateServerUrl(savedUrl);
            }
        } catch (Exception ignored) {}

        handleAlertLaunchIntent(getIntent());
    }`;

  if (code.includes(targetOnCreate)) {
    code = code.replace(targetOnCreate, replaceOnCreate);
    console.log('Patched onCreate in', filePath);
  } else {
    console.log('Target onCreate not matched');
  }

  // 2. Add navigate_to and open_lora_modal handling in handleAlertLaunchIntent
  const targetAlertHandler = `    private void handleAlertLaunchIntent(Intent intent) {
        if (intent == null) return;
        String title = intent.getStringExtra("evw_alert_title");`;

  const replaceAlertHandler = `    private void handleAlertLaunchIntent(Intent intent) {
        if (intent == null) return;

        String navTo = intent.getStringExtra("navigate_to");
        if (navTo != null && !navTo.isEmpty()) {
            intent.removeExtra("navigate_to");
            mainHandler.postDelayed(() -> {
                try {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        String js = "(function(){\\n" +
                                    "  try {\\n" +
                                    "    var p = (window.location.pathname || '').toLowerCase();\\n" +
                                    "    if (!p.includes('/chat')) {\\n" +
                                    "      window.location.href = '" + navTo + "';\\n" +
                                    "    }\\n" +
                                    "  } catch(e) {}\\n" +
                                    "})();";
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            }, 400);
        }

        boolean openLoraModal = intent.getBooleanExtra("open_lora_modal", false);
        if (openLoraModal) {
            intent.removeExtra("open_lora_modal");
            mainHandler.postDelayed(() -> {
                try {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        String js = "(function(){\\n" +
                                    "  try {\\n" +
                                    "    if (typeof window.openLoraHardwarePicker === 'function') {\\n" +
                                    "      window.openLoraHardwarePicker();\\n" +
                                    "    } else if (typeof window.openLoraConnectionModal === 'function') {\\n" +
                                    "      window.openLoraConnectionModal();\\n" +
                                    "    } else {\\n" +
                                    "      var btn = document.getElementById('connectLoraBtn') || document.getElementById('btnHeaderLoraBle') || document.querySelector('[onclick*=\\"openLora\\"]');\\n" +
                                    "      if (btn) btn.click();\\n" +
                                    "    }\\n" +
                                    "  } catch(e) {}\\n" +
                                    "})();";
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            }, 500);
        }

        String title = intent.getStringExtra("evw_alert_title");`;

  if (code.includes(targetAlertHandler)) {
    code = code.replace(targetAlertHandler, replaceAlertHandler);
    console.log('Patched handleAlertLaunchIntent in', filePath);
  } else {
    console.log('Target handleAlertLaunchIntent not matched');
  }

  // 3. Update onChatPacketReceived if not already updated
  const targetChatOld = `    public void onChatPacketReceived(final String msgId, final String sRole, final String sName, final String text) {
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
    }`;

  const replaceChatMethod = `    public void onChatPacketReceived(final String msgId, final String sRole, final String sName, final String text, final long timestampMs, final int seq) {
        mainHandler.post(() -> {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                try {
                    String escapedMsgId = JSONObject.quote(msgId != null ? msgId : "");
                    String escapedRole = JSONObject.quote(sRole != null ? sRole : "Resident");
                    String escapedName = JSONObject.quote(sName != null ? sName : "Resident");
                    String escapedText = JSONObject.quote(text != null ? text : "");
                    long finalTs = timestampMs > 0 ? timestampMs : System.currentTimeMillis();
                    String js = "(function(){\\n" +
                                "  try {\\n" +
                                "    var msg = {\\n" +
                                "      id: " + escapedMsgId + ",\\n" +
                                "      msgId: " + escapedMsgId + ",\\n" +
                                "      senderRole: " + escapedRole + ",\\n" +
                                "      senderName: " + escapedName + ",\\n" +
                                "      text: " + escapedText + ",\\n" +
                                "      message: " + escapedText + ",\\n" +
                                "      timestamp: " + finalTs + ",\\n" +
                                "      created_at: new Date(" + finalTs + ").toISOString(),\\n" +
                                "      sent_at: new Date(" + finalTs + ").toISOString(),\\n" +
                                "      seq: " + (seq > 0 ? seq : "null") + ",\\n" +
                                "      transport: 'LORA_433MHZ',\\n" +
                                "      viaLoRa: true,\\n" +
                                "      status: 'sent'\\n" +
                                "    };\\n" +
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
    }`;

  if (code.includes(targetChatOld)) {
    code = code.replace(targetChatOld, replaceChatMethod);
    console.log('Patched onChatPacketReceived in', filePath);
  }

  if (isCrlf) {
    code = code.replace(/\n/g, '\r\n');
  }
  fs.writeFileSync(filePath, code, 'utf8');
}

patchMainActivity('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java');
patchMainActivity('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java');
