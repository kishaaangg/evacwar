const fs = require('fs');

const files = [
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java',
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java'
];

files.forEach(fp => {
  let code = fs.readFileSync(fp, 'utf8');

  // Find start and end of handleAlertLaunchIntent
  const startIdx = code.indexOf('private void handleAlertLaunchIntent(Intent intent)');
  if (startIdx === -1) {
    console.error('handleAlertLaunchIntent not found in ' + fp);
    return;
  }

  // Find closing brace of handleAlertLaunchIntent
  // It is right before '@Override\n    public void onResume()'
  const endIdx = code.indexOf('@Override\n    public void onResume()', startIdx);
  if (endIdx === -1) {
    // Try with CRLF
    const endIdxCrlf = code.indexOf('@Override\r\n    public void onResume()', startIdx);
    if (endIdxCrlf === -1) {
      console.error('onResume not found after handleAlertLaunchIntent in ' + fp);
      return;
    }
  }

  const effectiveEnd = (code.indexOf('@Override\n    public void onResume()', startIdx) !== -1)
    ? code.indexOf('@Override\n    public void onResume()', startIdx)
    : code.indexOf('@Override\r\n    public void onResume()', startIdx);

  const newMethod = `private void handleAlertLaunchIntent(Intent intent) {
        if (intent == null) return;

        String navTo = intent.getStringExtra("navigate_to");
        if (navTo != null && !navTo.isEmpty()) {
            intent.removeExtra("navigate_to");
            Runnable doNav = () -> {
                try {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        String js = "(function(){\\n" +
                                    "  try {\\n" +
                                    "    var p = (window.location.pathname || '').toLowerCase();\\n" +
                                    "    if (!p.includes('/chat')) {\\n" +
                                    "      if (typeof window.navigateToEvakWar === 'function') {\\n" +
                                    "        window.navigateToEvakWar('" + navTo + "');\\n" +
                                    "      } else {\\n" +
                                    "        var isCap = (window.location.protocol === 'file:' || window.location.hostname === 'localhost');\\n" +
                                    "        var dest = isCap ? '/resident/chat/index.html' : '" + navTo + "';\\n" +
                                    "        window.location.href = dest;\\n" +
                                    "      }\\n" +
                                    "    }\\n" +
                                    "  } catch(e) {}\\n" +
                                    "})();";
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            };
            mainHandler.postDelayed(doNav, 300);
            mainHandler.postDelayed(doNav, 1100);
        }

        boolean openLoraModal = intent.getBooleanExtra("open_lora_modal", false);
        if (openLoraModal) {
            intent.removeExtra("open_lora_modal");
            Runnable triggerModal = () -> {
                try {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        String js = "(function(){\\n" +
                                    "  try {\\n" +
                                    "    if (typeof window.openLoraHardwarePicker === 'function') {\\n" +
                                    "      window.openLoraHardwarePicker();\\n" +
                                    "    } else if (typeof window.openLoraConnectionModal === 'function') {\\n" +
                                    "      window.openLoraConnectionModal();\\n" +
                                    "    } else {\\n" +
                                    "      var btn = document.getElementById('btnHeaderLoraBle') || document.getElementById('connectLoraBtn') || document.querySelector('[onclick*=\\"openLora\\"]');\\n" +
                                    "      if (btn) btn.click();\\n" +
                                    "    }\\n" +
                                    "  } catch(e) {}\\n" +
                                    "})();";
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            };
            mainHandler.postDelayed(triggerModal, 300);
            mainHandler.postDelayed(triggerModal, 1100);
        }
    }

    `;

  code = code.slice(0, startIdx) + newMethod + code.slice(effectiveEnd);
  fs.writeFileSync(fp, code, 'utf8');
  console.log('[OK] Successfully patched handleAlertLaunchIntent in ' + fp);
});
