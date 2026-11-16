# -*- coding: utf-8 -*-
with open('scripts/build-capacitor-resident.js', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "const displayName = cachedResident.full_name || cachedResident.name || `${cachedResident.first_name || ''} ${cachedResident.last_name || ''}`.trim();",
    "const displayName = cachedResident.full_name || cachedResident.name || ((cachedResident.first_name || '') + ' ' + (cachedResident.last_name || '')).trim();"
)

with open('scripts/build-capacitor-resident.js', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed template string escaping in build-capacitor-resident.js")
