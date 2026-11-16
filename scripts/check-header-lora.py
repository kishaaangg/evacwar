import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('views/partials/header.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

end_idx = text.find('<!-- 5. GLOBAL 433.875 MHz LORA MESH CLIENT')
print(text[end_idx:end_idx+1000])
