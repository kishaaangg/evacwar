const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java');
let code = fs.readFileSync(targetFile, 'utf8');

// Fix 1: remove @Override before onChatPacketReceived
code = code.replace(/@Override\s*\r?\n\s*public void onChatPacketReceived/, 'public void onChatPacketReceived');

// Fix 2: remove duplicate @JavascriptInterface
code = code.replace(/@JavascriptInterface\s*\r?\n\s*@JavascriptInterface/, '@JavascriptInterface');

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Fixed compile errors in MainActivity.java!');
