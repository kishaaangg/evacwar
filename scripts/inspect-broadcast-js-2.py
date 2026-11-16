with open('views/admin/broadcast.ejs', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Lines 750 to 900:")
print(''.join(lines[750:850]))
