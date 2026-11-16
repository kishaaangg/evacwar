import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [line.strip() for line in text.splitlines() if 'io(' in line or 'io.connect' in line or 'socket =' in line]
print("Socket initialization in header.ejs:")
for m in matches:
    print(m)
