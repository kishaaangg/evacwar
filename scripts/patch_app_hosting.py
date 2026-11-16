with open('app.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update line 84 CORS headers to include /api/mobile and /api/
old_cors_route = "if (req.url.startsWith('/api/lora') || req.url.startsWith('/resident-mobile') || req.url.startsWith('/api/directions')) {"
new_cors_route = "if (req.url.startsWith('/api/lora') || req.url.startsWith('/api/mobile') || req.url.startsWith('/api/') || req.url.startsWith('/resident-mobile')) {"

# 2. Update Socket.IO allowed origins to support cloud hosting platforms
old_socket_cors = """      // Allow production domains (evacwar-sanrafel.xyz and subdomains, hostingersite.com, or configured in ALLOWED_ORIGINS)
      const isEvacwarDomain = /^https?:\/\/([a-z0-9-]+\.)*evacwar-sanrafel\.xyz(:\d+)?$/.test(lowerOrigin);
      const isHostingerDomain = lowerOrigin.endsWith('.hostingersite.com');
      const isExplicitlyAllowed = allowedOrigins.includes(lowerOrigin);

      if (isEvacwarDomain || isHostingerDomain || isExplicitlyAllowed) {
        return callback(null, true);
      }"""

new_socket_cors = """      // Allow production domains & popular development cloud hosting platforms
      const isEvacwarDomain = /^https?:\/\/([a-z0-9-]+\.)*evacwar-sanrafel\.xyz(:\d+)?$/.test(lowerOrigin);
      const isHostingerDomain = lowerOrigin.endsWith('.hostingersite.com');
      const isExplicitlyAllowed = allowedOrigins.includes(lowerOrigin);
      let isDevHosting = false;
      try {
        const uHost = new URL(lowerOrigin).hostname;
        isDevHosting = /\.(railway\.app|onrender\.com|vercel\.app|ngrok-free\.app|ngrok\.io|fly\.dev|loca\.lt|glitch\.me|up\.railway\.app)$/.test(uHost);
      } catch (_) {}

      if (isEvacwarDomain || isHostingerDomain || isDevHosting || isExplicitlyAllowed) {
        return callback(null, true);
      }"""

norm_code = code.replace('\r\n', '\n')
norm_old_cors = old_cors_route.replace('\r\n', '\n')
norm_new_cors = new_cors_route.replace('\r\n', '\n')
norm_old_sock = old_socket_cors.replace('\r\n', '\n')
norm_new_sock = new_socket_cors.replace('\r\n', '\n')

if norm_old_cors in norm_code:
    norm_code = norm_code.replace(norm_old_cors, norm_new_cors, 1)
    print("SUCCESS: Updated API CORS routes in app.js")
else:
    print("WARN: old_cors_route not matched")

if norm_old_sock in norm_code:
    norm_code = norm_code.replace(norm_old_sock, norm_new_sock, 1)
    print("SUCCESS: Updated Socket.IO cloud hosting CORS in app.js")
else:
    print("WARN: old_socket_cors not matched")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(norm_code)
print("Finished patching app.js for cloud hosting readiness.")
