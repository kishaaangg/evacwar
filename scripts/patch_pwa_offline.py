path = r"public/js/pwa.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

target = "  function updateNetworkStatus(online) {\n    const indicator = ensureNetworkIndicator();"
replacement = """  function updateNetworkStatus(online) {
    if (document.getElementById('btnHeaderLoraBle')) {
      if (!online) {
        window.dispatchEvent(new CustomEvent('Evacwar:offline-detected'));
      } else {
        window.dispatchEvent(new CustomEvent('Evacwar:online-restored'));
      }
      return;
    }
    const indicator = ensureNetworkIndicator();"""

if target in content:
    content = content.replace(target, replacement)
    print("Replaced updateNetworkStatus in pwa.js successfully.")
else:
    # Try CRLF
    target_crlf = "  function updateNetworkStatus(online) {\r\n    const indicator = ensureNetworkIndicator();"
    if target_crlf in content:
        content = content.replace(target_crlf, replacement)
        print("Replaced updateNetworkStatus in pwa.js (CRLF) successfully.")
    else:
        print("Could not find target in pwa.js")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
