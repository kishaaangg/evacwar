package ph.gov.baao.evakwar.resident;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothStatusCodes;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import androidx.core.app.NotificationCompat;
import android.content.SharedPreferences;
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
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;


import java.lang.reflect.Method;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * EvakWar (E-BAKWAR) — Foreground LoRa Mesh BLE Service
 * Keeps the 433.875 MHz ESP32 LoRa hardware link connected 24/7 even when:
 *   - The phone screen is turned OFF / locked in a pocket
 *   - The resident is using other mobile apps
 *   - The resident swipes away / completely closes MainActivity
 *
 * When an incoming emergency broadcast (EVW|ALT|...) arrives from Barangay Hall:
 *   1. Wakes the CPU & turns the phone screen ON via PowerManager WakeLock
 *   2. Blares the emergency siren at high volume on STREAM_ALARM
 *   3. Triggers hardware vibrator waveform
 *   4. Pops up a maximum-priority Full-Screen Heads-Up Notification on lock screen
 */
@SuppressLint("MissingPermission")
public class LoraMeshService extends Service {
    public static final String ACTION_START_GUARD = "ph.gov.baao.evakwar.resident.ACTION_START_GUARD";
    public static final String ACTION_CONNECT    = "ph.gov.baao.evakwar.resident.ACTION_CONNECT";
    public static final String ACTION_DISCONNECT = "ph.gov.baao.evakwar.resident.ACTION_DISCONNECT";
    public static final String ACTION_STOP_ALARM = "ph.gov.baao.evakwar.resident.ACTION_STOP_ALARM";

    public static final String EXTRA_MAC  = "extra_mac";
    public static final String EXTRA_NAME = "extra_name";

    private static final int SERVICE_NOTIFICATION_ID   = 4331;
    private static final int EMERGENCY_NOTIFICATION_ID = 4339;
    private static final int WEATHER_NOTIFICATION_ID   = 4345;
    private static final int CHAT_NOTIFICATION_ID      = 8800;
    private static final String SERVICE_CHANNEL_ID           = "lora-mesh-service-channel";
    private static final String EMERGENCY_RED_CHANNEL_ID     = "evw_emergency_red_v4";
    private static final String EMERGENCY_OTHER_CHANNEL_ID   = "evw_emergency_other_v5";
    private static final String WEATHER_CHANNEL_ID           = "evw_weather_sensor_v1";
    private static final String CHAT_CHANNEL_ID              = "chat-messages-channel";

    private static volatile String lastWeatherAlertId = null;
    private final AtomicBoolean wifiWeatherInitialPollDone = new AtomicBoolean(false);

    // Chat deduplication and self-notification filter
    private static final Set<String> locallySentMsgIds = Collections.synchronizedSet(new HashSet<>());
    private static volatile String activeUserName = null;
    private static volatile String activeUserRole = null;
    private static volatile boolean isChatForeground = false;
    public static volatile boolean hasUnreadChatStatic = false;

    public static void setChatForegroundStatic(boolean isOpen) {
        isChatForeground = isOpen;
        if (isOpen) {
            setUnreadChatStatic(false);
        }
    }

    public static void setUnreadChatStatic(boolean hasUnread) {
        hasUnreadChatStatic = hasUnread;
        if (instance != null) {
            try {
                SharedPreferences prefs = instance.getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
                prefs.edit().putBoolean("evw_chat_has_unread", hasUnread).apply();
            } catch (Exception ignored) {}
        }
    }

    public static void markMessageSentBySelfStatic(String msgId) {
        if (msgId != null && !msgId.trim().isEmpty()) {
            locallySentMsgIds.add(msgId.trim());
        }
    }

    public static void setActiveUserStatic(String fullName, String role) {
        if (fullName != null && !fullName.trim().isEmpty()) {
            activeUserName = fullName.trim();
        }
        if (role != null && !role.trim().isEmpty()) {
            activeUserRole = role.trim();
        }
    }

    // Meshtastic Official BLE GATT UUIDs
    private static final UUID MESH_SERVICE_UUID = UUID.fromString("6ba1b218-15a8-461f-9fa8-5dcae273eafd");
    private static final UUID TORADIO_UUID      = UUID.fromString("f75c76d2-129e-4dad-a1dd-7866124401e7");
    private static final UUID FROMRADIO_UUID    = UUID.fromString("2c55e69e-4993-11ed-b878-0242ac120002");
    private static final UUID FROMNUM_UUID      = UUID.fromString("ed9da18c-a800-4f66-a670-aa7547e34453");
    private static final UUID CCCD_UUID         = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    public static volatile LoraMeshService instance = null;

    public interface BleListener {
        void onStateChanged(String state, String mac, String name, String message);
        void onPacketReceived(String packet, String ascii);
    }

    private static volatile BleListener activeListener = null;

    public static void setListener(BleListener listener) {
        activeListener = listener;
        if (listener != null && instance != null) {
            String state = instance.bleConnected.get() ? "CONNECTED" : (instance.activeBleGatt != null ? "CONNECTING" : "DISCONNECTED");
            listener.onStateChanged(state, instance.activeBleAddress, instance.activeBleName, "LoRa Service Ready");
        }
    }

    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private BluetoothManager bluetoothManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothGatt activeBleGatt;
    private BluetoothGattCharacteristic charToRadio;
    private BluetoothGattCharacteristic charFromRadio;
    private BluetoothGattCharacteristic charFromNum;
    private String activeBleAddress = null;
    private String activeBleName = null;

    private final AtomicBoolean bleConnected = new AtomicBoolean(false);
    private Runnable bleConnectTimeoutRunnable = null;
    private boolean bleRetriedWithAutoConnect = false;

    private volatile int negotiatedBleMtu = 23;
    private volatile boolean notificationsInitializedForGatt = false;
    private volatile boolean phoneApiWokenForGatt = false;
    private volatile boolean txWritePending = false;

    // Siren and Alarm State
    private final AtomicBoolean nativeAlarmPlaying = new AtomicBoolean(false);

    public boolean isAlarmPlaying() {
        return nativeAlarmPlaying.get();
    }
    private ToneGenerator nativeToneGen = null;
    private Ringtone nativeRingtone = null;
    private Runnable nativeSirenLoopRunnable = null;
    private boolean nativeSirenToggle = false;

    // Permanent alert deduplication and resident acknowledgment/mute tracking
    private static volatile String lastAlertedId = null;
    private static final Set<String> mutedAlertKeys = Collections.synchronizedSet(new HashSet<>());
    private static volatile String activeEmergencyAlertId = null;

    // Background Wi-Fi Alert Poller State
    private final AtomicBoolean wifiPollerRunning = new AtomicBoolean(false);
    private final AtomicBoolean wifiInitialPollDone = new AtomicBoolean(false);
    private ScheduledExecutorService wifiExecutor = null;
    private volatile String configuredServerUrl = "https://evacwar.onrender.com";
    private int candidateIpIndex = 0;
    private int consecutiveWifiErrors = 0;

    private static final String[] CANDIDATE_URLS = new String[]{
            "https://evacwar.onrender.com",
            "https://evacwar-koyeb.onrender.com",
            "https://evakwar.onrender.com",
            "http://192.168.0.102:8080",
            "http://192.168.0.101:8080",
            "http://192.168.0.100:8080",
            "http://192.168.18.14:8080",
            "http://10.0.2.2:8080"
    };

    private final BroadcastReceiver btStateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(intent.getAction())) {
                int state = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                if (state == BluetoothAdapter.STATE_OFF || state == BluetoothAdapter.STATE_TURNING_OFF) {
                    disconnectBleOnly();
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        bluetoothManager = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        } else {
            bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        }

        createNotificationChannels();

        try {
            SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
            String savedUrl = prefs.getString("server_url", null);
            if (savedUrl != null && !savedUrl.trim().isEmpty()) {
                String cleanSaved = savedUrl.trim().replaceAll("/+$", "");
                if (cleanSaved.startsWith("http://192.168.") || cleanSaved.startsWith("http://10.")) {
                    configuredServerUrl = "https://evacwar.onrender.com";
                    prefs.edit().putString("server_url", configuredServerUrl).apply();
                } else {
                    configuredServerUrl = cleanSaved;
                }
            }
        } catch (Exception ignored) {}

        IntentFilter filter = new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        registerReceiver(btStateReceiver, filter);

        startWifiPollerThread();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_DISCONNECT.equals(action)) {
                disconnectBleOnly();
                return START_STICKY;
            } else if (ACTION_STOP_ALARM.equals(action)) {
                String aid = intent.getStringExtra("alert_id");
                if (aid != null && !aid.trim().isEmpty()) {
                    mutedAlertKeys.add(aid.trim());
                }
                if (activeEmergencyAlertId != null) {
                    mutedAlertKeys.add(activeEmergencyAlertId);
                }
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
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instance = null;
        try {
            unregisterReceiver(btStateReceiver);
        } catch (Exception ignored) {}
        stopEmergencyAlarm();
        closeGatt();
        stopWifiPollerThread();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // =========================================================================
    // Static Helper API for MainActivity & JavaScript Bridge
    // =========================================================================
    public static void startServiceGuard(Context ctx) {
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
    }

    public static void stopEmergencyAlarmStatic() {
        if (instance != null) {
            instance.stopEmergencyAlarm();
        }
    }

    public static void muteAlertStatic(String alertId) {
        if (alertId != null && !alertId.trim().isEmpty()) {
            String clean = alertId.trim();
            mutedAlertKeys.add(clean);
        }
        if (activeEmergencyAlertId != null) {
            mutedAlertKeys.add(activeEmergencyAlertId);
        }
        stopEmergencyAlarmStatic();
    }

    public static boolean isConnected() {
        return instance != null && instance.bleConnected.get() && instance.activeBleGatt != null;
    }

    public static String getActiveAddress() {
        return (instance != null && instance.activeBleAddress != null) ? instance.activeBleAddress : "";
    }

    public static String getActiveName() {
        return (instance != null && instance.activeBleName != null) ? instance.activeBleName : "RES1 (!f4e213d4)";
    }

    public static boolean writeHex(String hexString) {
        if (instance == null || !instance.bleConnected.get() || instance.charToRadio == null || hexString == null) {
            return false;
        }
        return instance.writeHexInternal(hexString);
    }

    // =========================================================================
    // Bluetooth Low Energy GATT Connection Lifecycle
    // =========================================================================
    private void connectBle(final String macAddress, final String deviceName) {
        if (bleConnected.get() && activeBleGatt != null && macAddress.equalsIgnoreCase(activeBleAddress)) {
            emitBleState("CONNECTED", activeBleAddress, activeBleName, "Connected to " + activeBleName);
            updateForegroundNotification(activeBleName);
            return;
        }

        closeGatt();
        activeBleAddress = macAddress;
        activeBleName = (deviceName != null && !deviceName.isEmpty()) ? deviceName : "RES1 (!f4e213d4)";

        startForegroundWithNotification("Connecting to " + activeBleName + "...");
        emitBleState("CONNECTING", activeBleAddress, activeBleName, "Connecting to " + activeBleName + " (433.875 MHz LoRa)...");

        mainHandler.postDelayed(() -> {
            try {
                if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
                    emitBleState("ERROR", macAddress, deviceName, "Bluetooth is disabled.");
                    return;
                }
                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(macAddress);
                if (device == null) {
                    emitBleState("ERROR", macAddress, deviceName, "Invalid Bluetooth address: " + macAddress);
                    return;
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    activeBleGatt = device.connectGatt(LoraMeshService.this, false, nativeGattCallback, BluetoothDevice.TRANSPORT_LE);
                } else {
                    activeBleGatt = device.connectGatt(LoraMeshService.this, false, nativeGattCallback);
                }

                cancelBleConnectTimeout();
                bleConnectTimeoutRunnable = () -> {
                    if (!bleConnected.get()) {
                        if (!bleRetriedWithAutoConnect) {
                            bleRetriedWithAutoConnect = true;
                            closeGatt();
                            emitBleState("RETRYING", macAddress, activeBleName, "Retrying BLE link to " + activeBleName + "...");
                            connectBle(macAddress, activeBleName);
                        } else {
                            closeGatt();
                            emitBleState("ERROR", macAddress, activeBleName, "Connection timed out. Make sure " + activeBleName + " is powered ON and within range.");
                            stopForeground(true);
                            stopSelf();
                        }
                    }
                };
                mainHandler.postDelayed(bleConnectTimeoutRunnable, 5200);

            } catch (Exception e) {
                emitBleState("ERROR", macAddress, deviceName, "Bluetooth connect error: " + e.getMessage());
            }
        }, 80);
    }

    private void disconnectAndStop() {
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
    }

    private void closeGatt() {
        cancelBleConnectTimeout();
        mainHandler.removeCallbacks(fromRadioPollRunnable);
        bleConnected.set(false);
        if (activeBleGatt != null) {
            try {
                refreshGattCache(activeBleGatt);
                activeBleGatt.disconnect();
            } catch (Exception ignored) {}
            try {
                activeBleGatt.close();
            } catch (Exception ignored) {}
            activeBleGatt = null;
        }
        charToRadio = null;
        charFromRadio = null;
        charFromNum = null;
        negotiatedBleMtu = 23;
        notificationsInitializedForGatt = false;
        phoneApiWokenForGatt = false;
        txWritePending = false;
    }

    private void cancelBleConnectTimeout() {
        if (bleConnectTimeoutRunnable != null) {
            mainHandler.removeCallbacks(bleConnectTimeoutRunnable);
            bleConnectTimeoutRunnable = null;
        }
    }

    private void refreshGattCache(BluetoothGatt gatt) {
        try {
            Method refresh = gatt.getClass().getMethod("refresh");
            refresh.invoke(gatt);
        } catch (Exception ignored) {}
    }

    private void emitBleState(String state, String deviceId, String name, String message) {
        BleListener l = activeListener;
        if (l != null) {
            l.onStateChanged(state, deviceId, name, message);
        }
    }

    // =========================================================================
    // BluetoothGattCallback Implementation
    // =========================================================================
    private final BluetoothGattCallback nativeGattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            String addr = gatt.getDevice() != null ? gatt.getDevice().getAddress() : "";
            String devName = gatt.getDevice() != null && gatt.getDevice().getName() != null
                    ? gatt.getDevice().getName()
                    : (activeBleName != null ? activeBleName : "RES1 (!f4e213d4)");

            if (newState == BluetoothProfile.STATE_CONNECTED) {
                activeBleGatt = gatt;
                activeBleAddress = addr;
                activeBleName = devName;

                emitBleState("DISCOVERING", addr, devName, "Connected to " + devName + ". Discovering 433.875 MHz services...");

                mainHandler.postDelayed(() -> {
                    if (activeBleGatt == gatt) {
                        try {
                            gatt.discoverServices();
                        } catch (Exception ignored) {}
                    }
                }, 160);

            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                boolean wasConnecting = !bleConnected.get() && activeBleAddress != null && activeBleAddress.equals(addr);
                bleConnected.set(false);
                closeGatt();

                if (wasConnecting && !bleRetriedWithAutoConnect && addr != null && !addr.isEmpty()) {
                    bleRetriedWithAutoConnect = true;
                    emitBleState("RETRYING", addr, devName, "Refreshing Bluetooth link to " + devName + "...");
                    mainHandler.postDelayed(() -> connectBle(addr, devName), 500);
                    return;
                }

                emitBleState("DISCONNECTED", addr, devName, "Disconnected from " + devName);
                updateForegroundNotification("Disconnected. Waiting for node...");
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            super.onMtuChanged(gatt, mtu, status);
            if (status == BluetoothGatt.GATT_SUCCESS && mtu > 23) {
                negotiatedBleMtu = mtu;
            }
            enableFromNumNotificationsAndWake(gatt);
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                cancelBleConnectTimeout();
                emitBleState("ERROR", activeBleAddress, activeBleName, "Service discovery failed.");
                return;
            }

            BluetoothGattService meshService = gatt.getService(MESH_SERVICE_UUID);
            if (meshService != null) {
                charToRadio   = meshService.getCharacteristic(TORADIO_UUID);
                charFromRadio = meshService.getCharacteristic(FROMRADIO_UUID);
                charFromNum   = meshService.getCharacteristic(FROMNUM_UUID);
            }

            notificationsInitializedForGatt = false;
            boolean mtuRequested = false;
            try {
                mtuRequested = gatt.requestMtu(512);
            } catch (Exception ignored) {}

            mainHandler.postDelayed(() -> {
                if (activeBleGatt == gatt && !notificationsInitializedForGatt) {
                    enableFromNumNotificationsAndWake(gatt);
                }
            }, mtuRequested ? 420 : 80);

            cancelBleConnectTimeout();
            bleConnected.set(true);
            String devName = activeBleName != null ? activeBleName : "RES1 (!f4e213d4)";
            emitBleState("CONNECTED", activeBleAddress, devName, "Connected to " + devName);
            updateForegroundNotification(devName);
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            super.onDescriptorWrite(gatt, descriptor, status);
            wakeMeshtasticPhoneApiAndDrain(gatt);
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            super.onCharacteristicWrite(gatt, characteristic, status);
            txWritePending = false;
            scheduleFromRadioDrain(gatt, 35);
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            handleBleIncomingBytes(characteristic.getValue());
            scheduleFromRadioDrain(gatt, 15);
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
            handleBleIncomingBytes(value);
            scheduleFromRadioDrain(gatt, 15);
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                byte[] val = characteristic.getValue();
                if (val != null && val.length > 0) {
                    handleBleIncomingBytes(val);
                    scheduleFromRadioDrain(gatt, 20);
                }
            }
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS && value != null && value.length > 0) {
                handleBleIncomingBytes(value);
                scheduleFromRadioDrain(gatt, 20);
            }
        }
    };

    private final Runnable fromRadioPollRunnable = new Runnable() {
        @Override
        public void run() {
            if (bleConnected.get() && activeBleGatt != null && charFromRadio != null && !txWritePending) {
                try {
                    activeBleGatt.readCharacteristic(charFromRadio);
                } catch (Exception ignored) {}
            }
            if (bleConnected.get() && activeBleGatt != null) {
                mainHandler.postDelayed(this, 1400);
            }
        }
    };

    private void scheduleFromRadioDrain(final BluetoothGatt gatt, long delayMs) {
        if (gatt == null || charFromRadio == null) return;
        mainHandler.postDelayed(() -> {
            if (activeBleGatt == gatt && bleConnected.get() && !txWritePending && charFromRadio != null) {
                try {
                    gatt.readCharacteristic(charFromRadio);
                } catch (Exception ignored) {}
            }
        }, delayMs);
    }

    private void wakeMeshtasticPhoneApiAndDrain(final BluetoothGatt gatt) {
        if (activeBleGatt != gatt || phoneApiWokenForGatt) return;
        phoneApiWokenForGatt = true;
        mainHandler.postDelayed(() -> {
            if (activeBleGatt != gatt || charToRadio == null) return;
            try {
                // ToRadio { want_config_id = 4242 } -> 0x18, 0x92, 0x21
                byte[] wantCfg = new byte[]{0x18, (byte) 0x92, 0x21};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    int r = gatt.writeCharacteristic(charToRadio, wantCfg, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    if (r != BluetoothStatusCodes.SUCCESS) {
                        gatt.writeCharacteristic(charToRadio, wantCfg, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                    }
                } else {
                    charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    charToRadio.setValue(wantCfg);
                    if (!gatt.writeCharacteristic(charToRadio)) {
                        charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                        charToRadio.setValue(wantCfg);
                        gatt.writeCharacteristic(charToRadio);
                    }
                }
            } catch (Exception ignored) {}

            scheduleFromRadioDrain(gatt, 180);
            mainHandler.removeCallbacks(fromRadioPollRunnable);
            mainHandler.postDelayed(fromRadioPollRunnable, 1400);
            scheduleRelayTelemetryPoll(gatt, 3200);
        }, 120);
    }

    /**
     * Periodically writes a 24-byte ToRadio TELEMETRY_APP request addressed to the outdoor Relay (!0f778ab0 = 0x0f778ab0)
     * so any BLE-connected phone (Resident, Staff, Rescuer, or Admin) pulls live outdoor AHT20 + BMP280 readings over 433.875 MHz RF.
     */
    private void scheduleRelayTelemetryPoll(final BluetoothGatt gatt, long delayMs) {
        mainHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (activeBleGatt != gatt || !bleConnected.get() || charToRadio == null) return;
                if (!txWritePending) {
                    try {
                        int pktId = (int) ((System.currentTimeMillis() & 0x7FFFFFFFL) | 1);
                        byte[] req = new byte[]{
                                0x0a, 0x16,
                                0x15, (byte) 0xb0, (byte) 0x8a, 0x77, 0x0f, // to = 0x0f778ab0 (!0f778ab0)
                                0x22, 0x08, 0x08, 0x43, 0x12, 0x02, 0x1a, 0x00, 0x18, 0x01, // Data { portnum=67, payload=[0x1a,0x00], want_response=true }
                                0x35,
                                (byte) (pktId & 0xFF),
                                (byte) ((pktId >> 8) & 0xFF),
                                (byte) ((pktId >> 16) & 0xFF),
                                (byte) ((pktId >> 24) & 0xFF),
                                0x48, 0x03 // hop_limit = 3
                        };
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            int r = gatt.writeCharacteristic(charToRadio, req, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                            if (r != BluetoothStatusCodes.SUCCESS) {
                                gatt.writeCharacteristic(charToRadio, req, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                            }
                        } else {
                            charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                            charToRadio.setValue(req);
                            if (!gatt.writeCharacteristic(charToRadio)) {
                                charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                                charToRadio.setValue(req);
                                gatt.writeCharacteristic(charToRadio);
                            }
                        }
                        scheduleFromRadioDrain(gatt, 2400);
                    } catch (Exception ignored) {}
                }
                if (activeBleGatt == gatt && bleConnected.get()) {
                    mainHandler.postDelayed(this, 60000L);
                }
            }
        }, delayMs);
    }

    private void enableFromNumNotificationsAndWake(BluetoothGatt gatt) {
        if (activeBleGatt != gatt || notificationsInitializedForGatt) return;
        notificationsInitializedForGatt = true;
        phoneApiWokenForGatt = false;
        if (charFromNum != null) {
            try {
                gatt.setCharacteristicNotification(charFromNum, true);
                BluetoothGattDescriptor desc = charFromNum.getDescriptor(CCCD_UUID);
                if (desc != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        gatt.writeDescriptor(desc, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    } else {
                        desc.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                        gatt.writeDescriptor(desc);
                    }
                    mainHandler.postDelayed(() -> wakeMeshtasticPhoneApiAndDrain(gatt), 320);
                    return;
                }
            } catch (Exception ignored) {}
        }
        wakeMeshtasticPhoneApiAndDrain(gatt);
    }

    private String extractEvwPacketFromBytes(byte[] data, int length) {
        if (data == null || length < 8) return null;
        int limit = Math.min(data.length, length);
        for (int i = 0; i <= limit - 4; i++) {
            if ((data[i] & 0xFF) == 'E' &&
                (data[i + 1] & 0xFF) == 'V' &&
                (data[i + 2] & 0xFF) == 'W' &&
                (data[i + 3] & 0xFF) == '|') {

                int maxLen = limit - i;
                if (i >= 2 && (data[i - 2] & 0xFF) == 0x12) {
                    int protoLen = data[i - 1] & 0xFF;
                    if (protoLen >= 8 && protoLen <= maxLen) {
                        maxLen = protoLen;
                    }
                } else if (i >= 3 && (data[i - 3] & 0xFF) == 0x12 && ((data[i - 2] & 0x80) != 0)) {
                    int protoLen = (data[i - 2] & 0x7F) | ((data[i - 1] & 0x7F) << 7);
                    if (protoLen >= 8 && protoLen <= maxLen) {
                        maxLen = protoLen;
                    }
                }

                StringBuilder sb = new StringBuilder();
                for (int j = i; j < i + maxLen; j++) {
                    int c = data[j] & 0xFF;
                    if (c >= 32 && c <= 126) {
                        sb.append((char) c);
                    } else {
                        break;
                    }
                }
                String candidate = sb.toString().trim();
                if (candidate.length() >= 8) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private void handleBleIncomingBytes(byte[] data) {
        if (data == null || data.length == 0) return;
        try {
            String evw = extractEvwPacketFromBytes(data, data.length);
            if (evw != null) {
                handleIncomingEvwPacket(evw);
                return;
            }
            String protoWeatherPkt = tryExtractEnvironmentTelemetryAsEvw(data);
            if (protoWeatherPkt != null) {
                handleIncomingEvwPacket(protoWeatherPkt);
                return;
            }
            StringBuilder ascii = new StringBuilder();
            for (byte b : data) {
                int c = b & 0xFF;
                if (c >= 32 && c <= 126) {
                    ascii.append((char) c);
                } else {
                    ascii.append('\n');
                }
            }
            String s = ascii.toString();
            if (!s.trim().isEmpty()) {
                BleListener l = activeListener;
                if (l != null) {
                    l.onPacketReceived(null, s);
                }
            }
        } catch (Exception ignored) {}
    }

    private String lastProcessedAlertKey = null;
    private long lastProcessedAlertTime = 0;

    private void handleIncomingEvwPacket(String packet) {
        if (packet == null || packet.isEmpty()) return;

        // 1. Notify active Activity listener if open
        BleListener l = activeListener;
        if (l != null) {
            l.onPacketReceived(packet, packet);
        }

        // 2. If it is an emergency broadcast from Barangay Hall (EVW|ALT|...)
        if (packet.startsWith("EVW|ALT|")) {
            // EVW|ALT|alertId|severity|zone|title|evacCenter|instructions
            String[] parts = packet.split("\\|");
            String alertId = parts.length > 2 ? parts[2] : "";
            String severity = parts.length > 3 ? parts[3] : "RED";
            String title = parts.length > 5 ? parts[5] : "EMERGENCY EVACUATION ALERT";
            String center = parts.length > 6 ? parts[6] : "San Rafael Evacuation Center";
            String msg = parts.length > 7 ? parts[7] : "Proceed immediately to your designated safe evacuation center.";

            String alertKey = alertId + "|" + title + "|" + msg;

            // If resident already muted this alert, do not sound alarm again
            if ((!alertId.isEmpty() && (mutedAlertKeys.contains(alertId) || alertId.equals(lastAlertedId))) ||
                mutedAlertKeys.contains(alertKey)) {
                return;
            }

            if (!alertId.isEmpty()) {
                lastAlertedId = alertId;
                activeEmergencyAlertId = alertId;
            }

            String fullMessage = "Shelter: " + center + "\n" + msg;
            triggerEmergencyAlarmAndNotification(title, fullMessage, severity, alertId);
        } else if (packet.startsWith("EVW|MSG|")) {
            // EVW|MSG|msgId|senderRole|senderName|nodeId|timestamp|text[|seq]
            try {
                String[] parts = packet.split("\\|");
                String msgId = parts.length > 2 ? parts[2].trim() : "";
                String sRole = parts.length > 3 ? parts[3].trim() : "Resident";
                String sName = parts.length > 4 ? parts[4].trim() : "Resident";

                if (sName.contains("|")) sName = sName.split("\\|")[0].trim();
                if (sName.contains("!")) sName = sName.split("!")[0].trim();

                long ts = 0;
                if (parts.length > 6) {
                    try { ts = Long.parseLong(parts[6].trim()) * 1000L; } catch (Exception ignored) {}
                }
                if (ts <= 0) ts = System.currentTimeMillis();

                String text = "";
                if (parts.length >= 8) {
                    text = parts[7].trim();
                }
                text = text.replaceAll("\\|\\d+$", "").trim();

                int seq = 0;
                if (parts.length >= 9) {
                    try { seq = Integer.parseInt(parts[8].trim()); } catch (Exception ignored) {}
                }

                // Forward packet to WebView so chat bubble renders on screen
                if (MainActivity.instance != null) {
                    MainActivity.instance.onChatPacketReceived(msgId, sRole, sName, text, ts, seq);
                }

                // Trigger standard EvakWar notification
                showChatNotificationStatic(LoraMeshService.this, msgId, sRole, sName, text);
            } catch (Exception ignored) {}
        } else if (packet.startsWith("EVW|WTH_ALT|")) {
            // EVW|WTH_ALT|id|tsSec|temp|hum|press|summary -> Notify only, NO SIREN, tap opens Weather page
            try {
                String[] parts = packet.split("\\|");
                String wId = parts.length > 2 ? parts[2].trim() : String.valueOf(System.currentTimeMillis());
                String temp = parts.length > 4 ? parts[4].trim() : "--";
                String hum = parts.length > 5 ? parts[5].trim() : "--";
                String press = parts.length > 6 ? parts[6].trim() : "--";
                String body = "Temp " + temp + "°C • Humidity " + hum + "% • Pressure " + press + " hPa";
                showWeatherNotificationStatic(LoraMeshService.this, wId, "🌤️ LoRa Weather Sensor Update", body);
            } catch (Exception ignored) {}
        }
    }

    /**
     * Minimal Meshtastic FromRadio -> MeshPacket -> Data(portnum=67 TELEMETRY_APP) -> EnvironmentMetrics decoder.
     * Synthesizes an EVW|WTH|... packet so foreground JS & offline cache update even without internet.
     */
    private String tryExtractEnvironmentTelemetryAsEvw(byte[] data) {
        if (data == null || data.length < 10) return null;
        try {
            byte[] packetBytes = findLengthDelimitedField(data, 0, data.length, 2); // FromRadio.packet (fn=2)
            if (packetBytes == null) return null;

            long fromNodeNum = readFixed32Field(packetBytes, 1); // MeshPacket.from (fn=1)
            byte[] decodedBytes = findLengthDelimitedField(packetBytes, 0, packetBytes.length, 4); // MeshPacket.decoded (fn=4)
            if (decodedBytes == null) return null;

            long portnum = readVarintField(decodedBytes, 1); // Data.portnum (fn=1)
            if (portnum != 67L) return null; // 67 = PortNum.TELEMETRY_APP

            byte[] payloadBytes = findLengthDelimitedField(decodedBytes, 0, decodedBytes.length, 2); // Data.payload (fn=2)
            if (payloadBytes == null) return null;

            long telTime = readFixed32Field(payloadBytes, 1); // Telemetry.time (fn=1)
            byte[] envBytes = findLengthDelimitedField(payloadBytes, 0, payloadBytes.length, 3); // Telemetry.environment_metrics (fn=3)
            if (envBytes == null) return null;

            Float temp = readFloatField(envBytes, 1);
            Float hum = readFloatField(envBytes, 2);
            Float press = readFloatField(envBytes, 3);

            // Filter out loose-wire I2C glitch values (e.g. 177.6°C, 0% RH, -176.4 hPa)
            Float validTemp = (temp != null && !Float.isNaN(temp) && temp >= -10.0f && temp <= 65.0f) ? temp : null;
            Float validHum = (hum != null && !Float.isNaN(hum) && hum >= 1.0f && hum <= 100.0f) ? hum : null;
            Float validPress = (press != null && !Float.isNaN(press) && press >= 850.0f && press <= 1100.0f) ? press : null;
            if (validTemp == null && validHum == null && validPress == null) return null;

            long tsSec = System.currentTimeMillis() / 1000L;
            String nodeId = fromNodeNum != 0 ? String.format(Locale.US, "!%08x", fromNodeNum & 0xFFFFFFFFL) : "!0f778ab0";
            String tStr = validTemp != null ? String.format(Locale.US, "%.2f", validTemp) : "";
            String hStr = validHum != null ? String.format(Locale.US, "%.1f", validHum) : "";
            String pStr = validPress != null ? String.format(Locale.US, "%.2f", validPress) : "";

            forwardOutdoorRelayTelemetryToServerAsync(nodeId, validTemp, validHum, validPress);
            return "EVW|WTH|" + tsSec + "|" + tStr + "|" + hStr + "|" + pStr + "|" + nodeId;
        } catch (Exception ignored) {
            return null;
        }
    }

    private long lastRelayServerForwardMs = 0L;

    /**
     * Crowd-syncs outdoor Relay sensor readings received over 433.875 MHz RF to the EvakWar server
     * whenever the phone has Wi-Fi or mobile data, so Admin, Residents, Staff, and Rescuers all see live outdoor Relay telemetry.
     */
    private void forwardOutdoorRelayTelemetryToServerAsync(final String nodeId, final Float temp, final Float hum, final Float press) {
        if (!isNetworkConnected()) return;
        long now = System.currentTimeMillis();
        if (now - lastRelayServerForwardMs < 15000L) return;
        lastRelayServerForwardMs = now;

        new Thread(() -> {
            String[] targets = new String[]{
                    (configuredServerUrl != null && !configuredServerUrl.isEmpty()) ? configuredServerUrl.replaceAll("/+$", "") : "https://evacwar.onrender.com",
                    "https://evacwar.onrender.com"
            };
            Set<String> uniqueUrls = new HashSet<>();
            for (String t : targets) {
                if (t != null && t.startsWith("http")) uniqueUrls.add(t);
            }
            for (String baseUrl : uniqueUrls) {
                HttpURLConnection conn = null;
                try {
                    JSONObject body = new JSONObject();
                    if (temp != null) body.put("temperature", Math.round(temp * 100.0) / 100.0);
                    if (hum != null) body.put("humidity", Math.round(hum * 100.0) / 100.0);
                    if (press != null) body.put("pressure", Math.round(press * 100.0) / 100.0);
                    body.put("nodeId", nodeId != null ? nodeId : "!0f778ab0");
                    body.put("nodeName", "EvakWar Zone Relay 1 (REL1)");
                    body.put("sensorModel", "AHT20 + BMP280 (I2C)");
                    body.put("source", "ANDROID_BLE_LORA_RF_FORWARD");
                    body.put("forwardedByDevice", activeBleName != null ? activeBleName : "ANDROID_BLE_NODE");

                    byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                    URL u = new URL(baseUrl + "/api/lora/weather-sensor");
                    conn = (HttpURLConnection) u.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(4500);
                    conn.setReadTimeout(4500);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setRequestProperty("Accept", "application/json");
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(payload);
                        os.flush();
                    }
                    conn.getResponseCode();
                } catch (Exception ignored) {
                } finally {
                    if (conn != null) {
                        try { conn.disconnect(); } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    private byte[] findLengthDelimitedField(byte[] buf, int start, int end, int targetFn) {
        int pos = start;
        while (pos < end) {
            long[] tagRes = readProtoVarint(buf, pos, end);
            if (tagRes == null) break;
            long tag = tagRes[0];
            pos = (int) tagRes[1];
            int fn = (int) (tag >>> 3);
            int wt = (int) (tag & 0x7L);
            if (wt == 0) {
                long[] v = readProtoVarint(buf, pos, end);
                if (v == null) break;
                pos = (int) v[1];
            } else if (wt == 1) {
                pos += 8;
            } else if (wt == 2) {
                long[] lRes = readProtoVarint(buf, pos, end);
                if (lRes == null) break;
                int slen = (int) lRes[0];
                pos = (int) lRes[1];
                if (slen < 0 || pos + slen > end) break;
                if (fn == targetFn) {
                    byte[] slice = new byte[slen];
                    System.arraycopy(buf, pos, slice, 0, slen);
                    return slice;
                }
                pos += slen;
            } else if (wt == 5) {
                pos += 4;
            } else {
                break;
            }
        }
        return null;
    }

    private long readVarintField(byte[] buf, int targetFn) {
        int pos = 0, end = buf.length;
        while (pos < end) {
            long[] tagRes = readProtoVarint(buf, pos, end);
            if (tagRes == null) break;
            long tag = tagRes[0];
            pos = (int) tagRes[1];
            int fn = (int) (tag >>> 3);
            int wt = (int) (tag & 0x7L);
            if (wt == 0) {
                long[] v = readProtoVarint(buf, pos, end);
                if (v == null) break;
                pos = (int) v[1];
                if (fn == targetFn) return v[0];
            } else if (wt == 1) {
                pos += 8;
            } else if (wt == 2) {
                long[] lRes = readProtoVarint(buf, pos, end);
                if (lRes == null) break;
                pos = (int) lRes[1] + (int) lRes[0];
            } else if (wt == 5) {
                pos += 4;
            } else {
                break;
            }
        }
        return 0L;
    }

    private long readFixed32Field(byte[] buf, int targetFn) {
        int pos = 0, end = buf.length;
        while (pos < end) {
            long[] tagRes = readProtoVarint(buf, pos, end);
            if (tagRes == null) break;
            long tag = tagRes[0];
            pos = (int) tagRes[1];
            int fn = (int) (tag >>> 3);
            int wt = (int) (tag & 0x7L);
            if (wt == 0) {
                long[] v = readProtoVarint(buf, pos, end);
                if (v == null) break;
                pos = (int) v[1];
            } else if (wt == 1) {
                pos += 8;
            } else if (wt == 2) {
                long[] lRes = readProtoVarint(buf, pos, end);
                if (lRes == null) break;
                pos = (int) lRes[1] + (int) lRes[0];
            } else if (wt == 5) {
                if (pos + 4 > end) break;
                if (fn == targetFn) {
                    return ((buf[pos] & 0xFFL)) |
                           ((buf[pos + 1] & 0xFFL) << 8) |
                           ((buf[pos + 2] & 0xFFL) << 16) |
                           ((buf[pos + 3] & 0xFFL) << 24);
                }
                pos += 4;
            } else {
                break;
            }
        }
        return 0L;
    }

    private Float readFloatField(byte[] buf, int targetFn) {
        int pos = 0, end = buf.length;
        while (pos < end) {
            long[] tagRes = readProtoVarint(buf, pos, end);
            if (tagRes == null) break;
            long tag = tagRes[0];
            pos = (int) tagRes[1];
            int fn = (int) (tag >>> 3);
            int wt = (int) (tag & 0x7L);
            if (wt == 0) {
                long[] v = readProtoVarint(buf, pos, end);
                if (v == null) break;
                pos = (int) v[1];
            } else if (wt == 1) {
                pos += 8;
            } else if (wt == 2) {
                long[] lRes = readProtoVarint(buf, pos, end);
                if (lRes == null) break;
                pos = (int) lRes[1] + (int) lRes[0];
            } else if (wt == 5) {
                if (pos + 4 > end) break;
                if (fn == targetFn) {
                    int bits = (buf[pos] & 0xFF) |
                               ((buf[pos + 1] & 0xFF) << 8) |
                               ((buf[pos + 2] & 0xFF) << 16) |
                               ((buf[pos + 3] & 0xFF) << 24);
                    return Float.intBitsToFloat(bits);
                }
                pos += 4;
            } else {
                break;
            }
        }
        return null;
    }

    private long[] readProtoVarint(byte[] buf, int pos, int end) {
        long res = 0;
        int shift = 0;
        while (pos < end) {
            int b = buf[pos++] & 0xFF;
            res |= (long) (b & 0x7F) << shift;
            if ((b & 0x80) == 0) return new long[]{res, pos};
            shift += 7;
            if (shift > 63) return null;
        }
        return null;
    }

    public static void showWeatherNotificationStatic(Context context, String weatherId, String title, String body) {
        if (context == null) return;
        String cleanId = (weatherId != null && !weatherId.trim().isEmpty()) ? weatherId.trim() : String.valueOf(System.currentTimeMillis());
        if (cleanId.equals(lastWeatherAlertId) || mutedAlertKeys.contains("WTH_" + cleanId)) {
            return;
        }
        lastWeatherAlertId = cleanId;
        mutedAlertKeys.add("WTH_" + cleanId);

        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(WEATHER_CHANNEL_ID) == null) {
                NotificationChannel weatherChannel = new NotificationChannel(
                        WEATHER_CHANNEL_ID,
                        "EvakWar LoRa Weather Sensor Updates",
                        NotificationManager.IMPORTANCE_DEFAULT
                );
                weatherChannel.setDescription("Periodic 2-hour weather sensor notifications without emergency sirens");
                weatherChannel.enableVibration(false);
                weatherChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(weatherChannel);
            }

            Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launchIntent == null) {
                launchIntent = new Intent(context, MainActivity.class);
            }
            launchIntent.setAction(Intent.ACTION_MAIN);
            launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            launchIntent.putExtra("navigate_to", "/typhoon?view=sensor");
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getActivity(context, 205, launchIntent, piFlags);

            String notifTitle = "🌤️ LoRa Weather Sensor Update";
            String notifBody = (body != null && !body.isEmpty()) ? body : "Tap to view live sensor telemetry.";

            NotificationCompat.Builder nb = new NotificationCompat.Builder(context, WEATHER_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_menu_compass)
                    .setContentTitle(notifTitle)
                    .setContentText(notifBody)
                    .setStyle(new NotificationCompat.BigTextStyle().setBigContentTitle(notifTitle).bigText(notifBody))
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                    .setAutoCancel(true)
                    .setContentIntent(pi);

            nm.notify(WEATHER_NOTIFICATION_ID, nb.build());
        } catch (Exception ignored) {}
    }

    public static void showChatNotificationStatic(Context context, String msgId, String sRole, String sName, String text) {
        if (context == null) return;
        if (text == null || text.trim().isEmpty()) return;

        // 1. SUPPRESS SELF-NOTIFICATION: Never notify sender for their own messages!
        if (msgId != null && !msgId.trim().isEmpty() && locallySentMsgIds.contains(msgId.trim())) {
            Log.d("LoraMeshService", "Skipping self-notification for locally sent msgId: " + msgId);
            return;
        }

        if (activeUserName != null && !activeUserName.isEmpty()) {
            String cleanActive = activeUserName.trim().toLowerCase();
            String cleanSender = (sName != null ? sName : "").trim().toLowerCase();
            if (!cleanSender.isEmpty() && (cleanSender.equals(cleanActive) || cleanSender.contains(cleanActive) || cleanActive.contains(cleanSender))) {
                Log.d("LoraMeshService", "Skipping self-notification for active user: " + sName);
                return;
            }
        }

        try {
            SharedPreferences prefs = context.getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
            String savedUser = prefs.getString("user_full_name", "");
            if (savedUser != null && !savedUser.trim().isEmpty()) {
                String cleanSaved = savedUser.trim().toLowerCase();
                String cleanSender = (sName != null ? sName : "").trim().toLowerCase();
                if (!cleanSender.isEmpty() && (cleanSender.equals(cleanSaved) || cleanSender.contains(cleanSaved) || cleanSaved.contains(cleanSender))) {
                    Log.d("LoraMeshService", "Skipping self-notification for saved user: " + sName);
                    return;
                }
            }
        } catch (Exception ignored) {}

        // 2. Mark unread badge for navigation bar
        setUnreadChatStatic(true);

        // 3. Deduplicate: only notify once per message ID
        if (msgId != null && !msgId.trim().isEmpty()) {
            String dedupeKey = "MSG_" + msgId.trim();
            if (mutedAlertKeys.contains(dedupeKey)) {
                return;
            }
            mutedAlertKeys.add(dedupeKey);
        }

        // 4. If chat is open in foreground, do not show drawer banner
        if (isChatForeground) {
            Log.d("LoraMeshService", "Skipping notification: chat is currently open in foreground");
            return;
        }

        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
                if (launchIntent == null) {
                    launchIntent = new Intent(context, MainActivity.class);
                }
                launchIntent.setAction(Intent.ACTION_MAIN);
                launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
                launchIntent.putExtra("navigate_to", "/resident/chat");
                launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    piFlags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getActivity(context, 204, launchIntent, piFlags);

                // Strict user requirement: Title: "EvakWar Group Chat", Content: "You have a message from EvakWar San Rafael Group Chat"
                String notifTitle = "EvakWar Group Chat";
                String notifBody = "You have a message from EvakWar San Rafael Group Chat";

                NotificationCompat.Builder nb = new NotificationCompat.Builder(context, CHAT_CHANNEL_ID)
                        .setSmallIcon(android.R.drawable.stat_notify_chat)
                        .setContentTitle(notifTitle)
                        .setContentText(notifBody)
                        .setStyle(new NotificationCompat.BigTextStyle()
                                .setBigContentTitle(notifTitle)
                                .bigText(notifBody))
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setAutoCancel(true)
                        .setContentIntent(pi);

                // Fixed single ID so multiple messages update in place without spamming drawer
                nm.notify(CHAT_NOTIFICATION_ID, nb.build());
            }
        } catch (Exception ignored) {}
    }

    private boolean writeHexInternal(String hexString) {
        if (activeBleGatt == null || charToRadio == null || hexString == null) return false;
        try {
            String clean = hexString.replaceAll("[^0-9A-Fa-f]", "");
            int len = clean.length();
            byte[] data = new byte[len / 2];
            for (int i = 0; i < len; i += 2) {
                data[i / 2] = (byte) ((Character.digit(clean.charAt(i), 16) << 4)
                        + Character.digit(clean.charAt(i + 1), 16));
            }
            // Automatically register locally-sent chat packet so sender is NEVER self-notified
            try {
                String ascii = new String(data, java.nio.charset.StandardCharsets.UTF_8);
                if (ascii.startsWith("EVW|MSG|")) {
                    String[] p = ascii.split("\\|", 8);
                    if (p.length > 2 && !p[2].isEmpty()) {
                        locallySentMsgIds.add(p[2].trim());
                    }
                    if (p.length > 4 && !p[4].isEmpty()) {
                        activeUserName = p[4].trim();
                    }
                }
            } catch (Exception ignored) {}

            txWritePending = true;
            return writeCharacteristicWithRetry(data, 1);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean writeCharacteristicWithRetry(final byte[] payload, final int attempt) {
        mainHandler.post(() -> {
            if (activeBleGatt == null || charToRadio == null || payload == null) {
                txWritePending = false;
                return;
            }
            try {
                boolean ok = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    int r = activeBleGatt.writeCharacteristic(charToRadio, payload, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    ok = (r == BluetoothStatusCodes.SUCCESS);
                    if (!ok) {
                        r = activeBleGatt.writeCharacteristic(charToRadio, payload, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                        ok = (r == BluetoothStatusCodes.SUCCESS);
                    }
                } else {
                    charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    charToRadio.setValue(payload);
                    ok = activeBleGatt.writeCharacteristic(charToRadio);
                    if (!ok) {
                        charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                        charToRadio.setValue(payload);
                        ok = activeBleGatt.writeCharacteristic(charToRadio);
                    }
                }

                if (!ok && attempt < 3) {
                    mainHandler.postDelayed(() -> writeCharacteristicWithRetry(payload, attempt + 1), 80);
                } else if (!ok) {
                    txWritePending = false;
                }
            } catch (Exception e) {
                txWritePending = false;
            }
        });
        return true;
    }

    // =========================================================================
    // Foreground Service & Notification Channels
    // =========================================================================
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;

            // 1. Discreet LoRa Background Service Channel (Low importance, quiet)
            NotificationChannel serviceChannel = new NotificationChannel(
                    SERVICE_CHANNEL_ID,
                    "EvakWar LoRa Background Monitor",
                    NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Keeps phone connected to 433.875 MHz LoRa mesh when app is closed");
            serviceChannel.setShowBadge(false);
            nm.createNotificationChannel(serviceChannel);

            // 2. RED Emergency Alert Channel (High importance, Loud Siren + Real Physical Hardware Vibration)
            NotificationChannel emergencyRedChannel = new NotificationChannel(
                    EMERGENCY_RED_CHANNEL_ID,
                    "EvakWar RED Emergency Alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            emergencyRedChannel.setDescription("Critical RED disaster warnings with loud siren and strong hardware motor vibration");
            emergencyRedChannel.enableVibration(true);
            emergencyRedChannel.setVibrationPattern(new long[]{0, 800, 200, 800, 200, 1200});
            emergencyRedChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            AudioAttributes alarmAudioAttr = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            emergencyRedChannel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), alarmAudioAttr);
            nm.createNotificationChannel(emergencyRedChannel);

            // 3. Advisory Emergency Alert Channel (Orange, Yellow, etc. - Loud Siren ONLY, ZERO Vibration)
            NotificationChannel emergencyOtherChannel = new NotificationChannel(
                    EMERGENCY_OTHER_CHANNEL_ID,
                    "EvakWar Weather & Advisory Alerts",
                    NotificationManager.IMPORTANCE_HIGH
            );
            emergencyOtherChannel.setDescription("Advisories and alerts (Orange/Yellow): Single emergency siren, ZERO vibration");
            emergencyOtherChannel.enableVibration(false);
            emergencyOtherChannel.setVibrationPattern(new long[]{0});
            emergencyOtherChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            // Single sound: Siren is driven continuously on STREAM_ALARM; avoid overlapping ringtone
            emergencyOtherChannel.setSound(null, null);
            nm.createNotificationChannel(emergencyOtherChannel);

            // 3. Normal-Priority Chat Message Channel (discrete notification sound, no emergency siren)
            NotificationChannel chatChannel = new NotificationChannel(
                    CHAT_CHANNEL_ID,
                    "EvakWar Chat Messages",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            chatChannel.setDescription("Resident and emergency responders mesh chat messages");
            chatChannel.enableVibration(true);
            chatChannel.setVibrationPattern(new long[]{0, 150, 100, 150});
            chatChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(chatChannel);

            // 4. 2-Hour LoRa Weather Sensor Channel (Normal notification only, ZERO siren)
            NotificationChannel weatherChannel = new NotificationChannel(
                    WEATHER_CHANNEL_ID,
                    "EvakWar LoRa Weather Sensor Updates",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            weatherChannel.setDescription("Periodic 2-hour weather sensor notifications without emergency sirens");
            weatherChannel.enableVibration(false);
            weatherChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(weatherChannel);
        }
    }

    private void startForegroundWithNotification(String statusText) {
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
    }

    private void updateForegroundNotification(String deviceName) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(SERVICE_NOTIFICATION_ID, buildServiceNotification(deviceName));
        }
    }

    private Notification buildServiceNotification(String deviceName) {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent == null) {
            launchIntent = new Intent(this, MainActivity.class);
        }
        launchIntent.setAction(Intent.ACTION_MAIN);
        launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra("open_lora_modal", !bleConnected.get());
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent launchPi = PendingIntent.getActivity(this, 101, launchIntent, piFlags);

        boolean isBle = bleConnected.get();
        String title = isBle ? "🛡️ EvakWar LoRa Mesh Guard" : "🛡️ EvakWar Emergency Guard";
        String nm = (deviceName != null && !deviceName.isEmpty()) ? deviceName : (activeBleName != null ? activeBleName : "EvakWar LoRa Node");
        String body = isBle
                ? "Connected: " + nm + " • 433.875 MHz Active"
                : "Active Emergency Monitor • Monitoring Wi-Fi & LoRa for Disaster Alerts";

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body + "\nKeeps resident terminal protected 24/7 even when the app is closed."))
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
    }

    // =========================================================================
    // Emergency Siren Alarm & Lock Screen WakeUp
    // =========================================================================
    private void triggerEmergencyAlarmAndNotification(final String title, final String message, final String severity, final String alertId) {
        mainHandler.post(() -> {
            // 1. Wake up the CPU and turn the phone screen ON
            try {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    PowerManager.WakeLock wl = pm.newWakeLock(
                            PowerManager.SCREEN_BRIGHT_WAKE_LOCK |
                            PowerManager.ACQUIRE_CAUSES_WAKEUP |
                            PowerManager.ON_AFTER_RELEASE,
                            "evakwar:emergency_screen_wake"
                    );
                    wl.acquire(15000); // Keep screen lit for 15 seconds
                }
            } catch (Exception ignored) {}

            // 2. Post High-Importance Heads-Up System Notification on lock screen
            try {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    Intent launchIntent = new Intent(LoraMeshService.this, MainActivity.class);
                    launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    launchIntent.putExtra("evw_alert_title", title);
                    launchIntent.putExtra("evw_alert_message", message);
                    launchIntent.putExtra("evw_alert_severity", severity);

                    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        piFlags |= PendingIntent.FLAG_IMMUTABLE;
                    }
                    PendingIntent pi = PendingIntent.getActivity(LoraMeshService.this, 102, launchIntent, piFlags);

                    Intent stopAlarmIntent = new Intent(LoraMeshService.this, LoraMeshService.class);
                    stopAlarmIntent.setAction(ACTION_STOP_ALARM);
                    if (alertId != null) stopAlarmIntent.putExtra("alert_id", alertId);
                    PendingIntent stopPi = PendingIntent.getService(LoraMeshService.this, 103, stopAlarmIntent, piFlags);

                    String cleanTitle = (title != null && !title.isEmpty()) ? title : "EMERGENCY EVACUATION ALERT";
                    String cleanMsg = (message != null && !message.isEmpty()) ? message : "Proceed to your designated safe evacuation center.";

                    boolean isRedAlert = (severity != null && severity.trim().equalsIgnoreCase("RED")) ||
                                         (title != null && title.toUpperCase().contains("RED"));
                    String targetChannel = isRedAlert ? EMERGENCY_RED_CHANNEL_ID : EMERGENCY_OTHER_CHANNEL_ID;

                    NotificationCompat.Builder b = new NotificationCompat.Builder(LoraMeshService.this, targetChannel)
                            .setSmallIcon(android.R.drawable.ic_dialog_alert)
                            .setContentTitle("🚨 " + cleanTitle)
                            .setContentText(cleanMsg)
                            .setStyle(new NotificationCompat.BigTextStyle().bigText(cleanMsg))
                            .setPriority(NotificationCompat.PRIORITY_MAX)
                            .setCategory(NotificationCompat.CATEGORY_ALARM)
                            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                            .setAutoCancel(true)
                            .setFullScreenIntent(pi, true)
                            .setContentIntent(pi)
                            .addAction(android.R.drawable.ic_lock_silent_mode_off, "Silence Siren", stopPi);

                    // For Mandatory RED alerts, add an "Evacuate" action button right beside "Silence Siren"
                    // that silences the siren and immediately opens the Evacuation Map auto-routed to the nearest center!
                    if (isRedAlert) {
                        Intent evacIntent = new Intent(LoraMeshService.this, MainActivity.class);
                        evacIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        evacIntent.putExtra("navigate_to", "/resident/evacuation?auto_route=nearest");
                        evacIntent.putExtra("stop_alarm_now", true);
                        if (alertId != null) evacIntent.putExtra("alert_id", alertId);
                        PendingIntent evacPi = PendingIntent.getActivity(LoraMeshService.this, 104, evacIntent, piFlags);
                        b.addAction(android.R.drawable.ic_menu_directions, "Evacuate", evacPi);
                        b.setVibrate(new long[]{0, 800, 200, 800, 200, 1200});
                    } else {
                        b.setVibrate(new long[]{0});
                    }

                    nm.notify(EMERGENCY_NOTIFICATION_ID, b.build());
                }
            } catch (Exception ignored) {}

            // 3. Trigger Hardware Vibrator (RED alerts: Continuous hardware motor vibration outside app; Orange/Yellow: ZERO vibration!)
            boolean isRedAlertVib = (severity != null && severity.trim().equalsIgnoreCase("RED")) ||
                                    (title != null && title.toUpperCase().contains("RED"));
            if (isRedAlertVib) {
                try {
                    Vibrator vib = null;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                        if (vm != null) vib = vm.getDefaultVibrator();
                    } else {
                        vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    }
                    if (vib != null && vib.hasVibrator()) {
                        long[] pattern = new long[]{0, 800, 200, 800, 200, 1200};
                        AudioAttributes vibAttr = new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build();
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            // Repeat at index 0: runs continuously until resident silences alert
                            vib.vibrate(VibrationEffect.createWaveform(pattern, 0), vibAttr);
                        } else {
                            vib.vibrate(pattern, 0);
                        }
                    }
                } catch (Exception ignored) {}
            } else {
                // Strictly STOP and CANCEL any vibration for Orange, Yellow, etc. (Siren ONLY)
                try {
                    Vibrator vib = null;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                        if (vm != null) vib = vm.getDefaultVibrator();
                    } else {
                        vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    }
                    if (vib != null) {
                        vib.cancel();
                    }
                } catch (Exception ignored) {}
            }

            // 4. Play Loud Emergency Alarm Siren on STREAM_ALARM (Max Volume)
            startEmergencySiren();
        });
    }

    private void startEmergencySiren() {
        if (nativeAlarmPlaying.getAndSet(true)) return;

        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int maxAlarm = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                int curAlarm = am.getStreamVolume(AudioManager.STREAM_ALARM);
                int targetAlarm = Math.max(curAlarm, (int) Math.ceil(maxAlarm * 0.90));
                am.setStreamVolume(AudioManager.STREAM_ALARM, targetAlarm, 0);
            }
        } catch (Exception ignored) {}

        try {
            if (nativeToneGen == null) {
                nativeToneGen = new ToneGenerator(AudioManager.STREAM_ALARM, 100);
            }
            nativeSirenLoopRunnable = new Runnable() {
                @Override
                public void run() {
                    if (!nativeAlarmPlaying.get() || nativeToneGen == null) return;
                    try {
                        nativeSirenToggle = !nativeSirenToggle;
                        int tone = nativeSirenToggle
                                ? ToneGenerator.TONE_CDMA_EMERGENCY_RINGBACK
                                : ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD;
                        nativeToneGen.startTone(tone, 360);
                    } catch (Exception ignored) {}
                    if (nativeAlarmPlaying.get()) {
                        mainHandler.postDelayed(this, 400);
                    }
                }
            };
            mainHandler.post(nativeSirenLoopRunnable);
        } catch (Exception e) {
            try {
                Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                if (alarmUri != null) {
                    nativeRingtone = RingtoneManager.getRingtone(getApplicationContext(), alarmUri);
                    if (nativeRingtone != null) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            nativeRingtone.setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_ALARM)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                    .build());
                        }
                        nativeRingtone.play();
                    }
                }
            } catch (Exception ignored) {}
        }
    }

    private void stopEmergencyAlarm() {
        nativeAlarmPlaying.set(false);
        mainHandler.post(() -> {
            if (nativeSirenLoopRunnable != null) {
                mainHandler.removeCallbacks(nativeSirenLoopRunnable);
                nativeSirenLoopRunnable = null;
            }
            if (nativeToneGen != null) {
                try {
                    nativeToneGen.stopTone();
                    nativeToneGen.release();
                } catch (Exception ignored) {}
                nativeToneGen = null;
            }
            if (nativeRingtone != null) {
                try {
                    if (nativeRingtone.isPlaying()) nativeRingtone.stop();
                } catch (Exception ignored) {}
                nativeRingtone = null;
            }
            try {
                Vibrator vib = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    if (vm != null) vib = vm.getDefaultVibrator();
                } else {
                    vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                }
                if (vib != null) vib.cancel();
            } catch (Exception ignored) {}
            try {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.cancel(EMERGENCY_NOTIFICATION_ID);
                }
            } catch (Exception ignored) {}
        });
    }

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
                pollLatestWeatherAlertOverWifi();
                pollLatestChatOverWifi();
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
            baseUrl = "https://evacwar.onrender.com";
        }
        baseUrl = baseUrl.replaceAll("/+$", "");
        String endpoint = baseUrl + "/api/lora/latest-alert";

        HttpURLConnection conn = null;
        try {
            URL u = new URL(endpoint);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3500);
            conn.setReadTimeout(3500);
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
                    if (sentAt.endsWith("Z")) {
                        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                    }
                    Date d = sdf.parse(sentAt);
                    if (d != null) timestampMs = d.getTime();
                } catch (Exception ignored) {}
            }

            // Use serverNowMs from API so phones with wrong dates/timezones still receive all live alerts
            long refNow = root.optLong("serverNowMs", System.currentTimeMillis());

            String title = alert.optString("title", "EMERGENCY ALERT").trim();
            String message = alert.optString("message", "Proceed to nearest safe evacuation center.").trim();
            String severity = alert.optString("severity", "RED").trim().toUpperCase();
            String evacCenter = alert.optString("evacCenter", "San Rafael Evacuation Center").trim();

            String alertKey = alertId + "|" + title + "|" + message;

            // Initial bootstrap: on cold app launch, ignore alerts older than 10 minutes on server clock
            if (!wifiInitialPollDone.get()) {
                wifiInitialPollDone.set(true);
                if (timestampMs > 0 && (refNow - timestampMs > 600_000L)) {
                    lastAlertedId = alertId;
                    return; // Ignore old historical alert
                }
            }

            // If resident already muted or silenced this alert, NEVER resound or wake screen
            if (mutedAlertKeys.contains(alertId) || mutedAlertKeys.contains(alertKey)) {
                return;
            }

            // Deduplicate: If this alert was ALREADY alerted on this phone, do NOT sound siren again!
            if (alertId.equals(lastAlertedId)) {
                return;
            }
            lastAlertedId = alertId;
            activeEmergencyAlertId = alertId;

            String fullMessage = "Shelter: " + evacCenter + "\n" + message;

            // 1. Wake screen, sound STREAM_ALARM siren, trigger hardware vibrator & lock screen heads-up notification
            triggerEmergencyAlarmAndNotification(title, fullMessage, severity, alertId);

            // 2. Notify active listener (WebView) so in-app modal pops up on screen
            BleListener listener = activeListener;
            if (listener != null) {
                String fakeLoraPacket = "EVW|ALT|" + alertId + "|" + severity + "|ALL|" + title + "|" + evacCenter + "|" + message;
                listener.onPacketReceived(fakeLoraPacket, fakeLoraPacket);
            }

        } catch (Exception e) {
            Log.w("LoraMeshService", "Error parsing Wi-Fi alert JSON: " + e.getMessage());
        }
    }

    private void pollLatestWeatherAlertOverWifi() {
        if (!isNetworkConnected()) return;
        String baseUrl = configuredServerUrl;
        if (baseUrl == null || baseUrl.isEmpty()) baseUrl = "https://evacwar.onrender.com";
        baseUrl = baseUrl.replaceAll("/+$", "");
        HttpURLConnection conn = null;
        try {
            URL u = new URL(baseUrl + "/api/lora/latest-weather-alert");
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3500);
            conn.setReadTimeout(3500);
            conn.setRequestProperty("Accept", "application/json");
            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(new BufferedInputStream(conn.getInputStream()), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                JSONObject root = new JSONObject(sb.toString());
                if (!root.optBoolean("success", false) || !root.optBoolean("relayOnline", false) || root.isNull("weatherAlert")) return;
                JSONObject w = root.getJSONObject("weatherAlert");
                String wId = w.optString("alertId", w.optString("id", "")).trim();
                if (wId.isEmpty()) return;
                long ts = w.optLong("timestampMs", 0);
                long refNow = root.optLong("serverNowMs", System.currentTimeMillis());
                if (!wifiWeatherInitialPollDone.get()) {
                    wifiWeatherInitialPollDone.set(true);
                    if (ts > 0 && (refNow - ts > 600_000L)) {
                        lastWeatherAlertId = wId;
                        return;
                    }
                }
                showWeatherNotificationStatic(LoraMeshService.this, wId, "🌤️ LoRa Weather Sensor Update", w.optString("message", ""));
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) { try { conn.disconnect(); } catch (Exception ignored) {} }
        }
    }

    private void pollLatestChatOverWifi() {
        if (!isNetworkConnected()) return;

        String baseUrl = configuredServerUrl;
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "https://evacwar.onrender.com";
        }
        baseUrl = baseUrl.replaceAll("/+$", "");
        String endpoint = baseUrl + "/api/lora/chat/latest";

        HttpURLConnection conn = null;
        try {
            URL u = new URL(endpoint);
            conn = (HttpURLConnection) u.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3500);
            conn.setReadTimeout(3500);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("User-Agent", "EvakWar-Android-Resident/2.0");

            int code = conn.getResponseCode();
            if (code == 200) {
                InputStream in = new BufferedInputStream(conn.getInputStream());
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();
                handleWifiChatJson(sb.toString());
            }
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    private void handleWifiChatJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) return;
        try {
            JSONObject root = new JSONObject(jsonStr);
            if (!root.optBoolean("success", false)) return;
            if (root.isNull("latest")) return;
            JSONObject latest = root.getJSONObject("latest");

            String msgId = latest.optString("msgId", latest.optString("id", "")).trim();
            if (msgId.isEmpty()) return;
            String sRole = latest.optString("senderRole", "Resident").trim();
            String sName = latest.optString("senderName", "Community Member").trim();
            String text = latest.optString("text", latest.optString("message", "")).trim();

            showChatNotificationStatic(LoraMeshService.this, msgId, sRole, sName, text);
        } catch (Exception ignored) {}
    }

}
