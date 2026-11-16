import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

second_idx = text.find('window.__appSocket || io();', text.find('window.__appSocket || io();') + 20)
print("second_idx:", second_idx)
if second_idx != -1:
    print(text[second_idx-200:second_idx+200])
