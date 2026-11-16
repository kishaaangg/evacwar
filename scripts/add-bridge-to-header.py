with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

target = '<!-- 5. GLOBAL 433.875 MHz LORA MESH CLIENT & OFFLINE ALERT / ACK RECEIVER -->'
replacement = '''<!-- 4.5 NATIVE CAPACITOR & OFFLINE BRIDGES -->
                    <script src="/js/capacitor-resident-bridge.js"></script>

                    <!-- 5. GLOBAL 433.875 MHz LORA MESH CLIENT & OFFLINE ALERT / ACK RECEIVER -->'''

assert target in text, "target not found"
text = text.replace(target, replacement, 1)

with open('views/partials/header.ejs', 'w', encoding='utf-8') as f:
    f.write(text)

print("Added capacitor-resident-bridge.js to header.ejs successfully!")
