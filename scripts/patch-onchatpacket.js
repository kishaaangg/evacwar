const fs = require('fs');

const files = [
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java',
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR/android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java'
];

files.forEach(fp => {
  let code = fs.readFileSync(fp, 'utf8');
  if (code.includes('public void onChatPacketReceived(')) {
    console.log('Already has onChatPacketReceived: ' + fp);
    return;
  }

  const target = 'private void emitJsEvent(final String eventName, final String detailJson) {';
  const addition = `public void onChatPacketReceived(String msgId, String senderRole, String senderName, String text, long ts, int seq) {
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

    private void emitJsEvent(final String eventName, final String detailJson) {`;

  if (code.includes(target)) {
    code = code.replace(target, addition);
    fs.writeFileSync(fp, code, 'utf8');
    console.log('[OK] Added onChatPacketReceived to ' + fp);
  } else {
    console.error('Target emitJsEvent not found in ' + fp);
  }
});
