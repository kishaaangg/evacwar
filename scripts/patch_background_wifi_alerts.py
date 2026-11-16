import os
import re

service_path = r'c:\Users\lausi\OneDrive\Desktop\EBAKWAR_testing\android\app\src\main\java\ph\gov\baao\evakwar\resident\LoraMeshService.java'
main_path = r'c:\Users\lausi\OneDrive\Desktop\EBAKWAR_testing\android\app\src\main\java\ph\gov\baao\evakwar\resident\MainActivity.java'

with open(service_path, 'r', encoding='utf-8') as f:
    s_code = f.read()

# 1. Imports in LoraMeshService
import_block = """import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.util.Log;
import org.json.JSONObject;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
"""

if "import android.net.ConnectivityManager;" not in s_code:
    s_code = s_code.replace("import androidx.core.app.NotificationCompat;", "import androidx.core.app.NotificationCompat;\n" + import_block)

# 2. Add ACTION_START_GUARD
if "ACTION_START_GUARD" not in s_code:
    s_code = s_code.replace(
        'public static final String ACTION_CONNECT    = "ph.gov.baao.evakwar.resident.ACTION_CONNECT";',
        'public static final String ACTION_START_GUARD = "ph.gov.baao.evakwar.resident.ACTION_START_GUARD";\n    public static final String ACTION_CONNECT    = "ph.gov.baao.evakwar.resident.ACTION_CONNECT";'
    )

# 3. Add Wi-Fi poller fields
fields_code = """    // Siren and Alarm State
    private final AtomicBoolean nativeAlarmPlaying = new AtomicBoolean(false);
    private ToneGenerator nativeToneGen = null;
    private Ringtone nativeRingtone = null;
    private Runnable nativeSirenLoopRunnable = null;
    private boolean nativeSirenToggle = false;

    // Background Wi-Fi Alert Poller State
    private final AtomicBoolean wifiPollerRunning = new AtomicBoolean(false);
    private final AtomicBoolean wifiInitialPollDone = new AtomicBoolean(false);
    private ScheduledExecutorService wifiExecutor = null;
    private volatile String configuredServerUrl = "http://192.168.0.102:8080";
    private int candidateIpIndex = 0;
    private int consecutiveWifiErrors = 0;

    private static final String[] CANDIDATE_URLS = new String[]{
            "http://192.168.0.102:8080",
            "http://192.168.0.101:8080",
            "http://192.168.0.100:8080",
            "http://192.168.18.14:8080",
            "http://10.0.2.2:8080"
    };"""

target_fields = """    // Siren and Alarm State
    private final AtomicBoolean nativeAlarmPlaying = new AtomicBoolean(false);
    private ToneGenerator nativeToneGen = null;
    private Ringtone nativeRingtone = null;
    private Runnable nativeSirenLoopRunnable = null;
    private boolean nativeSirenToggle = false;"""

s_code = s_code.replace(target_fields, fields_code)

# 4. In btStateReceiver: do not kill service, just disconnect BLE
s_code = s_code.replace(
    """                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    disconnectAndStop();
                }""",
    """                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    disconnectBleOnly();
                }"""
)

# 5. In onCreate: initialize configuredServerUrl from SharedPreferences and start poller
on_create_target = """        createNotificationChannels();

        IntentFilter filter = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        registerReceiver(btStateReceiver, filter);
    }"""

on_create_replacement = """        createNotificationChannels();

        try {
            SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
            String savedUrl = prefs.getString("server_url", null);
            if (savedUrl != null && !savedUrl.trim().isEmpty()) {
                configuredServerUrl = savedUrl.trim().replaceAll("/+$", "");
            }
        } catch (Exception ignored) {}

        IntentFilter filter = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        registerReceiver(btStateReceiver, filter);

        startWifiPollerThread();
    }"""

s_code = s_code.replace(on_create_target, on_create_replacement)

# 6. In onStartCommand: handle ACTION_START_GUARD and do not kill on ACTION_DISCONNECT
start_cmd_target = """        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_DISCONNECT.equals(action)) {
                disconnectAndStop();
                return START_NOT_STICKY;
            } else if (ACTION_STOP_ALARM.equals(action)) {
                stopEmergencyAlarm();
                return START_STICKY;
            } else if (ACTION_CONNECT.equals(action)) {
                String mac = intent.getStringExtra(EXTRA_MAC);
                String name = intent.getStringExtra(EXTRA_NAME);
                if (mac != null && !mac.isEmpty()) {
                    connectBle(mac, name);
                }
            }
        }
        return START_STICKY;"""

start_cmd_replacement = """        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_DISCONNECT.equals(action)) {
                disconnectBleOnly();
                return START_STICKY;
            } else if (ACTION_STOP_ALARM.equals(action)) {
                stopEmergencyAlarm();
                return START_STICKY;
            } else if (ACTION_CONNECT.equals(action)) {
                String mac = intent.getStringExtra(EXTRA_MAC);
                String name = intent.getStringExtra(EXTRA_NAME);
                if (mac != null && !mac.isEmpty()) {
                    connectBle(mac, name);
                }
            } else if (ACTION_START_GUARD.equals(action)) {
                if (!bleConnected.get()) {
                    startForegroundWithNotification(null);
                }
            }
        }
        startWifiPollerThread();
        return START_STICKY;"""

s_code = s_code.replace(start_cmd_target, start_cmd_replacement)

# 7. In onDestroy: stop wifi poller
s_code = s_code.replace(
    """        stopEmergencyAlarm();
        closeGatt();
        super.onDestroy();""",
    """        stopEmergencyAlarm();
        closeGatt();
        stopWifiPollerThread();
        super.onDestroy();"""
)

# 8. Add static helpers: startServiceGuard, disconnectBle, updateServerUrl
static_helpers_target = """    public static void startService(Context ctx, String mac, String name) {
        Intent intent = new Intent(ctx, LoraMeshService.class);
        intent.setAction(ACTION_CONNECT);
        intent.putExtra(EXTRA_MAC, mac);
        intent.putExtra(EXTRA_NAME, name);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    public static void stopService(Context ctx) {
        Intent intent = new Intent(ctx, LoraMeshService.class);
        intent.setAction(ACTION_DISCONNECT);
        ctx.startService(intent);
    }"""

static_helpers_replacement = """    public static void startServiceGuard(Context ctx) {
        Intent intent = new Intent(ctx, LoraMeshService.class);
        intent.setAction(ACTION_START_GUARD);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    public static void startService(Context ctx, String mac, String name) {
        Intent intent = new Intent(ctx, LoraMeshService.class);
        intent.setAction(ACTION_CONNECT);
        intent.putExtra(EXTRA_MAC, mac);
        intent.putExtra(EXTRA_NAME, name);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    public static void stopService(Context ctx) {
        disconnectBle(ctx);
    }

    public static void disconnectBle(Context ctx) {
        Intent intent = new Intent(ctx, LoraMeshService.class);
        intent.setAction(ACTION_DISCONNECT);
        ctx.startService(intent);
    }"""

s_code = s_code.replace(static_helpers_target, static_helpers_replacement)

# 9. Add disconnectBleOnly method
disconnect_target = """    private void disconnectAndStop() {
        closeGatt();
        stopEmergencyAlarm();
        stopForeground(true);
        stopSelf();
    }"""

disconnect_replacement = """    private void disconnectAndStop() {
        closeGatt();
        stopEmergencyAlarm();
        stopForeground(true);
        stopSelf();
    }

    private void disconnectBleOnly() {
        closeGatt();
        stopEmergencyAlarm();
        activeBleAddress = null;
        activeBleName = null;
        emitBleState("DISCONNECTED", null, null, "LoRa node disconnected. Wi-Fi Emergency Guard active.");
        updateForegroundNotification(null);
    }"""

s_code = s_code.replace(disconnect_target, disconnect_replacement)

# 10. Foreground notification building and startForeground types
start_fg_target = """    private void startForegroundWithNotification(String statusText) {
        createNotificationChannels();
        Notification notif = buildServiceNotification(statusText);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14+ (API 34)
            startForeground(SERVICE_NOTIFICATION_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, notif);
        }
    }"""

start_fg_replacement = """    private void startForegroundWithNotification(String statusText) {
        createNotificationChannels();
        Notification notif = buildServiceNotification(statusText);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // Android 14+ (API 34)
            int fgType = ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC;
            if (bleConnected.get()) {
                fgType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE;
            }
            startForeground(SERVICE_NOTIFICATION_ID, notif, fgType);
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, notif);
        }
    }"""

s_code = s_code.replace(start_fg_target, start_fg_replacement)

# 11. buildServiceNotification: distinct Wi-Fi vs BLE card
build_notif_target = """    private Notification buildServiceNotification(String deviceName) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent launchPi = PendingIntent.getActivity(this, 0, launchIntent, piFlags);

        Intent discIntent = new Intent(this, LoraMeshService.class);
        discIntent.setAction(ACTION_DISCONNECT);
        PendingIntent discPi = PendingIntent.getService(this, 1, discIntent, piFlags);

        String nm = (deviceName != null && !deviceName.isEmpty()) ? deviceName : "RES1 (!f4e213d4)";

        return new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentTitle("🛡️ EvakWar LoRa Mesh Guard")
                .setContentText("Connected: " + nm + " • 433.875 MHz Active")
                .setStyle(new NotificationCompat.BigTextStyle()
                        .bigText("Active link to " + nm + ". Monitoring 433.875 MHz for emergency broadcasts even when the app is closed."))
                .setContentIntent(launchPi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Disconnect", discPi)
                .build();
    }"""

build_notif_replacement = """    private Notification buildServiceNotification(String deviceName) {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent launchPi = PendingIntent.getActivity(this, 0, launchIntent, piFlags);

        boolean isBle = bleConnected.get();
        String title = isBle ? "🛡️ EvakWar LoRa Mesh Guard" : "🛡️ EvakWar Emergency Guard";
        String nm = (deviceName != null && !deviceName.isEmpty()) ? deviceName : (activeBleName != null ? activeBleName : "RES1 (!f4e213d4)");
        String body = isBle
                ? "Connected: " + nm + " • 433.875 MHz Active"
                : "Active Emergency Monitor • Monitoring Wi-Fi & LoRa for Disaster Alerts";

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body + "\\nKeeps resident terminal protected 24/7 even when the app is closed."))
                .setContentIntent(launchPi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE);

        if (isBle) {
            Intent discIntent = new Intent(this, LoraMeshService.class);
            discIntent.setAction(ACTION_DISCONNECT);
            PendingIntent discPi = PendingIntent.getService(this, 1, discIntent, piFlags);
            b.addAction(android.R.drawable.ic_menu_close_clear_cancel, "Disconnect LoRa", discPi);
        }

        return b.build();
    }"""

s_code = s_code.replace(build_notif_target, build_notif_replacement)

# 12. Add Wi-Fi poller methods at end of class
wifi_methods = """
    // =========================================================================
    // Background Wi-Fi Alert Poller (Active 24/7 When App Closed on Wi-Fi)
    // =========================================================================
    public void updateServerUrl(String url) {
        if (url != null && !url.trim().isEmpty()) {
            this.configuredServerUrl = url.trim().replaceAll("/+$", "");
            try {
                SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
                prefs.edit().putString("server_url", this.configuredServerUrl).apply();
            } catch (Exception ignored) {}
            consecutiveWifiErrors = 0;
        }
    }

    private void startWifiPollerThread() {
        if (wifiPollerRunning.getAndSet(true)) return;

        wifiExecutor = Executors.newSingleThreadScheduledExecutor();
        wifiExecutor.scheduleWithFixedDelay(() -> {
            try {
                pollLatestAlertOverWifi();
            } catch (Throwable t) {
                // Ignore to keep resilient
            }
        }, 1200, 2000, TimeUnit.MILLISECONDS);
    }

    private void stopWifiPollerThread() {
        wifiPollerRunning.set(false);
        if (wifiExecutor != null) {
            try {
                wifiExecutor.shutdownNow();
            } catch (Exception ignored) {}
            wifiExecutor = null;
        }
    }

    private boolean isNetworkConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network net = cm.getActiveNetwork();
                if (net == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(net);
                return caps != null && (
                        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
                        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                );
            } else {
                NetworkInfo info = cm.getActiveNetworkInfo();
                return info != null && info.isConnected();
            }
        } catch (Exception e) {
            return false;
        }
    }

    private void pollLatestAlertOverWifi() {
        if (!isNetworkConnected()) return;

        String baseUrl = configuredServerUrl;
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "http://192.168.0.102:8080";
        }
        baseUrl = baseUrl.replaceAll("/+$", "");
        String endpoint = baseUrl + "/api/lora/latest-alert";

        HttpURLConnection conn = null;
        try {
            URL u = new URL(endpoint);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "EvakWar-Android-Resident/2.0");

            int code = conn.getResponseCode();
            if (code == 200) {
                consecutiveWifiErrors = 0;
                InputStream in = new BufferedInputStream(conn.getInputStream());
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                handleWifiAlertJson(sb.toString());
            } else {
                consecutiveWifiErrors++;
                if (consecutiveWifiErrors >= 3) {
                    cycleCandidateServerUrl();
                }
            }
        } catch (Exception e) {
            consecutiveWifiErrors++;
            if (consecutiveWifiErrors >= 3) {
                cycleCandidateServerUrl();
            }
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    private void cycleCandidateServerUrl() {
        if (CANDIDATE_URLS.length == 0) return;
        candidateIpIndex = (candidateIpIndex + 1) % CANDIDATE_URLS.length;
        configuredServerUrl = CANDIDATE_URLS[candidateIpIndex];
        consecutiveWifiErrors = 0;
    }

    private void handleWifiAlertJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) return;
        try {
            JSONObject root = new JSONObject(jsonStr);
            if (!root.optBoolean("success", false)) return;
            if (root.isNull("alert")) return;
            JSONObject alert = root.getJSONObject("alert");

            String alertId = alert.optString("alertId", alert.optString("id", "")).trim();
            if (alertId.isEmpty()) return;

            long timestampMs = alert.optLong("timestampMs", 0);
            String sentAt = alert.optString("sent_at", "");
            if (timestampMs == 0 && !sentAt.isEmpty()) {
                try {
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
                    Date d = sdf.parse(sentAt);
                    if (d != null) timestampMs = d.getTime();
                } catch (Exception ignored) {}
            }

            long now = System.currentTimeMillis();

            // Initial bootstrap: record whatever historical alert is currently on server
            // so we don't blare sirens on cold app launch unless the alert was dispatched in the last 60 seconds
            if (!wifiInitialPollDone.get()) {
                wifiInitialPollDone.set(true);
                lastProcessedAlertKey = alertId + "|" + alert.optString("title", "") + "|" + alert.optString("message", "");
                lastProcessedAlertTime = now;
                if (timestampMs > 0 && (now - timestampMs > 60_000)) {
                    return; // Ignore historical alert
                }
            }

            String title = alert.optString("title", "EMERGENCY ALERT").trim();
            String message = alert.optString("message", "Proceed to nearest safe evacuation center.").trim();
            String severity = alert.optString("severity", "RED").trim().toUpperCase();
            String evacCenter = alert.optString("evacCenter", "San Rafael Evacuation Center").trim();

            String alertKey = alertId + "|" + title + "|" + message;

            // Deduplication: exact same alert within 25 seconds
            if (alertKey.equals(lastProcessedAlertKey) && (now - lastProcessedAlertTime < 25_000)) {
                return;
            }

            lastProcessedAlertKey = alertKey;
            lastProcessedAlertTime = now;

            String fullMessage = "Shelter: " + evacCenter + "\\n" + message;

            // 1. Wake screen, sound STREAM_ALARM siren, trigger hardware vibrator & lock screen heads-up notification
            triggerEmergencyAlarmAndNotification(title, fullMessage, severity);

            // 2. Notify active listener (WebView) if app is currently in foreground
            BleListener listener = activeListener;
            if (listener != null) {
                String fakeLoraPacket = "EVW|ALT|" + alertId + "|" + severity + "|ALL|" + title + "|" + evacCenter + "|" + message;
                listener.onPacketReceived(fakeLoraPacket, fakeLoraPacket);
            }

        } catch (Exception e) {
            Log.w("LoraMeshService", "Error parsing Wi-Fi alert JSON: " + e.getMessage());
        }
    }
}
"""

# Replace the closing brace of LoraMeshService
s_code = re.sub(r'\}\s*$', wifi_methods, s_code)

with open(service_path, 'w', encoding='utf-8') as f:
    f.write(s_code)

print("SUCCESS: LoraMeshService.java patched successfully!")
