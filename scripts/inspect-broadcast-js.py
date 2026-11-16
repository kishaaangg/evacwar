import re

with open('views/admin/broadcast.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

# Find <script> section
script_idx = text.find('<script>')
if script_idx != -1:
    js_text = text[script_idx:]
    functions = re.findall(r'function\s+([a-zA-Z0-9_]+)\s*\(', js_text)
    print("Functions:", functions)
    consts = re.findall(r'const\s+([a-zA-Z0-9_]+)\s*=', js_text)
    print("Constants:", consts)
