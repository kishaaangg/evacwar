import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/resident/dashboard.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'currentAlert=typeof activeAlert' in l:
        print(''.join(lines[max(0, i-2):min(len(lines), i+30)]))
        break
