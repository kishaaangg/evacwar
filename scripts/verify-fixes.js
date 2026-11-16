const fs = require('fs');

const html = fs.readFileSync('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/resident-mobile/resident/chat/index.html', 'utf8');
console.log('resident-mobile chat HTML:');
console.log('  Has <div id="loraChatForm":', html.includes('<div id="loraChatForm"'));
console.log('  Has <form id="loraChatForm":', html.includes('<form id="loraChatForm"'));
console.log('  Has chat-nav-red-dot:', html.includes('chat-nav-red-dot'));

const apk1 = fs.statSync('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/evakwar-resident.apk');
console.log('APK evakwar-resident.apk:');
console.log('  Size:', apk1.size, 'bytes');
console.log('  Last Modified:', apk1.mtime);
