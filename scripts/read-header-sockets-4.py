import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 3600 to 3700:")
print(''.join(lines[3600:3700]))
