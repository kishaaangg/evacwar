const fs = require('fs');
const path = require('path');

['views/partials/bottom-nav.ejs'].forEach(rel => {
  const filePath = path.resolve(__dirname, '..', rel);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');

  // Replace 1: Admin
  content = content.replace(
    /<span class="chat-nav-red-dot hidden absolute top-1\.5 right-3 sm:right-6 w-2\.5 h-2\.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse"><\/span>\s*<i class="ph <%= \(page && \(page\.title === 'LoRa Mesh Chat' \|\| page\.title === 'Chat'\)\) \? 'ph-chats-circle-fill scale-110' : 'ph-chats-circle' %> text-xl sm:text-2xl mb-0\.5"><\/i>/,
    '<div class="relative inline-flex items-center justify-center">\n            <span class="chat-nav-red-dot hidden absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse z-10"></span>\n            <i class="ph <%= (page && (page.title === \'LoRa Mesh Chat\' || page.title === \'Chat\')) ? \'ph-chats-circle-fill scale-110\' : \'ph-chats-circle\' %> text-xl sm:text-2xl mb-0.5"></i>\n          </div>'
  );

  // Replace 2: Resident
  content = content.replace(
    /<span class="chat-nav-red-dot hidden absolute top-1\.5 right-3 sm:right-6 w-2\.5 h-2\.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse"><\/span>\s*<i class="ph <%= isResChat \? 'ph-chats-circle-fill' : 'ph-chats-circle' %> text-2xl sm:text-\[26px\] mb-0\.5 <%= isResChat \? 'text-red-600' : 'text-slate-400' %>"><\/i>/,
    '<div class="relative inline-flex items-center justify-center">\n              <span class="chat-nav-red-dot hidden absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse z-10"></span>\n              <i class="ph <%= isResChat ? \'ph-chats-circle-fill\' : \'ph-chats-circle\' %> text-2xl sm:text-[26px] mb-0.5 <%= isResChat ? \'text-red-600\' : \'text-slate-400\' %>"></i>\n            </div>'
  );

  // Replace 3: Rescuer
  content = content.replace(
    /<span class="chat-nav-red-dot hidden absolute top-1\.5 right-3 sm:right-6 w-2\.5 h-2\.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse"><\/span>\s*<i class="ph <%= isRescuerChat \? 'ph-chats-circle-fill' : 'ph-chats-circle' %> text-2xl sm:text-\[26px\] mb-0\.5 <%= isRescuerChat \? 'text-red-600' : 'text-slate-400' %>"><\/i>/,
    '<div class="relative inline-flex items-center justify-center">\n                <span class="chat-nav-red-dot hidden absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse z-10"></span>\n                <i class="ph <%= isRescuerChat ? \'ph-chats-circle-fill\' : \'ph-chats-circle\' %> text-2xl sm:text-[26px] mb-0.5 <%= isRescuerChat ? \'text-red-600\' : \'text-slate-400\' %>"></i>\n              </div>'
  );

  // Replace 4: Staff
  content = content.replace(
    /<span class="chat-nav-red-dot hidden absolute top-1\.5 right-3 sm:right-6 w-2\.5 h-2\.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse"><\/span>\s*<i class="ph <%= isStaffChat \? 'ph-chats-circle-fill' : 'ph-chats-circle' %> text-2xl sm:text-\[26px\] mb-0\.5 <%= isStaffChat \? 'text-blue-600' : 'text-slate-400' %>"><\/i>/,
    '<div class="relative inline-flex items-center justify-center">\n                <span class="chat-nav-red-dot hidden absolute -top-1 -right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white animate-pulse z-10"></span>\n                <i class="ph <%= isStaffChat ? \'ph-chats-circle-fill\' : \'ph-chats-circle\' %> text-2xl sm:text-[26px] mb-0.5 <%= isStaffChat ? \'text-blue-600\' : \'text-slate-400\' %>"></i>\n              </div>'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated ' + rel);
});
