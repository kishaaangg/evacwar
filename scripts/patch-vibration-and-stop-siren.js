const fs = require('fs');
const path = require('path');

const testingRoot = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing';
const mainRoot = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR';

// 1. Patch MainActivity.java
function patchMainActivity(root) {
  const fp = path.join(root, 'android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java');
  let code = fs.readFileSync(fp, 'utf8');

  // Replace notification builder vibration
  const notifRegex = /\.addAction\(android\.R\.drawable\.ic_lock_silent_mode_off,\s*"Silence Siren",\s*stopPi\)\s*\.setVibrate\(new long\[\]\{0,\s*600,\s*150,\s*600,\s*150,\s*1000\}\);/;
  const newNotif = `.addAction(android.R.drawable.ic_lock_silent_mode_off, "Silence Siren", stopPi);

                    boolean isRedAlert = (severity != null && severity.trim().equalsIgnoreCase("RED")) ||
                                         (title != null && title.toUpperCase().contains("RED"));
                    if (isRedAlert) {
                        builder.setVibrate(new long[]{0, 600, 150, 600, 150, 1000});
                    } else {
                        builder.setVibrate(new long[]{0});
                    }`;

  if (notifRegex.test(code)) {
    code = code.replace(notifRegex, newNotif);
    console.log('[OK] Patched NotificationBuilder vibration in ' + fp);
  } else {
    console.log('[NOTE] notifRegex did not match or already patched in ' + fp);
  }

  // Replace hardware vibrator
  const vibRegex = /\/\/\s*2\.\s*Trigger Hardware Vibrator Waveform[\s\S]*?catch\s*\(Exception ignored\)\s*\{\}/;
  const newVib = `// 2. Trigger Hardware Vibrator Waveform (ONLY for RED alerts; Orange and other colors: Siren only)
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
                        long[] pattern = new long[]{0, 600, 150, 600, 150, 1000};
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            vib.vibrate(VibrationEffect.createWaveform(pattern, 0));
                        } else {
                            vib.vibrate(pattern, 0);
                        }
                    }
                } catch (Exception ignored) {}
            }`;

  if (vibRegex.test(code)) {
    code = code.replace(vibRegex, newVib);
    console.log('[OK] Patched Hardware Vibrator in ' + fp);
  } else {
    console.log('[NOTE] vibRegex did not match or already patched in ' + fp);
  }

  fs.writeFileSync(fp, code, 'utf8');
}

// 2. Patch views/resident/evacuation.ejs
function patchEvacuation(root) {
  const fp = path.join(root, 'views/resident/evacuation.ejs');
  let code = fs.readFileSync(fp, 'utf8');

  // routeBanner.onclick
  const routeBannerRegex = /routeBanner\.onclick\s*=\s*\(\)\s*=>\s*\{[\s\S]*?flyToCenter\([\s\S]*?\);\s*\};/;
  const newRouteBanner = `routeBanner.onclick = () => {
          if (typeof window.stopEmergencyAlertSound === 'function') window.stopEmergencyAlertSound();
          if (window.AndroidBleBridge && typeof window.AndroidBleBridge.stopNativeEmergencyAlarm === 'function') {
            try { window.AndroidBleBridge.stopNativeEmergencyAlarm(); } catch (_) {}
          }
          if (typeof flyToCenter === 'function') {
            flyToCenter(parseFloat(nearestCenter.longitude), parseFloat(nearestCenter.latitude), nearestCenter.id);
          }
        };`;

  if (routeBannerRegex.test(code)) {
    code = code.replace(routeBannerRegex, newRouteBanner);
    console.log('[OK] Patched routeBanner.onclick in ' + fp);
  }

  // auto_route=nearest
  const autoRouteRegex = /if\s*\(!window\._hasAutoRoutedNearest\s*&&[\s\S]*?auto_route[\s\S]*?flyToCenter\([\s\S]*?\);\s*\},?\s*800\);\s*\}\s*\}/;
  const newAutoRoute = `if (!window._hasAutoRoutedNearest && new URLSearchParams(window.location.search).get('auto_route') === 'nearest') {
          window._hasAutoRoutedNearest = true;
          if (typeof window.stopEmergencyAlertSound === 'function') window.stopEmergencyAlertSound();
          if (window.AndroidBleBridge && typeof window.AndroidBleBridge.stopNativeEmergencyAlarm === 'function') {
            try { window.AndroidBleBridge.stopNativeEmergencyAlarm(); } catch (_) {}
          }
          if (typeof flyToCenter === 'function') {
            setTimeout(() => {
              flyToCenter(parseFloat(nearestCenter.longitude), parseFloat(nearestCenter.latitude), nearestCenter.id);
            }, 800);
          }
        }`;

  if (autoRouteRegex.test(code)) {
    code = code.replace(autoRouteRegex, newAutoRoute);
    console.log('[OK] Patched auto_route in ' + fp);
  }

  // flyToCenter
  const flyToRegex = /function\s+flyToCenter\s*\(([^)]*)\)\s*\{/;
  if (code.includes('function flyToCenter(') && !code.includes('flyToCenter(lng, lat, centerId) {\n      if (typeof window.stopEmergencyAlertSound')) {
    code = code.replace(flyToRegex, `function flyToCenter($1) {
      if (typeof window.stopEmergencyAlertSound === 'function') window.stopEmergencyAlertSound();
      if (window.AndroidBleBridge && typeof window.AndroidBleBridge.stopNativeEmergencyAlarm === 'function') {
        try { window.AndroidBleBridge.stopNativeEmergencyAlarm(); } catch (_) {}
      }`);
    console.log('[OK] Patched flyToCenter in ' + fp);
  }

  fs.writeFileSync(fp, code, 'utf8');
}

// 3. Patch views/resident/dashboard.ejs
function patchDashboard(root) {
  const fp = path.join(root, 'views/resident/dashboard.ejs');
  let code = fs.readFileSync(fp, 'utf8');

  const oldCardPattern = /<a\s+href="\/resident\/evacuation"/;
  if (!code.includes('onclick="if (typeof window.stopEmergencyAlertSound === \'function\') window.stopEmergencyAlertSound()')) {
    code = code.replace(oldCardPattern, `<a href="/resident/evacuation" onclick="if (typeof window.stopEmergencyAlertSound === 'function') window.stopEmergencyAlertSound(); if (window.AndroidBleBridge && typeof window.AndroidBleBridge.stopNativeEmergencyAlarm === 'function') { try { window.AndroidBleBridge.stopNativeEmergencyAlarm(); } catch(_) {} }"`);
    console.log('[OK] Patched Dashboard Evac Card in ' + fp);
    fs.writeFileSync(fp, code, 'utf8');
  }
}

[testingRoot, mainRoot].forEach(root => {
  console.log('--- Patching ' + root + ' ---');
  patchMainActivity(root);
  patchEvacuation(root);
  patchDashboard(root);
});
