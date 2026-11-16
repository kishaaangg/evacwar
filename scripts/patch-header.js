const fs = require('fs');

function patchHeader(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const target = 'onclick="window.openLoraHardwarePicker ? window.openLoraHardwarePicker() : (window.connectGlobalLoraBle && window.connectGlobalLoraBle())"';
  const replacement = 'onclick="if (typeof window.openLoraHardwarePicker === \'function\') { window.openLoraHardwarePicker(); } else if (typeof window.openLoraConnectionModal === \'function\') { window.openLoraConnectionModal(); } else if (typeof window.connectGlobalLoraBle === \'function\') { window.connectGlobalLoraBle(); } else { var b = document.getElementById(\'btnHeaderLoraBle\'); if (b) b.click(); }"';
  
  if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Patched ' + filePath);
  } else {
    console.log('Target not found in ' + filePath);
  }
}

patchHeader('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/header.ejs');
patchHeader('c:/Users/lausi/OneDrive/Desktop/EBAKWAR/views/partials/header.ejs');
