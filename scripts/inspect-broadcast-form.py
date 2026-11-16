import re

with open('views/admin/broadcast.ejs', 'r', encoding='utf-8') as f:
    text = f.read()

print(f"Total lines: {len(text.splitlines())}")

# Find all form actions and methods
forms = re.findall(r'<form\s+([^>]+)>', text)
for f in forms:
    print("Form attributes:", f)

# Find all inputs
inputs = re.findall(r'<input\s+[^>]*name=["\']([^"\']+)["\'][^>]*>', text)
print("Input names:", set(inputs))

# Find selects
selects = re.findall(r'<select\s+[^>]*name=["\']([^"\']+)["\'][^>]*>', text)
print("Select names:", set(selects))

# Find textareas
textareas = re.findall(r'<textarea\s+[^>]*name=["\']([^"\']+)["\'][^>]*>', text)
print("Textarea names:", set(textareas))

# Find key element IDs used in Javascript
ids = re.findall(r'id=["\']([^"\']+)["\']', text)
print("Key IDs:", sorted(set(ids))[:40])
