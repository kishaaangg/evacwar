import os
import re

main_path = r'c:\Users\lausi\OneDrive\Desktop\EBAKWAR_testing\android\app\src\main\java\ph\gov\baao\evakwar\resident\MainActivity.java'

with open(main_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. In onCreate: start LoraMeshService.startServiceGuard(this)
target_create = """        createEmergencyNotificationChannel();
        requestNotificationPermissionIfNeeded();
        ensureLocationPermissionsAndPrompt();
    }"""

replacement_create = """        createEmergencyNotificationChannel();
        requestNotificationPermissionIfNeeded();
        ensureLocationPermissionsAndPrompt();

        // Start 24/7 Foreground Emergency Guard (Wi-Fi + LoRa Monitor)
        LoraMeshService.startServiceGuard(this);
        try {
            SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
            String savedUrl = prefs.getString("server_url", "http://192.168.0.102:8080");
            if (LoraMeshService.instance != null) {
                LoraMeshService.instance.updateServerUrl(savedUrl);
            }
        } catch (Exception ignored) {}
    }"""

code = code.replace(target_create, replacement_create)

# 2. Add onNewIntent and handleAlertLaunchIntent
target_resume = """    @Override
    public void onResume() {
        super.onResume();
        LoraMeshService.setListener(new LoraMeshService.BleListener() {"""

replacement_resume = """    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAlertLaunchIntent(intent);
    }

    private void handleAlertLaunchIntent(Intent intent) {
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
    }

    @Override
    public void onResume() {
        super.onResume();
        handleAlertLaunchIntent(getIntent());
        LoraMeshService.setListener(new LoraMeshService.BleListener() {"""

code = code.replace(target_resume, replacement_resume)

# 3. Add setServerUrl to AndroidSettingsBridge
target_settings = """        @JavascriptInterface
        public void requestEnableBluetooth() {"""

replacement_settings = """        @JavascriptInterface
        public void setServerUrl(String url) {
            if (url != null && !url.trim().isEmpty()) {
                String clean = url.trim().replaceAll("/+$", "");
                try {
                    SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
                    prefs.edit().putString("server_url", clean).apply();
                } catch (Exception ignored) {}
                if (LoraMeshService.instance != null) {
                    LoraMeshService.instance.updateServerUrl(clean);
                }
            }
        }

        @JavascriptInterface
        public void requestEnableBluetooth() {"""

code = code.replace(target_settings, replacement_settings)

# 4. In AndroidBleBridge: disconnect without killing service
code = code.replace(
    """        @JavascriptInterface
        public void disconnect() {
            LoraMeshService.stopService(MainActivity.this);
        }""",
    """        @JavascriptInterface
        public void disconnect() {
            LoraMeshService.disconnectBle(MainActivity.this);
        }"""
)

code = code.replace(
    """                if (LoraMeshService.isConnected()) {
                    LoraMeshService.stopService(MainActivity.this);
                }""",
    """                if (LoraMeshService.isConnected()) {
                    LoraMeshService.disconnectBle(MainActivity.this);
                }"""
)

with open(main_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("SUCCESS: MainActivity.java patched successfully!")
