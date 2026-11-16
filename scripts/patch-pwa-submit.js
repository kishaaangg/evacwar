const fs = require('fs');
const p = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/public/js/pwa.js';
let c = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const pos = c.indexOf("// Intercept network-dependent form submissions when offline");
const posEnd = c.indexOf("document.addEventListener('submit', (e) => {", pos);
const posIf = c.indexOf("if (!navigator.onLine) {", posEnd);

if (pos >= 0 && posEnd >= 0 && posIf >= 0) {
  const insertCode = `  // Intercept network-dependent form submissions when offline
  document.addEventListener('submit', (e) => {
    const target = e.target;
    // Unconditionally allow LoRa chat, send buttons, and offline-enabled forms
    if (
      target && (
        target.id === 'loraChatForm' ||
        target.id === 'loraChatSendBtn' ||
        target.id === 'loraChatInput' ||
        (target.closest && target.closest('#loraChatForm, #loraChatSendBtn, #loraChatInput, #loraChatContainer, [data-lora-chat], [data-offline-enabled]'))
      )
    ) {
      return;
    }

    if (!navigator.onLine) {`;

  c = c.substring(0, pos) + insertCode + c.substring(posIf + "if (!navigator.onLine) {".length);
  fs.writeFileSync(p, c, 'utf8');
  console.log('Successfully patched public/js/pwa.js!');
} else {
  console.error('Markers not found in pwa.js:', pos, posEnd, posIf);
}
