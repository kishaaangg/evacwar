import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 3220 to 3300:")
print(''.join(lines[3220:3300]))
