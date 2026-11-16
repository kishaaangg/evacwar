const fs = require('fs');
const p = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/bottom-nav.ejs';
let code = fs.readFileSync(p, 'utf8');

const dotHtml = '<span class="chat-nav-red-dot hidden absolute top-1.5 right-3 sm:right-6 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse"></span>\n          ';

// 1. Admin Chat
if (!code.includes('chat-nav-red-dot') && code.includes('<a href="/admin/chat"')) {
  code = code.replace(
    '<a href="/admin/chat"',
    '<a href="/admin/chat"'
  );
}

// Replace each chat tab to include dotHtml if not already present
code = code.replace(
  /(<a href="\/admin\/chat"[\s\S]*?>\s*)(<i class="ph)/,
  `$1${dotHtml}$2`
);

code = code.replace(
  /(<a href="\/resident\/chat"[\s\S]*?>\s*)(<i class="ph)/,
  `$1${dotHtml}$2`
);

code = code.replace(
  /(<a href="\/rescuer\/chat"[\s\S]*?>\s*)(<i class="ph)/,
  `$1${dotHtml}$2`
);

code = code.replace(
  /(<a href="\/staff\/chat"[\s\S]*?>\s*)(<i class="ph)/,
  `$1${dotHtml}$2`
);

fs.writeFileSync(p, code, 'utf8');
console.log('views/partials/bottom-nav.ejs updated with chat-nav-red-dot!');
