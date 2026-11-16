import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('scripts/build-capacitor-resident.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
idx = text.find('ejs.render')
if idx != -1:
    print(text[idx-200:idx+800])
else:
    print('Searching render')
    for l in text.splitlines():
        if 'render' in l:
            print(l)
