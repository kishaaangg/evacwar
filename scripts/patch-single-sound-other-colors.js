/**
 * Patch: Single Clean Siren for Other Color Alerts (Orange/Yellow)
 * - Keep RED Alert sound and vibration 100% UNCHANGED.
 * - For Other Colors (Orange/Yellow):
 *   1. Notification channel sound set to null so it doesn't play a conflicting phone ringtone over the siren.
 *   2. MainActivity checks if LoraMeshService is already playing the siren and DOES NOT launch a duplicate ToneGenerator.
 *   3. header.ejs suppresses duplicate WebAudio synth / MP3 inside the native app so only the single native siren plays.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// =========================================================================
// 1. PATCH LoraMeshService.java
// =========================================================================
const loraServicePath = path.join(
  ROOT_DIR,
  'android', 'app', 'src', 'main', 'java', 'ph', 'gov', 'baao', 'evakwar', 'resident', 'LoraMeshService.java'
);

if (fs.existsSync(loraServicePath)) {
  let content = fs.readFileSync(loraServicePath, 'utf8');

  // Add public boolean isAlarmPlaying() if not present
  if (!content.includes('public boolean isAlarmPlaying()')) {
    content = content.replace(
      'private final AtomicBoolean nativeAlarmPlaying = new AtomicBoolean(false);',
      `private final AtomicBoolean nativeAlarmPlaying = new AtomicBoolean(false);\n\n    public boolean isAlarmPlaying() {\n        return nativeAlarmPlaying.get();\n    }`
    );
    console.log('[Patch] LoraMeshService.java: Added isAlarmPlaying() helper.');
  }

  // Update EMERGENCY_OTHER_CHANNEL_ID to use version 5 without duplicate system sound
  content = content.replace(
    'private static final String EMERGENCY_OTHER_CHANNEL_ID   = "evw_emergency_other_v4";',
    'private static final String EMERGENCY_OTHER_CHANNEL_ID   = "evw_emergency_other_v5";'
  );

  // Set sound on otherCh to null so only ToneGenerator siren plays
  const oldOtherChRegex = /NotificationChannel\s+emergencyOtherChannel\s*=\s*new\s+NotificationChannel\([\s\S]*?nm\.createNotificationChannel\(emergencyOtherChannel\);/;
  const newOtherChBlock = `NotificationChannel emergencyOtherChannel = new NotificationChannel(
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
            nm.createNotificationChannel(emergencyOtherChannel);`;

  if (oldOtherChRegex.test(content)) {
    content = content.replace(oldOtherChRegex, newOtherChBlock);
    console.log('[Patch] LoraMeshService.java: Updated emergencyOtherChannel to silent channel (single siren).');
  }

  fs.writeFileSync(loraServicePath, content, 'utf8');
}

// =========================================================================
// 2. PATCH MainActivity.java
// =========================================================================
const mainActivityPath = path.join(
  ROOT_DIR,
  'android', 'app', 'src', 'main', 'java', 'ph', 'gov', 'baao', 'evakwar', 'resident', 'MainActivity.java'
);

if (fs.existsSync(mainActivityPath)) {
  let content = fs.readFileSync(mainActivityPath, 'utf8');

  // Update EMERGENCY_OTHER_CHANNEL_ID in MainActivity
  content = content.replace(
    'private static final String EMERGENCY_OTHER_CHANNEL_ID = "evw_emergency_other_v4";',
    'private static final String EMERGENCY_OTHER_CHANNEL_ID = "evw_emergency_other_v5";'
  );

  // Set sound on otherCh to null in MainActivity
  const oldOtherChMainRegex = /NotificationChannel\s+otherCh\s*=\s*new\s+NotificationChannel\([\s\S]*?nm\.createNotificationChannel\(otherCh\);/;
  const newOtherChMainBlock = `NotificationChannel otherCh = new NotificationChannel(
                            EMERGENCY_OTHER_CHANNEL_ID,
                            "EvakWar Weather & Advisory Alerts",
                            NotificationManager.IMPORTANCE_HIGH
                    );
                    otherCh.setDescription("Advisories (Orange/Yellow): Single emergency siren, ZERO vibration");
                    otherCh.enableVibration(false);
                    otherCh.setVibrationPattern(new long[]{0});
                    otherCh.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    otherCh.setSound(null, null);
                    nm.createNotificationChannel(otherCh);`;

  if (oldOtherChMainRegex.test(content)) {
    content = content.replace(oldOtherChMainRegex, newOtherChMainBlock);
    console.log('[Patch] MainActivity.java: otherCh updated to single siren channel.');
  }

  // Prevent duplicate ToneGenerator when LoraMeshService is already playing
  const oldNativeAlarmPlay = `// 3. Play Loud Native Emergency Alarm Siren on STREAM_ALARM
            if (nativeAlarmPlaying.getAndSet(true)) {
                return;
            }`;
  const newNativeAlarmPlay = `// 3. Play Loud Native Emergency Alarm Siren on STREAM_ALARM
            // If LoraMeshService is already playing the siren from background, DO NOT start a second sound!
            if (LoraMeshService.instance != null && LoraMeshService.instance.isAlarmPlaying()) {
                return;
            }
            if (nativeAlarmPlaying.getAndSet(true)) {
                return;
            }`;

  if (content.includes(oldNativeAlarmPlay)) {
    content = content.replace(oldNativeAlarmPlay, newNativeAlarmPlay);
    console.log('[Patch] MainActivity.java: Prevented duplicate ToneGenerator playback.');
  }

  fs.writeFileSync(mainActivityPath, content, 'utf8');
}

// =========================================================================
// 3. PATCH views/partials/header.ejs
// =========================================================================
const headerEjsPath = path.join(ROOT_DIR, 'views', 'partials', 'header.ejs');
if (fs.existsSync(headerEjsPath)) {
  let content = fs.readFileSync(headerEjsPath, 'utf8');

  // Strengthen native app detection in playEmergencyAlertSound so WebAudio/MP3 NEVER overlaps
  const oldPlayFnRegex = /window\.playEmergencyAlertSound\s*=\s*function\s*\(\)\s*\{[\s\S]*?startWebAudioSiren\(\);[\s\S]*?\}\s*catch\s*\(_\)\s*\{\}\s*\};/;
  const newPlayFn = `window.playEmergencyAlertSound = function () {
                          // Check if running inside the Native Android App:
                          const isNativeApp = Boolean(
                            (typeof window !== 'undefined' && window.AndroidBleBridge) ||
                            (typeof window !== 'undefined' && window.AndroidSettingsBridge) ||
                            (typeof window !== 'undefined' && window.AndroidUsbSerialBridge) ||
                            (typeof window !== 'undefined' && window.Capacitor) ||
                            (typeof window !== 'undefined' && window.location && (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.port === ''))
                          );
                          // In native app, native Java STREAM_ALARM siren is ALREADY playing seamlessly!
                          // Strictly DO NOT play any WebAudio or MP3 inside the native app:
                          if (isNativeApp) {
                            return;
                          }

                          // Web browser fallback only (single audio sound, no overlapping synth):
                          try {
                            const audio = getAlertAudio();
                            audio.currentTime = 0;
                            audio.play().catch(() => {});
                          } catch (_) {}
                        };`;

  if (oldPlayFnRegex.test(content)) {
    content = content.replace(oldPlayFnRegex, newPlayFn);
    console.log('[Patch] header.ejs: playEmergencyAlertSound updated to single sound.');
  }

  // Also in Step C, check isRedAlertSeverity vs other colors
  const oldStepC = `// Step C: Play Emergency Siren Tone (WebAudio + HTML5 Audio)
                          window.playEmergencyAlertSound();`;
  const newStepC = `// Step C: Play Emergency Siren Tone
                          const isNativeAppEnv = Boolean(
                            (typeof window !== 'undefined' && window.AndroidBleBridge) ||
                            (typeof window !== 'undefined' && window.AndroidSettingsBridge) ||
                            (typeof window !== 'undefined' && window.AndroidUsbSerialBridge) ||
                            (typeof window !== 'undefined' && window.Capacitor) ||
                            (typeof window !== 'undefined' && window.location && (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.port === ''))
                          );
                          // If in native Android app, the single siren from outside the app continues playing!
                          if (!isNativeAppEnv) {
                            window.playEmergencyAlertSound();
                          }`;

  if (content.includes(oldStepC)) {
    content = content.replace(oldStepC, newStepC);
    console.log('[Patch] header.ejs: Step C updated to keep single sound from outside the app.');
  }

  fs.writeFileSync(headerEjsPath, content, 'utf8');
}

console.log('[Patch] Finished applying single-sound patch.');
