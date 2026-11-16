/**
 * Patch Vibration & Siren Rules:
 * 1. RED Alert: Loud Siren + Real Physical Hardware Motor Vibration outside the app (repeating until silenced).
 * 2. Orange/Yellow/Other Alerts: Siren sound ONLY, STRICTLY ZERO VIBRATION.
 * 3. Inside the App: Suppress duplicate WebAudio synthesizer when native Android siren is active.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// =========================================================================
// 1. PATCH MainActivity.java
// =========================================================================
const mainActivityPath = path.join(
  ROOT_DIR,
  'android', 'app', 'src', 'main', 'java', 'ph', 'gov', 'baao', 'evakwar', 'resident', 'MainActivity.java'
);

if (fs.existsSync(mainActivityPath)) {
  let content = fs.readFileSync(mainActivityPath, 'utf8');

  // A. Replace channel ID declaration
  content = content.replace(
    /private\s+static\s+final\s+String\s+EMERGENCY_CHANNEL_ID\s*=\s*"[^"]+";/,
    'private static final String EMERGENCY_RED_CHANNEL_ID   = "evw_emergency_red_v4";\n    private static final String EMERGENCY_OTHER_CHANNEL_ID = "evw_emergency_other_v4";'
  );

  // B. Replace createEmergencyNotificationChannel
  const oldChannelFnRegex = /private\s+void\s+createEmergencyNotificationChannel\s*\(\)\s*\{[\s\S]*?nm\.createNotificationChannel\([^\)]+\);\s*\}\s*\}\s*catch\s*\(Exception[^\)]*\)\s*\{\}\s*\}\s*\}/;
  const newChannelFn = `private void createEmergencyNotificationChannel() {
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
                    otherCh.setDescription("Weather and advisory alerts: Siren ONLY, STRICTLY ZERO vibration");
                    otherCh.enableVibration(false);
                    otherCh.setVibrationPattern(new long[]{0});
                    otherCh.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    otherCh.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), alarmAudioAttr);
                    nm.createNotificationChannel(otherCh);
                }
            } catch (Exception ignored) {}
        }
    }`;

  if (oldChannelFnRegex.test(content)) {
    content = content.replace(oldChannelFnRegex, newChannelFn);
    console.log('[Patch] MainActivity.java: Notification channels updated.');
  } else {
    console.warn('[Patch] Note: createEmergencyNotificationChannel regex did not match exactly, searching by substring...');
    const startIdx = content.indexOf('void createEmergencyNotificationChannel()');
    if (startIdx !== -1) {
      const braceStart = content.indexOf('{', startIdx);
      let depth = 1;
      let endIdx = braceStart + 1;
      while (depth > 0 && endIdx < content.length) {
        if (content[endIdx] === '{') depth++;
        else if (content[endIdx] === '}') depth--;
        endIdx++;
      }
      content = content.slice(0, startIdx - 8) + newChannelFn + content.slice(endIdx);
      console.log('[Patch] MainActivity.java: Notification channels replaced by block search.');
    }
  }

  // C. Update triggerNativeEmergencyAlarmInternal in MainActivity.java
  const oldBuilderLine = 'NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, EMERGENCY_CHANNEL_ID)';
  const newBuilderBlock = `boolean isRedAlert = (severity != null && severity.trim().equalsIgnoreCase("RED")) ||
                                         (title != null && title.toUpperCase().contains("RED"));
                    String targetChannel = isRedAlert ? EMERGENCY_RED_CHANNEL_ID : EMERGENCY_OTHER_CHANNEL_ID;

                    NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, targetChannel)`;

  if (content.includes(oldBuilderLine)) {
    content = content.replace(oldBuilderLine, newBuilderBlock);
    console.log('[Patch] MainActivity.java: Target channel selection updated.');
  }

  // D. Update Step 2 (Hardware Vibrator) in MainActivity.java
  const oldVibBlockRegex = /\/\/ 2\. Trigger Hardware Vibrator[\s\S]*?if\s*\(isRedAlertVib\)\s*\{[\s\S]*?\}\s*catch\s*\(Exception[^\)]*\)\s*\{\}\s*\}/;
  const newVibBlock = `// 2. Trigger Hardware Vibrator (RED alerts: Continuous hardware motor vibration; Orange/Yellow: ZERO vibration!)
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
            }`;

  if (oldVibBlockRegex.test(content)) {
    content = content.replace(oldVibBlockRegex, newVibBlock);
    console.log('[Patch] MainActivity.java: Hardware vibrator alarm attributes updated.');
  }

  fs.writeFileSync(mainActivityPath, content, 'utf8');
}

// =========================================================================
// 2. PATCH views/partials/header.ejs
// =========================================================================
const headerEjsPath = path.join(ROOT_DIR, 'views', 'partials', 'header.ejs');
if (fs.existsSync(headerEjsPath)) {
  let headerContent = fs.readFileSync(headerEjsPath, 'utf8');

  // A. Suppress duplicate WebAudio synthesizer when native Android bridge is active
  const oldPlayFn = `window.playEmergencyAlertSound = function () {
                          // Start WebAudio synthesizer
                          startWebAudioSiren();`;
  const newPlayFn = `window.playEmergencyAlertSound = function () {
                          // If running inside Native Android App, native Java STREAM_ALARM siren is already playing!
                          // Do not run synthetic WebAudio buzzing inside the app:
                          if (window.AndroidBleBridge) {
                            return;
                          }

                          // Start WebAudio synthesizer only in desktop / web browser fallback
                          startWebAudioSiren();`;

  if (headerContent.includes(oldPlayFn)) {
    headerContent = headerContent.replace(oldPlayFn, newPlayFn);
    console.log('[Patch] header.ejs: playEmergencyAlertSound updated to prevent duplicate WebAudio buzz.');
  }

  // B. Update Step B vibration logic in header.ejs
  const oldStepBRegex = /\/\/ Step B: Trigger Android Vibration Motor[\s\S]*?if\s*\(isRedAlertSeverity\)\s*\{[\s\S]*?\}\s*else\s*\{[\s\S]*?\}\s*\}\s*\n\s*\/\/ Step C:/;
  const newStepB = `// Step B: Trigger Vibration Motor (ONLY for RED alerts; Orange & other colors: STRICTLY ZERO vibration)
                          const isRedAlertSeverity = (alertData.severity || alertData.level || 'RED').toUpperCase() === 'RED' ||
                                                     String(alertData.title || '').toUpperCase().includes('RED');

                          if (isRedAlertSeverity) {
                            // In Native Android App, the phone's physical hardware vibrator is already buzzing via Java!
                            // Only run browser navigator.vibrate fallback if NOT inside the native app:
                            if (!window.AndroidBleBridge) {
                              if (navigator.vibrate) {
                                try { navigator.vibrate([500, 150, 500, 150, 1000]); } catch (_) {}
                              }
                              if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
                                try { window.Capacitor.Plugins.Haptics.vibrate({ duration: 2500 }).catch(() => {}); } catch (_) {}
                              }
                              if (emergencyVibrateInterval) clearInterval(emergencyVibrateInterval);
                              emergencyVibrateInterval = setInterval(() => {
                                const modal = document.getElementById('realtimeEmergencyModal');
                                if (!modal || modal.style.display !== 'flex') {
                                  clearInterval(emergencyVibrateInterval);
                                  emergencyVibrateInterval = null;
                                  return;
                                }
                                if (navigator.vibrate) {
                                  try { navigator.vibrate([500, 150, 500, 150, 1000]); } catch (_) {}
                                }
                              }, 3200);
                            }
                          } else {
                            // Orange, Yellow, and other advisory alerts: STRICTLY ZERO VIBRATION!
                            if (emergencyVibrateInterval) {
                              clearInterval(emergencyVibrateInterval);
                              emergencyVibrateInterval = null;
                            }
                            if (navigator.vibrate) {
                              try { navigator.vibrate(0); } catch (_) {}
                            }
                          }

                          // Step C:`;

  if (oldStepBRegex.test(headerContent)) {
    headerContent = headerContent.replace(oldStepBRegex, newStepB);
    console.log('[Patch] header.ejs: Step B vibration logic updated.');
  }

  fs.writeFileSync(headerEjsPath, headerContent, 'utf8');
}

console.log('[Patch] All vibration & siren rules updated successfully.');
