package ph.gov.baao.evakwar.resident;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
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
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

@SuppressLint("MissingPermission")
public class MainActivity extends BridgeActivity {
    private static final String ACTION_USB_PERMISSION = "ph.gov.baao.evakwar.resident.USB_PERMISSION";
    private static final int REQ_BLE_PERMS = 9433;

    // Meshtastic Official BLE GATT UUIDs
    private static final UUID MESH_SERVICE_UUID = UUID.fromString("6ba1b218-15a8-461f-9fa8-5dcae273eafd");
    private static final UUID TORADIO_UUID      = UUID.fromString("f75c76d2-129e-4dad-a1dd-7866124401e7");
    private static final UUID FROMRADIO_UUID    = UUID.fromString("2c55e69e-4993-11ed-b878-0242ac120002");
    private static final UUID FROMNUM_UUID      = UUID.fromString("ed9da18c-a800-4f66-a670-aa7547e34453");
    private static final UUID CCCD_UUID         = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    public static volatile MainActivity instance = null;

    // Native BLE State
    private BluetoothManager bluetoothManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothGatt activeBleGatt;
    private BluetoothGattCharacteristic charToRadio;
    private BluetoothGattCharacteristic charFromRadio;
    private BluetoothGattCharacteristic charFromNum;
    private String activeBleAddress = null;
    private String activeBleName = null;
    private final AtomicBoolean bleConnected = new AtomicBoolean(false);
    private final AtomicBoolean isBleScanning = new AtomicBoolean(false);
    private final Map<String, JSONObject> scannedBleDevices = new ConcurrentHashMap<>();
    private Runnable bleConnectTimeoutRunnable = null;
    private boolean bleRetriedWithAutoConnect = false;

    // Native USB-OTG State
    private UsbManager usbManager;
    private UsbDeviceConnection activeUsbConnection;
    private UsbInterface activeUsbInterface;
    private UsbEndpoint activeEpIn;
    private UsbEndpoint activeEpOut;
    private UsbDevice activeUsbDevice;
    private Thread usbReadThread;
    private final AtomicBoolean usbReading = new AtomicBoolean(false);
    private int pendingConnectDeviceId = -1;

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (ACTION_USB_PERMISSION.equals(action)) {
                synchronized (this) {
                    UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                    boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                    int targetId = pendingConnectDeviceId;
                    if (device != null) {
                        targetId = device.getDeviceId();
                    }
                    if (granted && targetId != -1) {
                        final int finalId = targetId;
                        new Thread(() -> {
                            boolean ok = openUsbDeviceInternal(finalId);
                            emitJsEvent("evakwar:native-usb-permission", "{\"granted\":true,\"connected\":" + ok + ",\"deviceId\":" + finalId + "}");
                        }).start();
                    } else {
                        emitJsEvent("evakwar:native-usb-permission", "{\"granted\":false,\"connected\":false}");
                    }
                }
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
                if (device != null && activeUsbDevice != null && device.getDeviceId() == activeUsbDevice.getDeviceId()) {
                    closeUsbInternal();
                    emitJsEvent("evakwar:native-usb-detached", "{\"deviceId\":" + device.getDeviceId() + "}");
                }
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                emitJsEvent("evakwar:native-usb-attached", "{}");
            }
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        usbManager = (UsbManager) getSystemService(Context.USB_SERVICE);
        bluetoothManager = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        } else {
            bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        }

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(usbReceiver, filter);
        }

        if (this.bridge != null && this.bridge.getWebView() != null) {
            try {
                WebSettings ws = this.bridge.getWebView().getSettings();
                if (ws != null) {
                    ws.setMediaPlaybackRequiresUserGesture(false);
                }
            } catch (Exception ignored) {}
            this.bridge.getWebView().addJavascriptInterface(new AndroidSettingsBridge(), "AndroidSettingsBridge");
            this.bridge.getWebView().addJavascriptInterface(new AndroidUsbSerialBridge(), "AndroidUsbSerialBridge");
            this.bridge.getWebView().addJavascriptInterface(new AndroidBleBridge(), "AndroidBleBridge");
        }

        createEmergencyNotificationChannel();
        requestAllStartupPermissions();

        // Start 24/7 Foreground Emergency Guard (Wi-Fi + LoRa Monitor)
        LoraMeshService.startServiceGuard(this);
        try {
            SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
            String savedName = prefs.getString("user_full_name", "");
            String savedRole = prefs.getString("user_role", "Resident");
            if (!savedName.isEmpty()) {
                LoraMeshService.setActiveUserStatic(savedName, savedRole);
            }
            String savedUrl = prefs.getString("server_url", "https://evacwar.onrender.com");
            if (LoraMeshService.instance != null) {
                LoraMeshService.instance.updateServerUrl(savedUrl);
            }
        } catch (Exception ignored) {}

        handleAlertLaunchIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAlertLaunchIntent(intent);
    }

    private void handleAlertLaunchIntent(Intent intent) {
        if (intent == null) return;

        if (intent.getBooleanExtra("stop_alarm_now", false)) {
            intent.removeExtra("stop_alarm_now");
            try {
                LoraMeshService.stopEmergencyAlarmStatic();
            } catch (Exception ignored) {}
        }

        String navTo = intent.getStringExtra("navigate_to");
        if ((navTo == null || navTo.isEmpty()) && intent.getDataString() != null) {
            String dataUri = intent.getDataString().toLowerCase();
            if (dataUri.contains("/evacuate") || dataUri.contains("/nearest-evac") || dataUri.contains("/evacuation") || dataUri.contains("evakwar://evacuate")) {
                navTo = "/resident/evacuation?auto_route=nearest";
                intent.setData(null);
                try {
                    LoraMeshService.stopEmergencyAlarmStatic();
                } catch (Exception ignored) {}
            }
        }
        if (navTo != null && !navTo.isEmpty()) {
            intent.removeExtra("navigate_to");
            final String safeNavTo = navTo.replace("'", "");
            Runnable doNav = () -> {
                try {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        String js = "(function(){\n" +
                                    "  try {\n" +
                                    "    var rawNav = '" + safeNavTo + "';\n" +
                                    "    var p = (window.location.pathname || '').toLowerCase();\n" +
                                    "    if (rawNav.indexOf('/evacuation') !== -1 || rawNav.indexOf('auto_route=nearest') !== -1) {\n" +
                                    "      if (typeof window.stopEmergencyAlertSound === 'function') window.stopEmergencyAlertSound();\n" +
                                    "      if (typeof window.closeGlobalEmergencyModal === 'function') window.closeGlobalEmergencyModal();\n" +
                                    "      if (p.indexOf('/evacuation') !== -1 || p.indexOf('/map') !== -1) {\n" +
                                    "        if (typeof window.findAndRouteNearestEvacCenter === 'function') {\n" +
                                    "          window.findAndRouteNearestEvacCenter(true);\n" +
                                    "        }\n" +
                                    "        return;\n" +
                                    "      }\n" +
                                    "      var rEv = (localStorage.getItem('evw_user_role') || 'resident').toLowerCase();\n" +
                                    "      var evTarget = (rEv === 'staff' || rEv === 'barangay_council') ? '/staff/map?auto_route=nearest' : (rEv === 'rescuer' ? '/rescuer/map?auto_route=nearest' : '/resident/evacuation?auto_route=nearest');\n" +
                                    "      if (typeof window.navigateToEvakWar === 'function') {\n" +
                                    "        window.navigateToEvakWar(evTarget);\n" +
                                    "      } else {\n" +
                                    "        var isCapEv = (window.location.protocol === 'file:' || window.location.hostname === 'localhost');\n" +
                                    "        var evDest = isCapEv ? (evTarget.split('?')[0] + '/index.html?auto_route=nearest') : evTarget;\n" +
                                    "        window.location.href = evDest;\n" +
                                    "      }\n" +
                                    "    } else if (rawNav.indexOf('/typhoon') !== -1 || rawNav.indexOf('/weather') !== -1) {\n" +
                                    "      var r = (localStorage.getItem('evw_user_role') || 'resident').toLowerCase();\n" +
                                    "      var rolePrefix = (r === 'staff' || r === 'barangay_council') ? '/staff' : (r === 'rescuer' ? '/rescuer' : '/resident');\n" +
                                    "      var target = rolePrefix + '/typhoon?view=sensor';\n" +
                                    "      if (typeof window.navigateToEvakWar === 'function') {\n" +
                                    "        window.navigateToEvakWar(target);\n" +
                                    "      } else {\n" +
                                    "        var isCap = (window.location.protocol === 'file:' || window.location.hostname === 'localhost');\n" +
                                    "        window.location.href = isCap ? (rolePrefix + '/typhoon/index.html?view=sensor') : target;\n" +
                                    "      }\n" +
                                    "    } else if (!p.includes('/chat')) {\n" +
                                    "      if (typeof window.navigateToEvakWar === 'function') {\n" +
                                    "        window.navigateToEvakWar(rawNav);\n" +
                                    "      } else {\n" +
                                    "        var isCap2 = (window.location.protocol === 'file:' || window.location.hostname === 'localhost');\n" +
                                    "        var dest = isCap2 ? '/resident/chat/index.html' : rawNav;\n" +
                                    "        window.location.href = dest;\n" +
                                    "      }\n" +
                                    "    }\n" +
                                    "  } catch(e) {}\n" +
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
                        String js = "(function(){\n" +
                                    "  try {\n" +
                                    "    if (typeof window.openLoraHardwarePicker === 'function') {\n" +
                                    "      window.openLoraHardwarePicker();\n" +
                                    "    } else if (typeof window.openLoraConnectionModal === 'function') {\n" +
                                    "      window.openLoraConnectionModal();\n" +
                                    "    } else {\n" +
                                    "      var btn = document.getElementById('btnHeaderLoraBle') || document.getElementById('connectLoraBtn') || document.querySelector('[onclick*=\"openLora\"]');\n" +
                                    "      if (btn) btn.click();\n" +
                                    "    }\n" +
                                    "  } catch(e) {}\n" +
                                    "})();";
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                } catch (Exception ignored) {}
            };
            mainHandler.postDelayed(triggerModal, 300);
            mainHandler.postDelayed(triggerModal, 1100);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        handleAlertLaunchIntent(getIntent());
        // Restore unread chat red dot if message arrived while paused or offline
        try {
            SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
            boolean hasUnreadChatFromPrefs = prefs.getBoolean("evw_chat_has_unread", false) || LoraMeshService.hasUnreadChatStatic;
            if (hasUnreadChatFromPrefs) {
                mainHandler.postDelayed(() -> {
                    if (this.bridge != null && this.bridge.getWebView() != null) {
                        String js = "(function(){\n" +
                                    "  try {\n" +
                                    "    localStorage.setItem('evw_chat_has_unread', 'true');\n" +
                                    "    var p = (window.location.pathname || '').toLowerCase();\n" +
                                    "    if (!p.includes('/chat')) {\n" +
                                    "      document.querySelectorAll('.chat-nav-red-dot').forEach(function(d){ d.classList.remove('hidden'); });\n" +
                                    "    }\n" +
                                    "  } catch(e) {}\n" +
                                    "})();";
                        this.bridge.getWebView().evaluateJavascript(js, null);
                    }
                }, 350);
            }
        } catch (Exception ignored) {}

        LoraMeshService.setListener(new LoraMeshService.BleListener() {
            @Override
            public void onStateChanged(String state, String mac, String name, String message) {
                emitBleState(state, mac, name, message);
            }

            @Override
            public void onPacketReceived(String packet, String ascii) {
                try {
                    JSONObject obj = new JSONObject();
                    if (packet != null) obj.put("packet", packet);
                    if (ascii != null) obj.put("ascii", ascii);
                    emitJsEvent("evakwar:native-ble-rx", obj.toString());
                } catch (Exception ignored) {}
            }
        });
    }

    @Override
    public void onPause() {
        LoraMeshService.setListener(null);
        super.onPause();
    }

    @Override
    public void onDestroy() {
        LoraMeshService.setListener(null);
        stopNativeEmergencyAlarmInternal();
        closeUsbInternal();
        try {
            unregisterReceiver(usbReceiver);
        } catch (Exception ignored) {}
        if (instance == this) instance = null;
        super.onDestroy();
    }

    private static final String EMERGENCY_RED_CHANNEL_ID   = "evw_emergency_red_v4";
    private static final String EMERGENCY_OTHER_CHANNEL_ID = "evw_emergency_other_v5";
    private final AtomicBoolean nativeAlarmPlaying = new AtomicBoolean(false);
    private ToneGenerator nativeToneGen = null;
    private Ringtone nativeRingtone = null;
    private Runnable nativeSirenLoopRunnable = null;
    private boolean nativeSirenToggle = false;

    private void createEmergencyNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    AudioAttributes alarmAudioAttr = new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build();

                    // 1. RED Alert Channel: Siren + Strong Continuous Hardware Motor Vibration
                    NotificationChannel redCh = new NotificationChannel(
                            EMERGENCY_RED_CHANNEL_ID,
                            "EvakWar RED Emergency Alerts",
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    redCh.setDescription("Critical RED disaster warnings: Loud siren and strong physical hardware motor vibration");
                    redCh.enableVibration(true);
                    redCh.setVibrationPattern(new long[]{0, 800, 200, 800, 200, 1200});
                    redCh.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    redCh.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), alarmAudioAttr);
                    nm.createNotificationChannel(redCh);

                    // 2. Advisory Channel (Orange, Yellow, etc.): Siren sound ONLY, ZERO VIBRATION
                    NotificationChannel otherCh = new NotificationChannel(
                            EMERGENCY_OTHER_CHANNEL_ID,
                            "EvakWar Weather & Advisory Alerts",
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    otherCh.setDescription("Advisories (Orange/Yellow): Single emergency siren, ZERO vibration");
                    otherCh.enableVibration(false);
                    otherCh.setVibrationPattern(new long[]{0});
                    otherCh.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    otherCh.setSound(null, null);
                    nm.createNotificationChannel(otherCh);
                }
            } catch (Exception ignored) {}
        }
    }

    private static final int REQ_LOCATION_PERMS = 9435;
    private static final int REQ_CHECK_LOCATION_SETTINGS = 9436;
    private static final int REQ_STARTUP_PERMS = 9438;

    private void requestAllStartupPermissions() {
        List<String> perms = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.CAMERA);
        }
        if (!perms.isEmpty()) {
            ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), REQ_STARTUP_PERMS);
        } else {
            promptEnableLocationIfDisabled();
        }
    }

    private void promptEnableLocationIfDisabled() {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return;
            boolean gpsEnabled = false;
            boolean networkEnabled = false;
            try { gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER); } catch (Exception ignored) {}
            try { networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) {}

            if (gpsEnabled || networkEnabled) {
                return; // Location already turned on, do not prompt!
            }

            // Google Play Services Location Settings Resolution Dialog
            // Displays the official Google Maps system modal inside the app:
            // "To continue, your device will need to use location..." with [No thanks] & [Turn on] buttons!
            // It turns on location directly WITHOUT jumping to the phone Settings page!
            com.google.android.gms.location.LocationRequest locationRequest =
                    new com.google.android.gms.location.LocationRequest.Builder(
                            com.google.android.gms.location.Priority.PRIORITY_HIGH_ACCURACY, 10000
                    ).setMinUpdateIntervalMillis(5000).build();

            com.google.android.gms.location.LocationSettingsRequest.Builder builder =
                    new com.google.android.gms.location.LocationSettingsRequest.Builder()
                            .addLocationRequest(locationRequest)
                            .setAlwaysShow(true);

            com.google.android.gms.location.SettingsClient client =
                    com.google.android.gms.location.LocationServices.getSettingsClient(this);

            com.google.android.gms.tasks.Task<com.google.android.gms.location.LocationSettingsResponse> task =
                    client.checkLocationSettings(builder.build());

            task.addOnSuccessListener(this, locationSettingsResponse -> {
                // Location settings satisfied
            });

            task.addOnFailureListener(this, e -> {
                if (e instanceof com.google.android.gms.common.api.ResolvableApiException) {
                    try {
                        com.google.android.gms.common.api.ResolvableApiException resolvable =
                                (com.google.android.gms.common.api.ResolvableApiException) e;
                        resolvable.startResolutionForResult(MainActivity.this, REQ_CHECK_LOCATION_SETTINGS);
                    } catch (android.content.IntentSender.SendIntentException sendEx) {
                        showInAppLocationDialogFallback();
                    }
                } else {
                    showInAppLocationDialogFallback();
                }
            });

        } catch (Exception e) {
            showInAppLocationDialogFallback();
        }
    }

    private void showInAppLocationDialogFallback() {
        try {
            new androidx.appcompat.app.AlertDialog.Builder(this)
                    .setTitle("Turn on Device Location?")
                    .setMessage("To continue, your device will need to use location for live GPS and safe evacuation routing.")
                    .setPositiveButton("Turn on", (dialog, which) -> {
                        try {
                            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                            startActivity(intent);
                        } catch (Exception ignored) {}
                    })
                    .setNegativeButton("No thanks", (dialog, which) -> dialog.dismiss())
                    .setCancelable(true)
                    .show();
        } catch (Exception ignored) {}
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_CHECK_LOCATION_SETTINGS) {
            boolean enabled = (resultCode == RESULT_OK);
            emitJsEvent("evakwar:location-status", "{\"enabled\":" + enabled + "}");
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION_PERMS || requestCode == REQ_STARTUP_PERMS) {
            promptEnableLocationIfDisabled();
        }
    }

    private static final int EMERGENCY_NOTIFICATION_ID = 4339;
    private static volatile String lastNativeAlertId = null;
    private static final Set<String> mutedAlertKeys = Collections.synchronizedSet(new HashSet<>());

    private void triggerNativeEmergencyAlarmInternal(final String title, final String message, final String severity, final String alertId) {
        if (alertId != null && !alertId.trim().isEmpty()) {
            String aid = alertId.trim();
            if (mutedAlertKeys.contains(aid) || aid.equals(lastNativeAlertId)) {
                return;
            }
            lastNativeAlertId = aid;
        }

        mainHandler.post(() -> {
            // 1. Post High-Importance Heads-Up System Notification (Single Fixed ID 4339)
            try {
                createEmergencyNotificationChannel();
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    Intent launchIntent = new Intent(MainActivity.this, MainActivity.class);
                    launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        piFlags |= PendingIntent.FLAG_IMMUTABLE;
                    }
                    PendingIntent pi = PendingIntent.getActivity(MainActivity.this, 101, launchIntent, piFlags);

                    Intent stopAlarmIntent = new Intent(MainActivity.this, LoraMeshService.class);
                    stopAlarmIntent.setAction(LoraMeshService.ACTION_STOP_ALARM);
                    PendingIntent stopPi = PendingIntent.getService(MainActivity.this, 103, stopAlarmIntent, piFlags);

                    String cleanTitle = (title != null && !title.isEmpty()) ? title : "EMERGENCY EVACUATION ALERT";
                    String cleanMsg = (message != null && !message.isEmpty()) ? message : "Proceed immediately to your designated evacuation center.";

                    boolean isRedAlert = (severity != null && severity.trim().equalsIgnoreCase("RED")) ||
                                         (title != null && title.toUpperCase().contains("RED"));
                    String targetChannel = isRedAlert ? EMERGENCY_RED_CHANNEL_ID : EMERGENCY_OTHER_CHANNEL_ID;

                    NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, targetChannel)
                            .setSmallIcon(android.R.drawable.ic_dialog_alert)
                            .setContentTitle("🚨 " + cleanTitle)
                            .setContentText(cleanMsg)
                            .setStyle(new NotificationCompat.BigTextStyle().bigText(cleanMsg))
                            .setPriority(NotificationCompat.PRIORITY_MAX)
                            .setCategory(NotificationCompat.CATEGORY_ALARM)
                            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                            .setAutoCancel(true)
                            .setContentIntent(pi)
                            .addAction(android.R.drawable.ic_lock_silent_mode_off, "Silence Siren", stopPi);

                    if (isRedAlert) {
                        builder.setVibrate(new long[]{0, 800, 200, 800, 200, 1200});
                    } else {
                        builder.setVibrate(new long[]{0});
                    }

                    // Uses constant EMERGENCY_NOTIFICATION_ID so Android updates single notification card in place
                    nm.notify(EMERGENCY_NOTIFICATION_ID, builder.build());
                }
            } catch (Exception ignored) {}

            // 2. Trigger Hardware Vibrator (RED alerts: Continuous hardware motor vibration; Orange/Yellow: ZERO vibration!)
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
                            // Repeat at index 0 (runs continuously until silenced)
                            vib.vibrate(VibrationEffect.createWaveform(pattern, 0), vibAttr);
                        } else {
                            vib.vibrate(pattern, 0);
                        }
                    }
                } catch (Exception ignored) {}
            } else {
                // Strictly CANCEL any vibration for Orange, Yellow, etc. (Siren ONLY)
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
            }

            // 3. Play Loud Native Emergency Alarm Siren on STREAM_ALARM
            if (nativeAlarmPlaying.getAndSet(true)) {
                return;
            }
            try {
                AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
                if (am != null) {
                    int maxAlarm = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
                    int curAlarm = am.getStreamVolume(AudioManager.STREAM_ALARM);
                    int targetAlarm = Math.max(curAlarm, (int) Math.ceil(maxAlarm * 0.85));
                    am.setStreamVolume(AudioManager.STREAM_ALARM, targetAlarm, 0);

                    int maxMusic = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    int curMusic = am.getStreamVolume(AudioManager.STREAM_MUSIC);
                    int targetMusic = Math.max(curMusic, (int) Math.ceil(maxMusic * 0.85));
                    am.setStreamVolume(AudioManager.STREAM_MUSIC, targetMusic, 0);
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
                    if (alarmUri == null) {
                        alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                    }
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
        });
    }

    private void stopNativeEmergencyAlarmInternal() {
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

    public void onChatPacketReceived(String msgId, String senderRole, String senderName, String text, long ts, int seq) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("id", msgId);
            obj.put("msgId", msgId);
            obj.put("senderRole", senderRole);
            obj.put("senderName", senderName);
            obj.put("text", text);
            obj.put("timestamp", ts);
            obj.put("seq", seq);
            obj.put("transport", "LORA_433MHZ");
            obj.put("status", "sent");
            emitJsEvent("evakwar:lora-chat", obj.toString());
        } catch (Exception ignored) {}
    }

    private void emitJsEvent(final String eventName, final String detailJson) {
        if (this.bridge == null || this.bridge.getWebView() == null) return;
        this.bridge.getWebView().post(() -> {
            try {
                String js = "window.dispatchEvent(new CustomEvent('" + eventName + "', { detail: " + detailJson + " }));";
                this.bridge.getWebView().evaluateJavascript(js, null);
            } catch (Exception ignored) {}
        });
    }

    private void ensureBlePermissions() {
        List<String> needed = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), REQ_BLE_PERMS);
        }
    }

    // =========================================================================
    // 1. NATIVE ANDROID BLUETOOTH LOW ENERGY (BLE) GATT BRIDGE
    //    Directly connects to already-paired or advertising ESP32 Meshtastic nodes
    //    without hanging on MTU negotiation or GATT cache errors!
    // =========================================================================
    private final ScanCallback nativeScanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (result == null || result.getDevice() == null) return;
            BluetoothDevice d = result.getDevice();
            String addr = d.getAddress();
            if (addr == null) return;
            try {
                String name = d.getName();
                if ((name == null || name.isEmpty()) && result.getScanRecord() != null) {
                    name = result.getScanRecord().getDeviceName();
                }
                JSONObject obj = scannedBleDevices.getOrDefault(addr, new JSONObject());
                obj.put("deviceId", addr);
                if (name != null && !name.isEmpty()) {
                    obj.put("name", name);
                } else if (!obj.has("name")) {
                    obj.put("name", "BLE Device (" + addr.substring(Math.max(0, addr.length() - 5)) + ")");
                }
                obj.put("rssi", result.getRssi());
                obj.put("bonded", d.getBondState() == BluetoothDevice.BOND_BONDED);
                scannedBleDevices.put(addr, obj);
                emitJsEvent("evakwar:native-ble-scan", obj.toString());
            } catch (Exception ignored) {}
        }
    };

    private final BluetoothGattCallback nativeGattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            String addr = gatt.getDevice() != null ? gatt.getDevice().getAddress() : "";
            String devName = gatt.getDevice() != null && gatt.getDevice().getName() != null
                    ? gatt.getDevice().getName()
                    : (activeBleName != null ? activeBleName : "EvakWar LoRa Node");

            if (newState == BluetoothProfile.STATE_CONNECTED) {
                activeBleGatt = gatt;
                activeBleAddress = addr;
                activeBleName = devName;

                emitBleState("DISCOVERING", addr, devName, "Connected to " + devName + ". Discovering 433.875 MHz LoRa services...");

                // Discover services once after a short stabilization delay (do NOT call requestMtu before
                // discoverServices, as that causes double service discovery or SMP encryption collision on ESP32!)
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
                try {
                    refreshGattCache(gatt);
                    gatt.close();
                } catch (Exception ignored) {}
                if (activeBleGatt == gatt) {
                    activeBleGatt = null;
                }

                // If the first direct connectGatt failed with transient GATT 133 after power-cycling onto battery,
                // wait 500ms for the radio stack to settle and retry cleanly (without deleting pairing bonds!).
                if (wasConnecting && !bleRetriedWithAutoConnect && addr != null && !addr.isEmpty()) {
                    bleRetriedWithAutoConnect = true;
                    emitBleState("RETRYING", addr, devName, "Refreshing Bluetooth link to " + devName + "...");
                    mainHandler.postDelayed(() -> connectBleInternal(addr, devName, false), 500);
                    return;
                }

                cancelBleConnectTimeout();
                emitBleState("DISCONNECTED", addr, devName, "Bluetooth link disconnected (status " + status + "). Make sure the ESP32 LoRa node is powered ON and within range.");
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
                emitBleState("ERROR", activeBleAddress, activeBleName, "Service discovery failed (status " + status + ").");
                return;
            }

            BluetoothGattService meshService = gatt.getService(MESH_SERVICE_UUID);
            if (meshService != null) {
                charToRadio   = meshService.getCharacteristic(TORADIO_UUID);
                charFromRadio = meshService.getCharacteristic(FROMRADIO_UUID);
                charFromNum   = meshService.getCharacteristic(FROMNUM_UUID);
            }

            notificationsInitializedForGatt = false;
            // Request larger MTU (512) after services are discovered so 70-90 byte EVW|SOS|... protobuf frames fit cleanly
            boolean mtuRequested = false;
            try {
                mtuRequested = gatt.requestMtu(512);
            } catch (Exception ignored) {}

            // Fallback in case onMtuChanged does not fire on an already-negotiated OS link
            mainHandler.postDelayed(() -> {
                if (activeBleGatt == gatt && !notificationsInitializedForGatt) {
                    enableFromNumNotificationsAndWake(gatt);
                }
            }, mtuRequested ? 420 : 80);

            cancelBleConnectTimeout();
            bleConnected.set(true);
            String devName = activeBleName != null ? activeBleName : "RES1 (!f4e213d4)";
            emitBleState("CONNECTED", activeBleAddress, devName, "Connected to " + devName);
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            super.onDescriptorWrite(gatt, descriptor, status);
            // Send want_config_id (4242 -> 0x18 0x92 0x21) to transition Meshtastic ESP32 PhoneAPI
            // from STATE_SEND_NOTHING to STATE_SEND_PACKETS so live LoRa broadcasts (EVW|ALT|...) are delivered!
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
                    // Continue draining FromRadio FIFO queue until empty so PhoneAPI reaches STATE_SEND_PACKETS
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

    private volatile int negotiatedBleMtu = 23;
    private volatile boolean notificationsInitializedForGatt = false;
    private volatile boolean phoneApiWokenForGatt = false;
    private volatile boolean txWritePending = false;

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
                // ToRadio { want_config_id = 4242 } -> field 3 varint 4242 = 0x18, 0x92, 0x21
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

            // Start draining FromRadio FIFO queue and start periodic 1.4s poll loop
            scheduleFromRadioDrain(gatt, 180);
            mainHandler.removeCallbacks(fromRadioPollRunnable);
            mainHandler.postDelayed(fromRadioPollRunnable, 1400);
        }, 120);
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
                    // Fallback in case onDescriptorWrite is delayed
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
        // Search for 'E', 'V', 'W', '|'
        for (int i = 0; i <= limit - 4; i++) {
            if ((data[i] & 0xFF) == 'E' &&
                (data[i + 1] & 0xFF) == 'V' &&
                (data[i + 2] & 0xFF) == 'W' &&
                (data[i + 3] & 0xFF) == '|') {

                // Check if preceded by protobuf Data.payload tag (0x12) + varint length
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
                JSONObject obj = new JSONObject();
                obj.put("packet", evw);
                obj.put("ascii", evw);
                emitJsEvent("evakwar:native-ble-rx", obj.toString());
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
                JSONObject obj = new JSONObject();
                obj.put("ascii", s);
                emitJsEvent("evakwar:native-ble-rx", obj.toString());
            }
        } catch (Exception ignored) {}
    }

    private boolean writeToRadioBytes(byte[] payload) {
        if (activeBleGatt == null || charToRadio == null || payload == null) return false;
        txWritePending = true;
        attemptWriteToRadioWithRetry(payload, 1);
        return true;
    }

    private void attemptWriteToRadioWithRetry(final byte[] payload, final int attempt) {
        mainHandler.post(() -> {
            if (activeBleGatt == null || charToRadio == null || payload == null) {
                txWritePending = false;
                return;
            }
            try {
                // If payload is larger than 20 bytes and MTU hasn't been expanded yet, request MTU 512 first
                if (payload.length > 20 && negotiatedBleMtu < 100 && attempt == 1) {
                    try {
                        activeBleGatt.requestMtu(512);
                    } catch (Exception ignored) {}
                    mainHandler.postDelayed(() -> attemptWriteToRadioWithRetry(payload, attempt + 1), 110);
                    return;
                }

                boolean written = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    int res = activeBleGatt.writeCharacteristic(charToRadio, payload, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    if (res != BluetoothStatusCodes.SUCCESS) {
                        res = activeBleGatt.writeCharacteristic(charToRadio, payload, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                    }
                    written = (res == BluetoothStatusCodes.SUCCESS);
                } else {
                    charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
                    charToRadio.setValue(payload);
                    written = activeBleGatt.writeCharacteristic(charToRadio);
                    if (!written) {
                        charToRadio.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
                        charToRadio.setValue(payload);
                        written = activeBleGatt.writeCharacteristic(charToRadio);
                    }
                }

                if (written) {
                    emitJsEvent("evakwar:native-ble-tx-status", "{\"success\":true,\"attempt\":" + attempt + ",\"bytes\":" + payload.length + "}");
                    // Safety clear for txWritePending if WRITE_TYPE_NO_RESPONSE or callback is delayed
                    mainHandler.postDelayed(() -> txWritePending = false, 350);
                } else if (attempt < 15) {
                    // GATT queue was busy (e.g., finishing a FromRadio read or descriptor write); retry in 80ms
                    mainHandler.postDelayed(() -> attemptWriteToRadioWithRetry(payload, attempt + 1), 80);
                } else {
                    emitJsEvent("evakwar:native-ble-tx-status", "{\"success\":false,\"attempt\":" + attempt + "}");
                    txWritePending = false;
                }
            } catch (Exception e) {
                if (attempt < 15) {
                    mainHandler.postDelayed(() -> attemptWriteToRadioWithRetry(payload, attempt + 1), 80);
                } else {
                    txWritePending = false;
                }
            }
        });
    }

    private void refreshGattCache(BluetoothGatt gatt) {
        try {
            Method refresh = gatt.getClass().getMethod("refresh");
            refresh.invoke(gatt);
        } catch (Exception ignored) {}
    }

    private void emitBleState(String state, String deviceId, String name, String message) {
        try {
            JSONObject obj = new JSONObject();
            obj.put("state", state);
            obj.put("deviceId", deviceId != null ? deviceId : "");
            obj.put("name", name != null ? name : "EvakWar LoRa Node");
            obj.put("message", message != null ? message : "");
            emitJsEvent("evakwar:native-ble-state", obj.toString());
        } catch (Exception ignored) {}
    }

    private void cancelBleConnectTimeout() {
        if (bleConnectTimeoutRunnable != null) {
            mainHandler.removeCallbacks(bleConnectTimeoutRunnable);
            bleConnectTimeoutRunnable = null;
        }
    }

    private void stopNativeBleScanInternal() {
        if (!isBleScanning.getAndSet(false)) return;
        try {
            if (bluetoothAdapter != null && bluetoothAdapter.isEnabled()) {
                BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
                if (scanner != null) {
                    scanner.stopScan(nativeScanCallback);
                }
            }
        } catch (Exception ignored) {}
    }

    private void closeBleInternal() {
        cancelBleConnectTimeout();
        mainHandler.removeCallbacks(fromRadioPollRunnable);
        stopNativeBleScanInternal();
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

    private void connectBleInternal(final String macAddress, final String deviceName, final boolean useAutoConnect) {
        stopNativeBleScanInternal();
        if (activeBleGatt != null) {
            try {
                refreshGattCache(activeBleGatt);
                activeBleGatt.disconnect();
                activeBleGatt.close();
            } catch (Exception ignored) {}
            activeBleGatt = null;
        }

        mainHandler.postDelayed(() -> {
            try {
                if (bluetoothAdapter == null) {
                    emitBleState("ERROR", macAddress, deviceName, "Bluetooth adapter unavailable.");
                    return;
                }
                BluetoothDevice device = bluetoothAdapter.getRemoteDevice(macAddress);
                if (device == null) {
                    emitBleState("ERROR", macAddress, deviceName, "Invalid Bluetooth address: " + macAddress);
                    return;
                }

                activeBleAddress = macAddress;
                activeBleName = (device.getName() != null && !device.getName().isEmpty()) ? device.getName() : deviceName;

                emitBleState("CONNECTING", macAddress, activeBleName, "Connecting to " + activeBleName + "...");

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    activeBleGatt = device.connectGatt(MainActivity.this, useAutoConnect, nativeGattCallback, BluetoothDevice.TRANSPORT_LE);
                } else {
                    activeBleGatt = device.connectGatt(MainActivity.this, useAutoConnect, nativeGattCallback);
                }

                cancelBleConnectTimeout();
                bleConnectTimeoutRunnable = () -> {
                    if (!bleConnected.get()) {
                        if (!bleRetriedWithAutoConnect) {
                            bleRetriedWithAutoConnect = true;
                            if (activeBleGatt != null) {
                                try {
                                    refreshGattCache(activeBleGatt);
                                    activeBleGatt.disconnect();
                                    activeBleGatt.close();
                                } catch (Exception ignored) {}
                                activeBleGatt = null;
                            }
                            emitBleState("RETRYING", macAddress, activeBleName, "Retrying BLE link to " + activeBleName + "...");
                            connectBleInternal(macAddress, activeBleName, false);
                        } else {
                            closeBleInternal();
                            emitBleState("ERROR", macAddress, activeBleName, "Connection timed out. Make sure " + activeBleName + " is powered ON (red LED lit) and within range.");
                        }
                    }
                };
                mainHandler.postDelayed(bleConnectTimeoutRunnable, 4800);
            } catch (Exception e) {
                emitBleState("ERROR", macAddress, deviceName, "Bluetooth connect error: " + e.getMessage());
            }
        }, 120);
    }

    public class AndroidBleBridge {
        @JavascriptInterface
        public void startScan() {
            ensureBlePermissions();
            try {
                if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) return;
                BluetoothLeScanner scanner = bluetoothAdapter.getBluetoothLeScanner();
                if (scanner != null && !isBleScanning.getAndSet(true)) {
                    ScanSettings settings = new ScanSettings.Builder()
                            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                            .build();
                    scanner.startScan(null, settings, nativeScanCallback);
                }
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void stopScan() {
            stopNativeBleScanInternal();
        }

        @JavascriptInterface
        public String getDevicesJson() {
            ensureBlePermissions();
            JSONArray out = new JSONArray();
            Map<String, JSONObject> merged = new HashMap<>(scannedBleDevices);

            try {
                // 1. Devices already connected at the Android OS GATT level
                if (bluetoothManager != null) {
                    List<BluetoothDevice> osConnected = bluetoothManager.getConnectedDevices(BluetoothProfile.GATT);
                    if (osConnected != null) {
                        for (BluetoothDevice d : osConnected) {
                            if (d.getAddress() == null) continue;
                            JSONObject obj = merged.getOrDefault(d.getAddress(), new JSONObject());
                            obj.put("deviceId", d.getAddress());
                            obj.put("name", d.getName() != null ? d.getName() : "Connected BLE Device");
                            obj.put("bonded", true);
                            obj.put("osConnected", true);
                            merged.put(d.getAddress(), obj);
                        }
                    }
                }

                // 2. Devices already paired/bonded in Android Bluetooth Settings
                if (bluetoothAdapter != null && bluetoothAdapter.isEnabled()) {
                    Set<BluetoothDevice> bonded = bluetoothAdapter.getBondedDevices();
                    if (bonded != null) {
                        for (BluetoothDevice d : bonded) {
                            if (d.getAddress() == null) continue;
                            JSONObject obj = merged.getOrDefault(d.getAddress(), new JSONObject());
                            obj.put("deviceId", d.getAddress());
                            if (!obj.has("name") || obj.optString("name").startsWith("BLE Device")) {
                                obj.put("name", d.getName() != null ? d.getName() : "Paired Bluetooth Device");
                            }
                            obj.put("bonded", true);
                            merged.put(d.getAddress(), obj);
                        }
                    }
                }
            } catch (Exception ignored) {}

            for (JSONObject item : merged.values()) {
                out.put(item);
            }
            return out.toString();
        }

        @JavascriptInterface
        public void connectDevice(String macAddress, String deviceName) {
            ensureBlePermissions();
            LoraMeshService.startService(MainActivity.this, macAddress, deviceName != null ? deviceName : "RES1 (!f4e213d4)");
        }

        @JavascriptInterface
        public boolean isConnected() {
            boolean btOn = bluetoothAdapter != null && bluetoothAdapter.isEnabled();
            return btOn && LoraMeshService.isConnected();
        }

        @JavascriptInterface
        public String getConnectionStateJson() {
            JSONObject obj = new JSONObject();
            try {
                boolean btOn = bluetoothAdapter != null && bluetoothAdapter.isEnabled();
                boolean nativeConn = btOn && LoraMeshService.isConnected();
                obj.put("connected", nativeConn);
                obj.put("nativeBridge", nativeConn);
                obj.put("bluetoothEnabled", btOn);
                obj.put("deviceId", nativeConn ? LoraMeshService.getActiveAddress() : "");
                obj.put("name", nativeConn ? LoraMeshService.getActiveName() : "");
                obj.put("osConnected", false);
            } catch (Exception ignored) {}
            return obj.toString();
        }

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

        @JavascriptInterface
        public void setChatOpen(boolean isOpen) {
            LoraMeshService.setChatForegroundStatic(isOpen);
            if (isOpen) {
                clearUnreadChat();
                try {
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(8800);
                } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void setActiveUser(String fullName, String role) {
            LoraMeshService.setActiveUserStatic(fullName, role);
            if (fullName != null && !fullName.trim().isEmpty()) {
                try {
                    SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
                    prefs.edit().putString("user_full_name", fullName.trim()).apply();
                } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void showChatNotification(String msgId, String senderRole, String senderName, String text) {
            LoraMeshService.showChatNotificationStatic(MainActivity.this, msgId, senderRole, senderName, text);
        }

        @JavascriptInterface
        public void triggerNativeWeatherNotification(String title, String body, String weatherId) {
            LoraMeshService.showWeatherNotificationStatic(MainActivity.this, weatherId, title, body);
        }

        @JavascriptInterface
        public void markMessageSentBySelf(String msgId) {
            LoraMeshService.markMessageSentBySelfStatic(msgId);
        }

        @JavascriptInterface
        public boolean writeHex(String hexString) {
            return LoraMeshService.writeHex(hexString);
        }

        @JavascriptInterface
        public void disconnect() {
            LoraMeshService.disconnectBle(MainActivity.this);
        }

        @JavascriptInterface
        public void triggerNativeEmergencyAlarm(String title, String message, String severity) {
            triggerNativeEmergencyAlarmInternal(title, message, severity, null);
        }

        @JavascriptInterface
        public void triggerNativeEmergencyAlarm(String title, String message, String severity, String alertId) {
            triggerNativeEmergencyAlarmInternal(title, message, severity, alertId);
        }

        @JavascriptInterface
        public void stopNativeEmergencyAlarm() {
            LoraMeshService.stopEmergencyAlarmStatic();
            stopNativeEmergencyAlarmInternal();
        }

        @JavascriptInterface
        public void muteAlert(String alertId) {
            if (alertId != null && !alertId.trim().isEmpty()) {
                String clean = alertId.trim();
                mutedAlertKeys.add(clean);
                LoraMeshService.muteAlertStatic(clean);
            }
            LoraMeshService.stopEmergencyAlarmStatic();
            stopNativeEmergencyAlarmInternal();
        }

        @JavascriptInterface
        public boolean unpairDevice(String macAddress) {
            ensureBlePermissions();
            try {
                if (LoraMeshService.isConnected()) {
                    LoraMeshService.disconnectBle(MainActivity.this);
                }
                if (bluetoothAdapter == null || macAddress == null) return false;
                BluetoothDevice dev = bluetoothAdapter.getRemoteDevice(macAddress);
                if (dev != null && dev.getBondState() == BluetoothDevice.BOND_BONDED) {
                    Method removeBond = dev.getClass().getMethod("removeBond");
                    Object res = removeBond.invoke(dev);
                    return res instanceof Boolean ? (Boolean) res : true;
                }
            } catch (Exception ignored) {}
            return false;
        }
    }

    // =========================================================================
    // 2. ANDROID SETTINGS & PAIRED BLUETOOTH SHORTCUT BRIDGE
    // =========================================================================
    public class AndroidSettingsBridge {
        @JavascriptInterface
        public void openBluetoothSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                openGeneralSettings();
            }
        }

        @JavascriptInterface
        public void openWifiSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                openGeneralSettings();
            }
        }

        @JavascriptInterface
        public void openGeneralSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public boolean isBluetoothEnabled() {
            try {
                return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
            } catch (Exception e) {
                return true;
            }
        }

        @JavascriptInterface
        public boolean isLocationEnabled() {
            try {
                LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                if (lm == null) return false;
                boolean gpsEnabled = false;
                boolean networkEnabled = false;
                try {
                    gpsEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER);
                } catch (Exception ignored) {}
                try {
                    networkEnabled = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
                } catch (Exception ignored) {}
                return gpsEnabled || networkEnabled;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void requestEnableLocationDialog() {
            mainHandler.post(() -> promptEnableLocationIfDisabled());
        }

        @JavascriptInterface
        public void openLocationSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                openGeneralSettings();
            }
        }

        @JavascriptInterface
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
        public void requestEnableBluetooth() {
            try {
                ensureBlePermissions();
                Intent enableBtIntent = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
                enableBtIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(enableBtIntent);
            } catch (Exception e) {
                openBluetoothSettings();
            }
        }

        @JavascriptInterface
        public String getBondedBluetoothDevicesJson() {
            ensureBlePermissions();
            JSONArray arr = new JSONArray();
            try {
                if (bluetoothAdapter != null && bluetoothAdapter.isEnabled()) {
                    Set<BluetoothDevice> bonded = bluetoothAdapter.getBondedDevices();
                    if (bonded != null) {
                        for (BluetoothDevice d : bonded) {
                            JSONObject obj = new JSONObject();
                            String name = d.getName();
                            String addr = d.getAddress();
                            obj.put("deviceId", addr != null ? addr : "");
                            obj.put("name", name != null ? name : "Paired Bluetooth Device");
                            obj.put("bonded", true);
                            arr.put(obj);
                        }
                    }
                }
            } catch (Exception ignored) {}
            return arr.toString();
        }
    }

    // =========================================================================
    // 3. NATIVE ANDROID USB-OTG SERIAL BRIDGE (115200 BAUD 8N1)
    // =========================================================================
    public class AndroidUsbSerialBridge {
        @JavascriptInterface
        public String listDevicesJson() {
            JSONArray arr = new JSONArray();
            try {
                if (usbManager == null) return arr.toString();
                HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
                if (deviceList != null) {
                    for (UsbDevice device : deviceList.values()) {
                        JSONObject obj = new JSONObject();
                        int vid = device.getVendorId();
                        int pid = device.getProductId();
                        obj.put("deviceId", device.getDeviceId());
                        obj.put("deviceName", device.getDeviceName());
                        obj.put("vendorId", vid);
                        obj.put("productId", pid);
                        obj.put("hasPermission", usbManager.hasPermission(device));

                        String prodName = "";
                        String mfgName = "";
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            try {
                                prodName = device.getProductName() != null ? device.getProductName() : "";
                                mfgName = device.getManufacturerName() != null ? device.getManufacturerName() : "";
                            } catch (Exception ignored) {}
                        }

                        String chipType = detectChipType(vid, pid, prodName);
                        obj.put("chipType", chipType);
                        String label = !prodName.isEmpty() ? prodName : ("ESP32 USB-OTG (" + chipType + ")");
                        if (!mfgName.isEmpty() && !label.toLowerCase().contains(mfgName.toLowerCase())) {
                            label = mfgName + " " + label;
                        }
                        obj.put("label", label.trim());
                        arr.put(obj);
                    }
                }
            } catch (Exception ignored) {}
            return arr.toString();
        }

        @JavascriptInterface
        public String connectDevice(int deviceId) {
            JSONObject res = new JSONObject();
            try {
                if (usbManager == null) {
                    res.put("status", "ERROR");
                    res.put("message", "USB Host Manager not available on this phone.");
                    return res.toString();
                }

                UsbDevice target = findUsbDevice(deviceId);
                if (target == null) {
                    res.put("status", "ERROR");
                    res.put("message", "No USB-OTG serial device found. Check your OTG adapter and cable.");
                    return res.toString();
                }

                if (!usbManager.hasPermission(target)) {
                    pendingConnectDeviceId = target.getDeviceId();
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        flags |= PendingIntent.FLAG_IMMUTABLE;
                    }
                    Intent permIntent = new Intent(ACTION_USB_PERMISSION);
                    permIntent.setPackage(getPackageName());
                    PendingIntent pi = PendingIntent.getBroadcast(MainActivity.this, 0, permIntent, flags);
                    usbManager.requestPermission(target, pi);

                    res.put("status", "PERMISSION_REQUESTED");
                    res.put("deviceId", target.getDeviceId());
                    res.put("message", "Waiting for Android USB permission approval...");
                    return res.toString();
                }

                boolean connected = openUsbDeviceInternal(target.getDeviceId());
                if (connected) {
                    res.put("status", "CONNECTED");
                    res.put("deviceId", target.getDeviceId());
                    res.put("deviceName", target.getDeviceName());
                } else {
                    res.put("status", "ERROR");
                    res.put("message", "Could not open USB serial endpoints on device.");
                }
            } catch (Exception e) {
                try {
                    res.put("status", "ERROR");
                    res.put("message", e.getMessage());
                } catch (Exception ignored) {}
            }
            return res.toString();
        }

        @JavascriptInterface
        public boolean isConnected() {
            return activeUsbConnection != null && activeEpOut != null && usbReading.get();
        }

        @JavascriptInterface
        public boolean writeHex(String hexString) {
            if (activeUsbConnection == null || activeEpOut == null || hexString == null) return false;
            try {
                String clean = hexString.replaceAll("[^0-9A-Fa-f]", "");
                int len = clean.length();
                byte[] data = new byte[len / 2];
                for (int i = 0; i < len; i += 2) {
                    data[i / 2] = (byte) ((Character.digit(clean.charAt(i), 16) << 4)
                            + Character.digit(clean.charAt(i + 1), 16));
                }
                int written = activeUsbConnection.bulkTransfer(activeEpOut, data, data.length, 1500);
                return written >= 0;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean writeBase64(String b64) {
            if (activeUsbConnection == null || activeEpOut == null || b64 == null) return false;
            try {
                byte[] data = Base64.decode(b64, Base64.DEFAULT);
                int written = activeUsbConnection.bulkTransfer(activeEpOut, data, data.length, 1500);
                return written >= 0;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void disconnect() {
            closeUsbInternal();
        }
    }

    private String detectChipType(int vid, int pid, String prodName) {
        if (vid == 0x10C4) return "CP210x";
        if (vid == 0x1A86) return "CH340/CH9102";
        if (vid == 0x0403) return "FTDI";
        if (vid == 0x303A) return "Espressif USB";
        String lower = prodName != null ? prodName.toLowerCase() : "";
        if (lower.contains("cp210")) return "CP210x";
        if (lower.contains("ch340") || lower.contains("ch910")) return "CH340/CH9102";
        return String.format("VID:0x%04X", vid);
    }

    private UsbDevice findUsbDevice(int deviceId) {
        if (usbManager == null) return null;
        HashMap<String, UsbDevice> map = usbManager.getDeviceList();
        if (map == null || map.isEmpty()) return null;
        for (UsbDevice d : map.values()) {
            if (deviceId <= 0 || d.getDeviceId() == deviceId) {
                return d;
            }
        }
        return map.values().iterator().next();
    }

    private synchronized boolean openUsbDeviceInternal(int deviceId) {
        closeUsbInternal();
        UsbDevice device = findUsbDevice(deviceId);
        if (device == null || !usbManager.hasPermission(device)) return false;

        UsbDeviceConnection conn = usbManager.openDevice(device);
        if (conn == null) return false;

        UsbInterface selectedIface = null;
        UsbEndpoint epIn = null;
        UsbEndpoint epOut = null;

        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            UsbEndpoint candidateIn = null;
            UsbEndpoint candidateOut = null;
            for (int j = 0; j < iface.getEndpointCount(); j++) {
                UsbEndpoint ep = iface.getEndpoint(j);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
                    if (ep.getDirection() == UsbConstants.USB_DIR_IN) {
                        candidateIn = ep;
                    } else if (ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                        candidateOut = ep;
                    }
                }
            }
            if (candidateIn != null && candidateOut != null) {
                selectedIface = iface;
                epIn = candidateIn;
                epOut = candidateOut;
                break;
            }
        }

        if (selectedIface == null || epIn == null || epOut == null) {
            conn.close();
            return false;
        }

        if (!conn.claimInterface(selectedIface, true)) {
            conn.close();
            return false;
        }

        configureUsbSerialChip(conn, device.getVendorId(), device.getProductId(), selectedIface.getId());

        activeUsbDevice = device;
        activeUsbConnection = conn;
        activeUsbInterface = selectedIface;
        activeEpIn = epIn;
        activeEpOut = epOut;
        usbReading.set(true);

        try {
            byte[] wakeFrame = new byte[]{(byte) 0x94, (byte) 0xC3, 0x00, 0x02, 0x18, 0x2A};
            conn.bulkTransfer(epOut, wakeFrame, wakeFrame.length, 500);
        } catch (Exception ignored) {}

        startUsbReaderThread();
        return true;
    }

    private void configureUsbSerialChip(UsbDeviceConnection conn, int vid, int pid, int ifaceIndex) {
        try {
            if (vid == 0x10C4) {
                conn.controlTransfer(0x41, 0x00, 0x0001, ifaceIndex, null, 0, 300);
                conn.controlTransfer(0x41, 0x07, 0x0303, ifaceIndex, null, 0, 300);
                conn.controlTransfer(0x41, 0x03, 0x0800, ifaceIndex, null, 0, 300);
                byte[] baudBytes = new byte[]{(byte) 0x00, (byte) 0xC2, (byte) 0x01, (byte) 0x00};
                conn.controlTransfer(0x41, 0x1E, 0, ifaceIndex, baudBytes, baudBytes.length, 300);
            } else if (vid == 0x1A86 && (pid == 0x7523 || pid == 0x5523)) {
                conn.controlTransfer(0x40, 0xA1, 0, 0, null, 0, 300);
                conn.controlTransfer(0x40, 0x9A, 0x1312, 0xCC03, null, 0, 300);
                conn.controlTransfer(0x40, 0x9A, 0x2518, 0x00C3, null, 0, 300);
                conn.controlTransfer(0x40, 0xA4, 0x009F, 0, null, 0, 300);
            } else if (vid == 0x0403) {
                conn.controlTransfer(0x40, 0x00, 0, ifaceIndex, null, 0, 300);
                conn.controlTransfer(0x40, 0x01, 0x0303, ifaceIndex, null, 0, 300);
                conn.controlTransfer(0x40, 0x04, 0x0008, ifaceIndex, null, 0, 300);
                conn.controlTransfer(0x40, 0x03, 0x001A, ifaceIndex, null, 0, 300);
            } else {
                byte[] lineCoding = new byte[]{
                        (byte) 0x00, (byte) 0xC2, (byte) 0x01, (byte) 0x00,
                        0x00,
                        0x00,
                        0x08
                };
                conn.controlTransfer(0x21, 0x20, 0, ifaceIndex, lineCoding, lineCoding.length, 300);
                conn.controlTransfer(0x21, 0x22, 0x0003, ifaceIndex, null, 0, 300);
                conn.controlTransfer(0x41, 0x00, 0x0001, ifaceIndex, null, 0, 200);
                conn.controlTransfer(0x41, 0x1E, 0, ifaceIndex, new byte[]{(byte) 0x00, (byte) 0xC2, (byte) 0x01, (byte) 0x00}, 4, 200);
            }
        } catch (Exception ignored) {}
    }

    private void startUsbReaderThread() {
        usbReadThread = new Thread(() -> {
            byte[] buffer = new byte[512];
            while (usbReading.get() && activeUsbConnection != null && activeEpIn != null) {
                try {
                    int len = activeUsbConnection.bulkTransfer(activeEpIn, buffer, buffer.length, 400);
                    if (len > 0) {
                        byte[] chunk = new byte[len];
                        System.arraycopy(buffer, 0, chunk, 0, len);
                        String b64 = Base64.encodeToString(chunk, Base64.NO_WRAP);

                        StringBuilder cleanChunk = new StringBuilder();
                        for (int i = 0; i < len; i++) {
                            int b = chunk[i] & 0xFF;
                            if (b >= 32 && b <= 126) {
                                cleanChunk.append((char) b);
                            } else if (b == 10 || b == 13) {
                                cleanChunk.append('\n');
                            }
                        }

                        JSONObject ev = new JSONObject();
                        ev.put("base64", b64);
                        ev.put("ascii", cleanChunk.toString());
                        String evw = extractEvwPacketFromBytes(chunk, len);
                        if (evw != null) {
                            ev.put("packet", evw);
                        }
                        emitJsEvent("evakwar:native-usb-rx", ev.toString());
                    }
                } catch (Exception e) {
                    try {
                        Thread.sleep(100);
                    } catch (InterruptedException ie) {
                        break;
                    }
                }
            }
        }, "EvakWarUsbReader");
        usbReadThread.setDaemon(true);
        usbReadThread.start();
    }

    private synchronized void closeUsbInternal() {
        usbReading.set(false);
        if (usbReadThread != null) {
            try {
                usbReadThread.interrupt();
            } catch (Exception ignored) {}
            usbReadThread = null;
        }
        if (activeUsbConnection != null) {
            try {
                if (activeUsbInterface != null) {
                    activeUsbConnection.releaseInterface(activeUsbInterface);
                }
                activeUsbConnection.close();
            } catch (Exception ignored) {}
        }
        activeUsbConnection = null;
        activeUsbInterface = null;
        activeEpIn = null;
        activeEpOut = null;
        activeUsbDevice = null;
    }
}
