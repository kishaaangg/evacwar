const fs = require('fs');
const filePath = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/android/app/src/main/java/ph/gov/baao/evakwar/resident/LoraMeshService.java';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace the EVW|MSG| block
const oldEvwMsgBlock = '        } else if (packet.startsWith("EVW|MSG|")) {';
const evwMsgIndex = content.indexOf(oldEvwMsgBlock);
if (evwMsgIndex === -1) {
  console.error('Could not find EVW|MSG| block in LoraMeshService.java');
  process.exit(1);
}

const endEvwMsgTarget = '    private boolean writeHexInternal(String hexString) {';
const endEvwMsgIndex = content.indexOf(endEvwMsgTarget, evwMsgIndex);
if (endEvwMsgIndex === -1) {
  console.error('Could not find writeHexInternal in LoraMeshService.java');
  process.exit(1);
}

const newEvwMsgBlockAndStatic = `        } else if (packet.startsWith("EVW|MSG|")) {
            // EVW|MSG|msgId|senderRole|senderName|nodeId|timestamp|text[|seq]
            try {
                String[] parts = packet.split("\\\\|");
                String msgId = parts.length > 2 ? parts[2].trim() : "";
                String sRole = parts.length > 3 ? parts[3].trim() : "Resident";
                String sName = parts.length > 4 ? parts[4].trim() : "Resident";

                if (sName.contains("|")) sName = sName.split("\\\\|")[0].trim();
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
                text = text.replaceAll("\\\\|\\\\d+$", "").trim();

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
        }
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

`;

content = content.slice(0, evwMsgIndex) + newEvwMsgBlockAndStatic + content.slice(endEvwMsgIndex);

// 2. Add pollLatestChatOverWifi() and call it in executor
const executorTarget = 'pollLatestAlertOverWifi();';
if (content.includes(executorTarget)) {
  content = content.replace(executorTarget, 'pollLatestAlertOverWifi();\n                pollLatestChatOverWifi();');
}

const chatPollerMethods = `
    private void pollLatestChatOverWifi() {
        if (!isNetworkConnected()) return;

        String baseUrl = configuredServerUrl;
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "http://192.168.0.102:8080";
        }
        baseUrl = baseUrl.replaceAll("/+$", "");
        String endpoint = baseUrl + "/api/lora/chat/latest";

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
`;

// Insert chatPollerMethods right before the closing brace of LoraMeshService
const lastBraceIndex = content.lastIndexOf('}');
content = content.slice(0, lastBraceIndex) + chatPollerMethods + '\n}\n';

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated LoraMeshService.java!');
