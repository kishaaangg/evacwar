with open('middleware/csrfMiddleware.js', 'r', encoding='utf-8') as f:
    c = f.read()

target = "'/api/lora',"
replacement = "'/api/lora',\n  '/api/mobile',"

if target in c:
    c = c.replace(target, replacement, 1)
    with open('middleware/csrfMiddleware.js', 'w', encoding='utf-8') as f:
        f.write(c)
    print('SUCCESS: csrfMiddleware patched')
else:
    print('ERROR: target not found')
