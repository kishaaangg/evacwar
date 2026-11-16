import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('public/js/lora-mesh-client.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 320 to 420:")
print(''.join(lines[320:420]))
