import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/admin/broadcast.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 980 to 1060:")
print(''.join(lines[980:1060]))
