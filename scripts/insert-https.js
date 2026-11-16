const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'app.js');
let content = fs.readFileSync(appPath, 'utf8');

const target = '    if (!process.env.PORT) {\n      console.log(`- Local access: http://localhost:${PORT}`);\n      console.log(`- Wi-Fi LAN access: http://<your-computer-ip>:${PORT}`);\n    }\n  });';

const replacement = `    if (!process.env.PORT) {
      console.log(\`- Local access: http://localhost:\${PORT}\`);
      console.log(\`- Wi-Fi LAN access: http://<your-computer-ip>:\${PORT}\`);
    }
  });

  // Dual HTTP + HTTPS listener for Web Bluetooth and secure browser APIs on mobile LAN
  try {
    const sslKeyPath = path.join(__dirname, 'ssl', 'server.key');
    const sslCrtPath = path.join(__dirname, 'ssl', 'server.crt');
    if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCrtPath)) {
      const httpsOptions = {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCrtPath)
      };
      const httpsServer = https.createServer(httpsOptions, app);
      io.attach(httpsServer);
      const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
      httpsServer.listen(HTTPS_PORT, HOSTNAME, () => {
        console.log(\`[HTTPS] Secure EvakWar server active for BLE at https://localhost:\${HTTPS_PORT}\`);
        console.log(\`[HTTPS] Mobile LAN access for Web Bluetooth: https://192.168.0.100:\${HTTPS_PORT}\`);
      });
    }
  } catch (httpsErr) {
    console.warn('[HTTPS] Could not start HTTPS listener:', httpsErr.message);
  }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(appPath, content, 'utf8');
  console.log('SUCCESS_INSERTED_HTTPS');
} else {
  // Try CRLF
  const targetCRLF = target.replace(/\n/g, '\r\n');
  const replacementCRLF = replacement.replace(/\n/g, '\r\n');
  if (content.includes(targetCRLF)) {
    content = content.replace(targetCRLF, replacementCRLF);
    fs.writeFileSync(appPath, content, 'utf8');
    console.log('SUCCESS_INSERTED_HTTPS_CRLF');
  } else {
    console.error('Target not found in app.js');
  }
}
