import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

start_idx = text.find('window.playEmergencyAlertSound = function')
end_idx = text.find('<!-- 5. GLOBAL 433.875 MHz LORA MESH CLIENT')

print("Found start_idx:", start_idx)
print("Found end_idx:", end_idx)
if start_idx != -1 and end_idx != -1:
    print(text[start_idx-100:start_idx+100])
