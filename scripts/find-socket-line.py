import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('window.__appSocket || io();')
print(text[idx-200:idx+100])
