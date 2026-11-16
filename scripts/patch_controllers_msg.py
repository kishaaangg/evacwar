import os

files = [
    'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/controllers/adminController.js',
    'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/controllers/staffController.js'
]

for p in files:
    with open(p, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    changed = False
    for i, line in enumerate(lines):
        if 'successMsg =' in line and 'LoRa Mesh:' in line:
            lines[i] = '      successMsg = `Emergency alert broadcast dispatched successfully across Internet & 433.875 MHz LoRa Mesh.`;\n'
            changed = True
    if changed:
        with open(p, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print('Successfully updated:', p)
    else:
        print('No match in:', p)
