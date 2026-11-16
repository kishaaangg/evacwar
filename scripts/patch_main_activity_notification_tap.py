import os

main_act_path = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java'
with open(main_act_path, 'r', encoding='utf-8') as f:
    c = f.read()

target = '''    private void handleAlertLaunchIntent(Intent intent) {
        if (intent == null) return;
        String title = intent.getStringExtra("evw_alert_title");
        String message = intent.getStringExtra("evw_alert_message");
        String severity = intent.getStringExtra("evw_alert_severity");
        if (title != null && !title.isEmpty()) {
            intent.removeExtra("evw_alert_title");
            intent.removeExtra("evw_alert_message");
            intent.removeExtra("evw_alert_severity");
            mainHandler.postDelayed(() -> {
                try {
                    String escapedTitle = JSONObject.quote(title);
                    String escapedMsg = JSONObject.quote(message != null ? message : "");
                    String escapedSev = JSONObject.quote(severity != null ? severity : "RED");
                    String js = "if (window.triggerEmergencyModal) { window.triggerEmergencyModal(" + escapedTitle + ", " + escapedMsg + ", " + escapedSev + "); }";
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            }, 600);
        }
    }'''

replacement = '''    private void handleAlertLaunchIntent(Intent intent) {
        if (intent == null) return;
        String title = intent.getStringExtra("evw_alert_title");
        String message = intent.getStringExtra("evw_alert_message");
        String severity = intent.getStringExtra("evw_alert_severity");
        String alertId = intent.getStringExtra("evw_alert_id");
        if (title != null && !title.isEmpty()) {
            intent.removeExtra("evw_alert_title");
            intent.removeExtra("evw_alert_message");
            intent.removeExtra("evw_alert_severity");
            intent.removeExtra("evw_alert_id");
            mainHandler.postDelayed(() -> {
                try {
                    String escapedTitle = JSONObject.quote(title);
                    String escapedMsg = JSONObject.quote(message != null ? message : "");
                    String escapedSev = JSONObject.quote(severity != null ? severity : "RED");
                    String escapedId = JSONObject.quote(alertId != null ? alertId : "");
                    String js = "window.__pendingNotificationAlert = { title: " + escapedTitle + ", message: " + escapedMsg + ", severity: " + escapedSev + ", alertId: " + escapedId + " }; " +
                                "if (typeof window.openGlobalEmergencyModal === 'function') { " +
                                "  window.openGlobalEmergencyModal(window.__pendingNotificationAlert); " +
                                "} else if (typeof window.triggerEmergencyModal === 'function') { " +
                                "  window.triggerEmergencyModal(" + escapedTitle + ", " + escapedMsg + ", " + escapedSev + ", " + escapedId + "); " +
                                "}";
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            }, 600);
            // Backup retry in case WebView takes an extra second to mount on cold launch
            mainHandler.postDelayed(() -> {
                try {
                    String escapedTitle = JSONObject.quote(title);
                    String escapedMsg = JSONObject.quote(message != null ? message : "");
                    String escapedSev = JSONObject.quote(severity != null ? severity : "RED");
                    String escapedId = JSONObject.quote(alertId != null ? alertId : "");
                    String js = "if (typeof window.openGlobalEmergencyModal === 'function') { " +
                                "  const cur = document.getElementById('realtimeEmergencyModal'); " +
                                "  if (!cur || cur.style.display !== 'flex') { " +
                                "    window.openGlobalEmergencyModal({ title: " + escapedTitle + ", message: " + escapedMsg + ", severity: " + escapedSev + ", alertId: " + escapedId + " }); " +
                                "  } " +
                                "}";
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            }, 1800);
        }
    }'''

if target in c:
    c = c.replace(target, replacement, 1)
    with open(main_act_path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("Patched handleAlertLaunchIntent in MainActivity.java successfully!")
else:
    print("Target not found in MainActivity.java")
