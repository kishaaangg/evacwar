const fs = require('fs');
const p = 'android/app/src/main/java/ph/gov/baao/evakwar/resident/LoraMeshService.java';
let code = fs.readFileSync(p, 'utf8');

// 1. Replace EVW|MSG| block
const targetMsgBlock = `        } else if (packet.startsWith("EVW|MSG|")) {
            // EVW|MSG|msgId|senderRole|senderName|nodeId|timestamp|text
            try {
                String[] parts = packet.split("\\\\|", 8);
                String msgId = parts.length > 2 ? parts[2] : "";
                String sRole = parts.length > 3 ? parts[3] : "Resident";
                String sName = parts.length > 4 ? parts[4] : "Resident";
                String sNode = parts.length > 5 ? parts[5] : "!f4e213d4";
                String text = parts.length > 7 ? parts[7] : "";
                if (!text.isEmpty() && !mutedAlertKeys.contains("MSG_" + msgId)) {
                    mutedAlertKeys.add("MSG_" + msgId);
                    String badge = sRole + " | " + sName + " | " + sNode;
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        Intent launchIntent = new Intent(LoraMeshService.this, MainActivity.class);
                        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            piFlags |= PendingIntent.FLAG_IMMUTABLE;
                        }
                        PendingIntent pi = PendingIntent.getActivity(LoraMeshService.this, 204, launchIntent, piFlags);
                        NotificationCompat.Builder nb = new NotificationCompat.Builder(LoraMeshService.this, EMERGENCY_CHANNEL_ID)
                                .setSmallIcon(android.R.drawable.stat_notify_chat)
                                .setContentTitle("💬 " + badge)
                                .setContentText(text)
                                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                                .setPriority(NotificationCompat.PRIORITY_HIGH)
                                .setAutoCancel(true)
                                .setContentIntent(pi);
                        nm.notify(8800 + Math.abs(msgId.hashCode() % 1000), nb.build());
                    }
                }
            } catch (Exception ignored) {}
        }`;

const newMsgBlock = `        } else if (packet.startsWith("EVW|MSG|")) {
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

// Normalize newlines for matching
code = code.replace(/\r\n/g, '\n');
const normTarget = targetMsgBlock.replace(/\r\n/g, '\n');

if (code.includes(normTarget)) {
  code = code.replace(normTarget, newMsgBlock);
  console.log('Successfully replaced EVW|MSG| block!');
} else {
  console.log('targetMsgBlock not found!');
}

// 2. Add CHAT_CHANNEL in createNotificationChannels
const targetEmergencyChannel = `emergencyChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);\n            nm.createNotificationChannel(emergencyChannel);`;
const additionEmergencyChannel = `emergencyChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);\n            nm.createNotificationChannel(emergencyChannel);\n\n            // 3. Normal-Priority Chat Message Channel (discrete notification sound, no emergency siren)\n            NotificationChannel chatChannel = new NotificationChannel(\n                    CHAT_CHANNEL_ID,\n                    "EvakWar Chat Messages",\n                    NotificationManager.IMPORTANCE_DEFAULT\n            );\n            chatChannel.setDescription("Resident and emergency responders mesh chat messages");\n            chatChannel.enableVibration(true);\n            chatChannel.setVibrationPattern(new long[]{0, 150, 100, 150});\n            chatChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);\n            nm.createNotificationChannel(chatChannel);`;

if (code.includes(targetEmergencyChannel)) {
  code = code.replace(targetEmergencyChannel, additionEmergencyChannel);
  console.log('Successfully added chatChannel!');
} else {
  console.log('targetEmergencyChannel not found!');
}

// 3. Auto track msgId in writeHexInternal
const targetTxWrite = `txWritePending = true;\n            return writeCharacteristicWithRetry(data, 1);`;
const additionTxWrite = `// Automatically register locally-sent chat packet so sender is NEVER self-notified\n            try {\n                String ascii = new String(data, java.nio.charset.StandardCharsets.UTF_8);\n                if (ascii.startsWith("EVW|MSG|")) {\n                    String[] p = ascii.split("\\\\|", 8);\n                    if (p.length > 2 && !p[2].isEmpty()) {\n                        locallySentMsgIds.add(p[2].trim());\n                    }\n                    if (p.length > 4 && !p[4].isEmpty()) {\n                        activeUserName = p[4].trim();\n                    }\n                }\n            } catch (Exception ignored) {}\n\n            txWritePending = true;\n            return writeCharacteristicWithRetry(data, 1);`;

if (code.includes(targetTxWrite)) {
  code = code.replace(targetTxWrite, additionTxWrite);
  console.log('Successfully added auto-tracking in writeHexInternal!');
} else {
  console.log('targetTxWrite not found!');
}

fs.writeFileSync(p, code, 'utf8');
console.log('LoraMeshService.java completely updated!');
