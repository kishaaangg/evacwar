import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines in header.ejs: {len(lines)}")
for i, l in enumerate(lines):
    if 'window.playEmergencyAlertSound' in l:
        start = max(0, i-20)
        print(f"Start found at line {start}")
        print(''.join(lines[start:start+50]))
        break
