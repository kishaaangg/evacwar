import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(''.join(lines[3600:]))
