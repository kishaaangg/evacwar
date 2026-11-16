import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/admin/broadcast.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 540 to 620:")
print(''.join(lines[540:620]))
