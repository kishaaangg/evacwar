import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('scripts/build-capacitor-resident.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(''.join(lines[40:110]))
