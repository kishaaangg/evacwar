# -*- coding: utf-8 -*-
path = 'views/partials/header.ejs'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('\r\n', '\n')

old_marker = '    </header>\n\n    <!-- HARDWARE TRANSPORT SELECTOR MODAL'
new_marker = '    </header>\n\n    <% if (user && user.role !== "admin") { %>\n    <!-- HARDWARE TRANSPORT SELECTOR MODAL'

if old_marker in c:
    c = c.replace(old_marker, new_marker)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(c)
    print("Added opening if tag before hardware modals in header.ejs")
else:
    print("Marker not found in header.ejs")
