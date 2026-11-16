const fs = require('fs');
const p = 'android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java';
let code = fs.readFileSync(p, 'utf8');

const target = 'public boolean writeHex(String hexString) {';
const addition = `        @JavascriptInterface
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
        public void markMessageSentBySelf(String msgId) {
            LoraMeshService.markMessageSentBySelfStatic(msgId);
        }

        @JavascriptInterface
        public boolean writeHex(String hexString) {`;

if (code.includes(target) && !code.includes('markMessageSentBySelf')) {
  code = code.replace(target, addition);
  fs.writeFileSync(p, code, 'utf8');
  console.log('MainActivity.java patched successfully!');
} else {
  console.log('Target not found or already patched.');
}
