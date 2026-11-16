import re

for controller_path in ['controllers/staffController.js', 'controllers/rescuerController.js']:
    print('*** ' + controller_path + ' ***')
    with open('c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/' + controller_path, 'r', encoding='utf-8') as f:
        c = f.read()
    renders = re.findall(r"res\.render\(['\"]([^'\"]+)['\"]", c)
    for r in sorted(set(renders)):
        print('  renders:', r)
