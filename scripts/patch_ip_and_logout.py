# -*- coding: utf-8 -*-
"""
Patch DEFAULT_HALL_SERVER in:
1. public/js/capacitor-resident-bridge.js
2. scripts/build-capacitor-resident.js
3. views/partials/header.ejs (logout redirect)
"""

def patch_bridge():
    p = 'public/js/capacitor-resident-bridge.js'
    with open(p, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('\r\n', '\n')
    c = c.replace("const DEFAULT_HALL_SERVER = 'http://192.168.0.100:8080';", "const DEFAULT_HALL_SERVER = 'http://192.168.0.101:8080';")
    with open(p, 'w', encoding='utf-8') as f:
        f.write(c)
    print("Patched capacitor-resident-bridge.js")

def patch_builder():
    p = 'scripts/build-capacitor-resident.js'
    with open(p, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('\r\n', '\n')
    c = c.replace("return 'http://192.168.0.100:8080';", "return 'http://192.168.0.101:8080';")
    c = c.replace("placeholder=\"https://your-domain.railway.app\"", "placeholder=\"http://192.168.0.101:8080\"")
    with open(p, 'w', encoding='utf-8') as f:
        f.write(c)
    print("Patched build-capacitor-resident.js")

def patch_header_logout():
    p = 'views/partials/header.ejs'
    with open(p, 'r', encoding='utf-8') as f:
        c = f.read()
    c = c.replace('\r\n', '\n')

    old_logout = """                          // Replace history entry so back button cannot return to this authenticated page
                          window.location.replace('/logout');"""

    new_logout = """                          // Replace history entry so back button cannot return to this authenticated page
                          const isNative = Boolean(
                            (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
                            window.location.pathname.startsWith('/resident-mobile') ||
                            window.location.protocol === 'capacitor:' ||
                            window.location.protocol === 'file:'
                          );
                          if (isNative) {
                            window.location.replace('/login/index.html');
                          } else {
                            window.location.replace('/logout');
                          }"""

    if old_logout in c:
        c = c.replace(old_logout, new_logout)
        with open(p, 'w', encoding='utf-8') as f:
            f.write(c)
        print("Patched header.ejs logout redirect")
    else:
        print("Warning: old_logout not found in header.ejs")

if __name__ == '__main__':
    patch_bridge()
    patch_builder()
    patch_header_logout()
