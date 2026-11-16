const fs = require('fs');
const filePath = 'c:/Users/lausi/OneDrive/Desktop/EBAKWAR_testing/views/partials/header.ejs';
let content = fs.readFileSync(filePath, 'utf8');

const oldSync = `                        window.syncWiFiTransport = async function () {
                          try {
                            const res = await lora.connectWiFiBridge();
                            if (typeof window.EvacWarToast === 'function' && res) {
                              window.EvacWarToast(\`Synced with EvakWar Server: \${res.deviceName}\`);
                            }
                            window.updateHeaderTransportUI(lora);
                          } catch (err) {
                            alert(err.message || 'Could not reach Barangay Hall Server.');
                          }
                        };`;

const newSync = `                        window.syncWiFiTransport = async function () {
                          try {
                            let target = localStorage.getItem('evw_server_url') || 'http://192.168.0.102:8080';
                            let res = null;
                            try {
                              res = await lora.connectWiFiBridge(target);
                            } catch (_) {
                              // Auto-probe alternative candidates
                              const candidates = ['http://192.168.0.102:8080', 'http://192.168.0.101:8080', 'http://192.168.0.100:8080', 'http://192.168.1.100:8080', 'http://192.168.1.102:8080', 'http://192.168.4.1:8080'];
                              for (const cand of candidates) {
                                if (cand === target) continue;
                                try {
                                  res = await lora.connectWiFiBridge(cand);
                                  if (res) {
                                    target = cand;
                                    break;
                                  }
                                } catch (_) {}
                              }
                            }

                            if (res) {
                              if (typeof window.EvacWarToast === 'function') {
                                window.EvacWarToast(\`Connected to EvakWar Server at \${target}\`, 'success');
                              } else {
                                alert(\`Connected to EvakWar Server at \${target}\`);
                              }
                              window.updateHeaderTransportUI(lora);
                            } else {
                              const currentIp = target.replace(/^https?:\\/\\//, '').replace(/:8080.*$/, '');
                              const userIp = prompt(
                                \`Could not reach EvakWar Gateway at \${target}.\\n\\n\` +
                                \`• Make sure Admin Laptop has Wi-Fi turned ON and is connected to the same Wi-Fi router.\\n\` +
                                \`• If the laptop IP changed, enter the laptop's Wi-Fi IP address:\`,
                                currentIp
                              );
                              if (userIp && userIp.trim()) {
                                const cleanIp = userIp.trim().replace(/^https?:\\/\\//, '').replace(/\\/.*$/, '').replace(/:8080$/, '');
                                const newUrl = \`http://\${cleanIp}:8080\`;
                                try {
                                  const customRes = await lora.connectWiFiBridge(newUrl);
                                  if (customRes) {
                                    localStorage.setItem('evw_server_url', newUrl);
                                    if (typeof window.EvacWarToast === 'function') {
                                      window.EvacWarToast(\`Successfully connected to \${newUrl}!\`, 'success');
                                    } else {
                                      alert(\`Successfully connected to \${newUrl}!\`);
                                    }
                                    window.updateHeaderTransportUI(lora);
                                  }
                                } catch (_) {
                                  alert(\`Could not connect to \${newUrl}. Please verify the laptop Wi-Fi is ON and on the same Wi-Fi router.\`);
                                }
                              }
                            }
                          } catch (err) {
                            alert(err.message || 'Could not reach Barangay Hall Server.');
                          }
                        };`;

const normContent = content.replace(/\r\n/g, '\n');
const normOld = oldSync.replace(/\r\n/g, '\n');
const normNew = newSync.replace(/\r\n/g, '\n');

if (normContent.includes(normOld)) {
  content = normContent.replace(normOld, normNew);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully updated syncWiFiTransport in header.ejs!');
} else {
  console.error('oldSync not found in header.ejs');
  process.exit(1);
}
