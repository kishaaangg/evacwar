import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 3450 to 3600:")
print(''.join(lines[3450:3600]))
