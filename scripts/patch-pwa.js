const fs = require('fs');
const paths = [
  'public/js/pwa.js',
  'resident-mobile/js/pwa.js',
  'android/app/src/main/assets/public/js/pwa.js'
];

paths.forEach(p => {
  if (fs.existsSync(p)) {
    let text = fs.readFileSync(p, 'utf8');
    const oldStr = "form.hasAttribute('data-offline-enabled')";
    const newStr = "form.id === 'loraChatForm' || form.hasAttribute('data-lora-chat') || form.hasAttribute('data-offline-enabled')";
    if (text.includes(oldStr)) {
      text = text.replace(oldStr, newStr);
      fs.writeFileSync(p, text, 'utf8');
      console.log('Successfully patched ' + p);
    } else {
      console.log('Target string not found in ' + p);
    }
  }
});
