import re

with open('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/admin/broadcast.ejs', 'r', encoding='utf-8') as f:
    c = f.read()

parts = c.split('<script>')
script_part = parts[1] if len(parts) > 1 else ''

ids = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", script_part))
print("Element IDs used in script:")
for i in sorted(ids):
    print(" -", i)
