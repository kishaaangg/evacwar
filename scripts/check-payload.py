with open('controllers/adminController.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('alertPayload = {')
if idx != -1:
    print(text[idx:idx+400])
