const fs = require('fs');

// 1. Patch capacitor-resident-bridge.js in both workspaces
function patchCapacitorBridge(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  if (!code.includes('global.navigateToEvakWar = function')) {
    const target = "// 7. Intercept navigation links when running inside Capacitor";
    const helper = `  // 7b. Global programmatic navigation helper for Android native notifications & intents
  global.navigateToEvakWar = function (rawHref) {
    if (!rawHref) return;
    const isPreviewPrefix = global.location.pathname.startsWith('/resident-mobile');
    const prefix = isPreviewPrefix ? '/resident-mobile' : '';
    const cleanHref = rawHref.split('?')[0].split('#')[0];
    const queryOrHash = rawHref.slice(cleanHref.length);

    let targetPath = null;
    if (cleanHref.includes('/chat')) {
      targetPath = \`\${prefix}/resident/chat/index.html\`;
    } else if (cleanHref.includes('/sos')) {
      targetPath = \`\${prefix}/resident/sos/index.html\`;
    } else if (cleanHref.includes('/evacuation') || cleanHref.includes('/map')) {
      targetPath = \`\${prefix}/resident/evacuation/index.html\`;
    } else if (cleanHref.includes('/dashboard')) {
      targetPath = \`\${prefix}/resident/dashboard/index.html\`;
    }

    if (targetPath) {
      global.location.href = targetPath + queryOrHash;
    } else {
      global.location.href = rawHref;
    }
  };

  // 7. Intercept navigation links when running inside Capacitor`;

    code = code.replace(target, helper);
    fs.writeFileSync(filePath, code, 'utf8');
    console.log('[OK] Added navigateToEvakWar in ' + filePath);
  }
}

// 2. Patch MainActivity.java
function patchMainActivity(filePath) {
  let code = fs.readFileSync(filePath, 'utf8');

  const oldHandle = `    private void handleAlertLaunchIntent(Intent intent) {
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
            }, 400);
        }
    }`;

  const newHandle = `    private void handleAlertLaunchIntent(Intent intent) {
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
                                    "        window.location.href = isCap ? '/resident/chat/index.html' : '" + navTo + "';\\n" +
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
    }`;

  if (code.includes(oldHandle)) {
    code = code.replace(oldHandle, newHandle);
    fs.writeFileSync(filePath, code, 'utf8');
    console.log('[OK] Updated handleAlertLaunchIntent in ' + filePath);
  } else {
    console.warn('[WARN] Old handleAlertLaunchIntent not found in ' + filePath);
  }
}

patchCapacitorBridge('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/js/capacitor-resident-bridge.js');
patchCapacitorBridge('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/public/js/capacitor-resident-bridge.js');
patchMainActivity('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java');
patchMainActivity('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java');
