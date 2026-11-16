const fs = require('fs');
const path = require('path');

const apkSrc = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/android/app/build/outputs/apk/debug/app-debug.apk';
const targets = [
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/evakwar-resident-v2.apk',
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/evakwar-resident.apk',
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/evakwar-mobile.apk',
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR/public/evakwar-resident-v2.apk',
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR/public/evakwar-resident.apk',
  'c:/Users/lausi/OneDrive/Desktop/EBAKWAR/public/evakwar-mobile.apk'
];

if (!fs.existsSync(apkSrc)) {
  console.error('APK not found at ' + apkSrc);
  process.exit(1);
}

const stats = fs.statSync(apkSrc);
console.log(`Copying APK (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);

targets.forEach(dest => {
  fs.copyFileSync(apkSrc, dest);
  console.log('Copied to ' + dest);
});

console.log('All APKs copied successfully!');
