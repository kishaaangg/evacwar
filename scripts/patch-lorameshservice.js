const fs = require('fs');
const p = 'android/app/src/main/java/ph/gov/baao/evakwar/resident/LoraMeshService.java';
let code = fs.readFileSync(p, 'utf8');

// 1. Add CHAT_CHANNEL_ID and static tracking
const target1 = 'private static final String EMERGENCY_CHANNEL_ID   = "emergency-alerts";';
const replace1 = `private static final String EMERGENCY_CHANNEL_ID   = "emergency-alerts";
    private static final String CHAT_CHANNEL_ID        = "chat-messages-channel";

    // Chat deduplication and self-notification filter
    private static final Set<String> locallySentMsgIds = Collections.synchronizedSet(new HashSet<>());
    private static volatile String activeUserName = null;
    private static volatile String activeUserRole = null;

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
    }`;

// 2. Add CHAT_CHANNEL in createNotificationChannels
const target2 = `nm.createNotificationChannel(emergencyChannel);
        }`;
const replace2 = `nm.createNotificationChannel(emergencyChannel);

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
        }`;

// 3. Automatically track locally sent msgId in writeHexInternal
const target3 = `txWritePending = true;
            return writeCharacteristicWithRetry(data, 1);`;
const replace3 = `// Automatically register locally-sent chat packet so sender is NEVER self-notified
            try {
                String ascii = new String(data, java.nio.charset.StandardCharsets.UTF_8);
                if (ascii.startsWith("EVW|MSG|")) {
                    String[] p = ascii.split("\\\\|", 8);
                    if (p.length > 2 && !p[2].isEmpty()) {
                        locallySentMsgIds.add(p[2].trim());
                    }
                    if (p.length > 4 && !p[4].isEmpty()) {
                        activeUserName = p[4].trim();
                    }
                }
            } catch (Exception ignored) {}

            txWritePending = true;
            return writeCharacteristicWithRetry(data, 1);`;

// 4. EVW|MSG| handler in processDecodedPacket
const target4Start = '} else if (packet.startsWith("EVW|MSG|")) {';
const target4End = '} catch (Exception ignored) {}\n        }';

const idx4Start = code.indexOf(target4Start);
if (idx4Start !== -1) {
  const idx4End = code.indexOf(target4End, idx4Start);
  if (idx4End !== -1) {
    const oldBlock = code.substring(idx4Start, idx4End + target4End.length);
    const newBlock = `} else if (packet.startsWith("EVW|MSG|")) {
            // EVW|MSG|msgId|senderRole|senderName|nodeId|timestamp|text
            try {
                String[] parts = packet.split("\\\\|", 8);
                String msgId = parts.length > 2 ? parts[2].trim() : "";
                String sRole = parts.length > 3 ? parts[3].trim() : "Resident";
                String sName = parts.length > 4 ? parts[4].trim() : "Resident";
                String text = parts.length > 7 ? parts[7].trim() : "";

                // Strip any accidental node ID attached to sender name
                if (sName.contains(" | !")) {
                    sName = sName.split(" \\\\| !")[0].trim();
                }

                // 1. SUPPRESS SELF-NOTIFICATION: Check if message was sent by local phone/user!
                if (!msgId.isEmpty() && locallySentMsgIds.contains(msgId)) {
                    Log.d("LoraMeshService", "Skipping self-notification for locally sent msgId: " + msgId);
                    return;
                }

                if (activeUserName != null && !activeUserName.isEmpty() && sName.equalsIgnoreCase(activeUserName)) {
                    Log.d("LoraMeshService", "Skipping self-notification for active user name: " + sName);
                    return;
                }

                try {
                    SharedPreferences prefs = getSharedPreferences("evakwar_prefs", Context.MODE_PRIVATE);
                    String savedUser = prefs.getString("user_full_name", "");
                    if (!savedUser.isEmpty() && sName.equalsIgnoreCase(savedUser)) {
                        Log.d("LoraMeshService", "Skipping self-notification for saved user: " + sName);
                        return;
                    }
                } catch (Exception ignored) {}

                if (!text.isEmpty() && !mutedAlertKeys.contains("MSG_" + msgId)) {
                    mutedAlertKeys.add("MSG_" + msgId);

                    // User requirement: Strict title "Role | Full Name" without node ID and no icons on role
                    String titleBadge = sRole + " | " + sName;

                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        Intent launchIntent = new Intent(LoraMeshService.this, MainActivity.class);
                        launchIntent.putExtra("navigate_to", "/resident/chat");
                        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            piFlags |= PendingIntent.FLAG_IMMUTABLE;
                        }
                        PendingIntent pi = PendingIntent.getActivity(LoraMeshService.this, 204, launchIntent, piFlags);

                        // Use CHAT_CHANNEL_ID (quiet discrete chat notification, NOT emergency sirens!)
                        NotificationCompat.Builder nb = new NotificationCompat.Builder(LoraMeshService.this, CHAT_CHANNEL_ID)
                                .setSmallIcon(android.R.drawable.stat_notify_chat)
                                .setContentTitle(titleBadge)
                                .setContentText(text)
                                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                                .setAutoCancel(true)
                                .setContentIntent(pi);
                        nm.notify(8800 + Math.abs(msgId.hashCode() % 1000), nb.build());
                    }
                }
            } catch (Exception ignored) {}
        }`;

    code = code.replace(oldBlock, newBlock);
    console.log('Replaced EVW|MSG| handler successfully');
  } else {
    console.log('Target 4 End not found');
  }
} else {
  console.log('Target 4 Start not found');
}

if (code.includes(target1)) {
  code = code.replace(target1, replace1);
  console.log('Replaced Target 1 successfully');
}
if (code.includes(target2)) {
  code = code.replace(target2, replace2);
  console.log('Replaced Target 2 successfully');
}
if (code.includes(target3)) {
  code = code.replace(target3, replace3);
  console.log('Replaced Target 3 successfully');
}

fs.writeFileSync(p, code, 'utf8');
console.log('LoraMeshService.java saved successfully!');
