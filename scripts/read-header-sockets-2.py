import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 3300 to 3450:")
print(''.join(lines[3300:3450]))
