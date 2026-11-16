package ph.gov.baao.evakwar.resident;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * BootReceiver for EvakWar Resident
 * Automatically restarts the Foreground Emergency Guard (Wi-Fi + LoRa Monitor)
 * when the phone is rebooted or the APK is updated.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            try {
                LoraMeshService.startServiceGuard(context);
            } catch (Exception ignored) {}
        }
    }
}
