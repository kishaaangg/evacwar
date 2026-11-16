const fs = require('fs');

const paths = [
  'public/js/pwa.js',
  'resident-mobile/js/pwa.js',
  'android/app/src/main/assets/public/js/pwa.js'
];

paths.forEach(p => {
  if (fs.existsSync(p)) {
    let code = fs.readFileSync(p, 'utf8');

    // Thorough submit event handler that never intercepts LoRa chat or offline forms
    const oldSubmitRegex = /document\.addEventListener\('submit',[\s\S]*?showOfflineNotice\("You're offline\. This action requires an internet connection\."\);[\s\S]*?\}, true\);/;

    const newSubmitCode = `document.addEventListener('submit', (e) => {
    if (!navigator.onLine) {
      const target = e.target;
      const form = (target && target.closest) ? (target.closest('form') || target) : target;

      // Unconditionally allow LoRa chat, staff forms, and offline-enabled forms
      if (
        (form && (
          form.id === 'loraChatForm' ||
          form.id === 'manualLookupForm' ||
          form.id === 'manualCheckInForm' ||
          form.id === 'walkinForm' ||
          form.hasAttribute('data-lora-chat') ||
          form.hasAttribute('data-offline-enabled')
        )) ||
        (target && (
          target.id === 'loraChatSendBtn' ||
          target.id === 'loraChatInput' ||
          (target.closest && target.closest('#loraChatForm, #loraChatSendBtn, [data-lora-chat], [data-offline-enabled]'))
        ))
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      showOfflineNotice("You're offline. This action requires an internet connection.");
    }
  }, true);`;

    if (oldSubmitRegex.test(code)) {
      code = code.replace(oldSubmitRegex, newSubmitCode);
      fs.writeFileSync(p, code, 'utf8');
      console.log('Thoroughly patched ' + p);
    } else {
      console.log('Pattern not matched in ' + p);
    }
  }
});
