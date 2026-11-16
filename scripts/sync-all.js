const fs = require('fs');
const path = require('path');

const srcRoot = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing';
const dstRoot = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR';

const files = [
  'views/partials/lora-chat-room.ejs',
  'views/partials/header.ejs',
  'public/js/capacitor-resident-bridge.js',
  'android/app/src/main/java/ph/gov/baao/evakwar/resident/MainActivity.java',
  'android/app/src/main/java/ph/gov/baao/evakwar/resident/LoraMeshService.java'
];

files.forEach(rel => {
  const src = path.join(srcRoot, rel);
  const dst = path.join(dstRoot, rel);
  fs.copyFileSync(src, dst);
  console.log('[Synced] ' + rel);
});
